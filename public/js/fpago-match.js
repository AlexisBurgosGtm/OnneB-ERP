/**
 * Comparación de formas de pago vs total (cliente).
 * Misma regla que lib/fpago-match.js: 3 decimales + tolerancia 0.01.
 */
(function (global) {
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

  global.FpagoMatch = {
    FPAGO_DECIMALS,
    FPAGO_TOLERANCE,
    roundFpago,
    fpagoAmountsMatch,
  };
})(typeof window !== 'undefined' ? window : globalThis);
