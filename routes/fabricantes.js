const { createCatalogoRouter } = require('./lib/catalogo-empresa');

module.exports = createCatalogoRouter({
  logName: 'fabricantes',
  entityLabel: 'Fabricante',
  table: 'CLASIFICACIONUNO',
  orderBy: 'DESCLAUNO',
  idColumn: 'CODCLAUNO',
  idType: 'int',
  idRouteParam: 'codclauno',
  autoId: true,
  listColumns: ['CODCLAUNO', 'DESCLAUNO'],
  fields: [{ name: 'DESCLAUNO', type: 'varchar', required: true }],
  insertFields: ['DESCLAUNO'],
  updateFields: ['DESCLAUNO'],
});
