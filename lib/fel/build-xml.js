const { FEL_NS, CFC_NS, CNO_NS, FEL_ANULACION_NS } = require('./constants');
const { fechaIsoFromRow } = require('../documento-fecha');
const { satTipoFromTipodoc } = require('./tipo-documento');
const {
  escapeXml,
  cleanNit,
  formatFelDateTime,
  formatFelDateOnly,
  splitIvaFromTotal,
  roundMoney,
  buildNumeroAcceso,
} = require('./utils');

const MEDIDA_FEL_MAP = {
  UNIDAD: 'UNI',
  UNIDADES: 'UNI',
  UNID: 'UNI',
  LIBRA: 'LB',
  LIBRAS: 'LB',
  KILO: 'KG',
  KILOS: 'KG',
  KILOGRAMO: 'KG',
  GRAMO: 'GR',
  GRAMOS: 'GR',
  CAJA: 'CAJ',
  CAJAS: 'CAJ',
  DOCENA: 'DOC',
  METRO: 'M',
  METROS: 'M',
  LITRO: 'L',
  LITROS: 'L',
  GALON: 'GAL',
  GALONES: 'GAL',
  PAR: 'PAR',
  PARES: 'PAR',
  BOLSA: 'BOL',
  BOLSAS: 'BOL',
  TABLETA: 'TAB',
  TABLETAS: 'TAB',
  CAPSULA: 'CAP',
  CAPSULAS: 'CAP',
};

function lineUnidad(line) {
  const raw = String(line.CODMEDIDA || 'UNI').trim().toUpperCase();
  if (!raw) return 'UNI';
  if (raw.length <= 3) return raw;
  if (MEDIDA_FEL_MAP[raw]) return MEDIDA_FEL_MAP[raw];
  return raw.slice(0, 3);
}

function lineIsExempt(line) {
  return Number(line.EXENTO) > 0;
}

function lineBienServicio(line) {
  return String(line.TIPOPROD || 'P').trim().toUpperCase() === 'S' ? 'S' : 'B';
}

function buildFrasesXml(cred) {
  const frase = Number(cred.EMISOR_FRASE) || 1;
  const escenario = Number(cred.EMISOR_ESCENARIO) || 1;
  let html = `<dte:Frases><dte:Frase CodigoEscenario="${escenario}" TipoFrase="${frase}" />`;
  const frase2 = Number(cred.EMISOR_FRASE2) || 0;
  const escenario2 = Number(cred.EMISOR_ESCENARIO2) || 0;
  if (frase2 > 0 && escenario2 > 0) {
    html += `<dte:Frase CodigoEscenario="${escenario2}" TipoFrase="${frase2}" />`;
  }
  html += '</dte:Frases>';
  return html;
}

function buildItemsXml(lines) {
  let totalIva = 0;
  const items = lines
    .map((line, index) => {
      const numeroLinea = index + 1;
      const cantidad = roundMoney(line.TOTALUNIDADES || line.CANTIDAD || 0, 4);
      const total = roundMoney(line.TOTALPRECIO || 0);
      const unit = cantidad > 0 ? roundMoney(total / cantidad) : roundMoney(line.PRECIO || 0);
      const exempt = lineIsExempt(line);
      const tax = splitIvaFromTotal(total, !exempt);
      totalIva += tax.iva;

      const impuestos = exempt
        ? ''
        : `<dte:Impuestos>
            <dte:Impuesto>
              <dte:NombreCorto>IVA</dte:NombreCorto>
              <dte:CodigoUnidadGravable>1</dte:CodigoUnidadGravable>
              <dte:MontoGravable>${tax.gravable.toFixed(6)}</dte:MontoGravable>
              <dte:MontoImpuesto>${tax.iva.toFixed(6)}</dte:MontoImpuesto>
            </dte:Impuesto>
          </dte:Impuestos>`;

      return `<dte:Item BienOServicio="${lineBienServicio(line)}" NumeroLinea="${numeroLinea}">
        <dte:Cantidad>${cantidad.toFixed(4)}</dte:Cantidad>
        <dte:UnidadMedida>${escapeXml(lineUnidad(line))}</dte:UnidadMedida>
        <dte:Descripcion>${escapeXml(line.DESPROD || line.CODPROD)}</dte:Descripcion>
        <dte:PrecioUnitario>${unit.toFixed(6)}</dte:PrecioUnitario>
        <dte:Precio>${total.toFixed(6)}</dte:Precio>
        <dte:Descuento>0.000000</dte:Descuento>
        ${impuestos}
        <dte:Total>${total.toFixed(6)}</dte:Total>
      </dte:Item>`;
    })
    .join('');

  return { itemsXml: items, totalIva: roundMoney(totalIva) };
}

function buildTotalesXml(granTotal, totalIva) {
  if (totalIva > 0) {
    return `<dte:Totales>
      <dte:TotalImpuestos>
        <dte:TotalImpuesto NombreCorto="IVA" TotalMontoImpuesto="${totalIva.toFixed(6)}" />
      </dte:TotalImpuestos>
      <dte:GranTotal>${roundMoney(granTotal).toFixed(6)}</dte:GranTotal>
    </dte:Totales>`;
  }
  return `<dte:Totales>
    <dte:GranTotal>${roundMoney(granTotal).toFixed(6)}</dte:GranTotal>
  </dte:Totales>`;
}

function buildComplementoCambiaria(header) {
  const total = roundMoney(header.TOTALPRECIO || 0);
  const venc = formatFelDateOnly(header.VENCIMIENTO || header.FECHA);
  return `<dte:Complementos>
    <dte:Complemento IDComplemento="1" NombreComplemento="Cambiaria" URIComplemento="${CFC_NS}">
      <cfc:AbonosFacturaCambiaria xmlns:cfc="${CFC_NS}" Version="1">
        <cfc:Abono>
          <cfc:NumeroAbono>1</cfc:NumeroAbono>
          <cfc:FechaVencimiento>${escapeXml(venc)}</cfc:FechaVencimiento>
          <cfc:MontoAbono>${total.toFixed(6)}</cfc:MontoAbono>
        </cfc:Abono>
      </cfc:AbonosFacturaCambiaria>
    </dte:Complemento>
  </dte:Complementos>`;
}

function felDocumentoOrigenFecha(referencia) {
  const felFecha = String(referencia?.FEL_FECHA || '').trim();
  const fromFel = felFecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (fromFel) return `${fromFel[1]}-${fromFel[2]}-${fromFel[3]}`;
  return fechaIsoFromRow(referencia) || formatFelDateOnly(referencia?.FECHA);
}

function buildComplementoReferenciasNota(header, referencia) {
  const uuid = String(referencia.FEL_UUDI || '').trim();
  const serie = String(referencia.FEL_SERIE || '').trim();
  const numero = String(referencia.FEL_NUMERO || referencia.CORRELATIVO || '').trim();
  const fecha = felDocumentoOrigenFecha(referencia);
  const motivo = String(header.OBS || 'Anulación / ajuste').trim() || 'Ajuste';
  return `<dte:Complementos>
    <dte:Complemento IDComplemento="ReferenciasNota" NombreComplemento="ReferenciasNota" URIComplemento="${CNO_NS}">
      <cno:ReferenciasNota xmlns:cno="${CNO_NS}" Version="0.1"
        NumeroAutorizacionDocumentoOrigen="${escapeXml(uuid)}"
        FechaEmisionDocumentoOrigen="${escapeXml(fecha)}"
        MotivoAjuste="${escapeXml(motivo)}"
        SerieDocumentoOrigen="${escapeXml(serie)}"
        NumeroDocumentoOrigen="${escapeXml(numero)}" />
    </dte:Complemento>
  </dte:Complementos>`;
}

function afiliacionIva(_cred, totalIva) {
  if (totalIva <= 0) return 'EXE';
  return 'GEN';
}

function felEmisionDateTime(header) {
  const felFecha = String(header.FEL_FECHA || '').trim();
  if (felFecha.includes('T')) return felFecha;

  const base = header.FECHA ? new Date(header.FECHA) : new Date();
  if (Number.isNaN(base.getTime())) return formatFelDateTime(new Date());

  const h = Number(header.HORA);
  const m = Number(header.MINUTO);
  if (Number.isFinite(h)) base.setHours(h);
  if (Number.isFinite(m)) base.setMinutes(m);
  base.setSeconds(0, 0);
  return formatFelDateTime(base);
}

function buildAnulacionXml({ cred, header, motivo }) {
  const uuid = String(header.FEL_UUDI || '').trim();
  const nitEmisor = cleanNit(cred.EMISOR_NIT);
  const receptorId = cleanNit(header.DOC_NIT) || 'CF';
  const fechaEmision = felEmisionDateTime(header);
  const fechaAnulacion = formatFelDateTime(new Date());
  const motivoAnulacion = String(motivo ?? '').trim().slice(0, 255) || 'Anulacion de documento';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<dte:GTAnulacionDocumento xmlns:dte="${FEL_ANULACION_NS}" Version="0.1">
  <dte:SAT>
    <dte:AnulacionDTE ID="DatosCertificados">
      <dte:DatosGenerales
        ID="DatosAnulacion"
        NumeroDocumentoAAnular="${escapeXml(uuid)}"
        NITEmisor="${escapeXml(nitEmisor)}"
        IDReceptor="${escapeXml(receptorId)}"
        FechaEmisionDocumentoAnular="${escapeXml(fechaEmision)}"
        FechaHoraAnulacion="${escapeXml(fechaAnulacion)}"
        MotivoAnulacion="${escapeXml(motivoAnulacion)}" />
    </dte:AnulacionDTE>
  </dte:SAT>
</dte:GTAnulacionDocumento>`;

  return { xml, uuid, fechaAnulacion };
}

function buildFelXml({ empnit, cred, header, lines, referencia }) {
  const satTipo = satTipoFromTipodoc(header.TIPODOC);
  const fechaEmision = formatFelDateTime(new Date());
  const numeroAcceso = buildNumeroAcceso(empnit, header.CODDOC, header.CORRELATIVO);
  const { itemsXml, totalIva } = buildItemsXml(lines);
  const granTotal = roundMoney(header.TOTALPRECIO || 0);
  const receptorId = cleanNit(header.DOC_NIT) || 'CF';
  const receptorNombre = String(header.DOC_NOMCLIE || 'CONSUMIDOR FINAL').trim() || 'CONSUMIDOR FINAL';
  const receptorDir = String(header.DOC_DIRCLIE || header.CLI_DIR || 'CIUDAD').trim() || 'CIUDAD';
  const municipio = String(cred.EMISOR_MUNICIPIO || 'GUATEMALA').trim();
  const departamento = String(cred.EMISOR_DEPARTAMENTO || 'GUATEMALA').trim();
  const postal = String(cred.EMISOR_CODIGOPOSTAL || '01001').trim();

  let extraBlocks = '';
  if (satTipo === 'FCAM') extraBlocks += buildComplementoCambiaria(header);
  if (satTipo === 'NCRE' && referencia) extraBlocks += buildComplementoReferenciasNota(header, referencia);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<dte:GTDocumento xmlns:dte="${FEL_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="0.1" xsi:schemaLocation="${FEL_NS} GT_Documento-0.2.1.xsd">
  <dte:SAT ClaseDocumento="dte">
    <dte:DTE ID="DatosCertificados">
      <dte:DatosEmision ID="DatosEmision">
        <dte:DatosGenerales CodigoMoneda="GTQ" FechaHoraEmision="${fechaEmision}" NumeroAcceso="${escapeXml(numeroAcceso)}" Tipo="${satTipo}" />
        <dte:Emisor AfiliacionIVA="${afiliacionIva(cred, totalIva)}" CodigoEstablecimiento="${escapeXml(cred.EMISOR_CODIGOESTABLECIMIENTO || '1')}" CorreoEmisor="" NITEmisor="${escapeXml(cleanNit(cred.EMISOR_NIT))}" NombreComercial="${escapeXml(cred.EMISOR_NOMBRECOMECIAL || cred.EMISOR_NOMBRE)}" NombreEmisor="${escapeXml(cred.EMISOR_NOMBRE)}">
          <dte:DireccionEmisor>
            <dte:Direccion>${escapeXml(cred.EMISOR_DIRECCION || 'CIUDAD')}</dte:Direccion>
            <dte:CodigoPostal>${escapeXml(postal)}</dte:CodigoPostal>
            <dte:Municipio>${escapeXml(municipio)}</dte:Municipio>
            <dte:Departamento>${escapeXml(departamento)}</dte:Departamento>
            <dte:Pais>GT</dte:Pais>
          </dte:DireccionEmisor>
        </dte:Emisor>
        <dte:Receptor IDReceptor="${escapeXml(receptorId)}" NombreReceptor="${escapeXml(receptorNombre)}" CorreoReceptor="">
          <dte:DireccionReceptor>
            <dte:Direccion>${escapeXml(receptorDir)}</dte:Direccion>
            <dte:CodigoPostal>${escapeXml(postal)}</dte:CodigoPostal>
            <dte:Municipio>${escapeXml(municipio)}</dte:Municipio>
            <dte:Departamento>${escapeXml(departamento)}</dte:Departamento>
            <dte:Pais>GT</dte:Pais>
          </dte:DireccionReceptor>
        </dte:Receptor>
        ${buildFrasesXml(cred)}
        <dte:Items>${itemsXml}</dte:Items>
        ${buildTotalesXml(granTotal, totalIva)}
        ${extraBlocks}
      </dte:DatosEmision>
    </dte:DTE>
  </dte:SAT>
</dte:GTDocumento>`;

  return { xml, numeroAcceso, satTipo };
}

module.exports = { buildFelXml, buildAnulacionXml };
