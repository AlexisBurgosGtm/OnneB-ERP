/**
 * Vista Ubicaciones — CRUD sobre dbo.CLASIFICACIONTRES (misma lógica que Marcas).
 */
const UbicacionesView = createCatalogoEmpresaView({
  slug: 'ubicaciones',
  apiPath: '/api/ubicaciones',
  icon: 'fa-location-dot',
  viewTitle: 'Ubicaciones',
  labelSingular: 'ubicación',
  labelPlural: 'ubicaciones',
  idKey: 'CODCLATRES',
  dataAttr: 'codclatres',
  panelClass: 'marcas-panel',
  searchPlaceholder: 'Buscar por código o descripción…',
  searchKeys: ['CODCLATRES', 'DESCLATRES'],
  formFields: [
    { key: 'CODCLATRES', label: 'Código', type: 'number', readonlyOnEdit: true, hideOnNew: true },
    { key: 'DESCLATRES', label: 'Descripción', required: true, type: 'text' },
  ],
  createKeys: ['DESCLATRES'],
  updateKeys: ['DESCLATRES'],
  tableColumns: [
    { key: 'CODCLATRES', label: 'Código', type: 'number' },
    { key: 'DESCLATRES', label: 'Descripción' },
  ],
  validateForm(data) {
    if (!data.DESCLATRES) return 'La descripción es obligatoria';
    return null;
  },
  getRowLabel(row) {
    return row?.DESCLATRES || '';
  },
});
