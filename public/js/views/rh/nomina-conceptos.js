const NominaConceptosView = createCatalogoEmpresaView({
  slug: 'nomina-conceptos',
  apiPath: '/api/nomina/conceptos',
  icon: 'fa-list-check',
  viewTitle: 'Conceptos de nómina',
  labelSingular: 'concepto',
  labelPlural: 'concepto(s)',
  idKey: 'ID',
  dataAttr: 'id',
  searchPlaceholder: 'Buscar por código o descripción…',
  searchKeys: ['CODIGO', 'DESCRIPCION', 'TIPO'],
  tableColumns: [
    { key: 'CODIGO', label: 'Código' },
    { key: 'DESCRIPCION', label: 'Descripción' },
    { key: 'TIPO', label: 'Tipo' },
    { key: 'AFECTA_IGSS', label: 'Afecta IGSS' },
    { key: 'AFECTA_ISR', label: 'Afecta ISR' },
    { key: 'ACTIVO', label: 'Activo' },
  ],
  formFields: [
    { key: 'CODIGO', label: 'Código', required: true },
    { key: 'DESCRIPCION', label: 'Descripción', required: true },
    {
      key: 'TIPO',
      label: 'Tipo',
      type: 'select',
      required: true,
      options: [
        { value: 'ING', label: 'Ingreso' },
        { value: 'DED', label: 'Deducción' },
      ],
    },
    {
      key: 'AFECTA_IGSS',
      label: 'Afecta IGSS',
      type: 'select',
      options: [
        { value: 'SI', label: 'Sí' },
        { value: 'NO', label: 'No' },
      ],
    },
    {
      key: 'AFECTA_ISR',
      label: 'Afecta ISR',
      type: 'select',
      options: [
        { value: 'SI', label: 'Sí' },
        { value: 'NO', label: 'No' },
      ],
    },
    {
      key: 'ACTIVO',
      label: 'Activo',
      type: 'select',
      options: [
        { value: 'SI', label: 'Sí' },
        { value: 'NO', label: 'No' },
      ],
    },
  ],
  createKeys: ['CODIGO', 'DESCRIPCION', 'TIPO', 'AFECTA_IGSS', 'AFECTA_ISR', 'ACTIVO'],
  updateKeys: ['CODIGO', 'DESCRIPCION', 'TIPO', 'AFECTA_IGSS', 'AFECTA_ISR', 'ACTIVO'],
  validateForm(data) {
    if (!String(data.CODIGO || '').trim()) return 'El código es obligatorio';
    if (!String(data.DESCRIPCION || '').trim()) return 'La descripción es obligatoria';
    return null;
  },
  getRowLabel(row) {
    return row?.CODIGO ? `${row.CODIGO} — ${row.DESCRIPCION || ''}` : '';
  },
});
