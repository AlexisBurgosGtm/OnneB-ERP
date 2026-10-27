const { INFILE_URLS } = require('./constants');
const {
  parseInfileCertifiedXml,
  parseInfileSignResponse,
  parseFelResultFromJson,
} = require('./parse-response');
const {
  wrapInfileFetchError,
  httpInfileError,
  bodyInfileError,
  mergeInfileErrors,
} = require('./infile-error');

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
  const step = 'certify-unified';
  let response;
  try {
    response = await fetch(INFILE_URLS.unified, {
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
  } catch (fetchErr) {
    throw wrapInfileFetchError(fetchErr, INFILE_URLS.unified, step);
  }

  const bodyText = await response.text();
  if (!response.ok) {
    throw httpInfileError(bodyText, response.status, step);
  }

  const json = (() => {
    try {
      return JSON.parse(bodyText);
    } catch {
      return null;
    }
  })();

  if (json) {
    try {
      const result = parseFelResultFromJson(json);
      if (result) return result;
    } catch (err) {
      throw bodyInfileError(bodyText, err.message, response.status, step);
    }
  }

  try {
    return parseInfileCertifiedXml(bodyText);
  } catch (err) {
    throw bodyInfileError(bodyText, err.message, response.status, step);
  }
}

async function signXml(xml, credenciales, { esAnulacion = false } = {}) {
  const auth = infileAuth(credenciales);
  const step = 'sign';
  const payload = {
    llave: auth.llaveFirma,
    archivo: Buffer.from(xml, 'utf8').toString('base64'),
    codigo: auth.llaveApi,
    alias: auth.usuarioFirma,
    es_anulacion: esAnulacion ? 'S' : 'N',
  };

  let response;
  try {
    response = await fetch(INFILE_URLS.sign, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (fetchErr) {
    throw wrapInfileFetchError(fetchErr, INFILE_URLS.sign, step);
  }

  const bodyText = await response.text();
  if (!response.ok) {
    throw httpInfileError(bodyText, response.status, step);
  }

  try {
    return parseInfileSignResponse(bodyText);
  } catch (err) {
    throw bodyInfileError(bodyText, err.message, response.status, step);
  }
}

async function certifySignedXml(signedXml, credenciales, identificador) {
  const auth = infileAuth(credenciales);
  const step = 'certify';
  const body = {
    nit_emisor: String(credenciales.EMISOR_NIT || '').replace(/[^0-9A-Za-z]/g, ''),
    correo_copia: '',
    xml_dte: Buffer.from(signedXml, 'utf8').toString('base64'),
  };

  let response;
  try {
    response = await fetch(INFILE_URLS.certify, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        usuario: auth.usuarioApi,
        llave: auth.llaveApi,
        identificador,
      },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    throw wrapInfileFetchError(fetchErr, INFILE_URLS.certify, step);
  }

  const bodyText = await response.text();
  if (!response.ok) {
    throw httpInfileError(bodyText, response.status, step);
  }

  const json = (() => {
    try {
      return JSON.parse(bodyText);
    } catch {
      return null;
    }
  })();

  if (json) {
    try {
      const result = parseFelResultFromJson(json);
      if (result) return result;
    } catch (err) {
      throw bodyInfileError(bodyText, err.message, response.status, step);
    }
    if (json.xml_dte) {
      const certifiedXml = Buffer.from(String(json.xml_dte), 'base64').toString('utf8');
      try {
        return parseInfileCertifiedXml(certifiedXml);
      } catch (err) {
        throw bodyInfileError(bodyText, err.message, response.status, step);
      }
    }
    if (json.xml_certificado) {
      const certifiedXml = Buffer.from(String(json.xml_certificado), 'base64').toString('utf8');
      try {
        return parseInfileCertifiedXml(certifiedXml);
      } catch (err) {
        throw bodyInfileError(bodyText, err.message, response.status, step);
      }
    }
  }

  try {
    return parseInfileCertifiedXml(bodyText);
  } catch (err) {
    throw bodyInfileError(bodyText, err.message, response.status, step);
  }
}

async function cancelSignedXml(signedXml, credenciales, identificador) {
  const auth = infileAuth(credenciales);
  const step = 'cancel';
  const body = {
    nit_emisor: String(credenciales.EMISOR_NIT || '').replace(/[^0-9A-Za-z]/g, ''),
    correo_copia: '',
    xml_dte: Buffer.from(signedXml, 'utf8').toString('base64'),
  };

  let response;
  try {
    response = await fetch(INFILE_URLS.cancel, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        usuario: auth.usuarioApi,
        llave: auth.llaveApi,
        identificador,
      },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    throw wrapInfileFetchError(fetchErr, INFILE_URLS.cancel, step);
  }

  const bodyText = await response.text();
  if (!response.ok) {
    throw httpInfileError(bodyText, response.status, step);
  }

  const json = (() => {
    try {
      return JSON.parse(bodyText);
    } catch {
      return null;
    }
  })();

  if (json) {
    try {
      const result = parseFelResultFromJson(json);
      if (result) return result;
    } catch (err) {
      throw bodyInfileError(bodyText, err.message, response.status, step);
    }
    if (json.xml_dte) {
      const certifiedXml = Buffer.from(String(json.xml_dte), 'base64').toString('utf8');
      try {
        return parseInfileCertifiedXml(certifiedXml);
      } catch (err) {
        throw bodyInfileError(bodyText, err.message, response.status, step);
      }
    }
  }

  try {
    return parseInfileCertifiedXml(bodyText);
  } catch (err) {
    throw bodyInfileError(bodyText, err.message, response.status, step);
  }
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
    mergeInfileErrors(separateErr, unifiedErr);
    const msg = separateErr.message || String(separateErr);
    if (unifiedErr && unifiedErr.message && unifiedErr.message !== msg) {
      separateErr.message = `${msg} (unificado: ${unifiedErr.message})`;
    }
    throw separateErr;
  }
}

module.exports = { certifyWithInfile, cancelWithInfile, infileAuth };
