/**
 * Vista Plataformas — CRUD sobre dbo.VEHICULOS_PLATAFORMAS filtrado por EMPNIT.
 */
const PlataformasViewBase = createCatalogoEmpresaView({
  slug: 'plataformas',
  apiPath: '/api/plataformas',
  icon: 'fa-truck-ramp-box',
  labelSingular: 'plataforma',
  labelPlural: 'plataforma(s)',
  viewTitle: 'Plataformas',
  idKey: 'CODPLATAFORMA',
  dataAttr: 'codplataforma',
  searchPlaceholder: 'Buscar por placa, descripción…',
  searchKeys: ['CODPLATAFORMA', 'NOPLACA', 'PLATAFORMA'],
  formFields: [
    { key: 'NOPLACA', label: 'No. placa' },
    { key: 'PLATAFORMA', label: 'Plataforma', required: true },
  ],
  createKeys: ['NOPLACA', 'PLATAFORMA'],
  updateKeys: ['NOPLACA', 'PLATAFORMA'],
  allowEmpty: ['NOPLACA'],
  tableColumns: [
    { key: 'NOPLACA', label: 'No. placa' },
    { key: 'PLATAFORMA', label: 'Plataforma' },
  ],
  validateForm(data) {
    if (!data.PLATAFORMA) return 'La descripción de plataforma es obligatoria';
    return null;
  },
  getRowLabel(row) {
    const placa = row?.NOPLACA ? `${row.NOPLACA} — ` : '';
    return `${placa}${row?.PLATAFORMA || ''}`;
  },
});

const PlataformasView = {
  ...PlataformasViewBase,

  async onEliminar(id) {
    const row = this.findRow(id);
    const nombre = this.rowLabel(row, id);
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Eliminar plataforma?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(nombre)}</strong></p>`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!confirm) return;
    const pass = await CatalogosUI.solicitarClaveAdmin({
      title: 'Autorizar eliminación',
      text: 'Ingrese la clave de administrador para eliminar la plataforma.',
      confirmText: 'Eliminar',
    });
    if (!pass) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), { method: 'DELETE' });
      F.toast('Plataforma eliminada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },
};
