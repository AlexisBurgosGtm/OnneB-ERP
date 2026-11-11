/**
 * PDFKit — carga por ruta de archivo (compatible con pkg snapshot).
 * En .exe, pdfkit usa imports "#standard-fonts/*" que pkg no resuelve: hook abajo.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const { getBundleRoot } = require('./app-paths');

let pdfkitRootCache = null;

function pdfkitRootDir() {
  if (pdfkitRootCache) return pdfkitRootCache;
  try {
    pdfkitRootCache = path.dirname(require.resolve('pdfkit/package.json'));
  } catch {
    pdfkitRootCache = path.join(getBundleRoot(), 'node_modules', 'pdfkit');
  }
  return pdfkitRootCache;
}

function installPdfkitImportHook() {
  if (installPdfkitImportHook._done) return;
  installPdfkitImportHook._done = true;
  const root = pdfkitRootDir();
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (typeof request === 'string') {
      if (request.startsWith('#standard-fonts/')) {
        const name = request.slice('#standard-fonts/'.length);
        const file = path.join(root, 'js', 'standard-fonts', `${name}.cjs`);
        if (fs.existsSync(file)) return file;
      }
      const nodeShims = {
        '#fs': path.join(root, 'lib', 'fs', 'node.js'),
        '#zlib': path.join(root, 'lib', 'zlib', 'node.js'),
        '#stream': path.join(root, 'lib', 'stream', 'node.js'),
      };
      if (nodeShims[request] && fs.existsSync(nodeShims[request])) {
        return nodeShims[request];
      }
    }
    return orig.call(this, request, parent, isMain, options);
  };
}

function requirePdfkitFile(rel) {
  const full = path.join(pdfkitRootDir(), rel);
  return require(full);
}

installPdfkitImportHook();

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
