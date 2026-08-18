/**
 * Empresa de inicio (DEFAULT_EMPNIT).
 * Si no está vacía, el login solo muestra y admite esa empresa
 * (misma base de datos, varias instalaciones / clientes).
 */
function getDefaultEmpnit() {
  const raw = process.env.DEFAULT_EMPNIT;
  if (raw === undefined || raw === null) return '';
  return String(raw)
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function matchesDefaultEmpnit(empnit) {
  const def = getDefaultEmpnit();
  if (!def) return true;
  return String(empnit || '').trim().toUpperCase() === def.toUpperCase();
}

function assertEmpnitAllowed(empnit) {
  if (matchesDefaultEmpnit(empnit)) return;
  const err = new Error('Esta instalación solo admite la empresa configurada');
  err.statusCode = 403;
  throw err;
}

module.exports = {
  getDefaultEmpnit,
  matchesDefaultEmpnit,
  assertEmpnitAllowed,
};
