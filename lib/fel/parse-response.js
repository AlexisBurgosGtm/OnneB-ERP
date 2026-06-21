const { formatFelDateTime } = require('./utils');

function pickTagValue(xml, tagNames) {
  for (const tag of tagNames) {
    const re = new RegExp(`<(?:[\\w.-]+:)?${tag}[^>]*>([^<]+)<\\/(?:[\\w.-]+:)?${tag}>`, 'i');
    const m = xml.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

function pickAttr(xml, tag, attr) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}[^>]*\\b${attr}="([^"]+)"`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function tryParseJson(text) {
  try {
    const data = JSON.parse(String(text || ''));
    return typeof data === 'object' && data !== null ? data : null;
  } catch {
    return null;
  }
}

function infileErrorFromJson(data) {
  if (!data || typeof data !== 'object') return null;

  const codigo = String(data.codigo ?? data.codigo_error ?? '').trim();
  if (codigo && codigo !== '0') {
    return String(data.mensaje ?? data.descripcion ?? data.Descripcion ?? codigo);
  }

  if (data.resultado === false) {
    const errores = data.descripcion_errores;
    if (Array.isArray(errores) && errores.length) {
      const msgs = errores
        .map((e) => (typeof e === 'object' && e ? e.mensaje_error || e.mensaje : null))
        .filter(Boolean);
      if (msgs.length) return msgs.join('; ');
    }
    return String(data.descripcion ?? data.mensaje ?? 'El certificador rechazó el documento');
  }

  return null;
}

function decodeMaybeBase64(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('<')) return raw;
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    return decoded.startsWith('<') ? decoded : raw;
  } catch {
    return raw;
  }
}

function parseFelResultFromJson(data) {
  const err = infileErrorFromJson(data);
  if (err) throw new Error(err);

  const uuid = String(data.uuid ?? data.UUID ?? '').trim();
  const serie = String(data.serie ?? data.Serie ?? '').trim();
  const numero = String(data.numero ?? data.Numero ?? '').trim();
  const fechaCert = String(data.fecha ?? data.Fecha ?? data.fecha_certificacion ?? '').trim();

  if (!uuid) return null;

  return {
    uuid,
    serie,
    numero,
    fechaCertificacion: fechaCert || formatFelDateTime(new Date()),
  };
}

function parseInfileCertifiedXml(xmlText) {
  const xml = String(xmlText || '');
  if (!xml.trim()) {
    throw new Error('Respuesta vacía del certificador Infile');
  }

  const json = tryParseJson(xml);
  if (json) {
    const fromJson = parseFelResultFromJson(json);
    if (fromJson) return fromJson;
  }

  const lower = xml.toLowerCase();
  if (lower.includes('<error') || lower.includes('tipo_respuesta="error"') || lower.includes('resultado="error"')) {
    const msg =
      pickTagValue(xml, ['descripcion_error', 'DescripcionError', 'mensaje', 'Mensaje', 'error']) ||
      'El certificador rechazó el documento';
    throw new Error(msg);
  }

  const uuid =
    pickAttr(xml, 'NumeroAutorizacion', 'UUID') ||
    pickTagValue(xml, ['NumeroAutorizacion', 'UUID', 'uuid']) ||
    pickAttr(xml, 'Certificacion', 'UUID');

  const serie =
    pickAttr(xml, 'NumeroAutorizacion', 'Serie') ||
    pickTagValue(xml, ['Serie', 'serie']) ||
    pickAttr(xml, 'Certificacion', 'Serie');

  const numero =
    pickAttr(xml, 'NumeroAutorizacion', 'Numero') ||
    pickTagValue(xml, ['Numero', 'numero']) ||
    pickAttr(xml, 'Certificacion', 'Numero');

  const fechaCert =
    pickTagValue(xml, ['FechaHoraCertificacion', 'FechaCertificacion']) ||
    pickAttr(xml, 'Certificacion', 'FechaHoraCertificacion') ||
    formatFelDateTime(new Date());

  if (!uuid) {
    throw new Error('No se pudo leer el UUID de la respuesta del certificador');
  }

  return {
    uuid,
    serie: serie || '',
    numero: numero || '',
    fechaCertificacion: fechaCert,
  };
}

function parseInfileSignResponse(bodyText) {
  const text = String(bodyText || '').trim();
  if (!text) throw new Error('Respuesta vacía del servicio de firma Infile');

  if (text.startsWith('<')) return text;

  const json = tryParseJson(text);
  if (!json) throw new Error('Respuesta inválida del servicio de firma Infile');

  const err = infileErrorFromJson(json);
  if (err) throw new Error(err);

  const signedRaw =
    json.xml_firmado ??
    json.xmlFirmado ??
    json.archivo ??
    json.xml ??
    json.resultado ??
    json.Resultado ??
    (json.firma && json.firma.archivo);

  const signed = decodeMaybeBase64(signedRaw);
  if (!signed || !signed.includes('<')) {
    const hint = json.mensaje || json.descripcion || JSON.stringify(json).slice(0, 300);
    throw new Error(`La firma electrónica no devolvió XML firmado: ${hint}`);
  }
  return signed;
}

function parseInfileErrorBody(bodyText) {
  const text = String(bodyText || '').trim();
  if (!text) return 'Error desconocido del certificador Infile';

  const json = tryParseJson(text);
  if (json) {
    const err = infileErrorFromJson(json);
    if (err) return err;
    const fromJson = parseFelResultFromJson(json);
    if (fromJson) return text;
    return (
      json.descripcion ||
      json.Descripcion ||
      json.mensaje ||
      json.Mensaje ||
      json.error ||
      text.slice(0, 500)
    );
  }

  try {
    parseInfileCertifiedXml(text);
    return text;
  } catch (err) {
    return err.message || text.slice(0, 500);
  }
}

module.exports = {
  parseInfileCertifiedXml,
  parseInfileSignResponse,
  parseInfileErrorBody,
  parseFelResultFromJson,
};
