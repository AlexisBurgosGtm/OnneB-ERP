const { createCatalogoRouter } = require('./lib/catalogo-empresa');

module.exports = createCatalogoRouter({
  logName: 'bancos',
  entityLabel: 'Banco',
  table: 'BANCOS',
  orderBy: 'DESBANCO',
  idColumn: 'CODBANCO',
  idType: 'int',
  idRouteParam: 'codbanco',
  scopedByEmpresa: false,
  identityColumn: true,
  listColumns: ['CODBANCO', 'DESBANCO'],
  fields: [{ name: 'DESBANCO', type: 'varchar', required: true }],
  insertFields: ['DESBANCO'],
  updateFields: ['DESBANCO'],
});
