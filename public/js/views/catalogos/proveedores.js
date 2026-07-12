const ProveedoresView = createCatalogoEmpresaView({
  slug: 'proveedores',
  apiPath: '/api/proveedores',
  icon: 'fa-truck',
  labelSingular: 'proveedor',
  labelPlural: 'proveedor(es)',
  idKey: 'CODPROV',
  dataAttr: 'codprov',
  formWidth: 560,
  searchPlaceholder: 'Buscar por código, empresa, NIT, contacto…',
  searchKeys: ['CODPROV', 'EMPRESA', 'RAZONSOCIAL', 'TELEMPRESA', 'NIT', 'CONTACTO', 'DIRECCION'],
  formFields: [
    { key: 'CODPROV', label: 'Código', type: 'number', readonlyOnEdit: true, hideOnNew: true },
    { key: 'NIT', label: 'NIT' },
    { key: 'EMPRESA', label: 'Empresa', required: true },
    { key: 'RAZONSOCIAL', label: 'Razón social' },
    { key: 'DIRECCION', label: 'Dirección' },
    { key: 'TELEMPRESA', label: 'Tel. empresa' },
    { key: 'CONTACTO', label: 'Contacto' },
    { key: 'TELCONTACTO', label: 'Tel. contacto' },
  ],
  docFormFields: [
    { key: 'NIT', label: 'NIT' },
    { key: 'EMPRESA', label: 'Empresa', required: true },
  ],
  docNameField: 'EMPRESA',
  docCreateKeys: ['NIT', 'EMPRESA'],
  createKeys: ['NIT', 'EMPRESA', 'RAZONSOCIAL', 'DIRECCION', 'TELEMPRESA', 'CONTACTO', 'TELCONTACTO'],
  updateKeys: ['NIT', 'EMPRESA', 'RAZONSOCIAL', 'DIRECCION', 'TELEMPRESA', 'CONTACTO', 'TELCONTACTO'],
  mapFormToApi(data) {
    return {
      NIT: data.NIT || null,
      EMPRESA: data.EMPRESA,
      RAZONSOCIAL: data.RAZONSOCIAL || null,
      DIRECCION: data.DIRECCION || null,
      TELEMPRESA: data.TELEMPRESA || null,
      CONTACTO: data.CONTACTO || null,
      TELCONTACTO: data.TELCONTACTO || null,
    };
  },
  tableColumns: [
    { key: 'CODPROV', label: 'Código', type: 'number' },
    { key: 'NIT', label: 'NIT' },
    { key: 'EMPRESA', label: 'Empresa' },
    { key: 'RAZONSOCIAL', label: 'Razón social' },
    { key: 'TELEMPRESA', label: 'Teléfono' },
    { key: 'CONTACTO', label: 'Contacto' },
  ],
  validateForm(data) {
    if (!data.EMPRESA) return 'El nombre de empresa es obligatorio';
    return null;
  },
  getRowLabel(row) {
    return row?.EMPRESA || '';
  },
});
