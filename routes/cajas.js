const { createCatalogoRouter } = require('./lib/catalogo-empresa');

module.exports = createCatalogoRouter({
  logName: 'cajas',
  entityLabel: 'Caja',
  table: 'Cajas',
  orderBy: 'DESCAJA',
  idColumn: 'CODCAJA',
  idType: 'int',
  idRouteParam: 'codcaja',
  autoId: true,
  listColumns: ['CODCAJA', 'DESCAJA'],
  fields: [{ name: 'DESCAJA', type: 'varchar', required: true }],
  insertFields: ['DESCAJA'],
  updateFields: ['DESCAJA'],
});
