const RutasView = createCatalogoEmpresaView({
  slug: 'rutas',
  apiPath: '/api/rutas',
  icon: 'fa-route',
  labelSingular: 'ruta',
  labelPlural: 'ruta(s)',
  idKey: 'CODRUTA',
  dataAttr: 'codruta',
  searchPlaceholder: 'Buscar por código, descripción o ruteo…',
  searchKeys: ['CODRUTA', 'DESRUTA', 'RUTEO', 'CODEMPLEADO'],
  formFields: [
    { key: 'CODRUTA', label: 'Código', type: 'number', readonlyOnEdit: true, hideOnNew: true },
    { key: 'DESRUTA', label: 'Descripción', required: true },
    { key: 'RUTEO', label: 'Ruteo' },
    { key: 'CODEMPLEADO', label: 'Cód. empleado', type: 'number' },
  ],
  createKeys: ['DESRUTA', 'RUTEO', 'CODEMPLEADO'],
  updateKeys: ['DESRUTA', 'RUTEO', 'CODEMPLEADO'],
  mapFormToApi(data, isEdit) {
    const payload = {
      DESRUTA: data.DESRUTA,
      RUTEO: data.RUTEO || null,
      CODEMPLEADO: data.CODEMPLEADO === '' ? null : Number(data.CODEMPLEADO),
    };
    if (Number.isNaN(payload.CODEMPLEADO)) payload.CODEMPLEADO = null;
    return payload;
  },
  tableColumns: [
    { key: 'CODRUTA', label: 'Código', type: 'number' },
    { key: 'DESRUTA', label: 'Descripción' },
    { key: 'RUTEO', label: 'Ruteo' },
    { key: 'CODEMPLEADO', label: 'Empleado', type: 'number' },
  ],
  validateForm(data) {
    if (!data.DESRUTA) return 'La descripción es obligatoria';
    return null;
  },
  getRowLabel(row) {
    return row?.DESRUTA || '';
  },
});
