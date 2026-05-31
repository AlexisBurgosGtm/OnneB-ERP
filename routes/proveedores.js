const { createCatalogoRouter } = require('./lib/catalogo-empresa');

module.exports = createCatalogoRouter({
  logName: 'proveedores',
  entityLabel: 'Proveedor',
  table: 'PROVEEDORES',
  orderBy: 'EMPRESA',
  idColumn: 'CODPROV',
  idType: 'int',
  idRouteParam: 'codprov',
  autoId: true,
  listColumns: ['CODPROV', 'NIT', 'EMPRESA', 'RAZONSOCIAL', 'TELEMPRESA', 'CONTACTO'],
  fields: [
    { name: 'EMPRESA', type: 'varchar', required: true },
    { name: 'RAZONSOCIAL', type: 'varchar' },
    { name: 'DIRECCION', type: 'varchar' },
    { name: 'TELEMPRESA', type: 'varchar' },
    { name: 'CONTACTO', type: 'varchar' },
    { name: 'TELCONTACTO', type: 'varchar' },
    { name: 'NIT', type: 'varchar' },
    { name: 'SALDO', type: 'float' },
  ],
  insertFields: ['NIT', 'EMPRESA', 'RAZONSOCIAL', 'DIRECCION', 'TELEMPRESA', 'CONTACTO', 'TELCONTACTO'],
  updateFields: ['NIT', 'EMPRESA', 'RAZONSOCIAL', 'DIRECCION', 'TELEMPRESA', 'CONTACTO', 'TELCONTACTO'],
});
