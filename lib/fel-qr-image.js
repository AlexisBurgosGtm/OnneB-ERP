/**
 * QR FEL en el servidor con el paquete npm `qrcode` (sin internet).
 * La URL embebida en el QR apunta al consultor FEL; generar la imagen es 100 % local.
 */
const QRCode = require('qrcode');

function buildFelConsultaUrl(uuid, baseUrl = '') {
  const id = String(uuid || '').trim();
  if (!id) return '';
  if (/^https?:\/\//i.test(id)) return id;
  const base = String(baseUrl || '').trim();
  if (base) {
    if (/^https?:\/\//i.test(base)) return `${base}${id}`;
    return `${base}${id}`;
  }
  return `https://report.feel.com.gt/ingfacereport/ingfacereport_documento?uuid=${encodeURIComponent(id)}`;
}

/**
 * @param {string} uuid
 * @param {string} [baseUrl]
 * @param {{ size?: number }} [opts]
 * @returns {Promise<string>} data:image/png;base64,...
 */
async function buildFelQrDataUrl(uuid, baseUrl = '', opts = {}) {
  const url = buildFelConsultaUrl(uuid, baseUrl);
  if (!url) return '';
  let size = Number(opts.size);
  if (!Number.isFinite(size) || size < 64) size = 140;
  if (size > 320) size = 320;
  return QRCode.toDataURL(url, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
}

module.exports = {
  buildFelConsultaUrl,
  buildFelQrDataUrl,
};
