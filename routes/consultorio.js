const express = require('express');
const { createCatalogoRouter } = require('./lib/catalogo-empresa');

const SINO_FIELDS = [
  'HIPERTENSION',
  'HIPOTENSION',
  'DIABETES',
  'INSUFICIENCIA_RENAL',
  'CARDIOPATIAS',
  'TAQUICARDIAS',
  'HIGADOGRASO',
  'HISTERECTOMIA',
  'COLESISTECTOMIA',
  'ALERGIAS',
];

function normalizeSino(value) {
  return String(value ?? 'NO').trim().toUpperCase() === 'SI' ? 'SI' : 'NO';
}

function applySinoDefaults(data) {
  for (const key of SINO_FIELDS) {
    data[key] = normalizeSino(data[key]);
  }
}

const pacientesRouter = createCatalogoRouter({
  logName: 'consultorio/pacientes',
  entityLabel: 'Paciente',
  table: 'CONSULTORIO_PACIENTES',
  orderBy: 'NOMBRE',
  idColumn: 'CODPACIENTE',
  idType: 'int',
  idRouteParam: 'codpaciente',
  autoId: true,
  listColumns: [
    'CODPACIENTE',
    'NOMBRE',
    'DIRECCION',
    'TELEFONOS',
    'EMAIL',
    'FECHA_NACIMIENTO',
    'NOTAS',
    ...SINO_FIELDS,
  ],
  fields: [
    { name: 'NOMBRE', type: 'varchar', required: true },
    { name: 'DIRECCION', type: 'varchar' },
    { name: 'TELEFONOS', type: 'varchar' },
    { name: 'EMAIL', type: 'varchar' },
    { name: 'FECHA_NACIMIENTO', type: 'date' },
    { name: 'NOTAS', type: 'varcharmax' },
    ...SINO_FIELDS.map((name) => ({ name, type: 'varchar' })),
  ],
  insertFields: ['NOMBRE', 'DIRECCION', 'TELEFONOS', 'EMAIL', 'FECHA_NACIMIENTO', 'NOTAS', ...SINO_FIELDS],
  updateFields: ['NOMBRE', 'DIRECCION', 'TELEFONOS', 'EMAIL', 'FECHA_NACIMIENTO', 'NOTAS', ...SINO_FIELDS],
  validateInsert: async (_pool, _empnit, data) => {
    applySinoDefaults(data);
    return null;
  },
  validateUpdate: async (_pool, _empnit, data) => {
    applySinoDefaults(data);
    return null;
  },
});

const {
  handleListConsultas,
  handleCreateConsulta,
  handleUpdateConsulta,
  handleDeleteConsulta,
  handleBuscarPacientes,
  handleHistorialPaciente,
  handleGetConsultaDetalle,
  handleGetConsultaReceta,
  handleRecetaProductos,
} = require('../lib/consultorio-consultas-handlers');

const router = express.Router();
router.get('/consultas/historial-paciente', handleHistorialPaciente);
router.get('/consultas/:codconsulta/detalle', handleGetConsultaDetalle);
router.get('/consultas/:codconsulta/receta', handleGetConsultaReceta);
router.get('/consultas', handleListConsultas);
router.post('/consultas', handleCreateConsulta);
router.put('/consultas/:codconsulta', handleUpdateConsulta);
router.delete('/consultas/:codconsulta', handleDeleteConsulta);
router.get('/recetas/productos', handleRecetaProductos);
router.get('/pacientes/buscar', handleBuscarPacientes);
router.use('/pacientes', pacientesRouter);

module.exports = router;