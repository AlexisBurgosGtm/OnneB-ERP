const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { createCatalogoRouter, requireEmpNit } = require('./lib/catalogo-empresa');
const { fechaIsoFromValue } = require('../lib/documento-fecha');

const SQL_TIPODOC_COMPRAS_IN = "'COM', 'COP'";

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function roundQty(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function parseMesAnio(req) {
  const now = new Date();
  let mes = parseInt(req.query.mes, 10);
  let anio = parseInt(req.query.anio, 10);
  if (!Number.isFinite(mes) || mes < 1 || mes > 12) mes = now.getMonth() + 1;
  if (!Number.isFinite(anio) || anio < 1990 || anio > 2100) anio = now.getFullYear();
  return { mes, anio };
}

const catalogoRouter = createCatalogoRouter({
  logName: 'proveedores',
  entityLabel: 'Proveedor',
  table: 'PROVEEDORES',
  orderBy: 'EMPRESA',
  idColumn: 'CODPROV',
  idType: 'int',
  idRouteParam: 'codprov',
  autoId: true,
  listColumns: ['CODPROV', 'NIT', 'EMPRESA', 'RAZONSOCIAL', 'TELEMPRESA', 'CONTACTO'],
  fields: [
    { name: 'EMPRESA', type: 'varchar', required: true },
    { name: 'RAZONSOCIAL', type: 'varchar' },
    { name: 'DIRECCION', type: 'varchar' },
    { name: 'TELEMPRESA', type: 'varchar' },
    { name: 'CONTACTO', type: 'varchar' },
    { name: 'TELCONTACTO', type: 'varchar' },
    { name: 'NIT', type: 'varchar' },
    { name: 'SALDO', type: 'float' },
  ],
  insertFields: ['NIT', 'EMPRESA', 'RAZONSOCIAL', 'DIRECCION', 'TELEMPRESA', 'CONTACTO', 'TELCONTACTO'],
  updateFields: ['NIT', 'EMPRESA', 'RAZONSOCIAL', 'DIRECCION', 'TELEMPRESA', 'CONTACTO', 'TELCONTACTO'],
});

const router = express.Router();
router.use(catalogoRouter);

router.get('/:codprov/historial-compras', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codprov = parseInt(req.params.codprov, 10);
  if (!Number.isFinite(codprov) || codprov <= 0) {
    return res.status(400).json({ error: 'Código de proveedor inválido' });
  }
  const { mes, anio } = parseMesAnio(req);
  try {
    const pool = await req.app.locals.getDbPool();
    const base = pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODPROV', sql.Int, codprov)
      .input('MES', sql.Int, mes)
      .input('ANIO', sql.Int, anio);

    const docsRes = await base.query(`
      SELECT
        d.CODDOC,
        d.CORRELATIVO,
        d.FECHA,
        d.HORA,
        d.MINUTO,
        ISNULL(d.TOTALCOSTO, 0) AS TOTALCOSTO,
        ISNULL(d.STATUS, '') AS STATUS,
        t.TIPODOC,
        t.DESDOC
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND d.CODCLIENTE = @CODPROV
        AND t.TIPODOC IN (${SQL_TIPODOC_COMPRAS_IN})
        AND d.ANIO = @ANIO
        AND d.MES = @MES
      ORDER BY d.FECHA DESC, d.HORA DESC, d.MINUTO DESC, d.CORRELATIVO DESC
    `);

    const linesRes = await base.query(`
      SELECT
        d.CODDOC,
        d.CORRELATIVO,
        d.FECHA,
        LTRIM(RTRIM(dp.CODPROD)) AS CODPROD,
        LTRIM(RTRIM(ISNULL(dp.DESPROD, ''))) AS DESPROD,
        LTRIM(RTRIM(ISNULL(dp.CODMEDIDA, ''))) AS CODMEDIDA,
        ISNULL(dp.CANTIDAD, 0) AS CANTIDAD,
        ISNULL(dp.COSTO, 0) AS COSTO,
        ISNULL(dp.TOTALCOSTO, 0) AS TOTALCOSTO,
        t.TIPODOC
      FROM dbo.DOCPRODUCTOS dp
      INNER JOIN dbo.DOCUMENTOS d
        ON dp.EMPNIT = d.EMPNIT AND dp.CODDOC = d.CODDOC AND dp.CORRELATIVO = d.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND d.CODCLIENTE = @CODPROV
        AND t.TIPODOC IN (${SQL_TIPODOC_COMPRAS_IN})
        AND d.ANIO = @ANIO
        AND d.MES = @MES
      ORDER BY d.FECHA DESC, d.CODDOC, d.CORRELATIVO, dp.Id
    `);

    const documentos = (docsRes.recordset || []).map((r) => ({
      CODDOC: r.CODDOC,
      CORRELATIVO: r.CORRELATIVO,
      FECHA: fechaIsoFromValue(r.FECHA) || null,
      HORA: r.HORA ?? null,
      MINUTO: r.MINUTO ?? null,
      TOTALCOSTO: roundMoney(r.TOTALCOSTO),
      STATUS: String(r.STATUS || '').trim(),
      TIPODOC: String(r.TIPODOC || '').trim(),
      DESDOC: r.DESDOC || '',
    }));

    const productos = (linesRes.recordset || []).map((r) => ({
      CODDOC: r.CODDOC,
      CORRELATIVO: r.CORRELATIVO,
      FECHA: fechaIsoFromValue(r.FECHA) || null,
      CODPROD: r.CODPROD,
      DESPROD: r.DESPROD,
      CODMEDIDA: r.CODMEDIDA,
      CANTIDAD: roundQty(r.CANTIDAD),
      COSTO: roundMoney(r.COSTO),
      TOTALCOSTO: roundMoney(r.TOTALCOSTO),
      TIPODOC: String(r.TIPODOC || '').trim(),
    }));

    res.json({ mes, anio, documentos, productos });
  } catch (err) {
    console.warn('[API GET /proveedores/historial-compras]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;