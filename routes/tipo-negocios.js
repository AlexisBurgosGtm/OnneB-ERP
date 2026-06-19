const { createCatalogoRouter } = require('./lib/catalogo-empresa');

module.exports = createCatalogoRouter({
  logName: 'tipo-negocios',
  entityLabel: 'Tipo de negocio',
  table: 'TIPONEGOCIOS',
  orderBy: 'TIPONEGOCIO',
  idColumn: 'TIPONEGOCIO',
  idType: 'varchar',
  idRouteParam: 'tiponegocio',
  autoId: false,
  listColumns: ['TIPONEGOCIO'],
  fields: [{ name: 'TIPONEGOCIO', type: 'varchar', required: true }],
  insertFields: ['TIPONEGOCIO'],
  updateFields: ['TIPONEGOCIO'],
});
