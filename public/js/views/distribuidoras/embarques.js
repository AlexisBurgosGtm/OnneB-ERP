/**
 * Distribuidoras → Embarques (picking) — CRUD dbo.EMBARQUES.
 */
const EMBARQUES_FORM_FIELDS = [
  { key: 'CODEMBARQUE', label: 'Código', type: 'text', readonlyOnEdit: true },
  { key: 'FECHA', label: 'Fecha', type: 'date', required: true },
  { key: 'DESEMBARQUE', label: 'Nombre', required: true, type: 'text' },
  { key: 'DESCRIPCION', label: 'Descripción', type: 'textarea' },
  { key: 'CODREP', label: 'Repartidor', type: 'select', options: [] },
  { key: 'AUX_REPARTIDOR', label: 'Auxiliar de repartidor', type: 'text' },
  { key: 'USUARIOCREADO', label: 'Usuario creado', type: 'text', readonly: true },
];

const EmbarquesViewBase = createCatalogoEmpresaView({
  slug: 'embarques',
  apiPath: '/api/embarques',
  icon: 'fa-boxes-packing',
  viewTitle: 'Embarques (picking)',
  labelSingular: 'embarque',
  labelPlural: 'embarque(s)',
  idKey: 'CODEMBARQUE',
  dataAttr: 'codembarque',
  formWidth: 560,
  searchPlaceholder: 'Buscar por código, nombre, descripción, usuario, repartidor…',
  searchKeys: [
    'CODEMBARQUE',
    'DESEMBARQUE',
    'DESCRIPCION',
    'USUARIOCREADO',
    'AUX_REPARTIDOR',
    'REPARTIDOR',
    'ESTADO',
    'FINALIZADO',
  ],
  formFields: EMBARQUES_FORM_FIELDS,
  createKeys: ['CODEMBARQUE', 'FECHA', 'DESEMBARQUE', 'DESCRIPCION', 'AUX_REPARTIDOR', 'CODREP', 'USUARIOCREADO'],
  updateKeys: ['FECHA', 'DESEMBARQUE', 'DESCRIPCION', 'AUX_REPARTIDOR', 'CODREP'],
  tableColumns: [
    { key: 'CODEMBARQUE', label: 'Código' },
    { key: 'FECHA', label: 'Fecha' },
    { key: 'DESEMBARQUE', label: 'Nombre' },
    { key: 'DESCRIPCION', label: 'Descripción' },
    { key: 'USUARIOCREADO', label: 'Usuario' },
    { key: 'REPARTIDOR', label: 'Repartidor' },
    { key: 'AUX_REPARTIDOR', label: 'Auxiliar' },
    { key: 'ESTADO', label: 'Estado' },
  ],
  validateForm(data) {
    if (!String(data.FECHA || '').trim()) return 'La fecha es obligatoria';
    if (!String(data.DESEMBARQUE || '').trim()) return 'El nombre del embarque es obligatorio';
    return null;
  },
  mapFormToApi(data, isEdit) {
    const payload = {
      FECHA: String(data.FECHA || '').trim().slice(0, 10),
      DESEMBARQUE: String(data.DESEMBARQUE || '').trim(),
      DESCRIPCION: String(data.DESCRIPCION || '').trim(),
      AUX_REPARTIDOR: String(data.AUX_REPARTIDOR || '').trim(),
      CODREP: data.CODREP === '' || data.CODREP == null ? null : data.CODREP,
    };
    if (!isEdit) {
      if (String(data.CODEMBARQUE || '').trim()) {
        payload.CODEMBARQUE = String(data.CODEMBARQUE).trim();
      }
      const u = typeof F !== 'undefined' ? F.session('user') || {} : {};
      payload.USUARIOCREADO = String(u.usuario || u.username || '').trim();
    }
    return payload;
  },
  getRowLabel(row) {
    return String(row?.DESEMBARQUE || row?.CODEMBARQUE || '').trim();
  },
});

const EmbarquesView = {
  ...EmbarquesViewBase,
  _filterEstado: 'NO',
  _repartidorOpts: [],

  sessionUsuario() {
    const u = typeof F !== 'undefined' ? F.session('user') || {} : {};
    return String(u.usuario || u.username || '').trim();
  },

  todayIsoDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  formatDateDdMmYyyy(value) {
    if (value === null || value === undefined || value === '') return '—';
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    return this.escapeHtml(s);
  },

  defaultNewRow() {
    return {
      CODEMBARQUE: '',
      FECHA: this.todayIsoDate(),
      DESEMBARQUE: '',
      DESCRIPCION: '',
      AUX_REPARTIDOR: '',
      CODREP: '',
      USUARIOCREADO: this.sessionUsuario(),
    };
  },

  async ensureRepartidores() {
    try {
      const data = await F.fetchJson(this.apiBase('/repartidores'), { cache: 'no-store' });
      this._repartidorOpts = (data.rows || []).map((r) => ({
        value: String(r.CODEMPLEADO),
        label: String(r.NOMEMPLEADO || r.CODEMPLEADO).trim(),
      }));
    } catch (err) {
      this._repartidorOpts = [];
      F.toast(err.message || 'No se pudieron cargar repartidores', 'warning');
    }
    const field = EMBARQUES_FORM_FIELDS.find((f) => f.key === 'CODREP');
    if (field) field.options = this._repartidorOpts;
  },

  fieldHtml(f, row, isEdit) {
    if (f.key === 'USUARIOCREADO') {
      const val = isEdit ? row.USUARIOCREADO || this.sessionUsuario() : this.sessionUsuario();
      return `
        <label class="form-label small mb-0">${this.escapeHtml(f.label)}</label>
        <input type="text" class="form-control form-control-sm" name="USUARIOCREADO"
          value="${this.escapeHtml(val)}" readonly tabindex="-1">
      `;
    }
    if (f.key === 'CODREP') {
      f = { ...f, options: this._repartidorOpts || f.options || [] };
    }
    if (f.type === 'textarea') {
      const req = f.required ? 'required' : '';
      const val = row[f.key] ?? '';
      return `
        <label class="form-label small mb-0">${this.escapeHtml(f.label)}</label>
        <textarea class="form-control form-control-sm" name="${f.key}" rows="3" ${req}>${this.escapeHtml(val)}</textarea>
      `;
    }
    return EmbarquesViewBase.fieldHtml.call(this, f, row, isEdit);
  },

  async showForm(title, row = {}, isEdit = false, options = {}) {
    await this.ensureRepartidores();
    return EmbarquesViewBase.showForm.call(this, title, row, isEdit, options);
  },

  async onEliminar(id) {
    const row = this.findRow(id);
    const nombre = this.rowLabel(row, id);
    const auth = await CatalogosUI.authorizeEliminarRegistro({
      label: nombre,
      tipo: 'embarque',
      kind: 'registro',
      title: '¿Eliminar embarque?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(nombre)}</strong></p>`,
      passText: 'Ingrese la clave de administrador para eliminar el embarque.',
      confirmText: 'Eliminar',
    });
    if (!auth) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: auth.pass != null ? String(auth.pass) : '__AUTORIZADO__' }),
      });
      F.toast('embarque eliminado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onNuevo() {
    const data = await this.showForm('Nuevo embarque', this.defaultNewRow());
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('embarque creado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  normalizeFinalizado(value) {
    const s = String(value ?? '').trim().toUpperCase();
    if (['SI', 'SÍ', 'S', '1', 'TRUE', 'FINALIZADO', 'FIN'].includes(s)) return 'SI';
    return 'NO';
  },

  estadoLabel(value) {
    return this.normalizeFinalizado(value) === 'SI' ? 'Finalizado' : 'No finalizado';
  },

  getFilteredRows() {
    let rows = this._rows;
    if (this._filterEstado) {
      rows = rows.filter((r) => this.normalizeFinalizado(r.FINALIZADO) === this._filterEstado);
    }
    const q = this._filterQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const parts = [
        r.CODEMBARQUE,
        r.DESEMBARQUE,
        r.DESCRIPCION,
        r.USUARIOCREADO,
        r.AUX_REPARTIDOR,
        r.REPARTIDOR,
        r.FECHA,
        this.estadoLabel(r.FINALIZADO),
      ].map((v) => String(v ?? '').toLowerCase());
      return parts.some((p) => p.includes(q));
    });
  },

  renderTableBodyHtml(rows) {
    const colSpan = 9;
    if (!rows.length) {
      let msg = 'Sin embarques registrados';
      if (this._filterEstado === 'NO') msg = 'Sin embarques no finalizados';
      else if (this._filterEstado === 'SI') msg = 'Sin embarques finalizados';
      if (this._filterQuery.trim()) msg = 'Ningún registro coincide con la búsqueda';
      return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const fin = this.normalizeFinalizado(row.FINALIZADO);
        const badgeCls = fin === 'SI' ? 'text-bg-success' : 'text-bg-warning';
        return `<tr>
          <td>${this.escapeHtml(row.CODEMBARQUE)}</td>
          <td>${this.formatDateDdMmYyyy(row.FECHA)}</td>
          <td>${this.escapeHtml(row.DESEMBARQUE)}</td>
          <td>${this.escapeHtml(row.DESCRIPCION || '—')}</td>
          <td>${this.escapeHtml(row.USUARIOCREADO || '—')}</td>
          <td>${this.escapeHtml(row.REPARTIDOR || '—')}</td>
          <td>${this.escapeHtml(row.AUX_REPARTIDOR || '—')}</td>
          <td><span class="badge ${badgeCls}">${this.escapeHtml(this.estadoLabel(fin))}</span></td>
          <td class="text-end">
            <div class="catalogo-acciones">
              <button type="button" class="btn btn-sm btn-outline-secondary btn-embarques-imprimir"
                data-codembarque="${this.escapeHtml(row.CODEMBARQUE)}"
                title="Imprimir Documentos" aria-label="Imprimir Documentos">
                <i class="fa-solid fa-print me-1" aria-hidden="true"></i>Imprimir Documentos
              </button>
              ${CatalogosUI.btnEditar(row.CODEMBARQUE, 'codembarque')}
              ${CatalogosUI.btnEliminar(row.CODEMBARQUE, 'codembarque')}
            </div>
          </td>
        </tr>`;
      })
      .join('');
  },

  renderTable() {
    const headers = [
      'Código',
      'Fecha',
      'Nombre',
      'Descripción',
      'Usuario',
      'Repartidor',
      'Auxiliar',
      'Estado',
      'Acciones',
    ]
      .map((h, i) => `<th scope="col"${i === 8 ? ' class="text-end"' : ''}>${h}</th>`)
      .join('');
    const estadoOpts = [
      { value: 'NO', label: 'No finalizado' },
      { value: 'SI', label: 'Finalizado' },
      { value: '', label: 'Todos' },
    ];
    const estadoSelect = estadoOpts
      .map(
        (o) =>
          `<option value="${o.value}"${this._filterEstado === o.value ? ' selected' : ''}>${o.label}</option>`
      )
      .join('');
    const filtered = this.getFilteredRows();

    return `
      <div class="catalogo-empresa-panel catalogo-vista-wrap">
        <h2 class="catalogo-vista-title h5 mb-2 px-1">Embarques (picking)</h2>
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 px-1">
          <span class="catalogo-empresa-badge" id="embarques-count">${this.badgeText(filtered.length, this._rows.length)}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-embarques-refresh">
            <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
          </button>
        </div>
        <div class="embarques-filters px-1 mb-2">
          <label for="embarques-filter-estado" class="small text-muted mb-0 text-nowrap">Estado:</label>
          <select class="form-select form-select-sm embarques-filter-estado" id="embarques-filter-estado"
            title="Estado" aria-label="Estado">
            ${estadoSelect}
          </select>
          <div class="input-group input-group-sm catalogo-empresa-search embarques-search">
            <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="embarques-search"
              placeholder="Buscar por código, nombre, descripción, usuario, repartidor…"
              value="${this.escapeHtml(this._filterQuery)}" autocomplete="off" spellcheck="false">
            <button type="button" class="btn btn-outline-secondary" id="btn-embarques-search-clear"
              title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped">
            <thead><tr>${headers}</tr></thead>
            <tbody id="embarques-tbody">${this.renderTableBodyHtml(filtered)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-embarques-nuevo')}
      </div>
    `;
  },

  updateTableView() {
    const filtered = this.getFilteredRows();
    const tbody = this._container?.querySelector('#embarques-tbody');
    const badge = this._container?.querySelector('#embarques-count');
    if (tbody) {
      tbody.innerHTML = this.renderTableBodyHtml(filtered);
      this.bindRowActions();
    }
    if (badge) badge.innerHTML = this.badgeText(filtered.length, this._rows.length);
  },

  bindFilterEstado() {
    const sel = document.getElementById('embarques-filter-estado');
    if (!sel) return;
    sel.addEventListener('change', () => {
      this._filterEstado = sel.value;
      this.updateTableView();
    });
  },

  bindImprimirDocumentos() {
    this._container?.querySelectorAll('.btn-embarques-imprimir').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const cod = String(btn.getAttribute('data-codembarque') || '').trim();
        if (!cod) {
          F.toast('Embarque no válido', 'warning');
          return;
        }
        if (typeof AsignacionPedidosView === 'undefined' || !AsignacionPedidosView.openImpresionModal) {
          F.alert('Error', 'El módulo de impresión de Asignación de Facturas no está disponible', 'error');
          return;
        }
        try {
          await AsignacionPedidosView.openImpresionModal(cod);
        } catch (err) {
          F.alert('Error', err.message || 'No se pudo abrir la impresión', 'error');
        }
      });
    });
  },

  bindRowActions() {
    EmbarquesViewBase.bindRowActions.call(this);
    this.bindImprimirDocumentos();
  },

  bindEvents() {
    EmbarquesViewBase.bindEvents.call(this);
    this.bindFilterEstado();
  },
};
