const { SETTING_OPCION, ensureSettingDefault, getSettingValue } = require('./settings');
const { roundMoney } = require('./libro-contable-utils');

const IVA_FACTOR_DEFAULT = 1.12;
const IVA_PORCENTAJE_DEFAULT = 12;
const RETENCION_IVA_PCT_DEFAULT = 15;
const RETENCION_ISR_PCT_DEFAULT = 5;

const IMPUESTOS_CONTABILIDAD = [
  {
    id: 'iva',
    opcion: SETTING_OPCION.CONFIGURACION_IVA,
    label: 'IVA general',
    icon: 'fa-percent',
    kind: 'iva_factor',
    defaultFactor: IVA_FACTOR_DEFAULT,
    defaultPct: IVA_PORCENTAJE_DEFAULT,
    step: '0.01',
    min: 0,
    max: 100,
    description:
      'Porcentaje de IVA incluido en precios con impuesto. Se usa al desglosar gravada e IVA en documentos, FEL y libros contables.',
  },
  {
    id: 'rtv',
    opcion: SETTING_OPCION.PORCENTAJE_RETENCION_IVA,
    label: 'Retención IVA',
    icon: 'fa-hand-holding-dollar',
    kind: 'porcentaje',
    defaultPct: RETENCION_IVA_PCT_DEFAULT,
    step: '0.01',
    min: 0,
    max: 100,
    description:
      'Porcentaje sobre el IVA (total − base gravada) para recalcular documentos de retención IVA (RTV).',
  },
  {
    id: 'rti',
    opcion: SETTING_OPCION.PORCENTAJE_RETENCION_ISR,
    label: 'Retención ISR',
    icon: 'fa-file-invoice-dollar',
    kind: 'porcentaje',
    defaultPct: RETENCION_ISR_PCT_DEFAULT,
    step: '0.01',
    min: 0,
    max: 100,
    description:
      'Porcentaje sobre la base imponible para recalcular documentos de retención ISR (RTI).',
  },
];

function parsePositiveNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function factorFromPorcentaje(pct) {
  const p = parsePositiveNumber(pct, IVA_PORCENTAJE_DEFAULT);
  return roundMoney(1 + p / 100);
}

function porcentajeFromFactor(factor) {
  const f = parsePositiveNumber(factor, IVA_FACTOR_DEFAULT);
  if (f <= 1) return 0;
  return roundMoney((f - 1) * 100);
}

/**
 * Regla general (Guatemala / SAT): el monto incluye IVA.
 *   Base  = Monto / factorIVA   (factor = 1 + %IVA/100, p. ej. 1.12)
 *   IVA   = Monto − Base
 * El %IVA sale de SETTINGS «CONFIGURACION IVA» (se guarda como factor).
 */
function splitIvaFromTotal(total, hasIva = true, ivaFactor = IVA_FACTOR_DEFAULT) {
  const t = roundMoney(total);
  const factor = parsePositiveNumber(ivaFactor, IVA_FACTOR_DEFAULT);
  if (!hasIva || factor <= 1) {
    return { gravable: 0, iva: 0, total: t, base: 0, monto: t };
  }
  if (t === 0) {
    return { gravable: 0, iva: 0, total: 0, base: 0, monto: 0 };
  }
  const gravable = roundMoney(t / factor);
  const iva = roundMoney(t - gravable);
  return { gravable, iva, total: t, base: gravable, monto: t };
}

/** Alias explícito de la regla: { monto, base, iva }. */
function desgloseIvaDeMonto(monto, ivaFactor = IVA_FACTOR_DEFAULT) {
  const d = splitIvaFromTotal(monto, true, ivaFactor);
  return { monto: d.monto, base: d.base, iva: d.iva };
}

/**
 * Desglose SAT Guatemala: base = (total - exento) / factor ; IVA = (total - exento) - base.
 * El total se asume con IVA incluido (factor tip. 1.12).
 */
function desgloseIvaIncluyente(totalIncluyente, exento = 0, ivaFactor = IVA_FACTOR_DEFAULT) {
  const total = roundMoney(Number(totalIncluyente) || 0);
  const exentoRaw = roundMoney(Number(exento) || 0);
  const exentoClamped = Math.min(Math.max(exentoRaw, 0), Math.max(total, 0));
  const gravadoIncluyente = roundMoney(Math.max(0, total - exentoClamped));
  const { gravable, iva } = splitIvaFromTotal(gravadoIncluyente, gravadoIncluyente > 0, ivaFactor);
  return {
    total,
    exento: exentoClamped,
    gravable,
    iva,
  };
}

async function getIvaFactor(pool) {
  await ensureSettingDefault(pool, SETTING_OPCION.CONFIGURACION_IVA);
  const raw = await getSettingValue(pool, SETTING_OPCION.CONFIGURACION_IVA);
  const factor = parsePositiveNumber(raw, IVA_FACTOR_DEFAULT);
  return factor > 1 ? factor : IVA_FACTOR_DEFAULT;
}

async function getRetencionIvaPorcentaje(pool) {
  await ensureSettingDefault(pool, SETTING_OPCION.PORCENTAJE_RETENCION_IVA);
  const raw = await getSettingValue(pool, SETTING_OPCION.PORCENTAJE_RETENCION_IVA);
  return parsePositiveNumber(raw, RETENCION_IVA_PCT_DEFAULT);
}

async function getRetencionIsrPorcentaje(pool) {
  await ensureSettingDefault(pool, SETTING_OPCION.PORCENTAJE_RETENCION_ISR);
  const raw = await getSettingValue(pool, SETTING_OPCION.PORCENTAJE_RETENCION_ISR);
  return parsePositiveNumber(raw, RETENCION_ISR_PCT_DEFAULT);
}

async function getImpuestosContabilidad(pool) {
  const ivaFactor = await getIvaFactor(pool);
  const rtvPct = await getRetencionIvaPorcentaje(pool);
  const rtiPct = await getRetencionIsrPorcentaje(pool);

  return {
    iva: {
      opcion: SETTING_OPCION.CONFIGURACION_IVA,
      porcentaje: porcentajeFromFactor(ivaFactor),
      factor: ivaFactor,
    },
    retencionIva: {
      opcion: SETTING_OPCION.PORCENTAJE_RETENCION_IVA,
      porcentaje: rtvPct,
    },
    retencionIsr: {
      opcion: SETTING_OPCION.PORCENTAJE_RETENCION_ISR,
      porcentaje: rtiPct,
    },
  };
}

async function saveImpuestosContabilidad(pool, body = {}) {
  const { setSettingValue, ensureSettingDefault } = require('./settings');
  const updates = [];

  if (body.ivaPorcentaje !== undefined) {
    const pct = parsePositiveNumber(body.ivaPorcentaje, IVA_PORCENTAJE_DEFAULT);
    if (pct > 100) {
      const err = new Error('El porcentaje de IVA no puede ser mayor a 100');
      err.statusCode = 400;
      throw err;
    }
    const factor = factorFromPorcentaje(pct);
    await ensureSettingDefault(pool, SETTING_OPCION.CONFIGURACION_IVA);
    await setSettingValue(pool, SETTING_OPCION.CONFIGURACION_IVA, String(factor));
    updates.push('iva');
  }

  if (body.retencionIvaPorcentaje !== undefined) {
    const pct = parsePositiveNumber(body.retencionIvaPorcentaje, RETENCION_IVA_PCT_DEFAULT);
    if (pct > 100) {
      const err = new Error('El porcentaje de retención IVA no puede ser mayor a 100');
      err.statusCode = 400;
      throw err;
    }
    await ensureSettingDefault(pool, SETTING_OPCION.PORCENTAJE_RETENCION_IVA);
    await setSettingValue(pool, SETTING_OPCION.PORCENTAJE_RETENCION_IVA, String(pct));
    updates.push('retencionIva');
  }

  if (body.retencionIsrPorcentaje !== undefined) {
    const pct = parsePositiveNumber(body.retencionIsrPorcentaje, RETENCION_ISR_PCT_DEFAULT);
    if (pct > 100) {
      const err = new Error('El porcentaje de retención ISR no puede ser mayor a 100');
      err.statusCode = 400;
      throw err;
    }
    await ensureSettingDefault(pool, SETTING_OPCION.PORCENTAJE_RETENCION_ISR);
    await setSettingValue(pool, SETTING_OPCION.PORCENTAJE_RETENCION_ISR, String(pct));
    updates.push('retencionIsr');
  }

  return { updates, impuestos: await getImpuestosContabilidad(pool) };
}

module.exports = {
  IMPUESTOS_CONTABILIDAD,
  IVA_FACTOR_DEFAULT,
  IVA_PORCENTAJE_DEFAULT,
  RETENCION_IVA_PCT_DEFAULT,
  RETENCION_ISR_PCT_DEFAULT,
  parsePositiveNumber,
  factorFromPorcentaje,
  porcentajeFromFactor,
  splitIvaFromTotal,
  desgloseIvaDeMonto,
  desgloseIvaIncluyente,
  getIvaFactor,
  getRetencionIvaPorcentaje,
  getRetencionIsrPorcentaje,
  getImpuestosContabilidad,
  saveImpuestosContabilidad,
};
