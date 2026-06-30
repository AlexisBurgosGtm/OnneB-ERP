const { STATUS_OPERADO } = require('./documento-status');
const {
  SQL_TIPODOC_CUENTAS_PAGAR_IN,
  SQL_ABONO_CXP_FILTER,
  TIPODOC_ABONO_CXP,
} = require('./cuentas-pagar-docs');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapCompraRow(r) {
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

function mapPagoRow(r) {
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
    COMPRA_REF: seriefac && nofac ? `${seriefac} #${nofac}` : seriefac || nofac || null,
    USUARIO: r.USUARIO ?? null,
    OBS: r.OBS ?? null,
  };
}

async function fetchEstadoCuentaProveedor(pool, sql, empnit, codprov) {
  const cod = parseInt(codprov, 10);
  if (Number.isNaN(cod) || cod <= 0) {
    const err = new Error('Código de proveedor inválido');
    err.statusCode = 400;
    throw err;
  }

  const proveedorRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROV', sql.Int, cod)
    .query(`
      SELECT TOP 1
        p.CODPROV,
        p.EMPRESA,
        p.RAZONSOCIAL,
        p.DIRECCION,
        p.NIT
      FROM dbo.PROVEEDORES p
      WHERE p.EMPNIT = @EMPNIT AND p.CODPROV = @CODPROV
    `);
  const proveedorRow = proveedorRes.recordset[0];
  if (!proveedorRow) {
    const err = new Error('Proveedor no encontrado');
    err.statusCode = 404;
    throw err;
  }

  const comprasRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROV', sql.Int, cod)
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
        AND d.CODCLIENTE = @CODPROV
        AND t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_PAGAR_IN})
        AND d.STATUS = '${STATUS_OPERADO}'
        AND ISNULL(d.CONCRE, 'CON') = 'CRE'
      ORDER BY d.FECHA DESC, d.CORRELATIVO DESC
    `);

  const pagosRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROV', sql.Int, cod)
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
        AND d.CODCLIENTE = @CODPROV
        AND d.STATUS = '${STATUS_OPERADO}'
        AND ${SQL_ABONO_CXP_FILTER}
      ORDER BY d.FECHA DESC, d.HORA DESC, d.CORRELATIVO DESC
    `);

  const movimientosRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROV', sql.Int, cod)
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
          WHEN t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_PAGAR_IN}) THEN 'C'
          ELSE 'A'
        END AS MOV
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      WHERE d.EMPNIT = @EMPNIT
        AND d.CODCLIENTE = @CODPROV
        AND d.STATUS = '${STATUS_OPERADO}'
        AND (
          (t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_PAGAR_IN}) AND ISNULL(d.CONCRE, 'CON') = 'CRE')
          OR ${SQL_ABONO_CXP_FILTER}
        )
      ORDER BY d.ID ASC
    `);

  const compras = comprasRes.recordset.map(mapCompraRow);
  const pagos = pagosRes.recordset.map(mapPagoRow);

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
      COMPRA_REF: seriefac && nofac ? `${seriefac} #${nofac}` : null,
      CREDITO: credito,
      ABONO: abono,
      SALDO: Math.round(saldoAcumulado * 1000) / 1000,
    };
  });

  const totalCompras = compras.reduce((s, f) => s + f.TOTALPRECIO, 0);
  const totalPagos = pagos.reduce((s, a) => s + a.TOTALPRECIO, 0);
  const totalCreditos = movimientos.reduce((s, m) => s + m.CREDITO, 0);
  const totalAbonosMov = movimientos.reduce((s, m) => s + m.ABONO, 0);
  const totalSaldo = Math.round((totalCreditos - totalAbonosMov) * 1000) / 1000;

  return {
    proveedor: {
      CODPROV: proveedorRow.CODPROV,
      EMPRESA: proveedorRow.EMPRESA ?? null,
      RAZONSOCIAL: proveedorRow.RAZONSOCIAL ?? null,
      DIRECCION: proveedorRow.DIRECCION ?? null,
      NIT: proveedorRow.NIT ?? null,
      DOC_NOMCLIE: proveedorRow.RAZONSOCIAL ?? proveedorRow.EMPRESA ?? null,
    },
    compras,
    pagos,
    movimientos,
    totales: {
      totalCompras,
      totalPagos,
      totalCreditos,
      totalAbonosMov,
      totalSaldo,
      countCompras: compras.length,
      countPagos: pagos.length,
      countMovimientos: movimientos.length,
    },
    tiposPago: TIPODOC_ABONO_CXP,
  };
}

module.exports = {
  fetchEstadoCuentaProveedor,
};
