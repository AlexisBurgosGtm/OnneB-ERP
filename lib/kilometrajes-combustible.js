const KILOMETRAJES_COMBUSTIBLE_TIPOS = ['DIESEL', 'SUPER', 'REGULAR', 'PREMIUM'];

function isKilometrajeCombustibleValid(tipo) {
  const t = String(tipo || '').trim().toUpperCase();
  return KILOMETRAJES_COMBUSTIBLE_TIPOS.includes(t);
}

function normalizeKilometrajeCombustible(tipo) {
  return String(tipo || '').trim().toUpperCase();
}

module.exports = {
  KILOMETRAJES_COMBUSTIBLE_TIPOS,
  isKilometrajeCombustibleValid,
  normalizeKilometrajeCombustible,
};
