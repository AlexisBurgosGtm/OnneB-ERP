/**
 * Online Services → Traslados en tránsito (COMMUNITY_DOCUMENTOS).
 * Listado general; eliminar solo empresa PRINCIPAL (clave admin).
 */
const TrasladosEnTransitoView = {
  _container: null,
  _rows: [],
  _origenes: [],
  _canDelete: false,
  _filterOrigen: '',
  _filterQ: '',

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatFecha(row) {
    try {
      if (typeof DocFecha !== 'undefined' && DocFecha.formatDisplay) {
        const anio = Number(row?.ANIO);
        const mes = Number(row?.MES);
        const dia = Number(row?.DIA);
        if (
          Number.isFinite(anio) &&
          Number.isFinite(mes) &&
          Number.isFinite(dia) &&
          mes >= 1 &&
          mes <= 12 &&
          dia >= 1
        ) {
          return DocFecha.formatDisplay(row);
        }
        if (row?.FECHA) return DocFecha.formatDisplay(row.FECHA);
      }
    } catch {
      /* ignore */
    }
    const f = row?.FECHA;
    if (!f) return '—';
    const s = String(f);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    const dt = new Date(f);
    if (Number.isNaN(dt.getTime())) return '—';
    const day = String(dt.getUTCDate()).padStart(2, '0');
    const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${dt.getUTCFullYear()}`;
  },

  setBusy(btn, busy, htmlWhenIdle) {
    if (!btn) return;
    if (busy) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.dataset.prevHtml = btn.innerHTML;
      btn.innerHTML =
        '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
    } else {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (htmlWhenIdle != null) btn.innerHTML = htmlWhenIdle;
      else if (btn.dataset.prevHtml) btn.innerHTML = btn.dataset.prevHtml;
    }
  },

  readFiltersFromDom() {
    const origenSel = this._container?.querySelector('#os-tt-origen');
    const searchInp = this._container?.querySelector('#os-tt-search');
    if (origenSel) this._filterOrigen = String(origenSel.value || '').trim();
    if (searchInp) this._filterQ = String(searchInp.value || '').trim();
  },

  filteredRows() {
    const origen = String(this._filterOrigen || '').trim().toUpperCase();
    const q = String(this._filterQ || '').trim().toLowerCase();
    return (this._rows || []).filter((r) => {
      const emp = String(r.EMPNIT || '').trim().toUpperCase();
      if (origen && emp !== origen) return false;
      if (!q) return true;
      const destino =
        r.OBSMARCA && String(r.OBSMARCA).trim().toUpperCase() !== 'SN'
          ? String(r.OBSMARCA)
          : String(r.CODEMBARQUE || '');
      const hay = [
        r.EMPNIT,
        destino,
        r.CODDOC,
        r.CORRELATIVO,
        r.USUARIO,
        r.OBS,
        this.formatFecha(r),
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  },

  origenOptionsHtml() {
    const selected = String(this._filterOrigen || '').trim().toUpperCase();
    const opts = [`<option value="">Todos</option>`];
    for (const r of this._origenes || []) {
      const emp = String(r.EMPNIT || '').trim();
      if (!emp) continue;
      const nombre = String(r.EMPNOMBRE || '').trim();
      const label = nombre ? `${emp} — ${nombre}` : emp;
      const sel = emp.toUpperCase() === selected ? ' selected' : '';
      opts.push(
        `<option value="${this.escapeHtml(emp)}"${sel}>${this.escapeHtml(label)}</option>`
      );
    }
    return opts.join('');
  },

  renderLoadingHtml() {
    return `
      <div class="pos-list-wrap os-tt-wrap">
        <div class="pos-list-header">
          <h2 class="pos-list-title">Traslados en tránsito</h2>
          <p class="pos-list-sub text-muted mb-0">Online Services · nube comunitaria</p>
        </div>
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status"></div>
          <p class="small text-muted mt-2 mb-0">Consultando traslados en la nube…</p>
        </div>
      </div>`;
  },

  renderTableHtml() {
    const rows = this.filteredRows();
    if (!this._rows.length) {
      return `<p class="text-muted text-center py-4 mb-0">No hay traslados en tránsito en la nube.</p>`;
    }
    if (!rows.length) {
      return `<p class="text-muted text-center py-4 mb-0">No hay traslados con los filtros aplicados.</p>`;
    }
    const delCol = this._canDelete;
    return `
      <div class="table-responsive os-tt-table-scroll">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Origen</th>
              <th>Destino</th>
              <th>Documento</th>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Obs.</th>
              <th class="text-end">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((r) => {
                const origen = this.escapeHtml(r.EMPNIT || '—');
                const destino = this.escapeHtml(
                  r.OBSMARCA && String(r.OBSMARCA).trim().toUpperCase() !== 'SN'
                    ? r.OBSMARCA
                    : r.CODEMBARQUE || '—'
                );
                const coddoc = this.escapeHtml(r.CODDOC || '');
                const corr = this.escapeHtml(r.CORRELATIVO);
                return `<tr
                  data-origen="${origen}"
                  data-coddoc="${coddoc}"
                  data-correlativo="${corr}">
                  <td class="small">${origen}</td>
                  <td class="small">${destino}</td>
                  <td class="small text-nowrap fw-semibold">${coddoc} #${corr}</td>
                  <td class="small text-nowrap">${this.escapeHtml(this.formatFecha(r))}</td>
                  <td class="small">${this.escapeHtml(r.USUARIO || '—')}</td>
                  <td class="small text-truncate" style="max-width:10rem" title="${this.escapeHtml(r.OBS || '')}">${this.escapeHtml(r.OBS || '—')}</td>
                  <td class="text-end text-nowrap">
                    <button type="button" class="btn btn-sm btn-outline-primary me-1" data-action="detalle" title="Ver detalles">
                      <i class="fa-solid fa-list me-1"></i>Ver
                    </button>
                    ${
                      delCol
                        ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="eliminar" title="Eliminar de la nube">
                      <i class="fa-solid fa-trash me-1"></i>Eliminar
                    </button>`
                        : ''
                    }
                  </td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>`;
  },

  badgeText() {
    const filtered = this.filteredRows().length;
    const total = this._rows.length;
    const base =
      filtered === total
        ? `${total} documento(s) en la nube`
        : `${filtered} de ${total} documento(s)`;
    return `Online Services · ${base}${
      this._canDelete ? ' · puede eliminar (empresa principal)' : ''
    }`;
  },

  renderHtml() {
    const qVal = this.escapeHtml(this._filterQ || '');
    return `
      <div class="pos-list-wrap os-tt-wrap">
        <div class="pos-list-header d-flex flex-wrap align-items-start justify-content-between gap-2">
          <div>
            <h2 class="pos-list-title">Traslados en tránsito</h2>
            <p class="pos-list-sub text-muted mb-0">${this.escapeHtml(this.badgeText())}</p>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="os-tt-refresh">
            <i class="fa-solid fa-rotate me-1" aria-hidden="true"></i>Actualizar
          </button>
        </div>
        <div class="os-tt-toolbar d-flex flex-wrap align-items-end gap-2 mb-3">
          <div class="os-tt-filter-origen">
            <label for="os-tt-origen" class="form-label small mb-1">Origen</label>
            <select id="os-tt-origen" class="form-select form-select-sm">
              ${this.origenOptionsHtml()}
            </select>
          </div>
          <div class="os-tt-filter-search flex-grow-1">
            <label for="os-tt-search" class="form-label small mb-1">Buscar</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
              <input type="search" id="os-tt-search" class="form-control" placeholder="Documento, destino, usuario, obs…"
                value="${qVal}" autocomplete="off">
            </div>
          </div>
        </div>
        <div id="os-tt-table" class="os-tt-table-host">${this.renderTableHtml()}</div>
      </div>`;
  },

  refreshTableDom() {
    const table = this._container?.querySelector('#os-tt-table');
    if (table) table.innerHTML = this.renderTableHtml();
    const sub = this._container?.querySelector('.pos-list-sub');
    if (sub) sub.textContent = this.badgeText();
  },

  async fetchOrigenes() {
    try {
      const data = await F.fetchJson(`/api/community/empresas-sync?_=${Date.now()}`, {
        cache: 'no-store',
      });
      this._origenes = data.rows || [];
    } catch (err) {
      console.warn('[TrasladosEnTransito] origenes:', err?.message || err);
      this._origenes = [];
    }
    return this._origenes;
  },

  async fetchList() {
    const empnit = encodeURIComponent(F.getEmpNit() || '');
    const data = await F.fetchJson(
      `/api/community/traslados-transito?empnit=${empnit}&_=${Date.now()}`,
      { cache: 'no-store', headers: { 'x-emp-nit': F.getEmpNit() || '' } }
    );
    this._rows = data.rows || [];
    this._canDelete = Boolean(data.canDelete);
    return this._rows;
  },

  async refresh() {
    const btn = this._container?.querySelector('#os-tt-refresh');
    this.readFiltersFromDom();
    this.setBusy(btn, true);
    try {
      await Promise.all([this.fetchList(), this.fetchOrigenes()]);
      const origenSel = this._container?.querySelector('#os-tt-origen');
      if (origenSel) origenSel.innerHTML = this.origenOptionsHtml();
      this.refreshTableDom();
    } catch (err) {
      F.toast(err.message || 'No se pudieron cargar traslados', 'error');
    } finally {
      this.setBusy(
        btn,
        false,
        '<i class="fa-solid fa-rotate me-1" aria-hidden="true"></i>Actualizar'
      );
    }
  },

  async verDetalle(origenEmpnit, coddoc, correlativo, triggerBtn) {
    this.setBusy(triggerBtn, true);
    const label = `${coddoc} #${correlativo}`;
    try {
      const q = new URLSearchParams({
        empnit: F.getEmpNit() || '',
        origenEmpnit: String(origenEmpnit || ''),
        coddoc: String(coddoc || ''),
        correlativo: String(correlativo),
        _: String(Date.now()),
      });
      const data = await F.fetchJson(`/api/community/traslados-transito/detalle?${q}`, {
        cache: 'no-store',
        headers: { 'x-emp-nit': F.getEmpNit() || '' },
      });
      this.setBusy(triggerBtn, false);
      const h = data.header || {};
      const lines = data.lines || [];
      const origenNombre = String(h.EMPNOMBRE || '').trim();
      const origenEmp = String(h.EMPNIT || origenEmpnit || '').trim();
      const origenLabel = origenNombre || origenEmp || '—';
      const destino =
        h.OBSMARCA && String(h.OBSMARCA).trim().toUpperCase() !== 'SN'
          ? h.OBSMARCA
          : h.CODEMBARQUE || '—';
      const tableHtml = !lines.length
        ? `<p class="text-muted mb-0 text-center py-3">Sin productos.</p>`
        : `<div class="table-responsive" style="max-height:22rem">
            <table class="table table-sm table-hover align-middle mb-0 text-start">
              <thead class="table-light">
                <tr>
                  <th>Producto</th>
                  <th>Medida</th>
                  <th class="text-end">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                ${lines
                  .map(
                    (ln) => `<tr>
                  <td>${this.escapeHtml(ln.DESPROD || '')}<br><small class="text-muted">${this.escapeHtml(ln.CODPROD || '')}</small></td>
                  <td class="small">${this.escapeHtml(ln.CODMEDIDA || '')}</td>
                  <td class="small text-end">${Number(ln.CANTIDAD) || 0}</td>
                </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>`;

      await Swal.fire({
        ...CatalogosUI.modalBase(),
        title: 'Detalle del traslado',
        html: `
          <div class="text-start small mb-3">
            <p class="mb-1"><strong>Documento:</strong> ${this.escapeHtml(label)}</p>
            <p class="mb-1"><strong>Origen:</strong> ${this.escapeHtml(origenLabel)}</p>
            <p class="mb-1"><strong>Destino:</strong> ${this.escapeHtml(destino)}</p>
            <p class="mb-1"><strong>Fecha:</strong> ${this.escapeHtml(this.formatFecha(h))}</p>
            <p class="mb-1"><strong>Usuario:</strong> ${this.escapeHtml(h.USUARIO || '—')}</p>
            <p class="mb-0"><strong>Obs.:</strong> ${this.escapeHtml(h.OBS || '—')}</p>
          </div>
          ${tableHtml}
        `,
        width: '56rem',
        showCancelButton: false,
        confirmButtonText: CatalogosUI.guardarButtonHtml('Cerrar'),
      });
    } catch (err) {
      this.setBusy(triggerBtn, false);
      F.toast(err.message || 'No se pudo cargar el detalle', 'error');
    }
  },

  async eliminar(origenEmpnit, coddoc, correlativo, triggerBtn) {
    if (!this._canDelete) {
      F.toast('Solo la empresa PRINCIPAL puede eliminar traslados en tránsito', 'warning');
      return;
    }
    const label = `${coddoc} #${correlativo}`;
    const pass = await CatalogosUI.solicitarClaveAdmin({
      title: 'Eliminar traslado en tránsito',
      text: `Ingrese la clave de administrador para eliminar ${label} (origen ${origenEmpnit}) de la nube.`,
      confirmText: 'Eliminar',
    });
    if (!pass) return;

    this.setBusy(triggerBtn, true);
    try {
      await F.fetchJson(
        `/api/community/traslados-transito?empnit=${encodeURIComponent(F.getEmpNit() || '')}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'x-emp-nit': F.getEmpNit() || '',
          },
          body: JSON.stringify({
            origenEmpnit,
            coddoc,
            correlativo,
            pass: String(pass),
            empnit: F.getEmpNit() || '',
          }),
        }
      );
      F.toast('Traslado eliminado de la nube', 'success');
      this.readFiltersFromDom();
      await this.fetchList();
      this.refreshTableDom();
    } catch (err) {
      F.toast(err.message || 'No se pudo eliminar', 'error');
      this.setBusy(triggerBtn, false);
    }
  },

  bindEvents() {
    this._container?.querySelector('#os-tt-refresh')?.addEventListener('click', () => {
      this.refresh().catch((err) => F.toast(err.message, 'error'));
    });

    this._container?.querySelector('#os-tt-origen')?.addEventListener('change', () => {
      this.readFiltersFromDom();
      this.refreshTableDom();
    });

    const search = this._container?.querySelector('#os-tt-search');
    if (search) {
      const onSearch = F.debounce
        ? F.debounce(() => {
            this.readFiltersFromDom();
            this.refreshTableDom();
          }, 200)
        : () => {
            this.readFiltersFromDom();
            this.refreshTableDom();
          };
      search.addEventListener('input', onSearch);
      search.addEventListener('search', () => {
        this.readFiltersFromDom();
        this.refreshTableDom();
      });
    }

    this._container?.querySelector('#os-tt-table')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      const tr = btn.closest('tr[data-origen]');
      if (!tr) return;
      const origen = tr.getAttribute('data-origen') || '';
      const coddoc = tr.getAttribute('data-coddoc') || '';
      const correlativo = Number(tr.getAttribute('data-correlativo'));
      if (!origen || !coddoc || !Number.isFinite(correlativo)) return;
      const action = btn.getAttribute('data-action');
      try {
        if (action === 'detalle') await this.verDetalle(origen, coddoc, correlativo, btn);
        else if (action === 'eliminar') await this.eliminar(origen, coddoc, correlativo, btn);
      } catch (err) {
        F.toast(err.message || 'Error', 'error');
        this.setBusy(btn, false);
      }
    });
  },

  async load(container) {
    this._container = container;
    this._filterOrigen = '';
    this._filterQ = '';
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('d-flex', 'flex-column', 'p-3', 'align-items-stretch');
    container.innerHTML = this.renderLoadingHtml();
    try {
      await Promise.all([this.fetchList(), this.fetchOrigenes()]);
      container.innerHTML = this.renderHtml();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `
        <div class="pos-list-wrap os-tt-wrap">
          <div class="pos-list-header">
            <h2 class="pos-list-title">Traslados en tránsito</h2>
          </div>
          <div class="alert alert-danger mb-0">${this.escapeHtml(err.message || 'Error al cargar')}</div>
        </div>`;
    }
  },
};
