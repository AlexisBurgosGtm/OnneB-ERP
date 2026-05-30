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
    { key: 'EMPRESA', label: 'Empresa', required: true },
    { key: 'RAZONSOCIAL', label: 'Razón social' },
    { key: 'NIT', label: 'NIT' },
    { key: 'DIRECCION', label: 'Dirección' },
    { key: 'TELEMPRESA', label: 'Tel. empresa' },
    { key: 'CONTACTO', label: 'Contacto' },
    { key: 'TELCONTACTO', label: 'Tel. contacto' },
    { key: 'SALDO', label: 'Saldo', type: 'number', step: '0.01' },
  ],
  createKeys: ['EMPRESA', 'RAZONSOCIAL', 'NIT', 'DIRECCION', 'TELEMPRESA', 'CONTACTO', 'TELCONTACTO', 'SALDO'],
  updateKeys: ['EMPRESA', 'RAZONSOCIAL', 'NIT', 'DIRECCION', 'TELEMPRESA', 'CONTACTO', 'TELCONTACTO', 'SALDO'],
  mapFormToApi(data) {
    return {
      EMPRESA: data.EMPRESA,
      RAZONSOCIAL: data.RAZONSOCIAL || null,
      NIT: data.NIT || null,
      DIRECCION: data.DIRECCION || null,
      TELEMPRESA: data.TELEMPRESA || null,
      CONTACTO: data.CONTACTO || null,
      TELCONTACTO: data.TELCONTACTO || null,
      SALDO: data.SALDO === '' ? null : Number(data.SALDO),
    };
  },
  tableColumns: [
    { key: 'CODPROV', label: 'Código', type: 'number' },
    { key: 'EMPRESA', label: 'Empresa' },
    { key: 'RAZONSOCIAL', label: 'Razón social' },
    { key: 'TELEMPRESA', label: 'Teléfono' },
    { key: 'NIT', label: 'NIT' },
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
