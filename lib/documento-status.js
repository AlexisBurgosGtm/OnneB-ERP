/** Estados de DOCUMENTOS: O operado, I bloqueado, A anulado (excluido de inventario e informes). */
const STATUS_OPERADO = 'O';
const STATUS_BLOQUEADO = 'I';
const STATUS_ANULADO = 'A';

function normalizeStatus(status) {
  return String(status || '').trim().toUpperCase();
}

function isStatusEditable(status) {
  return normalizeStatus(status) === STATUS_OPERADO;
}

function isCorteCajaCerrado(corte) {
  return String(corte || 'NO').trim().toUpperCase() === 'SI';
}

/** Operado y no incluido aún en un corte de caja. */
function isDocumentoEditable(status, corte) {
  return isStatusEditable(status) && !isCorteCajaCerrado(corte);
}

function isStatusOperado(status) {
  return normalizeStatus(status) === STATUS_OPERADO;
}

function isStatusExcludedFromReports(status) {
  const s = normalizeStatus(status);
  return s === STATUS_ANULADO || s === STATUS_BLOQUEADO;
}

const SQL_STATUS_EDITABLE = `STATUS = '${STATUS_OPERADO}'`;
const SQL_DOCUMENTO_EDITABLE = `STATUS = '${STATUS_OPERADO}' AND ISNULL(CORTE, 'NO') <> 'SI'`;
const SQL_STATUS_INFORMES = `STATUS = '${STATUS_OPERADO}'`;

module.exports = {
  STATUS_OPERADO,
  STATUS_BLOQUEADO,
  STATUS_ANULADO,
  normalizeStatus,
  isStatusEditable,
  isCorteCajaCerrado,
  isDocumentoEditable,
  isStatusOperado,
  isStatusExcludedFromReports,
  SQL_STATUS_EDITABLE,
  SQL_DOCUMENTO_EDITABLE,
  SQL_STATUS_INFORMES,
};
