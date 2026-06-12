const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { InventarioError, aplicarMovimientoInventarioDocumento } = require('../lib/inventario');
const { parseFechaInput, applyDocumentoFecha } = require('../lib/documento-fecha');
const {
  STATUS_OPERADO,
  STATUS_BLOQUEADO,
  STATUS_ANULADO,
  isStatusEditable,
  SQL_STATUS_EDITABLE,
} = require('../lib/documento-status');
const { assertAdminPass } = require('../lib/config-auth');
const { DocumentoDeleteError, deleteDocumentoOperado } = require('../lib/documento-delete');

const SEARCH_LIMIT = 80;
const DEFAULT_BODEGA = 1;

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

function nowParts() {
  const d = new Date();
  return {
    anio: d.getFullYear(),
    mes: d.getMonth() + 1,
    dia: d.getDate(),
    fecha: d,
    hora: d.getHours(),
    minuto: d.getMinutes(),
  };
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

function createInventarioDocsRouter(tipodoc, logPrefix) {
  const router = express.Router();
  const TIPODOC = String(tipodoc || '').trim().toUpperCase();

  async function getTipoDoc(pool, empnit, coddocPreferred) {
    const reqDb = pool.request().input('EMPNIT', sql.VarChar, empnit).input('TIPODOC', sql.VarChar, TIPODOC);
    if (coddocPreferred) {
      reqDb.input('CODDOC', sql.VarChar, coddocPreferred);
      const one = await reqDb.query(`
        SELECT CODDOC, DESDOC, TIPODOC, CORRELATIVO, TIPOM
        FROM dbo.TIPODOCUMENTOS
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND TIPODOC = @TIPODOC AND ACTIVO = 'SI'
      `);
      if (one.recordset.length) return one.recordset[0];
    }
    const all = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('TIPODOC', sql.VarChar, TIPODOC)
      .query(`
        SELECT CODDOC, DESDOC, TIPODOC, CORRELATIVO, TIPOM
        FROM dbo.TIPODOCUMENTOS
        WHERE EMPNIT = @EMPNIT AND TIPODOC = @TIPODOC AND ACTIVO = 'SI'
        ORDER BY CODDOC
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
          AND t.TIPODOC = '${TIPODOC}'
      `);
    if (!headerRes.recordset.length) return null;
    const linesRes = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .query(`
        SELECT Id AS ID, CODPROD, DESPROD, CODMEDIDA, CANTIDAD, EQUIVALE, PRECIO, COSTO,
          TOTALPRECIO, TOTALCOSTO, TOTALUNIDADES, TIPOPRECIO
        FROM dbo.DOCPRODUCTOS
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
        ORDER BY Id
      `);
    return { header: headerRes.recordset[0], lines: linesRes.recordset };
  }

  router.get('/config', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    try {
      const pool = await req.app.locals.getDbPool();
      const tipos = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('TIPODOC', sql.VarChar, TIPODOC)
        .query(`
          SELECT CODDOC, DESDOC, CORRELATIVO, TIPOM
          FROM dbo.TIPODOCUMENTOS
          WHERE EMPNIT = @EMPNIT AND TIPODOC = @TIPODOC AND ACTIVO = 'SI'
          ORDER BY CODDOC
        `);
      const def = tipos.recordset[0] || null;
      res.json({
        empnit,
        tipodoc: TIPODOC,
        statusOperado: STATUS_OPERADO,
        statusBloqueado: STATUS_BLOQUEADO,
        statusAnulado: STATUS_ANULADO,
        coddocDefault: def?.CODDOC || null,
        tiposDocumento: tipos.recordset,
        bodegaDefault: DEFAULT_BODEGA,
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
      const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
      let whereExtra = " AND p.TIPOPROD <> 'S'";
      if (q) {
        request.input('Q', sql.VarChar, `%${q}%`);
        whereExtra += ' AND (p.CODPROD LIKE @Q OR p.DESPROD LIKE @Q)';
      }
      const result = await request.query(`
        SELECT TOP ${SEARCH_LIMIT}
          p.CODPROD, p.DESPROD, p.COSTO AS COSTO_PROD, p.TIPOPROD, p.EXISTENCIA,
          pr.CODMEDIDA, pr.COSTO, pr.EQUIVALE, pr.PRECIO
        FROM dbo.PRODUCTOS p
        INNER JOIN dbo.PRECIOS pr ON p.CODPROD = pr.CODPROD AND p.EMPNIT = pr.EMPNIT
        WHERE p.EMPNIT = @EMPNIT AND p.HABILITADO = 'SI' AND pr.HABILITADO = 'SI'
        ${whereExtra}
        ORDER BY p.DESPROD, pr.CODMEDIDA, pr.EQUIVALE DESC
      `);
      const rows = result.recordset.map((row) => ({
        CODPROD: row.CODPROD,
        DESPROD: row.DESPROD,
        COSTO_PROD: row.COSTO_PROD,
        TIPOPROD: row.TIPOPROD,
        EXISTENCIA: row.EXISTENCIA,
        CODMEDIDA: row.CODMEDIDA,
        COSTO: row.COSTO ?? row.COSTO_PROD,
        EQUIVALE: row.EQUIVALE,
      }));
      res.json({ rows, q: q || null });
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
        .input('ANIO', sql.Int, anio)
        .input('TIPODOC', sql.VarChar, TIPODOC);
      let coddocFilter = '';
      if (coddoc) {
        request.input('CODDOC', sql.VarChar, coddoc);
        coddocFilter = ' AND d.CODDOC = @CODDOC';
      }
      const result = await request.query(`
        SELECT TOP 200
          d.CODDOC, d.CORRELATIVO, d.FECHA, d.HORA, d.MINUTO, d.STATUS,
          d.TOTALCOSTO, d.OBS, d.MES, d.ANIO, d.USUARIO,
          (SELECT COUNT(*) FROM dbo.DOCPRODUCTOS l
           WHERE l.EMPNIT = d.EMPNIT AND l.CODDOC = d.CODDOC AND l.CORRELATIVO = d.CORRELATIVO) AS LINEAS
        FROM dbo.DOCUMENTOS d
        JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
        WHERE d.EMPNIT = @EMPNIT
          AND t.TIPODOC = @TIPODOC
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
          error: `No hay tipo de documento ${TIPODOC} activo para la empresa`,
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
    const codmedida = String(req.body?.CODMEDIDA || '').trim();
    const cantidad = Number(req.body?.CANTIDAD ?? 1);
    if (!coddoc || correlativo === null || !codprod || !codmedida) {
      return res.status(400).json({ error: 'CODPROD y CODMEDIDA son obligatorios' });
    }
    if (cantidad <= 0) return res.status(400).json({ error: 'Cantidad debe ser mayor a cero' });

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

      const prodRes = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODPROD', sql.VarChar, codprod)
        .input('CODMEDIDA', sql.VarChar, codmedida)
        .query(`
          SELECT p.CODPROD, p.DESPROD, p.COSTO AS COSTO_PROD, p.TIPOPROD, p.EXENTO,
            pr.PRECIO, pr.COSTO, pr.EQUIVALE
          FROM dbo.PRODUCTOS p
          INNER JOIN dbo.PRECIOS pr ON p.CODPROD = pr.CODPROD AND p.EMPNIT = pr.EMPNIT
          WHERE p.EMPNIT = @EMPNIT AND p.CODPROD = @CODPROD AND pr.CODMEDIDA = @CODMEDIDA
            AND p.HABILITADO = 'SI' AND pr.HABILITADO = 'SI'
        `);
      if (!prodRes.recordset.length) return res.status(404).json({ error: 'Producto o medida no encontrado' });
      const prod = prodRes.recordset[0];
      const costo = Number(prod.COSTO ?? prod.COSTO_PROD) || 0;
      const precio = Number(prod.PRECIO) || 0;
      const equivale = Number(prod.EQUIVALE) || 1;
      const { totalUnidades, totalCosto, totalPrecio } = calcLineTotals(
        cantidad,
        costo,
        precio,
        equivale
      );
      const parts = nowParts();
      const exento = Number(prod.EXENTO) ? Number(prod.EXENTO) : 0;

      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const ins = await transaction
          .request()
          .input('EMPNIT', sql.VarChar, empnit)
          .input('ANIO', sql.Int, parts.anio)
          .input('MES', sql.Int, parts.mes)
          .input('DIA', sql.Int, parts.dia)
          .input('CODDOC', sql.VarChar, coddoc)
          .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
          .input('CODPROD', sql.VarChar, codprod)
          .input('DESPROD', sql.VarChar, prod.DESPROD)
          .input('CODMEDIDA', sql.VarChar, codmedida)
          .input('CANTIDAD', sql.Float, cantidad)
          .input('EQUIVALE', sql.Int, equivale)
          .input('TOTALUNIDADES', sql.Float, totalUnidades)
          .input('COSTO', sql.Decimal(18, 3), costo)
          .input('PRECIO', sql.Decimal(18, 3), precio)
          .input('TOTALCOSTO', sql.Decimal(18, 3), totalCosto)
          .input('TOTALPRECIO', sql.Decimal(18, 3), totalPrecio)
          .input('EXENTO', sql.Decimal(18, 3), exento)
          .input('TIPOPROD', sql.VarChar, prod.TIPOPROD || 'P')
          .query(`
            INSERT INTO dbo.DOCPRODUCTOS (
              EMPNIT, ANIO, MES, DIA, CODDOC, CORRELATIVO, CODPROD, DESPROD, CODMEDIDA,
              CANTIDAD, CANTIDADBONIF, EQUIVALE, TOTALUNIDADES, TOTALBONIF,
              COSTO, PRECIO, TOTALCOSTO, TOTALPRECIO,
              ENTREGADOS_TOTALUNIDADES, ENTREGADOS_TOTALCOSTO, ENTREGADOS_TOTALPRECIO,
              COSTOANTERIOR, COSTOPROMEDIO, CODBODEGAENTRADA, CODBODEGASALIDA,
              DESCUENTO, PORCDESCUENTO, NOSERIE, EXENTO, OBS,
              TIPOPROD, TIPOPRECIO
            ) VALUES (
              @EMPNIT, @ANIO, @MES, @DIA, @CODDOC, @CORRELATIVO, @CODPROD, @DESPROD, @CODMEDIDA,
              @CANTIDAD, 0, @EQUIVALE, @TOTALUNIDADES, 0,
              @COSTO, @PRECIO, @TOTALCOSTO, @TOTALPRECIO,
              @TOTALUNIDADES, @TOTALCOSTO, @TOTALPRECIO,
              0, 0, ${DEFAULT_BODEGA}, ${DEFAULT_BODEGA},
              0, 0, 'SN', @EXENTO, 'SN',
              @TIPOPROD, 'C'
            );
            SELECT SCOPE_IDENTITY() AS ID;
          `);
        const lineId = ins.recordset[0]?.ID;
        const totals = await recalcDocumentTotals(transaction, empnit, coddoc, correlativo);
        await transaction.commit();
        const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
        res.status(201).json({ lineId, totals, documento: doc });
      } catch (inner) {
        await transaction.rollback();
        throw inner;
      }
    } catch (err) {
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
          SELECT l.COSTO, l.PRECIO, l.EQUIVALE, d.STATUS
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

      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
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
          .query(`
            UPDATE dbo.DOCPRODUCTOS SET
              CANTIDAD = @CANTIDAD, TOTALUNIDADES = @TOTALUNIDADES,
              TOTALCOSTO = @TOTALCOSTO, TOTALPRECIO = @TOTALPRECIO,
              ENTREGADOS_TOTALUNIDADES = @ENTREGADOS_TOTALUNIDADES,
              ENTREGADOS_TOTALCOSTO = @ENTREGADOS_TOTALCOSTO,
              ENTREGADOS_TOTALPRECIO = @ENTREGADOS_TOTALPRECIO
            WHERE ID = @ID
          `);
        const totals = await recalcDocumentTotals(transaction, empnit, coddoc, correlativo);
        await transaction.commit();
        const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
        res.json({ totals, documento: doc });
      } catch (inner) {
        await transaction.rollback();
        throw inner;
      }
    } catch (err) {
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
        const del = await transaction
          .request()
          .input('ID', sql.Int, lineId)
          .input('EMPNIT', sql.VarChar, empnit)
          .input('CODDOC', sql.VarChar, coddoc)
          .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
          .query(`
            DELETE FROM dbo.DOCPRODUCTOS
            WHERE ID = @ID AND EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
              AND EXISTS (
                SELECT 1 FROM dbo.DOCUMENTOS d
                WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
                  AND d.STATUS = '${STATUS_OPERADO}'
              )
          `);
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
        throw inner;
      }
    } catch (err) {
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

    try {
      const pool = await req.app.locals.getDbPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        if (obs !== null) {
          await transaction
            .request()
            .input('EMPNIT', sql.VarChar, empnit)
            .input('CODDOC', sql.VarChar, coddoc)
            .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
            .input('OBS', sql.VarChar, obs)
            .query(`
              UPDATE dbo.DOCUMENTOS SET OBS = @OBS
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
          inv = await aplicarMovimientoInventarioDocumento(transaction, {
            empnit,
            coddoc,
            correlativo,
          });
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
      await assertAdminPass(pool, pass);
      const result = await deleteDocumentoOperado(pool, empnit, coddoc, correlativo);
      res.json(result);
    } catch (err) {
      if (err instanceof DocumentoDeleteError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err.statusCode === 401) {
        return res.status(401).json({ error: err.message });
      }
      console.warn(`[API DELETE /${logPrefix}/documentos]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = {
  createInventarioDocsRouter,
  entradasRouter: createInventarioDocsRouter('ENT', 'inventario-ent'),
  salidasRouter: createInventarioDocsRouter('SAL', 'inventario-sal'),
};
