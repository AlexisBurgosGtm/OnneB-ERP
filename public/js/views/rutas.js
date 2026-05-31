const RutasView = createCatalogoEmpresaView({
  slug: 'rutas',
  apiPath: '/api/rutas',
  icon: 'fa-route',
  labelSingular: 'ruta',
  labelPlural: 'ruta(s)',
  idKey: 'CODRUTA',
  dataAttr: 'codruta',
  searchPlaceholder: 'Buscar por código, descripción o ruteo…',
  searchKeys: ['CODRUTA', 'DESRUTA', 'RUTEO'],
  formFields: [
    { key: 'CODRUTA', label: 'Código', type: 'number', readonlyOnEdit: true, hideOnNew: true },
    { key: 'DESRUTA', label: 'Descripción', required: true },
    { key: 'RUTEO', label: 'Ruteo' },
  ],
  createKeys: ['DESRUTA', 'RUTEO'],
  updateKeys: ['DESRUTA', 'RUTEO'],
  mapFormToApi(data) {
    return {
      DESRUTA: data.DESRUTA,
      RUTEO: data.RUTEO || null,
    };
  },
  tableColumns: [
    { key: 'CODRUTA', label: 'Código', type: 'number' },
    { key: 'DESRUTA', label: 'Descripción' },
    { key: 'RUTEO', label: 'Ruteo' },
  ],
  validateForm(data) {
    if (!data.DESRUTA) return 'La descripción es obligatoria';
    return null;
  },
  getRowLabel(row) {
    return row?.DESRUTA || '';
  },
});
