const { TIPODOC_FACTURA } = require('./corte-caja-docs');

const TIPODOC_CUENTAS_COBRAR = [...TIPODOC_FACTURA];
const SQL_TIPODOC_CUENTAS_COBRAR_IN = TIPODOC_CUENTAS_COBRAR.map((t) => `'${t}'`).join(', ');

/** Saldo por cobrar = DOC_SALDO menos abonos (DOC_ABONO). */
const SQL_DOC_SALDO_PENDIENTE = '(ISNULL(d.DOC_SALDO, 0) - ISNULL(d.DOC_ABONO, 0))';

module.exports = {
  TIPODOC_CUENTAS_COBRAR,
  SQL_TIPODOC_CUENTAS_COBRAR_IN,
  SQL_DOC_SALDO_PENDIENTE,
};