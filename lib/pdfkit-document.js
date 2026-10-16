/**
 * PDFKit — carga por ruta de archivo (compatible con pkg snapshot).
 */
'use strict';

const path = require('path');

function requirePdfkitFile(rel) {
  return require(path.join(__dirname, '..', 'node_modules', 'pdfkit', rel));
}

const STANDARD_FONTS = [
  'js/standard-fonts/Courier.cjs',
  'js/standard-fonts/CourierBold.cjs',
  'js/standard-fonts/CourierBoldOblique.cjs',
  'js/standard-fonts/CourierOblique.cjs',
  'js/standard-fonts/Helvetica.cjs',
  'js/standard-fonts/HelveticaBold.cjs',
  'js/standard-fonts/HelveticaBoldOblique.cjs',
  'js/standard-fonts/HelveticaOblique.cjs',
  'js/standard-fonts/Symbol.cjs',
  'js/standard-fonts/TimesBold.cjs',
  'js/standard-fonts/TimesBoldItalic.cjs',
  'js/standard-fonts/TimesItalic.cjs',
  'js/standard-fonts/TimesRoman.cjs',
  'js/standard-fonts/ZapfDingbats.cjs',
];

for (const rel of STANDARD_FONTS) {
  requirePdfkitFile(rel);
}

module.exports = requirePdfkitFile('js/pdfkit.js');
