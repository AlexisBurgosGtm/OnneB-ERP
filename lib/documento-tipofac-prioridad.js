/**
 * TIPOFAC / PRIORIDAD en DOCUMENTOS (pedidos, cotizaciones, facturas).
 */

const TIPOFAC_VALUES = ['FEF', 'FAC', 'FEC'];
const TIPOFAC_DEFAULT = 'FEF';
const PRIORIDAD_VALUES = ['BAJA', 'MEDIA', 'ALTA'];
const PRIORIDAD_DEFAULT = 'BAJA';

/** TIPOFAC del pedido → tipodoc(s) a crear en facturación. */
const TIPOFAC_TO_TIPODOC = {
  FEF: ['FEF'],
  FAC: ['FAC'],
  FEC: ['FEC'],
  FES: ['FES'],
};

function normalizeTipofac(raw, { required = true } = {}) {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) {
    if (!required) return null;
    return TIPOFAC_DEFAULT;
  }
  if (!TIPOFAC_VALUES.includes(v) && v !== 'FES') {
    const err = new Error('TIPOFAC inválido (use FEF, FAC o FEC)');
    err.statusCode = 400;
    throw err;
  }
  return v;
}

function normalizePrioridad(raw, { required = true } = {}) {
  const v = String(raw ?? '').trim().toUpperCase();
  if (!v) {
    if (!required) return null;
    return PRIORIDAD_DEFAULT;
  }
  if (!PRIORIDAD_VALUES.includes(v)) {
    const err = new Error('PRIORIDAD inválida (use BAJA, MEDIA o ALTA)');
    err.statusCode = 400;
    throw err;
  }
  return v;
}

function tipodocsForTipofac(tipofac) {
  const key = String(tipofac || TIPOFAC_DEFAULT).trim().toUpperCase();
  return TIPOFAC_TO_TIPODOC[key] || TIPOFAC_TO_TIPODOC[TIPOFAC_DEFAULT];
}

module.exports = {
  TIPOFAC_VALUES,
  TIPOFAC_DEFAULT,
  PRIORIDAD_VALUES,
  PRIORIDAD_DEFAULT,
  TIPOFAC_TO_TIPODOC,
  normalizeTipofac,
  normalizePrioridad,
  tipodocsForTipofac,
};
