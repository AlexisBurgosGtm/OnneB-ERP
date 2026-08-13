const express = require('express');
const sql = require('mssql');
const multer = require('multer');
const { isDbConfigured } = require('../config/database');
const {
  InventarioError,
  getTipomDocumento,
  aplicarMovimientoInventarioLineaInsert,
  aplicarMovimientoInventarioLineaPatch,
  revertirMovimientoInventarioLinea,
} = require('../lib/inventario');
const { parseFechaInput, applyDocumentoFecha, nowParts, normalizePedidoResponse } = require('../lib/documento-fecha');
const {
  STATUS_OPERADO,
  STATUS_BLOQUEADO,
  STATUS_ANULADO,
  isStatusEditable,
  SQL_STATUS_EDITABLE,
} = require('../lib/documento-status');
const { assertAdminPass, assertEliminacionRegistro } = require('../lib/config-auth');
const { DocumentoDeleteError, deleteDocumentoOperado } = require('../lib/documento-delete');
const { usuarioFromReq } = require('../lib/documentos-eliminados');
const { lineProductMeta, getPrecioFromPreciosRow, DEFAULT_PRECIOS_FIELD } = require('../lib/doc-producto-linea');
const {
  fetchProductoPrecioForLinea,
  pesoFromPreciosRow,
  calcLinePeso,
} = require('../lib/producto-precio-linea');
const { searchMovimientoProductos } = require('../lib/movimiento-productos-search');
const { SQL_INVSALDO_UNICO_JOIN_LINEA, sqlExistenciaMedidaExpr } = require('../lib/existencia-medida');
const { getSettingSino, SETTING_OPCION } = require('../lib/settings');
const {
  resolveEmpleadoCoddocPreferido,
  pickCoddocDefault,
  OPCION_SERIES,
} = require('../lib/empleado-coddoc-preferido');
const { getAppToken } = require('../lib/app-token');
const { isUpdateDbConfigured } = require('../config/update-database');
const { getUpdateDbPool } = require('../lib/update-db-pool');
const { copyDocumentoToCommunity, getDocumentosMarcaMaxChars, marcaEnviadoValue } = require('../lib/community-documento-copy');
const { checkTokenActivo, TOKEN_NO_NUBE_MSG } = require('../lib/community-token');
const { downloadTrasladoFromCommunity } = require('../lib/community-traslado-download');
const { parseEntradaInventarioExcel } = require('../lib/inventario-entrada-excel');

const SEARCH_LIMIT = 80;
const DEFAULT_BODEGA = 0;

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
      cb(null, true);
      return;
    }
    cb(new Error('Solo se permiten archivos .xls o .xlsx'));
  },
});

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.headers['x-emp-nit'] || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

function parseCorrelativo(raw) {
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

function parseMesAnio(req) {
  const now = new Date();
  const mes = parseInt(req.query.mes, 10);
  const anio = parseInt(req.query.anio, 10);
  return {
    mes: mes >= 1 && mes <= 12 ? mes : now.getMonth() + 1,
    anio: anio >= 2000 && anio <= 2100 ? anio : now.getFullYear(),
  };
}

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function calcLineTotals(cantidad, costo, precio, equivale) {
  const qty = Number(cantidad) || 0;
  const eq = Number(equivale) || 1;
  const cost = Number(costo) || 0;
  const price = Number(precio) || 0;
  const totalUnidades = roundMoney(qty * eq);
  const totalCosto = roundMoney(qty * cost);
  const totalPrecio = roundMoney(qty * price);
  return { totalUnidades, totalCosto, totalPrecio };
}

function createInventarioDocsRouter(tipodocOrList, logPrefix) {
  const router = express.Router();
  const TIPODOCS = (Array.isArray(tipodocOrList) ? tipodocOrList : [tipodocOrList])
    .map((t) => String(t || '').trim().toUpperCase())
    .filter(Boolean);
  if (!TIPODOCS.length) {
    throw new Error(`createInventarioDocsRouter(${logPrefix}): tipodoc requerido`);
  }
  const TIPODOC = TIPODOCS[0];
  const tipodocSqlIn = TIPODOCS.map((t) => `'${String(t).replace(/'/g, "''")}'`).join(', ');
  const tipodocLabel = TIPODOCS.join(' / ');

  async function getTipoDoc(pool, empnit, coddocPreferred) {
    const reqDb = pool.request().input('EMPNIT', sql.VarChar, empnit);
    if (coddocPreferred) {
      reqDb.input('CODDOC', sql.VarChar, coddocPreferred);
      const one = await reqDb.query(`
        SELECT CODDOC, DESDOC, TIPODOC, CORRELATIVO, TIPOM
        FROM dbo.TIPODOCUMENTOS
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
          AND TIPODOC IN (${tipodocSqlIn}) AND ACTIVO = 'SI'
      `);
      if (one.recordset.length) return one.recordset[0];
    }
    const all = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
      SELECT CODDOC, DESDOC, TIPODOC, CORRELATIVO, TIPOM
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND TIPODOC IN (${tipodocSqlIn}) AND ACTIVO = 'SI'
      ORDER BY TIPODOC, CODDOC
    `);
    return all.recordset[0] || null;
  }

  async function allocateCorrelativo(transaction, empnit, coddoc) {
    const tipoRes = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .query(`
        SELECT CORRELATIVO FROM dbo.TIPODOCUMENTOS WITH (UPDLOCK, ROWLOCK)
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
      `);
    const maxRes = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .query(`
        SELECT ISNULL(MAX(CORRELATIVO), 0) AS maxCorr FROM dbo.DOCUMENTOS
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
      `);
    const tipoCorr = Number(tipoRes.recordset[0]?.CORRELATIVO) || 0;
    const maxCorr = Number(maxRes.recordset[0]?.maxCorr) || 0;
    const next = Math.max(tipoCorr, maxCorr) + 1;
    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORR', sql.Decimal(18, 0), next)
      .query(`
        UPDATE dbo.TIPODOCUMENTOS SET CORRELATIVO = @CORR
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
      `);
    return next;
  }

  async function recalcDocumentTotals(transaction, empnit, coddoc, correlativo) {
    const sums = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .query(`
        SELECT
          ISNULL(SUM(TOTALCOSTO), 0) AS TOTALCOSTO,
          ISNULL(SUM(TOTALPRECIO), 0) AS TOTALPRECIO,
          ISNULL(SUM(TOTALIVA), 0) AS TOTALIVA,
          ISNULL(SUM(TOTALSINIVA), 0) AS TOTALSINIVA
        FROM dbo.DOCPRODUCTOS
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      `);
    const row = sums.recordset[0] || {};
    const totalCosto = roundMoney(row.TOTALCOSTO);
    const totalPrecio = roundMoney(row.TOTALPRECIO);
    const totalIva = roundMoney(row.TOTALIVA);
    const totalSinIva = roundMoney(row.TOTALSINIVA);
    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .input('TOTALCOSTO', sql.Decimal(18, 3), totalCosto)
      .input('TOTALPRECIO', sql.Decimal(18, 3), totalPrecio)
      .input('TOTALIVA', sql.Float, totalIva)
      .input('TOTALSINIVA', sql.Float, totalSinIva)
      .input('PAGO', sql.Decimal(18, 3), totalCosto)
      .input('DOC_ABONO', sql.Decimal(18, 3), totalCosto)
      .query(`
        UPDATE dbo.DOCUMENTOS
        SET TOTALCOSTO = @TOTALCOSTO,
            TOTALPRECIO = @TOTALPRECIO,
            TOTALIVA = @TOTALIVA,
            TOTALSINIVA = @TOTALSINIVA,
            PAGO = @PAGO,
            DOC_ABONO = @DOC_ABONO
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      `);
    return { totalCosto, totalPrecio, totalIva, totalSinIva };
  }

  async function loadDocumento(pool, empnit, coddoc, correlativo) {
    const headerRes = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .query(`
        SELECT d.*, t.DESDOC, t.TIPODOC, t.TIPOM
        FROM dbo.DOCUMENTOS d
        JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
        WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
          AND t.TIPODOC IN (${tipodocSqlIn})
      `);
    if (!headerRes.recordset.length) return null;
    const linesRes = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .query(`
        SELECT l.Id AS ID, l.CODPROD, l.DESPROD, l.CODMEDIDA, l.CANTIDAD, l.EQUIVALE, l.PRECIO, l.COSTO,
          l.TOTALPRECIO, l.TOTALCOSTO, l.TOTALUNIDADES, l.TIPOPRECIO,
          ${sqlExistenciaMedidaExpr('l.EQUIVALE')}
        FROM dbo.DOCPRODUCTOS l
        ${SQL_INVSALDO_UNICO_JOIN_LINEA}
        WHERE l.EMPNIT = @EMPNIT AND l.CODDOC = @CODDOC AND l.CORRELATIVO = @CORRELATIVO
        ORDER BY l.Id
      `);
    return normalizePedidoResponse({ header: headerRes.recordset[0], lines: linesRes.recordset });
  }

  router.get('/config', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    try {
      const pool = await req.app.locals.getDbPool();
      const tipos = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
          SELECT CODDOC, DESDOC, TIPODOC, CORRELATIVO, TIPOM
          FROM dbo.TIPODOCUMENTOS
          WHERE EMPNIT = @EMPNIT AND TIPODOC IN (${tipodocSqlIn}) AND ACTIVO = 'SI'
          ORDER BY TIPODOC, CODDOC
        `);
      const preferredOpcion =
        TIPODOC === 'ENT'
          ? OPCION_SERIES.ENTRADA_INVENTARIO
          : TIPODOC === 'SAL'
            ? OPCION_SERIES.SALIDA_INVENTARIO
            : null;
      const preferred = preferredOpcion
        ? await resolveEmpleadoCoddocPreferido(
            pool,
            sql,
            empnit,
            req.query.codempleado,
            preferredOpcion
          )
        : null;
      const coddocDefault = pickCoddocDefault(tipos.recordset, preferred);
      res.json({
        empnit,
        tipodoc: TIPODOC,
        tipodocs: TIPODOCS,
        tipodocLabel,
        statusOperado: STATUS_OPERADO,
        statusBloqueado: STATUS_BLOQUEADO,
        statusAnulado: STATUS_ANULADO,
        coddocDefault,
        tiposDocumento: tipos.recordset,
        bodegaDefault: DEFAULT_BODEGA,
        muestraDesprod2: await getSettingSino(pool, SETTING_OPCION.MUESTRA_DESPROD2_EN_DOCS_Y_PRODS),
      });
    } catch (err) {
      console.warn(`[API GET /${logPrefix}/config]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/productos', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const q = String(req.query.q || '').trim();
    try {
      const pool = await req.app.locals.getDbPool();
      const result = await searchMovimientoProductos(pool, {
        empnit,
        q,
        limit: SEARCH_LIMIT,
        includeMayoreo: false,
        extraWhereSql: " AND p.TIPOPROD <> 'S'",
      });
      res.json({ rows: result.rows, q: result.q });
    } catch (err) {
      console.warn(`[API GET /${logPrefix}/productos]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/documentos', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const { mes, anio } = parseMesAnio(req);
    const coddoc = String(req.query.coddoc || '').trim();
    const statusRaw = String(req.query.status || STATUS_OPERADO).trim().toUpperCase();
    const allowed = [STATUS_OPERADO, STATUS_BLOQUEADO, STATUS_ANULADO];
    const status = allowed.includes(statusRaw) ? statusRaw : STATUS_OPERADO;
    try {
      const pool = await req.app.locals.getDbPool();
      const request = pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('MES', sql.Int, mes)
        .input('ANIO', sql.Int, anio);
      let coddocFilter = '';
      if (coddoc) {
        request.input('CODDOC', sql.VarChar, coddoc);
        coddocFilter = ' AND d.CODDOC = @CODDOC';
      }
      const result = await request.query(`
        SELECT TOP 200
          d.CODDOC, d.CORRELATIVO, d.FECHA, d.HORA, d.MINUTO, d.STATUS,
          d.TOTALCOSTO, d.OBS, d.MES, d.ANIO, d.USUARIO,
          d.CODEMBARQUE, d.OBSMARCA, d.MARCA,
          (SELECT COUNT(*) FROM dbo.DOCPRODUCTOS l
           WHERE l.EMPNIT = d.EMPNIT AND l.CODDOC = d.CODDOC AND l.CORRELATIVO = d.CORRELATIVO) AS LINEAS
        FROM dbo.DOCUMENTOS d
        JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
        WHERE d.EMPNIT = @EMPNIT
          AND t.TIPODOC IN (${tipodocSqlIn})
          AND d.MES = @MES AND d.ANIO = @ANIO
          AND d.STATUS = '${status}'
          ${coddocFilter}
        ORDER BY d.ID DESC
      `);
      res.json({ rows: result.recordset, status, mes, anio });
    } catch (err) {
      console.warn(`[API GET /${logPrefix}/documentos]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/documentos/:coddoc/:correlativo', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const coddoc = String(req.params.coddoc || '').trim();
    const correlativo = parseCorrelativo(req.params.correlativo);
    if (!coddoc || correlativo === null) return res.status(400).json({ error: 'Documento inválido' });
    try {
      const pool = await req.app.locals.getDbPool();
      const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
      if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
      res.json(doc);
    } catch (err) {
      console.warn(`[API GET /${logPrefix}/documentos/:coddoc/:correlativo]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/documentos', async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const coddocBody = String(req.body?.CODDOC || '').trim();
    const usuario = String(req.body?.USUARIO || req.body?.usuario || 'INV').trim();
    const obs = String(req.body?.OBS || '').trim();

    try {
      const pool = await req.app.locals.getDbPool();
      const tipo = await getTipoDoc(pool, empnit, coddocBody);
      if (!tipo) {
        return res.status(400).json({
          error: `No hay tipo de documento ${tipodocLabel} activo para la empresa`,
        });
      }
      const coddoc = tipo.CODDOC;
      const parts = nowParts();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const correlativo = await allocateCorrelativo(transaction, empnit, coddoc);
        await transaction
          .request()
          .input('EMPNIT', sql.VarChar, empnit)
          .input('ANIO', sql.Int, parts.anio)
          .input('MES', sql.Int, parts.mes)
          .input('DIA', sql.Int, parts.dia)
          .input('FECHA', sql.Date, parts.fecha)
          .input('HORA', sql.Int, parts.hora)
          .input('MINUTO', sql.Int, parts.minuto)
          .input('CODDOC', sql.VarChar, coddoc)
          .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
          .input('USUARIO', sql.VarChar, usuario)
          .input('OBS', sql.VarChar, obs)
          .query(`
            INSERT INTO dbo.DOCUMENTOS (
              EMPNIT, ANIO, MES, DIA, FECHA, HORA, MINUTO, CODDOC, CORRELATIVO,
              CODCLIENTE, DOC_NIT, DOC_NOMCLIE, DOC_DIRCLIE,
              TOTALCOSTO, TOTALPRECIO, CODEMBARQUE, STATUS, USUARIO, CONCRE, CORTE,
              MARCA, OBS, DOC_SALDO, DOC_ABONO, OBSMARCA, TOTALDESCUENTO, CODCAJA,
              DIRENTREGA, NOGUIA, VALORENTREGA, TOTALEXENTO, TIPOPAGO, NODOCPAGO,
              VENCIMIENTO, DIASCREDITO, TOTALIVA, TOTALSINIVA, PAGO, VUELTO
            ) VALUES (
              @EMPNIT, @ANIO, @MES, @DIA, @FECHA, @HORA, @MINUTO, @CODDOC, @CORRELATIVO,
              0, 'CF', 'INVENTARIO', 'SN',
              0, 0, 'INVENTARIO', '${STATUS_OPERADO}', @USUARIO, 'CON', 'NO',
              'SN', @OBS, 0, 0, 'SN', 0, 1,
              'SN', 'SN', 0, 0, 'CONTADO', 'SN',
              @FECHA, 0, 0, 0, 0, 0
            )
          `);
        await transaction.commit();
        const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
        res.status(201).json(doc);
      } catch (inner) {
        await transaction.rollback();
        throw inner;
      }
    } catch (err) {
      console.warn(`[API POST /${logPrefix}/documentos]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/documentos/:coddoc/:correlativo', async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const coddoc = String(req.params.coddoc || '').trim();
    const correlativo = parseCorrelativo(req.params.correlativo);
    if (!coddoc || correlativo === null) return res.status(400).json({ error: 'Documento inválido' });

    const hasObs = req.body?.OBS !== undefined;
    const hasFecha = req.body?.FECHA !== undefined;
    if (!hasObs && !hasFecha) return res.status(400).json({ error: 'Sin campos para actualizar' });

    try {
      const pool = await req.app.locals.getDbPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        if (hasObs) {
          const obsRes = await transaction
            .request()
            .input('EMPNIT', sql.VarChar, empnit)
            .input('CODDOC', sql.VarChar, coddoc)
            .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
            .input('OBS', sql.VarChar, String(req.body.OBS || ''))
            .query(`
              UPDATE dbo.DOCUMENTOS SET OBS = @OBS
              WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
                AND ${SQL_STATUS_EDITABLE}
            `);
          if (obsRes.rowsAffected[0] === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Documento no encontrado o no operado' });
          }
        }
        if (hasFecha) {
          const parts = parseFechaInput(req.body.FECHA);
          if (!parts) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Fecha inválida (use YYYY-MM-DD)' });
          }
          await applyDocumentoFecha(transaction, sql, empnit, coddoc, correlativo, parts);
          const chk = await transaction
            .request()
            .input('EMPNIT', sql.VarChar, empnit)
            .input('CODDOC', sql.VarChar, coddoc)
            .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
            .query(`
              SELECT STATUS FROM dbo.DOCUMENTOS
              WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
                AND ${SQL_STATUS_EDITABLE}
            `);
          if (!chk.recordset.length) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Documento no encontrado o no operado' });
          }
        }
        await transaction.commit();
        const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
        res.json(doc);
      } catch (inner) {
        await transaction.rollback();
        throw inner;
      }
    } catch (err) {
      console.warn(`[API PATCH /${logPrefix}/documentos]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/documentos/:coddoc/:correlativo/lineas', async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const coddoc = String(req.params.coddoc || '').trim();
    const correlativo = parseCorrelativo(req.params.correlativo);
    const codprod = String(req.body?.CODPROD || '').trim();
    const forceUnidad = Boolean(
      req.body?.forceUnidad || req.body?.FORCE_UNIDAD || req.body?.ajusteCero || req.body?.AJUSTE_CERO
    );
    const codmedida = forceUnidad
      ? 'UNIDAD'
      : String(req.body?.CODMEDIDA || '').trim();
    const cantidad = Number(req.body?.CANTIDAD ?? 1);
    if (!coddoc || correlativo === null || !codprod || !codmedida) {
      return res.status(400).json({ error: 'CODPROD y CODMEDIDA son obligatorios' });
    }
    if (!Number.isFinite(cantidad) || cantidad === 0) {
      return res.status(400).json({ error: 'Cantidad inválida' });
    }
    if (!forceUnidad && cantidad <= 0) {
      return res.status(400).json({ error: 'Cantidad debe ser mayor a cero' });
    }

    try {
      const pool = await req.app.locals.getDbPool();
      const docCheck = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODDOC', sql.VarChar, coddoc)
        .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
        .query(`
          SELECT STATUS FROM dbo.DOCUMENTOS
          WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
        `);
      if (!docCheck.recordset.length) return res.status(404).json({ error: 'Documento no encontrado' });
      if (!isStatusEditable(docCheck.recordset[0].STATUS)) {
        return res.status(400).json({ error: 'El documento ya no está en edición' });
      }

      let medidaLinea = codmedida;
      let desprod;
      let tipoprod;
      let tipoprecio;
      let costo;
      let precio;
      let equivale;
      let exento;
      let peso;

      if (forceUnidad) {
        const prodRes = await pool
          .request()
          .input('EMPNIT', sql.VarChar, empnit)
          .input('CODPROD', sql.VarChar, codprod)
          .query(`
            SELECT TOP 1
              LTRIM(RTRIM(CODPROD)) AS CODPROD,
              DESPROD,
              ISNULL(COSTO, 0) AS COSTO,
              ISNULL(TIPOPROD, 'P') AS TIPOPROD,
              ISNULL(EXENTO, 0) AS EXENTO
            FROM dbo.PRODUCTOS
            WHERE EMPNIT = @EMPNIT
              AND LTRIM(RTRIM(CODPROD)) = LTRIM(RTRIM(@CODPROD))
          `);
        if (!prodRes.recordset.length) {
          return res.status(404).json({ error: 'Producto no encontrado' });
        }
        const prod = prodRes.recordset[0];
        if (String(prod.TIPOPROD || '').trim().toUpperCase() === 'S') {
          return res.status(400).json({ error: 'Producto de servicio: no afecta inventario' });
        }
        medidaLinea = 'UNIDAD';
        desprod = prod.DESPROD;
        tipoprod = String(prod.TIPOPROD || 'P').trim() || 'P';
        tipoprecio = 'P';
        costo = Number(prod.COSTO) || 0;
        precio = costo;
        equivale = 1;
        exento = Number(prod.EXENTO) ? Number(prod.EXENTO) : 0;
        peso = 0;
      } else {
        const found = await fetchProductoPrecioForLinea(pool, sql, {
          empnit,
          codprod,
          codmedida,
        });
        if (!found) return res.status(404).json({ error: 'Producto o medida no encontrado' });
        const prod = found.row;
        medidaLinea = found.codmedida;
        const meta = lineProductMeta(prod, DEFAULT_PRECIOS_FIELD);
        tipoprod = meta.tipoprod;
        tipoprecio = meta.tipoprecio;
        desprod = prod.DESPROD;
        costo = Number(prod.COSTO ?? prod.COSTO_PROD) || 0;
        precio = getPrecioFromPreciosRow(prod, DEFAULT_PRECIOS_FIELD);
        equivale = Number(prod.EQUIVALE) || 1;
        exento = Number(prod.EXENTO) ? Number(prod.EXENTO) : 0;
        peso = pesoFromPreciosRow(prod);
      }

      const { totalUnidades, totalCosto, totalPrecio } = calcLineTotals(
        cantidad,
        costo,
        precio,
        equivale
      );
      const parts = nowParts();
      const totalPeso = calcLinePeso(cantidad, peso);

      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const tipom = await getTipomDocumento(transaction, empnit, coddoc);
        const ins = await transaction
          .request()
          .input('EMPNIT', sql.VarChar, empnit)
          .input('ANIO', sql.Int, parts.anio)
          .input('MES', sql.Int, parts.mes)
          .input('DIA', sql.Int, parts.dia)
          .input('CODDOC', sql.VarChar, coddoc)
          .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
          .input('CODPROD', sql.VarChar, codprod)
          .input('DESPROD', sql.VarChar, desprod)
          .input('CODMEDIDA', sql.VarChar, medidaLinea)
          .input('CANTIDAD', sql.Float, cantidad)
          .input('EQUIVALE', sql.Int, equivale)
          .input('TOTALUNIDADES', sql.Float, totalUnidades)
          .input('COSTO', sql.Decimal(18, 3), costo)
          .input('PRECIO', sql.Decimal(18, 3), precio)
          .input('TOTALCOSTO', sql.Decimal(18, 3), totalCosto)
          .input('TOTALPRECIO', sql.Decimal(18, 3), totalPrecio)
          .input('EXENTO', sql.Decimal(18, 3), exento)
          .input('TIPOPROD', sql.VarChar, tipoprod)
          .input('TIPOPRECIO', sql.VarChar, tipoprecio)
          .input('PESO', sql.Decimal(18, 3), peso)
          .input('TOTALPESO', sql.Decimal(18, 3), totalPeso)
          .input('TIPOM', sql.Int, tipom)
          .query(`
            INSERT INTO dbo.DOCPRODUCTOS (
              EMPNIT, ANIO, MES, DIA, CODDOC, CORRELATIVO, CODPROD, DESPROD, CODMEDIDA,
              CANTIDAD, CANTIDADBONIF, EQUIVALE, TOTALUNIDADES, TOTALBONIF,
              COSTO, PRECIO, TOTALCOSTO, TOTALPRECIO,
              ENTREGADOS_TOTALUNIDADES, ENTREGADOS_TOTALCOSTO, ENTREGADOS_TOTALPRECIO,
              COSTOANTERIOR, COSTOPROMEDIO, CODBODEGAENTRADA, CODBODEGASALIDA,
              DESCUENTO, PORCDESCUENTO, NOSERIE, EXENTO, OBS,
              TIPOPROD, TIPOPRECIO, PESO, TOTALPESO, TIPOM, LASTUPDATE
            ) VALUES (
              @EMPNIT, @ANIO, @MES, @DIA, @CODDOC, @CORRELATIVO, @CODPROD, @DESPROD, @CODMEDIDA,
              @CANTIDAD, 0, @EQUIVALE, @TOTALUNIDADES, 0,
              @COSTO, @PRECIO, @TOTALCOSTO, @TOTALPRECIO,
              @TOTALUNIDADES, @TOTALCOSTO, @TOTALPRECIO,
              0, 0, ${DEFAULT_BODEGA}, ${DEFAULT_BODEGA},
              0, 0, 'SN', @EXENTO, 'SN',
              @TIPOPROD, @TIPOPRECIO, @PESO, @TOTALPESO, @TIPOM, CAST(GETDATE() AS DATE)
            );
            SELECT SCOPE_IDENTITY() AS ID;
          `);
        const lineId = ins.recordset[0]?.ID;
        await aplicarMovimientoInventarioLineaInsert(transaction, {
          empnit,
          coddoc,
          correlativo,
          codprod,
          desprod,
          totalUnidades,
          tipoprod,
          tipom,
          codbodegaEntrada: DEFAULT_BODEGA,
          codbodegaSalida: DEFAULT_BODEGA,
        });
        const totals = await recalcDocumentTotals(transaction, empnit, coddoc, correlativo);
        await transaction.commit();
        const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
        res.status(201).json({ lineId, totals, documento: doc });
      } catch (inner) {
        await transaction.rollback();
        if (inner instanceof InventarioError) {
          return res.status(inner.statusCode).json({ error: inner.message, code: inner.code });
        }
        throw inner;
      }
    } catch (err) {
      if (err instanceof InventarioError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      console.warn(`[API POST /${logPrefix}/documentos/lineas]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/documentos/:coddoc/:correlativo/lineas/:lineId', async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const coddoc = String(req.params.coddoc || '').trim();
    const correlativo = parseCorrelativo(req.params.correlativo);
    const lineId = parseInt(req.params.lineId, 10);
    const cantidad = Number(req.body?.CANTIDAD);
    if (!coddoc || correlativo === null || Number.isNaN(lineId)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    if (!cantidad || cantidad <= 0) return res.status(400).json({ error: 'Cantidad inválida' });

    try {
      const pool = await req.app.locals.getDbPool();
      const lineRes = await pool
        .request()
        .input('ID', sql.Int, lineId)
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODDOC', sql.VarChar, coddoc)
        .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
        .query(`
          SELECT
            l.COSTO, l.PRECIO, l.EQUIVALE, l.PESO, l.TOTALUNIDADES,
            l.CODPROD, l.DESPROD, l.TIPOPROD, l.TIPOM, l.CODBODEGAENTRADA, l.CODBODEGASALIDA,
            d.STATUS
          FROM dbo.DOCPRODUCTOS l
          JOIN dbo.DOCUMENTOS d ON d.EMPNIT = l.EMPNIT AND d.CODDOC = l.CODDOC AND d.CORRELATIVO = l.CORRELATIVO
          WHERE l.ID = @ID AND l.EMPNIT = @EMPNIT AND l.CODDOC = @CODDOC AND l.CORRELATIVO = @CORRELATIVO
        `);
      if (!lineRes.recordset.length) return res.status(404).json({ error: 'Línea no encontrada' });
      if (!isStatusEditable(lineRes.recordset[0].STATUS)) {
        return res.status(400).json({ error: 'El documento ya no está en edición' });
      }
      const ln = lineRes.recordset[0];
      const { totalUnidades, totalCosto, totalPrecio } = calcLineTotals(
        cantidad,
        ln.COSTO,
        ln.PRECIO,
        ln.EQUIVALE
      );
      const totalPeso = calcLinePeso(cantidad, ln.PESO);

      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        await aplicarMovimientoInventarioLineaPatch(transaction, {
          empnit,
          coddoc,
          correlativo,
          codprod: ln.CODPROD,
          desprod: ln.DESPROD,
          anteriorTotalUnidades: ln.TOTALUNIDADES,
          nuevoTotalUnidades: totalUnidades,
          tipoprod: ln.TIPOPROD,
          tipom: ln.TIPOM,
          codbodegaEntrada: ln.CODBODEGAENTRADA ?? DEFAULT_BODEGA,
          codbodegaSalida: ln.CODBODEGASALIDA ?? DEFAULT_BODEGA,
        });
        await transaction
          .request()
          .input('ID', sql.Int, lineId)
          .input('CANTIDAD', sql.Float, cantidad)
          .input('TOTALUNIDADES', sql.Float, totalUnidades)
          .input('TOTALCOSTO', sql.Decimal(18, 3), totalCosto)
          .input('TOTALPRECIO', sql.Decimal(18, 3), totalPrecio)
          .input('ENTREGADOS_TOTALUNIDADES', sql.Float, totalUnidades)
          .input('ENTREGADOS_TOTALCOSTO', sql.Decimal(18, 3), totalCosto)
          .input('ENTREGADOS_TOTALPRECIO', sql.Decimal(18, 3), totalPrecio)
          .input('TOTALPESO', sql.Decimal(18, 3), totalPeso)
          .query(`
            UPDATE dbo.DOCPRODUCTOS SET
              CANTIDAD = @CANTIDAD, TOTALUNIDADES = @TOTALUNIDADES,
              TOTALCOSTO = @TOTALCOSTO, TOTALPRECIO = @TOTALPRECIO,
              TOTALPESO = @TOTALPESO,
              ENTREGADOS_TOTALUNIDADES = @ENTREGADOS_TOTALUNIDADES,
              ENTREGADOS_TOTALCOSTO = @ENTREGADOS_TOTALCOSTO,
              ENTREGADOS_TOTALPRECIO = @ENTREGADOS_TOTALPRECIO,
              LASTUPDATE = CAST(GETDATE() AS DATE)
            WHERE ID = @ID
          `);
        const totals = await recalcDocumentTotals(transaction, empnit, coddoc, correlativo);
        await transaction.commit();
        const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
        res.json({ totals, documento: doc });
      } catch (inner) {
        await transaction.rollback();
        if (inner instanceof InventarioError) {
          return res.status(inner.statusCode).json({ error: inner.message, code: inner.code });
        }
        throw inner;
      }
    } catch (err) {
      if (err instanceof InventarioError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      console.warn(`[API PATCH /${logPrefix}/documentos/lineas]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/documentos/:coddoc/:correlativo/lineas/:lineId', async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const coddoc = String(req.params.coddoc || '').trim();
    const correlativo = parseCorrelativo(req.params.correlativo);
    const lineId = parseInt(req.params.lineId, 10);
    if (!coddoc || correlativo === null || Number.isNaN(lineId)) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }

    try {
      const pool = await req.app.locals.getDbPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const lineRes = await transaction
          .request()
          .input('ID', sql.Int, lineId)
          .input('EMPNIT', sql.VarChar, empnit)
          .input('CODDOC', sql.VarChar, coddoc)
          .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
          .query(`
            SELECT
              l.CODPROD, l.DESPROD, l.TOTALUNIDADES, l.TIPOPROD, l.TIPOM,
              l.CODBODEGAENTRADA, l.CODBODEGASALIDA, d.STATUS
            FROM dbo.DOCPRODUCTOS l
            JOIN dbo.DOCUMENTOS d
              ON d.EMPNIT = l.EMPNIT AND d.CODDOC = l.CODDOC AND d.CORRELATIVO = l.CORRELATIVO
            WHERE l.ID = @ID AND l.EMPNIT = @EMPNIT AND l.CODDOC = @CODDOC AND l.CORRELATIVO = @CORRELATIVO
          `);
        if (!lineRes.recordset.length) {
          await transaction.rollback();
          return res.status(404).json({ error: 'Línea no encontrada' });
        }
        const line = lineRes.recordset[0];
        if (!isStatusEditable(line.STATUS)) {
          await transaction.rollback();
          return res.status(400).json({ error: 'El documento ya no está en edición' });
        }
        await revertirMovimientoInventarioLinea(transaction, {
          empnit,
          coddoc,
          correlativo,
          codprod: line.CODPROD,
          desprod: line.DESPROD,
          totalUnidades: line.TOTALUNIDADES,
          tipoprod: line.TIPOPROD,
          tipom: line.TIPOM,
          codbodegaEntrada: line.CODBODEGAENTRADA ?? DEFAULT_BODEGA,
          codbodegaSalida: line.CODBODEGASALIDA ?? DEFAULT_BODEGA,
        });
        const del = await transaction
          .request()
          .input('ID', sql.Int, lineId)
          .query(`DELETE FROM dbo.DOCPRODUCTOS WHERE ID = @ID`);
        if (del.rowsAffected[0] === 0) {
          await transaction.rollback();
          return res.status(404).json({ error: 'Línea no encontrada' });
        }
        const totals = await recalcDocumentTotals(transaction, empnit, coddoc, correlativo);
        await transaction.commit();
        const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
        res.json({ totals, documento: doc });
      } catch (inner) {
        await transaction.rollback();
        if (inner instanceof InventarioError) {
          return res.status(inner.statusCode).json({ error: inner.message, code: inner.code });
        }
        throw inner;
      }
    } catch (err) {
      if (err instanceof InventarioError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      console.warn(`[API DELETE /${logPrefix}/documentos/lineas]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/documentos/:coddoc/:correlativo/finalizar', async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const coddoc = String(req.params.coddoc || '').trim();
    const correlativo = parseCorrelativo(req.params.correlativo);
    if (!coddoc || correlativo === null) return res.status(400).json({ error: 'Documento inválido' });
    const obs = req.body?.OBS !== undefined ? String(req.body.OBS || '').trim() : null;
    const codembarque =
      req.body?.CODEMBARQUE !== undefined ? String(req.body.CODEMBARQUE || '').trim() : null;
    const obmarca =
      req.body?.OBSMARCA !== undefined ? String(req.body.OBSMARCA || '').trim() : null;

    try {
      const pool = await req.app.locals.getDbPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const headerSets = [];
        const headerReq = transaction
          .request()
          .input('EMPNIT', sql.VarChar, empnit)
          .input('CODDOC', sql.VarChar, coddoc)
          .input('CORRELATIVO', sql.Decimal(18, 0), correlativo);
        if (obs !== null) {
          headerReq.input('OBS', sql.VarChar, obs);
          headerSets.push('OBS = @OBS');
        }
        if (codembarque !== null) {
          headerReq.input('CODEMBARQUE', sql.VarChar, codembarque || 'SN');
          headerSets.push('CODEMBARQUE = @CODEMBARQUE');
        }
        if (obmarca !== null) {
          headerReq.input('OBSMARCA', sql.VarChar, obmarca || 'SN');
          headerSets.push('OBSMARCA = @OBSMARCA');
        }
        if (headerSets.length) {
          await headerReq.query(`
              UPDATE dbo.DOCUMENTOS SET ${headerSets.join(', ')}
              WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
                AND ${SQL_STATUS_EDITABLE}
            `);
        }
        const docRow = await transaction
          .request()
          .input('EMPNIT', sql.VarChar, empnit)
          .input('CODDOC', sql.VarChar, coddoc)
          .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
          .query(`
            SELECT STATUS, ISNULL(CORTE, 'NO') AS CORTE FROM dbo.DOCUMENTOS
            WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
          `);
        if (!docRow.recordset.length) {
          await transaction.rollback();
          return res.status(404).json({ error: 'Documento no encontrado' });
        }
        const docMeta = docRow.recordset[0];
        if (!isStatusEditable(docMeta.STATUS)) {
          await transaction.rollback();
          return res.status(400).json({ error: 'El documento no está operado' });
        }
        const lineCount = await transaction
          .request()
          .input('EMPNIT', sql.VarChar, empnit)
          .input('CODDOC', sql.VarChar, coddoc)
          .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
          .query(`
            SELECT COUNT(*) AS cnt FROM dbo.DOCPRODUCTOS
            WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
          `);
        if (lineCount.recordset[0].cnt < 1) {
          await transaction.rollback();
          return res.status(400).json({ error: 'Agregue al menos un producto' });
        }
        await recalcDocumentTotals(transaction, empnit, coddoc, correlativo);
        let inv = { tipom: 0, lineas: 0, productos: 0 };
        const corteAplicado = String(docMeta.CORTE || 'NO').trim().toUpperCase() === 'SI';
        if (!corteAplicado) {
          const tipom = await getTipomDocumento(transaction, empnit, coddoc);
          inv = { tipom, lineas: 0, productos: 0 };
          const corteUpd = await transaction
            .request()
            .input('EMPNIT', sql.VarChar, empnit)
            .input('CODDOC', sql.VarChar, coddoc)
            .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
            .query(`
              UPDATE dbo.DOCUMENTOS SET CORTE = 'SI'
              WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
                AND ${SQL_STATUS_EDITABLE}
            `);
          if (corteUpd.rowsAffected[0] === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Documento no encontrado' });
          }
        }
        await transaction.commit();
        const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
        res.json({ ok: true, documento: doc, inventario: inv });
      } catch (inner) {
        await transaction.rollback();
        if (inner instanceof InventarioError) {
          return res.status(inner.statusCode).json({ error: inner.message, code: inner.code });
        }
        throw inner;
      }
    } catch (err) {
      if (err instanceof InventarioError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      console.warn(`[API POST /${logPrefix}/documentos/finalizar]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Envía traslado al host: actualiza destino local y copia a
   * COMMUNITY_DOCUMENTOS / COMMUNITY_DOCPRODUCTOS (TOKEN de instalación).
   */
  router.post('/documentos/:coddoc/:correlativo/enviar', async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const coddoc = String(req.params.coddoc || '').trim();
    const correlativo = parseCorrelativo(req.params.correlativo);
    if (!coddoc || correlativo === null) return res.status(400).json({ error: 'Documento inválido' });

    const token = getAppToken();
    if (!token) return res.status(503).json({ error: 'TOKEN no configurado en .env' });
    if (!isUpdateDbConfigured()) {
      return res.status(503).json({
        error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
      });
    }

    const codembarque = String(req.body?.CODEMBARQUE ?? '').trim();
    const obmarca = String(req.body?.OBSMARCA ?? '').trim();
    if (!codembarque) {
      return res.status(400).json({ error: 'Seleccione una empresa destino' });
    }

    try {
      const pool = await req.app.locals.getDbPool();
      const hostPool = await getUpdateDbPool();
      if (!hostPool) {
        return res.status(503).json({ error: 'No se pudo conectar a la base UPDATE_*' });
      }

      const tokenCheck = await checkTokenActivo(hostPool, token);
      if (!tokenCheck.ok) {
        const status = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
        return res.status(status).json({
          error: tokenCheck.error || TOKEN_NO_NUBE_MSG,
          code: tokenCheck.code,
        });
      }

      const exists = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODDOC', sql.VarChar, coddoc)
        .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
        .query(`
          SELECT d.CODDOC
          FROM dbo.DOCUMENTOS d
          JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
          WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
            AND t.TIPODOC IN (${tipodocSqlIn})
        `);
      if (!exists.recordset.length) return res.status(404).json({ error: 'Documento no encontrado' });

      await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODDOC', sql.VarChar, coddoc)
        .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
        .input('CODEMBARQUE', sql.VarChar, codembarque)
        .input('OBSMARCA', sql.VarChar, obmarca || 'SN')
        .query(`
          UPDATE dbo.DOCUMENTOS
          SET CODEMBARQUE = @CODEMBARQUE, OBSMARCA = @OBSMARCA
          WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
        `);

      // Elimina en nube (TOKEN+EMPNIT+CODDOC+CORRELATIVO) y vuelve a insertar.
      const copy = await copyDocumentoToCommunity({
        localPool: pool,
        hostPool,
        token,
        empnit,
        coddoc,
        correlativo,
      });

      const marcaMax = await getDocumentosMarcaMaxChars(pool);
      const marcaVal = marcaEnviadoValue(marcaMax);
      await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODDOC', sql.VarChar, coddoc)
        .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
        .input('MARCA', sql.VarChar, marcaVal)
        .query(`
          UPDATE dbo.DOCUMENTOS
          SET MARCA = @MARCA
          WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
        `);

      const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
      res.json({ ok: true, lineas: copy.lineas, documento: doc, marca: marcaVal });
    } catch (err) {
      console.warn(`[API POST /${logPrefix}/documentos/enviar]`, err.message);
      res.status(500).json({ error: err.message || 'Error al enviar traslado' });
    }
  });

  /**
   * Descarga traslado de la nube → DOCUMENTOS/DOCPRODUCTOS locales (suma stock),
   * finaliza y elimina la copia en COMMUNITY_*.
   * Solo routers de recepción (TIN/TES).
   */
  if (TIPODOCS.some((t) => t === 'TIN' || t === 'TES')) {
    router.post('/community/descargar', async (req, res) => {
      if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
      const empnit = requireEmpNit(req, res);
      if (!empnit) return;

      const origenEmpnit = String(req.body?.origenEmpnit || req.body?.EMPNIT_ORIGEN || '').trim();
      const origenCoddoc = String(req.body?.origenCoddoc || req.body?.CODDOC_ORIGEN || '').trim();
      const origenCorrelativo = parseCorrelativo(
        req.body?.origenCorrelativo ?? req.body?.CORRELATIVO_ORIGEN
      );
      const coddocLocal = String(req.body?.CODDOC || req.body?.coddoc || '').trim();
      const usuario = String(req.body?.USUARIO || req.body?.usuario || 'INV').trim();

      if (!origenEmpnit || !origenCoddoc || origenCorrelativo === null) {
        return res.status(400).json({ error: 'Identificación del traslado en la nube incompleta' });
      }
      if (!coddocLocal) {
        return res.status(400).json({ error: 'Seleccione una serie local (TIN/TES)' });
      }

      const token = getAppToken();
      if (!token) return res.status(503).json({ error: 'TOKEN no configurado en .env' });
      if (!isUpdateDbConfigured()) {
        return res.status(503).json({
          error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
        });
      }

      try {
        const pool = await req.app.locals.getDbPool();
        const hostPool = await getUpdateDbPool();
        if (!hostPool) {
          return res.status(503).json({ error: 'No se pudo conectar a la base UPDATE_*' });
        }

        const tokenCheck = await checkTokenActivo(hostPool, token);
        if (!tokenCheck.ok) {
          const status = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
          return res.status(status).json({
            error: tokenCheck.error || TOKEN_NO_NUBE_MSG,
            code: tokenCheck.code,
          });
        }

        const tipoRes = await pool
          .request()
          .input('EMPNIT', sql.VarChar, empnit)
          .input('CODDOC', sql.VarChar, coddocLocal)
          .query(`
            SELECT CODDOC, TIPOM
            FROM dbo.TIPODOCUMENTOS
            WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
              AND TIPODOC IN (${tipodocSqlIn}) AND ACTIVO = 'SI'
          `);
        if (!tipoRes.recordset.length) {
          return res.status(400).json({
            error: `Serie ${coddocLocal} no válida o inactiva para recepción (TIN/TES)`,
          });
        }

        const result = await downloadTrasladoFromCommunity({
          localPool: pool,
          hostPool,
          empnitLocal: empnit,
          coddocLocal,
          usuario,
          origenEmpnit,
          origenCoddoc,
          origenCorrelativo,
        });
        res.json(result);
      } catch (err) {
        if (err instanceof InventarioError) {
          return res.status(err.statusCode).json({ error: err.message, code: err.code });
        }
        console.warn(`[API POST /${logPrefix}/community/descargar]`, err.message);
        res.status(500).json({ error: err.message || 'Error al descargar traslado' });
      }
    });
  }

  /** Destino remoto (CODEMBARQUE = EMPNIT sync, OBSMARCA = EMPNOMBRE). */
  router.patch('/documentos/:coddoc/:correlativo/destino', async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const coddoc = String(req.params.coddoc || '').trim();
    const correlativo = parseCorrelativo(req.params.correlativo);
    if (!coddoc || correlativo === null) return res.status(400).json({ error: 'Documento inválido' });
    const codembarque = String(req.body?.CODEMBARQUE ?? '').trim();
    const obmarca = String(req.body?.OBSMARCA ?? '').trim();
    if (!codembarque) {
      return res.status(400).json({ error: 'Seleccione una empresa destino' });
    }
    try {
      const pool = await req.app.locals.getDbPool();
      const exists = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODDOC', sql.VarChar, coddoc)
        .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
        .query(`
          SELECT d.CODDOC
          FROM dbo.DOCUMENTOS d
          JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
          WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
            AND t.TIPODOC IN (${tipodocSqlIn})
        `);
      if (!exists.recordset.length) return res.status(404).json({ error: 'Documento no encontrado' });
      await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODDOC', sql.VarChar, coddoc)
        .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
        .input('CODEMBARQUE', sql.VarChar, codembarque)
        .input('OBSMARCA', sql.VarChar, obmarca || 'SN')
        .query(`
          UPDATE dbo.DOCUMENTOS
          SET CODEMBARQUE = @CODEMBARQUE, OBSMARCA = @OBSMARCA
          WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
        `);
      const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
      res.json({ ok: true, documento: doc });
    } catch (err) {
      console.warn(`[API PATCH /${logPrefix}/documentos/destino]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/documentos/:coddoc/:correlativo/bloquear', async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const coddoc = String(req.params.coddoc || '').trim();
    const correlativo = parseCorrelativo(req.params.correlativo);
    if (!coddoc || correlativo === null) return res.status(400).json({ error: 'Documento inválido' });

    try {
      const pool = await req.app.locals.getDbPool();
      const result = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODDOC', sql.VarChar, coddoc)
        .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
        .query(`
          UPDATE dbo.DOCUMENTOS SET STATUS = '${STATUS_BLOQUEADO}'
          WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
            AND STATUS = '${STATUS_OPERADO}'
        `);
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ error: 'Documento no encontrado o no se puede bloquear' });
      }
      const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
      res.json({ ok: true, documento: doc });
    } catch (err) {
      console.warn(`[API POST /${logPrefix}/documentos/bloquear]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/documentos/:coddoc/:correlativo', async (req, res) => {
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const coddoc = String(req.params.coddoc || '').trim();
    const correlativo = parseCorrelativo(req.params.correlativo);
    if (!coddoc || correlativo === null) return res.status(400).json({ error: 'Documento inválido' });
    const pass = String(req.body?.pass ?? req.body?.PASS ?? '');

    try {
      const pool = await req.app.locals.getDbPool();
      await assertEliminacionRegistro(pool, pass);
      const result = await deleteDocumentoOperado(pool, empnit, coddoc, correlativo, {
        usuario: usuarioFromReq(req),
        motivo: String(req.body?.motivo || req.body?.MOTIVO || '').trim() || null,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof DocumentoDeleteError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err instanceof InventarioError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      if (err.statusCode === 401) {
        return res.status(401).json({ error: err.message });
      }
      console.warn(`[API DELETE /${logPrefix}/documentos]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /** Solo entradas: crear documento + líneas desde Excel (CODPROD, DESPROD, TOTALUNIDADES). */
  if (TIPODOC === 'ENT' && TIPODOCS.length === 1) {
    router.post('/import-excel', (req, res) => {
      excelUpload.single('archivo')(req, res, async (uploadErr) => {
        if (uploadErr) {
          return res.status(400).json({ error: uploadErr.message || 'Error al subir el archivo' });
        }
        if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
        const empnit = requireEmpNit(req, res);
        if (!empnit) return;
        if (!req.file?.buffer?.length) {
          return res.status(400).json({ error: 'Debe seleccionar un archivo Excel (.xls o .xlsx)' });
        }

        const coddocBody = String(req.body?.CODDOC || req.query?.CODDOC || '').trim();
        const usuario = String(req.body?.USUARIO || req.body?.usuario || 'INV').trim();

        try {
          const parsed = parseEntradaInventarioExcel(req.file.buffer);
          const pool = await req.app.locals.getDbPool();
          const tipo = await getTipoDoc(pool, empnit, coddocBody);
          if (!tipo) {
            return res.status(400).json({
              error: `No hay tipo de documento ${tipodocLabel} activo para la empresa`,
            });
          }
          const coddoc = tipo.CODDOC;

          const missing = [];
          const resolved = [];
          for (const row of parsed.rows) {
            const prodRes = await pool
              .request()
              .input('EMPNIT', sql.VarChar, empnit)
              .input('CODPROD', sql.VarChar, row.CODPROD)
              .query(`
                SELECT TOP 1
                  LTRIM(RTRIM(CODPROD)) AS CODPROD,
                  DESPROD,
                  ISNULL(COSTO, 0) AS COSTO,
                  ISNULL(TIPOPROD, 'P') AS TIPOPROD,
                  ISNULL(EXENTO, 0) AS EXENTO
                FROM dbo.PRODUCTOS
                WHERE EMPNIT = @EMPNIT
                  AND LTRIM(RTRIM(CODPROD)) = LTRIM(RTRIM(@CODPROD))
              `);
            if (!prodRes.recordset.length) {
              missing.push(`Fila ${row.excelRow}: producto ${row.CODPROD} no existe`);
              continue;
            }
            const prod = prodRes.recordset[0];
            if (String(prod.TIPOPROD || '').trim().toUpperCase() === 'S') {
              missing.push(`Fila ${row.excelRow}: ${row.CODPROD} es servicio (no afecta inventario)`);
              continue;
            }
            resolved.push({
              excelRow: row.excelRow,
              CODPROD: prod.CODPROD,
              DESPROD: prod.DESPROD || row.DESPROD || row.CODPROD,
              CANTIDAD: row.TOTALUNIDADES,
              COSTO: Number(prod.COSTO) || 0,
              TIPOPROD: String(prod.TIPOPROD || 'P').trim() || 'P',
              EXENTO: Number(prod.EXENTO) ? Number(prod.EXENTO) : 0,
            });
          }

          const skipped = [...(parsed.skipped || []), ...missing];
          if (!resolved.length) {
            return res.status(400).json({
              error: 'No hay productos válidos para importar',
              skipped,
            });
          }

          const parts = nowParts();
          const transaction = new sql.Transaction(pool);
          await transaction.begin();
          try {
            const correlativo = await allocateCorrelativo(transaction, empnit, coddoc);
            await transaction
              .request()
              .input('EMPNIT', sql.VarChar, empnit)
              .input('ANIO', sql.Int, parts.anio)
              .input('MES', sql.Int, parts.mes)
              .input('DIA', sql.Int, parts.dia)
              .input('FECHA', sql.Date, parts.fecha)
              .input('HORA', sql.Int, parts.hora)
              .input('MINUTO', sql.Int, parts.minuto)
              .input('CODDOC', sql.VarChar, coddoc)
              .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
              .input('USUARIO', sql.VarChar, usuario)
              .input('OBS', sql.VarChar, `Importado desde Excel: ${req.file.originalname || 'archivo'}`)
              .query(`
                INSERT INTO dbo.DOCUMENTOS (
                  EMPNIT, ANIO, MES, DIA, FECHA, HORA, MINUTO, CODDOC, CORRELATIVO,
                  CODCLIENTE, DOC_NIT, DOC_NOMCLIE, DOC_DIRCLIE,
                  TOTALCOSTO, TOTALPRECIO, CODEMBARQUE, STATUS, USUARIO, CONCRE, CORTE,
                  MARCA, OBS, DOC_SALDO, DOC_ABONO, OBSMARCA, TOTALDESCUENTO, CODCAJA,
                  DIRENTREGA, NOGUIA, VALORENTREGA, TOTALEXENTO, TIPOPAGO, NODOCPAGO,
                  VENCIMIENTO, DIASCREDITO, TOTALIVA, TOTALSINIVA, PAGO, VUELTO
                ) VALUES (
                  @EMPNIT, @ANIO, @MES, @DIA, @FECHA, @HORA, @MINUTO, @CODDOC, @CORRELATIVO,
                  0, 'CF', 'INVENTARIO', 'SN',
                  0, 0, 'INVENTARIO', '${STATUS_OPERADO}', @USUARIO, 'CON', 'NO',
                  'SN', @OBS, 0, 0, 'SN', 0, 1,
                  'SN', 'SN', 0, 0, 'CONTADO', 'SN',
                  @FECHA, 0, 0, 0, 0, 0
                )
              `);

            const tipom = await getTipomDocumento(transaction, empnit, coddoc);
            for (const line of resolved) {
              const cantidad = Number(line.CANTIDAD);
              const equivale = 1;
              const costo = Number(line.COSTO) || 0;
              const precio = costo;
              const { totalUnidades, totalCosto, totalPrecio } = calcLineTotals(
                cantidad,
                costo,
                precio,
                equivale
              );
              const peso = 0;
              const totalPeso = calcLinePeso(cantidad, peso);

              await transaction
                .request()
                .input('EMPNIT', sql.VarChar, empnit)
                .input('ANIO', sql.Int, parts.anio)
                .input('MES', sql.Int, parts.mes)
                .input('DIA', sql.Int, parts.dia)
                .input('CODDOC', sql.VarChar, coddoc)
                .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
                .input('CODPROD', sql.VarChar, line.CODPROD)
                .input('DESPROD', sql.VarChar, line.DESPROD)
                .input('CODMEDIDA', sql.VarChar, 'UNIDAD')
                .input('CANTIDAD', sql.Float, cantidad)
                .input('EQUIVALE', sql.Int, equivale)
                .input('TOTALUNIDADES', sql.Float, totalUnidades)
                .input('COSTO', sql.Decimal(18, 3), costo)
                .input('PRECIO', sql.Decimal(18, 3), precio)
                .input('TOTALCOSTO', sql.Decimal(18, 3), totalCosto)
                .input('TOTALPRECIO', sql.Decimal(18, 3), totalPrecio)
                .input('EXENTO', sql.Decimal(18, 3), line.EXENTO)
                .input('TIPOPROD', sql.VarChar, line.TIPOPROD)
                .input('TIPOPRECIO', sql.VarChar, 'P')
                .input('PESO', sql.Decimal(18, 3), peso)
                .input('TOTALPESO', sql.Decimal(18, 3), totalPeso)
                .input('TIPOM', sql.Int, tipom)
                .query(`
                  INSERT INTO dbo.DOCPRODUCTOS (
                    EMPNIT, ANIO, MES, DIA, CODDOC, CORRELATIVO, CODPROD, DESPROD, CODMEDIDA,
                    CANTIDAD, CANTIDADBONIF, EQUIVALE, TOTALUNIDADES, TOTALBONIF,
                    COSTO, PRECIO, TOTALCOSTO, TOTALPRECIO,
                    ENTREGADOS_TOTALUNIDADES, ENTREGADOS_TOTALCOSTO, ENTREGADOS_TOTALPRECIO,
                    COSTOANTERIOR, COSTOPROMEDIO, CODBODEGAENTRADA, CODBODEGASALIDA,
                    DESCUENTO, PORCDESCUENTO, NOSERIE, EXENTO, OBS,
                    TIPOPROD, TIPOPRECIO, PESO, TOTALPESO, TIPOM, LASTUPDATE
                  ) VALUES (
                    @EMPNIT, @ANIO, @MES, @DIA, @CODDOC, @CORRELATIVO, @CODPROD, @DESPROD, @CODMEDIDA,
                    @CANTIDAD, 0, @EQUIVALE, @TOTALUNIDADES, 0,
                    @COSTO, @PRECIO, @TOTALCOSTO, @TOTALPRECIO,
                    @TOTALUNIDADES, @TOTALCOSTO, @TOTALPRECIO,
                    0, 0, ${DEFAULT_BODEGA}, ${DEFAULT_BODEGA},
                    0, 0, 'SN', @EXENTO, 'SN',
                    @TIPOPROD, @TIPOPRECIO, @PESO, @TOTALPESO, @TIPOM, CAST(GETDATE() AS DATE)
                  )
                `);

              await aplicarMovimientoInventarioLineaInsert(transaction, {
                empnit,
                coddoc,
                correlativo,
                codprod: line.CODPROD,
                desprod: line.DESPROD,
                totalUnidades,
                tipoprod: line.TIPOPROD,
                tipom,
                codbodegaEntrada: DEFAULT_BODEGA,
                codbodegaSalida: DEFAULT_BODEGA,
              });
            }

            await recalcDocumentTotals(transaction, empnit, coddoc, correlativo);
            await transaction.commit();

            const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
            res.status(201).json({
              ok: true,
              lineas: resolved.length,
              omitidas: skipped.length,
              skipped,
              archivo: req.file.originalname,
              documento: doc,
            });
          } catch (inner) {
            await transaction.rollback();
            throw inner;
          }
        } catch (err) {
          if (err instanceof InventarioError) {
            return res.status(err.statusCode).json({ error: err.message, code: err.code });
          }
          const code = err.statusCode || 500;
          if (code >= 500) console.warn(`[API POST /${logPrefix}/import-excel]`, err.message);
          res.status(code).json({ error: err.message });
        }
      });
    });
  }

  return router;
}

module.exports = {
  createInventarioDocsRouter,
  entradasRouter: createInventarioDocsRouter('ENT', 'inventario-ent'),
  salidasRouter: createInventarioDocsRouter('SAL', 'inventario-sal'),
  trasladosCrearRouter: createInventarioDocsRouter(['TSL', 'TSS'], 'traslados-crear'),
  trasladosRecibirRouter: createInventarioDocsRouter(['TIN', 'TES'], 'traslados-recibir'),
};
