/**
 * Vista Recibos de Caja CXC (documento PRC).
 */
const RecibosCajaCxcView = {
  _container: null,
  _screen: 'list', // list | editor
  _rows: [],
  _listFecha: '',
  _listFilter: '',
  _tipos: [],
  _recibo: null,
  _pendingDocs: [],
  _pendingQuery: '',
  _clienteSuggest: [],
  _loading: false,
  _saving: false,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  todayIsoDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).slice(0, 10);
    const [y, m, d] = s.split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
    return s;
  },

  usuario() {
    const u = F.session('user');
    return u?.username || u?.usuario || 'CXC';
  },

  emp() {
    return F.getEmpNit();
  },

  api(path, extra = {}) {
    const params = new URLSearchParams({ empnit: this.emp(), _: String(Date.now()), ...extra });
    return `/api/recibos-caja-cxc${path}?${params}`;
  },

  header() {
    return this._recibo?.header || null;
  },

  abonos() {
    return this._recibo?.abonos || [];
  },

  editable() {
    return Boolean(this.header()?.EDITABLE);
  },

  clienteBloqueado() {
    return this.editable() && this.abonos().length > 0;
  },

  abonosSum() {
    return this.abonos().reduce((s, a) => s + (Number(a.ABONO) || 0), 0);
  },

  liveTotal() {
    if (this.editable()) return this.abonosSum();
    return Number(this.header()?.TOTALPRECIO) || 0;
  },

  preserveMemoriaAbonos(nextRecibo) {
    const mem = this.editable() ? this.abonos().map((a) => ({ ...a })) : null;
    this._recibo = nextRecibo;
    if (this.editable() && mem) this._recibo.abonos = mem;
  },

  async load(container) {
    this._container = container;
    this._screen = 'list';
    this._recibo = null;
    this._listFecha = this.todayIsoDate();
    this._listFilter = '';
    this._pendingDocs = [];
    this._pendingQuery = '';
    try {
      const data = await F.fetchJson(this.api('/tipos'), { cache: 'no-store' });
      this._tipos = data.rows || [];
    } catch {
      this._tipos = [];
    }
    await this.refreshList();
  },

  async refreshList() {
    this._loading = true;
    this.render();
    try {
      const data = await F.fetchJson(
        this.api('', { fecha: this._listFecha, q: this._listFilter, limit: '300' }),
        { cache: 'no-store' }
      );
      this._rows = data.rows || [];
    } catch (err) {
      this._rows = [];
      F.toast(err.message || 'No se pudo cargar el listado', 'error');
    } finally {
      this._loading = false;
      this.render();
    }
  },

  async openRecibo(coddoc, correlativo) {
    this._loading = true;
    this.render();
    try {
      const data = await F.fetchJson(
        this.api(`/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}`),
        { cache: 'no-store' }
      );
      this._recibo = data.recibo;
      this._screen = 'editor';
      this._pendingDocs = [];
      this._pendingQuery = '';
      // Borrador: facturas/abonos solo viven en memoria hasta finalizar.
      if (this._recibo?.header?.EDITABLE) this._recibo.abonos = [];
      if (this._recibo?.header?.CODCLIENTE) {
        await this.loadPendientes(this._recibo.header.CODCLIENTE);
      }
    } catch (err) {
      F.toast(err.message || 'No se pudo abrir el recibo', 'error');
    } finally {
      this._loading = false;
      this.render();
    }
  },

  async loadPendientes(codcliente) {
    if (!codcliente) {
      this._pendingDocs = [];
      return;
    }
    try {
      const data = await F.fetchJson(
        this.api(`/clientes/${encodeURIComponent(codcliente)}/facturas-pendientes`, {
          q: this._pendingQuery || '',
          limit: '200',
        }),
        { cache: 'no-store' }
      );
      this._pendingDocs = data.rows || [];
    } catch (err) {
      this._pendingDocs = [];
      F.toast(err.message || 'No se pudieron cargar facturas pendientes', 'error');
    }
  },

  render() {
    if (!this._container) return;
    this._container.innerHTML =
      this._screen === 'editor' ? this.renderEditor() : this.renderList();
    this.bindEvents();
  },

  estadoBadge(row) {
    if (row.FINALIZADO) return '<span class="badge bg-success">Finalizado</span>';
    if (row.EDITABLE) return '<span class="badge bg-warning text-dark">Edición</span>';
    return `<span class="badge bg-secondary">${this.escapeHtml(row.STATUS || '—')}</span>`;
  },

  renderList() {
    const body = this._loading
      ? `<tr><td colspan="7" class="text-center text-muted py-4">Cargando…</td></tr>`
      : !this._rows.length
        ? `<tr><td colspan="7" class="text-center text-muted py-4">Sin recibos PRC en esta fecha</td></tr>`
        : this._rows
            .map((r) => {
              const canPrint = Boolean(r.FINALIZADO);
              return `<tr class="prc-list-row" data-coddoc="${this.escapeHtml(r.CODDOC)}" data-corr="${this.escapeHtml(r.CORRELATIVO)}" style="cursor:pointer">
        <td class="fw-semibold text-nowrap">${this.escapeHtml(r.CODDOC)} #${this.escapeHtml(r.CORRELATIVO)}</td>
        <td>${this.escapeHtml(r.DOC_NOMCLIE || r.NEGOCIO || '—')}</td>
        <td class="small">${this.escapeHtml(r.DOC_NIT || '—')}</td>
        <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
        <td>${this.estadoBadge(r)}</td>
        <td class="small">${this.escapeHtml(r.USUARIO || '—')}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-secondary prc-btn-print me-1"
            data-coddoc="${this.escapeHtml(r.CODDOC)}" data-corr="${this.escapeHtml(r.CORRELATIVO)}"
            title="${canPrint ? 'Imprimir recibo' : 'Solo recibos finalizados'}"
            ${canPrint ? '' : 'disabled'}>
            <i class="fa-solid fa-print"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-primary prc-btn-open"
            data-coddoc="${this.escapeHtml(r.CODDOC)}" data-corr="${this.escapeHtml(r.CORRELATIVO)}">Abrir</button>
        </td>
      </tr>`;
            })
            .join('');
    return `
      <div class="pos-list-wrap prc-wrap">
        <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-1"><i class="fa-solid fa-cash-register me-2 text-primary"></i>Recibos de Caja CXC</h2>
            <p class="text-muted small mb-0">Recibos PRC — abonos a varias facturas con forma de pago e impacto en caja</p>
          </div>
        </div>
        <div class="fac-list-toolbar mb-3">
          <div class="fac-list-toolbar-fecha">
            <label class="form-label small mb-1" for="prc-list-fecha">Fecha</label>
            <input type="date" class="form-control form-control-sm" id="prc-list-fecha"
              value="${this.escapeHtml(this._listFecha)}">
          </div>
          <div class="fac-list-toolbar-search flex-grow-1">
            <label class="form-label small mb-1" for="prc-list-search">Buscar</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input type="search" class="form-control" id="prc-list-search"
                placeholder="Documento, cliente, NIT…" value="${this.escapeHtml(this._listFilter)}" autocomplete="off">
            </div>
          </div>
        </div>
        <div class="card shadow-sm">
          <div class="table-responsive">
            <table class="table table-sm table-hover mb-0 align-middle">
              <thead class="table-light">
                <tr>
                  <th>Documento</th>
                  <th>Cliente</th>
                  <th>NIT</th>
                  <th class="text-end">Total</th>
                  <th>Estado</th>
                  <th>Usuario</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </div>
        <button type="button" class="btn-onneb-nuevo-fab pos-list-fab-nuevo" id="prc-btn-nuevo"
          aria-label="Nuevo recibo" title="Nuevo recibo"${this._tipos.length ? '' : ' disabled'}>
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>`;
  },

  renderPendingHtml() {
    const editable = this.editable();
    const body = !this.header()?.CODCLIENTE
      ? `<tr><td colspan="5" class="text-center text-muted py-5">Seleccione un cliente</td></tr>`
      : !this._pendingDocs.length
        ? `<tr><td colspan="5" class="text-center text-muted py-5">Sin facturas pendientes</td></tr>`
        : this._pendingDocs
            .map((d) => {
              const already = this.abonos().some(
                (a) =>
                  String(a.CODDOC_FAC) === String(d.CODDOC) &&
                  String(a.CORRELATIVO_FAC) === String(d.CORRELATIVO)
              );
              return `<tr>
          <td class="fw-semibold text-nowrap small">${this.escapeHtml(d.CODDOC)} #${this.escapeHtml(d.CORRELATIVO)}</td>
          <td class="small text-nowrap">${this.escapeHtml(this.formatFecha(d.FECHA))}</td>
          <td class="text-end small text-muted">${this.escapeHtml(this.formatMoney(d.TOTALPRECIO))}</td>
          <td class="text-end fw-semibold small text-primary">${this.escapeHtml(this.formatMoney(d.DOC_SALDO))}</td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-outline-success prc-add-fac"
              data-coddoc="${this.escapeHtml(d.CODDOC)}" data-corr="${this.escapeHtml(d.CORRELATIVO)}"
              data-saldo="${this.escapeHtml(d.DOC_SALDO)}" ${!editable || already ? 'disabled' : ''}>
              <i class="fa-solid fa-plus"></i>
            </button>
          </td>
        </tr>`;
            })
            .join('');
    return `
      <div class="card shadow-sm prc-editor-panel">
        <div class="card-header py-2">
          <strong class="small"><i class="fa-solid fa-file-invoice-dollar me-1"></i>Facturas pendientes</strong>
          <div class="input-group input-group-sm mt-2">
            <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="prc-pending-search"
              placeholder="Buscar factura…" value="${this.escapeHtml(this._pendingQuery)}"
              ${this.header()?.CODCLIENTE ? '' : 'disabled'}>
          </div>
        </div>
        <div class="card-body">
          <div class="table-responsive prc-panel-scroll">
            <table class="table table-sm table-striped mb-0">
              <thead class="table-light sticky-top">
                <tr>
                  <th>Factura</th>
                  <th>Fecha</th>
                  <th class="text-end">Total</th>
                  <th class="text-end">Saldo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  renderAbonosHtml() {
    const editable = this.editable();
    const rows = this.abonos();
    const body = !rows.length
      ? `<tr><td colspan="5" class="text-center text-muted py-5">Sin abonos. Agregue facturas de la izquierda.</td></tr>`
      : rows
          .map((a, idx) => {
            const monto = editable
              ? `<input type="number" class="form-control form-control-sm text-end prc-abono-monto" data-idx="${idx}"
                  min="0.01" step="0.01" value="${this.escapeHtml(a.ABONO)}"
                  max="${this.escapeHtml(a.FAC_DOC_SALDO || a.ABONO)}">`
              : this.escapeHtml(this.formatMoney(a.ABONO));
            const remove = editable
              ? `<button type="button" class="btn btn-sm btn-outline-danger prc-abono-remove" data-idx="${idx}"><i class="fa-solid fa-xmark"></i></button>`
              : '';
            return `<tr>
          <td class="fw-semibold text-nowrap small">${this.escapeHtml(a.CODDOC_FAC)} #${this.escapeHtml(a.CORRELATIVO_FAC)}</td>
          <td class="small text-nowrap">${this.escapeHtml(this.formatFecha(a.FAC_FECHA))}</td>
          <td class="text-end small text-muted">${this.escapeHtml(this.formatMoney(a.FAC_DOC_SALDO))}</td>
          <td class="text-end" style="min-width:6.5rem">${monto}</td>
          <td class="text-end">${remove}</td>
        </tr>`;
          })
          .join('');
    return `
      <div class="card shadow-sm prc-editor-panel">
        <div class="card-header py-2 d-flex justify-content-between align-items-center">
          <strong class="small"><i class="fa-solid fa-list-check me-1"></i>Facturas abonadas</strong>
          <span class="fw-bold text-success">${this.escapeHtml(this.formatMoney(this.abonosSum()))}</span>
        </div>
        <div class="card-body">
          <div class="table-responsive prc-panel-scroll">
            <table class="table table-sm table-striped mb-0">
              <thead class="table-light sticky-top">
                <tr>
                  <th>Factura</th>
                  <th>Fecha</th>
                  <th class="text-end">Saldo</th>
                  <th class="text-end">Abono</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  renderEditor() {
    const h = this.header() || {};
    const editable = this.editable();
    const clienteLocked = this.clienteBloqueado();
    const clienteLabel = h.CODCLIENTE
      ? `${h.DOC_NOMCLIE || h.NEGOCIO || 'Cliente'} (${h.DOC_NIT || 'CF'})`
      : '';
    return `
      <div class="prc-editor-wrap">
        <div class="card shadow-sm prc-editor-header">
          <div class="card-body py-2">
            <div class="d-flex flex-wrap align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary" id="prc-btn-atras">
                <i class="fa-solid fa-arrow-left me-1"></i>Atrás
              </button>
              <div class="fw-semibold">${this.escapeHtml(h.CODDOC || '')} #${this.escapeHtml(h.CORRELATIVO || '')}</div>
              ${this.estadoBadge(h)}
              ${
                h.CODCAJA
                  ? `<span class="badge text-bg-light border">Caja ${this.escapeHtml(h.CODCAJA)}</span>`
                  : ''
              }
              <div class="ms-auto d-flex flex-wrap align-items-end gap-2">
                <div>
                  <label class="form-label small mb-0" for="prc-doc-fecha">Fecha</label>
                  <input type="date" class="form-control form-control-sm" id="prc-doc-fecha"
                    value="${this.escapeHtml(h.FECHA || this.todayIsoDate())}" ${editable ? '' : 'disabled'}>
                </div>
                <div class="text-end">
                  <div class="small text-muted">Total</div>
                  <div class="h5 mb-0 text-success" id="prc-header-total">${this.escapeHtml(this.formatMoney(this.liveTotal()))}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card shadow-sm prc-editor-meta">
          <div class="card-body py-2">
            <div class="row g-2 align-items-end">
              <div class="col-12 col-md-6 position-relative">
                <label class="form-label small mb-0" for="prc-cliente-search">Cliente</label>
                <input type="search" class="form-control form-control-sm" id="prc-cliente-search"
                  placeholder="Nombre, NIT o patrón con %…" value="${this.escapeHtml(clienteLabel)}"
                  ${editable && !clienteLocked ? '' : 'disabled'} autocomplete="off"
                  ${clienteLocked ? 'title="Quite las facturas abonadas para cambiar de cliente"' : ''}>
                ${
                  clienteLocked
                    ? `<div class="form-text small mb-0">Cliente bloqueado. Quite las facturas abonadas para cambiarlo.</div>`
                    : ''
                }
                <div id="prc-cliente-suggest" class="list-group position-absolute w-100 shadow-sm prc-suggest d-none"></div>
              </div>
              <div class="col-12 col-md-4">
                <label class="form-label small mb-0" for="prc-obs">Observaciones</label>
                <input type="text" class="form-control form-control-sm" id="prc-obs"
                  value="${this.escapeHtml(h.OBS || '')}" ${editable ? '' : 'disabled'}>
              </div>
              <div class="col-12 col-md-2 d-flex gap-2 justify-content-md-end">
                ${
                  editable
                    ? `<button type="button" class="btn btn-sm btn-outline-secondary" id="prc-btn-guardar-meta">Guardar</button>
                       <button type="button" class="btn btn-sm btn-outline-danger" id="prc-btn-eliminar" title="Eliminar borrador"><i class="fa-solid fa-trash"></i></button>`
                    : `<button type="button" class="btn btn-sm btn-outline-danger" id="prc-btn-eliminar" title="Eliminar (admin)"><i class="fa-solid fa-trash"></i></button>`
                }
              </div>
            </div>
          </div>
        </div>

        <div class="prc-editor-main">
          ${this.renderPendingHtml()}
          ${this.renderAbonosHtml()}
        </div>

        <div class="prc-editor-actions">
        ${
          editable
            ? `<div class="d-flex justify-content-end">
          <button type="button" class="btn btn-primary" id="prc-btn-finalizar"
            ${this.abonos().length ? '' : 'disabled'}>
            <i class="fa-solid fa-check me-1"></i>Finalizar recibo
          </button>
        </div>`
            : `<div class="alert alert-light border small mb-0">
          Recibo finalizado. Caja: ${this.escapeHtml(h.CODCAJA || '—')} ·
          Efectivo ${this.escapeHtml(this.formatMoney(h.FPAGO_EFECTIVO))} ·
          Tarjeta ${this.escapeHtml(this.formatMoney(h.FPAGO_TARJETA))} ·
          Depósito ${this.escapeHtml(this.formatMoney(h.FPAGO_DEPOSITO))} ·
          Cheque ${this.escapeHtml(this.formatMoney(h.FPAGO_CHEQUE))}
        </div>`
        }
        </div>
      </div>`;
  },

  bindEvents() {
    if (this._screen === 'list') {
      this._container?.querySelector('#prc-list-fecha')?.addEventListener('change', (e) => {
        this._listFecha = e.target.value || this.todayIsoDate();
        this.refreshList();
      });
      let searchTimer = null;
      this._container?.querySelector('#prc-list-search')?.addEventListener('input', (e) => {
        this._listFilter = e.target.value || '';
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => this.refreshList(), 300);
      });
      this._container?.querySelector('#prc-btn-nuevo')?.addEventListener('click', () => {
        this.onNuevo().catch((err) => F.toast(err.message, 'error'));
      });
      this._container?.querySelectorAll('.prc-btn-print').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const coddoc = btn.getAttribute('data-coddoc');
          const corr = btn.getAttribute('data-corr');
          if (!coddoc || corr == null) return;
          this.imprimirDesdeListado(coddoc, corr).catch((err) =>
            F.toast(err.message || 'No se pudo imprimir', 'error')
          );
        });
      });
      this._container?.querySelectorAll('.prc-btn-open, .prc-list-row').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('button') && !el.classList.contains('prc-btn-open')) return;
          const btn = el.classList.contains('prc-btn-open') ? el : null;
          const coddoc = (btn || el).getAttribute('data-coddoc');
          const corr = (btn || el).getAttribute('data-corr');
          if (coddoc && corr) this.openRecibo(coddoc, corr);
        });
      });
      return;
    }

    this._container?.querySelector('#prc-btn-atras')?.addEventListener('click', () => {
      this._screen = 'list';
      this._recibo = null;
      this.refreshList();
    });

    this._container?.querySelector('#prc-btn-guardar-meta')?.addEventListener('click', () => {
      this.saveMeta().catch((err) => F.toast(err.message, 'error'));
    });

    this._container?.querySelector('#prc-doc-fecha')?.addEventListener('change', () => {
      this.saveMeta().catch((err) => F.toast(err.message, 'error'));
    });

    let clienteTimer = null;
    const clienteInp = this._container?.querySelector('#prc-cliente-search');
    clienteInp?.addEventListener('input', () => {
      if (this.clienteBloqueado()) {
        F.toast('Quite las facturas abonadas para cambiar de cliente', 'warning');
        return;
      }
      clearTimeout(clienteTimer);
      clienteTimer = setTimeout(() => this.searchClientes(clienteInp.value).catch(() => {}), 250);
    });

    let pendingTimer = null;
    this._container?.querySelector('#prc-pending-search')?.addEventListener('input', (e) => {
      this._pendingQuery = e.target.value || '';
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(async () => {
        const mem = this.abonos().map((a) => ({ ...a }));
        await this.loadPendientes(this.header()?.CODCLIENTE);
        if (this._recibo) this._recibo.abonos = mem;
        this.render();
      }, 250);
    });

    this._container?.querySelectorAll('.prc-add-fac').forEach((btn) => {
      btn.addEventListener('click', () => {
        const coddoc = btn.getAttribute('data-coddoc');
        const corr = Number(btn.getAttribute('data-corr'));
        const saldo = Number(btn.getAttribute('data-saldo')) || 0;
        if (!coddoc || !corr) return;
        if (!this.header()?.CODCLIENTE) {
          F.toast('Seleccione un cliente primero', 'warning');
          return;
        }
        const exists = this.abonos().some(
          (a) => String(a.CODDOC_FAC) === String(coddoc) && Number(a.CORRELATIVO_FAC) === corr
        );
        if (exists) return;
        const doc = this._pendingDocs.find(
          (d) => String(d.CODDOC) === String(coddoc) && Number(d.CORRELATIVO) === corr
        );
        this._recibo.abonos = [
          ...this.abonos(),
          {
            CODDOC_FAC: coddoc,
            CORRELATIVO_FAC: corr,
            ABONO: saldo,
            FAC_DOC_SALDO: saldo,
            FAC_FECHA: doc?.FECHA || null,
            DOC_NOMCLIE: doc?.DOC_NOMCLIE || null,
          },
        ];
        this.render();
      });
    });

    this._container?.querySelectorAll('.prc-abono-monto').forEach((inp) => {
      const sync = () => {
        const idx = Number(inp.getAttribute('data-idx'));
        const val = Number(inp.value);
        if (!this._recibo?.abonos?.[idx]) return;
        this._recibo.abonos[idx].ABONO = Number.isFinite(val) ? val : 0;
        const totalEl = this._container?.querySelector('#prc-header-total');
        const sumEl = this._container?.querySelector('.prc-editor-panel .fw-bold.text-success');
        const money = this.formatMoney(this.abonosSum());
        if (totalEl) totalEl.textContent = money;
        if (sumEl) sumEl.textContent = money;
      };
      inp.addEventListener('input', sync);
      inp.addEventListener('change', sync);
    });

    this._container?.querySelectorAll('.prc-abono-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'));
        this._recibo.abonos = this.abonos().filter((_, i) => i !== idx);
        this.render();
      });
    });

    this._container?.querySelector('#prc-btn-finalizar')?.addEventListener('click', () => {
      this.onFinalizar().catch((err) => F.toast(err.message, 'error'));
    });

    this._container?.querySelector('#prc-btn-eliminar')?.addEventListener('click', () => {
      this.onEliminar().catch((err) => F.toast(err.message, 'error'));
    });
  },

  async searchClientes(q) {
    if (this.clienteBloqueado()) return;
    const box = this._container?.querySelector('#prc-cliente-suggest');
    if (!box) return;
    const query = String(q || '').trim();
    const minLen = query.includes('%') || query.includes('_') ? 1 : 2;
    if (query.length < minLen) {
      box.classList.add('d-none');
      box.innerHTML = '';
      return;
    }
    const params = new URLSearchParams({
      empnit: this.emp(),
      q: query,
      limit: '15',
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/clientes?${params}`, { cache: 'no-store' });
    const rows = data.rows || data.clientes || [];
    if (!rows.length) {
      box.innerHTML = `<div class="list-group-item small text-muted">Sin resultados</div>`;
      box.classList.remove('d-none');
      return;
    }
    box.innerHTML = rows
      .map((c) => {
        const label = `${c.NOMBRECLIENTE || c.NEGOCIO || 'Cliente'} — ${c.NIT || 'CF'}`;
        return `<button type="button" class="list-group-item list-group-item-action small prc-pick-cliente"
          data-cod="${this.escapeHtml(c.CODCLIENTE)}">${this.escapeHtml(label)}</button>`;
      })
      .join('');
    box.classList.remove('d-none');
    box.querySelectorAll('.prc-pick-cliente').forEach((btn) => {
      btn.addEventListener('click', async () => {
        box.classList.add('d-none');
        try {
          await this.setCliente(btn.getAttribute('data-cod'));
        } catch (err) {
          F.toast(err.message, 'error');
        }
      });
    });
  },

  async setCliente(codcliente) {
    const h = this.header();
    if (!h) return;
    if (this.clienteBloqueado()) {
      F.toast('Quite las facturas abonadas para cambiar de cliente', 'warning');
      return;
    }
    const res = await F.fetchJson(
      `/api/recibos-caja-cxc/${encodeURIComponent(h.CODDOC)}/${h.CORRELATIVO}?empnit=${encodeURIComponent(this.emp())}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CODCLIENTE: Number(codcliente) }),
      }
    );
    this._recibo = res.recibo;
    this._recibo.abonos = [];
    this._pendingQuery = '';
    await this.loadPendientes(this._recibo.header.CODCLIENTE);
    this.render();
    F.toast('Cliente actualizado', 'success');
  },

  async saveMeta() {
    const h = this.header();
    if (!h?.EDITABLE) return;
    const fecha = this._container.querySelector('#prc-doc-fecha')?.value;
    const obs = this._container.querySelector('#prc-obs')?.value || '';
    const res = await F.fetchJson(
      `/api/recibos-caja-cxc/${encodeURIComponent(h.CODDOC)}/${h.CORRELATIVO}?empnit=${encodeURIComponent(this.emp())}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ FECHA: fecha, OBS: obs }),
      }
    );
    this.preserveMemoriaAbonos(res.recibo);
    F.toast('Datos guardados', 'success');
    this.render();
  },

  readAbonosFromDom() {
    const list = this.abonos().map((a) => ({ ...a }));
    this._container?.querySelectorAll('.prc-abono-monto').forEach((inp) => {
      const idx = Number(inp.getAttribute('data-idx'));
      if (!list[idx]) return;
      list[idx].ABONO = Number(inp.value) || 0;
    });
    return list
      .filter((a) => Number(a.ABONO) > 0)
      .map((a) => ({
        CODDOC_FAC: a.CODDOC_FAC,
        CORRELATIVO_FAC: a.CORRELATIVO_FAC,
        ABONO: Number(a.ABONO),
      }));
  },

  async onNuevo() {
    if (!this._tipos.length) {
      F.toast('No hay tipo de documento PRC activo. Créelo en Tipos de documento.', 'warning');
      return;
    }

    let cajas = [];
    let cajaDefault = null;
    try {
      const cajasData = await F.fetchJson(
        this.api('/cajas-abiertas', { codempleado: F.sessionCodEmpleado?.() ?? '' }),
        { cache: 'no-store' }
      );
      cajas = cajasData.cajas || cajasData.rows || [];
      cajaDefault = cajasData.cajaDefault ?? null;
    } catch (err) {
      F.toast(err.message || 'No se pudieron cargar las cajas', 'error');
      return;
    }
    if (!cajas.length) {
      F.toast('No hay cajas abiertas. Abra una caja antes de crear el recibo.', 'warning');
      return;
    }

    const preferredCaja = F.pickCajaDefault
      ? F.pickCajaDefault(cajas, cajaDefault)
      : cajas[0]?.CODCAJA;
    const tipoOptions = this._tipos
      .map((t) => {
        const label = t.DESDOC ? `${t.CODDOC} — ${t.DESDOC}` : t.CODDOC;
        const sel = String(t.CODDOC) === String(this._tipos[0].CODDOC) ? ' selected' : '';
        return `<option value="${this.escapeHtml(t.CODDOC)}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
    const cajaOptions = cajas
      .map((c) => {
        const label = c.DESCAJA ? `${c.DESCAJA} (${c.CODCAJA})` : `Caja ${c.CODCAJA}`;
        const sel = String(c.CODCAJA) === String(preferredCaja) ? ' selected' : '';
        return `<option value="${this.escapeHtml(c.CODCAJA)}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');

    const { isConfirmed, value } = await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: 'Nuevo recibo PRC',
      html: `
        <div class="text-start">
          <label class="form-label small mb-0" for="prc-nuevo-coddoc">Tipo de documento</label>
          <select id="prc-nuevo-coddoc" class="form-select form-select-sm mb-2"
            ${this._tipos.length === 1 ? 'disabled' : ''}>${tipoOptions}</select>
          <label class="form-label small mb-0" for="prc-nuevo-caja">Caja</label>
          <select id="prc-nuevo-caja" class="form-select form-select-sm">${cajaOptions}</select>
          <p class="small text-muted mb-0 mt-2">La caja quedará asociada al recibo desde su creación.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.aceptarButtonHtml('Crear') : 'Crear',
      cancelButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.cancelButtonHtml('Cancelar') : 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const coddoc = String(document.getElementById('prc-nuevo-coddoc')?.value || '').trim();
        const CODCAJA = Number(document.getElementById('prc-nuevo-caja')?.value);
        if (!coddoc) {
          Swal.showValidationMessage('Seleccione un tipo de documento');
          return false;
        }
        if (!Number.isFinite(CODCAJA) || CODCAJA <= 0) {
          Swal.showValidationMessage('Seleccione una caja abierta');
          return false;
        }
        return { CODDOC: coddoc, CODCAJA };
      },
    });
    if (!isConfirmed || !value) return;

    const res = await F.fetchJson(`/api/recibos-caja-cxc?empnit=${encodeURIComponent(this.emp())}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        CODDOC: value.CODDOC,
        CODCAJA: value.CODCAJA,
        FECHA: this._listFecha || this.todayIsoDate(),
        USUARIO: this.usuario(),
      }),
    });
    this._recibo = res.recibo;
    if (this._recibo) this._recibo.abonos = [];
    this._screen = 'editor';
    this._pendingDocs = [];
    this.render();
    F.toast('Recibo creado', 'success');
  },

  async onFinalizar() {
    const h = this.header();
    if (!h?.EDITABLE) return;
    const abonos = this.readAbonosFromDom();
    if (!abonos.length) {
      F.toast('Agregue al menos un abono a facturas', 'warning');
      return;
    }
    this._recibo.abonos = abonos.map((a) => {
      const prev = this.abonos().find(
        (x) =>
          String(x.CODDOC_FAC) === String(a.CODDOC_FAC) &&
          Number(x.CORRELATIVO_FAC) === Number(a.CORRELATIVO_FAC)
      );
      return { ...(prev || {}), ...a };
    });
    const total = abonos.reduce((s, a) => s + (Number(a.ABONO) || 0), 0);
    if (total <= 0) {
      F.toast('El total del recibo debe ser mayor a cero', 'warning');
      return;
    }

    const cajasData = await F.fetchJson(this.api('/cajas-abiertas', {
      codempleado: F.sessionCodEmpleado?.() ?? '',
    }), { cache: 'no-store' });
    const cajas = cajasData.cajas || cajasData.rows || [];
    if (!cajas.length) {
      F.toast('No hay cajas abiertas', 'warning');
      return;
    }
    const preferred =
      (h.CODCAJA && cajas.some((c) => Number(c.CODCAJA) === Number(h.CODCAJA))
        ? h.CODCAJA
        : null) ??
      (F.pickCajaDefault ? F.pickCajaDefault(cajas, cajasData.cajaDefault) : cajas[0]?.CODCAJA);
    const cajaOptions = cajas
      .map((c) => {
        const label = c.DESCAJA ? `${c.DESCAJA} (${c.CODCAJA})` : `Caja ${c.CODCAJA}`;
        const sel = String(c.CODCAJA) === String(preferred) ? ' selected' : '';
        return `<option value="${this.escapeHtml(c.CODCAJA)}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');

    const { isConfirmed, value } = await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: 'Finalizar recibo',
      html: `
        <p class="small text-muted mb-2">Total a cobrar: <strong>${this.escapeHtml(this.formatMoney(total))}</strong></p>
        <label class="form-label small mb-0 text-start d-block" for="prc-fin-caja">Caja</label>
        <select id="prc-fin-caja" class="form-select form-select-sm mb-2">${cajaOptions}</select>
        <div class="row g-2">
          <div class="col-6">
            <label class="form-label small mb-0">Efectivo</label>
            <input type="number" id="prc-fin-efe" class="form-control form-control-sm" min="0" step="0.01" value="${total}">
          </div>
          <div class="col-6">
            <label class="form-label small mb-0">Tarjeta</label>
            <input type="number" id="prc-fin-tar" class="form-control form-control-sm" min="0" step="0.01" value="0">
          </div>
          <div class="col-6">
            <label class="form-label small mb-0">Depósito</label>
            <input type="number" id="prc-fin-dep" class="form-control form-control-sm" min="0" step="0.01" value="0">
          </div>
          <div class="col-6">
            <label class="form-label small mb-0">Cheque</label>
            <input type="number" id="prc-fin-che" class="form-control form-control-sm" min="0" step="0.01" value="0">
          </div>
        </div>
        <label class="form-label small mb-0 mt-2 text-start d-block" for="prc-fin-desc">Detalle pago</label>
        <input type="text" id="prc-fin-desc" class="form-control form-control-sm">
        <p class="small text-end mt-2 mb-0" id="prc-fin-sum">Suma: ${this.escapeHtml(this.formatMoney(total))}</p>
      `,
      showCancelButton: true,
      confirmButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.guardarButtonHtml('Finalizar') : 'Finalizar',
      cancelButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.cancelButtonHtml('Cancelar') : 'Cancelar',
      focusConfirm: false,
      didOpen: () => {
        const update = () => {
          const sum =
            (Number(document.getElementById('prc-fin-efe')?.value) || 0) +
            (Number(document.getElementById('prc-fin-tar')?.value) || 0) +
            (Number(document.getElementById('prc-fin-dep')?.value) || 0) +
            (Number(document.getElementById('prc-fin-che')?.value) || 0);
          const el = document.getElementById('prc-fin-sum');
          if (el) el.textContent = `Suma: ${this.formatMoney(sum)}`;
        };
        ['prc-fin-efe', 'prc-fin-tar', 'prc-fin-dep', 'prc-fin-che'].forEach((id) => {
          document.getElementById(id)?.addEventListener('input', update);
        });
      },
      preConfirm: () => {
        const CODCAJA = Number(document.getElementById('prc-fin-caja')?.value);
        const FPAGO_EFECTIVO = Number(document.getElementById('prc-fin-efe')?.value) || 0;
        const FPAGO_TARJETA = Number(document.getElementById('prc-fin-tar')?.value) || 0;
        const FPAGO_DEPOSITO = Number(document.getElementById('prc-fin-dep')?.value) || 0;
        const FPAGO_CHEQUE = Number(document.getElementById('prc-fin-che')?.value) || 0;
        const sum = FPAGO_EFECTIVO + FPAGO_TARJETA + FPAGO_DEPOSITO + FPAGO_CHEQUE;
        if (!CODCAJA) {
          Swal.showValidationMessage('Seleccione una caja');
          return false;
        }
        if (Math.abs(sum - total) > 0.001) {
          Swal.showValidationMessage('La suma de formas de pago debe igualar el total');
          return false;
        }
        return {
          CODCAJA,
          FPAGO_EFECTIVO,
          FPAGO_TARJETA,
          FPAGO_DEPOSITO,
          FPAGO_CHEQUE,
          FPAGO_DESCRIPCION: document.getElementById('prc-fin-desc')?.value || '',
          abonos,
        };
      },
    });
    if (!isConfirmed || !value) return;

    const res = await F.fetchJson(
      `/api/recibos-caja-cxc/${encodeURIComponent(h.CODDOC)}/${h.CORRELATIVO}/finalizar?empnit=${encodeURIComponent(this.emp())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      }
    );
    const reciboFinal = res.recibo;
    F.toast(
      `Recibo ${reciboFinal?.header?.CODDOC}-${reciboFinal?.header?.CORRELATIVO} finalizado`,
      'success'
    );
    this._screen = 'list';
    this._recibo = null;
    await this.refreshList();
    try {
      await this.imprimirRecibo(reciboFinal);
    } catch (err) {
      F.toast(err.message || 'No se pudo imprimir el recibo', 'warning');
    }
  },

  async imprimirDesdeListado(coddoc, correlativo) {
    const data = await F.fetchJson(
      this.api(`/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}`),
      { cache: 'no-store' }
    );
    const recibo = data.recibo;
    if (!recibo?.header?.FINALIZADO) {
      F.toast('Solo se pueden imprimir recibos finalizados', 'warning');
      return;
    }
    await this.imprimirRecibo(recibo);
  },

  async imprimirRecibo(recibo) {
    if (typeof DocPrint === 'undefined') {
      F.toast('Impresión no disponible', 'warning');
      return;
    }
    const h = recibo?.header || {};
    const abonos = recibo?.abonos || [];
    await DocPrint.printReciboPagoCliente({
      abono: {
        CODDOC: h.CODDOC,
        CORRELATIVO: h.CORRELATIVO,
        TOTALPRECIO: h.TOTALPRECIO,
        STATUS: h.STATUS,
      },
      facturas: abonos.map((a) => ({
        CODDOC: a.CODDOC_FAC,
        CORRELATIVO: a.CORRELATIVO_FAC,
        ABONO: a.ABONO,
        DOC_SALDO: a.FAC_DOC_SALDO,
      })),
      fpago: {
        FPAGO_EFECTIVO: h.FPAGO_EFECTIVO,
        FPAGO_TARJETA: h.FPAGO_TARJETA,
        FPAGO_DEPOSITO: h.FPAGO_DEPOSITO,
        FPAGO_CHEQUE: h.FPAGO_CHEQUE,
        FPAGO_DESCRIPCION: h.FPAGO_DESCRIPCION,
      },
      cliente: h.DOC_NOMCLIE || h.NEGOCIO || '—',
      nit: h.DOC_NIT || '',
      usuario: h.USUARIO || this.usuario(),
      fecha: h.FECHA || this.todayIsoDate(),
      monto: h.TOTALPRECIO,
      obs: h.OBS || '',
    });
  },

  async onEliminar() {
    const h = this.header();
    if (!h) return;
    const label = `${h.CODDOC} #${h.CORRELATIVO}`;

    if (typeof CatalogosUI === 'undefined') {
      F.toast('No se puede autorizar la eliminación', 'error');
      return;
    }
    const pass = await CatalogosUI.confirmEliminarDocumento({
      label,
      tipo: h.FINALIZADO ? 'recibo finalizado' : 'recibo',
      kind: 'documento',
      coddoc: h.CODDOC,
      correlativo: h.CORRELATIVO,
      tipodoc: h.TIPODOC || 'PRC',
    });
    if (!pass) return;

    await F.fetchJson(
      `/api/recibos-caja-cxc/${encodeURIComponent(h.CODDOC)}/${h.CORRELATIVO}?empnit=${encodeURIComponent(this.emp())}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pass: String(pass),
          USUARIO: String(F.session('user')?.usuario || '').trim() || undefined,
        }),
      }
    );
    F.toast('Recibo eliminado', 'success');
    this._screen = 'list';
    this._recibo = null;
    await this.refreshList();
  },
};
