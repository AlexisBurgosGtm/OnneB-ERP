const express = require('express');
const sql = require('mssql');
const { createCatalogoRouter } = require('./lib/catalogo-empresa');
const { isDbConfigured } = require('../config/database');

const router = createCatalogoRouter({
  logName: 'empleados',
  entityLabel: 'Empleado',
  table: 'Empleados',
  orderBy: 'NOMEMPLEADO',
  idColumn: 'CODEMPLEADO',
  idType: 'int',
  idRouteParam: 'codempleado',
  autoId: true,
  listColumns: [
    'CODEMPLEADO',
    'NOMEMPLEADO',
    'CODTIPOEMPLEADO',
    'DPI',
    'IGSS',
    'DIRECCION',
    'CODMUNICIPIO',
    'CODDEPTO',
    'TELEFONOS',
    'WHATSAPP',
    'EMAIL',
    'ACTIVO',
    'CLAVE',
    'LATITUD',
    'LONGITUD',
    'CODRUTA',
    'CODCATALOGO',
    'CODDOC_REC',
  ],
  fields: [
    { name: 'NOMEMPLEADO', type: 'varchar', required: true },
    { name: 'CODTIPOEMPLEADO', type: 'int' },
    { name: 'DPI', type: 'varchar' },
    { name: 'IGSS', type: 'varchar' },
    { name: 'DIRECCION', type: 'varchar' },
    { name: 'CODMUNICIPIO', type: 'int' },
    { name: 'CODDEPTO', type: 'int' },
    { name: 'TELEFONOS', type: 'varchar' },
    { name: 'WHATSAPP', type: 'varchar' },
    { name: 'EMAIL', type: 'varchar' },
    { name: 'ACTIVO', type: 'varchar' },
    { name: 'CLAVE', type: 'varchar' },
    { name: 'LATITUD', type: 'varchar' },
    { name: 'LONGITUD', type: 'varchar' },
    { name: 'CODRUTA', type: 'int' },
    { name: 'CODCATALOGO', type: 'varchar' },
    { name: 'CODDOC_REC', type: 'varchar' },
  ],
  insertFields: [
    'NOMEMPLEADO',
    'CODTIPOEMPLEADO',
    'DPI',
    'IGSS',
    'DIRECCION',
    'CODMUNICIPIO',
    'CODDEPTO',
    'TELEFONOS',
    'WHATSAPP',
    'EMAIL',
    'ACTIVO',
    'CLAVE',
    'LATITUD',
    'LONGITUD',
    'CODRUTA',
    'CODCATALOGO',
    'CODDOC_REC',
  ],
  updateFields: [
    'NOMEMPLEADO',
    'CODTIPOEMPLEADO',
    'DPI',
    'IGSS',
    'DIRECCION',
    'CODMUNICIPIO',
    'CODDEPTO',
    'TELEFONOS',
    'WHATSAPP',
    'EMAIL',
    'CLAVE',
    'LATITUD',
    'LONGITUD',
    'CODRUTA',
    'CODCATALOGO',
    'CODDOC_REC',
  ],
});

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.headers['x-emp-nit'] || '').trim();
}

router.patch('/:codempleado/activo', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    return res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
  }
  const id = parseInt(req.params.codempleado, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'CODEMPLEADO inválido' });
  }
  const raw = String(req.body?.ACTIVO ?? req.body?.activo ?? '')
    .trim()
    .toUpperCase();
  if (raw !== 'SI' && raw !== 'NO') {
    return res.status(400).json({ error: 'ACTIVO debe ser SI o NO' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODEMPLEADO', sql.Int, id)
      .input('ACTIVO', sql.VarChar, raw)
      .query(`
        UPDATE dbo.Empleados SET ACTIVO = @ACTIVO
        WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }
    res.json({ ok: true, CODEMPLEADO: id, ACTIVO: raw });
  } catch (err) {
    console.warn('[API PATCH /empleados/:codempleado/activo]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
