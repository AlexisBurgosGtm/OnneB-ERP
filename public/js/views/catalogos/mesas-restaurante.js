/**
 * Vista Mesas Restaurante — CRUD sobre dbo.RESTAURANTE_MESAS (sin CUENTA/SECTOR).
 */
const MesasRestauranteView = createCatalogoEmpresaView({
  slug: 'mesas-restaurante',
  apiPath: '/api/mesas-restaurante',
  icon: 'fa-utensils',
  viewTitle: 'Mesas Restaurante',
  labelSingular: 'mesa',
  labelPlural: 'mesas',
  idKey: 'ID',
  dataAttr: 'id',
  panelClass: 'marcas-panel',
  searchPlaceholder: 'Buscar por código o descripción…',
  searchKeys: ['ID', 'CODMESA', 'DESMESA', 'OCUPADA'],
  formFields: [
    { key: 'ID', label: 'ID', type: 'number', readonlyOnEdit: true, hideOnNew: true },
    { key: 'CODMESA', label: 'Código mesa', required: true, type: 'text' },
    { key: 'DESMESA', label: 'Descripción', required: true, type: 'text' },
    {
      key: 'OCUPADA',
      label: 'Ocupada',
      type: 'select',
      options: [
        { value: 'NO', label: 'NO' },
        { value: 'SI', label: 'SI' },
      ],
    },
  ],
  createKeys: ['CODMESA', 'DESMESA', 'OCUPADA'],
  updateKeys: ['CODMESA', 'DESMESA', 'OCUPADA'],
  tableColumns: [
    { key: 'ID', label: 'ID', type: 'number' },
    { key: 'CODMESA', label: 'Código' },
    { key: 'DESMESA', label: 'Descripción' },
    { key: 'OCUPADA', label: 'Ocupada' },
  ],
  validateForm(data) {
    if (!String(data.CODMESA || '').trim()) return 'El código de mesa es obligatorio';
    if (!String(data.DESMESA || '').trim()) return 'La descripción es obligatoria';
    return null;
  },
  mapFormToApi(data) {
    const ocupada = String(data.OCUPADA || 'NO').trim().toUpperCase();
    return {
      CODMESA: String(data.CODMESA || '').trim(),
      DESMESA: String(data.DESMESA || '').trim(),
      OCUPADA: ocupada === 'SI' ? 'SI' : 'NO',
    };
  },
  getRowLabel(row) {
    return row?.DESMESA || row?.CODMESA || '';
  },
});
