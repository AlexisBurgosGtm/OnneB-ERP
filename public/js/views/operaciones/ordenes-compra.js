/**
 * Vista Órdenes de compra — documentos OCM (DOCUMENTOS + DOCPRODUCTOS).
 * Copia de Compras sin SAT/serie proveedor ni cargar costos.
 */
const OrdenesCompraView = {
  _container: null,
  _config: null,
  _compra: null,
  _productos: [],
  _ordenesList: [],
  _listFilter: '',
  _listFecha: null,
  _selectedCoddoc: '',
  _screen: 'list',
  _loadingProducts: false,
  _searchTimer: null,
  _cartBusy: false,
  _urlFel: '',

  FEL_URL_OPCION: 'URL FEL',
  COBRO_PREDETERMINADO_OPCION: 'COBRO PREDETERMINADO',

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiUrl(path, extraParams = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    const params = new URLSearchParams({ empnit: emp, ...extraParams });
    return `/api/ordenes-compra${segment}?${params}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatQty(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  },

  formatProdLabel(desprod, desmarca) {
    const name = String(desprod ?? '').trim();
    const marca = String(desmarca ?? '').trim();
    if (!marca) return name;
    return `${name} · ${marca}`;
  },

  renderProdNameHtml(desprod, desmarca) {
    const name = this.escapeHtml(String(desprod ?? '').trim());
    const marca = String(desmarca ?? '').trim();
    if (!marca) return name;
    return `${name} · <strong class="pos-prod-marca">${this.escapeHtml(marca)}</strong>`;
  },

  muestraDesprod2() {
    return String(this._config?.muestraDesprod2 || 'NO').trim().toUpperCase() === 'SI';
  },

  muestraPesoEnDocumentos() {
    return String(this._config?.muestraPesoEnDocumentos || 'NO').trim().toUpperCase() === 'SI';
  },

  formatPeso(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  },

  lineTotalPeso(ln) {
    const stored = Number(ln?.TOTALPESO);
    if (Number.isFinite(stored)) return stored;
    return (Number(ln?.PESO) || 0) * (Number(ln?.CANTIDAD) || 0);
  },

  calcDocTotalPeso(lines) {
    return (lines || []).reduce((sum, ln) => sum + this.lineTotalPeso(ln), 0);
  },

  linePesoHtml(ln) {
    if (!this.muestraPesoEnDocumentos()) return '';
    const tp = this.lineTotalPeso(ln);
    if (!tp) return '';
    return `<div class="small text-muted doc-line-peso">${this.escapeHtml(this.formatPeso(tp))}</div>`;
  },

  renderDesprod2Html(p) {
    if (!this.muestraDesprod2()) return '';
    const des2 = String(p?.DESPROD2 ?? '').trim();
    if (!des2) return '';
    return `<div class="pos-prod-des2 small text-muted">${this.escapeHtml(des2)}</div>`;
  },

  formatFechaCompra(row) {
    return DocFecha.formatDisplay(row);
  },

  formatHoraCompra(row) {
    if (row?.HORA == null || row?.HORA === '') return '—';
    const h = String(Number(row.HORA)).padStart(2, '0');
    const m = String(Number(row.MINUTO ?? 0)).padStart(2, '0');
    return `${h}:${m}`;
  },

  todayIsoDate() {
    return DocFecha.todayIsoDate();
  },

  listFechaLabel() {
    const s = String(this._listFecha || '').slice(0, 10);
    const [y, m, d] = s.split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
    return s || '—';
  },

  felUudiValue(row) {
    return String(row?.FEL_UUDI ?? row?.FEL ?? '').trim();
  },

  formatFelCell(row) {
    const v = this.felUudiValue(row);
    if (!v) return '—';
    const label =
      v.length <= 16 ? this.escapeHtml(v) : this.escapeHtml(`${v.slice(0, 8)}…${v.slice(-4)}`);
    return `<button type="button" class="btn btn-link btn-sm p-0 ocm-fel-link text-start"
      data-action="fel-open" data-fel-uudi="${this.escapeHtml(v)}"
      title="Abrir documento FEL (${this.escapeHtml(v)})">${label}</button>`;
  },

  joinFelUrl(baseUrl, felValue) {
    const base = String(baseUrl ?? '').trim();
    const fel = String(felValue ?? '').trim();
    if (!base || !fel) return null;
    if (/^https?:\/\//i.test(fel)) return fel;
    return `${base}${fel}`;
  },

  async fetchUrlFel() {
    const params = new URLSearchParams({
      opcion: this.FEL_URL_OPCION,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/config/pass?${params}`, { cache: 'no-store' });
    this._urlFel = String(data.pass ?? '').trim();
    return this._urlFel;
  },

  async abrirFelDocumento(felValue) {
    const fel = String(felValue ?? '').trim();
    if (!fel) return;
    if (!this._urlFel) {
      try {
        await this.fetchUrlFel();
      } catch (err) {
        F.toast(err.message || 'No se pudo leer la URL FEL', 'error');
        return;
      }
    }
    if (!this._urlFel) {
      F.toast('Configure la URL FEL en Config general', 'warning');
      return;
    }
    const url = this.joinFelUrl(this._urlFel, fel);
    if (!url) {
      F.toast('No se pudo construir la URL del documento FEL', 'warning');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  docKey() {
    if (!this._compra?.header) return null;
    const h = this._compra.header;
    return { coddoc: h.CODDOC, correlativo: Number(h.CORRELATIVO) };
  },

  docLabel() {
    const h = this._compra?.header;
    if (!h) return 'Sin compra';
    return `${h.CODDOC} #${h.CORRELATIVO}`;
  },

  lineId(ln) {
    const raw = ln?.ID ?? ln?.Id ?? ln?.id ?? null;
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  },

  findLineById(id) {
    const n = Number(id);
    if (Number.isNaN(n)) return null;
    return (this._compra?.lines || []).find((l) => Number(this.lineId(l)) === n) || null;
  },

  usuario() {
    const u = F.session('user');
    return u?.username || 'COMPRAS';
  },

  proveedorLabel(h) {
    if (!h) return '—';
    const emp = String(h.PROV_EMPRESA || '').trim();
    const raz = String(h.PROV_RAZON || h.DOC_NOMCLIE || '').trim();
    if (emp && raz && emp !== raz) return `${emp} — ${raz}`;
    return emp || raz || '—';
  },

  hasProveedor(h) {
    const cod = h?.CODPROV ?? h?.CODCLIENTE;
    return cod != null && cod !== '' && Number(cod) > 0;
  },

  async fetchConfig() {
    return F.fetchJson(this.apiUrl('/config', { _: Date.now() }));
  },

  async fetchProductos(q) {
    const params = new URLSearchParams({ empnit: F.getEmpNit(), limit: '40' });
    if (q) params.set('q', q);
    params.set('_', String(Date.now()));
    return F.fetchJson(`/api/ordenes-compra/productos?${params}`);
  },

  activeCoddoc() {
    return DocTipoSelect.active(this);
  },

  async fetchOrdenesList() {
    const fecha = String(this._listFecha || this.todayIsoDate()).slice(0, 10);
    this._listFecha = fecha;
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      status: 'O',
      fecha,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/ordenes-compra/ordenes-compra?${params}`);
    this._ordenesList = data.rows || [];
    if (data.fecha) this._listFecha = String(data.fecha).slice(0, 10);
    return this._ordenesList;
  },

  filteredOrdenesList() {
    const q = this._listFilter.trim().toLowerCase();
    if (!q) return this._ordenesList;
    return this._ordenesList.filter((r) => {
      const hay = [
        r.CODDOC,
        r.CORRELATIVO,
        r.DOC_NOMCLIE,
        r.EMPRESA,
        r.RAZONSOCIAL,
        r.FEL_UUDI,
        r.OBS,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  },

  async loadCompra(coddoc, correlativo, opts = {}) {
    const url = `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(coddoc)}/${correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`;
    this._compra = await F.fetchJson(url);
    if (this._screen === 'editor' && !opts.skipRender) this.renderAll();
  },

  async crearOrden() {
    const body = {
      CODDOC: this.activeCoddoc(),
      CODPROV: this._config?.proveedorDefault?.CODPROV,
      USUARIO: this.usuario(),
    };
    const url = `/api/ordenes-compra/ordenes-compra?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._compra = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    F.toast('Nueva orden creada', 'success');
  },

  docEditable(header) {
    return DocFecha.editableStatus(header?.STATUS);
  },

  todayInputValue() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  async fetchCobroPredeterminado() {
    const params = new URLSearchParams({
      opcion: this.COBRO_PREDETERMINADO_OPCION,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/config/concre?${params}`, { cache: 'no-store' });
    const val = String(data.concre || 'CON').trim().toUpperCase();
    return val === 'CRE' ? 'CRE' : 'CON';
  },

  async resolveDefaultConcre(h) {
    try {
      return await this.fetchCobroPredeterminado();
    } catch {
      return String(h?.CONCRE || 'CON').trim().toUpperCase() === 'CRE' ? 'CRE' : 'CON';
    }
  },

  resolveFinalizarFacDefaults(h, key) {
    const seriefacStored = String(h?.SERIEFAC ?? '').trim();
    const nofacStored = String(h?.NOFAC ?? '').trim();
    return {
      seriefac: seriefacStored || String(key?.coddoc ?? '').trim(),
      nofac: nofacStored || (key?.correlativo != null ? String(key.correlativo) : ''),
    };
  },

  readFinalizarFormForSubmit() {
    const concre = document.getElementById('ocm-finalizar-concre')?.value || 'CON';
    const venc = document.getElementById('ocm-finalizar-venc')?.value?.trim() || '';
    const obs = document.getElementById('ocm-finalizar-obs')?.value?.trim() || '';
    if (concre === 'CRE' && !venc) {
      Swal.showValidationMessage('Ingrese la fecha de vencimiento');
      return null;
    }
    Swal.resetValidationMessage?.();
    return {
      concre,
      vencimiento: concre === 'CRE' ? venc : null,
      obs,
    };
  },

  cargarCostosUrl(key) {
    return `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(key.coddoc)}/${encodeURIComponent(key.correlativo)}/cargar-costos?empnit=${encodeURIComponent(F.getEmpNit())}`;
  },

  cargarCostosPendingLines() {
    const lines = (this._compra?.lines || []).filter((ln) => {
      if (this.lineId(ln) == null) return false;
      if (String(ln.TIPOPROD || '').trim().toUpperCase() === 'S') return false;
      if (String(ln.CODPROD || '').trim().toUpperCase().startsWith('PSE')) return false;
      return true;
    });
    const byProd = new Map();
    for (const ln of lines) {
      const cod = String(ln.CODPROD || '').trim();
      if (!cod) continue;
      if (!byProd.has(cod)) {
        byProd.set(cod, { CODPROD: cod, DESPROD: ln.DESPROD, lineId: this.lineId(ln) });
      }
    }
    return [...byProd.values()];
  },

  cargarCostosBtnIdleHtml() {
    return '<i class="fa-solid fa-coins" aria-hidden="true"></i> Cargar Costos';
  },

  revisarPreciosUrl(key) {
    return `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(key.coddoc)}/${encodeURIComponent(key.correlativo)}/revisar-precios?empnit=${encodeURIComponent(F.getEmpNit())}`;
  },

  parseMoneyInput(raw) {
    const n = Number(String(raw ?? '').replace(/,/g, '').trim());
    if (Number.isNaN(n) || n < 0) return null;
    return Math.round(n * 1000) / 1000;
  },

  moneyInputHtml(name, value, precioId) {
    const v = Number(value);
    const shown = Number.isNaN(v) ? '0' : String(v);
    return `<input type="number" class="form-control form-control-sm text-end ocm-rev-input"
      data-field="${name}" data-precio-id="${precioId}" step="0.001" min="0" value="${this.escapeHtml(shown)}">`;
  },

  deltaCostoHtml(delta) {
    const n = Number(delta) || 0;
    if (Math.abs(n) < 0.0005) {
      return '<span class="ocm-rev-delta is-same">—</span>';
    }
    const cls = n > 0 ? 'is-up' : 'is-down';
    const sign = n > 0 ? '+' : '';
    return `<span class="ocm-rev-delta ${cls}">${sign}${this.escapeHtml(this.formatMoney(n))}</span>`;
  },

  renderRevisarPreciosRows(rows) {
    if (!rows?.length) {
      return '<p class="text-muted small mb-0 text-center py-3">No hay productos con medidas de precio para revisar.</p>';
    }
    return rows
      .map((prod) => {
        const medidas = prod.medidas || [];
        const body = !medidas.length
          ? `<tr><td colspan="9" class="text-muted small">Sin medidas en PRECIOS</td></tr>`
          : medidas
              .map((m) => {
                const changed = Math.abs(Number(m.deltaCosto) || 0) >= 0.0005;
                return `<tr class="ocm-rev-row${changed ? ' is-cost-changed' : ''}" data-precio-id="${m.ID}" data-codprod="${this.escapeHtml(prod.CODPROD)}">
                  <td class="small fw-semibold">${this.escapeHtml(m.CODMEDIDA)}</td>
                  <td class="small text-muted text-center">${this.escapeHtml(this.formatQty(m.EQUIVALE))}</td>
                  <td class="text-end small">${this.escapeHtml(this.formatMoney(m.COSTO))}</td>
                  <td class="text-end small fw-semibold">${this.escapeHtml(this.formatMoney(m.costoNuevo))}</td>
                  <td class="text-end small">${this.deltaCostoHtml(m.deltaCosto)}</td>
                  <td>${this.moneyInputHtml('PRECIO', m.PRECIO, m.ID)}</td>
                  <td>${this.moneyInputHtml('MAYOREOA', m.MAYOREOA, m.ID)}</td>
                  <td>${this.moneyInputHtml('MAYOREOB', m.MAYOREOB, m.ID)}</td>
                  <td>${this.moneyInputHtml('MAYOREOC', m.MAYOREOC, m.ID)}</td>
                </tr>`;
              })
              .join('');
        return `
          <div class="ocm-rev-prod">
            <div class="ocm-rev-prod-head">
              <span class="ocm-rev-cod">${this.escapeHtml(prod.CODPROD)}</span>
              <span class="ocm-rev-des">${this.escapeHtml(prod.DESPROD || '')}</span>
              <span class="ocm-rev-unit text-muted">Costo unit. compra: ${this.escapeHtml(this.formatMoney(prod.costoUnitario))}</span>
            </div>
            <div class="table-responsive">
              <table class="table table-sm align-middle mb-0 ocm-rev-table">
                <thead>
                  <tr>
                    <th>Medida</th>
                    <th class="text-center">Eq.</th>
                    <th class="text-end">Costo actual</th>
                    <th class="text-end">Costo nuevo</th>
                    <th class="text-end">Diff.</th>
                    <th class="text-end">Precio</th>
                    <th class="text-end">Mayoreo A</th>
                    <th class="text-end">Mayoreo B</th>
                    <th class="text-end">Mayoreo C</th>
                  </tr>
                </thead>
                <tbody>${body}</tbody>
              </table>
            </div>
          </div>`;
      })
      .join('');
  },

  collectRevisarPreciosUpdates(root) {
    const updates = [];
    const rows = root?.querySelectorAll('.ocm-rev-row[data-precio-id]') || [];
    for (const tr of rows) {
      const id = parseInt(tr.getAttribute('data-precio-id'), 10);
      const codprod = String(tr.getAttribute('data-codprod') || '').trim();
      if (Number.isNaN(id) || !codprod) continue;
      const read = (field) => {
        const inp = tr.querySelector(`input[data-field="${field}"]`);
        return this.parseMoneyInput(inp?.value);
      };
      const PRECIO = read('PRECIO');
      const MAYOREOA = read('MAYOREOA');
      const MAYOREOB = read('MAYOREOB');
      const MAYOREOC = read('MAYOREOC');
      if ([PRECIO, MAYOREOA, MAYOREOB, MAYOREOC].some((v) => v === null)) {
        throw new Error(`Revise los precios de ${codprod}`);
      }
      updates.push({ ID: id, CODPROD: codprod, PRECIO, MAYOREOA, MAYOREOB, MAYOREOC });
    }
    return updates;
  },

  async abrirRevisarPrecios() {
    const key = this.docKey();
    if (!key) {
      F.toast('No hay orden activa', 'warning');
      return;
    }
    if (!this.cargarCostosPendingLines().length) {
      F.toast('Agregue productos a la compra para revisar precios', 'warning');
      return;
    }

    let data;
    try {
      data = await F.fetchJson(this.revisarPreciosUrl(key));
    } catch (err) {
      F.toast(err.message || 'Error al cargar precios', 'error');
      return;
    }

    const rows = data?.rows || [];
    await Swal.fire({
      title: 'Revisar Precios',
      width: 'min(1100px, 96vw)',
      customClass: {
        popup: 'modal-catalogo ocm-revisar-precios-modal',
        htmlContainer: 'text-start',
      },
      html: `
        <p class="small text-muted mb-2">${this.escapeHtml(this.docLabel())} · Compare el costo actual vs el de esta compra y actualice precios de venta.</p>
        <div id="ocm-revisar-precios-body" class="ocm-rev-body">
          ${this.renderRevisarPreciosRows(rows)}
        </div>
        <div class="ocm-finalizar-footer mt-3">
          <button type="button" class="btn-modal-cancelar" id="ocm-revisar-precios-cerrar">
            ${CatalogosUI.cancelButtonHtml('Cerrar')}
          </button>
          <button type="button" class="btn-modal-guardar" id="ocm-revisar-precios-guardar"${rows.length ? '' : ' disabled'}>
            ${CatalogosUI.guardarButtonHtml('Guardar precios')}
          </button>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: false,
      focusConfirm: false,
      didOpen: () => {
        const popup = Swal.getPopup();
        document.getElementById('ocm-revisar-precios-cerrar')?.addEventListener('click', () => Swal.close());
        document.getElementById('ocm-revisar-precios-guardar')?.addEventListener('click', async (ev) => {
          const btn = ev.currentTarget;
          if (btn.disabled) return;
          let updates;
          try {
            updates = this.collectRevisarPreciosUpdates(popup);
          } catch (err) {
            F.toast(err.message || 'Datos inválidos', 'warning');
            return;
          }
          if (!updates.length) {
            F.toast('No hay filas para actualizar', 'warning');
            return;
          }
          btn.disabled = true;
          const prevHtml = btn.innerHTML;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Guardando…';
          try {
            const res = await F.fetchJson(this.revisarPreciosUrl(key), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ updates }),
            });
            F.toast(`Precios actualizados (${res.updated || updates.length})`, 'success');
            Swal.close();
          } catch (err) {
            F.toast(err.message || 'Error al guardar precios', 'error');
            btn.disabled = false;
            btn.innerHTML = prevHtml;
          }
        });
      },
    });
  },

  ocultarConfirmacionCargarCostos() {
    document.getElementById('ocm-cargar-costos-confirm')?.classList.add('d-none');
  },

  setCargarCostosStatus(message, variant = 'info') {
    const el = document.getElementById('ocm-cargar-costos-status');
    if (!el) return;
    const text = String(message ?? '').trim();
    if (!text) {
      el.textContent = '';
      el.classList.add('d-none');
      el.classList.remove('is-info', 'is-success', 'is-warning', 'is-error', 'is-loading');
      return;
    }
    el.textContent = text;
    el.classList.remove('d-none', 'is-info', 'is-success', 'is-warning', 'is-error', 'is-loading');
    el.classList.add(`is-${variant}`);
  },

  mostrarConfirmacionCargarCostos() {
    const pending = this.cargarCostosPendingLines();
    if (!pending.length) {
      this.setCargarCostosStatus('No hay líneas válidas para actualizar costos.', 'warning');
      return;
    }
    this.setCargarCostosStatus('', 'info');
    const countEl = document.getElementById('ocm-cargar-costos-count');
    if (countEl) countEl.textContent = String(pending.length);
    const panel = document.getElementById('ocm-cargar-costos-confirm');
    panel?.classList.remove('d-none');
    panel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },

  setFinalizarModalBusy(busy) {
    const cargarBtn = document.getElementById('ocm-finalizar-btn-cargar-costos');
    const confirmAceptarBtn = document.getElementById('ocm-cargar-costos-aceptar');
    const confirmCancelBtn = document.getElementById('ocm-cargar-costos-cancel');
    const submitBtn = document.getElementById('ocm-finalizar-btn-submit');
    const cancelBtn = document.getElementById('ocm-finalizar-btn-cancel');
    [cargarBtn, confirmAceptarBtn, confirmCancelBtn, submitBtn, cancelBtn].forEach((btn) => {
      if (btn) btn.disabled = busy;
    });
    const busyHtml = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Cargando…';
    if (cargarBtn) {
      cargarBtn.innerHTML = busy ? busyHtml : this.cargarCostosBtnIdleHtml();
    }
  },

  async ejecutarCargarCostosModal(key) {
    const pending = this.cargarCostosPendingLines();
    if (!pending.length) {
      this.setCargarCostosStatus('No hay líneas válidas para actualizar costos.', 'warning');
      return;
    }
    const cargarBtn = document.getElementById('ocm-finalizar-btn-cargar-costos');
    if (cargarBtn?.disabled) return;
    this.ocultarConfirmacionCargarCostos();
    this.setFinalizarModalBusy(true);
    const total = pending.length;
    let okCount = 0;
    let errCount = 0;
    const errLines = [];
    try {
      for (let i = 0; i < pending.length; i += 1) {
        const line = pending[i];
        const codprod = String(line.CODPROD || '').trim();
        const lineId = line.lineId ?? this.lineId(line);
        const label = line.DESPROD || codprod || 'Producto';
        this.setCargarCostosStatus(`Actualizando (${i + 1}/${total}): ${label}…`, 'loading');
        try {
          const body = codprod ? { codprod } : { lineId };
          const res = await F.fetchJson(this.cargarCostosUrl(key), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          okCount += 1;
          const name = res.desprod || res.codprod || label;
          const promTxt =
            res.costoPromedio != null ? ` · prom. ${this.formatMoney(res.costoPromedio)}` : '';
          this.setCargarCostosStatus(
            `(${i + 1}/${total}) ${name} — costo unit. ${this.formatMoney(res.costoUnitario)}${promTxt}`,
            'info'
          );
        } catch (err) {
          errCount += 1;
          errLines.push(`${label}: ${err.message}`);
          this.setCargarCostosStatus(`Error en ${label}: ${err.message}`, 'error');
        }
      }
      if (okCount > 0 && errCount === 0) {
        this.setCargarCostosStatus(
          `${okCount} producto(s) actualizado(s). Presione Finalizar para completar la compra.`,
          'success'
        );
      } else if (okCount > 0) {
        this.setCargarCostosStatus(
          `${okCount} actualizado(s), ${errCount} error(es). ${errLines.slice(0, 2).join(' · ')}`,
          'warning'
        );
      } else {
        this.setCargarCostosStatus(errLines[0] || 'No se pudo actualizar ningún costo.', 'error');
      }
    } finally {
      this.setFinalizarModalBusy(false);
    }
  },

  bindFinalizarModalExtras(finish) {
    document.getElementById('ocm-finalizar-btn-cancel')?.addEventListener('click', () => finish(null));
    document.getElementById('ocm-finalizar-btn-submit')?.addEventListener('click', () => {
      const value = this.readFinalizarFormForSubmit();
      if (!value) return;
      finish(value);
    });

    const concreSel = document.getElementById('ocm-finalizar-concre');
    const vencWrap = document.getElementById('ocm-finalizar-venc-wrap');
    const concreWrap = document.getElementById('ocm-finalizar-concre-wrap');
    const toggleVenc = () => {
      const isCre = concreSel?.value === 'CRE';
      vencWrap?.classList.toggle('d-none', !isCre);
      if (concreWrap) {
        concreWrap.classList.toggle('col-6', isCre);
        concreWrap.classList.toggle('col-12', !isCre);
      }
    };
    concreSel?.addEventListener('change', toggleVenc);
    toggleVenc();
    document.getElementById('ocm-finalizar-obs')?.focus();
  },

  async finalizarOrden() {
    const key = this.docKey();
    if (!key) return;
    const h = this._compra?.header;
    if (!this.docEditable(h)) {
      F.toast('La orden no está operada', 'warning');
      return;
    }
    if (!(this._compra?.lines || []).length) {
      F.toast('Agregue al menos un producto', 'warning');
      return;
    }
    if (!this.hasProveedor(h)) {
      F.toast('Seleccione un proveedor antes de finalizar', 'warning');
      return;
    }

    const proveedor = this.escapeHtml(this.proveedorLabel(h));
    const dir = this.escapeHtml(h.DOC_DIRCLIE || h.PROV_DIR || '—');
    const obsVal = this.escapeHtml(h.OBS || '');
    const concreVal = await this.resolveDefaultConcre(h);
    const vencDefault = DocFecha.inputValueFromHeader(h) || this.todayInputValue();

    const value = await new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
        Swal.close();
      };

      Swal.fire({
        ...CatalogosUI.modalBase({
          customClass: {
            popup: 'modal-catalogo ocm-finalizar-modal',
            confirmButton: 'btn-modal-guardar',
          },
        }),
        title: 'Finalizar orden',
        html: `
        <p class="small text-muted mb-3">${this.escapeHtml(this.docLabel())}</p>
        <div class="text-start">
          <div class="mb-2">
            <label class="form-label small mb-0">Proveedor</label>
            <div class="form-control form-control-sm bg-light">${proveedor}</div>
          </div>
          <div class="mb-2">
            <label class="form-label small mb-0">Dirección</label>
            <div class="form-control form-control-sm bg-light">${dir}</div>
          </div>
          <div class="row g-2 mb-2 align-items-end" id="ocm-finalizar-pago-row">
            <div class="col-${concreVal === 'CRE' ? '6' : '12'}" id="ocm-finalizar-concre-wrap">
              <label class="form-label small mb-0" for="ocm-finalizar-concre">Forma de pago</label>
              <select id="ocm-finalizar-concre" class="form-select form-select-sm">
                <option value="CON"${concreVal !== 'CRE' ? ' selected' : ''}>CONTADO</option>
                <option value="CRE"${concreVal === 'CRE' ? ' selected' : ''}>CREDITO</option>
              </select>
            </div>
            <div class="col-6${concreVal === 'CRE' ? '' : ' d-none'}" id="ocm-finalizar-venc-wrap">
              <label class="form-label small mb-0" for="ocm-finalizar-venc">Vencimiento</label>
              <input type="date" id="ocm-finalizar-venc" class="form-control form-control-sm" value="${vencDefault}">
            </div>
          </div>
          <div class="mb-0">
            <label class="form-label small mb-0" for="ocm-finalizar-obs">Observaciones</label>
            <textarea id="ocm-finalizar-obs" class="form-control form-control-sm" rows="2"
              placeholder="Observaciones…">${obsVal}</textarea>
          </div>
          <div class="ocm-finalizar-footer">
            <button type="button" class="btn-modal-cancelar" id="ocm-finalizar-btn-cancel">
              ${CatalogosUI.cancelButtonHtml('Cancelar')}
            </button>
            <button type="button" class="btn-modal-guardar" id="ocm-finalizar-btn-submit">
              ${CatalogosUI.guardarButtonHtml('Finalizar')}
            </button>
          </div>
        </div>
      `,
        icon: 'question',
        showCancelButton: false,
        showConfirmButton: false,
        focusConfirm: false,
        allowOutsideClick: true,
        didOpen: () => {
          this.bindFinalizarModalExtras(finish);
        },
      }).then(() => {
        if (!settled) resolve(null);
      });
    });

    if (!value) return;

    const url = `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(key.coddoc)}/${key.correlativo}/finalizar?empnit=${encodeURIComponent(F.getEmpNit())}`;
    await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        CONCRE: value.concre,
        VENCIMIENTO: value.vencimiento,
        OBS: value.obs,
      }),
    });
    F.toast('Orden finalizada', 'success');
    this._compra = null;
    await this.showList();
  },

  async agregarLinea(codprod, codmedida, cantidad = 1, costo) {
    const key = this.docKey();
    if (!key) {
      F.toast('No hay orden activa', 'warning');
      return;
    }
    if (!this.docEditable(this._compra?.header)) {
      F.toast('La orden no está en edición', 'warning');
      return;
    }
    const url = `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const body = { CODPROD: codprod, CODMEDIDA: codmedida, CANTIDAD: cantidad };
    if (costo !== undefined && costo !== null) body.COSTO = costo;
    const res = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    this._compra = res.compra;
    this.renderCart();
    this.renderOrderSummary();
    F.toast('Producto agregado', 'success');
  },

  async agregarLineaPse(desprod, importe) {
    const key = this.docKey();
    if (!key) {
      F.toast('No hay orden activa', 'warning');
      return;
    }
    if (!this.docEditable(this._compra?.header)) {
      F.toast('La orden no está en edición', 'warning');
      return;
    }
    const url = `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const res = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'pse',
        DESPROD: desprod,
        IMPORTE: importe,
        CANTIDAD: 1,
      }),
    });
    this._compra = res.compra;
    this.renderCart();
    this.renderOrderSummary();
    F.toast('PSE agregado', 'success');
  },

  async onAgregarPse() {
    if (!this.docEditable(this._compra?.header)) {
      F.toast('La orden no está en edición', 'warning');
      return;
    }
    const { value } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Agregar PSE',
      html: `
        <p class="small text-muted mb-2 text-start">Producto sin existencia (no está en catálogo). Medida: UNIDAD.</p>
        <label class="form-label small mb-0 text-start d-block" for="ocm-swal-pse-desprod">Descripción</label>
        <input type="text" id="ocm-swal-pse-desprod" class="form-control form-control-sm" placeholder="Descripción del producto" autocomplete="off">
        <label class="form-label small mb-0 mt-2 text-start d-block" for="ocm-swal-pse-importe">Importe</label>
        <input type="number" id="ocm-swal-pse-importe" class="form-control form-control-sm" value="0" min="0" step="any">
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Agregar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        PosProductKeyboardUI.focusInput(document.getElementById('ocm-swal-pse-desprod'));
      },
      preConfirm: () => {
        const desprod = String(document.getElementById('ocm-swal-pse-desprod')?.value || '').trim();
        if (!desprod) {
          Swal.showValidationMessage('La descripción es obligatoria');
          return false;
        }
        const importe = Number(document.getElementById('ocm-swal-pse-importe')?.value);
        if (!Number.isFinite(importe) || importe < 0) {
          Swal.showValidationMessage('Importe inválido');
          return false;
        }
        return { desprod, importe };
      },
    });
    if (!value) return;
    try {
      await this.agregarLineaPse(value.desprod, value.importe);
    } catch (err) {
      F.toast(err.message || 'No se pudo agregar el PSE', 'error');
    }
  },

  setCartBusy(busy) {
    this._cartBusy = busy;
    const tbody = this._container?.querySelector('#ocm-cart-tbody');
    tbody?.classList.toggle('pos-cart-busy', busy);
    const fab = this._container?.querySelector('#btn-ocm-finalizar');
    if (fab) fab.disabled = busy;
  },

  async actualizarCantidad(lineId, cantidad) {
    const key = this.docKey();
    if (!key) return;
    const url = `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas/${lineId}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const res = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CANTIDAD: cantidad }),
    });
    this._compra = res.compra;
    this.renderCart();
    this.renderOrderSummary();
  },

  async eliminarLinea(lineId) {
    const key = this.docKey();
    if (!key) return;
    const url = `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas/${lineId}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const res = await F.fetchJson(url, { method: 'DELETE' });
    this._compra = res.compra;
    this.renderCart();
    this.renderOrderSummary();
  },

  async onProductClick(row) {
    if (!row?.CODPROD) {
      F.toast('Producto no disponible', 'warning');
      return;
    }
    const precios = this._productos.filter((p) => String(p.CODPROD) === String(row.CODPROD));
    if (!precios.length) {
      F.toast('Sin precios habilitados', 'warning');
      return;
    }
    const defaultMedida = row.CODMEDIDA || precios[0].CODMEDIDA;
    const costByMedida = Object.fromEntries(
      precios.map((p) => [String(p.CODMEDIDA), Number(p.COSTO) || 0])
    );
    const defaultCosto = costByMedida[String(defaultMedida)] ?? 0;
    const options = precios
      .map((p) => {
        const selected = String(p.CODMEDIDA) === String(defaultMedida) ? ' selected' : '';
        return `<option value="${this.escapeHtml(p.CODMEDIDA)}"${selected}>${this.escapeHtml(p.CODMEDIDA)} — ${this.escapeHtml(this.formatMoney(p.COSTO))} (eq. ${this.escapeHtml(p.EQUIVALE)}, exist. ${this.escapeHtml(this.formatQty(p.EXISTENCIA))})</option>`;
      })
      .join('');
    const { value: picked } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: row.DESPROD || row.CODPROD,
      html: `
        <label class="form-label small mb-0">Medida</label>
        <select id="ocm-swal-medida" class="form-select form-select-sm">${options}</select>
        <div class="row g-2 mt-2 align-items-end">
          <div class="col-6">
            <label class="form-label small mb-0" for="ocm-swal-cant">Cantidad</label>
            <input type="number" id="ocm-swal-cant" class="form-control form-control-sm" value="1" min="0.01" step="any">
          </div>
          <div class="col-6">
            <label class="form-label small mb-0" for="ocm-swal-costo">Costo</label>
            <input type="number" id="ocm-swal-costo" class="form-control form-control-sm" value="${defaultCosto}" min="0" step="any">
          </div>
        </div>
        <p class="small text-muted mb-0 mt-2 text-end" id="ocm-swal-total">Total: ${this.escapeHtml(this.formatMoney(defaultCosto))}</p>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Agregar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: (popup) => {
        const medSel = document.getElementById('ocm-swal-medida');
        const costInp = document.getElementById('ocm-swal-costo');
        const cantInp = document.getElementById('ocm-swal-cant');
        const totalEl = document.getElementById('ocm-swal-total');
        const updateTotal = () => {
          const cant = Number(cantInp?.value) || 0;
          const cost = Number(costInp?.value) || 0;
          if (totalEl) totalEl.textContent = `Total: ${this.formatMoney(cant * cost)}`;
        };
        const syncCostoFromMedida = () => {
          const med = medSel?.value;
          if (med && costInp) costInp.value = String(costByMedida[med] ?? 0);
          updateTotal();
        };
        medSel?.addEventListener('change', syncCostoFromMedida);
        cantInp?.addEventListener('input', updateTotal);
        costInp?.addEventListener('input', updateTotal);
        PosProductKeyboardUI.focusInput(cantInp);
        PosProductKeyboardUI.wireModalQtyFlow({ cantInput: cantInp, priceInput: costInp, popup });
      },
      preConfirm: () => {
        const cant = Number(document.getElementById('ocm-swal-cant')?.value);
        if (!cant || cant <= 0) {
          Swal.showValidationMessage('Cantidad inválida');
          return false;
        }
        const medida = document.getElementById('ocm-swal-medida')?.value;
        if (!medida) {
          Swal.showValidationMessage('Seleccione una medida');
          return false;
        }
        const costo = Number(document.getElementById('ocm-swal-costo')?.value);
        if (Number.isNaN(costo) || costo < 0) {
          Swal.showValidationMessage('Costo inválido');
          return false;
        }
        return { medida, cantidad: cant, costo };
      },
    });
    if (picked?.medida) {
      await this.agregarLinea(row.CODPROD, picked.medida, picked.cantidad, picked.costo);
    }
  },

  renderProductList() {
    const targets = PosDocSearchUI.listTargets(this._container, 'ocm');
    if (!targets.length) return;
    if (!this._productos.length) {
      const empty =
        '<p class="text-muted small text-center py-3 mb-0">Escriba código o descripción y presione Enter</p>';
      targets.forEach((el) => {
        el.innerHTML = empty;
      });
      return;
    }
    const html = this._productos
      .map(
        (p) => `
          <div class="pos-product-item" tabindex="0" role="button"
            data-codprod="${this.escapeHtml(p.CODPROD)}"
            data-codmedida="${this.escapeHtml(p.CODMEDIDA)}"
            aria-label="Agregar ${this.escapeHtml(this.formatProdLabel(p.DESPROD, p.DESMARCA))} ${this.escapeHtml(p.CODMEDIDA)}">
            <div>
              <div class="pos-prod-code">${this.escapeHtml(p.CODPROD)} · ${this.escapeHtml(p.CODMEDIDA)}</div>
              <div>${this.renderProdNameHtml(p.DESPROD, p.DESMARCA)}</div>
              ${this.renderDesprod2Html(p)}
            </div>
            <div class="pos-prod-meta text-end">
              <div class="pos-prod-stock small text-muted">Exist. ${this.escapeHtml(this.formatQty(p.EXISTENCIA))}</div>
              <div class="pos-prod-price">${this.escapeHtml(this.formatMoney(p.COSTO))}</div>
              <div class="pos-prod-remote">${PosDocSearchUI.remoteStockButton(p.CODPROD, (v) => this.escapeHtml(v))}</div>
            </div>
          </div>
        `
      )
      .join('');
    targets.forEach((el) => {
      el.innerHTML = html;
    });
  },

  renderCart() {
    const tbody = this._container?.querySelector('#ocm-cart-tbody');
    if (!tbody) return;
    const lines = this._compra?.lines || [];
    const h = this._compra?.header;
    const editable = this.docEditable(h);
    if (!lines.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted py-3">Sin productos en la compra</td></tr>';
      return;
    }
    tbody.innerHTML = lines
      .map((ln) => {
        const lineId = this.lineId(ln);
        const qty = Number(ln.CANTIDAD) || 0;
        const qtyControls = editable
          ? `<div class="d-flex align-items-center gap-1 justify-content-center">
              <button type="button" class="btn btn-outline-secondary btn-sm pos-qty-btn" data-action="qty-minus" data-id="${lineId}"${this._cartBusy ? ' disabled' : ''}>−</button>
              <span class="px-1">${qty}</span>
              <button type="button" class="btn btn-outline-secondary btn-sm pos-qty-btn" data-action="qty-plus" data-id="${lineId}"${this._cartBusy ? ' disabled' : ''}>+</button>
            </div>`
          : `<span>${qty}</span>`;
        const delBtn = editable
          ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="line-del" data-id="${lineId}" title="Quitar"${this._cartBusy ? ' disabled' : ''}><i class="fa-solid fa-trash"></i></button>`
          : '';
        return `<tr>
          <td class="small">${this.escapeHtml(ln.CODPROD)}</td>
          <td class="small">${this.escapeHtml(ln.DESPROD)}<br><span class="text-muted">${this.escapeHtml(ln.CODMEDIDA)}</span></td>
          <td class="text-end small pos-cart-exist">${this.escapeHtml(this.formatQty(ln.EXISTENCIA))}</td>
          <td class="text-center">${qtyControls}</td>
          <td class="text-end">
            ${this.escapeHtml(this.formatMoney(ln.TOTALCOSTO))}
            ${this.linePesoHtml(ln)}
          </td>
          <td class="text-end">${delBtn}</td>
        </tr>`;
      })
      .join('');
  },

  renderOrderSummary() {
    const totalEl = this._container?.querySelector('#ocm-header-total');
    const itemsEl = this._container?.querySelector('#ocm-header-items');
    const docEl = this._container?.querySelector('#ocm-header-doc');
    const h = this._compra?.header;
    const lines = this._compra?.lines || [];
    const total = h?.TOTALCOSTO ?? 0;
    const itemCount = lines.reduce((sum, ln) => sum + (Number(ln.CANTIDAD) || 0), 0);
    if (totalEl) totalEl.textContent = this.formatMoney(total);
    const pesoEl = this._container?.querySelector('#ocm-header-peso');
    if (pesoEl) {
      if (this.muestraPesoEnDocumentos()) {
        const tp = this.calcDocTotalPeso(lines);
        pesoEl.textContent = `Peso: ${this.formatPeso(tp)}`;
        pesoEl.classList.remove('d-none');
      } else {
        pesoEl.textContent = '';
        pesoEl.classList.add('d-none');
      }
    }
    if (itemsEl) {
      itemsEl.textContent = itemCount === 1 ? '1 item' : `${itemCount} items`;
    }
    if (docEl && h) docEl.textContent = this.docLabel();
  },

  renderHeaderInfo() {
    const provEl = this._container?.querySelector('#ocm-proveedor-nombre');
    const h = this._compra?.header;
    if (provEl && h) {
      provEl.textContent = h.DOC_NOMCLIE || '—';
      const inp = this._container.querySelector('#ocm-proveedor-search');
      if (inp && !inp.matches(':focus')) inp.value = h.DOC_NOMCLIE || '';
    }
    const fechaInp = this._container?.querySelector('#ocm-doc-fecha');
    if (fechaInp && h && !fechaInp.matches(':focus')) {
      fechaInp.value = DocFecha.inputValueFromHeader(h);
    }
  },

  syncEditorControls() {
    const editable = this.docEditable(this._compra?.header);
    PosDocSearchUI.syncControls(this._container, 'ocm', editable, {
      viewKey: 'ocm',
      permiteMover: this._config?.permiteMoverBotonFinalizarEnDocumentos,
    });
    ['#ocm-proveedor-search', '#ocm-doc-fecha', '#ocm-btn-agregar-pse'].forEach((sel) => {
      const el = this._container?.querySelector(sel);
      if (el) el.disabled = !editable;
    });
    const fab = this._container?.querySelector('#btn-ocm-finalizar');
    if (fab && !DocFinalizarFab?.isEnabled(this._config?.permiteMoverBotonFinalizarEnDocumentos)) {
      fab.style.display = editable ? '' : 'none';
    }
  },

  renderAll() {
    this.renderHeaderInfo();
    this.renderCart();
    this.renderOrderSummary();
    this.syncEditorControls();
  },

  async bloquearCompra(coddoc, correlativo) {
    const label = `${coddoc} #${correlativo}`;
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Bloquear compra?',
      html: `<p class="mb-0">La compra <strong>${this.escapeHtml(label)}</strong> pasará a estado bloqueado (I). No se elimina; solo dejará de mostrarse en el listado de operados.</p>`,
      icon: 'warning',
      confirmText: 'BLOQUEAR',
      confirmClass: 'btn-catalogo-bloquear',
    });
    if (!confirm) return;
    const url = `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(coddoc)}/${correlativo}/bloquear?empnit=${encodeURIComponent(F.getEmpNit())}`;
    await F.fetchJson(url, { method: 'POST' });
    F.toast('Compra bloqueada', 'success');
    await this.fetchOrdenesList();
    this.refreshListDom();
  },

  async eliminarCompra(coddoc, correlativo) {
    const label = `${coddoc} #${correlativo}`;
    const pass = await CatalogosUI.confirmEliminarDocumento({
      label,
      tipo: 'compra',
      kind: 'documento',
      coddoc,
      correlativo,
    });
    if (!pass) return;
    const url = `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(coddoc)}/${correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    await F.fetchJson(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pass: String(pass),
        USUARIO: String(F.session('user')?.usuario || '').trim() || undefined,
      }),
    });
    F.toast('Compra eliminada', 'success');
    await this.fetchOrdenesList();
    this.refreshListDom();
  },

  async imprimirCompra(coddoc, correlativo) {
    try {
      await DocOpciones.imprimir(coddoc, correlativo);
    } catch (err) {
      F.toast(err.message || 'Error al imprimir', 'error');
    }
  },

  refreshListDom() {
    const tbody = this._container?.querySelector('#ocm-list-tbody');
    if (tbody) tbody.innerHTML = this.renderListTableBodyHtml();
    const sub = this._container?.querySelector('.pos-list-sub');
    if (sub) {
      sub.textContent = `${this.filteredOrdenesList().length} compra(s) · ${this.listFechaLabel()}`;
    }
  },

  renderListActionsHtml() {
    return `
      <button type="button" class="btn btn-sm btn-outline-primary inv-card-btn" data-action="editar" title="Editar">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button type="button" class="btn btn-sm btn-outline-secondary inv-card-btn" data-action="imprimir" title="Imprimir">
        <i class="fa-solid fa-print"></i>
      </button>
      <button type="button" class="btn btn-sm btn-outline-danger inv-card-btn" data-action="bloquear" title="Bloquear">
        <i class="fa-solid fa-lock"></i>
      </button>
      <button type="button" class="btn btn-sm btn-outline-danger inv-card-btn" data-action="eliminar" title="Eliminar">
        <i class="fa-solid fa-trash"></i>
      </button>`;
  },

  renderListTableBodyHtml() {
    const rows = this.filteredOrdenesList();
    if (!rows.length) {
      return `<tr><td colspan="10" class="text-center text-muted py-4">No hay compras en esta fecha</td></tr>`;
    }
    return rows
      .map((r) => {
        const label = `${r.CODDOC} #${r.CORRELATIVO}`;
        const proveedor = r.DOC_NOMCLIE || r.EMPRESA || r.RAZONSOCIAL || 'Sin proveedor';
        const meta = [r.EMPRESA, r.RAZONSOCIAL].filter(Boolean).join(' · ') || '—';
        return `
          <tr class="ocm-list-row" data-coddoc="${this.escapeHtml(r.CODDOC)}"
            data-correlativo="${r.CORRELATIVO}">
            <td class="fw-semibold text-nowrap">${this.escapeHtml(label)}</td>
            <td class="text-center text-nowrap">${DocStatus.badgeHtml(r.STATUS, (v) => this.escapeHtml(v))}</td>
            <td>${this.escapeHtml(proveedor)}</td>
            <td class="small text-muted doc-list-col-optional">${this.escapeHtml(meta)}</td>
            <td class="fac-fel-col doc-list-col-optional">${this.formatFelCell(r)}</td>
            <td class="text-center doc-list-col-optional">${Number(r.LINEAS) || 0}</td>
            <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(r.TOTALCOSTO))}</td>
            <td class="text-nowrap doc-list-col-optional">${this.escapeHtml(this.formatFechaCompra(r))}</td>
            <td class="text-nowrap doc-list-col-optional">${this.escapeHtml(this.formatHoraCompra(r))}</td>
            <td class="text-end text-nowrap fac-list-actions">${this.renderListActionsHtml(r)}</td>
          </tr>`;
      })
      .join('');
  },

  renderListTableHtml() {
    return `
      <div class="card fac-list-table-card shadow-sm">
        <div class="table-responsive fac-list-table-scroll">
          <table class="table table-sm table-hover table-striped mb-0">
            <thead class="table-light sticky-top">
              <tr>
                <th scope="col">Documento</th>
                <th scope="col" class="text-center">Estado</th>
                <th scope="col">Proveedor</th>
                <th scope="col" class="doc-list-col-optional">Empresa</th>
                <th scope="col" class="doc-list-col-optional">FEL</th>
                <th scope="col" class="text-center doc-list-col-optional">Líneas</th>
                <th scope="col" class="text-end">Total</th>
                <th scope="col" class="doc-list-col-optional">Fecha</th>
                <th scope="col" class="doc-list-col-optional">Hora</th>
                <th scope="col" class="text-end fac-list-actions">Acciones</th>
              </tr>
            </thead>
            <tbody id="ocm-list-tbody">${this.renderListTableBodyHtml()}</tbody>
          </table>
        </div>
      </div>`;
  },

  renderListScreen() {
    const count = this.filteredOrdenesList().length;
    return `
      <div class="pos-list-wrap">
        <div class="pos-list-header">
          <h2 class="pos-list-title">Seleccione una compra o cree una nueva</h2>
          <p class="pos-list-sub text-muted mb-0">${count} compra(s) · ${this.escapeHtml(this.listFechaLabel())}</p>
        </div>
        <div class="fac-list-toolbar mb-3">
          <div class="fac-list-toolbar-fecha">
            <label class="form-label small mb-1" for="ocm-list-fecha">Fecha</label>
            <input type="date" class="form-control form-control-sm" id="ocm-list-fecha"
              value="${this.escapeHtml(this._listFecha || this.todayIsoDate())}" aria-label="Fecha del listado">
          </div>
          ${DocTipoSelect.renderSelectHtml({
            selectId: 'ocm-list-coddoc',
            tipos: this._config?.tiposDocumento,
            selected: this.activeCoddoc(),
            label: 'Serie',
            className: 'doc-tipo-select-wrap fac-list-toolbar-serie',
          })}
          <div class="fac-list-toolbar-search flex-grow-1">
            <label class="form-label small mb-1" for="ocm-list-search">Buscar</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input type="search" class="form-control pos-search-glow" id="ocm-list-search"
                placeholder="Buscar compra, proveedor…" value="${this.escapeHtml(this._listFilter)}" autocomplete="off">
            </div>
          </div>
        </div>
        ${this.renderListTableHtml()}
        <button type="button" class="btn-onneb-nuevo-fab pos-list-fab-nuevo" id="btn-ocm-list-nuevo"
          aria-label="Nueva orden" title="Nueva orden"${this.activeCoddoc() ? '' : ' disabled'}>
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>`;
  },

  renderEditorShell() {
    const tipoLabel = this._config?.tiposDocumento?.[0]?.DESDOC || 'Compras';
    const editable = this.docEditable(this._compra?.header);
    return `
      <div class="pos-vista-wrap">
        <div class="pos-header card shadow-sm">
          <div class="card-body pos-header-body">
            <div class="pos-header-top d-flex flex-wrap align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary pos-btn-atras" id="btn-ocm-atras">
                <i class="fa-solid fa-arrow-left me-1"></i>Atrás
              </button>
              <div class="pos-header-brand">
                ${typeof EmpresaLogo !== 'undefined' ? EmpresaLogo.posHeaderLogoHtml() : '<img src="/icons/icon-72.png" width="40" height="40" alt="OnneB" class="pos-header-logo">'}
              </div>
              <div class="pos-header-doc-label small fw-semibold" id="ocm-header-doc">${this.escapeHtml(this.docLabel())}</div>
              <div class="pos-doc-meta-fields d-flex flex-wrap align-items-end gap-2">
                ${DocFecha.renderField('ocm-doc-fecha', this._compra?.header)}
              </div>
              <div class="pos-header-summary ms-auto text-end">
                <h3 class="pos-header-total mb-0" id="ocm-header-total">Q 0.00</h3>
                <div class="small text-muted d-none" id="ocm-header-peso"></div>
                <div class="pos-header-items" id="ocm-header-items">0 items</div>
              </div>
            </div>
          </div>
        </div>
        <div class="pos-main">
          <div class="pos-panel pos-panel-search card shadow-sm">
            <div class="card-header py-2 d-flex align-items-center gap-2">
              <i class="fa-solid fa-box"></i>
              <span class="fw-semibold">Productos</span>
              <span class="small text-muted">(${this.escapeHtml(tipoLabel)})</span>
            </div>
            <div class="card-body">
              <div class="input-group input-group-sm mb-2 pos-search-group">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control pos-search-glow" id="ocm-product-search"
                  placeholder="Código o descripción… (Enter)" autocomplete="off"${editable ? '' : ' disabled'}>
                <button type="button" class="btn btn-outline-secondary text-nowrap" id="ocm-btn-agregar-pse"
                  title="Agregar producto sin existencia"${editable ? '' : ' disabled'}>Agregar PSE</button>
              </div>
              <div class="pos-product-list" id="ocm-product-list"></div>
            </div>
          </div>
          <div class="pos-panel pos-panel-cart card shadow-sm">
            <div class="card-header py-2 d-flex align-items-center gap-2 flex-wrap">
              <div class="d-flex align-items-center gap-2">
                <i class="fa-solid fa-receipt"></i>
                <span class="fw-semibold">Compra actual</span>
              </div>
              ${editable ? `
              <button type="button" class="btn btn-sm btn-outline-secondary ms-auto" id="ocm-btn-revisar-precios"
                title="Comparar costos y actualizar precios de venta">
                <i class="fa-solid fa-tags me-1" aria-hidden="true"></i>Revisar Precios
              </button>` : ''}
            </div>
            <div class="card-body">
              <div class="pos-cliente-wrap mb-2 position-relative">
                <label class="form-label small mb-1">Proveedor</label>
                <div class="input-group input-group-sm">
                  <input type="search" class="form-control pos-search-glow" id="ocm-proveedor-search"
                    placeholder="Buscar proveedor…" autocomplete="off"${editable ? '' : ' disabled'}>
                  <button type="button" class="btn btn-outline-primary text-nowrap" id="ocm-proveedor-nuevo"
                    title="Nuevo proveedor"${editable ? '' : ' disabled'}>Nuevo</button>
                </div>
                <div id="ocm-proveedor-nombre" class="small text-muted mt-1"></div>
                <div id="ocm-proveedor-results" class="list-group position-absolute w-100 shadow-sm d-none"
                  style="z-index: 20; max-height: 200px; overflow-y: auto;"></div>
              </div>
              <div class="pos-cart-table flex-grow-1 d-flex flex-column">
                <div class="table-responsive">
                  <table class="table table-sm table-hover mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Cód.</th>
                        <th>Producto</th>
                        <th class="text-end">Exist.</th>
                        <th class="text-center">Cant.</th>
                        <th class="text-end">Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody id="ocm-cart-tbody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${editable ? PosDocSearchUI.fabBarHtml('ocm') : ''}
        ${PosDocSearchUI.productModalHtml('ocm')}
      </div>`;
  },

  bindListEvents() {
    const search = this._container?.querySelector('#ocm-list-search');
    search?.addEventListener('input', () => {
      this._listFilter = search.value;
      this.refreshListDom();
    });

    const fechaInp = this._container?.querySelector('#ocm-list-fecha');
    fechaInp?.addEventListener('change', async () => {
      const val = fechaInp.value?.trim();
      if (!val || val === this._listFecha) return;
      this._listFecha = val;
      this._listFilter = search?.value || '';
      try {
        await this.fetchOrdenesList();
        this.refreshListDom();
      } catch (err) {
        F.toast(err.message || 'Error al cargar compras', 'error');
      }
    });

    DocTipoSelect.bind(this._container, 'ocm-list-coddoc', this);

    this._container?.querySelector('#ocm-list-tbody')?.addEventListener('click', async (e) => {
      const felLink = e.target.closest('[data-action="fel-open"]');
      if (felLink) {
        e.preventDefault();
        e.stopPropagation();
        const fel = felLink.getAttribute('data-fel-uudi');
        await this.abrirFelDocumento(fel);
        return;
      }

      const btn = e.target.closest('.inv-card-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const row = btn.closest('.ocm-list-row');
      if (!row) return;
      const coddoc = row.getAttribute('data-coddoc');
      const correlativo = row.getAttribute('data-correlativo');
      const action = btn.getAttribute('data-action');
      try {
        if (action === 'editar') await this.showEditor(coddoc, correlativo);
        else if (action === 'imprimir') await this.imprimirCompra(coddoc, correlativo);
        else if (action === 'bloquear') await this.bloquearCompra(coddoc, correlativo);
        else if (action === 'eliminar') await this.eliminarCompra(coddoc, correlativo);
      } catch (err) {
        F.toast(err.message || 'Error', 'error');
      }
    });

    this._container?.querySelector('#btn-ocm-list-nuevo')?.addEventListener('click', () => this.onNuevaOrden());

    PosDocSearchUI.bindDocKeyboard(this, {
      isDetail: () => false,
      onNuevo: () => this.onNuevaOrden(),
    });
  },

  bindEditorEvents() {
    PosDocSearchUI.bind(this, 'ocm', {
      getEditable: () => this.docEditable(this._compra?.header),
      buscarProductos: this.buscarProductos,
      onProductPick: (row) => this.onProductClick(row),
    });

    PosDocSearchUI.bindDocKeyboard(this, {
      isDetail: () => true,
      getEditable: () => this.docEditable(this._compra?.header),
      onNuevo: () => this.onNuevaOrden(),
      onFinalizar: () => this.finalizarOrden(),
    });

    this._container?.querySelector('#ocm-proveedor-nuevo')?.addEventListener('click', () => {
      this.onNuevoProveedor().catch((err) => F.toast(err.message, 'error'));
    });

    this._container?.querySelector('#ocm-btn-agregar-pse')?.addEventListener('click', () => {
      this.onAgregarPse().catch((err) => F.toast(err.message || 'Error al agregar PSE', 'error'));
    });

    this._container?.querySelector('#ocm-cart-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled || this._cartBusy) return;
      e.preventDefault();
      const id = Number(btn.getAttribute('data-id'));
      const line = this.findLineById(id);
      if (!line) {
        F.toast('No se encontró la línea de la compra', 'warning');
        return;
      }
      const action = btn.getAttribute('data-action');
      this.setCartBusy(true);
      this.renderCart();
      try {
        if (action === 'line-del') {
          await this.eliminarLinea(id);
          return;
        }
        const qty = Number(line.CANTIDAD) || 1;
        if (action === 'qty-plus') await this.actualizarCantidad(id, qty + 1);
        else if (action === 'qty-minus') {
          if (qty <= 1) await this.eliminarLinea(id);
          else await this.actualizarCantidad(id, qty - 1);
        }
      } catch (err) {
        F.toast(err.message || 'Error al actualizar la compra', 'error');
      } finally {
        this.setCartBusy(false);
        this.renderCart();
      }
    });

    this._container?.querySelector('#btn-ocm-atras')?.addEventListener('click', () => this.showList());
    this._container?.querySelector('#btn-ocm-finalizar')?.addEventListener('click', () => {
      this.finalizarOrden().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#ocm-btn-revisar-precios')?.addEventListener('click', () => {
      this.abrirRevisarPrecios().catch((err) => F.toast(err.message || 'Error al revisar precios', 'error'));
    });

    const fechaInp = this._container?.querySelector('#ocm-doc-fecha');
    if (fechaInp) {
      fechaInp.addEventListener('change', () => {
        if (fechaInp.disabled) return;
        const val = fechaInp.value?.trim();
        if (!val) return;
        this.guardarFechaDocumento(val).catch((err) => F.toast(err.message, 'error'));
      });
    }

    const provSearch = this._container?.querySelector('#ocm-proveedor-search');
    const provList = this._container?.querySelector('#ocm-proveedor-results');
    if (provSearch && provList) {
      const runProv = F.debounce(async () => {
        const q = provSearch.value.trim();
        if (q.length < 2) {
          provList.classList.add('d-none');
          return;
        }
        try {
          const rows = await this.buscarProveedores(q);
          if (!rows.length) {
            provList.innerHTML = '<div class="list-group-item small text-muted">Sin resultados</div>';
          } else {
            provList.innerHTML = rows
              .map(
                (p) =>
                  `<button type="button" class="list-group-item list-group-item-action small"
                    data-codprov="${p.CODPROV}">
                    <strong>${this.escapeHtml(p.EMPRESA || p.RAZONSOCIAL)}</strong>
                    <span class="text-muted d-block">${this.escapeHtml(p.RAZONSOCIAL || '')} · ${this.escapeHtml(p.NIT || '')}</span>
                  </button>`
              )
              .join('');
          }
          provList.classList.remove('d-none');
        } catch (err) {
          provList.innerHTML = `<div class="list-group-item text-danger small">${this.escapeHtml(err.message)}</div>`;
          provList.classList.remove('d-none');
        }
      }, 350);
      provSearch.addEventListener('input', runProv);
      provList.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-codprov]');
        if (!btn) return;
        const cod = parseInt(btn.getAttribute('data-codprov'), 10);
        provList.classList.add('d-none');
        await this.aplicarProveedor(cod);
      });
      if (typeof PosProductKeyboardUI !== 'undefined') {
        PosProductKeyboardUI.bindPartyResultsKeyboard(provSearch, provList, {
          itemSelector: 'button[data-codprov]',
        });
      }
      document.addEventListener('click', (e) => {
        if (!provSearch.contains(e.target) && !provList.contains(e.target)) {
          provList.classList.add('d-none');
        }
      });
    }
  },

  async buscarProductos(q) {
    const term = String(q ?? '').trim();
    if (!term) {
      PosDocSearchUI.resetProductSearch(this, 'ocm');
      return;
    }
    if (this._loadingProducts) return;
    this._loadingProducts = true;
    const spinner = '<p class="text-muted small text-center py-3"><i class="fa-solid fa-spinner fa-spin"></i></p>';
    PosDocSearchUI.setListsHtml(this._container, 'ocm', spinner);
    try {
      const data = await this.fetchProductos(term);
      this._productos = data.rows || [];
      if (!this._productos.length) {
        PosDocSearchUI.setListsHtml(
          this._container,
          'ocm',
          '<p class="text-muted small text-center py-3 mb-0">Sin resultados para la búsqueda</p>'
        );
        return;
      }
      this.renderProductList();
    } catch (err) {
      const errHtml = `<p class="text-danger small text-center py-3">${this.escapeHtml(err.message)}</p>`;
      PosDocSearchUI.setListsHtml(this._container, 'ocm', errHtml);
    } finally {
      this._loadingProducts = false;
    }
  },

  async buscarProveedores(q) {
    const data = await F.fetchJson(this.apiUrl('/proveedores', { q, limit: '15', _: Date.now() }));
    return data.rows || [];
  },

  async guardarFechaDocumento(fecha) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._compra?.header)) return;
    const actual = DocFecha.inputValueFromHeader(this._compra.header);
    if (fecha === actual) return;
    const url = `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(key.coddoc)}/${key.correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._compra = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ FECHA: fecha }),
    });
    this.renderHeaderInfo();
    F.toast('Fecha actualizada', 'success');
  },

  async guardarFacturaCompra(seriefac, nofac) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._compra?.header)) return;
    const h = this._compra.header;
    const s = String(seriefac ?? '').trim();
    const n = String(nofac ?? '').trim();
    if (s === String(h.SERIEFAC || '').trim() && n === String(h.NOFAC || '').trim()) return;
    const url = `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(key.coddoc)}/${key.correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._compra = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ SERIEFAC: s, NOFAC: n }),
    });
    this.renderHeaderInfo();
  },

  async aplicarProveedor(codprov) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._compra?.header)) return;
    const url = `/api/ordenes-compra/ordenes-compra/${encodeURIComponent(key.coddoc)}/${key.correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._compra = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CODPROV: codprov }),
    });
    this.renderHeaderInfo();
    F.toast('Proveedor actualizado', 'success');
  },

  async onNuevoProveedor() {
    if (!this.docEditable(this._compra?.header)) {
      F.toast('La orden no está en edición', 'warning');
      return;
    }
    const data = await ProveedoresView.showForm('Nuevo proveedor', {}, false, { profile: 'documento' });
    if (!data) return;
    try {
      const res = await F.fetchJson(ProveedoresView.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const cod = res.CODPROV;
      if (!cod) throw new Error('No se recibió el código del proveedor');
      await this.aplicarProveedor(cod);
      const inp = this._container?.querySelector('#ocm-proveedor-search');
      if (inp) inp.value = data.EMPRESA || String(cod);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async showList() {
    this._screen = 'list';
    this._compra = null;
    PosDocSearchUI.unbindDocKeyboard(this);
    PosDocSearchUI.teardown('ocm');
    try {
      await DocTipoSelect.reloadTiposDocumento(this);
    } catch (err) {
      console.warn('[Órdenes de compra] reload tipodocumentos:', err?.message || err);
      if (this._config) DocTipoSelect.initView(this);
    }
    await this.fetchOrdenesList();
    this._container.innerHTML = this.renderListScreen();
    this.bindListEvents();
  },

  async showEditor(coddoc, correlativo, opts = {}) {
    this._screen = 'editor';
    PosDocSearchUI.unbindDocKeyboard(this);
    PosDocSearchUI.teardown('ocm');
    if (coddoc && correlativo) {
      await this.loadCompra(coddoc, correlativo, { skipRender: true });
    }
    this._container.innerHTML = this.renderEditorShell();
    this.bindEditorEvents();
    PosDocSearchUI.resetProductSearch(this, 'ocm');
    this.renderAll();
    if (opts.focusProductSearch) {
      PosDocSearchUI.focusProductSearch(this._container, 'ocm');
    }
  },

  async onNuevaOrden() {
    try {
      if (this._container?.querySelector('#ocm-list-coddoc')) {
        DocTipoSelect.syncFromDom(this._container, 'ocm-list-coddoc', this);
      }
      await this.crearOrden();
      const key = this.docKey();
      if (key) await this.showEditor(key.coddoc, key.correlativo, { focusProductSearch: true });
    } catch (err) {
      F.toast(err.message || 'Error al crear orden', 'error');
    }
  },

  async load(container) {
    PosDocSearchUI.clearActiveDocKeyboard();
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-2', 'p-md-3');

    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese de nuevo.
        </div>`;
      return;
    }

    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando órdenes de compra…</div>`;

    try {
      this._config = await this.fetchConfig();
      DocTipoSelect.initView(this);
      if (!this._config.coddocDefault) {
        container.innerHTML = `
          <div class="alert alert-warning m-3 w-100">
            Configure un tipo de documento <strong>OCM</strong> (órdenes de compra) activo para esta empresa.
          </div>`;
        return;
      }
      this._listFecha = this.todayIsoDate();
      this._listFilter = '';
      this._ordenesList = [];
      await this.showList();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
    }
  },
};
