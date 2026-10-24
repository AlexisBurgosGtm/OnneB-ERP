/**
 * Contexto de impresión con QR FEL generado en el servidor (paquete qrcode, sin internet).
 */
const { buildPrintContext, isFelPrintTipodoc } = require('./formato-impresion-engine');
const { buildFelQrDataUrl } = require('./fel-qr-image');
const { loadFelCredHeaderForPrint } = require('./fel/credenciales');

async function felQrImgForHeader(header, felUrlBase) {
  const felUuid = String(header?.FEL_UUDI || '').trim();
  if (!felUuid) return '';
  try {
    return await buildFelQrDataUrl(felUuid, felUrlBase, { size: 140 });
  } catch (err) {
    console.warn('[print-document-context] QR FEL:', err.message);
    return '';
  }
}

/**
 * @param {Parameters<typeof buildPrintContext>[0]} opts
 */
function resolveFelPrintTipodoc(tipodocOrHeader) {
  if (typeof tipodocOrHeader === 'string') {
    return String(tipodocOrHeader || '').trim().toUpperCase();
  }
  const h = tipodocOrHeader || {};
  return String(h.TIPODOC || h.CODDOC || '').trim().toUpperCase();
}

async function loadFelCredForPrint(pool, empnit, tipodocOrHeader, opts = {}) {
  if (!pool || !empnit) return null;
  const tipodoc = resolveFelPrintTipodoc(tipodocOrHeader);
  const hasFelUuid = String(opts.felUuid || '').trim();
  if (!isFelPrintTipodoc(tipodoc) && !hasFelUuid) return null;
  try {
    return await loadFelCredHeaderForPrint(pool, empnit);
  } catch (err) {
    console.warn('[print-document-context] cred FEL header:', err.message);
    return null;
  }
}

async function buildPrintContextAsync(opts = {}) {
  let felQrImgDataUrl = opts.felQrImgDataUrl;
  if (felQrImgDataUrl == null || String(felQrImgDataUrl).trim() === '') {
    felQrImgDataUrl = await felQrImgForHeader(opts.header, opts.felUrlBase);
  }
  let felCredencial = opts.felCredencial;
  if (felCredencial === undefined && opts.pool && opts.empnit) {
    felCredencial = await loadFelCredForPrint(opts.pool, opts.empnit, opts.header, {
      felUuid: opts.header?.FEL_UUDI,
    });
  }
  return buildPrintContext({
    ...opts,
    felQrImgDataUrl,
    felCredencial,
    tipodocObs: opts.tipodocObs ?? opts.header?.TIPODOC_OBS,
  });
}

module.exports = {
  buildPrintContextAsync,
  felQrImgForHeader,
  loadFelCredForPrint,
};
