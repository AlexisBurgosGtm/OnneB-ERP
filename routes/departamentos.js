const { createCatalogoRouter } = require('./lib/catalogo-empresa');

module.exports = createCatalogoRouter({
  logName: 'departamentos',
  entityLabel: 'Departamento',
  table: 'DEPARTAMENTOS',
  orderBy: 'DESDEPARTAMENTO',
  idColumn: 'CODDEPARTAMENTO',
  idType: 'int',
  idRouteParam: 'coddepartamento',
  scopedByEmpresa: false,
  autoId: true,
  listColumns: ['CODDEPARTAMENTO', 'DESDEPARTAMENTO'],
  fields: [{ name: 'DESDEPARTAMENTO', type: 'varchar', required: true }],
  insertFields: ['DESDEPARTAMENTO'],
  updateFields: ['DESDEPARTAMENTO'],
});
