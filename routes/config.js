const express = require('express');
const { isDbConfigured } = require('../config/database');
const {
  SETTING_OPCION,
  normalizeOpcion,
  normalizeSino,
  normalizeConcre,
  getSettingValue,
  getSettingSino,
  getSettingConcre,
  getSettingFormatoImpresion,
  getSettingGuardadoFotos,
  getSettingMuestraFormatoFelOnline,
  getSettingTipofacFinalizado,
  setSettingValue,
  verifySettingPass,
  ensureSettingDefault,
  normalizeFormatoImpresion,
  normalizeGuardadoFotos,
  normalizeMuestraFormatoFelOnline,
  normalizeTipofacFinalizado,
} = require('../lib/settings');

const router = express.Router();

function requireOpcion(req, res) {
  const opcion = normalizeOpcion(req.query.opcion ?? req.body?.opcion);
  if (!opcion) {
    res.status(400).json({ error: 'Parámetro opcion requerido' });
    return null;
  }
  return opcion;
}

router.post('/verify-pass', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = normalizeOpcion(req.body?.opcion) || SETTING_OPCION.CLAVE_ADMIN;
  const pass = String(req.body?.pass ?? req.body?.PASS ?? '');
  try {
    const pool = await req.app.locals.getDbPool();
    const ok = await verifySettingPass(pool, pass, opcion);
    if (!ok) {
      return res.status(401).json({ ok: false, error: 'Clave incorrecta' });
    }
    res.json({ ok: true, opcion });
  } catch (err) {
    console.warn('[API POST /config/verify-pass]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/pass', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSettingDefault(pool, opcion);
    const pass = (await getSettingValue(pool, opcion)) ?? '';
    res.json({ opcion, pass });
  } catch (err) {
    console.warn('[API GET /config/pass]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/pass', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  const pass = req.body?.pass;
  if (pass === undefined || pass === null) {
    return res.status(400).json({ error: 'El valor pass es obligatorio' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    await setSettingValue(pool, opcion, String(pass));
    res.json({ ok: true, opcion });
  } catch (err) {
    console.warn('[API PUT /config/pass]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/sino', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSettingDefault(pool, opcion);
    const sino = await getSettingSino(pool, opcion);
    res.json({ opcion, sino });
  } catch (err) {
    console.warn('[API GET /config/sino]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/sino', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  const raw = normalizeSino(req.body?.sino);
  if (raw !== 'SI' && raw !== 'NO') {
    return res.status(400).json({ error: 'El valor debe ser SI o NO' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSettingDefault(pool, opcion);
    await setSettingValue(pool, opcion, raw);
    res.json({ ok: true, opcion, sino: raw });
  } catch (err) {
    console.warn('[API PUT /config/sino]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/concre', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const concre = await getSettingConcre(pool, opcion);
    res.json({ opcion, concre });
  } catch (err) {
    console.warn('[API GET /config/concre]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/concre', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  const concre = normalizeConcre(req.body?.concre);
  if (concre !== 'CON' && concre !== 'CRE') {
    return res.status(400).json({ error: 'El valor debe ser CON o CRE' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    await setSettingValue(pool, opcion, concre);
    res.json({ ok: true, opcion, concre });
  } catch (err) {
    console.warn('[API PUT /config/concre]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/formato-impresion', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const formato = await getSettingFormatoImpresion(pool, opcion);
    res.json({ opcion, formato });
  } catch (err) {
    console.warn('[API GET /config/formato-impresion]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/formato-impresion', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  const formato = normalizeFormatoImpresion(req.body?.formato);
  if (formato !== 'CARTA' && formato !== 'TICKET') {
    return res.status(400).json({ error: 'El valor debe ser CARTA o TICKET' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    await setSettingValue(pool, opcion, formato);
    res.json({ ok: true, opcion, formato });
  } catch (err) {
    console.warn('[API PUT /config/formato-impresion]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/guardado-fotos', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const modo = await getSettingGuardadoFotos(pool, opcion);
    res.json({ opcion, modo });
  } catch (err) {
    console.warn('[API GET /config/guardado-fotos]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/guardado-fotos', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  const modo = normalizeGuardadoFotos(req.body?.modo ?? req.body?.valor ?? req.body?.formato);
  if (modo !== 'LOCAL' && modo !== 'HOST') {
    return res.status(400).json({ error: 'El valor debe ser LOCAL o HOST' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    await setSettingValue(pool, opcion, modo);
    res.json({ ok: true, opcion, modo });
  } catch (err) {
    console.warn('[API PUT /config/guardado-fotos]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/muestra-formato-fel', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const modo = await getSettingMuestraFormatoFelOnline(pool, opcion);
    res.json({ opcion, modo });
  } catch (err) {
    console.warn('[API GET /config/muestra-formato-fel]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/muestra-formato-fel', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  const modo = normalizeMuestraFormatoFelOnline(req.body?.modo ?? req.body?.valor ?? req.body?.formato);
  if (modo !== 'NO' && modo !== 'SI' && modo !== 'AMBOS') {
    return res.status(400).json({ error: 'El valor debe ser NO, SI o AMBOS' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSettingDefault(pool, opcion);
    await setSettingValue(pool, opcion, modo);
    res.json({ ok: true, opcion, modo });
  } catch (err) {
    console.warn('[API PUT /config/muestra-formato-fel]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/tipofac-finalizado', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const tipofac = await getSettingTipofacFinalizado(pool, opcion);
    res.json({ opcion, tipofac });
  } catch (err) {
    console.warn('[API GET /config/tipofac-finalizado]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/tipofac-finalizado', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const opcion = requireOpcion(req, res);
  if (!opcion) return;
  const tipofac = normalizeTipofacFinalizado(req.body?.tipofac ?? req.body?.valor ?? req.body?.TIPOFAC);
  if (tipofac !== 'FEF' && tipofac !== 'FAC' && tipofac !== 'FEC') {
    return res.status(400).json({ error: 'El valor debe ser FEF, FAC o FEC' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSettingDefault(pool, opcion);
    await setSettingValue(pool, opcion, tipofac);
    res.json({ ok: true, opcion, tipofac });
  } catch (err) {
    console.warn('[API PUT /config/tipofac-finalizado]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/** Compatibilidad: POST /config/:id/verify-pass (id=2 → CLAVE ADMIN). */
router.post('/:id/verify-pass', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const pass = String(req.body?.pass ?? req.body?.PASS ?? '');
  try {
    const pool = await req.app.locals.getDbPool();
    const ok = await verifySettingPass(pool, pass, SETTING_OPCION.CLAVE_ADMIN);
    if (!ok) {
      return res.status(401).json({ ok: false, error: 'Clave incorrecta' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.warn('[API POST /config/:id/verify-pass]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = {
  router,
  SETTING_OPCION,
  ADMIN_CONFIG_ID: 2,
  OPERATOR_CONFIG_ID: 4,
  INVENTARIO_NEGATIVO_CONFIG_ID: 3,
  TICKET_VENTA_CONFIG_ID: 11,
  CLAVE_VENDEDOR_CONFIG_ID: 17,
  COBRO_PREDETERMINADO_CONFIG_ID: 15,
};
