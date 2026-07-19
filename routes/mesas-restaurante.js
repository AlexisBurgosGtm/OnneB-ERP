const { createCatalogoRouter } = require('./lib/catalogo-empresa');

module.exports = createCatalogoRouter({
  logName: 'mesas-restaurante',
  entityLabel: 'Mesa',
  table: 'RESTAURANTE_MESAS',
  orderBy: 'CODMESA, DESMESA',
  idColumn: 'ID',
  idType: 'int',
  idRouteParam: 'id',
  identityColumn: true,
  listColumns: ['ID', 'CODMESA', 'DESMESA', 'OCUPADA'],
  fields: [
    { name: 'CODMESA', type: 'varchar', required: true },
    { name: 'DESMESA', type: 'varchar', required: true },
    { name: 'OCUPADA', type: 'varchar' },
  ],
  insertFields: ['CODMESA', 'DESMESA', 'OCUPADA'],
  updateFields: ['CODMESA', 'DESMESA', 'OCUPADA'],
  async validateInsert(_pool, _empnit, data) {
    const ocupada = String(data.OCUPADA || 'NO').trim().toUpperCase();
    data.OCUPADA = ocupada === 'SI' ? 'SI' : 'NO';
    if (!String(data.CODMESA || '').trim()) return 'CODMESA es obligatorio';
    if (!String(data.DESMESA || '').trim()) return 'DESMESA es obligatorio';
    return null;
  },
  async validateUpdate(_pool, _empnit, data) {
    if (data.OCUPADA !== undefined && data.OCUPADA !== null) {
      const ocupada = String(data.OCUPADA || 'NO').trim().toUpperCase();
      data.OCUPADA = ocupada === 'SI' ? 'SI' : 'NO';
    }
    if (!String(data.CODMESA || '').trim()) return 'CODMESA es obligatorio';
    if (!String(data.DESMESA || '').trim()) return 'DESMESA es obligatorio';
    return null;
  },
});
