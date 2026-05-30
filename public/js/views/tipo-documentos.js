const activoDocOptions = [
  { value: 'SI', label: 'SI' },
  { value: 'NO', label: 'NO' },
];

const TipoDocumentosView = createCatalogoEmpresaView({
  slug: 'tipo-documentos',
  apiPath: '/api/tipo-documentos',
  icon: 'fa-file-lines',
  labelSingular: 'tipo documento',
  labelPlural: 'tipo(s) documento',
  idKey: 'CODDOC',
  dataAttr: 'coddoc',
  formWidth: 580,
  searchPlaceholder: 'Buscar por código, descripción, tipo…',
  searchKeys: ['CODDOC', 'DESDOC', 'TIPODOC', 'FORMATO', 'ACTIVO'],
  formFields: [
    { key: 'CODDOC', label: 'Código documento', required: true, readonlyOnEdit: true },
    { key: 'DESDOC', label: 'Descripción', required: true },
    { key: 'TIPODOC', label: 'Tipo doc.' },
    { key: 'CORRELATIVO', label: 'Correlativo', type: 'number', step: '1' },
    { key: 'FORMATO', label: 'Formato' },
    { key: 'ACTIVO', label: 'Activo', type: 'select', options: activoDocOptions },
    { key: 'RESOLUCION', label: 'Resolución' },
    { key: 'AUTORIZACION', label: 'Autorización' },
    { key: 'FRASE1', label: 'Frase 1' },
    { key: 'FRASE2', label: 'Frase 2' },
    { key: 'FRASE3', label: 'Frase 3' },
    { key: 'TIPOMOV', label: 'Tipo mov.' },
    { key: 'TIPOM', label: 'Tipo M', type: 'number' },
    { key: 'CODFORMATO', label: 'Cód. formato' },
    { key: 'CODFORMATOCON', label: 'Cód. formato cont.' },
    { key: 'CODFORMATOCRE', label: 'Cód. formato cred.' },
  ],
  createKeys: [
    'CODDOC',
    'DESDOC',
    'TIPODOC',
    'CORRELATIVO',
    'FORMATO',
    'ACTIVO',
    'RESOLUCION',
    'AUTORIZACION',
    'FRASE1',
    'FRASE2',
    'FRASE3',
    'TIPOMOV',
    'TIPOM',
    'CODFORMATO',
    'CODFORMATOCON',
    'CODFORMATOCRE',
  ],
  updateKeys: [
    'DESDOC',
    'TIPODOC',
    'CORRELATIVO',
    'FORMATO',
    'ACTIVO',
    'RESOLUCION',
    'AUTORIZACION',
    'FRASE1',
    'FRASE2',
    'FRASE3',
    'TIPOMOV',
    'TIPOM',
    'CODFORMATO',
    'CODFORMATOCON',
    'CODFORMATOCRE',
  ],
  mapFormToApi(data, isEdit) {
    const num = (v) => (v === '' || v === undefined ? null : Number(v));
    const n = (key) => {
      const x = num(data[key]);
      return Number.isNaN(x) ? null : x;
    };
    const payload = {
      DESDOC: data.DESDOC,
      TIPODOC: data.TIPODOC || null,
      CORRELATIVO: n('CORRELATIVO'),
      FORMATO: data.FORMATO || null,
      ACTIVO: data.ACTIVO || null,
      RESOLUCION: data.RESOLUCION || null,
      AUTORIZACION: data.AUTORIZACION || null,
      FRASE1: data.FRASE1 || null,
      FRASE2: data.FRASE2 || null,
      FRASE3: data.FRASE3 || null,
      TIPOMOV: data.TIPOMOV || null,
      TIPOM: n('TIPOM'),
      CODFORMATO: data.CODFORMATO || null,
      CODFORMATOCON: data.CODFORMATOCON || null,
      CODFORMATOCRE: data.CODFORMATOCRE || null,
    };
    if (!isEdit) payload.CODDOC = data.CODDOC;
    return payload;
  },
  tableColumns: [
    { key: 'CODDOC', label: 'Código' },
    { key: 'DESDOC', label: 'Descripción' },
    { key: 'TIPODOC', label: 'Tipo' },
    { key: 'FORMATO', label: 'Formato' },
    { key: 'ACTIVO', label: 'Activo' },
  ],
  validateForm(data, isEdit) {
    if (!isEdit && !data.CODDOC) return 'El código de documento es obligatorio';
    if (!data.DESDOC) return 'La descripción es obligatoria';
    return null;
  },
  getRowLabel(row) {
    return row?.DESDOC || row?.CODDOC || '';
  },
});
