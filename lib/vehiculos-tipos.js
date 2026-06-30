const VEHICULOS_TIPOS = ['SEDAN', 'PICKUP', 'CABEZAL', 'PLATAFORMA'];

const VEHICULOS_TIPO_OPTIONS = VEHICULOS_TIPOS.map((v) => ({ value: v, label: v }));

function isVehiculoTipoValid(tipo) {
  const t = String(tipo || '').trim().toUpperCase();
  return VEHICULOS_TIPOS.includes(t);
}

function normalizeVehiculoTipo(tipo) {
  return String(tipo || '').trim().toUpperCase();
}

module.exports = {
  VEHICULOS_TIPOS,
  VEHICULOS_TIPO_OPTIONS,
  isVehiculoTipoValid,
  normalizeVehiculoTipo,
};
