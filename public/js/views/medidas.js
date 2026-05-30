const MedidasView = createCatalogoEmpresaView({
  slug: 'medidas',
  apiPath: '/api/medidas',
  icon: 'fa-ruler-combined',
  labelSingular: 'medida',
  labelPlural: 'medida(s)',
  idKey: 'CODMEDIDA',
  dataAttr: 'codmedida',
  searchPlaceholder: 'Buscar por código o tipo de precio…',
  searchKeys: ['CODMEDIDA', 'TIPOPRECIO'],
  formFields: [
    { key: 'CODMEDIDA', label: 'Código medida', required: true, readonlyOnEdit: true },
    { key: 'TIPOPRECIO', label: 'Tipo precio', required: true },
  ],
  createKeys: ['CODMEDIDA', 'TIPOPRECIO'],
  updateKeys: ['TIPOPRECIO'],
  tableColumns: [
    { key: 'CODMEDIDA', label: 'Código' },
    { key: 'TIPOPRECIO', label: 'Tipo precio' },
  ],
  validateForm(data, isEdit) {
    if (!isEdit && !data.CODMEDIDA) return 'El código es obligatorio';
    if (!data.TIPOPRECIO) return 'El tipo de precio es obligatorio';
    return null;
  },
  getRowLabel(row) {
    return row?.CODMEDIDA ? `${row.CODMEDIDA} — ${row.TIPOPRECIO || ''}` : '';
  },
});
