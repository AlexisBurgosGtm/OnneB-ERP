/**
 * Despacho → Pendientes Entrega
 * Facturas FAC/FEL (FEF/FEC/FES) con TIPOM <> 0, no anuladas.
 * Entregas parciales en DOCUMENTOS_ENTREGAS + DOCPRODUCTOS.ENTREGADOS_*.
 */
const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { parseFechaInput, fechaIsoFromValue, nowParts } = require('../lib/documento-fecha');
const { STATUS_ANULADO } = require('../lib/documento-status');
const {
  ensureDocumentosEntregadoColumn,
  normalizeEntregadoFilter,
  normalizeEntregadoValue,
  SQL_ENTREGADO_FILTER,
} = require('../lib/documentos-entregado');
const { aplicarDeltaFisicoEntrega, InventarioError } = require('../lib/inventario');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const TIPODOCS = ['FAC', 'FEF', 'FEC', 'FES', 'FEL'];
const SQL_TIPODOCS = TIPODOCS.map((t) => `'${t}'`).join(', ');
const DEFAULT_LIMIT = 2000;

const ENSURE_ENTREGAS_SQL = (() => {
  try {
    return fs
      .readFileSync(path.join(__dirname, '..', 'scripts', 'sql', 'dbo.DOCUMENTOS_ENTREGAS.sql'), 'utf8')
      .replace(/^\uFEFF/, '')
      .trim();
  } catch {
    return `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'DOCUMENTOS_ENTREGAS' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.DOCUMENTOS_ENTREGAS (
    ID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    EMPNIT VARCHAR(50) NOT NULL,
    CODDOC VARCHAR(30) NOT NULL,
    CORRELATIVO DECIMAL(18, 0) NOT NULL,
    FECHA DATE NOT NULL,
    HORA INT NULL,
    MINUTO INT NULL,
    ENTREGADO_A VARCHAR(255) NOT NULL,
    USUARIO VARCHAR(100) NULL,
    DETALLE NVARCHAR(MAX) NOT NULL,
    TOTALUNIDADES DECIMAL(18, 4) NULL,
    FECHA_REG DATETIME NOT NULL CONSTRAINT DF_DOCUMENTOS_ENTREGAS_FECHA_REG DEFAULT (GETDATE())
  );
  CREATE INDEX IX_DOCUMENTOS_ENTREGAS_DOC
    ON dbo.DOCUMENTOS_ENTREGAS (EMPNIT, CODDOC, CORRELATIVO, ID DESC);
END;
`;
  }
})();

let schemaReady = false;

async function ensureSchema(pool) {
  if (schemaReady) return;
  await ensureDocumentosEntregadoColumn(pool);
  await pool.request().query(ENSURE_ENTREGAS_SQL);
  schemaReady = true;
}

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.body?.empnit || req.headers['x-emp-nit'] || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundQty(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function defaultFechaRange() {
  const now = nowParts();
  const day = {
    anio: now.anio,
    mes: now.mes,
    dia: now.dia,
    fecha: now.fecha,
  };
  return { from: day, to: day };
}

function formatHora(hora, minuto) {
  const h = Number(hora);
  const m = Number(minuto);
  const hh = Number.isFinite(h) ? String(Math.max(0, Math.min(23, Math.trunc(h)))).padStart(2, '0') : '00';
  const mm = Number.isFinite(m) ? String(Math.max(0, Math.min(59, Math.trunc(m)))).padStart(2, '0') : '00';
  return `${hh}:${mm}`;
}

function mapHeaderRow(r) {
  return {
    FECHA: fechaIsoFromValue(r.FECHA) || null,
    CODDOC: r.CODDOC ?? null,
    CORRELATIVO: r.CORRELATIVO ?? null,
    TIPODOC: r.TIPODOC ?? null,
    HORA: formatHora(r.HORA, r.MINUTO),
    HORA_NUM: r.HORA ?? null,
    MINUTO: r.MINUTO ?? null,
    CLIENTE: String(r.CLIENTE || '').trim(),
    DIRECCION: String(r.DIRECCION || '').trim(),
    DIRENTREGA: String(r.DIRENTREGA || '').trim(),
    TOTALPRECIO: toNumber(r.TOTALPRECIO),
    F_ENTREGA: String(r.F_ENTREGA || '').trim(),
    PRIORIDAD: String(r.PRIORIDAD || '').trim().toUpperCase() || 'MEDIA',
    ENTREGADO: normalizeEntregadoValue(r.ENTREGADO),
    STATUS: r.STATUS ?? null,
    TIPOM: r.TIPOM != null && r.TIPOM !== '' ? toNumber(r.TIPOM) : null,
  };
}

function mapLineRow(r) {
  const totalUnd = toNumber(r.TOTALUNIDADES);
  const entregados = toNumber(r.ENTREGADOS_TOTALUNIDADES);
  const pendiente = roundQty(Math.max(0, totalUnd - entregados));
  return {
    ID: r.ID != null ? Number(r.ID) : null,
    CODPROD: String(r.CODPROD || '').trim(),
    DESPROD: String(r.DESPROD || '').trim(),
    CODMEDIDA: String(r.CODMEDIDA || '').trim(),
    CANTIDAD: toNumber(r.CANTIDAD),
    EQUIVALE: toNumber(r.EQUIVALE) || 1,
    PRECIO: toNumber(r.PRECIO),
    COSTO: toNumber(r.COSTO),
    TOTALPRECIO: toNumber(r.TOTALPRECIO),
    TOTALCOSTO: toNumber(r.TOTALCOSTO),
    TOTALUNIDADES: totalUnd,
    ENTREGADOS_TOTALUNIDADES: entregados,
    ENTREGADOS_TOTALPRECIO: toNumber(r.ENTREGADOS_TOTALPRECIO),
    ENTREGADOS_TOTALCOSTO: toNumber(r.ENTREGADOS_TOTALCOSTO),
    TIPOPROD: String(r.TIPOPROD || 'P').trim() || 'P',
    TIPOM: r.TIPOM != null && r.TIPOM !== '' ? toNumber(r.TIPOM) : null,
    PENDIENTE: pendiente,
  };
}

function parseDetalleJson(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapEntregaRow(r) {
  return {
    ID: Number(r.ID),
    EMPNIT: r.EMPNIT,
    CODDOC: r.CODDOC,
    CORRELATIVO: r.CORRELATIVO,
    FECHA: fechaIsoFromValue(r.FECHA) || null,
    HORA: formatHora(r.HORA, r.MINUTO),
    HORA_NUM: r.HORA ?? null,
    MINUTO: r.MINUTO ?? null,
    ENTREGADO_A: String(r.ENTREGADO_A || '').trim(),
    USUARIO: String(r.USUARIO || '').trim(),
    DETALLE: parseDetalleJson(r.DETALLE),
    TOTALUNIDADES: toNumber(r.TOTALUNIDADES),
    FECHA_REG: r.FECHA_REG ? fechaIsoFromValue(r.FECHA_REG) || String(r.FECHA_REG) : null,
  };
}

async function loadDocHeader(poolOrTx, empnit, coddoc, correlativo) {
  const request =
    poolOrTx?.request && typeof poolOrTx.request === 'function'
      ? poolOrTx.request()
      : new sql.Request(poolOrTx);
  const res = await request
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT TOP 1
        d.FECHA, d.CODDOC, d.CORRELATIVO, t.TIPODOC, d.HORA, d.MINUTO,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_NOMCLIE)), ''), ISNULL(c.NOMBRECLIENTE, '')) AS CLIENTE,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_DIRCLIE)), ''), '') AS DIRECCION,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DIRENTREGA)), ''), '') AS DIRENTREGA,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(NULLIF(LTRIM(RTRIM(d.F_ENTREGA)), ''), '') AS F_ENTREGA,
        ISNULL(NULLIF(LTRIM(RTRIM(d.PRIORIDAD)), ''), 'MEDIA') AS PRIORIDAD,
        d.ENTREGADO, d.STATUS, ISNULL(t.TIPOM, 0) AS TIPOM
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      LEFT JOIN dbo.CLIENTES c ON c.EMPNIT = d.EMPNIT AND c.CODCLIENTE = d.CODCLIENTE
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);
  return res.recordset?.[0] || null;
}

async function loadDocLines(poolOrTx, empnit, coddoc, correlativo) {
  const request =
    poolOrTx?.request && typeof poolOrTx.request === 'function'
      ? poolOrTx.request()
      : new sql.Request(poolOrTx);
  const res = await request
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT
        ID, CODPROD, DESPROD, CODMEDIDA,
        ISNULL(CANTIDAD, 0) AS CANTIDAD,
        ISNULL(EQUIVALE, 1) AS EQUIVALE,
        ISNULL(PRECIO, 0) AS PRECIO,
        ISNULL(COSTO, 0) AS COSTO,
        ISNULL(TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(TOTALCOSTO, 0) AS TOTALCOSTO,
        ISNULL(TOTALUNIDADES, 0) AS TOTALUNIDADES,
        ISNULL(ENTREGADOS_TOTALUNIDADES, 0) AS ENTREGADOS_TOTALUNIDADES,
        ISNULL(ENTREGADOS_TOTALPRECIO, 0) AS ENTREGADOS_TOTALPRECIO,
        ISNULL(ENTREGADOS_TOTALCOSTO, 0) AS ENTREGADOS_TOTALCOSTO,
        ISNULL(TIPOPROD, 'P') AS TIPOPROD,
        TIPOM
      FROM dbo.DOCPRODUCTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      ORDER BY ID
    `);
  return (res.recordset || []).map(mapLineRow);
}

async function loadEntregas(poolOrTx, empnit, coddoc, correlativo) {
  const request =
    poolOrTx?.request && typeof poolOrTx.request === 'function'
      ? poolOrTx.request()
      : new sql.Request(poolOrTx);
  const res = await request
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT ID, EMPNIT, CODDOC, CORRELATIVO, FECHA, HORA, MINUTO,
             ENTREGADO_A, USUARIO, DETALLE, TOTALUNIDADES, FECHA_REG
      FROM dbo.DOCUMENTOS_ENTREGAS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      ORDER BY ID DESC
    `);
  return (res.recordset || []).map(mapEntregaRow);
}

async function documentoSinPendiente(tx, empnit, coddoc, correlativo) {
  const res = await new sql.Request(tx)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT COUNT(*) AS CNT
      FROM dbo.DOCPRODUCTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
        AND (ISNULL(TOTALUNIDADES, 0) - ISNULL(ENTREGADOS_TOTALUNIDADES, 0)) > 0.00005
    `);
  return !(Number(res.recordset?.[0]?.CNT) > 0);
}

async function setDocumentoEntregadoFlag(tx, empnit, coddoc, correlativo, value) {
  await new sql.Request(tx)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('ENTREGADO', sql.Int, value)
    .query(`
      UPDATE dbo.DOCUMENTOS
      SET ENTREGADO = @ENTREGADO
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const q = String(req.query.q || '').trim();
  const qLike = q ? `%${q}%` : null;
  const defaults = defaultFechaRange();
  const fromParts = parseFechaInput(req.query.from || req.query.fechaDesde) || defaults.from;
  const toParts = parseFechaInput(req.query.to || req.query.fechaHasta) || defaults.to;
  const entregado = normalizeEntregadoFilter(req.query.entregado);
  let limit = DEFAULT_LIMIT;
  const requested = parseInt(req.query.limit, 10);
  if (!Number.isNaN(requested)) limit = Math.min(Math.max(requested, 1), 5000);

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSchema(pool);

    const request = pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('q', sql.NVarChar, q || null)
      .input('qLike', sql.NVarChar, qLike)
      .input('FECHA_FROM', sql.Date, fromParts.fecha)
      .input('FECHA_TO', sql.Date, toParts.fecha)
      .input('ENTREGADO', sql.VarChar, entregado)
      .input('limit', sql.Int, limit);

    const result = await request.query(`
      SELECT TOP (@limit)
        d.FECHA, d.CODDOC, d.CORRELATIVO, t.TIPODOC, d.HORA, d.MINUTO,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_NOMCLIE)), ''), ISNULL(c.NOMBRECLIENTE, '')) AS CLIENTE,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_DIRCLIE)), ''), '') AS DIRECCION,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DIRENTREGA)), ''), '') AS DIRENTREGA,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(NULLIF(LTRIM(RTRIM(d.F_ENTREGA)), ''), '') AS F_ENTREGA,
        ISNULL(NULLIF(LTRIM(RTRIM(d.PRIORIDAD)), ''), 'MEDIA') AS PRIORIDAD,
        d.ENTREGADO, d.STATUS
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      LEFT JOIN dbo.CLIENTES c ON c.EMPNIT = d.EMPNIT AND c.CODCLIENTE = d.CODCLIENTE
      WHERE d.EMPNIT = @EMPNIT
        AND UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) IN (${SQL_TIPODOCS})
        AND ISNULL(t.TIPOM, 0) <> 0
        AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
        AND d.FECHA >= @FECHA_FROM
        AND d.FECHA <= @FECHA_TO
        AND ${SQL_ENTREGADO_FILTER}
        AND (
          @q IS NULL OR @q = ''
          OR d.CODDOC LIKE @qLike
          OR CAST(d.CORRELATIVO AS VARCHAR(30)) LIKE @qLike
          OR d.DOC_NOMCLIE LIKE @qLike
          OR c.NOMBRECLIENTE LIKE @qLike
          OR d.DOC_DIRCLIE LIKE @qLike
          OR d.DIRENTREGA LIKE @qLike
          OR t.TIPODOC LIKE @qLike
          OR d.F_ENTREGA LIKE @qLike
          OR d.PRIORIDAD LIKE @qLike
        )
      ORDER BY d.FECHA DESC, d.HORA DESC, d.MINUTO DESC, d.CODDOC, d.CORRELATIVO DESC
    `);

    const rows = (result.recordset || []).map(mapHeaderRow);
    res.json({
      rows,
      from: fromParts.fecha,
      to: toParts.fecha,
      entregado,
      count: rows.length,
    });
  } catch (err) {
    console.warn('[API GET /pendientes-entrega]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:coddoc/:correlativo/lineas', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const coddoc = String(req.params.coddoc || '').trim();
  const correlativo = Number(req.params.correlativo);
  if (!coddoc || !Number.isFinite(correlativo)) {
    return res.status(400).json({ error: 'Documento inválido' });
  }

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSchema(pool);

    const header = await loadDocHeader(pool, empnit, coddoc, correlativo);
    if (!header || String(header.STATUS || '').trim().toUpperCase() === STATUS_ANULADO) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }

    const [lines, entregas] = await Promise.all([
      loadDocLines(pool, empnit, coddoc, correlativo),
      loadEntregas(pool, empnit, coddoc, correlativo),
    ]);

    res.json({
      header: mapHeaderRow(header),
      lines,
      entregas,
    });
  } catch (err) {
    console.warn('[API GET /pendientes-entrega/lineas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:coddoc/:correlativo/entregas', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const coddoc = String(req.params.coddoc || '').trim();
  const correlativo = Number(req.params.correlativo);
  if (!coddoc || !Number.isFinite(correlativo)) {
    return res.status(400).json({ error: 'Documento inválido' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSchema(pool);
    const entregas = await loadEntregas(pool, empnit, coddoc, correlativo);
    res.json({ entregas });
  } catch (err) {
    console.warn('[API GET /pendientes-entrega/entregas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/entregas/:id', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSchema(pool);
    const resEnt = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, id)
      .query(`
        SELECT ID, EMPNIT, CODDOC, CORRELATIVO, FECHA, HORA, MINUTO,
               ENTREGADO_A, USUARIO, DETALLE, TOTALUNIDADES, FECHA_REG
        FROM dbo.DOCUMENTOS_ENTREGAS
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    const row = resEnt.recordset?.[0];
    if (!row) return res.status(404).json({ error: 'Entrega no encontrada' });
    const header = await loadDocHeader(pool, empnit, row.CODDOC, row.CORRELATIVO);
    res.json({
      entrega: mapEntregaRow(row),
      header: header ? mapHeaderRow(header) : null,
    });
  } catch (err) {
    console.warn('[API GET /pendientes-entrega/entregas/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Nueva entrega parcial: incrementa ENTREGADOS_* en DOCPRODUCTOS y registra DOCUMENTOS_ENTREGAS.
 */
router.post('/:coddoc/:correlativo/entregas', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const coddoc = String(req.params.coddoc || '').trim();
  const correlativo = Number(req.params.correlativo);
  if (!coddoc || !Number.isFinite(correlativo)) {
    return res.status(400).json({ error: 'Documento inválido' });
  }

  const entregadoA = String(req.body?.entregadoA ?? req.body?.ENTREGADO_A ?? '').trim();
  if (!entregadoA) {
    return res.status(400).json({ error: 'Indique a quién se entrega' });
  }
  if (entregadoA.length > 255) {
    return res.status(400).json({ error: 'El nombre de quien recibe es demasiado largo' });
  }

  const lineasIn = Array.isArray(req.body?.lineas) ? req.body.lineas : [];
  if (!lineasIn.length) {
    return res.status(400).json({ error: 'Seleccione al menos un producto a entregar' });
  }

  const usuario = String(
    req.body?.usuario || req.body?.USUARIO || req.headers['x-usuario'] || 'ENTREGA'
  ).trim();

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSchema(pool);

    const header = await loadDocHeader(pool, empnit, coddoc, correlativo);
    if (!header) return res.status(404).json({ error: 'Documento no encontrado' });
    if (String(header.STATUS || '').trim().toUpperCase() === STATUS_ANULADO) {
      return res.status(409).json({ error: 'El documento está anulado' });
    }
    if (Number(header.TIPOM) === 0) {
      return res.status(400).json({ error: 'Documento sin movimiento de inventario' });
    }

    const linesDb = await loadDocLines(pool, empnit, coddoc, correlativo);
    const byId = new Map(linesDb.filter((l) => l.ID != null).map((l) => [l.ID, l]));

    const detalle = [];
    let totalUndEntrega = 0;

    for (const raw of lineasIn) {
      const id = Number(raw.id ?? raw.ID);
      const qty = roundQty(raw.totalUnidades ?? raw.TOTALUNIDADES ?? raw.cantidad ?? raw.CANTIDAD);
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!(qty > 0.00005)) continue;
      const ln = byId.get(id);
      if (!ln) {
        return res.status(400).json({ error: `Línea ${id} no pertenece al documento` });
      }
      if (qty > ln.PENDIENTE + 0.00005) {
        return res.status(400).json({
          error: `Cantidad excede el pendiente de ${ln.CODPROD || 'producto'} (máx. ${ln.PENDIENTE})`,
        });
      }
      const ratio = ln.TOTALUNIDADES > 0 ? qty / ln.TOTALUNIDADES : 0;
      const deltaPrecio = roundMoney(ln.TOTALPRECIO * ratio);
      const deltaCosto = roundMoney(ln.TOTALCOSTO * ratio);
      detalle.push({
        ID: ln.ID,
        CODPROD: ln.CODPROD,
        DESPROD: ln.DESPROD,
        CODMEDIDA: ln.CODMEDIDA,
        TOTALUNIDADES: qty,
        PRECIO: ln.PRECIO,
        TOTALPRECIO: deltaPrecio,
        TOTALCOSTO: deltaCosto,
        TIPOPROD: ln.TIPOPROD,
        TIPOM: ln.TIPOM,
      });
      totalUndEntrega = roundQty(totalUndEntrega + qty);
    }

    if (!detalle.length) {
      return res.status(400).json({ error: 'Indique cantidades pendientes mayores a cero' });
    }

    const parts = nowParts();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      for (const d of detalle) {
        const upd = await new sql.Request(transaction)
          .input('EMPNIT', sql.VarChar, empnit)
          .input('CODDOC', sql.VarChar, coddoc)
          .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
          .input('ID', sql.Int, d.ID)
          .input('QTY', sql.Float, d.TOTALUNIDADES)
          .input('PRECIO', sql.Decimal(18, 3), d.TOTALPRECIO)
          .input('COSTO', sql.Decimal(18, 3), d.TOTALCOSTO)
          .query(`
            UPDATE dbo.DOCPRODUCTOS
            SET ENTREGADOS_TOTALUNIDADES = ISNULL(ENTREGADOS_TOTALUNIDADES, 0) + @QTY,
                ENTREGADOS_TOTALPRECIO = ISNULL(ENTREGADOS_TOTALPRECIO, 0) + @PRECIO,
                ENTREGADOS_TOTALCOSTO = ISNULL(ENTREGADOS_TOTALCOSTO, 0) + @COSTO,
                LASTUPDATE = CAST(GETDATE() AS DATE)
            WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO AND ID = @ID
              AND (ISNULL(TOTALUNIDADES, 0) - ISNULL(ENTREGADOS_TOTALUNIDADES, 0)) + 0.00005 >= @QTY
          `);
        if (!(upd.rowsAffected?.[0] > 0)) {
          throw Object.assign(new Error(`No se pudo actualizar entregados de ${d.CODPROD}`), {
            statusCode: 409,
          });
        }
        await aplicarDeltaFisicoEntrega(transaction, {
          empnit,
          coddoc,
          correlativo,
          codprod: d.CODPROD,
          desprod: d.DESPROD,
          totalUnidades: d.TOTALUNIDADES,
          tipom: d.TIPOM != null ? d.TIPOM : header.TIPOM,
          tipoprod: d.TIPOPROD,
        });
      }

      const ins = await new sql.Request(transaction)
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODDOC', sql.VarChar, coddoc)
        .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
        .input('FECHA', sql.Date, parts.fecha)
        .input('HORA', sql.Int, parts.hora)
        .input('MINUTO', sql.Int, parts.minuto)
        .input('ENTREGADO_A', sql.VarChar, entregadoA)
        .input('USUARIO', sql.VarChar, usuario.slice(0, 100))
        .input('DETALLE', sql.NVarChar(sql.MAX), JSON.stringify(detalle))
        .input('TOTALUNIDADES', sql.Decimal(18, 4), totalUndEntrega)
        .query(`
          INSERT INTO dbo.DOCUMENTOS_ENTREGAS
            (EMPNIT, CODDOC, CORRELATIVO, FECHA, HORA, MINUTO, ENTREGADO_A, USUARIO, DETALLE, TOTALUNIDADES)
          OUTPUT INSERTED.ID
          VALUES
            (@EMPNIT, @CODDOC, @CORRELATIVO, @FECHA, @HORA, @MINUTO, @ENTREGADO_A, @USUARIO, @DETALLE, @TOTALUNIDADES)
        `);
      const entregaId = Number(ins.recordset?.[0]?.ID);

      const sinPendiente = await documentoSinPendiente(transaction, empnit, coddoc, correlativo);
      if (sinPendiente) {
        await setDocumentoEntregadoFlag(transaction, empnit, coddoc, correlativo, 1);
      }

      await transaction.commit();

      const [lines, entregas, headerFresh] = await Promise.all([
        loadDocLines(pool, empnit, coddoc, correlativo),
        loadEntregas(pool, empnit, coddoc, correlativo),
        loadDocHeader(pool, empnit, coddoc, correlativo),
      ]);

      res.status(201).json({
        ok: true,
        ID: entregaId,
        completado: sinPendiente,
        header: headerFresh ? mapHeaderRow(headerFresh) : mapHeaderRow(header),
        lines,
        entregas,
      });
    } catch (inner) {
      try {
        await transaction.rollback();
      } catch (_) {
        /* ignore */
      }
      if (inner instanceof InventarioError) {
        return res.status(inner.statusCode).json({ error: inner.message, code: inner.code });
      }
      throw inner;
    }
  } catch (err) {
    if (err instanceof InventarioError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    console.warn('[API POST /pendientes-entrega/entregas]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/** Marca DOCUMENTOS.ENTREGADO = 1 sin crear registro de entrega. */
router.post('/:coddoc/:correlativo/completar', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const coddoc = String(req.params.coddoc || '').trim();
  const correlativo = Number(req.params.correlativo);
  if (!coddoc || !Number.isFinite(correlativo)) {
    return res.status(400).json({ error: 'Documento inválido' });
  }

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSchema(pool);
    const header = await loadDocHeader(pool, empnit, coddoc, correlativo);
    if (!header) return res.status(404).json({ error: 'Documento no encontrado' });
    if (String(header.STATUS || '').trim().toUpperCase() === STATUS_ANULADO) {
      return res.status(409).json({ error: 'El documento está anulado' });
    }

    await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .input('ENTREGADO', sql.Int, 1)
      .query(`
        UPDATE dbo.DOCUMENTOS
        SET ENTREGADO = @ENTREGADO
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      `);

    const headerFresh = await loadDocHeader(pool, empnit, coddoc, correlativo);
    res.json({ ok: true, header: mapHeaderRow(headerFresh) });
  } catch (err) {
    console.warn('[API POST /pendientes-entrega/completar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Elimina entrega y resta cantidades de DOCPRODUCTOS.ENTREGADOS_*. */
router.delete('/entregas/:id', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSchema(pool);

    const entRes = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, id)
      .query(`
        SELECT ID, CODDOC, CORRELATIVO, DETALLE
        FROM dbo.DOCUMENTOS_ENTREGAS
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    const ent = entRes.recordset?.[0];
    if (!ent) return res.status(404).json({ error: 'Entrega no encontrada' });

    const detalle = parseDetalleJson(ent.DETALLE);
    const coddoc = String(ent.CODDOC).trim();
    const correlativo = Number(ent.CORRELATIVO);
    const header = await loadDocHeader(pool, empnit, coddoc, correlativo);
    const headerTipom = header?.TIPOM;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      for (const d of detalle) {
        const lineId = Number(d.ID);
        const qty = roundQty(d.TOTALUNIDADES ?? d.CANTIDAD);
        const precio = roundMoney(d.TOTALPRECIO);
        const costo = roundMoney(d.TOTALCOSTO);
        if (!Number.isFinite(lineId) || !(qty > 0)) continue;
        await new sql.Request(transaction)
          .input('EMPNIT', sql.VarChar, empnit)
          .input('CODDOC', sql.VarChar, coddoc)
          .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
          .input('ID', sql.Int, lineId)
          .input('QTY', sql.Float, qty)
          .input('PRECIO', sql.Decimal(18, 3), precio)
          .input('COSTO', sql.Decimal(18, 3), costo)
          .query(`
            UPDATE dbo.DOCPRODUCTOS
            SET ENTREGADOS_TOTALUNIDADES = CASE
                  WHEN ISNULL(ENTREGADOS_TOTALUNIDADES, 0) - @QTY < 0 THEN 0
                  ELSE ISNULL(ENTREGADOS_TOTALUNIDADES, 0) - @QTY
                END,
                ENTREGADOS_TOTALPRECIO = CASE
                  WHEN ISNULL(ENTREGADOS_TOTALPRECIO, 0) - @PRECIO < 0 THEN 0
                  ELSE ISNULL(ENTREGADOS_TOTALPRECIO, 0) - @PRECIO
                END,
                ENTREGADOS_TOTALCOSTO = CASE
                  WHEN ISNULL(ENTREGADOS_TOTALCOSTO, 0) - @COSTO < 0 THEN 0
                  ELSE ISNULL(ENTREGADOS_TOTALCOSTO, 0) - @COSTO
                END,
                LASTUPDATE = CAST(GETDATE() AS DATE)
            WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO AND ID = @ID
          `);
        const tipomLine =
          d.TIPOM != null && d.TIPOM !== '' ? Number(d.TIPOM) : headerTipom;
        await aplicarDeltaFisicoEntrega(transaction, {
          empnit,
          coddoc,
          correlativo,
          codprod: String(d.CODPROD || '').trim(),
          desprod: String(d.DESPROD || '').trim(),
          totalUnidades: -qty,
          tipom: tipomLine,
          tipoprod: d.TIPOPROD,
        });
      }

      await new sql.Request(transaction)
        .input('EMPNIT', sql.VarChar, empnit)
        .input('ID', sql.Int, id)
        .query(`DELETE FROM dbo.DOCUMENTOS_ENTREGAS WHERE EMPNIT = @EMPNIT AND ID = @ID`);

      // Al revertir una entrega, la factura vuelve a pendiente si había marcado completada.
      await setDocumentoEntregadoFlag(transaction, empnit, coddoc, correlativo, 0);

      await transaction.commit();

      const [lines, entregas, headerFresh] = await Promise.all([
        loadDocLines(pool, empnit, coddoc, correlativo),
        loadEntregas(pool, empnit, coddoc, correlativo),
        loadDocHeader(pool, empnit, coddoc, correlativo),
      ]);

      res.json({
        ok: true,
        header: headerFresh ? mapHeaderRow(headerFresh) : null,
        lines,
        entregas,
      });
    } catch (inner) {
      try {
        await transaction.rollback();
      } catch (_) {
        /* ignore */
      }
      if (inner instanceof InventarioError) {
        return res.status(inner.statusCode).json({ error: inner.message, code: inner.code });
      }
      throw inner;
    }
  } catch (err) {
    if (err instanceof InventarioError) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    console.warn('[API DELETE /pendientes-entrega/entregas/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
