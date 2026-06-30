const { createCatalogoRouter } = require('./lib/catalogo-empresa');
const { plataformaTieneMovimientos } = require('../lib/vehiculos-movimientos');

module.exports = createCatalogoRouter({
  logName: 'plataformas',
  entityLabel: 'Plataforma',
  table: 'VEHICULOS_PLATAFORMAS',
  orderBy: 'PLATAFORMA',
  idColumn: 'CODPLATAFORMA',
  idType: 'int',
  idRouteParam: 'codplataforma',
  identityColumn: true,
  listColumns: ['CODPLATAFORMA', 'NOPLACA', 'PLATAFORMA'],
  fields: [
    { name: 'NOPLACA', type: 'varchar' },
    { name: 'PLATAFORMA', type: 'varchar', required: true },
  ],
  insertFields: ['NOPLACA', 'PLATAFORMA'],
  updateFields: ['NOPLACA', 'PLATAFORMA'],
  validateDelete: async (pool, empnit, codplataforma) => {
    if (await plataformaTieneMovimientos(pool, empnit, codplataforma)) {
      return 'No se puede eliminar: la plataforma tiene registros de kilometraje';
    }
    return null;
  },
});
