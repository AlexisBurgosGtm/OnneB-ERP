/**
 * Genera public/css/login-parallax.css scoped al login (demo wagerfield/parallax).
 */
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'parallax-demo-styles.css');
const outPath = path.join(__dirname, '..', 'public', 'css', 'login-parallax.css');

if (!fs.existsSync(srcPath)) {
  console.error('Missing scripts/parallax-demo-styles.css — download from demo first.');
  process.exit(1);
}

const raw = fs.readFileSync(srcPath, 'utf8');
const lines = raw.split(/\r?\n/);

const start = lines.findIndex((l) => l.trim().startsWith('.scene,'));
const end = lines.findIndex((l, i) => i > start && l.trim().startsWith('@media all and (min-width: 400px)'));
const slice = lines.slice(start, end > start ? end : start + 450);

let body = slice.join('\n');
body = body.replace(/url\(\.\.\/\.\.\/images\//g, 'url(/parallax-demo/images/');

const prefix = '#view-login.login-parallax-active .login-parallax-host';

function scopeCss(css) {
  return css
    .replace(/^(\s*)(\.[\w.-][^{]*)\{/gm, (m, sp, sel) => {
      const parts = sel.split(',').map((s) => {
        const t = s.trim();
        if (t.startsWith('@') || t.includes(prefix)) return t;
        return `${prefix} ${t}`;
      });
      return `${sp}${parts.join(',\n' + sp)} {`;
    })
    .replace(/^(\s*)(&[^\{]+)\{/gm, (m, sp, sel) => `${sp}${prefix} ${sel.replace(/^&/, '')} {`);
}

function extractKeyframes(css, names) {
  const blocks = [];
  for (const name of names) {
    const token = `@keyframes ${name}`;
    const startIdx = css.indexOf(token);
    if (startIdx === -1) continue;
    let depth = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
    blocks.push(css.slice(startIdx, endIdx));
  }
  return blocks.join('\n\n');
}

const keyframes = extractKeyframes(raw, ['phase', 'wave', 'lighthouse', 'swing']);

const header = `/**
 * Parallax demo (wagerfield/parallax) — solo login.
 * Assets: /parallax-demo/images/ · fuentes: /vendor/parallax-fonts/
 */

#view-login.login-parallax-active {
  display: block;
  align-items: stretch;
  justify-content: stretch;
  padding: 0;
  overflow: hidden;
  background: #000;
  color: #fff;
  text-align: center;
}

#view-login.login-parallax-active .login-parallax-host {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}

#view-login.login-parallax-active .login-parallax-host .scene {
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
  min-height: 100%;
}

#view-login.login-parallax-active .login-layout {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 1.25rem clamp(1rem, 4vw, 2.75rem);
  background: none;
  pointer-events: none;
}

#view-login.login-parallax-active .login-layout > * {
  pointer-events: auto;
}

#view-login.login-parallax-active .login-parallax-host .title {
  font-family: "Roboto Slab", serif;
  font-weight: 300;
  color: #fff;
  pointer-events: none;
  user-select: none;
}

#view-login.login-parallax-active .login-parallax-host .title em {
  font-style: normal;
  color: #ff755a;
}

#view-login.login-parallax-active .login-parallax-host ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

#view-login.login-parallax-active .login-parallax-host img {
  display: block;
  width: 100%;
}

@media (max-width: 768px) {
  #view-login.login-parallax-active .login-layout {
    align-items: flex-end;
    justify-content: center;
    padding: 1rem 1rem 1.25rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  #view-login.login-parallax-active .login-parallax-host * {
    animation: none !important;
  }
}

`;

const scoped = scopeCss(body);
fs.writeFileSync(outPath, `${header}${scoped}\n\n${keyframes}\n`, 'utf8');
console.log('Wrote', outPath, scoped.length, 'chars');
