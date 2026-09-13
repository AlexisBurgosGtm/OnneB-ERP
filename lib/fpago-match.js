/**
 * Comparación de formas de pago vs total del documento.
 * DB: Decimal(18,3). UI suele usar step 0.01 → puede haber hasta ~0.005 de desfase.
 * Se ignora ruido tras el 3er decimal y se tolera hasta 1 centavo.
 */
const FPAGO_DECIMALS = 3;
const FPAGO_TOLERANCE = 0.01;

function roundFpago(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** FPAGO_DECIMALS;
  return Math.round(x * f) / f;
}

function fpagoAmountsMatch(sum, total) {
  return Math.abs(roundFpago(sum) - roundFpago(total)) <= FPAGO_TOLERANCE + 1e-9;
}

module.exports = {
  FPAGO_DECIMALS,
  FPAGO_TOLERANCE,
  roundFpago,
  fpagoAmountsMatch,
};
