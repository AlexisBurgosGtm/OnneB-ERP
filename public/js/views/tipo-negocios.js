/**
 * Vista Tipos de negocio — CRUD sobre dbo.TIPONEGOCIOS filtrado por EMPNIT.
 * El campo TIPONEGOCIO alimenta el combo de clientes.
 */
const TipoNegociosView = createCatalogoEmpresaView({
  slug: 'tipo-negocios',
  apiPath: '/api/tipo-negocios',
  icon: 'fa-store',
  labelSingular: 'tipo de negocio',
  labelPlural: 'tipo(s) de negocio',
  viewTitle: 'Tipos de negocio',
  idKey: 'TIPONEGOCIO',
  dataAttr: 'tiponegocio',
  searchPlaceholder: 'Buscar tipo de negocio…',
  searchKeys: ['TIPONEGOCIO'],
  formFields: [{ key: 'TIPONEGOCIO', label: 'Tipo de negocio', required: true, type: 'text' }],
  createKeys: ['TIPONEGOCIO'],
  updateKeys: ['TIPONEGOCIO'],
  tableColumns: [{ key: 'TIPONEGOCIO', label: 'Tipo de negocio' }],
  validateForm(data) {
    if (!data.TIPONEGOCIO) return 'El tipo de negocio es obligatorio';
    return null;
  },
  getRowLabel(row) {
    return row?.TIPONEGOCIO || '';
  },
});
