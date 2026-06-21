const sql = require('mssql');
const { TIPODOC_FACTURA, TIPODOC_DEVOLUCION } = require('./corte-caja-docs');
const { STATUS_OPERADO } = require('./documento-status');

const TIPODOC_NOTAS_CREDITO = [...TIPODOC_DEVOLUCION];
const TIPODOC_FACTURA_FAC = ['FAC'];
const TIPODOC_FACTURA_FEL = TIPODOC_FACTURA.filter((t) => t !== 'FAC');
const SQL_TIPODOC_FACTURA_IN = TIPODOC_FACTURA.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_NOTAS_IN = TIPODOC_NOTAS_CREDITO.map((t) => `'${t}'`).join(', ');

function sqlTipodocIn(tipos) {
  return (tipos || []).map((t) => `'${t}'`).join(', ');
}

/** DEV → solo FAC; FNC → fiscales excepto FAC (FEF, FEC, FES). */
function tiposFacturaReferenciaParaNota(tipodocNota) {
  const t = String(tipodocNota || '').trim().toUpperCase();
  if (t === 'DEV') return [...TIPODOC_FACTURA_FAC];
  if (t === 'FNC') return [...TIPODOC_FACTURA_FEL];
  return [...TIPODOC_FACTURA];
}

function assertFacturaReferenciaPermitida(tipodocNota, tipodocFactura) {
  const permitidos = tiposFacturaReferenciaParaNota(tipodocNota);
  const fac = String(tipodocFactura || '').trim().toUpperCase();
  if (!permitidos.includes(fac)) {
    const err = new Error(
      tipodocNota === 'DEV'
        ? 'Las notas DEV solo pueden referenciar facturas tipo FAC'
        : 'Las notas FNC solo pueden referenciar documentos fiscales (FEF, FEC, FES), no FAC'
    );
    err.statusCode = 400;
    throw err;
  }
}

function lineKey(codprod, codmedida, equivale, precio) {
  return [
    String(codprod || '').trim(),
    String(codmedida || '').trim(),
    String(Number(equivale) || 1),
    String(Number(precio) || 0),
  ].join('|');
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function loadFacturaReferencia(pool, empnit, coddoc, correlativo, tipodocsRef = null) {
  const tipos = tipodocsRef && tipodocsRef.length ? tipodocsRef : TIPODOC_FACTURA;
  const sqlIn = sqlTipodocIn(tipos);
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT d.*, t.DESDOC, t.TIPODOC
      FROM dbo.DOCUMENTOS d
      JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
        AND d.STATUS = '${STATUS_OPERADO}'
        AND t.TIPODOC IN (${sqlIn})
    `);
  return result.recordset[0] || null;
}

async function fetchFacturasReferencia(pool, empnit, q, limit = 50, tipodocsRef = null) {
  const tipos = tipodocsRef && tipodocsRef.length ? tipodocsRef : TIPODOC_FACTURA;
  const sqlIn = sqlTipodocIn(tipos);
  const request = pool.request().input('EMPNIT', sql.VarChar, empnit).input('limit', sql.Int, limit);
  let whereQ = '';
  if (q) {
    request.input('qLike', sql.NVarChar, `%${q}%`);
    whereQ = `
      AND (
        CAST(d.CORRELATIVO AS VARCHAR(30)) LIKE @qLike
        OR d.CODDOC LIKE @qLike
        OR d.DOC_NOMCLIE LIKE @qLike
        OR d.DOC_NIT LIKE @qLike
        OR CAST(d.TOTALPRECIO AS VARCHAR(30)) LIKE @qLike
      )
    `;
  }
  const result = await request.query(`
    SELECT TOP (@limit)
      d.CODDOC, d.CORRELATIVO, d.FECHA, d.DOC_NOMCLIE, d.DOC_NIT,
      d.TOTALPRECIO, d.FEL_UUDI, d.FEL_SERIE, d.FEL_NUMERO,
      t.TIPODOC, t.DESDOC
    FROM dbo.DOCUMENTOS d
    JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
    WHERE d.EMPNIT = @EMPNIT
      AND d.STATUS = '${STATUS_OPERADO}'
      AND t.TIPODOC IN (${sqlIn})
      ${whereQ}
    ORDER BY d.FECHA DESC, d.ID DESC
  `);
  return result.recordset;
}

async function fetchProductosDisponibles(pool, empnit, facCoddoc, facCorrelativo, excludeNc = null) {
  const request = pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('FAC_CODDOC', sql.VarChar, facCoddoc)
    .input('FAC_CORR', sql.Decimal(18, 0), facCorrelativo);

  let excludeSql = '';
  if (excludeNc?.coddoc && excludeNc?.correlativo != null) {
    request
      .input('NC_CODDOC', sql.VarChar, excludeNc.coddoc)
      .input('NC_CORR', sql.Decimal(18, 0), excludeNc.correlativo);
    excludeSql = `
      AND NOT (nc.CODDOC = @NC_CODDOC AND nc.CORRELATIVO = @NC_CORR)
    `;
  }

  const result = await request.query(`
    WITH facturado AS (
      SELECT
        LTRIM(RTRIM(l.CODPROD)) AS CODPROD,
        LTRIM(RTRIM(l.CODMEDIDA)) AS CODMEDIDA,
        ISNULL(l.EQUIVALE, 1) AS EQUIVALE,
        ISNULL(l.PRECIO, 0) AS PRECIO,
        ISNULL(l.COSTO, 0) AS COSTO,
        MAX(LTRIM(RTRIM(l.DESPROD))) AS DESPROD,
        ISNULL(l.TIPOPRECIO, 'P') AS TIPOPRECIO,
        ISNULL(l.TIPOPROD, 'P') AS TIPOPROD,
        ISNULL(l.EXENTO, 0) AS EXENTO,
        ISNULL(l.PESO, 0) AS PESO,
        SUM(ISNULL(l.CANTIDAD, 0)) AS CANT_FACTURADA
      FROM dbo.DOCPRODUCTOS l
      WHERE l.EMPNIT = @EMPNIT
        AND l.CODDOC = @FAC_CODDOC
        AND l.CORRELATIVO = @FAC_CORR
      GROUP BY l.CODPROD, l.CODMEDIDA, l.EQUIVALE, l.PRECIO, l.COSTO, l.TIPOPRECIO, l.TIPOPROD, l.EXENTO, l.PESO
    ),
    devuelto AS (
      SELECT
        LTRIM(RTRIM(l.CODPROD)) AS CODPROD,
        LTRIM(RTRIM(l.CODMEDIDA)) AS CODMEDIDA,
        ISNULL(l.EQUIVALE, 1) AS EQUIVALE,
        ISNULL(l.PRECIO, 0) AS PRECIO,
        SUM(ISNULL(l.CANTIDAD, 0)) AS CANT_DEVUELTA
      FROM dbo.DOCPRODUCTOS l
      INNER JOIN dbo.DOCUMENTOS nc
        ON nc.EMPNIT = l.EMPNIT AND nc.CODDOC = l.CODDOC AND nc.CORRELATIVO = l.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = nc.EMPNIT AND t.CODDOC = nc.CODDOC
      WHERE nc.EMPNIT = @EMPNIT
        AND nc.STATUS = '${STATUS_OPERADO}'
        AND t.TIPODOC IN (${SQL_TIPODOC_NOTAS_IN})
        AND nc.SERIEFAC = @FAC_CODDOC
        AND nc.NOFAC = CAST(@FAC_CORR AS VARCHAR(30))
        ${excludeSql}
      GROUP BY l.CODPROD, l.CODMEDIDA, l.EQUIVALE, l.PRECIO
    )
    SELECT
      f.CODPROD,
      f.DESPROD,
      f.CODMEDIDA,
      f.EQUIVALE,
      f.PRECIO,
      f.COSTO,
      f.TIPOPRECIO,
      f.TIPOPROD,
      f.EXENTO,
      f.PESO,
      f.CANT_FACTURADA,
      ISNULL(d.CANT_DEVUELTA, 0) AS CANT_DEVUELTA,
      f.CANT_FACTURADA - ISNULL(d.CANT_DEVUELTA, 0) AS CANT_DISPONIBLE
    FROM facturado f
    LEFT JOIN devuelto d
      ON f.CODPROD = d.CODPROD
      AND f.CODMEDIDA = d.CODMEDIDA
      AND f.EQUIVALE = d.EQUIVALE
      AND f.PRECIO = d.PRECIO
    WHERE f.CANT_FACTURADA - ISNULL(d.CANT_DEVUELTA, 0) > 0
    ORDER BY f.DESPROD, f.CODMEDIDA
  `);

  return result.recordset.map((r) => ({
    CODPROD: r.CODPROD,
    DESPROD: r.DESPROD,
    CODMEDIDA: r.CODMEDIDA,
    EQUIVALE: toNumber(r.EQUIVALE) || 1,
    PRECIO: toNumber(r.PRECIO),
    COSTO: toNumber(r.COSTO),
    TIPOPRECIO: r.TIPOPRECIO || 'P',
    TIPOPROD: r.TIPOPROD || 'P',
    EXENTO: toNumber(r.EXENTO),
    PESO: toNumber(r.PESO),
    cantFacturada: toNumber(r.CANT_FACTURADA),
    cantDevuelta: toNumber(r.CANT_DEVUELTA),
    cantDisponible: toNumber(r.CANT_DISPONIBLE),
  }));
}

async function cantidadEnNotaActual(pool, empnit, ncCoddoc, ncCorrelativo, codprod, codmedida, equivale, precio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, ncCoddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), ncCorrelativo)
    .input('CODPROD', sql.VarChar, codprod)
    .input('CODMEDIDA', sql.VarChar, codmedida)
    .input('EQUIVALE', sql.Int, equivale)
    .input('PRECIO', sql.Decimal(18, 3), precio)
    .query(`
      SELECT ISNULL(SUM(CANTIDAD), 0) AS CANT
      FROM dbo.DOCPRODUCTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
        AND LTRIM(RTRIM(CODPROD)) = @CODPROD
        AND LTRIM(RTRIM(CODMEDIDA)) = @CODMEDIDA
        AND ISNULL(EQUIVALE, 1) = @EQUIVALE
        AND ISNULL(PRECIO, 0) = @PRECIO
    `);
  return toNumber(result.recordset[0]?.CANT);
}

async function assertCantidadDisponible(
  pool,
  empnit,
  facCoddoc,
  facCorrelativo,
  ncCoddoc,
  ncCorrelativo,
  linea,
  cantidadNueva,
  opts = {}
) {
  const disponibles = await fetchProductosDisponibles(pool, empnit, facCoddoc, facCorrelativo, {
    coddoc: ncCoddoc,
    correlativo: ncCorrelativo,
  });
  const key = lineKey(linea.CODPROD, linea.CODMEDIDA, linea.EQUIVALE, linea.PRECIO);
  const disp = disponibles.find(
    (d) => lineKey(d.CODPROD, d.CODMEDIDA, d.EQUIVALE, d.PRECIO) === key
  );
  if (!disp) {
    const err = new Error('El producto no pertenece a la factura de referencia o ya fue devuelto por completo');
    err.statusCode = 400;
    throw err;
  }
  const cantActual = ncCoddoc
    ? await cantidadEnNotaActual(
        pool,
        empnit,
        ncCoddoc,
        ncCorrelativo,
        linea.CODPROD,
        linea.CODMEDIDA,
        linea.EQUIVALE,
        linea.PRECIO
      )
    : 0;
  const mode = opts.mode === 'set' ? 'set' : 'add';
  const cantidadAnterior = toNumber(opts.cantidadAnterior);
  const maxTotal = disp.cantDisponible;
  const totalDespues =
    mode === 'set' ? cantActual - cantidadAnterior + cantidadNueva : cantActual + cantidadNueva;
  if (totalDespues > maxTotal + 0.0001) {
    const restante = Math.max(0, maxTotal - cantActual);
    const err = new Error(
      mode === 'set'
        ? `Cantidad máxima para esta línea: ${Math.max(0, maxTotal - (cantActual - cantidadAnterior))} (disponible restante en la nota: ${restante})`
        : `Cantidad máxima a agregar: ${restante} (facturado: ${disp.cantFacturada}, ya devuelto: ${disp.cantDevuelta}, en esta nota: ${cantActual})`
    );
    err.statusCode = 400;
    throw err;
  }
  return disp;
}

module.exports = {
  TIPODOC_NOTAS_CREDITO,
  TIPODOC_FACTURA_FAC,
  TIPODOC_FACTURA_FEL,
  SQL_TIPODOC_FACTURA_IN,
  SQL_TIPODOC_NOTAS_IN,
  lineKey,
  tiposFacturaReferenciaParaNota,
  assertFacturaReferenciaPermitida,
  loadFacturaReferencia,
  fetchFacturasReferencia,
  fetchProductosDisponibles,
  assertCantidadDisponible,
};
