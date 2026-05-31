const { createCatalogoRouter } = require('./lib/catalogo-empresa');

module.exports = createCatalogoRouter({
  logName: 'ubicaciones',
  entityLabel: 'Ubicación',
  table: 'CLASIFICACIONTRES',
  orderBy: 'DESCLATRES',
  idColumn: 'CODCLATRES',
  idType: 'int',
  idRouteParam: 'codclatres',
  autoId: true,
  listColumns: ['CODCLATRES', 'DESCLATRES'],
  fields: [{ name: 'DESCLATRES', type: 'varchar', required: true }],
  insertFields: ['DESCLATRES'],
  updateFields: ['DESCLATRES'],
});
