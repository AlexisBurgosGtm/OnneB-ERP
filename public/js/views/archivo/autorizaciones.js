/**
 * Archivo → Autorizaciones
 */
const AutorizacionesView = {
  _container: null,
  _rows: [],
  _unsubLista: null,
  _busyId: null,
  _filterMes: null,
  _filterAnio: null,
  _filterAutorizado: 'NO',
  _filterQ: '',

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  usuario() {
    const u = F.session('user');
    return u?.username || u?.CODIGO || u?.codempleado || 'USER';
  },

  formatFecha(value) {
    if (!value) return '—';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${String(value.getDate()).padStart(2, '0')}/${String(value.getMonth() + 1).padStart(2, '0')}/${value.getFullYear()}`;
    }
    const s = String(value).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return String(value);
  },

  fechaParts(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return { anio: value.getFullYear(), mes: value.getMonth() + 1, dia: value.getDate() };
    }
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return { anio: d.getFullYear(), mes: d.getMonth() + 1, dia: d.getDate() };
  },

  isAutorizado(row) {
    return String(row?.AUTORIZADO || 'NO').trim().toUpperCase() === 'SI';
  },

  ensureDefaultFilters() {
    const now = new Date();
    if (!Number.isFinite(this._filterMes) || this._filterMes < 1 || this._filterMes > 12) {
      this._filterMes = now.getMonth() + 1;
    }
    if (!Number.isFinite(this._filterAnio) || this._filterAnio < 2000) {
      this._filterAnio = now.getFullYear();
    }
  },

  mesOptionsHtml() {
    const names = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return names
      .map((label, i) => {
        const mes = i + 1;
        const sel = mes === Number(this._filterMes) ? ' selected' : '';
        return `<option value="${mes}"${sel}>${label}</option>`;
      })
      .join('');
  },

  anioOptionsHtml() {
    const nowY = new Date().getFullYear();
    const years = [];
    for (let y = nowY + 1; y >= nowY - 8; y -= 1) years.push(y);
    if (!years.includes(Number(this._filterAnio))) years.push(Number(this._filterAnio));
    years.sort((a, b) => b - a);
    return years
      .map((y) => {
        const sel = y === Number(this._filterAnio) ? ' selected' : '';
        return `<option value="${y}"${sel}>${y}</option>`;
      })
      .join('');
  },

  readFiltersFromDom() {
    const mesEl = this._container?.querySelector('#authz-mes');
    const anioEl = this._container?.querySelector('#authz-anio');
    const autEl = this._container?.querySelector('#authz-autorizado');
    const qEl = this._container?.querySelector('#authz-search');
    if (mesEl) this._filterMes = Number(mesEl.value) || this._filterMes;
    if (anioEl) this._filterAnio = Number(anioEl.value) || this._filterAnio;
    if (autEl) this._filterAutorizado = String(autEl.value || '').trim().toUpperCase();
    if (qEl) this._filterQ = String(qEl.value || '').trim();
  },

  filteredRows() {
    this.ensureDefaultFilters();
    const mes = Number(this._filterMes);
    const anio = Number(this._filterAnio);
    const aut = String(this._filterAutorizado || '').trim().toUpperCase();
    const q = String(this._filterQ || '').trim().toLowerCase();

    return (this._rows || []).filter((r) => {
      const parts = this.fechaParts(r.FECHA);
      if (!parts || parts.mes !== mes || parts.anio !== anio) return false;

      const isSi = this.isAutorizado(r);
      if (aut === 'SI' && !isSi) return false;
      if (aut === 'NO' && isSi) return false;

      if (!q) return true;
      const hay = [
        r.ID,
        this.formatFecha(r.FECHA),
        r.HORA,
        r.TIPO,
        r.DESCRIPCION,
        r.USUARIO,
        isSi ? 'SI' : 'NO',
        r.USUARIOAUTORIZA,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  },

  async fetchData() {
    this._rows = await AutorizacionesUI.listar();
    return this._rows;
  },

  renderBadge(row) {
    const ok = this.isAutorizado(row);
    if (ok) {
      return `<span class="badge text-bg-success">SI</span>`;
    }
    return `<button type="button" class="badge text-bg-danger border-0 authz-badge-btn"
      data-id="${this.escapeHtml(row.ID)}" title="Clic para autorizar">NO</button>`;
  },

  renderTableBody() {
    const rows = this.filteredRows();
    if (!this._rows.length) {
      return `<tr><td colspan="8" class="text-center text-muted py-4">Sin autorizaciones</td></tr>`;
    }
    if (!rows.length) {
      return `<tr><td colspan="8" class="text-center text-muted py-4">No hay registros con los filtros aplicados</td></tr>`;
    }
    return rows
      .map((r) => {
        const busy = String(this._busyId) === String(r.ID);
        return `
        <tr data-id="${this.escapeHtml(r.ID)}">
          <td class="text-nowrap">${this.escapeHtml(r.ID)}</td>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
          <td class="text-nowrap">${this.escapeHtml(r.HORA || '—')}</td>
          <td>${this.escapeHtml(r.TIPO || '—')}</td>
          <td class="small">${this.escapeHtml(r.DESCRIPCION || '—')}</td>
          <td>${this.escapeHtml(r.USUARIO || '—')}</td>
          <td class="text-center">${busy ? '<i class="fa-solid fa-spinner fa-spin"></i>' : this.renderBadge(r)}</td>
          <td>${this.escapeHtml(r.USUARIOAUTORIZA || '—')}</td>
        </tr>`;
      })
      .join('');
  },

  badgeText() {
    const filtered = this.filteredRows().length;
    const total = this._rows.length;
    if (filtered === total) return `${total} registro(s)`;
    return `${filtered} de ${total} registro(s)`;
  },

  renderHtml() {
    this.ensureDefaultFilters();
    const aut = String(this._filterAutorizado || '').toUpperCase();
    const qVal = this.escapeHtml(this._filterQ || '');
    return `
      <div class="pos-list-wrap w-100">
        <div class="pos-list-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <h2 class="pos-list-title mb-0">Autorizaciones</h2>
            <p class="pos-list-sub text-muted mb-0">${this.escapeHtml(this.badgeText())}</p>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="authz-reload">
            <i class="fa-solid fa-rotate me-1"></i>Actualizar
          </button>
        </div>
        <div class="authz-toolbar d-flex flex-wrap align-items-end gap-2 mt-3 mb-2">
          <div class="authz-filter-mes">
            <label for="authz-mes" class="form-label small mb-1">Mes</label>
            <select id="authz-mes" class="form-select form-select-sm">
              ${this.mesOptionsHtml()}
            </select>
          </div>
          <div class="authz-filter-anio">
            <label for="authz-anio" class="form-label small mb-1">Año</label>
            <select id="authz-anio" class="form-select form-select-sm">
              ${this.anioOptionsHtml()}
            </select>
          </div>
          <div class="authz-filter-autorizado">
            <label for="authz-autorizado" class="form-label small mb-1">Autorizada</label>
            <select id="authz-autorizado" class="form-select form-select-sm">
              <option value=""${aut === '' ? ' selected' : ''}>Todos</option>
              <option value="NO"${aut === 'NO' ? ' selected' : ''}>NO</option>
              <option value="SI"${aut === 'SI' ? ' selected' : ''}>SI</option>
            </select>
          </div>
          <div class="authz-filter-search flex-grow-1">
            <label for="authz-search" class="form-label small mb-1">Buscar</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
              <input type="search" id="authz-search" class="form-control"
                placeholder="Tipo, descripción, usuario…" value="${qVal}" autocomplete="off">
            </div>
          </div>
        </div>
        <div class="card fac-list-table-card shadow-sm">
          <div class="table-responsive fac-list-table-scroll">
            <table class="table table-sm table-hover table-striped mb-0 align-middle">
              <thead class="table-light sticky-top">
                <tr>
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th>Usuario</th>
                  <th class="text-center">Autorizado</th>
                  <th>Usuario autoriza</th>
                </tr>
              </thead>
              <tbody id="authz-tbody">${this.renderTableBody()}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  refreshTable() {
    const tbody = this._container?.querySelector('#authz-tbody');
    if (tbody) tbody.innerHTML = this.renderTableBody();
    const sub = this._container?.querySelector('.pos-list-sub');
    if (sub) sub.textContent = this.badgeText();
  },

  async reload() {
    this.readFiltersFromDom();
    await this.fetchData();
    this.refreshTable();
  },

  async onAutorizar(id) {
    const row = this._rows.find((r) => String(r.ID) === String(id));
    if (!row) return;
    if (this.isAutorizado(row)) {
      F.toast('Esta autorización ya fue otorgada', 'info');
      return;
    }
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Autorizar?',
      text: `Se autorizará #${row.ID} (${row.TIPO || '—'}) solicitado por ${row.USUARIO || '—'}.`,
      icon: 'question',
      confirmText: 'Autorizar',
    });
    if (!ok) return;
    this._busyId = id;
    this.refreshTable();
    try {
      await AutorizacionesUI.autorizar(id, this.usuario());
      F.toast('Autorización otorgada', 'success');
      await this.reload();
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo autorizar', 'error');
      await this.reload();
    } finally {
      this._busyId = null;
    }
  },

  bindEvents() {
    this._container?.querySelector('#authz-reload')?.addEventListener('click', () => {
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });

    const applyFilters = () => {
      this.readFiltersFromDom();
      this.refreshTable();
    };

    this._container?.querySelector('#authz-mes')?.addEventListener('change', applyFilters);
    this._container?.querySelector('#authz-anio')?.addEventListener('change', applyFilters);
    this._container?.querySelector('#authz-autorizado')?.addEventListener('change', applyFilters);

    const search = this._container?.querySelector('#authz-search');
    if (search) {
      const onSearch = F.debounce ? F.debounce(applyFilters, 200) : applyFilters;
      search.addEventListener('input', onSearch);
      search.addEventListener('search', applyFilters);
    }

    this._container?.querySelector('#authz-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.authz-badge-btn');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (id) this.onAutorizar(id).catch((err) => F.toast(err.message, 'error'));
    });
  },

  async load(container) {
    if (this._unsubLista) {
      this._unsubLista();
      this._unsubLista = null;
    }
    this._container = container;
    this._filterAutorizado = 'NO';
    this._filterQ = '';
    this._filterMes = null;
    this._filterAnio = null;
    this.ensureDefaultFilters();
    container.className = 'main-content flex-grow-1 d-flex p-3 align-items-stretch justify-content-start';
    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-0 w-100">
          No hay empresa activa. Cierre sesión e ingrese de nuevo.
        </div>`;
      return;
    }
    AutorizacionesUI.bindSocket();
    container.innerHTML = `
      <div class="text-center text-muted py-5 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando autorizaciones…
      </div>`;
    try {
      await this.fetchData();
      container.innerHTML = this.renderHtml();
      this.bindEvents();
      this._unsubLista = AutorizacionesUI.onListaChange(() => {
        this.reload().catch(() => {});
      });
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-0 w-100">
          ${this.escapeHtml(err.message || 'Error al cargar autorizaciones')}
        </div>`;
    }
  },
};
