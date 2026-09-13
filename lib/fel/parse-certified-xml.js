const { pickTagValue, pickAttr } = require('./parse-response');
const { SAT_TIPO_BY_TIPODOC } = require('./constants');

const TIPODOC_BY_SAT = Object.fromEntries(
  Object.entries(SAT_TIPO_BY_TIPODOC).map(([tipodoc, sat]) => [sat, tipodoc])
);
TIPODOC_BY_SAT.FESP = 'FES';

function decodeXmlInput(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (text.startsWith('<')) return text;
  try {
    const decoded = Buffer.from(text, 'base64').toString('utf8');
    return decoded.startsWith('<') ? decoded : text;
  } catch {
    return text;
  }
}

function parseItems(xml) {
  const items = [];
  const itemRe = /<(?:[\w.-]+:)?Item\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Item>/gi;
  let match;
  while ((match = itemRe.exec(xml))) {
    const block = match[0];
    const cantidad = Number(pickTagValue(block, ['Cantidad'])) || 0;
    const descripcion = pickTagValue(block, ['Descripcion']) || '';
    const precioUnit =
      Number(pickTagValue(block, ['PrecioUnitario'])) ||
      Number(pickTagValue(block, ['Precio'])) ||
      0;
    const total = Number(pickTagValue(block, ['Total'])) || precioUnit * cantidad || 0;
    const unidad = pickTagValue(block, ['UnidadMedida']) || '';
    items.push({
      CODPROD: '',
      DESPROD: descripcion,
      CODMEDIDA: unidad,
      CANTIDAD: cantidad,
      PRECIO: precioUnit,
      TOTALPRECIO: total,
    });
  }
  return items;
}

function fechaIsoFromFel(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return s.slice(0, 10);
}

/**
 * Convierte XML certificado SAT (GT) a estructura de impresión FEL local.
 */
function parseCertifiedFelXml(rawXml) {
  const xml = decodeXmlInput(rawXml);
  if (!xml || !xml.includes('<')) {
    throw new Error('Archivo XML inválido o vacío');
  }

  const satTipo = pickAttr(xml, 'DatosGenerales', 'Tipo') || pickTagValue(xml, ['Tipo']);
  const tipodoc = TIPODOC_BY_SAT[satTipo] || 'FEF';
  const fechaEmision =
    pickAttr(xml, 'DatosGenerales', 'FechaHoraEmision') ||
    pickTagValue(xml, ['FechaHoraEmision', 'FechaEmisionDocumentoAnular']);

  const uuid =
    pickAttr(xml, 'NumeroAutorizacion', 'UUID') ||
    pickTagValue(xml, ['NumeroAutorizacion', 'UUID']) ||
    pickAttr(xml, 'Certificacion', 'UUID');

  const serie =
    pickAttr(xml, 'NumeroAutorizacion', 'Serie') ||
    pickTagValue(xml, ['Serie']) ||
    (uuid ? uuid.slice(0, 8).toUpperCase() : '');

  const numero =
    pickAttr(xml, 'NumeroAutorizacion', 'Numero') ||
    pickTagValue(xml, ['Numero']) ||
    pickAttr(xml, 'DatosGenerales', 'NumeroAcceso') ||
    pickTagValue(xml, ['NumeroAcceso']);

  const granTotal = Number(pickTagValue(xml, ['GranTotal'])) || 0;
  const lines = parseItems(xml);
  const totalFromLines = lines.reduce((s, ln) => s + (Number(ln.TOTALPRECIO) || 0), 0);
  const total = granTotal > 0 ? granTotal : totalFromLines;

  const nitEmisor = pickAttr(xml, 'Emisor', 'NITEmisor') || pickTagValue(xml, ['NITEmisor']);
  const nombreEmisor =
    pickAttr(xml, 'Emisor', 'NombreComercial') ||
    pickAttr(xml, 'Emisor', 'NombreEmisor') ||
    pickTagValue(xml, ['NombreComercial', 'NombreEmisor']);
  const dirEmisor = pickTagValue(xml, ['Direccion']) || '';

  const receptorId = pickAttr(xml, 'Receptor', 'IDReceptor') || pickTagValue(xml, ['IDReceptor']);
  const receptorNombre = pickAttr(xml, 'Receptor', 'NombreReceptor') || pickTagValue(xml, ['NombreReceptor']);

  const fechaCert =
    pickTagValue(xml, ['FechaHoraCertificacion', 'FechaCertificacion']) || fechaEmision;

  return {
    tipodoc,
    satTipo,
    empresa: {
      EMPNIT: nitEmisor,
      NIT: nitEmisor,
      EMPNOMBRE: nombreEmisor,
      EMPRAZONSOCIAL: pickAttr(xml, 'Emisor', 'NombreEmisor') || nombreEmisor,
      EMPDIRECCION: dirEmisor,
    },
    header: {
      TIPODOC: tipodoc,
      DESDOC: tipodoc,
      FECHA_ISO: fechaIsoFromFel(fechaEmision),
      FECHA: fechaIsoFromFel(fechaEmision),
      DOC_NIT: receptorId || 'CF',
      DOC_NOMCLIE: receptorNombre || 'CONSUMIDOR FINAL',
      DOC_DIRCLIE: pickTagValue(xml, ['DireccionReceptor', 'Direccion']) || 'CIUDAD',
      TOTALPRECIO: total,
      TOTALDESCUENTO: 0,
      FEL_UUDI: uuid,
      FEL_SERIE: serie,
      FEL_NUMERO: numero,
      FEL_FECHA: fechaCert,
      CORRELATIVO: numero || '',
      CODDOC: tipodoc,
    },
    lines,
  };
}

module.exports = {
  parseCertifiedFelXml,
  decodeXmlInput,
};
