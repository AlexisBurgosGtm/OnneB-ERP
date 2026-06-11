/**
 * Genera iconos PWA, favicons y apple-touch desde logo.png (fondo transparente).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'logo.png');
const OUT_DIR = path.join(ROOT, 'public', 'icons');
const PUBLIC_LOGO = path.join(ROOT, 'public', 'logo.png');

/** Tamaños estándar PWA + favicons */
const ICON_SIZES = [16, 32, 72, 96, 128, 144, 152, 180, 192, 384, 512];
const MASKABLE_SIZES = [192, 512];
const MASKABLE_SCALE = 0.82;

/** Píxeles casi negros → transparentes (elimina bandas del fondo del PNG). */
const BLACK_THRESHOLD = 32;

let preparedLogo = null;

async function ensureSource() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`No se encontró logo.png en ${SOURCE}`);
  }
}

async function prepareLogoBuffer() {
  if (preparedLogo) return preparedLogo;

  const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
      data[i + 3] = 0;
    }
  }

  preparedLogo = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 1 })
    .png()
    .toBuffer();

  return preparedLogo;
}

async function writeSquareIcon(logoBuf, size, outFile, { maskable = false } = {}) {
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

  if (maskable) {
    const inner = Math.round(size * MASKABLE_SCALE);
    const scaled = await sharp(logoBuf)
      .resize(inner, inner, { fit: 'contain', background: transparent })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: transparent,
      },
    })
      .composite([{ input: scaled, gravity: 'centre' }])
      .png()
      .toFile(outFile);
    return;
  }

  await sharp(logoBuf)
    .resize(size, size, { fit: 'contain', background: transparent })
    .png()
    .toFile(outFile);
}

async function main() {
  await ensureSource();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const logoBuf = await prepareLogoBuffer();
  await sharp(logoBuf).png().toFile(PUBLIC_LOGO);

  for (const size of ICON_SIZES) {
    const file = path.join(OUT_DIR, `icon-${size}.png`);
    await writeSquareIcon(logoBuf, size, file);
    console.log(`Icono: ${file}`);
  }

  await writeSquareIcon(logoBuf, 16, path.join(OUT_DIR, 'favicon-16.png'));
  await writeSquareIcon(logoBuf, 32, path.join(OUT_DIR, 'favicon-32.png'));
  await writeSquareIcon(logoBuf, 180, path.join(OUT_DIR, 'apple-touch-icon.png'));
  console.log('Favicons: favicon-16.png, favicon-32.png, apple-touch-icon.png');

  for (const size of MASKABLE_SIZES) {
    const file = path.join(OUT_DIR, `icon-${size}-maskable.png`);
    await writeSquareIcon(logoBuf, size, file, { maskable: true });
    console.log(`Maskable: ${file}`);
  }

  console.log('Listo — iconos con fondo transparente');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
