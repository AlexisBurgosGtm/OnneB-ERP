/**
 * Vista Bancos — CRUD general (sin EMPNIT). CODBANCO es IDENTITY (no se muestra).
 */
const BancosView = createCatalogoEmpresaView({
  slug: 'bancos',
  apiPath: '/api/bancos',
  requireEmpresa: false,
  icon: 'fa-building-columns',
  viewTitle: 'Bancos',
  labelSingular: 'banco',
  labelPlural: 'banco(s)',
  idKey: 'CODBANCO',
  dataAttr: 'codbanco',
  searchPlaceholder: 'Buscar por nombre de banco…',
  searchKeys: ['DESBANCO'],
  formFields: [{ key: 'DESBANCO', label: 'Nombre del banco', required: true }],
  createKeys: ['DESBANCO'],
  updateKeys: ['DESBANCO'],
  tableColumns: [{ key: 'DESBANCO', label: 'Banco' }],
  validateForm(data) {
    if (!String(data.DESBANCO || '').trim()) return 'El nombre del banco es obligatorio';
    return null;
  },
  getRowLabel(row) {
    return row?.DESBANCO || '';
  },
});
