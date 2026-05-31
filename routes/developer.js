const express = require('express');
const sql = require('mssql');
const ExcelJS = require('exceljs');
const { isDbConfigured } = require('../config/database');

const router = express.Router();

const DEFAULT_LIMIT = 50;
const SEARCH_LIMIT = 500;

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

function parseMes(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 12) return null;
  return n;
}

function parseAnio(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 2020 || n > 2027) return null;
  return n;
}

function parseConcre(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return null;
  if (s === 'CON' || s === 'CRE') return s;
  return null;
}

function parseCorrelativo(raw) {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

function parseListQuery(req) {
  const q = String(req.query.q || '').trim();
  let limit = DEFAULT_LIMIT;
  if (q) {
    const requested = parseInt(req.query.limit, 10);
    limit = Number.isNaN(requested)
      ? SEARCH_LIMIT
      : Math.min(Math.max(requested, 1), SEARCH_LIMIT);
  } else {
    const requested = parseInt(req.query.limit, 10);
    if (!Number.isNaN(requested)) {
      limit = Math.min(Math.max(requested, 1), SEARCH_LIMIT);
    }
  }
  return { q, limit };
}

function todayDateOnly() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parsePeriodAndFilters(req, res) {
  const empnit = requireEmpNit(req, res);
  if (!empnit) return null;

  const mes = parseMes(req.query.mes);
  const anio = parseAnio(req.query.anio);
  if (mes === null) {
    res.status(400).json({ error: 'MES inválido (1-12)' });
    return null;
  }
  if (anio === null) {
    res.status(400).json({ error: 'ANIO inválido (2020-2027)' });
    return null;
  }

  const concre = parseConcre(req.query.concre);
  if (req.query.concre && String(req.query.concre).trim() && concre === null) {
    res.status(400).json({ error: 'CONCRE debe ser CON o CRE' });
    return null;
  }

  const q = String(req.query.q || '').trim();
  return { empnit, mes, anio, concre, q };
}

const LIST_FROM = `
  FROM dbo.DOCUMENTOS d
  LEFT OUTER JOIN dbo.Empleados emp
    ON d.CODVEN = emp.CODEMPLEADO AND d.EMPNIT = emp.EMPNIT
  LEFT OUTER JOIN dbo.EMBARQUES e
    ON d.CODEMBARQUE = e.CODEMBARQUE AND d.EMPNIT = e.EMPNIT
  LEFT OUTER JOIN dbo.CLIENTES c
    ON d.EMPNIT = c.EMPNIT AND d.CODCLIENTE = c.CODCLIENTE
  LEFT OUTER JOIN dbo.TIPODOCUMENTOS t
    ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
`;

const LIST_SELECT = `
  d.CODEMBARQUE,
  ISNULL(emp.NOMEMPLEADO, '') AS VENDEDOR,
  e.FECHA AS FECHA_EMBARQUE,
  d.FECHA,
  d.CODDOC,
  d.CORRELATIVO,
  c.NEGOCIO,
  c.NOMBRECLIENTE,
  c.DIRCLIENTE,
  d.TOTALPRECIO,
  d.CONCRE
`;

const LIST_WHERE = `
  WHERE d.STATUS <> 'A'
    AND t.TIPODOC = 'FAC'
    AND d.EMPNIT = @EMPNIT
    AND d.MES = @MES
    AND d.ANIO = @ANIO
    AND (@concre IS NULL OR d.CONCRE = @concre)
    AND (
      @q IS NULL OR @q = ''
      OR CAST(d.CODEMBARQUE AS varchar(20)) LIKE @qLike
      OR CAST(d.CORRELATIVO AS varchar(30)) LIKE @qLike
      OR d.CODDOC LIKE @qLike
      OR c.NEGOCIO LIKE @qLike
      OR c.NOMBRECLIENTE LIKE @qLike
      OR c.DIRCLIENTE LIKE @qLike
      OR e.DESCRIPCION LIKE @qLike
      OR emp.NOMEMPLEADO LIKE @qLike
    )
`;

function bindListFilters(request, { empnit, mes, anio, q, concre }) {
  request.input('EMPNIT', sql.VarChar, empnit);
  request.input('MES', sql.Int, mes);
  request.input('ANIO', sql.Int, anio);
  request.input('q', sql.NVarChar, q || null);
  request.input('qLike', sql.NVarChar, q ? `%${q}%` : null);
  request.input('concre', sql.VarChar, concre);
}

function mapDocumentoRow(r) {
  const vendedor = r.VENDEDOR ?? r.vendedor ?? r.NOMEMPLEADO ?? r.nomempleado ?? '';
  return {
    CODEMBARQUE: r.CODEMBARQUE ?? null,
    VENDEDOR: String(vendedor).trim(),
    FECHA_EMBARQUE: r.FECHA_EMBARQUE ?? null,
    FECHA: r.FECHA ?? null,
    CODDOC: r.CODDOC ?? null,
    CORRELATIVO: r.CORRELATIVO ?? null,
    NEGOCIO: r.NEGOCIO ?? null,
    NOMBRECLIENTE: r.NOMBRECLIENTE ?? null,
    DIRCLIENTE: r.DIRCLIENTE ?? null,
    TOTALPRECIO: r.TOTALPRECIO ?? null,
    CONCRE: r.CONCRE ?? null,
  };
}

function formatNombreClienteExport(negocio, nombreCliente) {
  const neg = String(negocio ?? '').trim();
  const nom = String(nombreCliente ?? '').trim();
  if (neg && nom) return `${neg} - ${nom}`;
  return neg || nom || '';
}

function mapDocumentoExportRow(r) {
  const row = mapDocumentoRow(r);
  return {
    VENDEDOR: row.VENDEDOR,
    NOMBRE_CLIENTE: formatNombreClienteExport(row.NEGOCIO, row.NOMBRECLIENTE),
    DIRECCION: row.DIRCLIENTE ?? '',
    MONTO: row.TOTALPRECIO ?? null,
    FECHA_DOC: row.FECHA ?? null,
    FECHA_EMBARQUE: row.FECHA_EMBARQUE ?? null,
  };
}

router.get('/documentos-fac/export', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const filters = parsePeriodAndFilters(req, res);
  if (!filters) return;

  const { empnit, mes, anio, concre, q } = filters;

  try {
    const pool = await req.app.locals.getDbPool();
    const request = pool.request();
    bindListFilters(request, { empnit, mes, anio, q, concre });
    const result = await request.query(`
      SELECT ${LIST_SELECT}
      ${LIST_FROM}
      ${LIST_WHERE}
      ORDER BY d.FECHA DESC, d.CORRELATIVO DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Documentos FAC');
    sheet.columns = [
      { header: 'VENDEDOR', key: 'VENDEDOR', width: 22 },
      { header: 'NOMBRE CLIENTE', key: 'NOMBRE_CLIENTE', width: 36 },
      { header: 'DIRECCION', key: 'DIRECCION', width: 32 },
      { header: 'MONTO', key: 'MONTO', width: 14 },
      { header: 'FECHA DOC', key: 'FECHA_DOC', width: 14 },
      { header: 'FECHA EMBARQUE', key: 'FECHA_EMBARQUE', width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const raw of result.recordset) {
      const excelRow = mapDocumentoExportRow(raw);
      if (excelRow.FECHA_DOC) excelRow.FECHA_DOC = new Date(excelRow.FECHA_DOC);
      if (excelRow.FECHA_EMBARQUE) excelRow.FECHA_EMBARQUE = new Date(excelRow.FECHA_EMBARQUE);
      sheet.addRow(excelRow);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safeEmp = empnit.replace(/[^\w-]+/g, '_');
    const stamp = todayDateOnly();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="documentos_fac_${safeEmp}_${mes}_${anio}_${stamp}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.warn('[API GET /developer/documentos-fac/export]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/documentos-fac/concre', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const coddoc = String(req.body?.CODDOC ?? '').trim();
  const correlativo = parseCorrelativo(req.body?.CORRELATIVO);
  const concre = parseConcre(req.body?.CONCRE);

  if (!coddoc) {
    return res.status(400).json({ error: 'CODDOC es obligatorio' });
  }
  if (correlativo === null) {
    return res.status(400).json({ error: 'CORRELATIVO inválido' });
  }
  if (concre === null) {
    return res.status(400).json({ error: 'CONCRE debe ser CON o CRE' });
  }

  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Int, correlativo)
      .input('CONCRE', sql.VarChar, concre)
      .query(`
        UPDATE dbo.DOCUMENTOS
        SET CONCRE = @CONCRE
        WHERE EMPNIT = @EMPNIT
          AND CODDOC = @CODDOC
          AND CORRELATIVO = @CORRELATIVO
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    res.json({ ok: true, CODDOC: coddoc, CORRELATIVO: correlativo, CONCRE: concre });
  } catch (err) {
    console.warn('[API PATCH /developer/documentos-fac/concre]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/documentos-fac', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const filters = parsePeriodAndFilters(req, res);
  if (!filters) return;

  const { empnit, mes, anio, concre, q } = filters;
  const { limit } = parseListQuery(req);

  try {
    const pool = await req.app.locals.getDbPool();

    const countReq = pool.request();
    bindListFilters(countReq, { empnit, mes, anio, q, concre });
    const countResult = await countReq.query(`
      SELECT COUNT(*) AS total
      ${LIST_FROM}
      ${LIST_WHERE}
    `);
    const total = countResult.recordset[0].total;

    const listReq = pool.request();
    bindListFilters(listReq, { empnit, mes, anio, q, concre });
    listReq.input('limit', sql.Int, limit);
    const listResult = await listReq.query(`
      SELECT TOP (@limit) ${LIST_SELECT}
      ${LIST_FROM}
      ${LIST_WHERE}
      ORDER BY d.FECHA DESC, d.CORRELATIVO DESC
    `);

    const rows = listResult.recordset.map(mapDocumentoRow);

    res.json({
      rows,
      total,
      limit,
      truncated: total > rows.length,
      mes,
      anio,
      empnit,
      q: q || null,
      concre,
    });
  } catch (err) {
    console.warn('[API GET /developer/documentos-fac]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
