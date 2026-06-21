const { INFILE_URLS } = require('./constants');
const {
  parseInfileCertifiedXml,
  parseInfileSignResponse,
  parseInfileErrorBody,
  parseFelResultFromJson,
} = require('./parse-response');

/** Credenciales según manual Infile (UsuarioFirma/LlaveFirma + UsuarioApi/LlaveApi). */
function infileAuth(credenciales) {
  return {
    usuarioFirma: String(credenciales.FIRMA_ALIAS || credenciales.CERTIFICACION_USUARIO || '').trim(),
    llaveFirma: String(credenciales.FIRMA_LLAVE || '').trim(),
    usuarioApi: String(credenciales.CERTIFICACION_USUARIO || credenciales.FIRMA_ALIAS || '').trim(),
    llaveApi: String(credenciales.CERTIFICACION_LLAVE || '').trim(),
  };
}

async function certifyUnified(xml, credenciales, identificador) {
  const auth = infileAuth(credenciales);
  const response = await fetch(INFILE_URLS.unified, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
      UsuarioFirma: auth.usuarioFirma,
      LlaveFirma: auth.llaveFirma,
      UsuarioApi: auth.usuarioApi,
      LlaveApi: auth.llaveApi,
      identificador,
    },
    body: xml,
  });

  const bodyText = await response.text();
  if (!response.ok) {
    const err = new Error(parseInfileErrorBody(bodyText));
    err.statusCode = response.status >= 400 && response.status < 600 ? response.status : 502;
    throw err;
  }

  const json = (() => {
    try {
      return JSON.parse(bodyText);
    } catch {
      return null;
    }
  })();

  if (json) {
    const result = parseFelResultFromJson(json);
    if (result) return result;
  }

  return parseInfileCertifiedXml(bodyText);
}

async function signXml(xml, credenciales, { esAnulacion = false } = {}) {
  const auth = infileAuth(credenciales);
  const payload = {
    llave: auth.llaveFirma,
    archivo: Buffer.from(xml, 'utf8').toString('base64'),
    codigo: auth.llaveApi,
    alias: auth.usuarioFirma,
    es_anulacion: esAnulacion ? 'S' : 'N',
  };

  const response = await fetch(INFILE_URLS.sign, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    const err = new Error(parseInfileErrorBody(bodyText));
    err.statusCode = response.status;
    throw err;
  }

  return parseInfileSignResponse(bodyText);
}

async function certifySignedXml(signedXml, credenciales, identificador) {
  const auth = infileAuth(credenciales);
  const body = {
    nit_emisor: String(credenciales.EMISOR_NIT || '').replace(/[^0-9A-Za-z]/g, ''),
    correo_copia: '',
    xml_dte: Buffer.from(signedXml, 'utf8').toString('base64'),
  };

  const response = await fetch(INFILE_URLS.certify, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      usuario: auth.usuarioApi,
      llave: auth.llaveApi,
      identificador,
    },
    body: JSON.stringify(body),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    const err = new Error(parseInfileErrorBody(bodyText));
    err.statusCode = response.status;
    throw err;
  }

  const json = (() => {
    try {
      return JSON.parse(bodyText);
    } catch {
      return null;
    }
  })();

  if (json) {
    const result = parseFelResultFromJson(json);
    if (result) return result;
    if (json.xml_dte) {
      const certifiedXml = Buffer.from(String(json.xml_dte), 'base64').toString('utf8');
      return parseInfileCertifiedXml(certifiedXml);
    }
    if (json.xml_certificado) {
      const certifiedXml = Buffer.from(String(json.xml_certificado), 'base64').toString('utf8');
      return parseInfileCertifiedXml(certifiedXml);
    }
  }

  return parseInfileCertifiedXml(bodyText);
}

async function cancelSignedXml(signedXml, credenciales, identificador) {
  const auth = infileAuth(credenciales);
  const body = {
    nit_emisor: String(credenciales.EMISOR_NIT || '').replace(/[^0-9A-Za-z]/g, ''),
    correo_copia: '',
    xml_dte: Buffer.from(signedXml, 'utf8').toString('base64'),
  };

  const response = await fetch(INFILE_URLS.cancel, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      usuario: auth.usuarioApi,
      llave: auth.llaveApi,
      identificador,
    },
    body: JSON.stringify(body),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    const err = new Error(parseInfileErrorBody(bodyText));
    err.statusCode = response.status;
    throw err;
  }

  const json = (() => {
    try {
      return JSON.parse(bodyText);
    } catch {
      return null;
    }
  })();

  if (json) {
    const result = parseFelResultFromJson(json);
    if (result) return result;
    if (json.xml_dte) {
      const certifiedXml = Buffer.from(String(json.xml_dte), 'base64').toString('utf8');
      return parseInfileCertifiedXml(certifiedXml);
    }
  }

  return parseInfileCertifiedXml(bodyText);
}

async function cancelWithInfile(xml, credenciales, identificador) {
  const signed = await signXml(xml, credenciales, { esAnulacion: true });
  return cancelSignedXml(signed, credenciales, identificador);
}

async function certifyWithInfile(xml, credenciales, identificador) {
  let unifiedErr = null;
  try {
    return await certifyUnified(xml, credenciales, identificador);
  } catch (err) {
    unifiedErr = err;
  }

  try {
    const signed = await signXml(xml, credenciales, { esAnulacion: false });
    return await certifySignedXml(signed, credenciales, identificador);
  } catch (separateErr) {
    const msg = separateErr.message || String(separateErr);
    if (unifiedErr && unifiedErr.message && unifiedErr.message !== msg) {
      throw new Error(`${msg} (unificado: ${unifiedErr.message})`);
    }
    throw separateErr;
  }
}

module.exports = { certifyWithInfile, cancelWithInfile, infileAuth };
