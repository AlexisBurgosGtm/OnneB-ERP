const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { nowParts } = require('../lib/documento-fecha');
const { sessionCorteDocsSql, sessionCorteDocsListSql, SQL_TIPODOC_CORTE_IN, TIPODOC_FACTURA, TIPODOC_DEVOLUCION } = require('../lib/corte-caja-docs');
const { sumValesSesionCaja, marcarValesCorte, sumPagosValesSesionCaja, marcarPagosValesCorte, listValesSesionCaja, listPagosValesSesionCaja } = require('../lib/nomina-vales');
const {
  crearMovimientoBanco,
  sumRetirosEfectivoSesionCaja,
  listRetirosEfectivoSesionCaja,
  marcarRetirosEfectivoCorte,
} = require('../lib/movimientos-banco');

const router = express.Router();

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
  return Number.isNaN(n) || n < 1 ? null : n;
}

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function parseAmount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundMoney(n);
}

async function loadCaja(pool, empnit, codcaja) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .query(`
      SELECT CODCAJA, DESCAJA, ISNULL(STATUS, 0) AS STATUS,
             ISNULL(EFECTIVOINICIAL, 0) AS EFECTIVOINICIAL,
             ISNULL(EFECTIVOLIMITE, 0) AS EFECTIVOLIMITE,
             LASTUPDATE
      FROM dbo.Cajas
      WHERE EMPNIT = @EMPNIT AND CODCAJA = @CODCAJA
    `);
  return result.recordset[0] || null;
}

/** Documentos pendientes de corte en la sesión actual. */
function sessionDocsSql() {
  return sessionCorteDocsSql();
}

async function marcarDocumentosCorte(transaction, empnit, codcaja, nocorte, apertura) {
  const result = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .input('NOCORTE', sql.Int, nocorte)
    .input('APERTURA', sql.DateTime, apertura)
    .query(`
      UPDATE d
      SET d.CORTE = 'SI', d.NOCORTE = @NOCORTE
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND d.CODCAJA = @CODCAJA
        AND d.STATUS = 'O'
        AND ISNULL(d.CORTE, 'NO') = 'NO'
        AND t.TIPODOC IN (${SQL_TIPODOC_CORTE_IN})
        AND d.ID > ISNULL((
          SELECT TOP 1 CASE WHEN c.IDFINAL > 0 THEN c.IDFINAL ELSE 0 END
          FROM dbo.CORTES c
          WHERE c.EMPNIT = @EMPNIT AND c.CODCAJA = @CODCAJA
          ORDER BY c.ID DESC
        ), 0)
        AND d.FECHA >= CAST(@APERTURA AS DATE)
    `);
  return result.rowsAffected[0] || 0;
}

function docTipodoc(row) {
  return String(row?.TIPODOC || '').trim().toUpperCase();
}

function isDevolucionDoc(row) {
  return TIPODOC_DEVOLUCION.includes(docTipodoc(row));
}

function isFacturaDoc(row) {
  return TIPODOC_FACTURA.includes(docTipodoc(row));
}

function buildResumenFromRows(rows, efectivoInicial, totalVales = 0, totalPagosVales = 0, totalRetiros = 0) {
  const docs = rows || [];
  const first = docs[0] || null;
  const last = docs[docs.length - 1] || null;
  let totalCosto = 0;
  let totalVenta = 0;
  let totalVentasBrutas = 0;
  let totalDevoluciones = 0;
  let movDevoluciones = 0;
  let totalCredito = 0;
  let fpEfectivo = 0;
  let fpTarjeta = 0;
  let fpDeposito = 0;
  let fpCheque = 0;

  for (const d of docs) {
    const dev = isDevolucionDoc(d);
    const sign = dev ? -1 : 1;
    const costo = Number(d.TOTALCOSTO) || 0;
    const precio = Number(d.TOTALPRECIO) || 0;
    const efectivo = Number(d.FPAGO_EFECTIVO) || 0;
    const tarjeta = Number(d.FPAGO_TARJETA) || 0;
    const deposito = Number(d.FPAGO_DEPOSITO) || 0;
    const cheque = Number(d.FPAGO_CHEQUE) || 0;

    if (dev) {
      totalDevoluciones += precio;
      movDevoluciones += 1;
    } else if (isFacturaDoc(d)) {
      totalVentasBrutas += precio;
    }

    totalCosto += sign * costo;
    totalVenta += sign * precio;

    if (!dev && String(d.CONCRE || '').trim().toUpperCase() === 'CRE') {
      totalCredito += precio;
    }

    fpEfectivo += sign * efectivo;
    fpTarjeta += sign * tarjeta;
    fpDeposito += sign * deposito;
    fpCheque += sign * cheque;
  }

  totalCosto = roundMoney(totalCosto);
  totalVenta = roundMoney(totalVenta);
  totalVentasBrutas = roundMoney(totalVentasBrutas);
  totalDevoluciones = roundMoney(totalDevoluciones);
  totalCredito = roundMoney(totalCredito);
  fpEfectivo = roundMoney(fpEfectivo);
  fpTarjeta = roundMoney(fpTarjeta);
  fpDeposito = roundMoney(fpDeposito);
  fpCheque = roundMoney(fpCheque);
  const totalUtilidad = roundMoney(totalVenta - totalCosto);
  const margen = totalVenta > 0 ? roundMoney((totalUtilidad / totalVenta) * 100) : 0;
  const vales = roundMoney(totalVales);
  const pagosVales = roundMoney(totalPagosVales);
  const retiros = roundMoney(totalRetiros);
  // Gastos netos de vales: vales restan, abonos suman efectivo
  const totalGastos = roundMoney(vales - pagosVales + retiros);
  const efectivoEsperado = roundMoney(
    (Number(efectivoInicial) || 0) + fpEfectivo - vales + pagosVales - retiros
  );

  return {
    totalMovimientos: docs.length,
    totalCosto,
    totalVenta,
    totalVentasBrutas,
    totalDevoluciones,
    movDevoluciones,
    totalUtilidad,
    margen,
    totalCredito,
    fpEfectivo,
    fpTarjeta,
    fpDeposito,
    fpCheque,
    totalGastos,
    totalVales: vales,
    totalPagosVales: pagosVales,
    totalRetiros: retiros,
    efectivoInicial: roundMoney(efectivoInicial),
    efectivoEsperado,
    docInicial: first
      ? {
          ID: first.ID,
          CODDOC: first.CODDOC,
          CORRELATIVO: first.CORRELATIVO,
          HORA: first.HORA,
          MINUTO: first.MINUTO,
        }
      : null,
    docFinal: last
      ? {
          ID: last.ID,
          CODDOC: last.CODDOC,
          CORRELATIVO: last.CORRELATIVO,
          HORA: last.HORA,
          MINUTO: last.MINUTO,
        }
      : null,
  };
}

router.get('/cajas', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
      SELECT CODCAJA, DESCAJA, ISNULL(STATUS, 0) AS STATUS,
             ISNULL(EFECTIVOINICIAL, 0) AS EFECTIVOINICIAL,
             LASTUPDATE
      FROM dbo.Cajas
      WHERE EMPNIT = @EMPNIT
      ORDER BY DESCAJA ASC
    `);
    res.json({ rows: result.recordset });
  } catch (err) {
    console.warn('[API GET /corte-caja/cajas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/cortes', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const codcaja = req.query.codcaja != null ? parseCodcaja(req.query.codcaja) : null;
  try {
    const pool = await req.app.locals.getDbPool();
    const request = pool.request().input('EMPNIT', sql.VarChar, empnit).input('LIMIT', sql.Int, limit);
    let cajaFilter = '';
    if (codcaja) {
      request.input('CODCAJA', sql.Int, codcaja);
      cajaFilter = ' AND c.CODCAJA = @CODCAJA';
    }
    const result = await request.query(`
      SELECT TOP (@LIMIT)
        c.ID, c.CORRELATIVO, c.FECHA, c.HORA, c.MINUTO, c.CODCAJA,
        c.TOTALMOVIMIENTOS, c.TOTALVENTA, c.TOTALREPORTADO, c.FALTANTE, c.SOBRANTE,
        c.USUARIO, c.OBS, c.TOTALTARJETA, c.TOTALCHEQUES,
        ISNULL(cj.DESCAJA, '') AS DESCAJA
      FROM dbo.CORTES c
      LEFT JOIN dbo.Cajas cj ON cj.EMPNIT = c.EMPNIT AND cj.CODCAJA = c.CODCAJA
      WHERE c.EMPNIT = @EMPNIT${cajaFilter}
      ORDER BY c.ID DESC
    `);
    res.json({ rows: result.recordset });
  } catch (err) {
    console.warn('[API GET /corte-caja/cortes]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:codcaja/resumen', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codcaja = parseCodcaja(req.params.codcaja);
  if (!codcaja) return res.status(400).json({ error: 'CODCAJA inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const caja = await loadCaja(pool, empnit, codcaja);
    if (!caja) return res.status(404).json({ error: 'Caja no encontrada' });
    if (Number(caja.STATUS) !== 1) {
      return res.status(400).json({ error: 'La caja no está abierta' });
    }
    const apertura = caja.LASTUPDATE || new Date();
    const docs = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCAJA', sql.Int, codcaja)
      .input('APERTURA', sql.DateTime, apertura)
      .query(sessionDocsSql());
    const valesInfo = await sumValesSesionCaja(pool, empnit, codcaja, apertura);
    const pagosInfo = await sumPagosValesSesionCaja(pool, empnit, codcaja, apertura);
    const retirosInfo = await sumRetirosEfectivoSesionCaja(pool, empnit, codcaja, apertura);
    const resumen = buildResumenFromRows(
      docs.recordset,
      caja.EFECTIVOINICIAL,
      valesInfo.totalVales,
      pagosInfo.totalPagos,
      retirosInfo.totalRetiros
    );
    resumen.cantidadVales = valesInfo.cantidadVales;
    resumen.cantidadPagosVales = pagosInfo.cantidadPagos;
    resumen.cantidadRetiros = retirosInfo.cantidadRetiros;
    res.json({ caja, resumen });
  } catch (err) {
    console.warn('[API GET /corte-caja/:codcaja/resumen]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:codcaja/documentos', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codcaja = parseCodcaja(req.params.codcaja);
  if (!codcaja) return res.status(400).json({ error: 'CODCAJA inválido' });
  const filtro = String(req.query.filtro || '').trim().toLowerCase();
  const listSql = sessionCorteDocsListSql(filtro);
  if (!listSql) return res.status(400).json({ error: 'Filtro inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const caja = await loadCaja(pool, empnit, codcaja);
    if (!caja) return res.status(404).json({ error: 'Caja no encontrada' });
    if (Number(caja.STATUS) !== 1) {
      return res.status(400).json({ error: 'La caja no está abierta' });
    }
    const apertura = caja.LASTUPDATE || new Date();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCAJA', sql.Int, codcaja)
      .input('APERTURA', sql.DateTime, apertura)
      .query(listSql);
    res.json({ filtro, rows: result.recordset });
  } catch (err) {
    console.warn('[API GET /corte-caja/:codcaja/documentos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:codcaja/vales-detalle', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codcaja = parseCodcaja(req.params.codcaja);
  if (!codcaja) return res.status(400).json({ error: 'CODCAJA inválido' });
  const tipo = String(req.query.tipo || 'vales').trim().toLowerCase();
  if (tipo !== 'vales' && tipo !== 'pagos') {
    return res.status(400).json({ error: 'Tipo inválido (vales|pagos)' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const caja = await loadCaja(pool, empnit, codcaja);
    if (!caja) return res.status(404).json({ error: 'Caja no encontrada' });
    if (Number(caja.STATUS) !== 1) {
      return res.status(400).json({ error: 'La caja no está abierta' });
    }
    const apertura = caja.LASTUPDATE || new Date();
    const rows =
      tipo === 'pagos'
        ? await listPagosValesSesionCaja(pool, empnit, codcaja, apertura)
        : await listValesSesionCaja(pool, empnit, codcaja, apertura);
    res.json({ tipo, rows });
  } catch (err) {
    console.warn('[API GET /corte-caja/:codcaja/vales-detalle]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:codcaja/retiros-detalle', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codcaja = parseCodcaja(req.params.codcaja);
  if (!codcaja) return res.status(400).json({ error: 'CODCAJA inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const caja = await loadCaja(pool, empnit, codcaja);
    if (!caja) return res.status(404).json({ error: 'Caja no encontrada' });
    if (Number(caja.STATUS) !== 1) {
      return res.status(400).json({ error: 'La caja no está abierta' });
    }
    const apertura = caja.LASTUPDATE || new Date();
    const rows = await listRetirosEfectivoSesionCaja(pool, empnit, codcaja, apertura);
    res.json({ rows });
  } catch (err) {
    console.warn('[API GET /corte-caja/:codcaja/retiros-detalle]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Retiro de efectivo de caja → depósito (entrada) en DOCUMENTOS_BANCO.
 * CATEGORIA=DEPOSITO, DESCRIPCION=RETIRO DE EFECTIVO DE CAJA # {CODCAJA}
 */
router.post('/:codcaja/retiro-efectivo', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codcaja = parseCodcaja(req.params.codcaja);
  if (!codcaja) return res.status(400).json({ error: 'CODCAJA inválido' });

  const importe = parseAmount(req.body?.IMPORTE ?? req.body?.importe);
  if (importe <= 0) return res.status(400).json({ error: 'Ingrese un importe mayor a cero' });
  const codcuenta = parseInt(req.body?.CODCUENTA ?? req.body?.codcuenta, 10);
  if (Number.isNaN(codcuenta) || codcuenta <= 0) {
    return res.status(400).json({ error: 'Seleccione la cuenta bancaria' });
  }
  const nodocumento = String(req.body?.NODOCUMENTO || req.body?.nodocumento || '').trim();
  const usuario = String(req.body?.USUARIO || req.body?.usuario || '').trim() || 'CAJA';

  try {
    const pool = await req.app.locals.getDbPool();
    const caja = await loadCaja(pool, empnit, codcaja);
    if (!caja) return res.status(404).json({ error: 'Caja no encontrada' });
    if (Number(caja.STATUS) !== 1) {
      return res.status(400).json({ error: 'La caja no está abierta' });
    }

    const movimiento = await crearMovimientoBanco(pool, sql, empnit, {
      TIPO: 'E',
      CODCUENTA: codcuenta,
      IMPORTE: importe,
      CATEGORIA: 'DEPOSITO',
      DESCRIPCION: `RETIRO DE EFECTIVO DE CAJA # ${codcaja}`,
      NODOCUMENTO: nodocumento,
      USUARIO: usuario,
      CODCAJA: codcaja,
      CORTE: 'NO',
      autoCoddoc: true,
    });

    const apertura = caja.LASTUPDATE || new Date();
    const docs = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCAJA', sql.Int, codcaja)
      .input('APERTURA', sql.DateTime, apertura)
      .query(sessionDocsSql());
    const valesInfo = await sumValesSesionCaja(pool, empnit, codcaja, apertura);
    const pagosInfo = await sumPagosValesSesionCaja(pool, empnit, codcaja, apertura);
    const retirosInfo = await sumRetirosEfectivoSesionCaja(pool, empnit, codcaja, apertura);
    const resumen = buildResumenFromRows(
      docs.recordset,
      caja.EFECTIVOINICIAL,
      valesInfo.totalVales,
      pagosInfo.totalPagos,
      retirosInfo.totalRetiros
    );
    resumen.cantidadVales = valesInfo.cantidadVales;
    resumen.cantidadPagosVales = pagosInfo.cantidadPagos;
    resumen.cantidadRetiros = retirosInfo.cantidadRetiros;

    res.status(201).json({ ok: true, movimiento, caja, resumen });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.warn('[API POST /corte-caja/:codcaja/retiro-efectivo]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:codcaja/abrir', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codcaja = parseCodcaja(req.params.codcaja);
  if (!codcaja) return res.status(400).json({ error: 'CODCAJA inválido' });

  const efectivoInicial = parseAmount(req.body?.EFECTIVOINICIAL ?? req.body?.efectivoinicial);

  try {
    const pool = await req.app.locals.getDbPool();
    const caja = await loadCaja(pool, empnit, codcaja);
    if (!caja) return res.status(404).json({ error: 'Caja no encontrada' });
    if (Number(caja.STATUS) === 1) {
      return res.status(400).json({ error: 'La caja ya está abierta' });
    }

    await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCAJA', sql.Int, codcaja)
      .input('EFECTIVOINICIAL', sql.Decimal(18, 3), efectivoInicial)
      .query(`
        UPDATE dbo.Cajas
        SET STATUS = 1,
            EFECTIVOINICIAL = @EFECTIVOINICIAL,
            LASTUPDATE = GETDATE()
        WHERE EMPNIT = @EMPNIT AND CODCAJA = @CODCAJA
      `);

    const updated = await loadCaja(pool, empnit, codcaja);
    res.json({ ok: true, caja: updated });
  } catch (err) {
    console.warn('[API POST /corte-caja/:codcaja/abrir]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:codcaja/cerrar', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codcaja = parseCodcaja(req.params.codcaja);
  if (!codcaja) return res.status(400).json({ error: 'CODCAJA inválido' });

  const totalReportado = parseAmount(req.body?.TOTALREPORTADO);
  const reportadoTarjeta = parseAmount(req.body?.REPORTADOTARJETA);
  const reportadoCheques = parseAmount(req.body?.REPORTADOCHEQUES);
  const reportadoDeposito = parseAmount(req.body?.REPORTADO_DEPOSITO);
  const obs = String(req.body?.OBS || '').trim() || 'S/N';
  const usuario = String(req.body?.USUARIO || '').trim() || 'SN';

  const transaction = new sql.Transaction(await req.app.locals.getDbPool());
  try {
    await transaction.begin();
    const cajaReq = transaction.request();
    const cajaResult = await cajaReq
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCAJA', sql.Int, codcaja)
      .query(`
        SELECT CODCAJA, DESCAJA, ISNULL(STATUS, 0) AS STATUS,
               ISNULL(EFECTIVOINICIAL, 0) AS EFECTIVOINICIAL, LASTUPDATE
        FROM dbo.Cajas WITH (UPDLOCK, ROWLOCK)
        WHERE EMPNIT = @EMPNIT AND CODCAJA = @CODCAJA
      `);
    const caja = cajaResult.recordset[0];
    if (!caja) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Caja no encontrada' });
    }
    if (Number(caja.STATUS) !== 1) {
      await transaction.rollback();
      return res.status(400).json({ error: 'La caja no está abierta' });
    }

    const apertura = caja.LASTUPDATE || new Date();
    const docsResult = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCAJA', sql.Int, codcaja)
      .input('APERTURA', sql.DateTime, apertura)
      .query(sessionDocsSql());
    const valesInfo = await sumValesSesionCaja(transaction, empnit, codcaja, apertura);
    const pagosInfo = await sumPagosValesSesionCaja(transaction, empnit, codcaja, apertura);
    const retirosInfo = await sumRetirosEfectivoSesionCaja(transaction, empnit, codcaja, apertura);
    const resumen = buildResumenFromRows(
      docsResult.recordset,
      caja.EFECTIVOINICIAL,
      valesInfo.totalVales,
      pagosInfo.totalPagos,
      retirosInfo.totalRetiros
    );
    resumen.cantidadVales = valesInfo.cantidadVales;
    resumen.cantidadPagosVales = pagosInfo.cantidadPagos;
    resumen.cantidadRetiros = retirosInfo.cantidadRetiros;

    const diff = roundMoney(totalReportado - resumen.efectivoEsperado);
    const faltante = diff < 0 ? roundMoney(Math.abs(diff)) : 0;
    const sobrante = diff > 0 ? diff : 0;

    const parts = nowParts();
    const corrResult = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .query('SELECT ISNULL(MAX(CORRELATIVO), 0) + 1 AS nextCorr FROM dbo.CORTES WHERE EMPNIT = @EMPNIT');
    const correlativo = corrResult.recordset[0].nextCorr;

    const ini = resumen.docInicial;
    const fin = resumen.docFinal;

    const insertResult = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ANIO', sql.Int, parts.anio)
      .input('MES', sql.Int, parts.mes)
      .input('DIA', sql.Int, parts.dia)
      .input('FECHA', sql.Date, parts.fecha)
      .input('HORA', sql.Int, parts.hora)
      .input('MINUTO', sql.Int, parts.minuto)
      .input('CORRELATIVO', sql.Int, correlativo)
      .input('IDINICIAL', sql.Int, ini?.ID ?? 0)
      .input('CODDOCINICIAL', sql.VarChar, ini?.CODDOC ?? 'SN')
      .input('CORRELATIVOINICIAL', sql.Decimal(18, 0), ini?.CORRELATIVO ?? 0)
      .input('HORAINICIAL', sql.Int, ini?.HORA ?? 0)
      .input('MINUTOINICIAL', sql.Int, ini?.MINUTO ?? 0)
      .input('IDFINAL', sql.Int, fin?.ID ?? 0)
      .input('CODDOCFINAL', sql.VarChar, fin?.CODDOC ?? 'SN')
      .input('CORRELATIVOFINAL', sql.Decimal(18, 0), fin?.CORRELATIVO ?? 0)
      .input('HORAFINAL', sql.Int, fin?.HORA ?? 0)
      .input('MINUTOFINAL', sql.Int, fin?.MINUTO ?? 0)
      .input('TOTALMOVIMIENTOS', sql.Int, resumen.totalMovimientos)
      .input('TOTALCOSTO', sql.Decimal(18, 3), resumen.totalCosto)
      .input('TOTALVENTA', sql.Decimal(18, 3), resumen.totalVenta)
      .input('TOTALUTILIDAD', sql.Decimal(18, 3), resumen.totalUtilidad)
      .input('MARGEN', sql.Decimal(18, 3), resumen.margen)
      .input('USUARIO', sql.VarChar, usuario)
      .input('TOTALREPORTADO', sql.Decimal(18, 3), totalReportado)
      .input('FALTANTE', sql.Decimal(18, 3), faltante)
      .input('SOBRANTE', sql.Decimal(18, 3), sobrante)
      .input('OBS', sql.VarChar, obs)
      .input('TOTALGASTOS', sql.Decimal(18, 3), resumen.totalGastos)
      .input('TOTALRECIBOS', sql.Decimal(18, 3), 0)
      .input('CODCAJA', sql.Int, codcaja)
      .input('TOTALTARJETA', sql.Decimal(18, 3), resumen.fpTarjeta)
      .input('REPORTADOTARJETA', sql.Decimal(18, 3), reportadoTarjeta)
      .input('TOTALCHEQUES', sql.Decimal(18, 3), resumen.fpCheque)
      .input('REPORTADOCHEQUES', sql.Decimal(18, 3), reportadoCheques)
      .input('ENVIADO', sql.Int, 1)
      .input('TOTALDEVOLUCIONES', sql.Decimal(18, 3), resumen.totalDevoluciones)
      .input('TOTALVENTASCREDITO', sql.Decimal(18, 3), resumen.totalCredito)
      .input('FPAGO_EFECTIVO', sql.Decimal(18, 3), resumen.fpEfectivo)
      .input('FPAGO_TARJETA', sql.Decimal(18, 3), resumen.fpTarjeta)
      .input('FPAGO_DEPOSITO', sql.Decimal(18, 3), resumen.fpDeposito)
      .input('FPAGO_CHEQUE', sql.Decimal(18, 3), resumen.fpCheque)
      .input('REPORTADO_DEPOSITO', sql.Decimal(18, 3), reportadoDeposito)
      .query(`
        INSERT INTO dbo.CORTES (
          EMPNIT, ANIO, MES, DIA, FECHA, HORA, MINUTO, CORRELATIVO,
          IDINICIAL, CODDOCINICIAL, CORRELATIVOINICIAL, HORAINICIAL, MINUTOINICIAL,
          IDFINAL, CODDOCFINAL, CORRELATIVOFINAL, HORAFINAL, MINUTOFINAL,
          TOTALMOVIMIENTOS, TOTALCOSTO, TOTALVENTA, TOTALUTILIDAD, MARGEN,
          USUARIO, TOTALREPORTADO, FALTANTE, SOBRANTE, OBS,
          TOTALGASTOS, TOTALRECIBOS, CODCAJA,
          TOTALTARJETA, REPORTADOTARJETA, TOTALCHEQUES, REPORTADOCHEQUES,
          ENVIADO, TOTALDEVOLUCIONES, TOTALVENTASCREDITO,
          FPAGO_EFECTIVO, FPAGO_TARJETA, FPAGO_DEPOSITO, FPAGO_CHEQUE, REPORTADO_DEPOSITO
        )
        OUTPUT INSERTED.ID
        VALUES (
          @EMPNIT, @ANIO, @MES, @DIA, @FECHA, @HORA, @MINUTO, @CORRELATIVO,
          @IDINICIAL, @CODDOCINICIAL, @CORRELATIVOINICIAL, @HORAINICIAL, @MINUTOINICIAL,
          @IDFINAL, @CODDOCFINAL, @CORRELATIVOFINAL, @HORAFINAL, @MINUTOFINAL,
          @TOTALMOVIMIENTOS, @TOTALCOSTO, @TOTALVENTA, @TOTALUTILIDAD, @MARGEN,
          @USUARIO, @TOTALREPORTADO, @FALTANTE, @SOBRANTE, @OBS,
          @TOTALGASTOS, @TOTALRECIBOS, @CODCAJA,
          @TOTALTARJETA, @REPORTADOTARJETA, @TOTALCHEQUES, @REPORTADOCHEQUES,
          @ENVIADO, @TOTALDEVOLUCIONES, @TOTALVENTASCREDITO,
          @FPAGO_EFECTIVO, @FPAGO_TARJETA, @FPAGO_DEPOSITO, @FPAGO_CHEQUE, @REPORTADO_DEPOSITO
        )
      `);

    const newId = insertResult.recordset[0]?.ID;

    const docsMarcados = await marcarDocumentosCorte(transaction, empnit, codcaja, correlativo, apertura);
    const valesMarcados = await marcarValesCorte(transaction, empnit, codcaja, correlativo, apertura);
    const pagosValesMarcados = await marcarPagosValesCorte(
      transaction,
      empnit,
      codcaja,
      correlativo,
      apertura
    );
    const retirosMarcados = await marcarRetirosEfectivoCorte(
      transaction,
      empnit,
      codcaja,
      correlativo,
      apertura
    );

    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCAJA', sql.Int, codcaja)
      .query(`
        UPDATE dbo.Cajas
        SET STATUS = 0, LASTUPDATE = GETDATE()
        WHERE EMPNIT = @EMPNIT AND CODCAJA = @CODCAJA
      `);

    await transaction.commit();
    res.json({
      ok: true,
      corte: { ID: newId, CORRELATIVO: correlativo },
      documentosMarcados: docsMarcados,
      valesMarcados,
      pagosValesMarcados,
      retirosMarcados,
      resumen,
      faltante,
      sobrante,
    });
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (_) {
      /* ya revertido */
    }
    console.warn('[API POST /corte-caja/:codcaja/cerrar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
