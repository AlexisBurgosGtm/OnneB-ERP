function roundMoney(value, decimals = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanNit(value) {
  return String(value ?? '')
    .trim()
    .replace(/[^0-9A-Za-z]/g, '')
    .toUpperCase();
}

function formatFelDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = pad(Math.floor(abs / 60));
  const mm = pad(abs % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`;
}

function formatFelDateOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function splitIvaFromTotal(total, hasIva = true, ivaFactor = 1.12) {
  const { splitIvaFromTotal: split } = require('../impuestos');
  return split(total, hasIva, ivaFactor);
}

/** Mínimo SAT para NumeroAcceso (9 dígitos). */
const SAT_NUMERO_ACCESO_MIN = 100000000;
const SAT_NUMERO_ACCESO_MAX = 999999999;

/** Asigna un entero estable en [min, max] a partir de un texto (EMPNIT, CODDOC, etc.). */
function stringToNumericCode(str, min, max) {
  const s = String(str ?? '').trim().toUpperCase();
  const digits = s.replace(/\D/g, '');
  let h = digits ? Number.parseInt(digits.slice(-8), 10) || 0 : 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  const span = max - min + 1;
  return min + (h % span);
}

/**
 * NumeroAcceso del XML (correlativo SAT, >= 100000000).
 * Combina códigos numéricos de EMPNIT y CODDOC + correlativo (9 dígitos).
 * No confundir con el identificador único de Infile (buildIdentificador).
 */
function buildNumeroAcceso(empnit, coddoc, correlativo) {
  const empCode = stringToNumericCode(empnit, 10, 99);
  const docCode = stringToNumericCode(`${empnit}|${coddoc}`, 10, 99);
  const corr = Math.abs(Math.trunc(Number(correlativo) || 0));
  const corrPart = corr <= 99999 ? corr : corr % 100000;

  let n = empCode * 10000000 + docCode * 100000 + corrPart;
  if (n < SAT_NUMERO_ACCESO_MIN) n += SAT_NUMERO_ACCESO_MIN;
  if (n > SAT_NUMERO_ACCESO_MAX) {
    n = SAT_NUMERO_ACCESO_MIN + (n % (SAT_NUMERO_ACCESO_MAX - SAT_NUMERO_ACCESO_MIN + 1));
  }
  return String(n);
}

/** Identificador único para Infile (EMPNIT + CODDOC + CORRELATIVO). */
function buildIdentificador(empnit, coddoc, correlativo) {
  const emp = String(empnit ?? '').trim();
  const doc = String(coddoc ?? '').trim();
  const corr = String(Math.trunc(Number(correlativo) || 0));
  return `${emp}_${doc}_${corr}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
}

module.exports = {
  roundMoney,
  escapeXml,
  cleanNit,
  formatFelDateTime,
  formatFelDateOnly,
  splitIvaFromTotal,
  buildNumeroAcceso,
  buildIdentificador,
};
