/**
 * Archivo → Autorizaciones
 */
const AutorizacionesView = {
  _container: null,
  _rows: [],
  _unsubLista: null,
  _busyId: null,

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

  isAutorizado(row) {
    return String(row?.AUTORIZADO || 'NO').trim().toUpperCase() === 'SI';
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
    if (!this._rows.length) {
      return `<tr><td colspan="8" class="text-center text-muted py-4">Sin autorizaciones</td></tr>`;
    }
    return this._rows
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

  renderHtml() {
    return `
      <div class="pos-list-wrap w-100">
        <div class="pos-list-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <h2 class="pos-list-title mb-0">Autorizaciones</h2>
            <p class="pos-list-sub text-muted mb-0">${this._rows.length} registro(s)</p>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="authz-reload">
            <i class="fa-solid fa-rotate me-1"></i>Actualizar
          </button>
        </div>
        <div class="card fac-list-table-card shadow-sm mt-3">
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
    if (sub) sub.textContent = `${this._rows.length} registro(s)`;
  },

  async reload() {
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
