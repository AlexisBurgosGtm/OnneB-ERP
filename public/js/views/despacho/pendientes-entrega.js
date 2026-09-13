/**
 * Despacho → Pendientes Entrega
 * Facturas FAC/FEL con salida de stock (TIPOM <> 0), filtro por fechas y ENTREGADO.
 * Entregas parciales + historial (DOCUMENTOS_ENTREGAS).
 */
const PendientesEntregaView = {
  _container: null,
  _rows: [],
  _from: '',
  _to: '',
  _entregado: 'NO',
  _filterQuery: '',
  _loading: false,
  _searchTimer: null,
  _detalleCtx: null,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatQty(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-GT', { maximumFractionDigits: 4 });
  },

  formatDateDdMmYyyy(value) {
    if (value === null || value === undefined || value === '') return '—';
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) return '—';
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    return `${day}/${month}/${year}`;
  },

  todayIsoDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  apiUrl(path = '', params = {}) {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const qs = new URLSearchParams({ empnit: empNit, ...params });
    const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    return `/api/pendientes-entrega${segment}?${qs.toString()}`;
  },

  listApiUrl() {
    const params = {
      from: this._from || this.todayIsoDate(),
      to: this._to || this.todayIsoDate(),
      entregado: this._entregado === 'SI' ? 'SI' : 'NO',
      _: String(Date.now()),
    };
    const q = String(this._filterQuery || '').trim();
    if (q) params.q = q;
    return this.apiUrl('', params);
  },

  prioridadBadgeHtml(prioridad) {
    const p = String(prioridad || 'MEDIA').trim().toUpperCase();
    let cls = 'media';
    if (p === 'BAJA') cls = 'baja';
    else if (p === 'ALTA') cls = 'alta';
    return `<span class="pe-prioridad pe-prioridad--${cls}">${this.escapeHtml(p || 'MEDIA')}</span>`;
  },

  badgeText() {
    const n = this._rows.length;
    return `${n} documento${n === 1 ? '' : 's'}`;
  },

  sessionUsuario() {
    const u = F.session('user') || {};
    return String(u.nombre || u.usuario || u.user || u.login || 'ENTREGA').trim() || 'ENTREGA';
  },

  renderRows() {
    if (!this._rows.length) {
      return `<tr><td colspan="10" class="text-center text-muted py-4">Sin documentos en el rango</td></tr>`;
    }
    return this._rows
      .map((row) => {
        const coddoc = this.escapeHtml(row.CODDOC);
        const corr = this.escapeHtml(row.CORRELATIVO);
        return `<tr class="pe-row" role="button" tabindex="0"
          data-coddoc="${coddoc}" data-correlativo="${corr}">
          <td class="text-nowrap">${this.escapeHtml(this.formatDateDdMmYyyy(row.FECHA))}</td>
          <td class="font-monospace small">${coddoc}</td>
          <td class="text-end">${corr}</td>
          <td class="text-nowrap">${this.escapeHtml(row.HORA || '—')}</td>
          <td>${this.escapeHtml(row.CLIENTE || '—')}</td>
          <td class="small">${this.escapeHtml(row.DIRECCION || '—')}</td>
          <td class="small">${this.escapeHtml(row.DIRENTREGA || '—')}</td>
          <td class="text-end text-nowrap fw-semibold">${this.escapeHtml(this.formatMoney(row.TOTALPRECIO))}</td>
          <td class="small">${this.escapeHtml(row.F_ENTREGA || '—')}</td>
          <td class="text-center">${this.prioridadBadgeHtml(row.PRIORIDAD)}</td>
        </tr>`;
      })
      .join('');
  },

  render() {
    const wrap = this._container?.querySelector('.pendientes-entrega-wrap') || this._container;
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="w-100 pendientes-entrega-panel">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-1">Pendientes Entrega</h2>
            <p class="text-muted small mb-0">Facturas FAC / FEL con salida de inventario (no anuladas).</p>
          </div>
          <span class="badge text-bg-light border" id="pe-count">${this.badgeText()}</span>
        </div>

        <div class="card shadow-sm">
          <div class="card-body">
            <div class="d-flex flex-wrap align-items-end gap-2 mb-3 pe-filters">
              <div>
                <label class="form-label small mb-1" for="pe-from">Fecha inicial</label>
                <input type="date" class="form-control form-control-sm" id="pe-from" value="${this.escapeHtml(
                  this._from
                )}">
              </div>
              <div>
                <label class="form-label small mb-1" for="pe-to">Fecha final</label>
                <input type="date" class="form-control form-control-sm" id="pe-to" value="${this.escapeHtml(
                  this._to
                )}">
              </div>
              <div>
                <label class="form-label small mb-1" for="pe-entregado">Entregado</label>
                <select class="form-select form-select-sm" id="pe-entregado" style="min-width: 9rem">
                  <option value="NO"${this._entregado !== 'SI' ? ' selected' : ''}>No entregado</option>
                  <option value="SI"${this._entregado === 'SI' ? ' selected' : ''}>Entregado</option>
                </select>
              </div>
              <div class="flex-grow-1" style="min-width: 12rem">
                <label class="form-label small mb-1" for="pe-search">Buscar</label>
                <div class="input-group input-group-sm">
                  <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                  <input type="search" class="form-control" id="pe-search"
                    placeholder="Cliente, documento, dirección…"
                    value="${this.escapeHtml(this._filterQuery)}" autocomplete="off">
                  <button type="button" class="btn btn-outline-secondary" id="pe-search-clear" title="Limpiar">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </div>
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="pe-refresh">
                <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
              </button>
            </div>

            <div class="table-responsive pe-table-wrap">
              <table class="table table-sm table-hover table-striped mb-0 pe-table">
                <thead class="table-light sticky-top">
                  <tr>
                    <th>Fecha</th>
                    <th>Coddoc</th>
                    <th class="text-end">Correlativo</th>
                    <th>Hora</th>
                    <th>Cliente</th>
                    <th>Dirección</th>
                    <th>Dir. entrega</th>
                    <th class="text-end">Total</th>
                    <th>F. entrega</th>
                    <th class="text-center">Prioridad</th>
                  </tr>
                </thead>
                <tbody id="pe-tbody">${this.renderRows()}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
    this.bindEvents();
  },

  bindEvents() {
    const fromEl = this._container?.querySelector('#pe-from');
    const toEl = this._container?.querySelector('#pe-to');
    const entEl = this._container?.querySelector('#pe-entregado');
    const search = this._container?.querySelector('#pe-search');

    const reload = () => {
      this._from = fromEl?.value || this.todayIsoDate();
      this._to = toEl?.value || this.todayIsoDate();
      this._entregado = entEl?.value === 'SI' ? 'SI' : 'NO';
      this.reloadList();
    };

    fromEl?.addEventListener('change', reload);
    toEl?.addEventListener('change', reload);
    entEl?.addEventListener('change', reload);
    this._container?.querySelector('#pe-refresh')?.addEventListener('click', () => this.reloadList());

    search?.addEventListener('input', () => {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => {
        this._filterQuery = String(search.value || '').trim();
        this.reloadList();
      }, 320);
    });
    this._container?.querySelector('#pe-search-clear')?.addEventListener('click', () => {
      clearTimeout(this._searchTimer);
      this._filterQuery = '';
      if (search) search.value = '';
      this.reloadList();
    });

    const tbody = this._container?.querySelector('#pe-tbody');
    tbody?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.pe-row');
      if (!tr) return;
      this.showDetalle(tr.getAttribute('data-coddoc'), tr.getAttribute('data-correlativo')).catch((err) =>
        F.toast(err.message || 'No se pudo cargar el detalle', 'error')
      );
    });
    tbody?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest('tr.pe-row');
      if (!tr) return;
      e.preventDefault();
      this.showDetalle(tr.getAttribute('data-coddoc'), tr.getAttribute('data-correlativo')).catch((err) =>
        F.toast(err.message || 'No se pudo cargar el detalle', 'error')
      );
    });
  },

  async reloadList() {
    if (this._loading) return;
    this._loading = true;
    try {
      const data = await F.fetchJson(this.listApiUrl(), { cache: 'no-store' });
      this._rows = data.rows || [];
      if (data.from) this._from = String(data.from).slice(0, 10);
      if (data.to) this._to = String(data.to).slice(0, 10);
      this.render();
    } catch (err) {
      F.toast(err.message || 'No se pudo cargar pendientes de entrega', 'error');
    } finally {
      this._loading = false;
    }
  },

  detalleLinesHtml(lines) {
    if (!lines.length) {
      return '<p class="text-muted small mb-0 text-start">Sin líneas de producto.</p>';
    }
    return `<div class="table-responsive text-start" style="max-height: 360px">
      <table class="table table-sm table-hover mb-0">
        <thead class="table-light sticky-top">
          <tr>
            <th>Código</th>
            <th>Producto</th>
            <th>Medida</th>
            <th class="text-end">Cantidad</th>
            <th class="text-end">Tot. und.</th>
            <th class="text-end">Entregados</th>
            <th class="text-end">Pendiente</th>
            <th class="text-end">Total</th>
          </tr>
        </thead>
        <tbody>
          ${lines
            .map(
              (r) => `<tr>
                <td class="font-monospace small">${this.escapeHtml(r.CODPROD)}</td>
                <td>${this.escapeHtml(r.DESPROD || '—')}</td>
                <td>${this.escapeHtml(r.CODMEDIDA || '—')}</td>
                <td class="text-end">${this.escapeHtml(this.formatQty(r.CANTIDAD))}</td>
                <td class="text-end">${this.escapeHtml(this.formatQty(r.TOTALUNIDADES))}</td>
                <td class="text-end">${this.escapeHtml(this.formatQty(r.ENTREGADOS_TOTALUNIDADES))}</td>
                <td class="text-end fw-semibold">${this.escapeHtml(this.formatQty(r.PENDIENTE))}</td>
                <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
  },

  historialHtml(entregas) {
    if (typeof DocOpciones !== 'undefined' && DocOpciones.historialEntregasTableHtml) {
      return DocOpciones.historialEntregasTableHtml(entregas, { allowDelete: true });
    }
    if (!entregas.length) {
      return '<p class="text-muted small mb-0 text-start">Aún no hay entregas registradas.</p>';
    }
    return `<div class="table-responsive text-start" style="max-height: 360px">
      <table class="table table-sm table-hover mb-0">
        <thead class="table-light sticky-top">
          <tr>
            <th>#</th>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Entregado a</th>
            <th class="text-end">Und.</th>
            <th class="text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${entregas
            .map(
              (e) => `<tr>
                <td class="font-monospace small">${this.escapeHtml(e.ID)}</td>
                <td>${this.escapeHtml(this.formatDateDdMmYyyy(e.FECHA))}</td>
                <td>${this.escapeHtml(e.HORA || '—')}</td>
                <td>${this.escapeHtml(e.ENTREGADO_A || '—')}</td>
                <td class="text-end">${this.escapeHtml(this.formatQty(e.TOTALUNIDADES))}</td>
                <td class="text-center text-nowrap">
                  <button type="button" class="btn btn-sm btn-outline-secondary pe-hist-print" data-id="${e.ID}" title="Imprimir">
                    <i class="fa-solid fa-print"></i>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-danger pe-hist-del" data-id="${e.ID}" title="Eliminar entrega">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
  },

  detalleModalHtml(header, lines, entregas) {
    const cod = header.CODDOC || '';
    const corr = header.CORRELATIVO ?? '';
    return `
      <div class="pe-detalle text-start">
        <p class="small text-muted mb-2">
          ${this.escapeHtml(header.CLIENTE || '—')}
          · ${this.escapeHtml(this.formatDateDdMmYyyy(header.FECHA))}
          · ${this.escapeHtml(header.HORA || '')}
          · ${this.prioridadBadgeHtml(header.PRIORIDAD)}
          · Entregado: <strong>${this.escapeHtml(header.ENTREGADO === 'SI' ? 'Sí' : 'No')}</strong>
        </p>
        <ul class="nav nav-tabs nav-tabs-sm mb-2" role="tablist">
          <li class="nav-item" role="presentation">
            <button type="button" class="nav-link active" data-pe-tab="detalle" id="pe-tab-detalle">Detalle</button>
          </li>
          <li class="nav-item" role="presentation">
            <button type="button" class="nav-link" data-pe-tab="historial" id="pe-tab-historial">
              Historial de entregas
              <span class="badge text-bg-secondary ms-1">${entregas.length}</span>
            </button>
          </li>
        </ul>
        <div id="pe-pane-detalle">${this.detalleLinesHtml(lines)}</div>
        <div id="pe-pane-historial" class="d-none">${this.historialHtml(entregas)}</div>
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 pe-detalle-actions">
          <button type="button" class="btn btn-sm btn-outline-secondary" id="pe-btn-cerrar">Cerrar</button>
          <button type="button" class="btn btn-sm btn-primary" id="pe-btn-nueva">
            <i class="fa-solid fa-truck-ramp-box me-1"></i>Nueva entrega
          </button>
          <button type="button" class="btn btn-sm btn-success" id="pe-btn-completar"
            ${header.ENTREGADO === 'SI' ? 'disabled' : ''}>
            <i class="fa-solid fa-circle-check me-1"></i>Entrega completada
          </button>
        </div>
      </div>
    `;
  },

  bindDetalleModal(coddoc, correlativo) {
    const root = Swal.getHtmlContainer();
    if (!root) return;

    root.querySelectorAll('[data-pe-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-pe-tab');
        root.querySelectorAll('[data-pe-tab]').forEach((b) => b.classList.toggle('active', b === btn));
        root.querySelector('#pe-pane-detalle')?.classList.toggle('d-none', tab !== 'detalle');
        root.querySelector('#pe-pane-historial')?.classList.toggle('d-none', tab !== 'historial');
      });
    });

    root.querySelector('#pe-btn-cerrar')?.addEventListener('click', () => Swal.close());

    root.querySelector('#pe-btn-nueva')?.addEventListener('click', () => {
      this.openNuevaEntrega(coddoc, correlativo).catch((err) =>
        F.toast(err.message || 'No se pudo abrir nueva entrega', 'error')
      );
    });

    root.querySelector('#pe-btn-completar')?.addEventListener('click', () => {
      this.marcarCompletada(coddoc, correlativo).catch((err) =>
        F.toast(err.message || 'No se pudo marcar como completada', 'error')
      );
    });

    root.querySelectorAll('.pe-hist-print').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.imprimirEntrega(btn.getAttribute('data-id')).catch((err) =>
          F.toast(err.message || 'No se pudo imprimir', 'error')
        );
      });
    });

    root.querySelectorAll('.pe-hist-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.eliminarEntrega(btn.getAttribute('data-id'), coddoc, correlativo).catch((err) =>
          F.toast(err.message || 'No se pudo eliminar', 'error')
        );
      });
    });
  },

  async refreshDetalleModal(coddoc, correlativo) {
    const data = await F.fetchJson(
      this.apiUrl(`${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/lineas`, {
        _: String(Date.now()),
      }),
      { cache: 'no-store' }
    );
    this._detalleCtx = {
      header: data.header || {},
      lines: data.lines || [],
      entregas: data.entregas || [],
      coddoc,
      correlativo,
    };
    const { header, lines, entregas } = this._detalleCtx;
    Swal.update({
      title: `${header.CODDOC || coddoc} #${header.CORRELATIVO ?? correlativo}`,
      html: this.detalleModalHtml(header, lines, entregas),
    });
    this.bindDetalleModal(coddoc, correlativo);
  },

  async showDetalle(coddoc, correlativo) {
    Swal.fire({
      ...CatalogosUI.modalBase(),
      title: `${coddoc} #${correlativo}`,
      html: '<p class="text-muted mb-0"><i class="fa-solid fa-spinner fa-spin me-1"></i>Cargando productos…</p>',
      showConfirmButton: false,
      showCancelButton: false,
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const data = await F.fetchJson(
      this.apiUrl(`${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/lineas`, {
        _: String(Date.now()),
      }),
      { cache: 'no-store' }
    );
    const header = data.header || {};
    const lines = data.lines || [];
    const entregas = data.entregas || [];
    this._detalleCtx = { header, lines, entregas, coddoc, correlativo };

    await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: `${header.CODDOC || coddoc} #${header.CORRELATIVO ?? correlativo}`,
      html: this.detalleModalHtml(header, lines, entregas),
      width: Math.min(960, window.innerWidth - 24),
      showConfirmButton: false,
      showCancelButton: false,
      allowOutsideClick: true,
      didOpen: () => this.bindDetalleModal(coddoc, correlativo),
    });
  },

  async openNuevaEntrega(coddoc, correlativo) {
    const data = await F.fetchJson(
      this.apiUrl(`${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/lineas`, {
        _: String(Date.now()),
      }),
      { cache: 'no-store' }
    );
    const lines = (data.lines || []).filter((l) => Number(l.PENDIENTE) > 0.00005);
    if (!lines.length) {
      F.toast('No hay cantidades pendientes por entregar', 'info');
      return;
    }

    const rowsHtml = lines
      .map(
        (r) => `<tr data-id="${r.ID}">
          <td class="font-monospace small">${this.escapeHtml(r.CODPROD)}</td>
          <td class="small">${this.escapeHtml(r.DESPROD || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatQty(r.PENDIENTE))}</td>
          <td style="max-width: 7rem">
            <input type="number" class="form-control form-control-sm pe-qty-input text-end"
              min="0" step="any" max="${r.PENDIENTE}" value="${r.PENDIENTE}"
              data-max="${r.PENDIENTE}" data-id="${r.ID}">
          </td>
        </tr>`
      )
      .join('');

    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Nueva entrega',
      html: `
        <div class="text-start pe-nueva">
          <p class="small text-muted mb-2">${this.escapeHtml(coddoc)} #${this.escapeHtml(correlativo)}</p>
          <div class="mb-3">
            <label class="form-label small mb-1" for="pe-entregado-a">Entregado a</label>
            <input type="text" class="form-control form-control-sm" id="pe-entregado-a"
              maxlength="255" placeholder="Nombre de quien recibe" autocomplete="off">
          </div>
          <div class="table-responsive" style="max-height: 340px">
            <table class="table table-sm mb-0">
              <thead class="table-light sticky-top">
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th class="text-end">Pendiente</th>
                  <th class="text-end">Entregar</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      `,
      width: Math.min(720, window.innerWidth - 24),
      showCancelButton: true,
      focusConfirm: false,
      confirmButtonText: 'Registrar entrega',
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      preConfirm: () => {
        const persona = String(document.getElementById('pe-entregado-a')?.value || '').trim();
        if (!persona) {
          Swal.showValidationMessage('Indique a quién se entrega');
          return false;
        }
        const lineas = [];
        document.querySelectorAll('.pe-qty-input').forEach((inp) => {
          const id = Number(inp.getAttribute('data-id'));
          const max = Number(inp.getAttribute('data-max'));
          const qty = Number(inp.value);
          if (!Number.isFinite(id) || !(qty > 0)) return;
          if (qty > max + 0.00005) {
            Swal.showValidationMessage(`Cantidad mayor al pendiente (máx. ${max})`);
            return;
          }
          lineas.push({ id, totalUnidades: qty });
        });
        if (!lineas.length) {
          Swal.showValidationMessage('Indique al menos una cantidad a entregar');
          return false;
        }
        return { entregadoA: persona, lineas };
      },
    });

    if (!result.isConfirmed || !result.value) {
      await this.showDetalle(coddoc, correlativo);
      return;
    }

    const payload = {
      ...result.value,
      usuario: this.sessionUsuario(),
    };
    const res = await F.fetchJson(
      this.apiUrl(`${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/entregas`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    F.toast(
      res.completado
        ? 'Entrega registrada. Factura marcada como entregada (sin pendiente).'
        : 'Entrega registrada',
      'success'
    );
    if (res.completado) await this.reloadList();
    await this.showDetalle(coddoc, correlativo);
  },

  async marcarCompletada(coddoc, correlativo) {
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Marcar entrega completada?',
      html: `<p class="mb-0">La factura <strong>${this.escapeHtml(coddoc)} #${this.escapeHtml(
        correlativo
      )}</strong> dejará de figurar como pendiente (<code>ENTREGADO = 1</code>). No se crea documento de entrega.</p>`,
      icon: 'question',
      confirmText: 'Completar',
    });
    if (!ok) return;

    const res = await F.fetchJson(
      this.apiUrl(`${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/completar`),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
    F.toast('Factura marcada como entregada', 'success');
    if (this._detalleCtx) this._detalleCtx.header = res.header || this._detalleCtx.header;
    await this.reloadList();
    Swal.close();
  },

  async eliminarEntrega(id, coddoc, correlativo) {
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Eliminar esta entrega?',
      html: '<p class="mb-0">Se restarán las cantidades entregadas del documento y la factura volverá a pendiente.</p>',
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!ok) return;

    const res = await F.fetchJson(this.apiUrl(`entregas/${encodeURIComponent(id)}`), {
      method: 'DELETE',
    });
    F.toast('Entrega eliminada', 'success');
    this._detalleCtx = {
      header: res.header || {},
      lines: res.lines || [],
      entregas: res.entregas || [],
      coddoc,
      correlativo,
    };
    await this.reloadList();
    Swal.update({
      html: this.detalleModalHtml(
        this._detalleCtx.header,
        this._detalleCtx.lines,
        this._detalleCtx.entregas
      ),
    });
    this.bindDetalleModal(coddoc, correlativo);
  },

  async imprimirEntrega(id) {
    if (typeof DocOpciones !== 'undefined' && DocOpciones.imprimirEntrega) {
      return DocOpciones.imprimirEntrega(id);
    }
    throw new Error('Impresión de entrega no disponible');
  },

  async load(container) {
    this._container = container;
    this._from = this.todayIsoDate();
    this._to = this.todayIsoDate();
    this._entregado = 'NO';
    this._filterQuery = '';
    this._rows = [];
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start');
    container.innerHTML = '<div class="pendientes-entrega-wrap w-100"></div>';
    this.render();
    await this.reloadList();
  },
};
