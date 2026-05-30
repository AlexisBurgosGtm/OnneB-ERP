const { createCatalogoRouter } = require('./lib/catalogo-empresa');

module.exports = createCatalogoRouter({
  logName: 'municipios',
  entityLabel: 'Municipio',
  table: 'MUNICIPIOS',
  orderBy: 'DESMUNICIPIO',
  idColumn: 'CODMUNICIPIO',
  idType: 'int',
  idRouteParam: 'codmunicipio',
  scopedByEmpresa: false,
  autoId: true,
  listColumns: ['CODMUNICIPIO', 'DESMUNICIPIO'],
  fields: [{ name: 'DESMUNICIPIO', type: 'varchar', required: true }],
  insertFields: ['DESMUNICIPIO'],
  updateFields: ['DESMUNICIPIO'],
});
