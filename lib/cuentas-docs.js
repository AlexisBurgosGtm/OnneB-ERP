const { TIPODOC_FACTURA, TIPODOC_DEVOLUCION } = require('./corte-caja-docs');

const TIPODOC_CUENTAS_COBRAR = [...TIPODOC_FACTURA];
const SQL_TIPODOC_CUENTAS_COBRAR_IN = TIPODOC_CUENTAS_COBRAR.map((t) => `'${t}'`).join(', ');

/** Abonos / créditos aplicados a cuentas por cobrar. */
const TIPODOC_ABONO_CXC = ['RCC', ...TIPODOC_DEVOLUCION];
const SQL_TIPODOC_ABONO_CXC_IN = TIPODOC_ABONO_CXC.map((t) => `'${t}'`).join(', ');

/** Notas de crédito (DEV, FNC). */
const SQL_TIPODOC_DEVOLUCION_IN = TIPODOC_DEVOLUCION.map((t) => `'${t}'`).join(', ');

/**
 * EXISTS: la nota (alias `d`) referencia (SERIEFAC/NOFAC) una factura
 * al crédito (CONCRE = CRE) operada.
 */
const SQL_EXISTS_FACTURA_CRE_REF = `
  EXISTS (
    SELECT 1
    FROM dbo.DOCUMENTOS f
    INNER JOIN dbo.TIPODOCUMENTOS tf ON tf.EMPNIT = f.EMPNIT AND tf.CODDOC = f.CODDOC
    WHERE f.EMPNIT = d.EMPNIT
      AND LTRIM(RTRIM(f.CODDOC)) = LTRIM(RTRIM(d.SERIEFAC))
      AND TRY_CAST(LTRIM(RTRIM(d.NOFAC)) AS DECIMAL(18, 0)) = f.CORRELATIVO
      AND tf.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN})
      AND ISNULL(f.CONCRE, 'CON') = 'CRE'
      AND f.STATUS = 'O'
  )
`;

/** Saldo por cobrar = DOC_SALDO menos abonos (DOC_ABONO). */
const SQL_DOC_SALDO_PENDIENTE = '(ISNULL(d.DOC_SALDO, 0) - ISNULL(d.DOC_ABONO, 0))';

/** Solo documentos con saldo pendiente real (> 0). */
const SQL_DOC_SALDO_PENDIENTE_POSITIVO = `${SQL_DOC_SALDO_PENDIENTE} > 0.005`;

/** Documento referencia factura por SERIEFAC (CODDOC) y NOFAC (correlativo). */
const SQL_MATCH_FACTURA_REF = `
  LTRIM(RTRIM(d.SERIEFAC)) = LTRIM(RTRIM(@SERIEFAC))
  AND (
    LTRIM(RTRIM(d.NOFAC)) = LTRIM(RTRIM(@NOFAC))
    OR TRY_CAST(LTRIM(RTRIM(d.NOFAC)) AS DECIMAL(18, 0)) = @FAC_CORRELATIVO
  )
`;

module.exports = {
  TIPODOC_CUENTAS_COBRAR,
  SQL_TIPODOC_CUENTAS_COBRAR_IN,
  TIPODOC_ABONO_CXC,
  SQL_TIPODOC_ABONO_CXC_IN,
  SQL_TIPODOC_DEVOLUCION_IN,
  SQL_EXISTS_FACTURA_CRE_REF,
  SQL_DOC_SALDO_PENDIENTE,
  SQL_DOC_SALDO_PENDIENTE_POSITIVO,
  SQL_MATCH_FACTURA_REF,
};