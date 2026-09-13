const { fechaIsoFromFelFecha } = require('../documento-fecha');

/**
 * Obtiene FechaHoraEmision (YYYY-MM-DD) del DTE certificado vía reporte Infile.
 * Es la fecha que SAT valida en ReferenciasNota / anulación.
 */
async function fetchFechaHoraEmisionByUuid(uuid) {
  const id = String(uuid || '').trim();
  if (!id) return '';

  const url =
    `https://report.feel.com.gt/ingfacereport/ingfacereport_documento` +
    `?uuid=${encodeURIComponent(id)}&formato=XML`;

  let text = '';
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json, application/xml, text/xml, */*' },
    });
    text = await res.text();
  } catch (err) {
    console.warn('[FEL] No se pudo consultar XML Infile por UUID:', err.message);
    return '';
  }

  let xml = String(text || '').trim();
  if (!xml) return '';

  if (xml.startsWith('{')) {
    try {
      const json = JSON.parse(xml);
      if (json.resultado === false) {
        console.warn('[FEL] Infile XML UUID', id, json.codigo || json.descripcion || '');
        return '';
      }
      const raw =
        json.xml ||
        json.xml_certificado ||
        json.xml_dte ||
        json.archivo ||
        json.documento ||
        json.data ||
        '';
      if (!raw) return '';
      const asText = String(raw).trim();
      if (asText.startsWith('<')) {
        xml = asText;
      } else {
        try {
          const decoded = Buffer.from(asText, 'base64').toString('utf8');
          xml = decoded.startsWith('<') ? decoded : asText;
        } catch {
          xml = asText;
        }
      }
    } catch {
      return '';
    }
  }

  const m = xml.match(/\bFechaHoraEmision\s*=\s*"([^"]+)"/i);
  if (!m) return '';
  return fechaIsoFromFelFecha(m[1]);
}

function isFechaOrigenMismatchError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('fecha de emisión del documento origen') ||
    msg.includes('fecha de emision del documento origen') ||
    msg.includes('fel-gui-52') ||
    msg.includes('3.5.2')
  );
}

module.exports = {
  fetchFechaHoraEmisionByUuid,
  isFechaOrigenMismatchError,
};
