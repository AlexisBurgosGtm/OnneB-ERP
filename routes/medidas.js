const { createCatalogoRouter } = require('./lib/catalogo-empresa');

module.exports = createCatalogoRouter({
  logName: 'medidas',
  entityLabel: 'Medida',
  table: 'Medidas',
  orderBy: 'CODMEDIDA',
  idColumn: 'CODMEDIDA',
  idType: 'varchar',
  idRouteParam: 'codmedida',
  autoId: false,
  listColumns: ['CODMEDIDA', 'TIPOPRECIO'],
  fields: [
    { name: 'CODMEDIDA', type: 'varchar', required: true },
    { name: 'TIPOPRECIO', type: 'varchar', required: true },
  ],
  insertFields: ['CODMEDIDA', 'TIPOPRECIO'],
  updateFields: ['TIPOPRECIO'],
});
