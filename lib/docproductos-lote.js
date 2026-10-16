/**
 * Campos de lote en líneas de documento (NOLOTE / FVENCLOTE — no usar NOSERIE).
 * Insert en documentos desactivado hasta integración POS/UI (fase posterior).
 */
const sql = require('mssql');

/** Cuando sea true, facturación/compras incluirán NOLOTE/FVENCLOTE en INSERT. */
const LOTES_INTEGRADOS_EN_DOCUMENTOS = false;

function normalizeNolote(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s.toUpperCase() === 'SN') return null;
  return s.slice(0, 50);
}

function normalizeFvencLote(raw) {
  const iso = String(raw ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function readLineLoteFields(body) {
  return {
    nolote: normalizeNolote(body?.NOLOTE ?? body?.nolote),
    fvencLote: normalizeFvencLote(body?.FVENCLOTE ?? body?.fvencLote),
  };
}

function inventarioOptsFromLoteFields(fields, codbodega = 0) {
  if (!fields?.nolote) return {};
  return {
    nolote: fields.nolote,
    fvencLote: fields.fvencLote,
    codbodega: Number(codbodega) || 0,
  };
}

function inventarioOptsFromLineRow(line, fallbackBodega = 0) {
  const nolote = normalizeNolote(line?.NOLOTE);
  if (!nolote) return {};
  const bodega =
    line?.CODBODEGAENTRADA ?? line?.CODBODEGASALIDA ?? line?.CODBODEGA ?? fallbackBodega;
  return inventarioOptsFromLoteFields(
    { nolote, fvencLote: line?.FVENCLOTE ?? line?.fvencLote },
    bodega
  );
}

function bindDocproductosLoteInputs(request, fields) {
  request.input('NOLOTE', sql.NVarChar(50), fields.nolote);
  request.input('FVENCLOTE', sql.Date, fields.fvencLote);
}

const INSERT_LOTE_COLUMNS = ', NOLOTE, FVENCLOTE';
const INSERT_LOTE_VALUES = ', @NOLOTE, @FVENCLOTE';

function insertLoteSqlParts() {
  if (!LOTES_INTEGRADOS_EN_DOCUMENTOS) {
    return { columns: '', values: '' };
  }
  return { columns: INSERT_LOTE_COLUMNS, values: INSERT_LOTE_VALUES };
}

function bindDocproductosLoteInputsIfEnabled(request, fields) {
  if (!LOTES_INTEGRADOS_EN_DOCUMENTOS) return;
  bindDocproductosLoteInputs(request, fields);
}

function inventarioOptsFromLoteFieldsIfEnabled(fields, codbodega = 0) {
  if (!LOTES_INTEGRADOS_EN_DOCUMENTOS) return {};
  return inventarioOptsFromLoteFields(fields, codbodega);
}

function inventarioOptsFromLineRowIfEnabled(line, fallbackBodega = 0) {
  if (!LOTES_INTEGRADOS_EN_DOCUMENTOS) return {};
  return inventarioOptsFromLineRow(line, fallbackBodega);
}

module.exports = {
  LOTES_INTEGRADOS_EN_DOCUMENTOS,
  readLineLoteFields,
  inventarioOptsFromLoteFields,
  inventarioOptsFromLineRow,
  bindDocproductosLoteInputs,
  insertLoteSqlParts,
  bindDocproductosLoteInputsIfEnabled,
  inventarioOptsFromLoteFieldsIfEnabled,
  inventarioOptsFromLineRowIfEnabled,
  INSERT_LOTE_COLUMNS,
  INSERT_LOTE_VALUES,
};
