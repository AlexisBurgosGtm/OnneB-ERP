/**
 * Vista Cuentas bancarias — CRUD por EMPNIT. CODBANCO selector de BANCOS.
 */
const CuentasBancariasViewBase = createCatalogoEmpresaView({
  slug: 'cuentas-bancarias',
  apiPath: '/api/cuentas-bancarias',
  icon: 'fa-wallet',
  viewTitle: 'Cuentas bancarias',
  labelSingular: 'cuenta bancaria',
  labelPlural: 'cuenta(s) bancaria(s)',
  idKey: 'CODCUENTA',
  dataAttr: 'codcuenta',
  searchPlaceholder: 'Buscar por número de cuenta o banco…',
  searchKeys: ['NOCUENTA', 'DESBANCO', 'CODBANCO'],
  formFields: [
    {
      key: 'CODBANCO',
      label: 'Banco',
      type: 'select',
      required: true,
      options: [],
    },
    { key: 'NOCUENTA', label: 'Número de cuenta', required: true },
  ],
  createKeys: ['CODBANCO', 'NOCUENTA'],
  updateKeys: ['CODBANCO', 'NOCUENTA'],
  tableColumns: [
    { key: 'DESBANCO', label: 'Banco' },
    { key: 'NOCUENTA', label: 'No. cuenta' },
  ],
  validateForm(data) {
    if (!data.CODBANCO) return 'Seleccione el banco';
    if (!String(data.NOCUENTA || '').trim()) return 'El número de cuenta es obligatorio';
    return null;
  },
  getRowLabel(row) {
    const banco = row?.DESBANCO || row?.CODBANCO || '';
    return row?.NOCUENTA ? `${banco} — ${row.NOCUENTA}` : String(banco);
  },
});

const CuentasBancariasView = {
  ...CuentasBancariasViewBase,
  _bancos: [],

  async loadBancos() {
    const data = await F.fetchJson(`/api/bancos?_=${Date.now()}`, { cache: 'no-store' });
    this._bancos = data.rows || [];
    const field = this.formFields?.find((f) => f.key === 'CODBANCO');
    if (field) {
      field.options = this._bancos.map((b) => ({
        value: String(b.CODBANCO),
        label: String(b.DESBANCO || b.CODBANCO),
      }));
    }
    return this._bancos;
  },

  formatCell(value, col) {
    if (col?.key === 'DESBANCO' && (value === null || value === undefined || value === '')) {
      return '—';
    }
    return CuentasBancariasViewBase.formatCell.call(this, value, col);
  },

  async showForm(title, row = {}, isEdit = false, options = {}) {
    try {
      await this.loadBancos();
    } catch (err) {
      F.alert('Error', `No se pudieron cargar los bancos: ${err.message}`, 'error');
      return null;
    }
    if (!this._bancos.length) {
      F.alert('Sin bancos', 'Registre bancos antes de crear cuentas bancarias.', 'warning');
      return null;
    }
    return CuentasBancariasViewBase.showForm.call(this, title, row, isEdit, options);
  },

  async load(container) {
    try {
      await this.loadBancos();
    } catch {
      /* la lista de cuentas aún puede cargarse */
    }
    return CuentasBancariasViewBase.load.call(this, container);
  },
};
