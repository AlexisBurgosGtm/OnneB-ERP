/**
 * TOKEN de instalación (comunidad / host de actualizaciones).
 * Se lee de process.env.TOKEN al arrancar el proceso.
 */
function getAppToken() {
  const raw = process.env.TOKEN;
  if (raw === undefined || raw === null) return '';
  return String(raw).trim().replace(/^['"]|['"]$/g, '');
}

module.exports = { getAppToken };
