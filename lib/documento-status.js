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

/** Factura interna/normal (no FEL). */
function isTipodocFacturaNormal(tipodoc) {
  return String(tipodoc || '').trim().toUpperCase() === 'FAC';
}

/**
 * FAC operada en corte de caja: se permite editar líneas (agregar/cambiar/quitar/precios).
 * Finalizar y otros flujos que exigen documento «sin corte» siguen usando isDocumentoEditable.
 */
function canEditFacturaNormalConCorte(status, corte, tipodoc) {
  return (
    isStatusEditable(status) &&
    isCorteCajaCerrado(corte) &&
    isTipodocFacturaNormal(tipodoc)
  );
}

/** @deprecated Use canEditFacturaNormalConCorte */
function canEditPrecioFacturaNormalConCorte(status, corte, tipodoc) {
  return canEditFacturaNormalConCorte(status, corte, tipodoc);
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

/**
 * Tipos de documento visibles en dashboards/informes / CXC.
 * REPORTES = 'NO' se excluye; NULL o vacío se trata como 'SI'.
 * Prefijo de alias típico: t (TIPODOCUMENTOS). Use sqlTipodocReportesSi(alias) si el alias no es `t`.
 */
function sqlTipodocReportesSi(alias = 't') {
  const a = String(alias || 't').trim() || 't';
  return `UPPER(ISNULL(NULLIF(LTRIM(RTRIM(${a}.REPORTES)), ''), 'SI')) = 'SI'`;
}

const SQL_TIPODOC_REPORTES_SI = sqlTipodocReportesSi('t');

/** Filtro opcional por STATUS en listados de pedidos. Vacío = todos los estados. */
function sqlPedidosListStatusFilter(statusRaw, { defaultAll = false } = {}) {
  const fallback = defaultAll ? 'ALL' : STATUS_OPERADO;
  const raw = String(statusRaw ?? fallback).trim().toUpperCase();
  if (!raw || raw === 'ALL' || raw === 'TODOS' || raw === '*') return '';
  const allowed = [STATUS_OPERADO, STATUS_BLOQUEADO, STATUS_ANULADO];
  if (!allowed.includes(raw)) return defaultAll ? '' : ` AND d.STATUS = '${STATUS_OPERADO}'`;
  return ` AND d.STATUS = '${raw}'`;
}

function resolvePedidosListStatusLabel(statusRaw, { defaultAll = false } = {}) {
  const fallback = defaultAll ? 'ALL' : STATUS_OPERADO;
  const raw = String(statusRaw ?? fallback).trim().toUpperCase();
  if (!raw || raw === 'ALL' || raw === 'TODOS' || raw === '*') return 'ALL';
  const allowed = [STATUS_OPERADO, STATUS_BLOQUEADO, STATUS_ANULADO];
  return allowed.includes(raw) ? raw : defaultAll ? 'ALL' : STATUS_OPERADO;
}

module.exports = {
  STATUS_OPERADO,
  STATUS_BLOQUEADO,
  STATUS_ANULADO,
  normalizeStatus,
  isStatusEditable,
  isCorteCajaCerrado,
  isDocumentoEditable,
  isTipodocFacturaNormal,
  canEditFacturaNormalConCorte,
  canEditPrecioFacturaNormalConCorte,
  isStatusOperado,
  isStatusExcludedFromReports,
  SQL_STATUS_EDITABLE,
  SQL_DOCUMENTO_EDITABLE,
  SQL_STATUS_INFORMES,
  SQL_TIPODOC_REPORTES_SI,
  sqlTipodocReportesSi,
  sqlPedidosListStatusFilter,
  resolvePedidosListStatusLabel,
};
