const FabricantesView = createCatalogoEmpresaView({
  slug: 'fabricantes',
  apiPath: '/api/fabricantes',
  icon: 'fa-industry',
  labelSingular: 'fabricante',
  labelPlural: 'fabricante(s)',
  idKey: 'CODCLAUNO',
  dataAttr: 'codclauno',
  searchPlaceholder: 'Buscar por código o descripción…',
  searchKeys: ['CODCLAUNO', 'DESCLAUNO'],
  formFields: [
    { key: 'CODCLAUNO', label: 'Código', type: 'number', readonlyOnEdit: true, hideOnNew: true },
    { key: 'DESCLAUNO', label: 'Descripción', required: true },
  ],
  createKeys: ['DESCLAUNO'],
  updateKeys: ['DESCLAUNO'],
  tableColumns: [
    { key: 'CODCLAUNO', label: 'Código', type: 'number' },
    { key: 'DESCLAUNO', label: 'Descripción' },
  ],
  validateForm(data) {
    if (!data.DESCLAUNO) return 'La descripción es obligatoria';
    return null;
  },
  getRowLabel(row) {
    return row?.DESCLAUNO || '';
  },
});
