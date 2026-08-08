const { STATUS_OPERADO, SQL_TIPODOC_REPORTES_SI } = require('./documento-status');
const {
  SQL_TIPODOC_CUENTAS_COBRAR_IN,
  SQL_TIPODOC_DEVOLUCION_IN,
  SQL_EXISTS_FACTURA_CRE_REF,
  TIPODOC_ABONO_CXC,
} = require('./cuentas-docs');

/**
 * Abono válido para CXC: recibos RCC, o notas DEV/FNC que referencien
 * una factura al crédito (CONCRE = CRE) operada.
 */
const SQL_ABONO_CXC_FILTER = `(
  t.TIPODOC = 'RCC'
  OR (
    t.TIPODOC = 'PRC'
    AND UPPER(LTRIM(RTRIM(ISNULL(d.CODEMBARQUE, '')))) = 'CXC'
    AND ISNULL(d.CODCAJA, 0) > 0
  )
  OR (t.TIPODOC IN (${SQL_TIPODOC_DEVOLUCION_IN}) AND ${SQL_EXISTS_FACTURA_CRE_REF})
)`;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapFacturaRow(r) {
  return {
    FECHA: r.FECHA ?? null,
    VENCIMIENTO: r.VENCIMIENTO ?? null,
    CODDOC: r.CODDOC ?? null,
    DESDOC: r.DESDOC ?? null,
    TIPODOC: r.TIPODOC ?? null,
    CORRELATIVO: r.CORRELATIVO ?? null,
    TOTALPRECIO: toNumber(r.TOTALPRECIO),
    DOC_SALDO: toNumber(r.DOC_SALDO),
    DOC_ABONO: toNumber(r.DOC_ABONO),
    STATUS: r.STATUS ?? null,
    CONCRE: r.CONCRE ?? null,
  };
}

function mapAbonoRow(r) {
  const seriefac = String(r.SERIEFAC ?? '').trim();
  const nofac = String(r.NOFAC ?? '').trim();
  return {
    FECHA: r.FECHA ?? null,
    CODDOC: r.CODDOC ?? null,
    DESDOC: r.DESDOC ?? null,
    TIPODOC: r.TIPODOC ?? null,
    CORRELATIVO: r.CORRELATIVO ?? null,
    TOTALPRECIO: toNumber(r.TOTALPRECIO),
    SERIEFAC: seriefac || null,
    NOFAC: nofac || null,
    FACTURA_REF: seriefac && nofac ? `${seriefac} #${nofac}` : seriefac || nofac || null,
    USUARIO: r.USUARIO ?? null,
    OBS: r.OBS ?? null,
  };
}

async function fetchEstadoCuentaCliente(pool, sql, empnit, codcliente) {
  const cod = parseInt(codcliente, 10);
  if (Number.isNaN(cod) || cod <= 0) {
    const err = new Error('Código de cliente inválido');
    err.statusCode = 400;
    throw err;
  }

  const clienteRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCLIENTE', sql.Int, cod)
    .query(`
      SELECT TOP 1
        c.CODCLIENTE,
        c.NEGOCIO,
        c.NOMBRECLIENTE,
        c.DIRCLIENTE,
        c.NIT
      FROM dbo.CLIENTES c
      WHERE c.EMPNIT = @EMPNIT AND c.CODCLIENTE = @CODCLIENTE
    `);
  const clienteRow = clienteRes.recordset[0];
  if (!clienteRow) {
    const err = new Error('Cliente no encontrado');
    err.statusCode = 404;
    throw err;
  }

  const facturasRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCLIENTE', sql.Int, cod)
    .query(`
      SELECT
        d.FECHA,
        d.VENCIMIENTO,
        d.CODDOC,
        t.DESDOC,
        t.TIPODOC,
        d.CORRELATIVO,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(d.DOC_SALDO, 0) AS DOC_SALDO,
        ISNULL(d.DOC_ABONO, 0) AS DOC_ABONO,
        d.STATUS,
        ISNULL(d.CONCRE, 'CON') AS CONCRE
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      WHERE d.EMPNIT = @EMPNIT
        AND d.CODCLIENTE = @CODCLIENTE
        AND t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN})
        AND d.STATUS = '${STATUS_OPERADO}'
        AND ISNULL(d.CONCRE, 'CON') = 'CRE'
        AND ${SQL_TIPODOC_REPORTES_SI}
      ORDER BY d.FECHA DESC, d.CORRELATIVO DESC
    `);

  const abonosRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCLIENTE', sql.Int, cod)
    .query(`
      SELECT
        d.FECHA,
        d.CODDOC,
        t.DESDOC,
        t.TIPODOC,
        d.CORRELATIVO,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        d.SERIEFAC,
        d.NOFAC,
        d.USUARIO,
        d.OBS
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      WHERE d.EMPNIT = @EMPNIT
        AND d.CODCLIENTE = @CODCLIENTE
        AND d.STATUS = '${STATUS_OPERADO}'
        AND ${SQL_ABONO_CXC_FILTER}
      ORDER BY d.FECHA DESC, d.HORA DESC, d.CORRELATIVO DESC
    `);

  const movimientosRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCLIENTE', sql.Int, cod)
    .query(`
      SELECT
        d.ID,
        d.FECHA,
        d.CODDOC,
        t.DESDOC,
        t.TIPODOC,
        d.CORRELATIVO,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        d.SERIEFAC,
        d.NOFAC,
        CASE
          WHEN t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN}) THEN 'C'
          ELSE 'A'
        END AS MOV
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      WHERE d.EMPNIT = @EMPNIT
        AND d.CODCLIENTE = @CODCLIENTE
        AND d.STATUS = '${STATUS_OPERADO}'
        AND (
          (t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN}) AND ISNULL(d.CONCRE, 'CON') = 'CRE' AND ${SQL_TIPODOC_REPORTES_SI})
          OR ${SQL_ABONO_CXC_FILTER}
        )
      ORDER BY d.ID ASC
    `);

  const facturas = facturasRes.recordset.map(mapFacturaRow);
  const abonos = abonosRes.recordset.map(mapAbonoRow);

  let saldoAcumulado = 0;
  const movimientos = movimientosRes.recordset.map((r) => {
    const monto = toNumber(r.TOTALPRECIO);
    const esCredito = String(r.MOV) === 'C';
    const credito = esCredito ? monto : 0;
    const abono = esCredito ? 0 : monto;
    saldoAcumulado += credito - abono;
    const seriefac = String(r.SERIEFAC ?? '').trim();
    const nofac = String(r.NOFAC ?? '').trim();
    return {
      ID: r.ID ?? null,
      FECHA: r.FECHA ?? null,
      CODDOC: r.CODDOC ?? null,
      DESDOC: r.DESDOC ?? null,
      TIPODOC: r.TIPODOC ?? null,
      CORRELATIVO: r.CORRELATIVO ?? null,
      MOV: esCredito ? 'C' : 'A',
      FACTURA_REF: seriefac && nofac ? `${seriefac} #${nofac}` : null,
      CREDITO: credito,
      ABONO: abono,
      SALDO: Math.round(saldoAcumulado * 1000) / 1000,
    };
  });

  const totalFacturas = facturas.reduce((s, f) => s + f.TOTALPRECIO, 0);
  const totalAbonos = abonos.reduce((s, a) => s + a.TOTALPRECIO, 0);
  const totalCreditos = movimientos.reduce((s, m) => s + m.CREDITO, 0);
  const totalAbonosMov = movimientos.reduce((s, m) => s + m.ABONO, 0);
  const totalSaldo = Math.round((totalCreditos - totalAbonosMov) * 1000) / 1000;

  return {
    cliente: {
      CODCLIENTE: clienteRow.CODCLIENTE,
      NEGOCIO: clienteRow.NEGOCIO ?? null,
      NOMBRECLIENTE: clienteRow.NOMBRECLIENTE ?? null,
      DIRCLIENTE: clienteRow.DIRCLIENTE ?? null,
      NIT: clienteRow.NIT ?? null,
      DOC_NOMCLIE: clienteRow.NOMBRECLIENTE ?? clienteRow.NEGOCIO ?? null,
    },
    facturas,
    abonos,
    movimientos,
    totales: {
      totalFacturas,
      totalAbonos,
      totalCreditos,
      totalAbonosMov,
      totalSaldo,
      countFacturas: facturas.length,
      countAbonos: abonos.length,
      countMovimientos: movimientos.length,
    },
    tiposAbono: TIPODOC_ABONO_CXC,
  };
}

module.exports = {
  fetchEstadoCuentaCliente,
};
