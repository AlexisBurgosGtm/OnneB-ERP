const sql = require('mssql');
const { TIPODOC_NOTA_PAGO } = require('./cuentas-pagar-docs');
const { STATUS_OPERADO } = require('./documento-status');

const TIPODOC_NOTAS_DEBITO = [...TIPODOC_NOTA_PAGO];
const TIPODOC_COMPRAS_REF = ['COM'];
const SQL_TIPODOC_COMPRAS_IN = TIPODOC_COMPRAS_REF.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_NOTAS_IN = TIPODOC_NOTAS_DEBITO.map((t) => `'${t}'`).join(', ');

function sqlTipodocIn(tipos) {
  return (tipos || []).map((t) => `'${t}'`).join(', ');
}

function tiposCompraReferenciaParaNota() {
  return [...TIPODOC_COMPRAS_REF];
}

function assertCompraReferenciaPermitida(tipodocCompra) {
  const fac = String(tipodocCompra || '').trim().toUpperCase();
  if (!TIPODOC_COMPRAS_REF.includes(fac)) {
    const err = new Error('Las notas DVP solo pueden referenciar compras tipo COM');
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

async function loadCompraReferencia(pool, empnit, coddoc, correlativo, tipodocsRef = null) {
  const tipos = tipodocsRef && tipodocsRef.length ? tipodocsRef : TIPODOC_COMPRAS_REF;
  const sqlIn = sqlTipodocIn(tipos);
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT d.*, t.DESDOC, t.TIPODOC,
        p.EMPRESA AS PROV_EMPRESA, p.RAZONSOCIAL AS PROV_RAZON
      FROM dbo.DOCUMENTOS d
      JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      LEFT JOIN dbo.PROVEEDORES p ON p.EMPNIT = d.EMPNIT AND p.CODPROV = d.CODCLIENTE
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
        AND d.STATUS = '${STATUS_OPERADO}'
        AND t.TIPODOC IN (${sqlIn})
    `);
  return result.recordset[0] || null;
}

async function fetchComprasReferencia(pool, empnit, q, limit = 50, tipodocsRef = null) {
  const tipos = tipodocsRef && tipodocsRef.length ? tipodocsRef : TIPODOC_COMPRAS_REF;
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
      d.TOTALPRECIO,
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

async function fetchProductosDisponibles(pool, empnit, comCoddoc, comCorrelativo, excludeNd = null) {
  const request = pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('COM_CODDOC', sql.VarChar, comCoddoc)
    .input('COM_CORR', sql.Decimal(18, 0), comCorrelativo);

  let excludeSql = '';
  if (excludeNd?.coddoc && excludeNd?.correlativo != null) {
    request
      .input('ND_CODDOC', sql.VarChar, excludeNd.coddoc)
      .input('ND_CORR', sql.Decimal(18, 0), excludeNd.correlativo);
    excludeSql = `
      AND NOT (nd.CODDOC = @ND_CODDOC AND nd.CORRELATIVO = @ND_CORR)
    `;
  }

  const result = await request.query(`
    WITH comprado AS (
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
        SUM(ISNULL(l.CANTIDAD, 0)) AS CANT_COMPRADA
      FROM dbo.DOCPRODUCTOS l
      WHERE l.EMPNIT = @EMPNIT
        AND l.CODDOC = @COM_CODDOC
        AND l.CORRELATIVO = @COM_CORR
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
      INNER JOIN dbo.DOCUMENTOS nd
        ON nd.EMPNIT = l.EMPNIT AND nd.CODDOC = l.CODDOC AND nd.CORRELATIVO = l.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = nd.EMPNIT AND t.CODDOC = nd.CODDOC
      WHERE nd.EMPNIT = @EMPNIT
        AND nd.STATUS = '${STATUS_OPERADO}'
        AND t.TIPODOC IN (${SQL_TIPODOC_NOTAS_IN})
        AND nd.SERIEFAC = @COM_CODDOC
        AND nd.NOFAC = CAST(@COM_CORR AS VARCHAR(30))
        ${excludeSql}
      GROUP BY l.CODPROD, l.CODMEDIDA, l.EQUIVALE, l.PRECIO
    )
    SELECT
      c.CODPROD,
      c.DESPROD,
      c.CODMEDIDA,
      c.EQUIVALE,
      c.PRECIO,
      c.COSTO,
      c.TIPOPRECIO,
      c.TIPOPROD,
      c.EXENTO,
      c.PESO,
      c.CANT_COMPRADA,
      ISNULL(d.CANT_DEVUELTA, 0) AS CANT_DEVUELTA,
      c.CANT_COMPRADA - ISNULL(d.CANT_DEVUELTA, 0) AS CANT_DISPONIBLE
    FROM comprado c
    LEFT JOIN devuelto d
      ON c.CODPROD = d.CODPROD
      AND c.CODMEDIDA = d.CODMEDIDA
      AND c.EQUIVALE = d.EQUIVALE
      AND c.PRECIO = d.PRECIO
    WHERE c.CANT_COMPRADA - ISNULL(d.CANT_DEVUELTA, 0) > 0
    ORDER BY c.DESPROD, c.CODMEDIDA
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
    cantComprada: toNumber(r.CANT_COMPRADA),
    cantDevuelta: toNumber(r.CANT_DEVUELTA),
    cantDisponible: toNumber(r.CANT_DISPONIBLE),
  }));
}

async function cantidadEnNotaActual(pool, empnit, ndCoddoc, ndCorrelativo, codprod, codmedida, equivale, precio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, ndCoddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), ndCorrelativo)
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
  comCoddoc,
  comCorrelativo,
  ndCoddoc,
  ndCorrelativo,
  linea,
  cantidadNueva,
  opts = {}
) {
  const disponibles = await fetchProductosDisponibles(pool, empnit, comCoddoc, comCorrelativo, {
    coddoc: ndCoddoc,
    correlativo: ndCorrelativo,
  });
  const key = lineKey(linea.CODPROD, linea.CODMEDIDA, linea.EQUIVALE, linea.PRECIO);
  const disp = disponibles.find(
    (d) => lineKey(d.CODPROD, d.CODMEDIDA, d.EQUIVALE, d.PRECIO) === key
  );
  if (!disp) {
    const err = new Error('El producto no pertenece a la compra de referencia o ya fue devuelto por completo');
    err.statusCode = 400;
    throw err;
  }
  const cantActual = ndCoddoc
    ? await cantidadEnNotaActual(
        pool,
        empnit,
        ndCoddoc,
        ndCorrelativo,
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
        : `Cantidad máxima a agregar: ${restante} (comprado: ${disp.cantComprada}, ya devuelto: ${disp.cantDevuelta}, en esta nota: ${cantActual})`
    );
    err.statusCode = 400;
    throw err;
  }
  return disp;
}

module.exports = {
  TIPODOC_NOTAS_DEBITO,
  TIPODOC_COMPRAS_REF,
  SQL_TIPODOC_COMPRAS_IN,
  SQL_TIPODOC_NOTAS_IN,
  lineKey,
  tiposCompraReferenciaParaNota,
  assertCompraReferenciaPermitida,
  loadCompraReferencia,
  fetchComprasReferencia,
  fetchProductosDisponibles,
  assertCantidadDisponible,
};
