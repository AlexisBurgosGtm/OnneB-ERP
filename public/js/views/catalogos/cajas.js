/**
 * Vista Cajas — CRUD sobre dbo.Cajas filtrado por EMPNIT (misma lógica que Marcas)
 */
const CajasView = createCatalogoEmpresaView({
  slug: 'cajas',
  apiPath: '/api/cajas',
  icon: 'fa-cash-register',
  labelSingular: 'caja',
  labelPlural: 'caja(s)',
  idKey: 'CODCAJA',
  dataAttr: 'codcaja',
  searchPlaceholder: 'Buscar por código o descripción…',
  searchKeys: ['CODCAJA', 'DESCAJA'],
  formFields: [
    { key: 'CODCAJA', label: 'Código', type: 'number', readonlyOnEdit: true, hideOnNew: true },
    { key: 'DESCAJA', label: 'Descripción', required: true, type: 'text' },
  ],
  createKeys: ['DESCAJA'],
  updateKeys: ['DESCAJA'],
  tableColumns: [
    { key: 'CODCAJA', label: 'Código', type: 'number' },
    { key: 'DESCAJA', label: 'Descripción' },
  ],
  validateForm(data) {
    if (!data.DESCAJA) return 'La descripción es obligatoria';
    return null;
  },
  getRowLabel(row) {
    return row?.DESCAJA || '';
  },
});
