const MunicipiosView = createCatalogoEmpresaView({
  slug: 'municipios',
  apiPath: '/api/municipios',
  requireEmpresa: false,
  icon: 'fa-city',
  labelSingular: 'municipio',
  labelPlural: 'municipio(s)',
  idKey: 'CODMUNICIPIO',
  dataAttr: 'codmunicipio',
  searchPlaceholder: 'Buscar por código o descripción…',
  searchKeys: ['CODMUNICIPIO', 'DESMUNICIPIO'],
  formFields: [
    { key: 'CODMUNICIPIO', label: 'Código', type: 'number', readonlyOnEdit: true, hideOnNew: true },
    { key: 'DESMUNICIPIO', label: 'Descripción', required: true },
  ],
  createKeys: ['DESMUNICIPIO'],
  updateKeys: ['DESMUNICIPIO'],
  tableColumns: [
    { key: 'CODMUNICIPIO', label: 'Código', type: 'number' },
    { key: 'DESMUNICIPIO', label: 'Descripción' },
  ],
  validateForm(data) {
    if (!data.DESMUNICIPIO) return 'La descripción es obligatoria';
    return null;
  },
  getRowLabel(row) {
    return row?.DESMUNICIPIO || '';
  },
});
