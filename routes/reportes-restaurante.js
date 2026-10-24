const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { parseFechaInput, normalizeDocumentoRows } = require('../lib/documento-fecha');
const { STATUS_ANULADO } = require('../lib/documento-status');
const { ensureDocumentosMesaRestauranteColumn } = require('../lib/documentos-mesa-restaurante');
const {
  TIPODOC_COMANDA,
  SQL_SIGNO_DOC_IMPORTE,
  sqlRestaurantSalesWhere,
  sqlClienteKeyExpr,
  sqlVentasRestauranteCte,
} = require('../lib/reportes-restaurante');

const router = express.Router();

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

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function roundQty(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function resolveRango(req) {
  const ahora = new Date();
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  const hoy = `${y}-${m}-${d}`;

  let desde = parseFechaInput(req.query.desde ?? req.body?.desde);
  let hasta = parseFechaInput(req.query.hasta ?? req.body?.hasta);
  if (!desde) desde = { fecha: hoy };
  if (!hasta) hasta = { fecha: hoy };
  if (desde.fecha > hasta.fecha) {
    const tmp = desde;
    desde = hasta;
    hasta = tmp;
  }
  return { desde: desde.fecha, hasta: hasta.fecha };
}

function parseMesaId(req) {
  const raw = req.query.mesaId ?? req.query.mesa ?? req.query.id;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const { desde, hasta } = resolveRango(req);
  const salesWhere = sqlRestaurantSalesWhere('d', 't');
  const clienteKey = sqlClienteKeyExpr('d');
  const ventasCte = sqlVentasRestauranteCte();

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureDocumentosMesaRestauranteColumn(pool);

    const base = pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('DESDE', sql.Date, desde)
      .input('HASTA', sql.Date, hasta);

    const [comandasRes, ventasRes, clientesRes, mesasResClean, serieRes, utilidadRes] = await Promise.all([
      base.query(`
        SELECT
          COUNT(*) AS COMANDAS,
          SUM(ISNULL(d.TOTALPRECIO, 0)) AS TOTAL_COMANDAS
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT
          AND CAST(d.FECHA AS DATE) BETWEEN @DESDE AND @HASTA
          AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
          AND t.TIPODOC = '${TIPODOC_COMANDA}'
      `),
      base.query(`
        SELECT
          COUNT(*) AS NUM_FACTURAS,
          SUM(${SQL_SIGNO_DOC_IMPORTE}) AS VENTAS_NETAS
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE ${salesWhere}
      `),
      base.query(`
        SELECT COUNT(DISTINCT ${clienteKey}) AS CLIENTES
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE ${salesWhere}
      `),
      base.query(`
        WITH ${ventasCte}
        SELECT
          agg.MESA_ID,
          m.CODMESA,
          m.DESMESA,
          agg.NUM_FACTURAS,
          agg.VENTAS_NETAS,
          agg.CLIENTES
        FROM (
          SELECT
            MESA_ID,
            COUNT(ID) AS NUM_FACTURAS,
            SUM(SIGNO_IMPORTE) AS VENTAS_NETAS,
            COUNT(DISTINCT CLIENTE_KEY) AS CLIENTES
          FROM VentasRest
          WHERE MESA_ID IS NOT NULL
          GROUP BY MESA_ID
        ) agg
        INNER JOIN dbo.RESTAURANTE_MESAS m ON m.EMPNIT = @EMPNIT AND m.ID = agg.MESA_ID
        ORDER BY agg.VENTAS_NETAS DESC, m.CODMESA, m.DESMESA
      `),
      base.query(`
        SELECT
          CAST(d.FECHA AS DATE) AS FECHA,
          COUNT(*) AS NUM_FACTURAS,
          SUM(${SQL_SIGNO_DOC_IMPORTE}) AS VENTAS_NETAS
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE ${salesWhere}
        GROUP BY CAST(d.FECHA AS DATE)
        ORDER BY CAST(d.FECHA AS DATE)
      `),
      base.query(`
        WITH ${ventasCte}
        SELECT
          SUM(ISNULL(dp.TOTALCOSTO, 0)) AS TOTALCOSTO,
          SUM(ISNULL(dp.TOTALPRECIO, 0)) AS TOTALPRECIO
        FROM VentasRest v
        INNER JOIN dbo.DOCPRODUCTOS dp
          ON dp.EMPNIT = @EMPNIT
          AND dp.CODDOC = v.CODDOC
          AND dp.CORRELATIVO = v.CORRELATIVO
      `),
    ]);

    const comRow = comandasRes.recordset[0] || {};
    const venRow = ventasRes.recordset[0] || {};
    const cliRow = clientesRes.recordset[0] || {};
    const numFacturas = Number(venRow.NUM_FACTURAS) || 0;
    const ventasNetas = roundMoney(venRow.VENTAS_NETAS);
    const ticketPromedio = numFacturas > 0 ? roundMoney(ventasNetas / numFacturas) : 0;
    const utilRow = utilidadRes.recordset[0] || {};
    const costoProd = roundMoney(utilRow.TOTALCOSTO);
    const precioProd = roundMoney(utilRow.TOTALPRECIO);
    const utilidad = roundMoney(precioProd - costoProd);
    const pctUtilidad = costoProd > 0 ? roundMoney((utilidad / costoProd) * 100) : 0;

    const mesas = (mesasResClean.recordset || []).map((r) => {
      const nf = Number(r.NUM_FACTURAS) || 0;
      const vn = roundMoney(r.VENTAS_NETAS);
      return {
        MESA_ID: r.MESA_ID,
        CODMESA: String(r.CODMESA || '').trim(),
        DESMESA: String(r.DESMESA || '').trim(),
        NUM_FACTURAS: nf,
        VENTAS_NETAS: vn,
        TICKET_PROMEDIO: nf > 0 ? roundMoney(vn / nf) : 0,
        CLIENTES: Number(r.CLIENTES) || 0,
      };
    });

    res.json({
      desde,
      hasta,
      resumen: {
        comandas: Number(comRow.COMANDAS) || 0,
        totalComandas: roundMoney(comRow.TOTAL_COMANDAS),
        facturas: numFacturas,
        ventasNetas,
        utilidad,
        pctUtilidad,
        ticketPromedio,
        clientesAtendidos: Number(cliRow.CLIENTES) || 0,
      },
      mesas,
      serie: (serieRes.recordset || []).map((r) => ({
        FECHA: r.FECHA,
        NUM_FACTURAS: Number(r.NUM_FACTURAS) || 0,
        VENTAS_NETAS: roundMoney(r.VENTAS_NETAS),
      })),
    });
  } catch (err) {
    console.warn('[API GET /reportes-restaurante]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/detalle', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const mesaId = parseMesaId(req);
  if (!mesaId) return res.status(400).json({ error: 'mesaId requerido' });

  const { desde, hasta } = resolveRango(req);
  const ventasCte = sqlVentasRestauranteCte();

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureDocumentosMesaRestauranteColumn(pool);

    const mesaInfo = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, mesaId)
      .query(`
        SELECT ID, CODMESA, DESMESA FROM dbo.RESTAURANTE_MESAS
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    const mesa = mesaInfo.recordset[0];
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

    const docsRes = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('DESDE', sql.Date, desde)
      .input('HASTA', sql.Date, hasta)
      .input('MESA_ID', sql.Int, mesaId)
      .query(`
        WITH ${ventasCte}
        SELECT
          ID, FECHA, HORA, MINUTO, CODDOC, CORRELATIVO, TOTALPRECIO, DOC_NOMCLIE, DOC_NIT,
          RESTAURANTE_MESA_ID, TIPODOC, DESDOC, SERIEFAC, NOFAC
        FROM VentasRest
        WHERE MESA_ID = @MESA_ID
        ORDER BY FECHA DESC, HORA DESC, MINUTO DESC, ID DESC
      `);

    const productosRes = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('DESDE', sql.Date, desde)
      .input('HASTA', sql.Date, hasta)
      .input('MESA_ID', sql.Int, mesaId)
      .query(`
        WITH ${ventasCte}
        SELECT
          LTRIM(RTRIM(dp.CODPROD)) AS CODPROD,
          MAX(LTRIM(RTRIM(ISNULL(dp.DESPROD, '')))) AS DESPROD,
          SUM(ISNULL(dp.TOTALUNIDADES, 0)) AS TOTALUNIDADES,
          SUM(ISNULL(dp.TOTALCOSTO, 0)) AS TOTALCOSTO,
          SUM(ISNULL(dp.TOTALPRECIO, 0)) AS TOTALPRECIO
        FROM VentasRest v
        INNER JOIN dbo.DOCPRODUCTOS dp
          ON dp.EMPNIT = @EMPNIT
          AND dp.CODDOC = v.CODDOC
          AND dp.CORRELATIVO = v.CORRELATIVO
        WHERE v.MESA_ID = @MESA_ID
        GROUP BY LTRIM(RTRIM(dp.CODPROD))
        ORDER BY SUM(ISNULL(dp.TOTALPRECIO, 0)) DESC, LTRIM(RTRIM(dp.CODPROD))
      `);

    const serieRes = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('DESDE', sql.Date, desde)
      .input('HASTA', sql.Date, hasta)
      .input('MESA_ID', sql.Int, mesaId)
      .query(`
        WITH ${ventasCte}
        SELECT
          CAST(FECHA AS DATE) AS FECHA,
          COUNT(*) AS NUM_FACTURAS,
          SUM(SIGNO_IMPORTE) AS VENTAS_NETAS
        FROM VentasRest
        WHERE MESA_ID = @MESA_ID
        GROUP BY CAST(FECHA AS DATE)
        ORDER BY CAST(FECHA AS DATE)
      `);

    const documentos = normalizeDocumentoRows(docsRes.recordset || []);
    const ventas = roundMoney(documentos.reduce((s, d) => s + (Number(d.TOTALPRECIO) || 0), 0));
    const nf = documentos.length;

    const productos = (productosRes.recordset || []).map((row) => {
      const totalCosto = roundMoney(row.TOTALCOSTO);
      const totalPrecio = roundMoney(row.TOTALPRECIO);
      return {
        CODPROD: String(row.CODPROD || '').trim(),
        DESPROD: String(row.DESPROD || '').trim(),
        TOTALUNIDADES: roundQty(row.TOTALUNIDADES),
        TOTALCOSTO: totalCosto,
        TOTALPRECIO: totalPrecio,
        UTILIDAD: roundMoney(totalPrecio - totalCosto),
      };
    });
    const costoTot = roundMoney(productos.reduce((s, p) => s + (Number(p.TOTALCOSTO) || 0), 0));
    const precioTot = roundMoney(productos.reduce((s, p) => s + (Number(p.TOTALPRECIO) || 0), 0));
    const utilidadTot = roundMoney(precioTot - costoTot);
    const productosTotales = {
      unidades: roundQty(productos.reduce((s, p) => s + (Number(p.TOTALUNIDADES) || 0), 0)),
      costo: costoTot,
      precio: precioTot,
      utilidad: utilidadTot,
      pctUtilidad: costoTot > 0 ? roundMoney((utilidadTot / costoTot) * 100) : 0,
    };

    res.json({
      desde,
      hasta,
      mesa: {
        MESA_ID: mesa.ID,
        CODMESA: mesa.CODMESA,
        DESMESA: mesa.DESMESA,
      },
      resumen: {
        facturas: nf,
        ventasNetas: ventas,
        ticketPromedio: nf > 0 ? roundMoney(ventas / nf) : 0,
      },
      serie: (serieRes.recordset || []).map((r) => ({
        FECHA: r.FECHA,
        NUM_FACTURAS: Number(r.NUM_FACTURAS) || 0,
        VENTAS_NETAS: roundMoney(r.VENTAS_NETAS),
      })),
      documentos,
      productos,
      productosTotales,
    });
  } catch (err) {
    console.warn('[API GET /reportes-restaurante/detalle]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
