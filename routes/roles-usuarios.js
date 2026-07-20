const express = require('express');
const {
  ALL_MENUS,
  MENU_LABELS,
  loadTiposEmpleado,
  loadMenuAccesoMap,
  setAccesoForTipo,
  menuGroupsPayload,
} = require('../lib/roles-usuarios');

const router = express.Router();

router.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const tipos = loadTiposEmpleado();
    const acceso = loadMenuAccesoMap();
    const accesoOut = {};
    for (const [cod, val] of Object.entries(acceso)) {
      accesoOut[String(cod)] = val;
    }
    res.json({
      tipos,
      menus: ALL_MENUS.map((key) => ({ key, label: MENU_LABELS[key] || key })),
      groups: menuGroupsPayload(),
      acceso: accesoOut,
    });
  } catch (err) {
    console.warn('[API GET /roles-usuarios]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/acceso', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const acceso = loadMenuAccesoMap();
    const accesoOut = {};
    for (const [cod, val] of Object.entries(acceso)) {
      accesoOut[String(cod)] = val;
    }
    res.json({ acceso: accesoOut });
  } catch (err) {
    console.warn('[API GET /roles-usuarios/acceso]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:codtipo', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const codtipo = parseInt(req.params.codtipo, 10);
  if (!Number.isFinite(codtipo) || codtipo <= 0) {
    return res.status(400).json({ error: 'Tipo de empleado inválido' });
  }
  try {
    const tipos = loadTiposEmpleado();
    if (!tipos.some((t) => Number(t.value) === codtipo)) {
      return res.status(404).json({ error: 'Tipo de empleado no encontrado' });
    }
    const fullAccess = Boolean(req.body?.fullAccess ?? req.body?.accesoTotal);
    const menus = req.body?.menus ?? req.body?.MENUS;
    const map = fullAccess || menus === null
      ? setAccesoForTipo(codtipo, null)
      : setAccesoForTipo(codtipo, menus);
    res.json({
      ok: true,
      codtipo,
      menus: map[codtipo],
    });
  } catch (err) {
    console.warn('[API PUT /roles-usuarios/:codtipo]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
