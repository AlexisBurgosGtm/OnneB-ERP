/**
 * Archivo → Lista Facturas
 * FAC / FEF / FEC / FES por fecha, con impresión y anulación (SAT o local).
 */
const ListaFacturasView = {
  _container: null,
  _rows: [],
  _fecha: '',
  _filterQuery: '',
  _docKind: 'facturas', // facturas | recibos
  _loading: false,
  _searchTimer: null,
  _urlFel: '',

  FEL_TIPOS: ['FEF', 'FEC', 'FES'],
  RECIBO_TIPOS: ['RCC', 'PRC'],

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
    return `/api/lista-facturas${path}?${qs.toString()}`;
  },

  listApiUrl() {
    const params = {
      fecha: this._fecha || this.todayIsoDate(),
      kind: this._docKind === 'recibos' ? 'recibos' : 'facturas',
      _: String(Date.now()),
    };
    const q = String(this._filterQuery || '').trim();
    if (q) params.q = q;
    return this.apiUrl('', params);
  },

  isRecibos() {
    return this._docKind === 'recibos';
  },

  tipodocOf(row) {
    return String(row?.TIPODOC || '').trim().toUpperCase();
  },

  felUudiValue(row) {
    return String(row?.FEL_UUDI ?? '').trim();
  },

  isAnulado(row) {
    return String(row?.STATUS ?? '').trim().toUpperCase() === 'A';
  },

  puedeAnularFel(row) {
    if (!row || this.isAnulado(row)) return false;
    if (!this.felUudiValue(row)) return false;
    return this.FEL_TIPOS.includes(this.tipodocOf(row));
  },

  puedeAnularLocal(row) {
    if (!row || this.isAnulado(row)) return false;
    if (this.tipodocOf(row) !== 'FAC') return false;
    if (this.felUudiValue(row)) return false;
    const status = String(row.STATUS || '').trim().toUpperCase();
    return status === 'O' || status === 'I';
  },

  puedeAnular(row) {
    if (this.isRecibos()) return false;
    return this.puedeAnularFel(row) || this.puedeAnularLocal(row);
  },

  formatFelCell(row) {
    if (this.isRecibos()) return '—';
    const v = this.felUudiValue(row);
    if (!v) return '—';
    const label =
      v.length <= 16 ? this.escapeHtml(v) : this.escapeHtml(`${v.slice(0, 8)}…${v.slice(-4)}`);
    return `<button type="button" class="btn btn-link btn-sm p-0 text-start lf-fel-link"
      data-action="fel-open" data-fel-uudi="${this.escapeHtml(v)}"
      title="Abrir documento FEL (${this.escapeHtml(v)})">${label}</button>`;
  },

  badgeText() {
    if (this.isRecibos()) {
      return `<i class="fa-solid fa-receipt me-1"></i>${this._rows.length} recibo(s)`;
    }
    return `<i class="fa-solid fa-file-invoice me-1"></i>${this._rows.length} factura(s)`;
  },

  async load(container) {
    this._container = container;
    this._fecha = this.todayIsoDate();
    this._filterQuery = '';
    this._docKind = 'facturas';
    container.className = 'main-content flex-grow-1 d-flex p-3 align-items-stretch justify-content-start';
    container.innerHTML = `
      <div class="lista-facturas-wrap w-100">
        <div class="text-muted small py-4 text-center">
          <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…
        </div>
      </div>`;
    try {
      await this.fetchUrlFel().catch(() => '');
      await this.fetchList();
      this.render();
    } catch (err) {
      container.innerHTML = `
        <div class="lista-facturas-wrap w-100">
          <div class="alert alert-danger mb-0">${this.escapeHtml(err.message || 'Error')}</div>
        </div>`;
    }
  },

  async fetchUrlFel() {
    if (typeof DocOpciones !== 'undefined' && DocOpciones.fetchUrlFel) {
      this._urlFel = await DocOpciones.fetchUrlFel();
      return this._urlFel;
    }
    const params = new URLSearchParams({ opcion: 'URL FEL', _: String(Date.now()) });
    const data = await F.fetchJson(`/api/config/pass?${params}`, { cache: 'no-store' });
    this._urlFel = String(data.pass ?? '').trim();
    return this._urlFel;
  },

  async fetchList() {
    const data = await F.fetchJson(this.listApiUrl(), { cache: 'no-store' });
    this._rows = data.rows || [];
    if (data.fecha) this._fecha = data.fecha;
    return data;
  },

  async reloadList() {
    if (this._loading) return;
    this._loading = true;
    const tbody = this._container?.querySelector('#lf-tbody');
    const badge = this._container?.querySelector('#lf-count');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted py-4">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…
      </td></tr>`;
    }
    try {
      await this.fetchList();
      if (tbody) tbody.innerHTML = this.renderRows();
      if (badge) badge.innerHTML = this.badgeText();
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger py-4">${this.escapeHtml(err.message || 'Error')}</td></tr>`;
      }
      F.toast(err.message || 'Error al cargar', 'error');
    } finally {
      this._loading = false;
    }
  },

  renderRows() {
    if (!this._rows.length) {
      const msg = this._filterQuery.trim()
        ? this.isRecibos()
          ? 'Ningún recibo coincide con la búsqueda'
          : 'Ninguna factura coincide con la búsqueda'
        : this.isRecibos()
          ? 'Sin recibos RCC/PRC en la fecha seleccionada'
          : 'Sin facturas en la fecha seleccionada';
      return `<tr><td colspan="11" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return this._rows
      .map((row) => {
        const anulado = this.isAnulado(row);
        const status = String(row.STATUS || '—').trim().toUpperCase() || '—';
        const statusHtml = anulado
          ? `<span class="text-danger fw-semibold">${this.escapeHtml(status)}</span>`
          : this.escapeHtml(status);
        const tipodoc = this.tipodocOf(row);
        const anularBtn = this.puedeAnular(row)
          ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="anular"
              data-coddoc="${this.escapeHtml(row.CODDOC)}" data-correlativo="${this.escapeHtml(row.CORRELATIVO)}"
              title="Anular"><i class="fa-solid fa-ban"></i></button>`
          : '';
        return `
      <tr class="${anulado ? 'lista-facturas-row-anulado' : ''}"
        data-coddoc="${this.escapeHtml(row.CODDOC)}" data-correlativo="${this.escapeHtml(row.CORRELATIVO)}">
        <td class="font-monospace small">${this.escapeHtml(row.CODDOC ?? '')}${
          tipodoc ? ` <span class="text-muted">(${this.escapeHtml(tipodoc)})</span>` : ''
        }</td>
        <td class="text-end">${this.escapeHtml(row.CORRELATIVO ?? '')}</td>
        <td>${this.escapeHtml(row.NIT ?? '') || '—'}</td>
        <td>${this.escapeHtml(row.DOC_NOMCLIE ?? '') || '—'}</td>
        <td class="small">${this.escapeHtml(row.DOC_DIRCLIE ?? '') || '—'}</td>
        <td class="text-end text-nowrap">${this.escapeHtml(this.formatMoney(row.TOTALPRECIO))}</td>
        <td class="text-center">${statusHtml}</td>
        <td>${this.escapeHtml(row.FEL_SERIE ?? '') || '—'}</td>
        <td>${this.escapeHtml(row.FEL_NUMERO ?? '') || '—'}</td>
        <td>${this.formatFelCell(row)}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-action="imprimir"
            data-coddoc="${this.escapeHtml(row.CODDOC)}" data-correlativo="${this.escapeHtml(row.CORRELATIVO)}"
            title="Imprimir"><i class="fa-solid fa-print"></i></button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-action="trazabilidad"
            data-coddoc="${this.escapeHtml(row.CODDOC)}" data-correlativo="${this.escapeHtml(row.CORRELATIVO)}"
            title="Trazabilidad"><i class="fa-solid fa-diagram-project"></i></button>
          ${anularBtn}
        </td>
      </tr>`;
      })
      .join('');
  },

  render() {
    const wrap = this._container?.querySelector('.lista-facturas-wrap') || this._container;
    if (!wrap) return;
    const subtitle = this.isRecibos()
      ? 'Recibos de pago RCC y PRC del día seleccionado.'
      : 'FAC, FEF, FEC y FES del día seleccionado.';
    wrap.innerHTML = `
      <div class="w-100">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-1">Lista Facturas</h2>
            <p class="text-muted small mb-0">${subtitle}</p>
          </div>
          <span class="badge text-bg-light border" id="lf-count">${this.badgeText()}</span>
        </div>

        <div class="card shadow-sm">
          <div class="card-body">
            <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
              <div>
                <label class="form-label small mb-1" for="lf-kind">Documentos</label>
                <select class="form-select form-select-sm" id="lf-kind" style="min-width: 11rem">
                  <option value="facturas"${this._docKind !== 'recibos' ? ' selected' : ''}>Facturas</option>
                  <option value="recibos"${this._docKind === 'recibos' ? ' selected' : ''}>Recibos de pago</option>
                </select>
              </div>
              <div>
                <label class="form-label small mb-1" for="lf-fecha">Fecha</label>
                <input type="date" class="form-control form-control-sm" id="lf-fecha"
                  value="${this.escapeHtml(this._fecha || this.todayIsoDate())}">
              </div>
              <div class="input-group input-group-sm" style="max-width: 26rem">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control" id="lf-search"
                  placeholder="Serie, número, NIT, cliente…"
                  value="${this.escapeHtml(this._filterQuery)}" autocomplete="off">
                <button type="button" class="btn btn-outline-secondary" id="lf-search-clear" title="Limpiar">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="lf-refresh">
                <i class="fa-solid fa-rotate me-1"></i>Actualizar
              </button>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th scope="col">CODDOC</th>
                    <th scope="col" class="text-end">CORRELATIVO</th>
                    <th scope="col">NIT</th>
                    <th scope="col">NOMBRE CLIENTE</th>
                    <th scope="col">DIRECCIÓN</th>
                    <th scope="col" class="text-end">TOTAL</th>
                    <th scope="col" class="text-center">STATUS</th>
                    <th scope="col">FEL SERIE</th>
                    <th scope="col">FEL NÚMERO</th>
                    <th scope="col">FEL UUID</th>
                    <th scope="col" class="text-end">Acciones</th>
                  </tr>
                </thead>
                <tbody id="lf-tbody">${this.renderRows()}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
    this.bindEvents();
  },

  findRow(coddoc, correlativo) {
    return this._rows.find(
      (r) =>
        String(r.CODDOC) === String(coddoc) && String(r.CORRELATIVO) === String(correlativo)
    );
  },

  bindEvents() {
    const kindSel = this._container?.querySelector('#lf-kind');
    kindSel?.addEventListener('change', () => {
      this._docKind = kindSel.value === 'recibos' ? 'recibos' : 'facturas';
      this.reloadList().then(() => this.render()).catch((err) => {
        F.toast(err.message || 'Error al cargar', 'error');
      });
    });
    const fecha = this._container?.querySelector('#lf-fecha');
    fecha?.addEventListener('change', () => {
      this._fecha = String(fecha.value || '').trim() || this.todayIsoDate();
      this.reloadList();
    });
    const search = this._container?.querySelector('#lf-search');
    search?.addEventListener('input', () => {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => {
        this._filterQuery = String(search.value || '').trim();
        this.reloadList();
      }, 320);
    });
    this._container?.querySelector('#lf-search-clear')?.addEventListener('click', () => {
      clearTimeout(this._searchTimer);
      this._filterQuery = '';
      if (search) search.value = '';
      this.reloadList();
    });
    this._container?.querySelector('#lf-refresh')?.addEventListener('click', () => this.reloadList());

    this._container?.querySelector('#lf-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      const action = btn.getAttribute('data-action');
      try {
        if (action === 'fel-open') {
          await this.abrirFel(btn.getAttribute('data-fel-uudi'));
          return;
        }
        const coddoc = btn.getAttribute('data-coddoc');
        const correlativo = btn.getAttribute('data-correlativo');
        if (action === 'imprimir') await this.imprimir(coddoc, correlativo);
        else if (action === 'trazabilidad') await this.showTrazabilidad(coddoc, correlativo);
        else if (action === 'anular') await this.anular(coddoc, correlativo);
      } catch (err) {
        F.alert('Error', err.message || 'No se pudo completar la acción', 'error');
      }
    });
  },

  async abrirFel(felValue) {
    if (typeof DocOpciones !== 'undefined' && DocOpciones.abrirFelOnline) {
      await DocOpciones.abrirFelOnline(felValue);
      return;
    }
    const fel = String(felValue || '').trim();
    if (!fel) {
      F.toast('No hay UUID FEL', 'warning');
      return;
    }
    if (!this._urlFel) await this.fetchUrlFel().catch(() => '');
    const url = /^https?:\/\//i.test(fel)
      ? fel
      : this._urlFel
        ? `${this._urlFel}${fel}`
        : null;
    if (!url) {
      F.toast('Configure URL FEL en Configuración general', 'warning');
      return;
    }
    window.open(url, '_blank', 'noopener');
  },

  async imprimir(coddoc, correlativo) {
    const row = this.findRow(coddoc, correlativo);
    if (typeof DocOpciones !== 'undefined' && DocOpciones.imprimir) {
      await DocOpciones.imprimir(coddoc, correlativo, row);
      return;
    }
    F.toast('No se pudo imprimir', 'error');
  },

  async showTrazabilidad(coddoc, correlativo) {
    const row = this.findRow(coddoc, correlativo);
    if (!row) {
      F.toast('Documento no encontrado en la lista', 'warning');
      return;
    }
    const label = `${row.CODDOC} #${row.CORRELATIVO}${row.DOC_NOMCLIE ? ` — ${row.DOC_NOMCLIE}` : ''}`;
    const url =
      `/api/documentos/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/trazabilidad` +
      `?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`;
    const data = await F.fetchJson(url);
    const rows = data?.rows || [];
    const bodyHtml = rows.length
      ? `<div class="table-responsive text-start">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light">
              <tr>
                <th>Fecha</th>
                <th>Doc.</th>
                <th>Tipo</th>
                <th>Correlativo</th>
                <th>Cliente</th>
                <th class="text-end">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (r) => `<tr>
                    <td>${this.escapeHtml(this.formatDateDdMmYyyy(r.FECHA))}</td>
                    <td>${this.escapeHtml(r.CODDOC || '—')}</td>
                    <td>${this.escapeHtml(r.TIPODOC || r.DESDOC || '—')}</td>
                    <td>${this.escapeHtml(r.CORRELATIVO ?? '—')}</td>
                    <td>${this.escapeHtml(r.DOC_NOMCLIE || '—')}</td>
                    <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
                    <td>${this.escapeHtml(r.STATUS || '—')}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`
      : '<p class="text-muted small mb-0 text-start">No hay documentos asociados (SERIEFAC / NOFAC).</p>';

    await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Trazabilidad',
      html: `
        <p class="small text-muted text-start mb-2">${this.escapeHtml(label)}</p>
        ${bodyHtml}
      `,
      width: Math.min(760, window.innerWidth - 32),
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
    });
  },

  async anular(coddoc, correlativo) {
    if (this.isRecibos()) {
      F.toast('Los recibos de pago no se anulan desde esta lista', 'warning');
      return;
    }
    const row = this.findRow(coddoc, correlativo);
    if (!row || !this.puedeAnular(row)) {
      F.toast('Esta factura no se puede anular', 'warning');
      return;
    }
    if (typeof AutorizacionesUI !== 'undefined') {
      const allowed = await AutorizacionesUI.gateAccionDocumento({
        accion: 'anular',
        coddoc,
        correlativo,
        tipodoc: row.TIPODOC,
        label: `${coddoc} #${correlativo}`,
      });
      if (!allowed) return;
    }
    if (this.puedeAnularFel(row)) {
      await this.anularFel(row);
      return;
    }
    await this.anularLocal(row);
  },

  async solicitarMotivo() {
    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Motivo de anulación',
      html: `
        <form class="catalogo-form text-start" autocomplete="off" novalidate onsubmit="return false">
          <label for="lf-motivo-anulacion" class="form-label small mb-0">Motivo</label>
          <textarea id="lf-motivo-anulacion" class="form-control form-control-sm" rows="3"
            maxlength="255" placeholder="Motivo de la anulación"></textarea>
        </form>
      `,
      width: 460,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Continuar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      preConfirm: () => {
        const motivo = String(document.getElementById('lf-motivo-anulacion')?.value ?? '').trim();
        if (!motivo) {
          Swal.showValidationMessage('Ingrese el motivo de anulación');
          return false;
        }
        return motivo;
      },
    });
    return result.isConfirmed ? result.value : null;
  },

  async anularFel(row) {
    const label = `${row.CODDOC} #${row.CORRELATIVO}`;
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Anular documento FEL?',
      html: `<p class="mb-2">Se anulará ante SAT:</p>
        <p class="mb-0"><strong>${this.escapeHtml(label)}</strong></p>
        <p class="small text-muted mt-2 mb-0">UUID: ${this.escapeHtml(this.felUudiValue(row))}</p>`,
      icon: 'warning',
      confirmText: 'Continuar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!ok) return;
    const motivo = await this.solicitarMotivo();
    if (!motivo) return;
    const adminPass = await F.solicitarClaveAdmin({
      title: 'Autorizar anulación',
      text: 'Ingrese la clave de administrador para anular el documento ante SAT.',
      confirmText: 'Anular',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!adminPass) return;

    const url = `/api/fel/anular/${encodeURIComponent(row.CODDOC)}/${encodeURIComponent(row.CORRELATIVO)}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo, adminPass }),
    });
    F.toast('Documento anulado ante SAT', 'success');
    await this.reloadList();
  },

  async anularLocal(row) {
    const label = `${row.CODDOC} #${row.CORRELATIVO}`;
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Anular factura local (FAC)?',
      html: `<p class="mb-0">La factura <strong>${this.escapeHtml(label)}</strong> pasará a status <strong>A</strong> (anulada).</p>`,
      icon: 'warning',
      confirmText: 'Continuar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!ok) return;
    const motivo = await this.solicitarMotivo();
    if (!motivo) return;
    const adminPass = await F.solicitarClaveAdmin({
      title: 'Autorizar anulación',
      text: 'Ingrese la clave de administrador para anular la factura.',
      confirmText: 'Anular',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!adminPass) return;

    await F.fetchJson(
      this.apiUrl(`/${encodeURIComponent(row.CODDOC)}/${encodeURIComponent(row.CORRELATIVO)}/anular-local`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: adminPass, motivo }),
      }
    );
    F.toast('Factura anulada localmente', 'success');
    await this.reloadList();
  },
};
