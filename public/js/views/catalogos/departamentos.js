const DepartamentosView = createCatalogoEmpresaView({
  slug: 'departamentos',
  apiPath: '/api/departamentos',
  requireEmpresa: false,
  icon: 'fa-map',
  labelSingular: 'departamento',
  labelPlural: 'departamento(s)',
  idKey: 'CODDEPARTAMENTO',
  dataAttr: 'coddepartamento',
  searchPlaceholder: 'Buscar por código o descripción…',
  searchKeys: ['CODDEPARTAMENTO', 'DESDEPARTAMENTO'],
  formFields: [
    { key: 'CODDEPARTAMENTO', label: 'Código', type: 'number', readonlyOnEdit: true, hideOnNew: true },
    { key: 'DESDEPARTAMENTO', label: 'Descripción', required: true },
  ],
  createKeys: ['DESDEPARTAMENTO'],
  updateKeys: ['DESDEPARTAMENTO'],
  tableColumns: [
    { key: 'CODDEPARTAMENTO', label: 'Código', type: 'number' },
    { key: 'DESDEPARTAMENTO', label: 'Descripción' },
  ],
  validateForm(data) {
    if (!data.DESDEPARTAMENTO) return 'La descripción es obligatoria';
    return null;
  },
  getRowLabel(row) {
    return row?.DESDEPARTAMENTO || '';
  },
});
