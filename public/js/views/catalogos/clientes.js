/**
 * Vista Clientes — CRUD sobre dbo.CLIENTES (patrón Marcas + combos de catálogos).
 */
const CLIENTES_DIAVISITA_OPTIONS = [
  'OTROS',
  'LUNES',
  'MARTES',
  'MIERCOLES',
  'JUEVES',
  'VIERNES',
  'SABADO',
  'DOMINGO',
].map((v) => ({ value: v, label: v }));

const CLIENTES_TIPO_OPTIONS = [
  { value: 'VENTAS', label: 'VENTAS' },
  { value: 'PROSPECTO', label: 'PROSPECTO' },
];

function clientesTodayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function clientesStripDiacritics(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function clientesBindNombreSinTildes(popup) {
  const input = popup?.querySelector('[name="NOMBRECLIENTE"]');
  if (!input) return;
  const apply = () => {
    const next = clientesStripDiacritics(input.value);
    if (next === input.value) return;
    const before = clientesStripDiacritics(input.value.slice(0, input.selectionStart || 0));
    input.value = next;
    const pos = Math.min(before.length, next.length);
    try {
      input.setSelectionRange(pos, pos);
    } catch (_err) {
      /* ignore */
    }
  };
  input.addEventListener('input', apply);
  input.addEventListener('paste', () => setTimeout(apply, 0));
}

function clientesDateInputValue(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const ClientesView = {
  _container: null,
  _rows: [],
  _totalCount: 0,
  _listTruncated: false,
  _filterQuery: '',
  _filterHabilitado: '',
  _lookups: null,
  _lookupsEmpNit: '',
  _loadingList: false,

  tableColumns: [
    { key: 'DIAVISITA', label: 'Visita' },
    { key: 'CODCLIENTE', label: 'Código' },
    { key: 'NIT', label: 'NIT' },
    { key: 'NEGOCIO', label: 'Negocio' },
    { key: 'NOMBRECLIENTE', label: 'Nombre' },
    { key: 'CODRUTA', label: 'Ruta', ruta: true },
    { key: 'HABILITADO', label: 'Habilitado', toggle: true },
  ],

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiBase(path = '') {
    const empNit = F.getEmpNit();
    if (!empNit) {
      throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    }
    const base = `/api/clientes${path}`;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}empnit=${encodeURIComponent(empNit)}`;
  },

  async loadLookups() {
    const empNit = F.getEmpNit() || '';
    if (this._lookups && this._lookupsEmpNit === empNit) return this._lookups;
    const ts = Date.now();
    if (!empNit) {
      this._lookups = {
        municipios: [],
        departamentos: [],
        rutas: [],
        tiposNegocio: [],
      };
      this._lookupsEmpNit = empNit;
      return this._lookups;
    }
    const rutasUrl = `/api/rutas?empnit=${encodeURIComponent(empNit)}&_=${ts}`;
    const tiposUrl = `/api/tipo-negocios?empnit=${encodeURIComponent(empNit)}&_=${ts}`;
    const [muniRes, deptRes, rutasRes, tiposRes] = await Promise.all([
      F.fetchJson(`/api/municipios?_=${ts}`, { cache: 'no-store' }),
      F.fetchJson(`/api/departamentos?_=${ts}`, { cache: 'no-store' }),
      F.fetchJson(rutasUrl, { cache: 'no-store' }),
      F.fetchJson(tiposUrl, { cache: 'no-store' }),
    ]);
    this._lookups = {
      municipios: (muniRes.rows || []).map((m) => ({
        value: String(m.CODMUNICIPIO),
        label: String(m.DESMUNICIPIO || m.CODMUNICIPIO).trim(),
      })),
      departamentos: (deptRes.rows || []).map((d) => ({
        value: String(d.CODDEPARTAMENTO),
        label: String(d.DESDEPARTAMENTO || d.CODDEPARTAMENTO).trim(),
      })),
      rutas: (rutasRes.rows || []).map((r) => ({
        value: String(r.CODRUTA),
        label: String(r.DESRUTA || r.CODRUTA).trim(),
      })),
      tiposNegocio: (tiposRes.rows || []).map((t) => ({
        value: String(t.TIPONEGOCIO || '').trim(),
        label: String(t.TIPONEGOCIO || '').trim(),
      })),
    };
    this._lookupsEmpNit = empNit;
    return this._lookups;
  },

  lookupLabel(kind, value) {
    const v = String(value ?? '').trim();
    if (!v) return '—';
    const list = this._lookups?.[kind] || [];
    const found = list.find((o) => String(o.value) === v);
    return found ? found.label : v;
  },

  listApiUrl() {
    const params = new URLSearchParams();
    const q = this._filterQuery.trim();
    if (q) params.set('q', q);
    if (this._filterHabilitado) params.set('habilitado', this._filterHabilitado);
    params.set('_', String(Date.now()));
    const qs = params.toString();
    return qs ? `${this.apiBase()}&${qs}` : `${this.apiBase()}&_=${Date.now()}`;
  },

  normalizeHabilitado(value) {
    return String(value ?? 'NO').trim().toUpperCase() === 'SI' ? 'SI' : 'NO';
  },

  habilitadoButtonHtml(row) {
    const hab = this.normalizeHabilitado(row.HABILITADO);
    const cls = hab === 'SI' ? 'btn-empleado-activo--si' : 'btn-empleado-activo--no';
    return `
      <button type="button" class="btn btn-sm btn-empleado-activo ${cls}"
        data-codcliente="${this.escapeHtml(row.CODCLIENTE)}"
        data-habilitado="${hab}"
        aria-label="Habilitado: ${hab}. Clic para cambiar"
        title="Clic para cambiar a ${hab === 'SI' ? 'NO' : 'SI'}">
        ${hab}
      </button>
    `;
  },

  formatCell(value, col, row = {}) {
    if (col?.toggle) return '';
    if (value === null || value === undefined) return '—';
    if (col?.ruta) {
      const label = row.DESRUTA || this.lookupLabel('rutas', value);
      return this.escapeHtml(label);
    }
    return this.escapeHtml(value);
  },

  selectField(name, label, options, value, required = false) {
    const strVal = value !== null && value !== undefined ? String(value) : '';
    const req = required ? 'required' : '';
    const optsHtml = (options || [])
      .map(
        (o) =>
          `<option value="${this.escapeHtml(o.value)}"${strVal === String(o.value) ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
      )
      .join('');
    return `
      <label class="form-label small mb-0">${this.escapeHtml(label)}</label>
      <select class="form-select form-select-sm" name="${name}" ${req}>
        <option value="">— Seleccione —</option>
        ${optsHtml}
      </select>
    `;
  },

  selectTipoNegocioField(options, value) {
    const strVal = value !== null && value !== undefined ? String(value) : '';
    const optsHtml = (options || [])
      .map(
        (o) =>
          `<option value="${this.escapeHtml(o.value)}"${strVal === String(o.value) ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
      )
      .join('');
    return `
      <label class="form-label small mb-0" for="cliente-tiponegocio-select">Tipo negocio</label>
      <div class="input-group input-group-sm">
        <select class="form-select form-select-sm" name="TIPONEGOCIO" id="cliente-tiponegocio-select">
          <option value="">— Seleccione —</option>
          ${optsHtml}
        </select>
        <button type="button" class="btn btn-outline-secondary" id="btn-refresh-tipos-negocio"
          title="Actualizar tipos de negocio" aria-label="Actualizar tipos de negocio">
          <i class="fa-solid fa-rotate" aria-hidden="true"></i>
        </button>
      </div>
    `;
  },

  inputField(name, label, value, opts = {}) {
    const { type = 'text', readonly = false, required = false, step = '' } = opts;
    const ro = readonly ? 'readonly' : '';
    const req = required ? 'required' : '';
    const stepAttr = step ? `step="${step}"` : '';
    return `
      <label class="form-label small mb-0">${this.escapeHtml(label)}</label>
      <input type="${type}" class="form-control form-control-sm" name="${name}"
        value="${this.escapeHtml(value ?? '')}" ${ro} ${req} ${stepAttr}>
    `;
  },

  row2(col1, col2) {
    return `
      <div class="row g-2 mb-2">
        <div class="col-6">${col1}</div>
        <div class="col-6">${col2}</div>
      </div>
    `;
  },

  fieldBlock(html) {
    return `<div class="mb-2">${html}</div>`;
  },

  accionesRowHtml(codcliente) {
    return `<div class="catalogo-acciones">${CatalogosUI.btnVer(codcliente, 'codcliente')}${CatalogosUI.btnEditar(codcliente, 'codcliente')}${CatalogosUI.btnEliminar(codcliente, 'codcliente')}</div>`;
  },

  viewField(label, value) {
    const display =
      value === null || value === undefined || value === '' ? '—' : this.escapeHtml(String(value));
    return `
      <div class="col-sm-6 mb-2">
        <div class="small text-muted mb-0">${this.escapeHtml(label)}</div>
        <div class="small fw-semibold text-break">${display}</div>
      </div>
    `;
  },

  buildViewHtml(row = {}) {
    const r = row;
    const depto = this.lookupLabel('departamentos', r.CODDEPARTAMENTO);
    const muni = this.lookupLabel('municipios', r.CODMUNICIPIO);
    const ruta = this.lookupLabel('rutas', r.CODRUTA);
    const fecha = clientesDateInputValue(r.FECHAINICIO) || '—';

    const fields = [
      this.viewField('Código', r.CODCLIENTE),
      this.viewField('Tipo', r.TIPO),
      this.viewField('NIT', r.NIT),
      this.viewField('Tipo negocio', r.TIPONEGOCIO),
      this.viewField('Negocio', r.NEGOCIO),
      this.viewField('Nombre cliente', r.NOMBRECLIENTE),
      this.viewField('Dirección', r.DIRCLIENTE),
      this.viewField('Departamento', depto),
      this.viewField('Municipio', muni),
      this.viewField('Teléfono', r.TELEFONOCLIENTE),
      this.viewField('Email', r.EMAILCLIENTE),
      this.viewField('Ruta', ruta),
      this.viewField('Día visita', r.DIAVISITA),
      this.viewField('Fecha inicio', fecha),
      this.viewField('Límite crédito', r.LIMITECREDITO),
      this.viewField('Días crédito', r.DIASCREDITO),
      this.viewField('Saldo', r.SALDO),
      this.viewField('Provincia / referencia', r.PROVINCIA),
      this.viewField('Latitud', r.LATITUDCLIENTE),
      this.viewField('Longitud', r.LONGITUDCLIENTE),
      this.viewField('Habilitado', this.normalizeHabilitado(r.HABILITADO)),
    ];
    return `<div class="row g-1 cliente-detalle-readonly">${fields.join('')}</div>`;
  },

  async fetchClienteDetail(codcliente) {
    const detail = await F.fetchJson(this.apiBase(`/${encodeURIComponent(codcliente)}`), {
      cache: 'no-store',
    });
    return detail.row;
  },

  async onVer(codcliente) {
    try {
      await this.loadLookups();
      const row = await this.fetchClienteDetail(codcliente);
      if (!row) {
        F.alert('Error', 'Cliente no encontrado', 'error');
        return;
      }
      const nombre = row.NOMBRECLIENTE || row.NEGOCIO || codcliente;
      await Swal.fire({
        ...CatalogosUI.modalBase(),
        title: `Cliente: ${this.escapeHtml(nombre)}`,
        html: `<div class="catalogo-form text-start">${this.buildViewHtml(row)}</div>`,
        width: 620,
        showCancelButton: false,
        confirmButtonText: '<i class="fa-solid fa-xmark"></i> Cerrar',
        focusConfirm: true,
      });
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  normalizeRowForForm(row = {}, isEdit = false) {
    return {
      CODCLIENTE: row.CODCLIENTE ?? '',
      NIT: row.NIT ?? '',
      NOMBRECLIENTE: row.NOMBRECLIENTE ?? '',
      DIRCLIENTE: row.DIRCLIENTE ?? '',
      CODMUNICIPIO: row.CODMUNICIPIO ?? '',
      CODDEPARTAMENTO: row.CODDEPARTAMENTO ?? '',
      TELEFONOCLIENTE: row.TELEFONOCLIENTE ?? '',
      EMAILCLIENTE: row.EMAILCLIENTE ?? '',
      LATITUDCLIENTE: row.LATITUDCLIENTE ?? '',
      LONGITUDCLIENTE: row.LONGITUDCLIENTE ?? '',
      CODRUTA: row.CODRUTA ?? '',
      SALDO: row.SALDO ?? '',
      FECHAINICIO: isEdit ? clientesDateInputValue(row.FECHAINICIO) : clientesTodayIso(),
      DIAVISITA: row.DIAVISITA ?? '',
      LIMITECREDITO: row.LIMITECREDITO ?? '',
      DIASCREDITO: row.DIASCREDITO ?? '',
      PROVINCIA: row.PROVINCIA ?? '',
      TIPONEGOCIO: row.TIPONEGOCIO ?? '',
      NEGOCIO: row.NEGOCIO ?? '',
      TIPO: row.TIPO ?? 'VENTAS',
    };
  },

  buildFormHtml(row = {}, isEdit = false, profile = 'full') {
    const r = this.normalizeRowForForm(row, isEdit);
    const compact = profile === 'facturacion' && !isEdit;
    const L = this._lookups || {
      municipios: [],
      departamentos: [],
      rutas: [],
      tiposNegocio: [],
    };

    const codigoHtml = isEdit
      ? this.inputField('CODCLIENTE', 'Código', r.CODCLIENTE, { type: 'number', readonly: true })
      : '<p class="small text-muted mb-0">El código se asignará al guardar.</p>';

    const parts = [
      this.row2(
        codigoHtml,
        this.selectField('TIPO', 'Tipo', CLIENTES_TIPO_OPTIONS, r.TIPO, true)
      ),
      this.fieldBlock(this.inputField('NIT', 'NIT', r.NIT)),
      this.row2(
        this.selectTipoNegocioField(L.tiposNegocio, r.TIPONEGOCIO),
        this.inputField('NEGOCIO', 'Negocio', r.NEGOCIO)
      ),
      this.fieldBlock(this.inputField('NOMBRECLIENTE', 'Nombre cliente', r.NOMBRECLIENTE, { required: true })),
      this.fieldBlock(this.inputField('DIRCLIENTE', 'Dirección', r.DIRCLIENTE)),
      this.row2(
        this.selectField('CODDEPARTAMENTO', 'Departamento', L.departamentos, r.CODDEPARTAMENTO),
        this.selectField('CODMUNICIPIO', 'Municipio', L.municipios, r.CODMUNICIPIO)
      ),
      this.row2(
        this.inputField('TELEFONOCLIENTE', 'Teléfono', r.TELEFONOCLIENTE),
        this.inputField('EMAILCLIENTE', 'Email', r.EMAILCLIENTE, { type: 'email' })
      ),
      this.row2(
        this.selectField('CODRUTA', 'Ruta', L.rutas, r.CODRUTA),
        this.selectField('DIAVISITA', 'Día visita', CLIENTES_DIAVISITA_OPTIONS, r.DIAVISITA)
      ),
    ];

    if (!compact) {
      parts.push(
        this.fieldBlock(this.inputField('FECHAINICIO', 'Fecha inicio', r.FECHAINICIO, { type: 'date' })),
        this.row2(
          this.inputField('LIMITECREDITO', 'Límite crédito', r.LIMITECREDITO, { type: 'number', step: '0.01' }),
          this.inputField('DIASCREDITO', 'Días crédito', r.DIASCREDITO, { type: 'number' })
        ),
        this.fieldBlock(this.inputField('SALDO', 'Saldo', r.SALDO, { type: 'number', step: '0.01' }))
      );
    }

    parts.push(this.fieldBlock(this.inputField('PROVINCIA', 'Provincia / referencia', r.PROVINCIA)));

    if (!compact) {
      parts.push(
        this.row2(
          this.inputField('LATITUDCLIENTE', 'Latitud', r.LATITUDCLIENTE),
          this.inputField('LONGITUDCLIENTE', 'Longitud', r.LONGITUDCLIENTE)
        )
      );
    }

    return parts.join('');
  },

  readFormData() {
    const names = [
      'CODCLIENTE',
      'NIT',
      'NOMBRECLIENTE',
      'DIRCLIENTE',
      'CODMUNICIPIO',
      'CODDEPARTAMENTO',
      'TELEFONOCLIENTE',
      'EMAILCLIENTE',
      'LATITUDCLIENTE',
      'LONGITUDCLIENTE',
      'CODRUTA',
      'SALDO',
      'FECHAINICIO',
      'DIAVISITA',
      'LIMITECREDITO',
      'DIASCREDITO',
      'PROVINCIA',
      'TIPONEGOCIO',
      'NEGOCIO',
      'TIPO',
    ];
    const data = {};
    names.forEach((name) => {
      const input = document.querySelector(`.swal2-html-container [name="${name}"]`);
      if (!input) return;
      data[name] = input.value.trim();
    });
    return data;
  },

  mapFormToApi(data, profile = 'full') {
    const num = (v) => (v === '' || v === undefined ? null : Number(v));
    const n = (key) => {
      const x = num(data[key]);
      return Number.isNaN(x) ? null : x;
    };
    const payload = {
      NIT: data.NIT || null,
      NOMBRECLIENTE: clientesStripDiacritics(data.NOMBRECLIENTE || '').trim(),
      DIRCLIENTE: data.DIRCLIENTE || null,
      CODMUNICIPIO: n('CODMUNICIPIO'),
      CODDEPARTAMENTO: n('CODDEPARTAMENTO'),
      TELEFONOCLIENTE: data.TELEFONOCLIENTE || null,
      EMAILCLIENTE: data.EMAILCLIENTE || null,
      LATITUDCLIENTE: data.LATITUDCLIENTE || null,
      LONGITUDCLIENTE: data.LONGITUDCLIENTE || null,
      CODRUTA: n('CODRUTA'),
      SALDO: n('SALDO'),
      FECHAINICIO: data.FECHAINICIO || null,
      DIAVISITA: data.DIAVISITA || null,
      LIMITECREDITO: n('LIMITECREDITO'),
      DIASCREDITO: n('DIASCREDITO'),
      PROVINCIA: data.PROVINCIA || null,
      TIPONEGOCIO: data.TIPONEGOCIO || null,
      NEGOCIO: data.NEGOCIO || null,
      TIPO: data.TIPO || null,
    };
    if (profile === 'facturacion') {
      delete payload.LATITUDCLIENTE;
      delete payload.LONGITUDCLIENTE;
      delete payload.SALDO;
      delete payload.FECHAINICIO;
      delete payload.LIMITECREDITO;
      delete payload.DIASCREDITO;
    }
    return payload;
  },

  validateForm(data) {
    if (!data.NOMBRECLIENTE) return 'El nombre del cliente es obligatorio';
    if (!data.TIPO) return 'Seleccione el tipo (VENTAS o PROSPECTO)';
    return null;
  },

  async reloadTiposNegocioOptions(selectEl) {
    const empNit = F.getEmpNit() || '';
    if (!empNit || !selectEl) return;
    const current = String(selectEl.value || '').trim();
    const tiposUrl = `/api/tipo-negocios?empnit=${encodeURIComponent(empNit)}&_=${Date.now()}`;
    const tiposRes = await F.fetchJson(tiposUrl, { cache: 'no-store' });
    const tipos = (tiposRes.rows || []).map((t) => ({
      value: String(t.TIPONEGOCIO || '').trim(),
      label: String(t.TIPONEGOCIO || '').trim(),
    }));
    if (this._lookups) this._lookups.tiposNegocio = tipos;
    const opts = ['<option value="">— Seleccione —</option>']
      .concat(
        tipos.map(
          (o) =>
            `<option value="${this.escapeHtml(o.value)}"${
              current === String(o.value) ? ' selected' : ''
            }>${this.escapeHtml(o.label)}</option>`
        )
      )
      .join('');
    selectEl.innerHTML = opts;
    if (current && !tipos.some((t) => t.value === current)) {
      selectEl.value = '';
    }
  },

  async showForm(title, row = {}, isEdit = false, options = {}) {
    const profile = options.profile || 'full';
    try {
      this._lookups = null;
      this._lookupsEmpNit = null;
      await this.loadLookups();
    } catch (err) {
      F.alert('Error', `No se pudieron cargar catálogos: ${err.message}`, 'error');
      return null;
    }
    const view = this;
    return CatalogosUI.fireForm({
      title,
      html: view.buildFormHtml(row, isEdit, profile),
      width: 620,
      didOpen: (popup) => {
        clientesBindNombreSinTildes(popup);
        if (profile === 'facturacion' && !isEdit && typeof DocNitSatLookup !== 'undefined') {
          DocNitSatLookup.bindEnterLookup({
            popup,
            nitFieldName: 'NIT',
            nameFieldName: 'NOMBRECLIENTE',
          });
          popup?.querySelector('[name="NIT"]')?.focus();
        }
        const refreshBtn = popup?.querySelector('#btn-refresh-tipos-negocio');
        const tipoSel = popup?.querySelector('#cliente-tiponegocio-select');
        refreshBtn?.addEventListener('click', async () => {
          refreshBtn.disabled = true;
          const icon = refreshBtn.querySelector('i');
          if (icon) icon.className = 'fa-solid fa-spinner fa-spin';
          try {
            await view.reloadTiposNegocioOptions(tipoSel);
            F.toast('Tipos de negocio actualizados', 'success');
          } catch (err) {
            F.toast(err.message || 'No se pudo actualizar', 'error');
          } finally {
            refreshBtn.disabled = false;
            if (icon) icon.className = 'fa-solid fa-rotate';
          }
        });
      },
      preConfirm() {
        const data = view.readFormData();
        const err = view.validateForm(data);
        if (err) {
          Swal.showValidationMessage(err);
          return false;
        }
        return view.mapFormToApi(data, profile);
      },
    });
  },

  renderTableBodyHtml(rows) {
    const colSpan = this.tableColumns.length + 1;
    if (!rows.length) {
      const msg =
        this._filterQuery.trim() || this._filterHabilitado
          ? 'Ningún cliente coincide con los filtros'
          : 'Sin registros';
      return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const cells = this.tableColumns
          .map((c) => {
            if (c.toggle) {
              return `<td>${this.habilitadoButtonHtml(row)}</td>`;
            }
            return `<td>${this.formatCell(row[c.key], c, row)}</td>`;
          })
          .join('');
        return `<tr>${cells}<td class="text-end">${this.accionesRowHtml(row.CODCLIENTE)}</td></tr>`;
      })
      .join('');
  },

  badgeText() {
    const empNombre = F.getEmpNitNombre();
    const badgeExtra = empNombre ? ` · ${empNombre}` : '';
    const shown = this._rows.length;
    const total = this._totalCount;
    let countLabel;
    if (this._listTruncated && shown < total) {
      countLabel = `Mostrando ${shown} de ${total} cliente(s)`;
    } else {
      countLabel = `${total} cliente(s)`;
    }
    return `<i class="fa-solid fa-users me-1"></i>${countLabel}${this.escapeHtml(badgeExtra)}`;
  },

  updateTableView() {
    const tbody = this._container?.querySelector('#clientes-tbody');
    const badge = this._container?.querySelector('#clientes-count');
    if (tbody) {
      tbody.innerHTML = this.renderTableBodyHtml(this._rows);
      this.bindRowActions();
    }
    if (badge) {
      badge.innerHTML = this.badgeText();
    }
  },

  async fetchList() {
    const data = await F.fetchJson(this.listApiUrl(), { cache: 'no-store' });
    this._rows = data.rows || [];
    this._totalCount = data.total ?? this._rows.length;
    this._listTruncated = Boolean(data.truncated);
    return data;
  },

  renderTable() {
    const headers = [
      ...this.tableColumns.map((c) => `<th scope="col">${this.escapeHtml(c.label)}</th>`),
      '<th scope="col" class="text-end">Acciones</th>',
    ].join('');
    const habOpts = [
      { value: '', label: 'TODOS' },
      { value: 'SI', label: 'ACTIVOS (SI)' },
      { value: 'NO', label: 'INACTIVOS (NO)' },
    ];
    const habSelect = habOpts
      .map(
        (o) =>
          `<option value="${o.value}"${this._filterHabilitado === o.value ? ' selected' : ''}>${o.label}</option>`
      )
      .join('');

    return `
      <div class="marcas-panel catalogo-vista-wrap">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 px-1">
          <span class="marcas-badge" id="clientes-count">${this.badgeText()}</span>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm btn-outline-success" id="btn-clientes-export">
              <i class="fa-solid fa-file-excel me-1"></i>Exportar Excel
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-clientes-refresh">
              <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
            </button>
          </div>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2 px-1 mb-2">
          <label for="clientes-filter-habilitado" class="small text-muted mb-0">Activo:</label>
          <select class="form-select form-select-sm" id="clientes-filter-habilitado" style="max-width: 11rem">
            ${habSelect}
          </select>
          <span class="small text-muted">Sin búsqueda se muestran 50 registros; escriba para buscar en todos.</span>
        </div>
        <div class="marcas-search-wrap px-1 mb-2">
          <div class="input-group input-group-sm marcas-search">
            <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="clientes-search"
              placeholder="Buscar por código, nombre, NIT, negocio, ruta, visita…"
              value="${this.escapeHtml(this._filterQuery)}" autocomplete="off" spellcheck="false">
            <button type="button" class="btn btn-outline-secondary" id="btn-clientes-search-clear"
              title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped">
            <thead><tr>${headers}</tr></thead>
            <tbody id="clientes-tbody">${this.renderTableBodyHtml(this._rows)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-clientes-nuevo')}
      </div>
    `;
  },

  findRow(codcliente) {
    const id = Number(codcliente);
    return this._rows.find((r) => Number(r.CODCLIENTE) === id);
  },

  async onNuevo() {
    const data = await this.showForm('Nuevo cliente');
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Cliente creado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEditar(codcliente) {
    let row = this.findRow(codcliente);
    try {
      row = (await this.fetchClienteDetail(codcliente)) || row;
    } catch (err) {
      if (!row) {
        F.alert('Error', err.message, 'error');
        return;
      }
    }
    if (!row) return;
    const data = await this.showForm('Editar cliente', row, true);
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(codcliente)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Cliente actualizado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEliminar(codcliente) {
    const row = this.findRow(codcliente);
    const nombre = row ? row.NOMBRECLIENTE || codcliente : codcliente;
    const auth = await CatalogosUI.authorizeEliminarRegistro({
      label: nombre,
      tipo: 'cliente',
      kind: 'registro',
      title: '¿Eliminar cliente?',
      html: `<p class="mb-0">Se intentará eliminar a <strong>${this.escapeHtml(nombre)}</strong> (código ${this.escapeHtml(codcliente)}).</p>
        <p class="small text-muted mb-0 mt-2">Si tiene documentos asociados, solo se deshabilitará.</p>`,
      passText: 'Ingrese la clave de administrador para eliminar o deshabilitar al cliente.',
      confirmText: 'Eliminar',
    });
    if (!auth) return;
    try {
      const res = await F.fetchJson(this.apiBase(`/${encodeURIComponent(codcliente)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: auth.pass != null ? String(auth.pass) : '__AUTORIZADO__' }),
      });
      if (res?.action === 'disabled') {
        F.toast(res.message || 'Cliente deshabilitado (tiene documentos)', 'warning');
      } else {
        F.toast('Cliente eliminado', 'success');
      }
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  bindRowActions() {
    this._container.querySelectorAll('.btn-catalogo-ver').forEach((btn) => {
      btn.addEventListener('click', () => this.onVer(btn.dataset.codcliente));
    });
    this._container.querySelectorAll('.btn-catalogo-editar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEditar(btn.dataset.codcliente));
    });
    this._container.querySelectorAll('.btn-catalogo-eliminar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEliminar(btn.dataset.codcliente));
    });
    this.bindHabilitadoButtons();
  },

  bindHabilitadoButtons() {
    if (!this._container) return;
    this._container.querySelectorAll('.btn-empleado-activo[data-codcliente]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.onToggleHabilitado(btn.dataset.codcliente, btn.dataset.habilitado);
      });
    });
  },

  async onToggleHabilitado(codcliente, habilitadoActual) {
    const row = this.findRow(codcliente);
    if (!row) return;
    const actual = this.normalizeHabilitado(habilitadoActual);
    const siguiente = actual === 'SI' ? 'NO' : 'SI';
    const nombre = row.NOMBRECLIENTE || codcliente;
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Cambiar estado habilitado?',
      html: `<p class="mb-0">Cliente <strong>${this.escapeHtml(nombre)}</strong>: cambiar de <strong>${actual}</strong> a <strong>${siguiente}</strong>.</p>`,
      icon: 'question',
      confirmText: 'Cambiar',
    });
    if (!confirm) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(codcliente)}/habilitado`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ HABILITADO: siguiente }),
      });
      row.HABILITADO = siguiente;
      this.updateTableView();
      F.toast(`Estado actualizado a ${siguiente}`, 'success');
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async reloadList() {
    if (!this._container || this._loadingList) return;
    if (
      typeof F !== 'undefined' &&
      typeof F.getActiveMenuKey === 'function' &&
      F.getActiveMenuKey() &&
      F.getActiveMenuKey() !== 'clientes'
    ) {
      return;
    }
    this._loadingList = true;
    const tbody = this._container.querySelector('#clientes-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${this.tableColumns.length + 1}" class="text-center text-muted py-3">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Buscando…</td></tr>`;
    }
    try {
      await this.fetchList();
      if (
        typeof F !== 'undefined' &&
        typeof F.getActiveMenuKey === 'function' &&
        F.getActiveMenuKey() &&
        F.getActiveMenuKey() !== 'clientes'
      ) {
        return;
      }
      this.updateTableView();
    } catch (err) {
      if (
        typeof F !== 'undefined' &&
        typeof F.getActiveMenuKey === 'function' &&
        F.getActiveMenuKey() &&
        F.getActiveMenuKey() !== 'clientes'
      ) {
        return;
      }
      F.toast('Error al cargar clientes', 'error');
      F.alert('Error', err.message, 'error');
    } finally {
      this._loadingList = false;
    }
  },

  bindSearch() {
    const search = document.getElementById('clientes-search');
    const clearBtn = document.getElementById('btn-clientes-search-clear');
    if (!search) return;
    const applyFilter = F.debounce(() => {
      this._filterQuery = search.value;
      this.reloadList();
    }, 350);
    search.addEventListener('input', applyFilter);
    search.addEventListener('search', applyFilter);
    clearBtn?.addEventListener('click', () => {
      search.value = '';
      this._filterQuery = '';
      this.reloadList();
      search.focus();
    });
  },

  bindFilterHabilitado() {
    const sel = document.getElementById('clientes-filter-habilitado');
    if (!sel) return;
    sel.addEventListener('change', () => {
      this._filterHabilitado = sel.value;
      this.reloadList();
    });
  },

  async onExportExcel() {
    const empNit = F.getEmpNit();
    if (!empNit) return;
    const btn = document.getElementById('btn-clientes-export');
    if (btn) btn.disabled = true;
    try {
      const url = `${this.apiBase('/export')}&_=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const blob = await res.blob();
      const dispo = res.headers.get('Content-Disposition') || '';
      const match = dispo.match(/filename="?([^"]+)"?/i);
      const filename = match ? match[1] : `clientes_${empNit}.xlsx`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      F.toast('Excel exportado', 'success');
    } catch (err) {
      F.alert('Error', err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  bindEvents() {
    document.getElementById('btn-clientes-refresh')?.addEventListener('click', () => {
      this._filterQuery = '';
      const search = document.getElementById('clientes-search');
      if (search) search.value = '';
      this.load(this._container);
    });
    document.getElementById('btn-clientes-nuevo')?.addEventListener('click', () => this.onNuevo());
    document.getElementById('btn-clientes-export')?.addEventListener('click', () => this.onExportExcel());
    this.bindSearch();
    this.bindFilterHabilitado();
    this.bindRowActions();
  },

  async load(container) {
    const navToken =
      typeof F !== 'undefined' && typeof F.getMenuNavToken === 'function'
        ? F.getMenuNavToken()
        : 0;
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');

    if (!F.getEmpNit()) {
      if (typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) return;
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100" role="alert">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese seleccionando una empresa.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando clientes…
      </div>
    `;

    try {
      await this.loadLookups();
      if (typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) return;
      await this.fetchList();
      if (typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) return;
      container.innerHTML = this.renderTable();
      this.bindEvents();
    } catch (err) {
      if (typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) return;
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          No se pudo cargar clientes: ${this.escapeHtml(err.message)}
        </div>
      `;
      F.toast('Error al cargar clientes', 'error');
    }
  },
};
