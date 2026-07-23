const { loadFelCredenciales } = require('./credenciales');
const { infileAuth } = require('./infile-client');

const NIT_LOOKUP_URL = 'https://consultareceptores.feel.com.gt/rest/action';
const CUI_LOGIN_URL = 'https://certificador.feel.com.gt/api/v2/servicios/externos/login';
const CUI_LOOKUP_URL = 'https://certificador.feel.com.gt/api/v2/servicios/externos/cui';

/** @type {{ token: string|null, expiresAt: number, key: string }} */
const cuiTokenCache = { token: null, expiresAt: 0, key: '' };

function normalizeIdentificador(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9K]/g, '');
}

/** DPI/CUI: más de 12 dígitos. NIT casi nunca supera esa longitud. */
function isCui(ident) {
  const s = String(ident || '');
  return /^\d+$/.test(s) && s.length > 12;
}

/** Quita solo comas y puntos del nombre devuelto por SAT. */
function cleanNombreSat(nombre) {
  return String(nombre || '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickString(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

function mapLookupResult(identificador, data, fallbackMensaje = '') {
  const nombre = cleanNombreSat(
    pickString(data, ['nombre', 'NOMBRE', 'name', 'NAME', 'razon_social', 'RAZON_SOCIAL'])
  );
  const mensaje = pickString(data, ['mensaje', 'MENSAJE', 'message', 'MESSAGE', 'descripcion', 'DESCRIPCION']);
  const nit = pickString(data, ['nit', 'NIT', 'cui', 'CUI']) || identificador;
  return {
    identificador: nit,
    nombre,
    mensaje: mensaje || fallbackMensaje,
    tipo: isCui(identificador) ? 'CUI' : 'NIT',
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('Respuesta inválida del servicio Infile');
    err.statusCode = 502;
    throw err;
  }
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = await parseJsonResponse(response);
  return { response, data };
}

function felCredencialesConsulta(credenciales) {
  const auth = infileAuth(credenciales);
  return {
    emisor_codigo: String(credenciales.CERTIFICACION_USUARIO || auth.usuarioApi || '').trim(),
    emisor_clave: String(credenciales.CERTIFICACION_LLAVE || auth.llaveApi || '').trim(),
    usuario: String(credenciales.CERTIFICACION_USUARIO || auth.usuarioApi || '').trim(),
    llave: String(credenciales.CERTIFICACION_LLAVE || auth.llaveApi || '').trim(),
    usuarioApi: auth.usuarioApi,
    llaveApi: auth.llaveApi,
  };
}

async function lookupNitInfile(credenciales, nit) {
  const creds = felCredencialesConsulta(credenciales);
  const attempts = [
    {
      headers: {},
      body: {
        emisor_codigo: creds.emisor_codigo,
        emisor_clave: creds.emisor_clave,
        nit_consulta: nit,
      },
    },
    {
      headers: { UsuarioApi: creds.usuarioApi, LlaveApi: creds.llaveApi },
      body: { nit },
    },
    {
      headers: {},
      body: {
        usuario: creds.usuario,
        llave: creds.llave,
        nit,
      },
    },
  ];

  let lastMensaje = '';
  for (const attempt of attempts) {
    const { response, data } = await postJson(NIT_LOOKUP_URL, attempt.body, attempt.headers);
    const result = mapLookupResult(nit, data);
    lastMensaje = result.mensaje || lastMensaje;
    if (result.nombre) return result;
    if (response.ok && result.mensaje && !/credencial/i.test(result.mensaje)) {
      return result;
    }
  }

  const err = new Error(lastMensaje || 'No se encontró información del NIT en SAT');
  err.statusCode = 404;
  throw err;
}

async function getCuiToken(credenciales) {
  const creds = felCredencialesConsulta(credenciales);
  const cacheKey = `${creds.usuario}|${creds.llave}`;
  const now = Date.now();
  if (cuiTokenCache.token && cuiTokenCache.key === cacheKey && cuiTokenCache.expiresAt > now) {
    return cuiTokenCache.token;
  }

  const loginBodies = [
    { usuario: creds.usuario, llave: creds.llave },
    { usuario: creds.usuario, clave: creds.llave },
    { username: creds.usuario, password: creds.llave },
  ];

  let token = '';
  for (const body of loginBodies) {
    const { data } = await postJson(CUI_LOGIN_URL, body);
    token = pickString(data, ['token', 'TOKEN', 'jwt', 'JWT', 'access_token', 'ACCESS_TOKEN']);
    if (token) break;
    const nested = data.data || data.result || data.respuesta;
    token = pickString(nested, ['token', 'TOKEN', 'jwt', 'JWT', 'access_token', 'ACCESS_TOKEN']);
    if (token) break;
  }

  if (!token) {
    const err = new Error('No se pudo autenticar con Infile para consulta de CUI');
    err.statusCode = 502;
    throw err;
  }

  cuiTokenCache.token = token;
  cuiTokenCache.key = cacheKey;
  cuiTokenCache.expiresAt = now + 2 * 60 * 60 * 1000;
  return token;
}

async function lookupCuiInfile(credenciales, cui) {
  const token = await getCuiToken(credenciales);
  const { data } = await postJson(
    CUI_LOOKUP_URL,
    { cui, CUI: cui },
    { Authorization: `Bearer ${token}` }
  );
  const result = mapLookupResult(cui, data);
  if (!result.nombre) {
    const nested = data.data || data.result || data.persona || data.contribuyente;
    if (nested && typeof nested === 'object') {
      const nestedResult = mapLookupResult(cui, nested);
      if (nestedResult.nombre) return nestedResult;
    }
    const err = new Error(result.mensaje || 'No se encontró información del CUI en SAT');
    err.statusCode = 404;
    throw err;
  }
  return result;
}

async function lookupContribuyente(pool, empnit, identificadorRaw) {
  const identificador = normalizeIdentificador(identificadorRaw);
  if (!identificador) {
    const err = new Error('Identificador inválido');
    err.statusCode = 400;
    throw err;
  }

  const credenciales = await loadFelCredenciales(pool, empnit);
  if (isCui(identificador)) {
    return lookupCuiInfile(credenciales, identificador);
  }
  return lookupNitInfile(credenciales, identificador);
}

module.exports = {
  normalizeIdentificador,
  isCui,
  cleanNombreSat,
  lookupContribuyente,
};
