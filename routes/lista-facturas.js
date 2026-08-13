const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { assertAdminPass, assertEliminacionRegistro } = require('../lib/config-auth');
const {
  STATUS_OPERADO,
  STATUS_BLOQUEADO,
  STATUS_ANULADO,
  normalizeStatus,
} = require('../lib/documento-status');
const {
  parseFechaInput,
  nowParts,
  bindDocumentoFechaDiaParams,
  sqlDocumentoFechaDiaWhere,
  normalizeDocumentoRows,
} = require('../lib/documento-fecha');

const router = express.Router();

const TIPODOCS_FACTURA = ['FAC', 'FEF', 'FEC', 'FES'];
const TIPODOCS_RECIBO = ['RCC', 'PRC'];

function tipodocsForKind(kind) {
  return String(kind || '').trim().toLowerCase() === 'recibos' ? TIPODOCS_RECIBO : TIPODOCS_FACTURA;
}

function tipodocSqlIn(tipodocs) {
  return tipodocs.map((t) => `'${t}'`).join(', ');
}

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
  return Number.isFinite(n) ? n : null;
}

/** Lista facturas FAC/FEF/FEC/FES o recibos RCC/PRC por día (fecha por defecto = hoy). */
router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  let fechaParts = parseFechaInput(req.query.fecha);
  if (!fechaParts) {
    const now = nowParts();
    fechaParts = { anio: now.anio, mes: now.mes, dia: now.dia, fecha: now.fecha };
  }
  const q = String(req.query.q || '').trim();
  const qLike = q ? `%${q}%` : null;
  const kind = String(req.query.kind || 'facturas').trim().toLowerCase() === 'recibos' ? 'recibos' : 'facturas';
  const tipodocs = tipodocsForKind(kind);
  const tipodocSql = tipodocSqlIn(tipodocs);

  try {
    const pool = await req.app.locals.getDbPool();
    const request = bindDocumentoFechaDiaParams(
      pool.request().input('EMPNIT', sql.VarChar, empnit).input('q', sql.NVarChar, q || null).input('qLike', sql.NVarChar, qLike),
      sql,
      fechaParts
    );
    const result = await request.query(`
      SELECT
        d.CODDOC,
        d.CORRELATIVO,
        t.TIPODOC,
        t.DESDOC,
        d.FECHA,
        d.HORA,
        d.MINUTO,
        d.STATUS,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_NIT)), ''), ISNULL(c.NIT, '')) AS NIT,
        d.DOC_NOMCLIE,
        d.DOC_DIRCLIE,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        d.FEL_SERIE,
        d.FEL_NUMERO,
        d.FEL_UUDI
      FROM dbo.DOCUMENTOS d
      JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      LEFT JOIN dbo.CLIENTES c ON c.EMPNIT = d.EMPNIT AND c.CODCLIENTE = d.CODCLIENTE
      WHERE d.EMPNIT = @EMPNIT
        AND t.TIPODOC IN (${tipodocSql})
        AND ${sqlDocumentoFechaDiaWhere('d')}
        AND (
          @q IS NULL OR @q = ''
          OR d.CODDOC LIKE @qLike
          OR CAST(d.CORRELATIVO AS VARCHAR(30)) LIKE @qLike
          OR d.DOC_NOMCLIE LIKE @qLike
          OR d.DOC_NIT LIKE @qLike
          OR c.NIT LIKE @qLike
          OR d.DOC_DIRCLIE LIKE @qLike
          OR d.FEL_SERIE LIKE @qLike
          OR d.FEL_NUMERO LIKE @qLike
          OR d.FEL_UUDI LIKE @qLike
          OR d.STATUS LIKE @qLike
        )
      ORDER BY d.HORA DESC, d.MINUTO DESC, d.ID DESC
    `);

    const fecha = `${fechaParts.anio}-${String(fechaParts.mes).padStart(2, '0')}-${String(fechaParts.dia).padStart(2, '0')}`;
    res.json({
      rows: normalizeDocumentoRows(result.recordset),
      fecha,
      kind,
      tipodocs,
      empnit,
      q: q || null,
    });
  } catch (err) {
    console.warn('[API GET /lista-facturas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Anulación local de FAC (STATUS = A). Requiere clave admin. */
router.post('/:coddoc/:correlativo/anular-local', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const coddoc = String(req.params.coddoc || '').trim();
  const correlativo = parseCorrelativo(req.params.correlativo);
  if (!coddoc || correlativo === null) {
    return res.status(400).json({ error: 'Documento inválido' });
  }

  const pass = String(req.body?.pass ?? req.body?.adminPass ?? req.body?.PASS ?? '');
  const motivo = String(req.body?.motivo ?? req.body?.MOTIVO ?? '').trim();

  try {
    const pool = await req.app.locals.getDbPool();
    await assertEliminacionRegistro(pool, pass);

    const meta = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .query(`
        SELECT d.STATUS, t.TIPODOC, d.FEL_UUDI
        FROM dbo.DOCUMENTOS d
        JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
        WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
      `);
    if (!meta.recordset.length) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    const row = meta.recordset[0];
    const tipodoc = String(row.TIPODOC || '').trim().toUpperCase();
    if (tipodoc !== 'FAC') {
      return res.status(400).json({
        error: 'La anulación local solo aplica a facturas FAC. Use anulación FEL para documentos electrónicos.',
      });
    }
    if (String(row.FEL_UUDI || '').trim()) {
      return res.status(400).json({ error: 'El documento tiene UUID FEL; use anulación ante SAT' });
    }
    const status = normalizeStatus(row.STATUS);
    if (status === STATUS_ANULADO) {
      return res.status(409).json({ error: 'El documento ya está anulado' });
    }
    if (status !== STATUS_OPERADO && status !== STATUS_BLOQUEADO) {
      return res.status(400).json({ error: 'Estado del documento no permite anulación' });
    }

    const obsExtra = motivo ? ` | Anulado: ${motivo}` : '';
    await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .input('STATUS', sql.VarChar, STATUS_ANULADO)
      .input('OBS_EXTRA', sql.VarChar, obsExtra)
      .query(`
        UPDATE dbo.DOCUMENTOS
        SET STATUS = @STATUS,
            OBS = LEFT(CONCAT(ISNULL(OBS, ''), @OBS_EXTRA), 255)
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
          AND UPPER(LTRIM(RTRIM(ISNULL(STATUS, '')))) IN ('${STATUS_OPERADO}', '${STATUS_BLOQUEADO}')
      `);

    res.json({ ok: true, CODDOC: coddoc, CORRELATIVO: correlativo, STATUS: STATUS_ANULADO });
  } catch (err) {
    console.warn('[API POST /lista-facturas/anular-local]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
