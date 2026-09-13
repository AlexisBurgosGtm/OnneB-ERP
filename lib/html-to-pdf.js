/**
 * Convierte HTML a PDF vía Chrome/Edge headless (--print-to-pdf).
 * Sin Puppeteer (compatible con pkg / instalación típica Windows).
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { documentosDir } = require('./app-paths');

function safeName(name) {
  return (
    String(name || 'documento')
      .replace(/[^\w.\-áéíóúÁÉÍÓÚñÑ ]+/g, '_')
      .trim()
      .slice(0, 120) || 'documento'
  );
}

function candidateBrowsers() {
  const localApp = process.env.LOCALAPPDATA || '';
  const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  return [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localApp, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(localApp, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);
}

function resolveBrowserPath() {
  for (const p of candidateBrowsers()) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function runPrintToPdf(browserPath, htmlFileUrl, pdfPath, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      `--print-to-pdf=${pdfPath}`,
      '--print-to-pdf-no-header',
      htmlFileUrl,
    ];
    const child = spawn(browserPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      reject(new Error('Tiempo agotado al generar PDF del documento'));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) {
        resolve(pdfPath);
        return;
      }
      reject(
        new Error(
          stderr.trim() ||
            `No se pudo generar el PDF (código ${code ?? '?'}). Verifique Chrome/Edge instalado.`
        )
      );
    });
  });
}

/**
 * @param {string} html
 * @param {{ fileName?: string }} [opts]
 * @returns {Promise<{ filePath: string, fileName: string, htmlPath: string }>}
 */
async function writeHtmlPdf(html, opts = {}) {
  const body = String(html || '').trim();
  if (!body) {
    const err = new Error('HTML vacío para generar PDF');
    err.statusCode = 400;
    throw err;
  }
  const browserPath = resolveBrowserPath();
  if (!browserPath) {
    const err = new Error(
      'No se encontró Chrome ni Edge para generar el PDF. Instale uno de ellos o envíe como texto.'
    );
    err.statusCode = 501;
    throw err;
  }

  const dir = documentosDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = safeName(opts.fileName || `documento-${stamp}`).replace(/\.pdf$/i, '');
  const fileName = `${base}.pdf`;
  const htmlName = `${base}.html`;
  const filePath = path.join(dir, fileName);
  const htmlPath = path.join(dir, htmlName);

  fs.writeFileSync(htmlPath, body, 'utf8');
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      /* ignore */
    }
  }

  const htmlUrl = pathToFileURL(htmlPath).href;
  await runPrintToPdf(browserPath, htmlUrl, filePath);
  return { filePath, fileName, htmlPath };
}

module.exports = {
  writeHtmlPdf,
  resolveBrowserPath,
};
