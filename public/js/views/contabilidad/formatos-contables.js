/**
 * Vista Formatos Contables — CONTA_FORMATOS + CONTA_FORMATOS_PARTIDAS.
 */
const FC_MONTO_OPTS = [
  { value: '', label: '—' },
  { value: 'TOTAL', label: 'TOTAL' },
  { value: 'SUBTOTAL', label: 'SUBTOTAL' },
  { value: 'IVA', label: 'IVA' },
  { value: 'COSTO', label: 'COSTO' },
];

const FormatosContablesView = {
  _container: null,
  _rows: [],
  _filterQuery: '',
  _formatoId: null,
  _header: null,
  _partidas: [],
  _cuentas: [],

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiUrl(path = '', extra = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    const params = new URLSearchParams({ empnit: emp, ...extra });
    return `/api/formatos-contables${segment}?${params}`;
  },

  getFilteredRows() {
    const q = this._filterQuery.trim().toLowerCase();
    if (!q) return this._rows;
    return this._rows.filter((r) => {
      const hay = [r.CODFORMATO, r.DESFORMATO, r.PARTIDAS]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  },

  isSelected(id) {
    return this._formatoId != null && Number(this._formatoId) === Number(id);
  },

  selectOptionsHtml(options, selected) {
    const sel = String(selected ?? '');
    return options
      .map(
        (o) =>
          `<option value="${this.escapeHtml(o.value)}"${sel === String(o.value) ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
      )
      .join('');
  },

  cuentaLabel(c) {
    const cod = String(c?.CODCUENTA ?? '').trim();
    const desc = String(c?.DESCRIPCION ?? '').trim();
    const pd = String(c?.PD ?? '').trim().toUpperCase() === 'P' ? ' · Padre' : '';
    return desc ? `${cod} — ${desc}${pd}` : `${cod}${pd}`;
  },

  filterCuentas(q) {
    const term = String(q || '').trim().toLowerCase();
    const rows = this._cuentas || [];
    if (!term) return rows.slice(0, 80);
    return rows
      .filter((c) => {
        const hay = `${c.CODCUENTA || ''} ${c.DESCRIPCION || ''}`.toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 80);
  },

  cuentaComboHtml(selected) {
    const sel = String(selected ?? '').trim();
    const found = (this._cuentas || []).find(
      (c) => String(c.CODCUENTA ?? '').trim() === sel
    );
    const display = found ? this.cuentaLabel(found) : sel;
    return `
      <div class="fc-cuenta-combo">
        <input type="search" id="fc-part-cuenta-q" class="form-control form-control-sm"
          placeholder="Buscar por código o nombre…" value="${this.escapeHtml(display)}"
          autocomplete="off" spellcheck="false">
        <input type="hidden" id="fc-part-codcuenta" value="${this.escapeHtml(sel)}">
        <div id="fc-part-cuenta-list" class="list-group fc-cuenta-list" hidden></div>
      </div>
    `;
  },

  bindCuentaCombo(popup) {
    const q = popup?.querySelector('#fc-part-cuenta-q');
    const hidden = popup?.querySelector('#fc-part-codcuenta');
    const list = popup?.querySelector('#fc-part-cuenta-list');
    if (!q || !hidden || !list) return;

    const render = (rows) => {
      if (!rows.length) {
        list.hidden = false;
        list.innerHTML = '<div class="list-group-item small text-muted">Sin coincidencias</div>';
        return;
      }
      list.hidden = false;
      list.innerHTML = rows
        .map((c) => {
          const cod = this.escapeHtml(String(c.CODCUENTA ?? '').trim());
          const active = hidden.value === String(c.CODCUENTA ?? '').trim() ? ' active' : '';
          return `<button type="button" class="list-group-item list-group-item-action py-1${active}" data-cod="${cod}">
            <div class="small fw-semibold">${cod}</div>
            <div class="small text-muted">${this.escapeHtml(c.DESCRIPCION || '')}</div>
          </button>`;
        })
        .join('');
    };

    const pick = (cod) => {
      const found = (this._cuentas || []).find(
        (c) => String(c.CODCUENTA ?? '').trim() === String(cod).trim()
      );
      hidden.value = found ? String(found.CODCUENTA).trim() : '';
      q.value = found ? this.cuentaLabel(found) : '';
      list.hidden = true;
    };

    q.addEventListener('focus', () => render(this.filterCuentas(q.value)));
    q.addEventListener('input', () => {
      hidden.value = '';
      render(this.filterCuentas(q.value));
    });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        list.hidden = true;
        return;
      }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = list.querySelector('[data-cod]');
      if (first) pick(first.getAttribute('data-cod'));
    });
    list.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('[data-cod]');
      if (!btn) return;
      e.preventDefault();
      pick(btn.getAttribute('data-cod'));
    });
    q.addEventListener('blur', () => {
      setTimeout(() => {
        list.hidden = true;
      }, 180);
    });
  },

  bindDebeHaberExclusive(popup) {
    const debeEl = popup?.querySelector('#fc-part-debe');
    const haberEl = popup?.querySelector('#fc-part-haber');
    if (!debeEl || !haberEl) return;
    debeEl.addEventListener('change', () => {
      if (debeEl.value) haberEl.value = '';
    });
    haberEl.addEventListener('change', () => {
      if (haberEl.value) debeEl.value = '';
    });
    if (debeEl.value && haberEl.value) haberEl.value = '';
  },

  async fetchCuentasLookup() {
    if (this._cuentas.length) return this._cuentas;
    const data = await F.fetchJson(this.apiUrl('/cuentas-lookup', { _: Date.now() }), {
      cache: 'no-store',
    });
    this._cuentas = data.rows || [];
    return this._cuentas;
  },

  async fetchList() {
    const data = await F.fetchJson(this.apiUrl('', { _: Date.now() }), { cache: 'no-store' });
    this._rows = data.rows || [];
    return this._rows;
  },

  async fetchPartidas(id) {
    const data = await F.fetchJson(this.apiUrl(`/${id}/partidas`, { _: Date.now() }), {
      cache: 'no-store',
    });
    this._header = data.header || null;
    this._partidas = data.rows || [];
    return data;
  },

  renderListRowsHtml() {
    const rows = this.getFilteredRows();
    if (!rows.length) {
      return `<tr><td colspan="4" class="text-center text-muted py-4">Sin formatos contables</td></tr>`;
    }
    return rows
      .map((r) => {
        const selected = this.isSelected(r.ID);
        return `
        <tr class="fc-list-row${selected ? ' fc-list-row-selected' : ''}" data-id="${r.ID}" role="button" tabindex="0">
          <td class="fw-semibold">${this.escapeHtml(r.CODFORMATO)}</td>
          <td>${this.escapeHtml(r.DESFORMATO)}</td>
          <td class="text-center">${Number(r.PARTIDAS) || 0}</td>
          <td class="text-end text-nowrap" data-no-select="1">
            <button type="button" class="btn btn-sm btn-outline-danger fc-btn" data-action="eliminar" data-id="${r.ID}" title="Eliminar">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>`;
      })
      .join('');
  },

  renderPartidasTableHtml() {
    if (!this._partidas.length) {
      return `<tr><td colspan="6" class="text-center text-muted py-3">Sin partidas — agregue líneas contables</td></tr>`;
    }
    return this._partidas
      .map(
        (p) => `
      <tr>
        <td class="fw-semibold">${this.escapeHtml(p.CODCUENTA)}</td>
        <td>${this.escapeHtml(p.DESCRIPCION_CUENTA || '—')}</td>
        <td>${this.escapeHtml(p.DEBE || '—')}</td>
        <td>${this.escapeHtml(p.HABER || '—')}</td>
        <td class="text-center">${this.escapeHtml(p.CENTRO_COSTO || '—')}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-primary fc-part-btn" data-action="editar-partida" data-id="${p.ID}">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger fc-part-btn" data-action="eliminar-partida" data-id="${p.ID}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>`
      )
      .join('');
  },

  renderDetailPanelHtml() {
    if (!this._formatoId || !this._header) {
      return `
        <div class="fc-detail-empty">
          <i class="fa-solid fa-file-lines fa-2x mb-3 text-muted opacity-50"></i>
          <p class="mb-0 text-muted">Seleccione un formato contable para ver y editar sus partidas</p>
        </div>
      `;
    }
    const h = this._header;
    return `
      <div class="fc-detail-panel-inner">
        <div class="fc-detail-header mb-3">
          <div class="row g-2 align-items-end">
            <div class="col-md-4">
              <label class="form-label small mb-0">Código formato</label>
              <input type="text" class="form-control form-control-sm" id="fc-edit-codformato"
                value="${this.escapeHtml(h.CODFORMATO || '')}" readonly>
            </div>
            <div class="col-md-8">
              <label class="form-label small mb-0" for="fc-edit-desformato">Descripción</label>
              <input type="text" class="form-control form-control-sm" id="fc-edit-desformato"
                value="${this.escapeHtml(h.DESFORMATO || '')}" autocomplete="off">
            </div>
          </div>
          <div class="text-end mt-2">
            <button type="button" class="btn btn-sm btn-primary" id="btn-fc-guardar-header">
              <i class="fa-solid fa-floppy-disk me-1"></i>Guardar descripción
            </button>
          </div>
        </div>
        <div class="fc-detail-partidas">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="small fw-semibold">Partidas contables</span>
            <button type="button" class="btn btn-sm btn-outline-primary" id="btn-fc-nueva-partida">
              <i class="fa-solid fa-plus me-1"></i>Agregar partida
            </button>
          </div>
          <div class="table-responsive fc-partidas-wrap">
            <table class="table table-sm table-hover mb-0">
              <thead class="table-light sticky-top">
                <tr>
                  <th>Cuenta</th>
                  <th>Descripción</th>
                  <th>Debe</th>
                  <th>Haber</th>
                  <th class="text-center">C. costo</th>
                  <th class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody id="fc-partidas-tbody">${this.renderPartidasTableHtml()}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  renderShellHtml() {
    return `
      <div class="formatos-contables-wrap fc-split-layout">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 fc-split-toolbar">
          <span class="catalogo-empresa-badge" id="fc-list-count">
            <i class="fa-solid fa-file-lines me-1"></i>${this._rows.length} formato(s)
          </span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-fc-refresh">
            <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
          </button>
        </div>
        <div class="fc-split-panels">
          <div class="fc-list-panel card shadow-sm">
            <div class="card-header py-2 d-flex justify-content-between align-items-center">
              <span class="small fw-semibold">Formatos</span>
              <button type="button" class="btn btn-sm btn-primary" id="btn-fc-nuevo">
                <i class="fa-solid fa-plus me-1"></i>Nuevo
              </button>
            </div>
            <div class="card-body p-2">
              <div class="input-group input-group-sm mb-2 fc-search">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control" id="fc-search" placeholder="Buscar…"
                  value="${this.escapeHtml(this._filterQuery)}" autocomplete="off">
              </div>
              <div class="table-responsive fc-table-wrap">
                <table class="table table-sm table-hover mb-0">
                  <thead class="table-light sticky-top">
                    <tr>
                      <th>Código</th>
                      <th>Descripción</th>
                      <th class="text-center">Part.</th>
                      <th class="text-end"></th>
                    </tr>
                  </thead>
                  <tbody id="fc-list-tbody">${this.renderListRowsHtml()}</tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="fc-detail-panel card shadow-sm">
            <div class="card-header py-2">
              <span class="small fw-semibold">Partidas del formato</span>
            </div>
            <div class="card-body p-3" id="fc-detail-body">
              ${this.renderDetailPanelHtml()}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  refreshListDom() {
    const tbody = this._container?.querySelector('#fc-list-tbody');
    if (tbody) tbody.innerHTML = this.renderListRowsHtml();
    const countEl = this._container?.querySelector('#fc-list-count');
    if (countEl) {
      countEl.innerHTML = `<i class="fa-solid fa-file-lines me-1"></i>${this._rows.length} formato(s)`;
    }
  },

  refreshDetailDom() {
    const body = this._container?.querySelector('#fc-detail-body');
    if (body) body.innerHTML = this.renderDetailPanelHtml();
    this.bindDetailEvents();
  },

  refreshPartidasDom() {
    const tbody = this._container?.querySelector('#fc-partidas-tbody');
    if (tbody) tbody.innerHTML = this.renderPartidasTableHtml();
    this.syncListPartidasCount();
  },

  syncListPartidasCount() {
    if (!this._formatoId) return;
    const count = this._partidas.length;
    const row = this._rows.find((r) => Number(r.ID) === Number(this._formatoId));
    if (row) row.PARTIDAS = count;
    this.refreshListDom();
  },

  bindListEvents() {
    this._container?.querySelector('#btn-fc-refresh')?.addEventListener('click', () => {
      this._filterQuery = '';
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-fc-nuevo')?.addEventListener('click', () => {
      this.nuevoFormato().catch((err) => F.toast(err.message, 'error'));
    });
    const search = this._container?.querySelector('#fc-search');
    search?.addEventListener('input', () => {
      this._filterQuery = search.value;
      this.refreshListDom();
    });
    this._container?.querySelector('#fc-list-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.fc-btn');
      if (btn) {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (btn.getAttribute('data-action') === 'eliminar') {
          this.eliminarFormato(id).catch((err) => F.toast(err.message, 'error'));
        }
        return;
      }
      const row = e.target.closest('.fc-list-row');
      if (!row || e.target.closest('[data-no-select="1"]')) return;
      const id = row.getAttribute('data-id');
      this.selectFormato(id).catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#fc-list-tbody')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('.fc-list-row');
      if (!row) return;
      e.preventDefault();
      const id = row.getAttribute('data-id');
      this.selectFormato(id).catch((err) => F.toast(err.message, 'error'));
    });
  },

  bindDetailEvents() {
    this._container?.querySelector('#btn-fc-guardar-header')?.addEventListener('click', () => {
      this.guardarHeader().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-fc-nueva-partida')?.addEventListener('click', () => {
      this.nuevaPartida().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#fc-partidas-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.fc-part-btn');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (action === 'editar-partida') this.editarPartida(id).catch((err) => F.toast(err.message, 'error'));
      else if (action === 'eliminar-partida') this.eliminarPartida(id).catch((err) => F.toast(err.message, 'error'));
    });
  },

  bindEvents() {
    this.bindListEvents();
    this.bindDetailEvents();
  },

  async selectFormato(id, { skipFetch = false } = {}) {
    const n = Number(id);
    if (!n) return;
    this._formatoId = n;
    if (!skipFetch) {
      await this.fetchPartidas(n);
    }
    this.refreshListDom();
    this.refreshDetailDom();
  },

  clearSelection() {
    this._formatoId = null;
    this._header = null;
    this._partidas = [];
    this.refreshListDom();
    this.refreshDetailDom();
  },

  async reload() {
    const prevId = this._formatoId;
    await this.fetchList();
    if (prevId && this._rows.some((r) => Number(r.ID) === Number(prevId))) {
      await this.selectFormato(prevId);
    } else {
      this.clearSelection();
    }
    this.refreshListDom();
  },

  async renderAll() {
    this._container.innerHTML = this.renderShellHtml();
    this.bindEvents();
  },

  async nuevoFormato() {
    const html = `
      <div class="fc-form-grid fc-form-nuevo text-start">
        <p class="small text-muted mb-3">Defina el código y la descripción del formato contable. Después podrá agregar las partidas en el panel derecho.</p>
        <div class="row g-3">
          <div class="col-md-5">
            <label class="form-label mb-1" for="fc-new-codformato">Código formato</label>
            <input type="text" id="fc-new-codformato" class="form-control" autocomplete="off" required
              placeholder="Ej. VENTASCON">
          </div>
          <div class="col-md-7">
            <label class="form-label mb-1" for="fc-new-desformato">Descripción</label>
            <input type="text" id="fc-new-desformato" class="form-control" autocomplete="off" required
              placeholder="Ej. VENTAS AL CONTADO">
          </div>
        </div>
      </div>
    `;
    const ok = await CatalogosUI.fireForm({
      title: 'Nuevo formato contable',
      html,
      width: 820,
      customClass: {
        popup: 'modal-catalogo fc-modal-nuevo',
      },
      preConfirm: () => {
        const codformato = document.getElementById('fc-new-codformato')?.value?.trim() || '';
        const desformato = document.getElementById('fc-new-desformato')?.value?.trim() || '';
        if (!codformato) {
          Swal.showValidationMessage('El código es obligatorio');
          return false;
        }
        if (!desformato) {
          Swal.showValidationMessage('La descripción es obligatoria');
          return false;
        }
        const dup = this._rows.some(
          (r) => String(r.CODFORMATO ?? '').trim().toUpperCase() === codformato.toUpperCase()
        );
        if (dup) {
          Swal.showValidationMessage(`Ya existe el formato "${codformato}"`);
          return false;
        }
        return { CODFORMATO: codformato, DESFORMATO: desformato };
      },
    });
    if (!ok) return;
    const created = await F.fetchJson(this.apiUrl(''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ok),
    });
    F.toast('Formato creado', 'success');
    await this.fetchList();
    this.refreshListDom();
    await this.selectFormato(created.ID);
  },

  async guardarHeader() {
    const desformato = this._container?.querySelector('#fc-edit-desformato')?.value?.trim() || '';
    if (!desformato) {
      F.toast('La descripción es obligatoria', 'warning');
      return;
    }
    await F.fetchJson(this.apiUrl(`/${this._formatoId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ DESFORMATO: desformato }),
    });
    this._header = { ...this._header, DESFORMATO: desformato };
    const row = this._rows.find((r) => Number(r.ID) === Number(this._formatoId));
    if (row) row.DESFORMATO = desformato;
    this.refreshListDom();
    F.toast('Formato actualizado', 'success');
  },

  async partidaForm(title, row = {}) {
    await this.fetchCuentasLookup();
    const html = `
      <div class="fc-form-grid text-start">
        <div class="mb-2">
          <label class="form-label small mb-0" for="fc-part-cuenta-q">Cuenta contable</label>
          ${this.cuentaComboHtml(row.CODCUENTA)}
        </div>
        <div class="row g-2 mb-1">
          <div class="col-sm-6">
            <label class="form-label small mb-0" for="fc-part-debe">Debe</label>
            <select id="fc-part-debe" class="form-select form-select-sm">
              ${this.selectOptionsHtml(FC_MONTO_OPTS, row.DEBE || '')}
            </select>
          </div>
          <div class="col-sm-6">
            <label class="form-label small mb-0" for="fc-part-haber">Haber</label>
            <select id="fc-part-haber" class="form-select form-select-sm">
              ${this.selectOptionsHtml(FC_MONTO_OPTS, row.HABER || '')}
            </select>
          </div>
        </div>
        <p class="small text-muted mb-2">Solo un lado por línea. Si la cuenta va en Debe y Haber, agréguela dos veces.</p>
        <div class="mb-0">
          <label class="form-label small mb-0" for="fc-part-centro">Centro de costo</label>
          <input type="text" id="fc-part-centro" class="form-control form-control-sm" maxlength="3"
            value="${this.escapeHtml(row.CENTRO_COSTO ?? '1')}" autocomplete="off">
        </div>
      </div>
    `;
    return CatalogosUI.fireForm({
      title,
      html,
      width: 560,
      customClass: { popup: 'modal-catalogo fc-partida-modal' },
      didOpen: (popup) => {
        this.bindCuentaCombo(popup);
        this.bindDebeHaberExclusive(popup);
      },
      preConfirm: () => {
        const codcuenta = document.getElementById('fc-part-codcuenta')?.value?.trim() || '';
        const debe = document.getElementById('fc-part-debe')?.value?.trim() || '';
        const haber = document.getElementById('fc-part-haber')?.value?.trim() || '';
        const centro = document.getElementById('fc-part-centro')?.value?.trim() || '1';
        if (!codcuenta) {
          Swal.showValidationMessage('Seleccione una cuenta');
          return false;
        }
        if (!debe && !haber) {
          Swal.showValidationMessage('Indique Debe o Haber');
          return false;
        }
        if (debe && haber) {
          Swal.showValidationMessage(
            'Una línea no puede tener Debe y Haber. Agregue la cuenta otra vez en una segunda línea'
          );
          return false;
        }
        return { CODCUENTA: codcuenta, DEBE: debe, HABER: haber, CENTRO_COSTO: centro };
      },
    });
  },

  async nuevaPartida() {
    const payload = await this.partidaForm('Nueva partida contable');
    if (!payload) return;
    await F.fetchJson(this.apiUrl(`/${this._formatoId}/partidas`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    F.toast('Partida agregada', 'success');
    await this.fetchPartidas(this._formatoId);
    this.refreshPartidasDom();
  },

  async editarPartida(partidaId) {
    const row = this._partidas.find((p) => Number(p.ID) === Number(partidaId));
    if (!row) return;
    const payload = await this.partidaForm('Editar partida contable', row);
    if (!payload) return;
    await F.fetchJson(this.apiUrl(`/partidas/${partidaId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    F.toast('Partida actualizada', 'success');
    await this.fetchPartidas(this._formatoId);
    this.refreshPartidasDom();
  },

  async eliminarPartida(partidaId) {
    const row = this._partidas.find((p) => Number(p.ID) === Number(partidaId));
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Eliminar partida?',
      html: `<p class="mb-0">Cuenta <strong>${this.escapeHtml(row?.CODCUENTA || partidaId)}</strong></p>`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!ok) return;
    await F.fetchJson(this.apiUrl(`/partidas/${partidaId}`), { method: 'DELETE' });
    F.toast('Partida eliminada', 'success');
    await this.fetchPartidas(this._formatoId);
    this.refreshPartidasDom();
  },

  async eliminarFormato(id) {
    const row = this._rows.find((r) => Number(r.ID) === Number(id));
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Eliminar formato contable?',
      html: `<p class="mb-0"><strong>${this.escapeHtml(row?.DESFORMATO || row?.CODFORMATO || id)}</strong></p>`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!ok) return;
    const pass = await CatalogosUI.solicitarClaveAdmin({
      title: 'Autorizar eliminación',
      text: 'Ingrese la clave de administrador para eliminar el formato.',
      confirmText: 'Eliminar',
    });
    if (!pass) return;
    await F.fetchJson(this.apiUrl(`/${id}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass: String(pass) }),
    });
    F.toast('Formato eliminado', 'success');
    if (Number(this._formatoId) === Number(id)) this.clearSelection();
    await this.fetchList();
    this.refreshListDom();
  },

  async load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center', 'p-3');
    container.classList.add('align-items-stretch', 'justify-content-start', 'fc-main-host');
    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</div>`;
    try {
      await this.fetchList();
      await this.renderAll();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger m-3">${this.escapeHtml(err.message)}</div>`;
      F.toast(err.message, 'error');
    }
  },
};
