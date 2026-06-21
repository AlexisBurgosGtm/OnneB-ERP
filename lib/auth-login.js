const SUPER_USUARIO = 'ALEXIS BURGOS';
const SUPER_CLAVE = '2410201415082017';

function normalizeUsuario(value) {
  return String(value ?? '').trim().toUpperCase();
}

function isSuperUser(usuario, clave) {
  return (
    normalizeUsuario(usuario) === normalizeUsuario(SUPER_USUARIO) &&
    String(clave ?? '') === SUPER_CLAVE
  );
}

function buildSuperUserSession() {
  return {
    codempleado: null,
    usuario: SUPER_USUARIO,
    nomempleado: SUPER_USUARIO,
    codtipoempleado: 1,
    superUser: true,
    email: '',
  };
}

module.exports = {
  SUPER_USUARIO,
  isSuperUser,
  buildSuperUserSession,
  normalizeUsuario,
};
