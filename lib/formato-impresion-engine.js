/**
 * Motor de plantillas de impresión (Mustache-lite).
 * Sintaxis:
 *   {{DOC.CODDOC}}           — valor escapado
 *   {{{DOC.RAW}}}            — sin escapar (usar con cuidado)
 *   {{#LINES}}...{{/LINES}}  — iteración sobre arrays
 *   {{^LINES}}...{{/LINES}}  — bloque si array vacío / falsy
 */

const { lineTotalPeso, sumLinesPeso, formatPesoQty } = require('./doc-peso');

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolvePath(ctx, path) {
  if (!path) return undefined;
  const parts = String(path).trim().split('.');
  let cur = ctx;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function renderValue(val, raw) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'true' : '';
  if (Array.isArray(val)) return String(val.length);
  const s = String(val);
  return raw ? s : escapeHtml(s);
}

/**
 * @param {string} template
 * @param {object} context
 * @returns {string}
 */
function renderTemplate(template, context) {
  const src = String(template ?? '');
  if (!src) return '';

  function render(chunk, ctx) {
    let out = '';
    let i = 0;
    while (i < chunk.length) {
      const open = chunk.indexOf('{{', i);
      if (open < 0) {
        out += chunk.slice(i);
        break;
      }
      out += chunk.slice(i, open);

      const triple = chunk.slice(open).match(/^\{\{\{\s*([\w.]+)\s*\}\}\}/);
      if (triple) {
        out += renderValue(resolvePath(ctx, triple[1]), true);
        i = open + triple[0].length;
        continue;
      }

      const close = chunk.indexOf('}}', open + 2);
      if (close < 0) {
        out += chunk.slice(open);
        break;
      }
      const tag = chunk.slice(open + 2, close).trim();
      i = close + 2;

      if (tag.startsWith('#') || tag.startsWith('^')) {
        const inverted = tag.startsWith('^');
        const name = tag.slice(1).trim();
        const endTag = `{{/${name}}}`;
        const endIdx = chunk.indexOf(endTag, i);
        if (endIdx < 0) {
          out += `{{${tag}}}`;
          continue;
        }
        const inner = chunk.slice(i, endIdx);
        i = endIdx + endTag.length;
        const val = resolvePath(ctx, name);
        if (inverted) {
          const empty =
            val == null ||
            val === false ||
            val === '' ||
            (Array.isArray(val) && val.length === 0);
          if (empty) out += render(inner, ctx);
        } else if (Array.isArray(val)) {
          val.forEach((item, idx) => {
            const rowCtx =
              item && typeof item === 'object'
                ? { ...ctx, ...item, _index: idx + 1 }
                : { ...ctx, '.': item, _index: idx + 1 };
            out += render(inner, rowCtx);
          });
        } else if (val && typeof val === 'object') {
          out += render(inner, { ...ctx, ...val });
        } else if (val) {
          out += render(inner, ctx);
        }
        continue;
      }

      if (tag.startsWith('/')) {
        out += `{{${tag}}}`;
        continue;
      }

      // Plantillas guardadas usan {{DESPROD}}; con marcas activas mostrar DESPROD_HTML (descripción + marca).
      if (tag === 'DESPROD') {
        const showMarcas = resolvePath(ctx, 'MUESTRA_MARCAS');
        const desHtml = resolvePath(ctx, 'DESPROD_HTML');
        if (showMarcas && desHtml != null && String(desHtml) !== '') {
          out += renderValue(desHtml, true);
          continue;
        }
      }

      out += renderValue(resolvePath(ctx, tag), false);
    }
    return out;
  }

  return render(src, context || {});
}

function formatMoneyGt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Q 0.00';
  return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
}

function formatFechaDisplay(value) {
  if (!value) return '';
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

const UNIDADES_ES = [
  '',
  'UN',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISEIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDOS',
  'VEINTITRES',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISEIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];
const DECENAS_ES = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS_ES = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

function groupToWordsEs(n) {
  const num = Math.floor(Number(n) || 0);
  if (num === 0) return '';
  if (num === 100) return 'CIEN';
  if (num < 30) return UNIDADES_ES[num];
  if (num < 100) {
    const d = Math.floor(num / 10);
    const u = num % 10;
    if (!u) return DECENAS_ES[d];
    return `${DECENAS_ES[d]} Y ${UNIDADES_ES[u]}`;
  }
  const c = Math.floor(num / 100);
  const r = num % 100;
  if (!r) return CENTENAS_ES[c] === 'CIENTO' ? 'CIEN' : CENTENAS_ES[c];
  return `${CENTENAS_ES[c]} ${groupToWordsEs(r)}`.trim();
}

/** Convierte monto a letras (quetzales) para tickets FEL. */
function amountInWordsGt(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  const entero = Math.floor(Math.abs(n));
  const centavos = Math.round((Math.abs(n) - entero) * 100);

  function enteroToWords(num) {
    if (num === 0) return 'CERO';
    if (num < 1000) return groupToWordsEs(num);
    if (num < 1000000) {
      const miles = Math.floor(num / 1000);
      const resto = num % 1000;
      const milesWords = miles === 1 ? 'MIL' : `${groupToWordsEs(miles)} MIL`;
      return resto ? `${milesWords} ${groupToWordsEs(resto)}` : milesWords;
    }
    const millones = Math.floor(num / 1000000);
    const resto = num % 1000000;
    const millWords = millones === 1 ? 'UN MILLON' : `${groupToWordsEs(millones)} MILLONES`;
    if (!resto) return millWords;
    return `${millWords} ${enteroToWords(resto)}`;
  }

  const words = enteroToWords(entero);
  const moneda = entero === 1 ? 'QUETZAL' : 'QUETZALES';
  if (centavos > 0) {
    return `${words} ${moneda} CON ${String(centavos).padStart(2, '0')}/100`.replace(/\s+/g, ' ').trim();
  }
  return `${words} ${moneda} EXACTOS`.replace(/\s+/g, ' ').trim();
}

function felTituloByTipodoc(tipodoc) {
  const t = String(tipodoc || '').trim().toUpperCase();
  if (t === 'FEC') return 'FACTURA CAMBIARIA ELECTRÓNICA';
  if (t === 'FES') return 'FACTURA ELECTRÓNICA PEQUEÑO CONTRIBUYENTE';
  if (t === 'FNC') return 'NOTA DE CRÉDITO ELECTRÓNICA';
  return 'FACTURA ELECTRÓNICA';
}

const FEL_PRINT_TIPODOCS = ['FEF', 'FEC', 'FES', 'FNC'];

/** Pie ticket FEL cuando hay líneas con EXENTO > 0. */
const FEL_EXENTO_IVA_LEYENDA =
  '* Exento de IVA según Artículo 7, numeral 15 de la Ley del IVA (Decreto 27-92)';

function isFelPrintTipodoc(tipodoc) {
  return FEL_PRINT_TIPODOCS.includes(String(tipodoc || '').trim().toUpperCase());
}

function lineIsExentoIva(ln) {
  return Number(ln?.EXENTO) > 0;
}

function felDesprodDisplay(desprod, exentoLine) {
  const raw = String(desprod ?? '').trim();
  if (!exentoLine) return raw;
  if (raw.startsWith('*')) return raw;
  return `* ${raw}`;
}

function pickFelCredField(credRow, ...keys) {
  const c = credRow || {};
  for (const key of keys) {
    const raw = c[key];
    if (raw != null && String(raw).trim() !== '') return String(raw).trim();
  }
  return '';
}

/** EMISOR_DIRECCION, EMISOR_MUNICIPIO, EMISOR_DEPARTAMENTO — solo FEL_CREDENCIALES. */
function joinFelCredDireccion(credRow) {
  const parts = [
    pickFelCredField(credRow, 'EMISOR_DIRECCION', 'EMISOR_DIRECCION_FISCIAL'),
    pickFelCredField(credRow, 'EMISOR_MUNICIPIO'),
    pickFelCredField(credRow, 'EMISOR_DEPARTAMENTO'),
  ].filter(Boolean);
  return parts.join(', ');
}

/** Encabezado FEL desde FEL_CREDENCIALES (línea 2 = EMISOR_NOMBRE / razón social emisor). */
function buildFelCredContext(felCredencial, empresa) {
  const c = felCredencial || {};
  const emp = empresa || {};
  const comercialCred = pickFelCredField(c, 'EMISOR_NOMBRECOMECIAL', 'EMISOR_NOMBRE_COMERCIAL');
  const emisorCred = pickFelCredField(c, 'EMISOR_NOMBRE', 'NOMBRE_EMISOR');
  const nombreEmpresa = String(emp.EMPNOMBRE || emp.NOMBRE || '').trim();

  const nombreComercial = comercialCred || nombreEmpresa;
  const nombreEmisor = emisorCred;
  const direccionFel = joinFelCredDireccion(c);

  return {
    NOMBRE_COMERCIAL: nombreComercial,
    NOMBRE_EMISOR: nombreEmisor,
    RAZON_SOCIAL: nombreEmisor,
    EMISOR_NOMBRECOMECIAL: nombreComercial,
    EMISOR_NOMBRE: nombreEmisor,
    DIRECCION: direccionFel,
    EMISOR_DIRECCION: pickFelCredField(c, 'EMISOR_DIRECCION'),
    EMISOR_MUNICIPIO: pickFelCredField(c, 'EMISOR_MUNICIPIO'),
    EMISOR_DEPARTAMENTO: pickFelCredField(c, 'EMISOR_DEPARTAMENTO'),
    NIT: pickFelCredField(c, 'EMISOR_NIT') || String(emp.EMPNIT || emp.NIT || '').trim(),
    TEL_SUCURSAL:
      pickFelCredField(c, 'ADENDA_TELSUCURSAL', 'EMISOR_TELEFONO') ||
      String(emp.EMPTELEFONO || emp.TELEFONO || '').trim(),
    FRASE1: pickFelCredField(c, 'FRASE1'),
    FRASE2: pickFelCredField(c, 'FRASE2'),
    FRASE3: pickFelCredField(c, 'FRASE3'),
  };
}

function felFraseByTipodoc(tipodoc) {
  // Frase por defecto del ticket FEL (editable en plantilla / EMPRESA.FRASE_FISCAL)
  return 'SUJETO A PAGOS TRIMESTRALES ISR';
}

function docSerieNumero(header) {
  const h = header || {};
  const tipodoc = String(h.TIPODOC || '').trim().toUpperCase();
  if (tipodoc === 'COM' || tipodoc === 'COP') {
    return {
      serie: String(h.SERIEFAC || '').trim(),
      numero: String(h.NOFAC ?? '').trim(),
    };
  }
  const felSerie = String(h.FEL_SERIE || '').trim();
  const felNum = String(h.FEL_NUMERO || '').trim();
  return {
    serie: felSerie || String(h.SERIEFAC || '').trim(),
    numero: felNum || String(h.NOFAC ?? '').trim(),
  };
}

/** Complemento FEL (cuotas) — por defecto 1 cuota al total para FEC. */
function buildFelComplementoCuotas(header, totalPrecio) {
  const tipodoc = String(header?.TIPODOC || '').trim().toUpperCase();
  if (tipodoc !== 'FEC') {
    return { show: false, numCuotas: 0, cuotas: [] };
  }
  const fechaDoc = formatFechaDisplay(header?.FECHA_ISO || header?.FECHA);
  const total = Number(totalPrecio) || 0;
  return {
    show: true,
    numCuotas: 1,
    cuotas: [
      {
        NUM: 1,
        FECHA: fechaDoc,
        MONTO: total,
        MONTO_FMT: formatMoneyGt(total),
      },
    ],
  };
}

function buildFelQrUrl(uuid, baseUrl = '') {
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
 * Construye el contexto de plantilla a partir de empresa + documento + líneas.
 * @param {{ empresa?: object, header?: object, lines?: object[], title?: string, footerNote?: string, felUrlBase?: string }} opts
 */
function buildPrintContext({
  empresa,
  header,
  lines,
  title,
  footerNote,
  felUrlBase,
  muestraPeso = false,
  muestraMarcas = false,
  felQrImgDataUrl,
  felCredencial,
  tipodocObs = '',
} = {}) {
  const h = header || {};
  const emp = empresa || {};
  const tipodoc = String(h.TIPODOC || '').trim().toUpperCase();
  const showPeso = muestraPeso === true;
  const showMarcas = muestraMarcas === true;
  const felPrintDoc = isFelPrintTipodoc(tipodoc);
  let hasLineasExentas = false;
  const lineRows = (lines || []).map((ln, idx) => {
    const totalPeso = lineTotalPeso(ln);
    const exentoLine = lineIsExentoIva(ln);
    if (exentoLine) hasLineasExentas = true;
    const desprodRaw = String(ln.DESPROD ?? '');
    const desprod = felPrintDoc ? felDesprodDisplay(desprodRaw, exentoLine) : desprodRaw;
    const desmarca = String(ln.DESMARCA ?? '').trim();
    const desprodHtml =
      showMarcas && desmarca
        ? `${escapeHtml(desprod)}<br><strong>${escapeHtml(desmarca)}</strong>`
        : escapeHtml(desprod);
    return {
    INDEX: idx + 1,
    CODPROD: ln.CODPROD ?? '',
    DESPROD: desprod,
    EXENTO: exentoLine ? 1 : 0,
    DESMARCA: desmarca,
    DESPROD_HTML: desprodHtml,
    CODMEDIDA: ln.CODMEDIDA ?? '',
    CANTIDAD: Number(ln.CANTIDAD) || 0,
    PRECIO: Number(ln.PRECIO) || 0,
    PRECIO_FMT: formatMoneyGt(ln.PRECIO),
    PRECIO_LETRAS: amountInWordsGt(ln.PRECIO),
    TOTALPRECIO: Number(ln.TOTALPRECIO) || 0,
    TOTALPRECIO_FMT: formatMoneyGt(ln.TOTALPRECIO),
    PESO: Number(ln.PESO) || 0,
    TOTALPESO: totalPeso,
    TOTALPESO_FMT: formatPesoQty(totalPeso),
    PESO_SUFFIX: showPeso && totalPeso > 0 ? ` ${formatPesoQty(totalPeso)}` : '',
    EQUIVALE: ln.EQUIVALE ?? '',
    TOTALUNIDADES: ln.TOTALUNIDADES ?? '',
  };
  });

  const total = Number(h.TOTALPRECIO) || 0;
  const totalCosto = Number(h.TOTALCOSTO) || 0;
  const descuento = Number(h.TOTALDESCUENTO) || 0;
  const sumLineasPrecio = (lines || []).reduce((s, ln) => s + (Number(ln.TOTALPRECIO) || 0), 0);
  const subtotalVenta =
    sumLineasPrecio > 0
      ? Math.round(sumLineasPrecio * 1000) / 1000
      : Math.round(Math.max(0, total + descuento) * 1000) / 1000;
  const totalPesoDoc = sumLinesPeso(lines);
  const felUuid = String(h.FEL_UUDI || '').trim();
  const urlBase = String(felUrlBase || emp.FEL_URL || '').trim();
  const felQrUrl = buildFelQrUrl(felUuid, urlBase);
  // Imagen QR: solo data URL generada en servidor (lib/fel-qr-image.js). Sin CDN ni internet.
  const felQrImg = String(felQrImgDataUrl || '').trim();
  const tituloFel = felTituloByTipodoc(tipodoc);
  const fraseFiscal = String(emp.FRASE_FISCAL || felFraseByTipodoc(tipodoc) || '').trim();
  const { serie: docSerie, numero: docNumero } = docSerieNumero(h);
  const felComplemento = buildFelComplementoCuotas(h, total);
  const useFelCred =
    isFelPrintTipodoc(tipodoc) || Boolean(felCredencial) || String(h.FEL_UUDI || '').trim();
  const felCred = useFelCred ? buildFelCredContext(felCredencial, emp) : buildFelCredContext(null, emp);

  return {
    TITLE: title || h.DESDOC || tituloFel || 'Documento',
    FOOTER: footerNote || 'Documento generado por POS OnneB',
    EMPRESA: {
      NIT: emp.EMPNIT || emp.NIT || '',
      NOMBRE: emp.EMPNOMBRE || emp.NOMBRE || '',
      RAZON_SOCIAL: emp.EMPRAZONSOCIAL || emp.RAZON_SOCIAL || '',
      DIRECCION: emp.EMPDIRECCION || emp.DIRECCION || '',
      TELEFONO: emp.EMPTELEFONO || emp.TELEFONO || '',
      EMAIL: emp.EMPEMAIL || emp.EMAIL || '',
      LOGO_URL: emp.LOGO_URL || '',
      FRASE_FISCAL: fraseFiscal,
      FEL_URL: urlBase,
    },
    DOC: {
      CODDOC: h.CODDOC ?? '',
      CORRELATIVO: h.CORRELATIVO ?? '',
      TIPODOC: tipodoc,
      DESDOC: h.DESDOC ?? '',
      FECHA: formatFechaDisplay(h.FECHA_ISO || h.FECHA),
      FECHA_ISO: h.FECHA_ISO || '',
      HORA: h.HORA != null ? `${String(h.HORA).padStart(2, '0')}:${String(h.MINUTO ?? 0).padStart(2, '0')}` : '',
      USUARIO: h.USUARIO ?? '',
      CODCLIENTE: h.CODCLIENTE ?? '',
      DOC_NOMCLIE: h.DOC_NOMCLIE ?? '',
      DOC_NIT: h.DOC_NIT ?? '',
      DOC_DIRCLIE: h.DOC_DIRCLIE ?? '',
      F_ENTREGA: String(h.F_ENTREGA || '').trim(),
      DIRENTREGA: (() => {
        const dir = String(h.DIRENTREGA || '').trim();
        if (!dir || dir.toUpperCase() === 'SN') return '';
        return dir;
      })(),
      NEGOCIO: h.NEGOCIO || h.CLI_NEGOCIO || '',
      OBS: h.OBS ?? '',
      TIPODOC_OBS: String(tipodocObs || h.TIPODOC_OBS || '').trim(),
      FEL_EXENTO_LEYENDA: felPrintDoc && hasLineasExentas ? FEL_EXENTO_IVA_LEYENDA : '',
      PRIORIDAD: String(h.PRIORIDAD || '').trim().toUpperCase(),
      CONCRE: h.CONCRE ?? '',
      CONCRE_LABEL: String(h.CONCRE || 'CON').trim().toUpperCase() === 'CRE' ? 'Crédito' : 'Contado',
      VENDEDOR: h.VENDEDOR || h.NOMEMPLEADO || '',
      VENDEDOR_TELEFONO: h.VENDEDOR_TELEFONO || h.TELEFONOS || '',
      CODCAJA: h.CODCAJA ?? '',
      DESCAJA: h.DESCAJA ?? '',
      FEL_UUDI: felUuid,
      FEL_SERIE: h.FEL_SERIE ?? '',
      FEL_NUMERO: h.FEL_NUMERO ?? '',
      FEL_FECHA: h.FEL_FECHA ?? '',
      FEL_TITULO: tituloFel,
      SERIEFAC: String(h.SERIEFAC || '').trim(),
      NOFAC: String(h.NOFAC ?? '').trim(),
      SERIE: docSerie,
      NUMERO: docNumero,
      FEL_COMPLEMENTO_SHOW: felComplemento.show,
      FEL_NUM_CUOTAS: felComplemento.numCuotas,
      FEL_CUOTAS: felComplemento.cuotas,
      NO_INTERNO: h.CORRELATIVO != null && h.CORRELATIVO !== '' ? String(h.CORRELATIVO) : '',
      FEL_CONSULTA_URL: felQrUrl,
      FEL_QR_URL: felQrUrl,
      FEL_QR_IMG: felQrImg,
      STATUS: h.STATUS ?? '',
      IS_ANULADO: String(h.STATUS || '').trim().toUpperCase() === 'A' ? 'SI' : '',
      DOCUMENTO_LABEL: `${h.CODDOC || ''} #${h.CORRELATIVO ?? ''}`.trim(),
    },
    FEL: {
      CERTIFICADOR: 'INFILE, S.A.',
      CERTIFICADOR_NIT: '12521337',
      UUID: felUuid,
      FECHA_CERT: h.FEL_FECHA || '',
      URL_BASE: urlBase,
      CONSULTA_URL: felQrUrl,
      QR_URL: felQrUrl,
      QR_IMG: felQrImg,
    },
    FEL_CRED: felCred,
    LINES: lineRows,
    MUESTRA_PESO: showPeso,
    MUESTRA_MARCAS: showMarcas,
    TOTALES: {
      TOTALPRECIO: total,
      TOTALPRECIO_FMT: formatMoneyGt(total),
      SUBTOTAL: subtotalVenta,
      SUBTOTAL_FMT: formatMoneyGt(subtotalVenta),
      TOTALCOSTO: totalCosto,
      TOTALCOSTO_FMT: formatMoneyGt(totalCosto),
      DESCUENTO: descuento,
      DESCUENTO_FMT: formatMoneyGt(descuento),
      TOTAL_LETRAS: amountInWordsGt(total),
      LINEAS: lineRows.length,
      TOTALPESO: totalPesoDoc,
      TOTALPESO_FMT: formatPesoQty(totalPesoDoc),
    },
  };
}

/** CSS base CARTA (complementa PrintReport.baseStyles). */
const DEFAULT_CSS_CARTA = `
@page { margin: 12mm; }
.doc-print-sheet{max-width:210mm;margin:0 auto}
.report-header{margin-bottom:1rem;border-bottom:2px solid #1e3a5f;padding-bottom:.75rem}
.report-brand{display:flex;align-items:center;gap:.75rem}
.report-logo{max-height:64px;max-width:150px;object-fit:contain}
.report-empresa-nombre{font-size:1.15rem;font-weight:700;color:#1e3a5f}
.report-title{font-size:1rem;color:#333;margin-top:.15rem;font-weight:600}
.doc-meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.35rem .75rem;margin:.75rem 0 1rem;padding:.65rem .75rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:.35rem}
.doc-meta-item{font-size:11px}
.doc-meta-item strong{color:#334155}
.doc-lines-table{width:100%;border-collapse:collapse;margin-top:.5rem}
.doc-lines-table th{background:#1e3a5f;color:#fff;border:1px solid #1e3a5f;font-weight:600;font-size:11px;padding:5px 8px;text-align:left}
.doc-lines-table td{border:1px solid #d1d5db;font-size:11px;padding:5px 8px}
.doc-lines-table td strong{display:block;font-size:10px;font-weight:700;margin-top:2px;line-height:1.25}
.doc-lines-table tbody tr:nth-child(even){background:#f9fafb}
.text-end{text-align:right}
.doc-totals-sep{border:0;border-top:1px solid #cbd5e1;margin:.65rem 0 .5rem}
.doc-totals{margin-top:.75rem;padding:.65rem .75rem;background:#f0f9ff;border:1px solid #bae6fd;border-radius:.35rem}
.doc-totals-row{display:flex;justify-content:space-between;gap:1rem;font-size:12px;margin:.1rem 0}
.doc-totals-row.grand{font-size:1rem;font-weight:700;color:#1e3a5f;margin-top:.35rem;padding-top:.35rem;border-top:1px solid #bae6fd}
.doc-footer{margin-top:1.25rem;padding-top:.5rem;border-top:1px solid #e5e7eb;font-size:10px;color:#6b7280;text-align:center}
.doc-obs{margin:.5rem 0;font-size:11px}
`;

const DEFAULT_CSS_TICKET = `
@page { size: 80mm auto; margin: 2mm; }
html{width:100%;margin:0;padding:0;box-sizing:border-box}
body{
  font-family:Consolas,Monaco,monospace;font-size:11px;color:#111;
  width:100%!important;max-width:none!important;margin:0!important;padding:2mm 2.5mm!important;
  box-sizing:border-box
}
.doc-print-sheet,.fel-ticket{width:100%!important;max-width:none!important;margin:0!important;box-sizing:border-box}
.report-header{margin-bottom:.5rem;border-bottom:1px dashed #999;padding-bottom:.4rem}
.report-brand{flex-direction:column;align-items:center;text-align:center;gap:.25rem;display:flex}
.report-logo{max-height:42px;max-width:68px}
.report-empresa-nombre{font-size:.85rem;font-weight:700}
.report-title{font-size:.8rem}
.doc-meta-grid{display:block}
.doc-meta-item{margin-bottom:.15rem;font-size:10px}
.doc-lines-table{width:100%;border-collapse:collapse;margin-top:.35rem}
.doc-lines-table th,.doc-lines-table td{font-size:9px;padding:2px 3px;border:1px solid #ccc}
.doc-lines-table th{background:#f3f3f3;text-align:left}
.text-end{text-align:right}
.doc-totals{font-size:10px;margin-top:.5rem}
.doc-totals-row{display:flex;justify-content:space-between}
.doc-totals-row.grand{font-weight:700;margin-top:.25rem}
.doc-footer{margin-top:.5rem;font-size:9px;text-align:center;color:#555}
@media print{
  html,body{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
  body{padding:1mm 1.5mm!important}
}
@media screen{
  html,body{width:100%!important;max-width:none!important;margin:0!important}
  body{padding:1.25rem 1.75rem!important;font-size:15px!important;line-height:1.35!important}
  .doc-print-sheet,.fel-ticket{width:100%!important;max-width:none!important;margin:0!important}
  .report-logo{max-height:72px!important;max-width:140px!important}
  .report-empresa-nombre{font-size:1.35rem!important}
  .report-title{font-size:1.1rem!important}
  .doc-meta-item{font-size:14px!important}
  .doc-lines-table th,.doc-lines-table td{font-size:13px!important;padding:6px 8px!important}
  .doc-totals,.doc-totals-row{font-size:14px!important}
  .doc-totals-row.grand{font-size:1.15rem!important}
  .doc-footer{font-size:12px!important}
}
`;

const DEFAULT_HTML = `<div class="doc-print-sheet">
  <header class="report-header">
    <div class="report-brand">
      {{#EMPRESA.LOGO_URL}}<div class="report-brand-logo"><img src="{{{EMPRESA.LOGO_URL}}}" alt="Logo" class="report-logo"></div>{{/EMPRESA.LOGO_URL}}
      <div class="report-brand-text">
        <div class="report-empresa-nombre">{{EMPRESA.NOMBRE}}</div>
        <h1 class="report-title">{{TITLE}}</h1>
      </div>
    </div>
  </header>
  <div class="doc-meta-grid">
    <div class="doc-meta-item"><strong>Documento:</strong> {{DOC.DOCUMENTO_LABEL}}</div>
    <div class="doc-meta-item"><strong>Fecha:</strong> {{DOC.FECHA}}</div>
    {{#DOC.SERIE}}<div class="doc-meta-item"><strong>Serie:</strong> {{DOC.SERIE}}</div>{{/DOC.SERIE}}
    {{#DOC.NUMERO}}<div class="doc-meta-item"><strong>Número:</strong> {{DOC.NUMERO}}</div>{{/DOC.NUMERO}}
    <div class="doc-meta-item"><strong>Cliente:</strong> {{DOC.DOC_NOMCLIE}}</div>
    <div class="doc-meta-item"><strong>NIT:</strong> {{DOC.DOC_NIT}}</div>
    <div class="doc-meta-item"><strong>Dirección:</strong> {{DOC.DOC_DIRCLIE}}</div>
    {{#DOC.F_ENTREGA}}<div class="doc-meta-item"><strong>Tipo entrega:</strong> {{DOC.F_ENTREGA}}</div>{{/DOC.F_ENTREGA}}
    {{#DOC.DIRENTREGA}}<div class="doc-meta-item"><strong>Dirección de entrega:</strong> {{DOC.DIRENTREGA}}</div>{{/DOC.DIRENTREGA}}
    <div class="doc-meta-item"><strong>Pago:</strong> {{DOC.CONCRE_LABEL}}</div>
    {{#DOC.FEL_UUDI}}<div class="doc-meta-item"><strong>FEL:</strong> {{DOC.FEL_UUDI}}</div>{{/DOC.FEL_UUDI}}
    {{#DOC.VENDEDOR}}<div class="doc-meta-item"><strong>Vendedor:</strong> {{DOC.VENDEDOR}}</div>{{/DOC.VENDEDOR}}
    {{#DOC.VENDEDOR_TELEFONO}}<div class="doc-meta-item"><strong>Tel. vendedor:</strong> {{DOC.VENDEDOR_TELEFONO}}</div>{{/DOC.VENDEDOR_TELEFONO}}
  </div>
  {{#DOC.OBS}}<p class="doc-obs"><em>{{DOC.OBS}}</em></p>{{/DOC.OBS}}
  <table class="doc-lines-table">
    <thead>
      <tr>
        <th>Cód.</th>
        <th>Descripción</th>
        <th class="text-end">Med.</th>
        <th class="text-end">Cant.</th>
        <th class="text-end">Precio</th>
        <th class="text-end">Total</th>
      </tr>
    </thead>
    <tbody>
      {{#LINES}}
      <tr>
        <td>{{CODPROD}}</td>
        <td>{{DESPROD}}</td>
        <td class="text-end">{{CODMEDIDA}}</td>
        <td class="text-end">{{CANTIDAD}}</td>
        <td class="text-end">{{PRECIO_FMT}}</td>
        <td class="text-end">{{TOTALPRECIO_FMT}}</td>
      </tr>
      {{/LINES}}
      {{^LINES}}
      <tr><td colspan="6" class="text-center">Sin líneas</td></tr>
      {{/LINES}}
    </tbody>
  </table>
  <hr class="doc-totals-sep">
  <div class="doc-totals">
    <div class="doc-totals-row"><span>Subtotal</span><span>{{TOTALES.SUBTOTAL_FMT}}</span></div>
    <div class="doc-totals-row"><span>Descuento</span><span>{{TOTALES.DESCUENTO_FMT}}</span></div>
    <div class="doc-totals-row grand">
      <span>Total</span>
      <span>{{TOTALES.TOTALPRECIO_FMT}}</span>
    </div>
  </div>
  <div class="doc-footer">{{FOOTER}}</div>
</div>`;

const RETENCION_DEFAULT_HTML = `<div class="doc-print-sheet">
  <header class="report-header">
    <div class="report-brand">
      {{#EMPRESA.LOGO_URL}}<div class="report-brand-logo"><img src="{{{EMPRESA.LOGO_URL}}}" alt="Logo" class="report-logo"></div>{{/EMPRESA.LOGO_URL}}
      <div class="report-brand-text">
        <div class="report-empresa-nombre">{{EMPRESA.NOMBRE}}</div>
        <h1 class="report-title">{{TITLE}}</h1>
      </div>
    </div>
  </header>
  <div class="doc-meta-grid">
    <div class="doc-meta-item"><strong>Documento:</strong> {{DOC.DOCUMENTO_LABEL}}</div>
    <div class="doc-meta-item"><strong>Fecha:</strong> {{DOC.FECHA}}</div>
    {{#DOC.SERIE}}<div class="doc-meta-item"><strong>Serie:</strong> {{DOC.SERIE}}</div>{{/DOC.SERIE}}
    {{#DOC.NUMERO}}<div class="doc-meta-item"><strong>Número:</strong> {{DOC.NUMERO}}</div>{{/DOC.NUMERO}}
    <div class="doc-meta-item"><strong>Nombre:</strong> {{DOC.DOC_NOMCLIE}}</div>
    <div class="doc-meta-item"><strong>NIT:</strong> {{DOC.DOC_NIT}}</div>
    <div class="doc-meta-item"><strong>Pago:</strong> {{DOC.CONCRE_LABEL}}</div>
  </div>
  {{#DOC.OBS}}<p class="doc-obs"><em>{{DOC.OBS}}</em></p>{{/DOC.OBS}}
  <table class="doc-lines-table">
    <thead>
      <tr>
        <th>Documento</th>
        <th>Serie / cálculo</th>
        <th class="text-end">Total factura</th>
        <th class="text-end">Retención</th>
      </tr>
    </thead>
    <tbody>
      {{#LINES}}
      <tr>
        <td>{{CODPROD}}</td>
        <td>{{DESPROD}}</td>
        <td class="text-end">{{PRECIO_FMT}}</td>
        <td class="text-end">{{TOTALPRECIO_FMT}}</td>
      </tr>
      {{/LINES}}
      {{^LINES}}
      <tr><td colspan="4" class="text-center">Sin facturas asociadas</td></tr>
      {{/LINES}}
    </tbody>
  </table>
  <div class="doc-totals">
    <div class="doc-totals-row grand">
      <span>Total retención</span>
      <span>{{TOTALES.TOTALPRECIO_FMT}}</span>
    </div>
  </div>
  <div class="doc-footer">{{FOOTER}}</div>
</div>`;

/** Cotización: detalle con CODPROD, DESPROD, CODMEDIDA, CANTIDAD, PRECIO (moneda, no se totaliza) y TOTALPRECIO. */
const COT_DEFAULT_HTML = `<div class="doc-print-sheet">
  <header class="report-header">
    <div class="report-brand">
      {{#EMPRESA.LOGO_URL}}<div class="report-brand-logo"><img src="{{{EMPRESA.LOGO_URL}}}" alt="Logo" class="report-logo"></div>{{/EMPRESA.LOGO_URL}}
      <div class="report-brand-text">
        <div class="report-empresa-nombre">{{EMPRESA.NOMBRE}}</div>
        <h1 class="report-title">{{TITLE}}</h1>
      </div>
    </div>
  </header>
  <div class="doc-meta-grid">
    <div class="doc-meta-item"><strong>Documento:</strong> {{DOC.DOCUMENTO_LABEL}}</div>
    <div class="doc-meta-item"><strong>Fecha:</strong> {{DOC.FECHA}}</div>
    {{#DOC.SERIE}}<div class="doc-meta-item"><strong>Serie:</strong> {{DOC.SERIE}}</div>{{/DOC.SERIE}}
    {{#DOC.NUMERO}}<div class="doc-meta-item"><strong>Número:</strong> {{DOC.NUMERO}}</div>{{/DOC.NUMERO}}
    <div class="doc-meta-item"><strong>Cliente:</strong> {{DOC.DOC_NOMCLIE}}</div>
    <div class="doc-meta-item"><strong>NIT:</strong> {{DOC.DOC_NIT}}</div>
    <div class="doc-meta-item"><strong>Dirección:</strong> {{DOC.DOC_DIRCLIE}}</div>
    {{#DOC.F_ENTREGA}}<div class="doc-meta-item"><strong>Tipo entrega:</strong> {{DOC.F_ENTREGA}}</div>{{/DOC.F_ENTREGA}}
    {{#DOC.DIRENTREGA}}<div class="doc-meta-item"><strong>Dirección de entrega:</strong> {{DOC.DIRENTREGA}}</div>{{/DOC.DIRENTREGA}}
    {{#DOC.VENDEDOR}}<div class="doc-meta-item"><strong>Vendedor:</strong> {{DOC.VENDEDOR}}</div>{{/DOC.VENDEDOR}}
    {{#DOC.VENDEDOR_TELEFONO}}<div class="doc-meta-item"><strong>Tel. vendedor:</strong> {{DOC.VENDEDOR_TELEFONO}}</div>{{/DOC.VENDEDOR_TELEFONO}}
  </div>
  {{#DOC.OBS}}<p class="doc-obs"><em>{{DOC.OBS}}</em></p>{{/DOC.OBS}}
  <table class="doc-lines-table">
    <thead>
      <tr>
        <th>Cód.</th>
        <th>Descripción</th>
        <th class="text-end">Med.</th>
        <th class="text-end">Cant.</th>
        <th class="text-end">Precio</th>
        <th class="text-end">Total</th>
      </tr>
    </thead>
    <tbody>
      {{#LINES}}
      <tr>
        <td>{{CODPROD}}</td>
        <td>{{DESPROD}}</td>
        <td class="text-end">{{CODMEDIDA}}</td>
        <td class="text-end">{{CANTIDAD}}</td>
        <td class="text-end">{{PRECIO_FMT}}</td>
        <td class="text-end">{{TOTALPRECIO_FMT}}</td>
      </tr>
      {{/LINES}}
      {{^LINES}}
      <tr><td colspan="6" class="text-center">Sin líneas</td></tr>
      {{/LINES}}
    </tbody>
  </table>
  <hr class="doc-totals-sep">
  <div class="doc-totals">
    <div class="doc-totals-row"><span>Subtotal</span><span>{{TOTALES.SUBTOTAL_FMT}}</span></div>
    <div class="doc-totals-row"><span>Descuento</span><span>{{TOTALES.DESCUENTO_FMT}}</span></div>
    <div class="doc-totals-row grand">
      <span>Total</span>
      <span>{{TOTALES.TOTALPRECIO_FMT}}</span>
    </div>
  </div>
  <div class="doc-footer">{{FOOTER}}</div>
</div>`;

/** Ticket FEL (FEF / FEC / FES) — layout tipo representación gráfica SAT. */
const FEL_TICKET_CSS = `
@page { size: 80mm auto; margin: 2mm; }
html{width:100%;margin:0;padding:0;box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{
  font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.25;color:#111;
  width:100%!important;max-width:none!important;padding:2mm!important;box-sizing:border-box
}
.fel-ticket{width:100%!important;max-width:none!important;margin:0!important;box-sizing:border-box}
.fel-c{text-align:center}
.fel-l{text-align:left}
.fel-r{text-align:right}
.fel-logo{max-height:52px;max-width:70px;object-fit:contain;margin:0 auto 4px;display:block}
.fel-nombre{font-size:13px;font-weight:700;text-transform:uppercase;margin:2px 0}
.fel-razon{font-size:10px;font-weight:600;margin:1px 0}
.fel-muted{font-size:9.5px;margin:1px 0;word-break:break-word}
.fel-sep{border:0;border-top:1px dashed #666;margin:6px 0}
.fel-dte-label{font-size:10px;font-weight:700;margin:4px 0 2px;text-transform:uppercase}
.fel-dte-tipo{font-size:11px;font-weight:700;margin:0 0 6px;text-transform:uppercase}
.fel-meta{font-size:10.5px;margin:2px 0}
.fel-meta strong{font-weight:700}
.fel-detalle-title{font-size:11px;font-weight:700;margin:8px 0 4px;letter-spacing:.04em}
.fel-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 6px}
.fel-table th{font-size:9px;font-weight:700;padding:2px 1px;border-bottom:1px solid #333;vertical-align:bottom}
.fel-table td{font-size:9.5px;padding:3px 1px;vertical-align:top;word-break:break-word}
.fel-table .col-cant{width:12%}
.fel-table .col-desc{width:40%}
.fel-table .col-pu{width:24%}
.fel-table .col-tot{width:24%}
.fel-sep-totals{margin-top:8px;margin-bottom:6px}
.fel-totals{margin:4px 0 6px;padding-top:4px;border-top:1px solid #333}
.fel-totals-row{display:flex;justify-content:flex-end;gap:10px;font-size:10.5px;margin:2px 0}
.fel-totals-row.grand{font-size:12px;font-weight:700}
.fel-letras{font-size:9.5px;margin:6px 0;text-transform:uppercase}
.fel-frase{font-size:9.5px;font-weight:700;margin:6px 0;text-transform:uppercase}
.fel-frase-exento{text-transform:none;font-weight:600;font-size:9px;line-height:1.35;margin-top:4px}
.fel-obs{font-size:9px;margin:6px 0;text-transform:uppercase}
.fel-obs-body{white-space:pre-line;text-transform:none;line-height:1.35}
.fel-obs-title{font-weight:700;margin-bottom:2px}
.fel-cert{font-size:9px;margin:8px 0 4px}
.fel-cert-title{font-weight:700;margin-bottom:3px}
.fel-uuid{word-break:break-all;font-size:8.5px}
.fel-auth-block{margin:5px 0 2px}
.fel-auth-uuid{font-size:8.5px;line-height:1.2;margin-top:2px}
.fel-cert-fecha{margin:2px 0 4px;font-size:9.5px}
.fel-blank-line{height:.65rem;margin:0}
.fel-client-block .fel-meta{text-transform:none}
.fel-emisor-nombre{font-size:10px;font-weight:600;margin:1px 0;min-height:1.1em}
.fel-client-block .fel-meta strong{font-weight:700;margin-right:2px}
.fel-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:6px;margin-top:8px}
.fel-qr{width:78px;height:78px;object-fit:contain}
.fel-fel-badge{flex:1;text-align:center;padding-bottom:4px}
.fel-fel-badge svg{width:92px;height:auto;max-width:100%}
.fel-scan{font-size:8px;margin-top:4px;text-transform:uppercase}
@media print{
  html,body{width:100%!important;max-width:none!important;margin:0!important;padding:0!important}
  body{padding:1mm!important}
  .fel-ticket{width:100%!important}
}
@media screen{
  html,body{width:100%!important;max-width:none!important;margin:0!important}
  body{padding:1.25rem 1.75rem!important;font-size:15px!important;line-height:1.35!important}
  .fel-ticket{width:100%!important;max-width:none!important;margin:0!important}
  .fel-logo{max-height:84px!important;max-width:140px!important}
  .fel-nombre{font-size:1.35rem!important}
  .fel-dte-tipo{font-size:1.1rem!important}
  .fel-meta,.fel-muted,.fel-razon{font-size:14px!important}
  .fel-table th,.fel-table td{font-size:13px!important;padding:6px 8px!important}
  .fel-totals-row{font-size:14px!important}
  .fel-totals-row.grand{font-size:1.15rem!important}
  .fel-qr{width:110px!important;height:110px!important}
  .fel-fel-badge svg{width:120px!important}
  .fel-scan,.fel-uuid{font-size:12px!important}
}
.fel-peso{font-size:9px;color:#666;margin-left:3px;font-weight:400}
.fel-complemento{margin:.55rem 0;padding:.45rem 0;border-top:1px dashed #999;border-bottom:1px dashed #999}
.fel-complemento-title{font-size:10px;font-weight:800;text-align:center;margin-bottom:.35rem;letter-spacing:.04em}
.fel-comp-table{width:100%;border-collapse:collapse;margin-top:.25rem;font-size:9px}
.fel-comp-table th,.fel-comp-table td{border:1px solid #ccc;padding:2px 4px}
.fel-comp-table th{background:#f3f3f3;font-weight:700}
/* fac-ticket-logo-v2 — logo FAC al doble que ticket FEL */
.fac-ticket-doc .fel-logo{max-height:104px;max-width:140px;object-fit:contain;margin:0 auto 4px;display:block}
@media screen{
  .fac-ticket-doc .fel-logo{max-height:168px!important;max-width:280px!important}
}
@media print{
  .fac-ticket-doc .fel-logo{max-height:104px!important;max-width:140px!important}
}
`;

/** Ticket FAC (sin FEL) — layout compacto 80mm. */
const FAC_TICKET_HTML = `<div class="doc-print-sheet fel-ticket fac-ticket-doc">
  <div class="fel-c">
    {{#EMPRESA.LOGO_URL}}<img class="fel-logo" src="{{{EMPRESA.LOGO_URL}}}" alt="Logo">{{/EMPRESA.LOGO_URL}}
    <div class="fel-nombre">{{EMPRESA.NOMBRE}}</div>
    {{#EMPRESA.DIRECCION}}<div class="fel-muted">{{EMPRESA.DIRECCION}}</div>{{/EMPRESA.DIRECCION}}
    <div class="fel-muted">NIT: {{EMPRESA.NIT}}</div>
    {{#EMPRESA.TELEFONO}}<div class="fel-muted">Tel.: {{EMPRESA.TELEFONO}}</div>{{/EMPRESA.TELEFONO}}
  </div>
  <hr class="fel-sep">
  <div class="fel-c">
    <div class="fel-dte-tipo">{{TITLE}}</div>
    <div class="fel-meta"><strong>Doc.:</strong> {{DOC.DOCUMENTO_LABEL}}</div>
  </div>
  <div class="fel-l">
    {{#DOC.SERIE}}<div class="fel-meta"><strong>Serie:</strong> {{DOC.SERIE}}</div>{{/DOC.SERIE}}
    {{#DOC.NUMERO}}<div class="fel-meta"><strong>No.:</strong> {{DOC.NUMERO}}</div>{{/DOC.NUMERO}}
    <div class="fel-meta"><strong>Fecha:</strong> {{DOC.FECHA}}</div>
    <div class="fel-meta"><strong>Cliente:</strong> {{DOC.DOC_NOMCLIE}}</div>
    <div class="fel-meta"><strong>NIT:</strong> {{DOC.DOC_NIT}}</div>
    {{#DOC.VENDEDOR}}<div class="fel-meta"><strong>Vendedor:</strong> {{DOC.VENDEDOR}}</div>{{/DOC.VENDEDOR}}
    <div class="fel-meta"><strong>Pago:</strong> {{DOC.CONCRE_LABEL}}</div>
  </div>
  <div class="fel-c fel-detalle-title">DETALLE</div>
  <table class="fel-table">
    <thead>
      <tr>
        <th class="col-cant fel-l">Cant.</th>
        <th class="col-desc fel-l">Descripción</th>
        <th class="col-tot fel-r">Total</th>
      </tr>
    </thead>
    <tbody>
      {{#LINES}}
      <tr>
        <td class="fel-l">{{CANTIDAD}}</td>
        <td class="fel-l">{{DESPROD}}</td>
        <td class="fel-r">{{TOTALPRECIO_FMT}}</td>
      </tr>
      {{/LINES}}
      {{^LINES}}
      <tr><td colspan="3" class="fel-c">Sin líneas</td></tr>
      {{/LINES}}
    </tbody>
  </table>
  <hr class="fel-sep fel-sep-totals">
  <div class="fel-totals">
    <div class="fel-totals-row"><span>Subtotal</span><span>{{TOTALES.SUBTOTAL_FMT}}</span></div>
    <div class="fel-totals-row"><span>Descuento</span><span>{{TOTALES.DESCUENTO_FMT}}</span></div>
    <div class="fel-totals-row grand"><span>TOTAL</span><span>{{TOTALES.TOTALPRECIO_FMT}}</span></div>
  </div>
  {{#DOC.OBS}}<div class="fel-obs fel-c"><div class="fel-obs-title">OBS:</div><div>{{DOC.OBS}}</div></div>{{/DOC.OBS}}
  <div class="fel-muted fel-c">{{FOOTER}}</div>
</div>`;

const FEL_TICKET_HTML = `<!-- fel-header-cred-v10 -->
<div class="fel-ticket">
  <div class="fel-c">
    {{#EMPRESA.LOGO_URL}}<img class="fel-logo" src="{{{EMPRESA.LOGO_URL}}}" alt="Logo">{{/EMPRESA.LOGO_URL}}
    <div class="fel-nombre fel-line-comercial">{{FEL_CRED.EMISOR_NOMBRECOMECIAL}}</div>
    <div class="fel-razon fel-emisor-nombre fel-line-emisor">{{FEL_CRED.RAZON_SOCIAL}}</div>
    {{#FEL_CRED.DIRECCION}}<div class="fel-muted">{{FEL_CRED.DIRECCION}}</div>{{/FEL_CRED.DIRECCION}}
    <div class="fel-muted">NIT: {{FEL_CRED.NIT}}</div>
    {{#FEL_CRED.TEL_SUCURSAL}}<div class="fel-muted">Tel.: {{FEL_CRED.TEL_SUCURSAL}}</div>{{/FEL_CRED.TEL_SUCURSAL}}
  </div>

  {{#DOC.FEL_UUDI}}
  <div class="fel-c fel-auth-block">
    <div class="fel-meta"><strong>Autorización</strong></div>
    <div class="fel-uuid fel-auth-uuid">{{DOC.FEL_UUDI}}</div>
  </div>
  {{/DOC.FEL_UUDI}}
  {{#DOC.FEL_FECHA}}<div class="fel-c fel-muted fel-cert-fecha">Fecha Certificación: {{DOC.FEL_FECHA}}</div>{{/DOC.FEL_FECHA}}

  <hr class="fel-sep">

  <div class="fel-c">
    <div class="fel-dte-label">DOCUMENTO TRIBUTARIO ELECTRÓNICO</div>
    <div class="fel-dte-tipo">{{DOC.FEL_TITULO}}</div>
  </div>

  <div class="fel-l">
    <div class="fel-meta"><strong>SERIE:</strong> {{DOC.FEL_SERIE}}</div>
    <div class="fel-meta"><strong>NUMERO:</strong> {{DOC.FEL_NUMERO}}</div>
    <div class="fel-meta"><strong>FECHA:</strong> {{DOC.FEL_FECHA}}</div>
  </div>

  <div class="fel-blank-line" aria-hidden="true"></div>

  <div class="fel-l fel-client-block">
    <div class="fel-meta"><strong>NIT:</strong> {{DOC.DOC_NIT}}</div>
    <div class="fel-meta"><strong>NOMBRE:</strong> {{DOC.DOC_NOMCLIE}}</div>
    <div class="fel-meta"><strong>DIRECCION:</strong> {{DOC.DOC_DIRCLIE}}</div>
  </div>

  <div class="fel-blank-line" aria-hidden="true"></div>

  <table class="fel-table">
    <thead>
      <tr>
        <th class="col-cant fel-l">Cant.</th>
        <th class="col-desc fel-l">Descripción</th>
        <th class="col-pu fel-r">Precio U.</th>
        <th class="col-tot fel-r">Total</th>
      </tr>
    </thead>
    <tbody>
      {{#LINES}}
      <tr>
        <td class="fel-l">{{CANTIDAD}}</td>
        <td class="fel-l">{{DESPROD}}</td>
        <td class="fel-r">{{PRECIO_FMT}}</td>
        <td class="fel-r">{{TOTALPRECIO_FMT}}{{#PESO_SUFFIX}}<span class="fel-peso">{{PESO_SUFFIX}}</span>{{/PESO_SUFFIX}}</td>
      </tr>
      {{/LINES}}
      {{^LINES}}
      <tr><td colspan="4" class="fel-c">Sin líneas</td></tr>
      {{/LINES}}
    </tbody>
  </table>

  <hr class="fel-sep fel-sep-totals">

  <div class="fel-totals">
    <div class="fel-totals-row"><span>Subtotal</span><span>{{TOTALES.SUBTOTAL_FMT}}</span></div>
    <div class="fel-totals-row"><span>Descuento</span><span>{{TOTALES.DESCUENTO_FMT}}</span></div>
    <div class="fel-totals-row grand"><span>TOTAL</span><span>{{TOTALES.TOTALPRECIO_FMT}}</span></div>
  </div>

  {{#DOC.FEL_COMPLEMENTO_SHOW}}
  <div class="fel-complemento fel-l">
    <div class="fel-complemento-title">COMPLEMENTO DE FACTURA ELECTRÓNICA</div>
    <div class="fel-meta"><strong>Número de cuotas:</strong> {{DOC.FEL_NUM_CUOTAS}}</div>
    <table class="fel-comp-table">
      <thead>
        <tr>
          <th class="fel-l">Cuota</th>
          <th class="fel-l">Fecha vencimiento</th>
          <th class="fel-r">Valor</th>
        </tr>
      </thead>
      <tbody>
        {{#DOC.FEL_CUOTAS}}
        <tr>
          <td class="fel-l">{{NUM}}</td>
          <td class="fel-l">{{FECHA}}</td>
          <td class="fel-r">{{MONTO_FMT}}</td>
        </tr>
        {{/DOC.FEL_CUOTAS}}
      </tbody>
    </table>
  </div>
  {{/DOC.FEL_COMPLEMENTO_SHOW}}

  <div class="fel-letras fel-l"><strong>TOTAL EN LETRAS:</strong> {{TOTALES.TOTAL_LETRAS}}</div>

  {{#FEL_CRED.FRASE1}}<div class="fel-frase fel-c">{{FEL_CRED.FRASE1}}</div>{{/FEL_CRED.FRASE1}}
  {{#FEL_CRED.FRASE2}}<div class="fel-frase fel-c">{{FEL_CRED.FRASE2}}</div>{{/FEL_CRED.FRASE2}}
  {{#FEL_CRED.FRASE3}}<div class="fel-frase fel-c">{{FEL_CRED.FRASE3}}</div>{{/FEL_CRED.FRASE3}}
  {{#DOC.FEL_EXENTO_LEYENDA}}<div class="fel-frase fel-c fel-frase-exento">{{DOC.FEL_EXENTO_LEYENDA}}</div>{{/DOC.FEL_EXENTO_LEYENDA}}

  {{#DOC.TIPODOC_OBS}}
  <div class="fel-obs fel-c">
    <div class="fel-obs-title">OBSERVACIONES:</div>
    <div class="fel-obs-body">{{DOC.TIPODOC_OBS}}</div>
  </div>
  {{/DOC.TIPODOC_OBS}}

  {{#DOC.FEL_UUDI}}
  <div class="fel-cert fel-c">
    <div class="fel-cert-title">Datos Del Certificador</div>
    <div>Certificador: {{FEL.CERTIFICADOR}} NIT: {{FEL.CERTIFICADOR_NIT}}</div>
  </div>

  <div class="fel-foot">
    <div class="fel-c">
      {{#DOC.FEL_QR_IMG}}<img class="fel-qr" src="{{{DOC.FEL_QR_IMG}}}" alt="QR FEL">{{/DOC.FEL_QR_IMG}}
      <div class="fel-scan">ESCANEA EL CÓDIGO DESDE TU CELULAR</div>
    </div>
    <div class="fel-fel-badge">
      <svg viewBox="0 0 120 56" xmlns="http://www.w3.org/2000/svg" aria-label="fel Factura Electrónica">
        <rect x="1" y="1" width="118" height="54" rx="4" fill="#fff" stroke="#1e3a8a" stroke-width="2"/>
        <text x="60" y="26" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="700" fill="#1e3a8a">fel</text>
        <text x="60" y="44" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" fill="#1e3a8a">Factura Electrónica</text>
      </svg>
    </div>
  </div>
  {{/DOC.FEL_UUDI}}
</div>`;

const FEL_TICKET_TIPODOCS = ['FEF', 'FEC', 'FES', 'FNC'];

function isFelTicketTipodoc(tipodoc) {
  return FEL_TICKET_TIPODOCS.includes(String(tipodoc || '').trim().toUpperCase());
}

function getFelTicketTemplate(tipodoc = 'FEF') {
  const t = String(tipodoc || 'FEF').trim().toUpperCase();
  const labels = {
    FEF: 'Ticket FEL — Factura electrónica',
    FEC: 'Ticket FEL — Factura cambiaria',
    FES: 'Ticket FEL — Pequeño contribuyente',
    FNC: 'Ticket FEL — Nota de crédito electrónica',
  };
  return {
    PAPEL: 'TICKET',
    TIPODOC: t,
    NOMBRE: labels[t] || `Ticket FEL — ${t}`,
    HTML: FEL_TICKET_HTML,
    CSS: FEL_TICKET_CSS,
    ES_DEFAULT: true,
  };
}

function getDefaultTemplate(papel = 'CARTA', tipodoc = '') {
  const t = String(tipodoc || '').trim().toUpperCase();
  const p = String(papel || 'CARTA').trim().toUpperCase() === 'TICKET' ? 'TICKET' : 'CARTA';
  if (p === 'TICKET' && isFelTicketTipodoc(t)) {
    return getFelTicketTemplate(t);
  }
  if (p === 'TICKET' && t === 'FAC') {
    return {
      PAPEL: 'TICKET',
      TIPODOC: 'FAC',
      NOMBRE: 'Factura ticket (sistema)',
      HTML: FAC_TICKET_HTML,
      CSS: `${DEFAULT_CSS_TICKET}\n${FEL_TICKET_CSS}`,
      ES_DEFAULT: true,
    };
  }
  if (t === 'COT') {
    return {
      PAPEL: p,
      TIPODOC: 'COT',
      NOMBRE: p === 'TICKET' ? 'Cotización ticket (sistema)' : 'Cotización carta (sistema)',
      HTML: COT_DEFAULT_HTML,
      CSS: p === 'TICKET' ? DEFAULT_CSS_TICKET : DEFAULT_CSS_CARTA,
      ES_DEFAULT: true,
    };
  }
  if (['RTV', 'RTI', 'RVR', 'RIR'].includes(t)) {
    return {
      PAPEL: p,
      TIPODOC: t,
      NOMBRE: p === 'TICKET' ? 'Retención ticket (sistema)' : 'Retención carta (sistema)',
      HTML: RETENCION_DEFAULT_HTML,
      CSS: p === 'TICKET' ? DEFAULT_CSS_TICKET : DEFAULT_CSS_CARTA,
      ES_DEFAULT: true,
    };
  }
  return {
    PAPEL: p,
    NOMBRE: p === 'TICKET' ? 'Formato ticket (sistema)' : 'Formato carta (sistema)',
    HTML: DEFAULT_HTML,
    CSS: p === 'TICKET' ? DEFAULT_CSS_TICKET : DEFAULT_CSS_CARTA,
    ES_DEFAULT: true,
  };
}

function samplePrintContext() {
  return buildPrintContext({
    empresa: {
      EMPNIT: '118217003',
      EMPNOMBRE: 'CONSTRUPERFILES EL CAMPESINO',
      EMPRAZONSOCIAL: 'GRUPO RAGARO RETALTECO S.A.',
      EMPDIRECCION: '5 AVENIDA 9 93 ZONA 1 RETALHULEU, RETALHULEU',
      EMPTELEFONO: '7772-2556 / 7725-4176',
      EMPEMAIL: 'ConstruperfilesElCampesino2023@gmail.com',
    },
    header: {
      CODDOC: 'FEF',
      CORRELATIVO: 389890835,
      TIPODOC: 'FEF',
      DESDOC: 'Factura electrónica',
      FECHA_ISO: '2026-07-01',
      FECHA: '2026-07-01',
      DOC_NOMCLIE: 'CONSUMIDOR FINAL',
      DOC_NIT: 'CF',
      DOC_DIRCLIE: 'CIUDAD',
      F_ENTREGA: 'A DOMICILIO',
      DIRENTREGA: 'ZONA 1, RETALHULEU',
      CONCRE: 'CON',
      OBS: '',
      TOTALPRECIO: 10,
      TOTALDESCUENTO: 0,
      FEL_UUDI: '081DAAE9-173D-4313-88FD-613F889443E4',
      FEL_SERIE: '081DAAE9',
      FEL_NUMERO: '389890835',
      FEL_FECHA: '2026-07-01T07:31:12-06:00',
    },
    lines: [
      {
        CODPROD: 'CL01',
        DESPROD: 'CLAVO PARA LAMINA',
        DESMARCA: 'EJEMPLO MARCA',
        CODMEDIDA: 'UN',
        CANTIDAD: 1,
        PRECIO: 10,
        TOTALPRECIO: 10,
      },
    ],
    title: 'Factura electrónica',
    footerNote: 'Vista previa — POS OnneB',
    felCredencial: {
      EMISOR_NOMBRECOMECIAL: 'CONSTRUPERFILES EL CAMPESINO',
      EMISOR_NOMBRE: 'RAGARO S.A.',
      EMISOR_DIRECCION: '5 AVENIDA 9 93 ZONA 1',
      EMISOR_MUNICIPIO: 'RETALHULEU',
      EMISOR_DEPARTAMENTO: 'RETALHULEU',
      EMISOR_NIT: '118217003',
      ADENDA_TELSUCURSAL: '7772-2556',
      FRASE1: 'SUJETO A PAGOS TRIMESTRALES ISR',
    },
    tipodocObs: 'Después de 15 días, no se aceptan cambios ni devoluciones.',
  });
}

module.exports = {
  escapeHtml,
  renderTemplate,
  buildPrintContext,
  getDefaultTemplate,
  getFelTicketTemplate,
  isFelTicketTipodoc,
  samplePrintContext,
  formatMoneyGt,
  amountInWordsGt,
  FEL_TICKET_TIPODOCS,
  FEL_PRINT_TIPODOCS,
  isFelPrintTipodoc,
  buildFelCredContext,
  joinFelCredDireccion,
  DEFAULT_HTML,
  DEFAULT_CSS_CARTA,
  DEFAULT_CSS_TICKET,
  FEL_TICKET_HTML,
  FEL_TICKET_CSS,
};
