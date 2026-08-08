const express = require('express');
const sql = require('mssql');
const ExcelJS = require('exceljs');
const { isDbConfigured } = require('../config/database');
const { parseFechaInput, nowParts, fechaIsoFromValue } = require('../lib/documento-fecha');
const { excelDateCellValue, EXCEL_DATE_NUMFMT } = require('../lib/excel-export');

const router = express.Router();

/** Grupos de tipodoc para el cuadre de caja. */
const CUADRE_TIPOS = {
  FAC: {
    label: 'FAC - ENVIOS/FACTURAS NO FISCALES',
    tipodocs: ['FAC'],
  },
  FEL: {
    label: 'FEL - FACTURAS ELECTRONICAS',
    tipodocs: ['FEF', 'FEC', 'FES'],
  },
  DEV: {
    label: 'DEV - DEVOLUCIONES NO FISCALES',
    tipodocs: ['DEV'],
  },
  FNC: {
    label: 'FNC - NOTAS DE CREDITO FEL',
    tipodocs: ['FNC'],
  },
  VALES_CAJA: {
    label: 'VALES DE CAJA',
    tipodocs: ['VALES_CAJA'],
    source: 'vales_caja',
  },
};

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

function parseCodcaja(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveTipoGrupo(raw) {
  const key = String(raw || 'FAC').trim().toUpperCase();
  return CUADRE_TIPOS[key] ? key : null;
}

function resolveRangoFechas(desdeRaw, hastaRaw) {
  const now = nowParts();
  let desde = parseFechaInput(desdeRaw);
  let hasta = parseFechaInput(hastaRaw);
  if (!desde) desde = { anio: now.anio, mes: now.mes, dia: now.dia, fecha: now.fecha };
  if (!hasta) hasta = { ...desde };
  if (desde.fecha > hasta.fecha) {
    const tmp = desde;
    desde = hasta;
    hasta = tmp;
  }
  return { desde, hasta };
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function mapCuadreRow(row) {
  const status = String(row.STATUS || '').trim().toUpperCase();
  const concre = String(row.CONCRE || 'CON').trim().toUpperCase();
  const anulado = status === 'A';
  const esCredito = concre === 'CRE';
  const total = roundMoney(row.TOTALPRECIO);

  let efectivo = 0;
  let deposito = 0;
  let tarjeta = 0;
  let cheque = 0;
  let credito = 0;

  if (!anulado) {
    if (esCredito) {
      credito = total;
    } else {
      efectivo = roundMoney(row.FPAGO_EFECTIVO);
      deposito = roundMoney(row.FPAGO_DEPOSITO);
      tarjeta = roundMoney(row.FPAGO_TARJETA);
      cheque = roundMoney(row.FPAGO_CHEQUE);
      const sumaFp = roundMoney(efectivo + deposito + tarjeta + cheque);
      // Contado sin formas de pago cargadas: asignar TOTALPRECIO a efectivo.
      if (sumaFp === 0 && total !== 0) {
        efectivo = total;
      }
    }
  }

  const felSerie = String(row.FEL_SERIE || '').trim();
  const felNumero = String(row.FEL_NUMERO || '').trim();
  const sat =
    felSerie || felNumero
      ? [felSerie, felNumero].filter(Boolean).join(' - ')
      : '';

  return {
    FECHA: fechaIsoFromValue(row.FECHA) || null,
    CODDOC: row.CODDOC,
    CORRELATIVO: row.CORRELATIVO,
    DOCUMENTO: `${String(row.CODDOC || '').trim()}-${row.CORRELATIVO}`,
    TIPODOC: row.TIPODOC,
    CODCAJA: row.CODCAJA ?? null,
    SAT: sat,
    STATUS: status || '—',
    CONCRE: concre,
    EFECTIVO: efectivo,
    DEPOSITO: deposito,
    TARJETA: tarjeta,
    CHEQUE: cheque,
    CREDITO: credito,
    NIT: String(row.NIT || '').trim(),
    DOC_NOMCLIE: String(row.DOC_NOMCLIE || '').trim(),
  };
}

function mapCuadreValeCajaRow(row) {
  const importe = roundMoney(Math.abs(Number(row.IMPORTE) || 0));
  const recibe = String(row.RECIBE || '').trim();
  const tipo = String(row.TIPO || '').trim();
  const desc = String(row.DESCRIPCION || '').trim();
  const cliente = [recibe, tipo, desc].filter(Boolean).join(' · ') || 'Vale de caja';
  return {
    FECHA: fechaIsoFromValue(row.FECHA) || null,
    CODDOC: 'VC',
    CORRELATIVO: row.NOVALE,
    DOCUMENTO: `VC-${row.NOVALE}`,
    TIPODOC: 'VALES_CAJA',
    CODCAJA: row.CODCAJA ?? null,
    SAT: tipo || '',
    STATUS: 'O',
    CONCRE: 'CON',
    EFECTIVO: importe,
    DEPOSITO: 0,
    TARJETA: 0,
    CHEQUE: 0,
    CREDITO: 0,
    NIT: '',
    DOC_NOMCLIE: cliente,
  };
}

async function queryCuadreValesCajaRows(pool, { empnit, desde, hasta, codcaja }) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('DESDE', sql.Date, desde.fecha)
    .input('HASTA', sql.Date, hasta.fecha)
    .input('CODCAJA', sql.Int, codcaja)
    .query(`
      SELECT
        v.NOVALE,
        v.FECHA,
        v.CODCAJA,
        ISNULL(v.TIPO, '') AS TIPO,
        ISNULL(v.DESCRIPCION, '') AS DESCRIPCION,
        ISNULL(v.RECIBE, '') AS RECIBE,
        ISNULL(v.IMPORTE, 0) AS IMPORTE
      FROM dbo.DOCUMENTOS_VALES_CAJA v
      WHERE v.EMPNIT = @EMPNIT
        AND TRY_CONVERT(INT, v.CODCAJA) = @CODCAJA
        AND CAST(v.FECHA AS DATE) >= @DESDE
        AND CAST(v.FECHA AS DATE) <= @HASTA
      ORDER BY v.FECHA ASC, v.NOVALE ASC
    `);
  return (result.recordset || []).map(mapCuadreValeCajaRow);
}

async function queryCuadreRows(pool, { empnit, desde, hasta, tipoKey, codcaja }) {
  const grupo = CUADRE_TIPOS[tipoKey];
  if (grupo.source === 'vales_caja') {
    return queryCuadreValesCajaRows(pool, { empnit, desde, hasta, codcaja });
  }
  const tipodocIn = grupo.tipodocs.map((t) => `'${t}'`).join(', ');
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('DESDE', sql.Date, desde.fecha)
    .input('HASTA', sql.Date, hasta.fecha)
    .input('CODCAJA', sql.Int, codcaja)
    .query(`
      SELECT
        d.FECHA,
        d.CODDOC,
        d.CORRELATIVO,
        d.CODCAJA,
        t.TIPODOC,
        d.STATUS,
        ISNULL(d.CONCRE, 'CON') AS CONCRE,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(d.FPAGO_EFECTIVO, 0) AS FPAGO_EFECTIVO,
        ISNULL(d.FPAGO_DEPOSITO, 0) AS FPAGO_DEPOSITO,
        ISNULL(d.FPAGO_TARJETA, 0) AS FPAGO_TARJETA,
        ISNULL(d.FPAGO_CHEQUE, 0) AS FPAGO_CHEQUE,
        d.FEL_SERIE,
        d.FEL_NUMERO,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_NIT)), ''), ISNULL(c.NIT, '')) AS NIT,
        ISNULL(d.DOC_NOMCLIE, '') AS DOC_NOMCLIE
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      LEFT JOIN dbo.CLIENTES c
        ON c.EMPNIT = d.EMPNIT AND c.CODCLIENTE = d.CODCLIENTE
      WHERE d.EMPNIT = @EMPNIT
        AND d.CODCAJA IS NOT NULL
        AND TRY_CONVERT(INT, d.CODCAJA) = @CODCAJA
        AND CAST(d.FECHA AS DATE) >= @DESDE
        AND CAST(d.FECHA AS DATE) <= @HASTA
        AND t.TIPODOC IN (${tipodocIn})
      ORDER BY d.FECHA ASC, d.CODDOC ASC, d.CORRELATIVO ASC
    `);
  return (result.recordset || []).map(mapCuadreRow);
}

router.get('/tipos', (_req, res) => {
  res.json({
    tipos: Object.entries(CUADRE_TIPOS).map(([value, meta]) => ({
      value,
      label: meta.label,
      tipodocs: meta.tipodocs,
    })),
  });
});

router.get('/cajas', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
      SELECT CODCAJA, ISNULL(DESCAJA, '') AS DESCAJA, ISNULL(STATUS, 0) AS STATUS
      FROM dbo.Cajas
      WHERE EMPNIT = @EMPNIT
      ORDER BY DESCAJA ASC, CODCAJA ASC
    `);
    res.json({ rows: result.recordset || [] });
  } catch (err) {
    console.warn('[API GET /cuadre-caja/cajas]', err.message);
    res.status(500).json({ error: err.message || 'Error al cargar cajas' });
  }
});

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const tipoKey = resolveTipoGrupo(req.query.tipo);
  if (!tipoKey) {
    return res.status(400).json({ error: 'Tipo de documento inválido (FAC, FEL, DEV, FNC, VALES_CAJA)' });
  }
  const codcaja = parseCodcaja(req.query.codcaja);
  if (!codcaja) {
    return res.status(400).json({ error: 'CODCAJA requerido' });
  }
  const { desde, hasta } = resolveRangoFechas(req.query.desde, req.query.hasta);

  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await queryCuadreRows(pool, { empnit, desde, hasta, tipoKey, codcaja });
    res.json({
      rows,
      total: rows.length,
      tipo: tipoKey,
      tipodocs: CUADRE_TIPOS[tipoKey].tipodocs,
      codcaja,
      desde: desde.fecha,
      hasta: hasta.fecha,
    });
  } catch (err) {
    console.warn('[API GET /cuadre-caja]', err.message);
    res.status(500).json({ error: err.message || 'Error al cargar cuadre de caja' });
  }
});

router.get('/export', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const tipoKey = resolveTipoGrupo(req.query.tipo);
  if (!tipoKey) {
    return res.status(400).json({ error: 'Tipo de documento inválido (FAC, FEL, DEV, FNC, VALES_CAJA)' });
  }
  const codcaja = parseCodcaja(req.query.codcaja);
  if (!codcaja) {
    return res.status(400).json({ error: 'CODCAJA requerido' });
  }
  const { desde, hasta } = resolveRangoFechas(req.query.desde, req.query.hasta);

  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await queryCuadreRows(pool, { empnit, desde, hasta, tipoKey, codcaja });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cuadre de caja');
    sheet.columns = [
      { header: 'FECHA', key: 'FECHA', width: 12 },
      { header: 'DOCUMENTO', key: 'DOCUMENTO', width: 16 },
      { header: 'SAT', key: 'SAT', width: 22 },
      { header: 'STATUS', key: 'STATUS', width: 10 },
      { header: 'EFECTIVO', key: 'EFECTIVO', width: 12 },
      { header: 'DEPOSITO', key: 'DEPOSITO', width: 12 },
      { header: 'TARJETA', key: 'TARJETA', width: 12 },
      { header: 'CHEQUE', key: 'CHEQUE', width: 12 },
      { header: 'CREDITO', key: 'CREDITO', width: 12 },
      { header: 'NIT', key: 'NIT', width: 14 },
      { header: 'NOMBRE CLIENTE', key: 'DOC_NOMCLIE', width: 36 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const r of rows) {
      sheet.addRow({
        FECHA: excelDateCellValue(r.FECHA),
        DOCUMENTO: r.DOCUMENTO,
        SAT: r.SAT || '',
        STATUS: r.STATUS,
        EFECTIVO: r.EFECTIVO,
        DEPOSITO: r.DEPOSITO,
        TARJETA: r.TARJETA,
        CHEQUE: r.CHEQUE,
        CREDITO: r.CREDITO,
        NIT: r.NIT,
        DOC_NOMCLIE: r.DOC_NOMCLIE,
      });
    }

    sheet.getColumn('FECHA').numFmt = EXCEL_DATE_NUMFMT;
    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const cell = sheet.getRow(r).getCell('FECHA');
      if (cell.value instanceof Date) cell.numFmt = EXCEL_DATE_NUMFMT;
    }
    for (const col of ['EFECTIVO', 'DEPOSITO', 'TARJETA', 'CHEQUE', 'CREDITO']) {
      sheet.getColumn(col).numFmt = '#,##0.00';
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safeEmp = empnit.replace(/[^\w-]+/g, '_');
    const stamp = `${desde.fecha}_${hasta.fecha}`.replace(/-/g, '');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cuadre_caja_${tipoKey}_caja${codcaja}_${safeEmp}_${stamp}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.warn('[API GET /cuadre-caja/export]', err.message);
    res.status(500).json({ error: err.message || 'Error al exportar' });
  }
});

module.exports = router;
