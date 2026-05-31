const { createCatalogoRouter } = require('./lib/catalogo-empresa');

module.exports = createCatalogoRouter({
  logName: 'rutas',
  entityLabel: 'Ruta',
  table: 'Rutas',
  orderBy: 'DESRUTA',
  idColumn: 'CODRUTA',
  idType: 'int',
  idRouteParam: 'codruta',
  autoId: true,
  listColumns: ['CODRUTA', 'DESRUTA', 'RUTEO'],
  fields: [
    { name: 'DESRUTA', type: 'varchar', required: true },
    { name: 'RUTEO', type: 'varchar' },
  ],
  insertFields: ['DESRUTA', 'RUTEO'],
  updateFields: ['DESRUTA', 'RUTEO'],
});
