/**
 * Vista Facturación — Facturas normales (TIPODOC=FAC) o Electrónicas (FEF/FEC/FES).
 */
const FacturacionView = {
  _grupo: 'fac',
  _tituloModulo: 'Facturas normales',
  _container: null,
  _config: null,
  _pedido: null,
  _productos: [],
  _pedidosList: [],
  _listFilter: '',
  _listFecha: null,
  _selectedCoddoc: '',
  _screen: 'list',
  _loadingProducts: false,
  _searchTimer: null,
  _cartBusy: false,
  _vendedores: [],
  _cajas: [],
  _selectedCodcaja: null,
  _precioCampo: 'PRECIO',
  _urlFel: '',
  _pedidosEnvList: [],
  _pedidoEnvModalOpen: false,
  _pedidoEnvFilter: '',

  PRECIO_CAMPO_OPTIONS: [
    { value: 'PRECIO', label: 'PRECIO PUBLICO' },
    { value: 'MAYOREOC', label: 'MAYORISTA C' },
    { value: 'MAYOREOB', label: 'MAYORISTA B' },
    { value: 'MAYOREOA', label: 'MAYORISTA A' },
  ],

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
    const params = new URLSearchParams({
      empnit: emp,
      grupo: this._grupo || 'fac',
      ...extraParams,
    });
    return `/api/facturacion${segment}?${params}`;
  },

  tipodocsLabelHtml() {
    if (this._grupo === 'fel') {
      return '<strong>FEF</strong>, <strong>FES</strong> o <strong>FEC</strong>';
    }
    return '<strong>FAC</strong>';
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

  formatFormaPago(concre) {
    return String(concre || 'CON').trim().toUpperCase() === 'CRE' ? 'Crédito' : 'Contado';
  },

  formatCajaLista(row) {
    const desc = String(row?.DESCAJA || '').trim();
    if (desc) return desc;
    const cod = row?.CODCAJA;
    if (cod != null && cod !== '' && Number(cod) !== 0) return `Caja ${cod}`;
    return '—';
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

  formatFechaPedido(row) {
    return DocFecha.formatDisplay(row);
  },

  formatHoraPedido(row) {
    if (row?.HORA == null || row?.HORA === '') return '—';
    const h = String(Number(row.HORA)).padStart(2, '0');
    const m = String(Number(row.MINUTO ?? 0)).padStart(2, '0');
    return `${h}:${m}`;
  },

  todayIsoDate() {
    return DocFecha.todayIsoDate();
  },

  rowFechaIso(row) {
    return DocFecha.fechaIsoFromHeader(row);
  },

  pedidosForSelectedDate() {
    return this._pedidosList || [];
  },

  listFechaLabel() {
    const s = String(this._listFecha || '').slice(0, 10);
    const [y, m, d] = s.split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
    return s || '—';
  },

  FEL_TIPOS_CERTIFICABLES: ['FEF', 'FEC', 'FNC'],

  felUudiValue(row) {
    return String(row?.FEL_UUDI ?? row?.FEL ?? '').trim();
  },

  needsCertificar(row) {
    if (this.felUudiValue(row)) return false;
    const tipodoc = String(row?.TIPODOC || '').trim().toUpperCase();
    return this.FEL_TIPOS_CERTIFICABLES.includes(tipodoc);
  },

  formatFelCell(row) {
    const v = this.felUudiValue(row);
    if (!v) return '—';
    const label =
      v.length <= 16 ? this.escapeHtml(v) : this.escapeHtml(`${v.slice(0, 8)}…${v.slice(-4)}`);
    return `<button type="button" class="btn btn-link btn-sm p-0 fac-fel-link text-start"
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

  puedeFraccionar(row) {
    if (this._grupo !== 'fac') return false;
    const idCola = Number(row?.ID_COLA_TRABAJO);
    return !(Number.isFinite(idCola) && idCola > 0);
  },

  renderListActionsHtml(row) {
    const certBtn = this.needsCertificar(row)
      ? `<button type="button" class="btn btn-sm btn-outline-success inv-card-btn" data-action="certificar" title="Certificar FEL">
          <i class="fa-solid fa-certificate me-1"></i>CERTIFICAR
        </button>`
      : '';
    const fraccionarBtn = this.puedeFraccionar(row)
      ? `<button type="button" class="btn btn-sm btn-outline-warning inv-card-btn" data-action="fraccionar" title="Fraccionar factura">
          <i class="fa-solid fa-scissors me-1"></i>Fraccionar factura
        </button>`
      : '';
    return `
      <button type="button" class="btn btn-sm btn-outline-primary inv-card-btn" data-action="editar" title="Editar">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button type="button" class="btn btn-sm btn-outline-secondary inv-card-btn" data-action="imprimir" title="Imprimir">
        <i class="fa-solid fa-print"></i>
      </button>
      ${certBtn}
      ${fraccionarBtn}
      <button type="button" class="btn btn-sm btn-outline-danger inv-card-btn" data-action="eliminar" title="Eliminar">
        <i class="fa-solid fa-trash"></i>
      </button>`;
  },

  docKey() {
    if (!this._pedido?.header) return null;
    const h = this._pedido.header;
    return { coddoc: h.CODDOC, correlativo: Number(h.CORRELATIVO) };
  },

  docLabel() {
    const h = this._pedido?.header;
    if (!h) return 'Sin pedido';
    return `${h.CODDOC} #${h.CORRELATIVO}`;
  },

  lineId(ln) {
    return ln?.ID ?? ln?.Id ?? null;
  },

  findLineById(id) {
    const n = Number(id);
    if (Number.isNaN(n)) return null;
    return (this._pedido?.lines || []).find((l) => Number(this.lineId(l)) === n) || null;
  },

  usuario() {
    const u = F.session('user');
    return u?.username || 'FAC';
  },

  clienteTipoNegocio(h) {
    if (!h) return '—';
    const tipo = String(h.CLI_TIPONEGOCIO || h.TIPONEGOCIO || '').trim();
    const neg = String(h.CLI_NEGOCIO || h.NEGOCIO || '').trim();
    if (tipo && neg) return `${tipo} — ${neg}`;
    return tipo || neg || '—';
  },

  hasCliente(h) {
    const cod = h?.CODCLIENTE;
    if (cod == null || cod === '' || Number(cod) <= 0) return false;
    const nom = String(h.DOC_NOMCLIE || h.CLI_NOMBRE || '').trim();
    return nom.length > 0;
  },

  hasVendedor(h) {
    const cod = h?.CODVEN;
    return cod != null && cod !== '' && Number(cod) > 0;
  },

  documentoTieneOrigen(h) {
    const serie = String(h?.SERIEFAC ?? '').trim();
    const nofac = String(h?.NOFAC ?? '').trim();
    return serie.length > 0 && nofac.length > 0;
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
    if (this.documentoTieneOrigen(h)) {
      return String(h.CONCRE || 'CON').trim().toUpperCase() === 'CRE' ? 'CRE' : 'CON';
    }
    try {
      return await this.fetchCobroPredeterminado();
    } catch {
      return String(h.CONCRE || 'CON').trim().toUpperCase() === 'CRE' ? 'CRE' : 'CON';
    }
  },

  syncClienteSearchEmphasis() {
    const h = this._pedido?.header;
    const inp = this._container?.querySelector('#fac-cliente-search');
    if (!inp) return;
    const highlight = this.docEditable(h) && !this.hasCliente(h);
    inp.classList.toggle('pos-cliente-search-required', highlight);
  },

  syncVendedorEmphasis() {
    const h = this._pedido?.header;
    const sel = this._container?.querySelector('#fac-doc-vendedor');
    if (!sel) return;
    const highlight = this.docEditable(h) && !this.hasVendedor(h);
    sel.classList.toggle('pos-doc-vendedor-required', highlight);
  },

  activeCoddoc() {
    return DocTipoSelect.active(this);
  },

  async fetchConfig() {
    return F.fetchJson(this.apiUrl('/config', { _: Date.now() }));
  },

  async fetchProductos(q) {
    return F.fetchJson(
      this.apiUrl('/productos', {
        limit: '40',
        campoPrecio: this._precioCampo,
        ...(q ? { q } : {}),
        _: String(Date.now()),
      })
    );
  },

  async fetchPedidosList() {
    const fecha = String(this._listFecha || this.todayIsoDate()).slice(0, 10);
    this._listFecha = fecha;
    const data = await F.fetchJson(this.apiUrl('/pedidos', { fecha, _: String(Date.now()) }));
    this._pedidosList = data.rows || [];
    if (data.fecha) this._listFecha = String(data.fecha).slice(0, 10);
    return this.pedidosForSelectedDate();
  },

  filteredPedidosList() {
    const base = this.pedidosForSelectedDate();
    const q = this._listFilter.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) => {
      const hay = [
        r.CODDOC,
        r.CORRELATIVO,
        r.DOC_NOMCLIE,
        r.NEGOCIO,
        r.TIPONEGOCIO,
        r.VENDEDOR,
        r.FEL_UUDI,
        r.OBS,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  },

  async loadPedido(coddoc, correlativo, opts = {}) {
    this._pedido = await F.fetchJson(
      this.apiUrl(`/pedidos/${encodeURIComponent(coddoc)}/${correlativo}`, { _: Date.now() })
    );
    if (this._screen === 'editor' && !opts.skipRender) this.renderAll();
  },

  async crearPedido() {
    const body = {
      CODDOC: this.activeCoddoc(),
      CODCLIENTE: this._config?.clienteDefault?.CODCLIENTE,
      USUARIO: this.usuario(),
    };
    const url = this.apiUrl('/pedidos');
    this._pedido = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    F.toast('Nuevo pedido creado', 'success');
  },

  docEditable(header) {
    return (
      DocFecha.editableStatus(header?.STATUS) &&
      String(header?.CORTE || 'NO').trim().toUpperCase() !== 'SI'
    );
  },

  docTotalPrecio(header) {
    const n = Number(header?.TOTALPRECIO ?? 0);
    return Number.isFinite(n) ? n : 0;
  },

  fpagoInputValue(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return '0';
    return String(Math.round(n * 100) / 100);
  },

  renderFinalizarFpagoCardHtml(totalPrecio, concreVal) {
    const isCre = concreVal === 'CRE';
    const total = this.fpagoInputValue(totalPrecio);
    const efectivoDefault = isCre ? '0' : total;
    const hidden = isCre ? ' d-none' : '';
    return `
          <div class="card fac-finalizar-fpago-card h-100${hidden}" id="fac-finalizar-fpago-card">
            <div class="card-header py-2 px-3 small fw-semibold bg-light border-0">
              <i class="fa-solid fa-wallet me-1 text-primary"></i>Formas de pago
            </div>
            <div class="card-body py-2 px-3 d-flex flex-column">
              <p class="small text-muted mb-2">Distribuya el total <strong>${this.escapeHtml(this.formatMoney(totalPrecio))}</strong> entre los medios de pago.</p>
              <div class="row g-2 flex-grow-1">
                <div class="col-6">
                  <label class="form-label small mb-0" for="fac-finalizar-fpago-efectivo">Efectivo</label>
                  <input type="number" id="fac-finalizar-fpago-efectivo" class="form-control form-control-sm fac-fpago-input"
                    min="0" step="0.01" value="${efectivoDefault}"${isCre ? ' disabled' : ''}>
                </div>
                <div class="col-6">
                  <label class="form-label small mb-0" for="fac-finalizar-fpago-tarjeta">Tarjeta</label>
                  <input type="number" id="fac-finalizar-fpago-tarjeta" class="form-control form-control-sm fac-fpago-input"
                    min="0" step="0.01" value="0"${isCre ? ' disabled' : ''}>
                </div>
                <div class="col-6">
                  <label class="form-label small mb-0" for="fac-finalizar-fpago-deposito">Depósito</label>
                  <input type="number" id="fac-finalizar-fpago-deposito" class="form-control form-control-sm fac-fpago-input"
                    min="0" step="0.01" value="0"${isCre ? ' disabled' : ''}>
                </div>
                <div class="col-6">
                  <label class="form-label small mb-0" for="fac-finalizar-fpago-cheque">Cheque</label>
                  <input type="number" id="fac-finalizar-fpago-cheque" class="form-control form-control-sm fac-fpago-input"
                    min="0" step="0.01" value="0"${isCre ? ' disabled' : ''}>
                </div>
              </div>
              <div class="mt-2 small text-end text-muted" id="fac-finalizar-fpago-sum">Suma: ${this.escapeHtml(isCre ? 'Q 0.00' : this.formatMoney(totalPrecio))} / ${this.escapeHtml(total)}</div>
              <div class="mt-2 mb-0">
                <label class="form-label small mb-0" for="fac-finalizar-fpago-desc">Detalles del pago</label>
                <input type="text" id="fac-finalizar-fpago-desc" class="form-control form-control-sm"
                  placeholder="No. boleta, cheque o tarjeta (opcional)" maxlength="200"${isCre ? ' disabled' : ''}>
              </div>
            </div>
          </div>`;
  },

  sumFinalizarFpagoInputs() {
    const ids = [
      'fac-finalizar-fpago-efectivo',
      'fac-finalizar-fpago-tarjeta',
      'fac-finalizar-fpago-deposito',
      'fac-finalizar-fpago-cheque',
    ];
    return ids.reduce((acc, id) => acc + (Number(document.getElementById(id)?.value ?? 0) || 0), 0);
  },

  validateFinalizarFpago(concre, totalPrecio) {
    if (concre === 'CRE') return null;
    const sum = Math.round(this.sumFinalizarFpagoInputs() * 1000) / 1000;
    const total = Math.round(Number(totalPrecio) * 1000) / 1000;
    if (sum <= 0) return 'Indique la forma de pago por el monto total de la factura';
    if (Math.abs(sum - total) > 0.001) {
      return `La suma (${this.formatMoney(sum)}) debe ser igual al total (${this.formatMoney(total)})`;
    }
    return null;
  },

  bindFinalizarFpagoToggle(totalPrecio) {
    const concreSel = document.getElementById('fac-finalizar-concre');
    const card = document.getElementById('fac-finalizar-fpago-card');
    const fpagoCol = document.getElementById('fac-finalizar-fpago-col');
    const datosCol = document.querySelector('.fac-finalizar-datos-col');
    const efectivo = document.getElementById('fac-finalizar-fpago-efectivo');
    const tarjeta = document.getElementById('fac-finalizar-fpago-tarjeta');
    const deposito = document.getElementById('fac-finalizar-fpago-deposito');
    const cheque = document.getElementById('fac-finalizar-fpago-cheque');
    const desc = document.getElementById('fac-finalizar-fpago-desc');
    const sumEl = document.getElementById('fac-finalizar-fpago-sum');
    const inputs = [efectivo, tarjeta, deposito, cheque, desc];
    const refreshSum = () => {
      if (!sumEl) return;
      const sum = this.sumFinalizarFpagoInputs();
      sumEl.textContent = `Suma: ${this.formatMoney(sum)} / ${this.formatMoney(totalPrecio)}`;
    };
    const toggle = () => {
      const isCre = concreSel?.value === 'CRE';
      card?.classList.toggle('d-none', isCre);
      fpagoCol?.classList.toggle('d-none', isCre);
      datosCol?.classList.toggle('col-md-12', isCre);
      datosCol?.classList.toggle('col-md-6', !isCre);
      inputs.forEach((el) => {
        if (!el) return;
        el.disabled = isCre;
      });
      if (isCre) {
        if (efectivo) efectivo.value = '0';
        if (tarjeta) tarjeta.value = '0';
        if (deposito) deposito.value = '0';
        if (cheque) cheque.value = '0';
        if (desc) desc.value = '';
      } else if (efectivo && Number(efectivo.value || 0) <= 0) {
        efectivo.value = this.fpagoInputValue(totalPrecio);
      }
      refreshSum();
    };
    [efectivo, tarjeta, deposito, cheque].forEach((el) => {
      el?.addEventListener('input', refreshSum);
    });
    concreSel?.addEventListener('change', toggle);
    toggle();
  },

  readFinalizarFpagoFromDom(concre) {
    if (concre === 'CRE') {
      return {
        FPAGO_EFECTIVO: 0,
        FPAGO_TARJETA: 0,
        FPAGO_DEPOSITO: 0,
        FPAGO_CHEQUE: 0,
        FPAGO_DESCRIPCION: '',
      };
    }
    return {
      FPAGO_EFECTIVO: Number(document.getElementById('fac-finalizar-fpago-efectivo')?.value ?? 0),
      FPAGO_TARJETA: Number(document.getElementById('fac-finalizar-fpago-tarjeta')?.value ?? 0),
      FPAGO_DEPOSITO: Number(document.getElementById('fac-finalizar-fpago-deposito')?.value ?? 0),
      FPAGO_CHEQUE: Number(document.getElementById('fac-finalizar-fpago-cheque')?.value ?? 0),
      FPAGO_DESCRIPCION: document.getElementById('fac-finalizar-fpago-desc')?.value?.trim() || '',
    };
  },

  async finalizarPedido() {
    const key = this.docKey();
    if (!key) return;
    const h = this._pedido?.header;
    if (!this.docEditable(h)) {
      F.toast('El pedido no está operado', 'warning');
      return;
    }
    if (!(this._pedido?.lines || []).length) {
      F.toast('Agregue al menos un producto', 'warning');
      return;
    }
    if (!this.hasCliente(h)) {
      F.toast('Seleccione un cliente antes de finalizar', 'warning');
      this.syncClienteSearchEmphasis();
      this._container?.querySelector('#fac-cliente-search')?.focus();
      return;
    }

    const skipClaveVendedor = this.documentoTieneOrigen(h);
    const solicitaClave = !skipClaveVendedor && (await DocVendedorClave.fetchSolicitaClave());
    if (solicitaClave) {
      const ok = await DocVendedorClave.promptAndApply({
        apiLookupUrl: this.apiUrl('/vendedores/por-clave'),
        vendedorSelectId: '#fac-doc-vendedor',
        view: this,
      });
      if (!ok) return;
    } else if (!this.hasVendedor(h)) {
      F.toast('Seleccione un vendedor antes de finalizar', 'warning');
      this.syncVendedorEmphasis();
      this._container?.querySelector('#fac-doc-vendedor')?.focus();
      return;
    }

    const tipoNeg = this.escapeHtml(this.clienteTipoNegocio(h));
    const nomRaw = (h.DOC_NOMCLIE || h.CLI_NOMBRE || '').trim();
    const dirRaw = (h.DOC_DIRCLIE || h.CLI_DIR || '').trim();
    const obsVal = this.escapeHtml(h.OBS || '');
    const concreVal = await this.resolveDefaultConcre(h);
    const vencDefault = DocFecha.inputValueFromHeader(h) || this.todayIsoDate();
    const totalPrecio = this.docTotalPrecio(h);

    const fpagoColHidden = concreVal === 'CRE' ? ' d-none' : '';

    const { isConfirmed, value } = await Swal.fire({
      ...CatalogosUI.modalBase({
        customClass: { popup: 'modal-catalogo fac-finalizar-modal' },
      }),
      title: 'Finalizar factura',
      width: '52rem',
      html: `
        <p class="small text-muted mb-2">${this.escapeHtml(this.docLabel())} · Total: <strong>${this.escapeHtml(this.formatMoney(totalPrecio))}</strong></p>
        <div class="text-start fac-finalizar-modal-body">
          <div class="row g-3 align-items-stretch">
            <div class="col-md-6 fac-finalizar-datos-col">
              <div class="mb-2">
                <label class="form-label small mb-0">Tipo negocio — Negocio</label>
                <div class="form-control form-control-sm bg-light">${tipoNeg}</div>
              </div>
              <div class="mb-2">
                <label class="form-label small mb-0" for="fac-finalizar-nomclie">Nombre cliente</label>
                <input type="text" id="fac-finalizar-nomclie" class="form-control form-control-sm"
                  value="${this.escapeHtml(nomRaw)}" autocomplete="off">
              </div>
              <div class="mb-2">
                <label class="form-label small mb-0" for="fac-finalizar-dirclie">Dirección cliente</label>
                <input type="text" id="fac-finalizar-dirclie" class="form-control form-control-sm"
                  value="${this.escapeHtml(dirRaw)}" autocomplete="off">
              </div>
              <div class="row g-2 mb-2 align-items-end" id="fac-finalizar-pago-row">
                <div class="col-${concreVal === 'CRE' ? '6' : '12'}" id="fac-finalizar-concre-wrap">
                  <label class="form-label small mb-0" for="fac-finalizar-concre">Forma de pago</label>
                  <select id="fac-finalizar-concre" class="form-select form-select-sm">
                    <option value="CON"${concreVal !== 'CRE' ? ' selected' : ''}>CONTADO</option>
                    <option value="CRE"${concreVal === 'CRE' ? ' selected' : ''}>CREDITO</option>
                  </select>
                </div>
                <div class="col-6${concreVal === 'CRE' ? '' : ' d-none'}" id="fac-finalizar-venc-wrap">
                  <label class="form-label small mb-0" for="fac-finalizar-venc">Vencimiento</label>
                  <input type="date" id="fac-finalizar-venc" class="form-control form-control-sm" value="${vencDefault}">
                </div>
              </div>
              <div class="mb-0">
                <label class="form-label small mb-0" for="fac-finalizar-obs">Observaciones</label>
                <textarea id="fac-finalizar-obs" class="form-control form-control-sm" rows="1"
                  placeholder="Observaciones de la factura…">${obsVal}</textarea>
              </div>
            </div>
            <div class="col-md-6 fac-finalizar-fpago-col${fpagoColHidden}" id="fac-finalizar-fpago-col">
              ${this.renderFinalizarFpagoCardHtml(totalPrecio, concreVal)}
            </div>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Finalizar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        const concreSel = document.getElementById('fac-finalizar-concre');
        const vencWrap = document.getElementById('fac-finalizar-venc-wrap');
        const concreWrap = document.getElementById('fac-finalizar-concre-wrap');
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
        this.bindFinalizarFpagoToggle(totalPrecio);
        document.getElementById('fac-finalizar-nomclie')?.focus();
      },
      preConfirm: () => {
        const nom = document.getElementById('fac-finalizar-nomclie')?.value?.trim() || '';
        if (!nom) {
          Swal.showValidationMessage('Ingrese el nombre del cliente');
          return false;
        }
        const obs = document.getElementById('fac-finalizar-obs')?.value?.trim() || '';
        const concre = document.getElementById('fac-finalizar-concre')?.value || 'CON';
        const venc = document.getElementById('fac-finalizar-venc')?.value?.trim() || '';
        if (concre === 'CRE' && !venc) {
          Swal.showValidationMessage('Ingrese la fecha de vencimiento');
          return false;
        }
        const fpagoErr = this.validateFinalizarFpago(concre, totalPrecio);
        if (fpagoErr) {
          Swal.showValidationMessage(fpagoErr);
          return false;
        }
        const fpago = this.readFinalizarFpagoFromDom(concre);
        return {
          obs,
          nomclie: nom,
          dirclie: document.getElementById('fac-finalizar-dirclie')?.value?.trim() || '',
          concre,
          vencimiento: concre === 'CRE' ? venc : null,
          ...fpago,
        };
      },
    });

    if (!isConfirmed) return;

    const url = this.apiUrl(`/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/finalizar`);
    await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        OBS: value.obs,
        DOC_NOMCLIE: value.nomclie,
        DOC_DIRCLIE: value.dirclie,
        CONCRE: value.concre,
        VENCIMIENTO: value.vencimiento,
        CODCAJA: this.readCodcajaForFinalizar(),
        FPAGO_EFECTIVO: value.FPAGO_EFECTIVO,
        FPAGO_TARJETA: value.FPAGO_TARJETA,
        FPAGO_DEPOSITO: value.FPAGO_DEPOSITO,
        FPAGO_CHEQUE: value.FPAGO_CHEQUE,
        FPAGO_DESCRIPCION: value.FPAGO_DESCRIPCION,
      }),
    });
    F.toast('Pedido finalizado', 'success');
    this._pedido = null;
    await this.showList();
  },

  async agregarLinea(codprod, codmedida, cantidad = 1) {
    const key = this.docKey();
    if (!key) {
      F.toast('No hay pedido activo', 'warning');
      return;
    }
    if (!this.docEditable(this._pedido?.header)) {
      F.toast('El pedido no está en edición', 'warning');
      return;
    }
    const url = this.apiUrl(`/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas`);
    const res = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        CODPROD: codprod,
        CODMEDIDA: codmedida,
        CANTIDAD: cantidad,
        CAMPO_PRECIO: this._precioCampo,
      }),
    });
    this._pedido = res.pedido;
    this.renderCart();
    this.renderOrderSummary();
    F.toast('Producto agregado', 'success');
  },

  setCartBusy(busy) {
    this._cartBusy = busy;
    const tbody = this._container?.querySelector('#fac-cart-tbody');
    tbody?.classList.toggle('pos-cart-busy', busy);
    const fab = this._container?.querySelector('#btn-fac-finalizar');
    if (fab) fab.disabled = busy;
    const barcodeFab = this._container?.querySelector('#fac-fab-barcode');
    if (barcodeFab) barcodeFab.disabled = busy;
  },

  async actualizarCantidad(lineId, cantidad) {
    const key = this.docKey();
    if (!key) return;
    const url = this.apiUrl(
      `/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas/${lineId}`
    );
    const res = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CANTIDAD: cantidad }),
    });
    this._pedido = res.pedido;
    this.renderCart();
    this.renderOrderSummary();
  },

  async eliminarLinea(lineId) {
    const key = this.docKey();
    if (!key) return;
    const url = this.apiUrl(
      `/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas/${lineId}`
    );
    const res = await F.fetchJson(url, { method: 'DELETE' });
    this._pedido = res.pedido;
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
    const priceByMedida = Object.fromEntries(
      precios.map((p) => [String(p.CODMEDIDA), Number(p.PRECIO) || 0])
    );
    const defaultPrecio = priceByMedida[String(defaultMedida)] ?? 0;
    const options = precios
      .map((p) => {
        const selected = String(p.CODMEDIDA) === String(defaultMedida) ? ' selected' : '';
        return `<option value="${this.escapeHtml(p.CODMEDIDA)}"${selected}>${this.escapeHtml(p.CODMEDIDA)} — ${this.escapeHtml(this.formatMoney(p.PRECIO))} (eq. ${this.escapeHtml(p.EQUIVALE)}, exist. ${this.escapeHtml(this.formatQty(p.EXISTENCIA))})</option>`;
      })
      .join('');
    const { value: picked } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: row.DESPROD || row.CODPROD,
      html: `
        <label class="form-label small mb-0">Medida</label>
        <select id="fac-swal-medida" class="form-select form-select-sm">${options}</select>
        <div class="row g-2 mt-2 align-items-end">
          <div class="col-6">
            <label class="form-label small mb-0" for="fac-swal-cant">Cantidad</label>
            <input type="number" id="fac-swal-cant" class="form-control form-control-sm" value="1" min="0.01" step="any">
          </div>
          <div class="col-6">
            <label class="form-label small mb-0" for="fac-swal-precio">Precio</label>
            <input type="text" id="fac-swal-precio" class="form-control form-control-sm bg-light" value="${this.escapeHtml(this.formatMoney(defaultPrecio))}" readonly>
          </div>
        </div>
        <p class="small text-muted mb-0 mt-2 text-end" id="fac-swal-total">Total: ${this.escapeHtml(this.formatMoney(defaultPrecio))}</p>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Agregar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: (popup) => {
        const medSel = document.getElementById('fac-swal-medida');
        const cantInp = document.getElementById('fac-swal-cant');
        const precioInp = document.getElementById('fac-swal-precio');
        const totalEl = document.getElementById('fac-swal-total');
        const updateTotal = () => {
          const med = medSel?.value;
          const precio = priceByMedida[med] ?? 0;
          const cant = Number(cantInp?.value) || 0;
          if (precioInp) precioInp.value = this.formatMoney(precio);
          if (totalEl) totalEl.textContent = `Total: ${this.formatMoney(cant * precio)}`;
        };
        medSel?.addEventListener('change', updateTotal);
        cantInp?.addEventListener('input', updateTotal);
        PosProductKeyboardUI.focusInput(cantInp);
        PosProductKeyboardUI.wireModalQtyFlow({ cantInput: cantInp, priceInput: precioInp, popup });
      },
      preConfirm: () => {
        const cant = Number(document.getElementById('fac-swal-cant')?.value);
        if (!cant || cant <= 0) {
          Swal.showValidationMessage('Cantidad inválida');
          return false;
        }
        const medida = document.getElementById('fac-swal-medida')?.value;
        if (!medida) {
          Swal.showValidationMessage('Seleccione una medida');
          return false;
        }
        return { medida, cantidad: cant };
      },
    });
    if (picked?.medida) {
      await this.agregarLinea(row.CODPROD, picked.medida, picked.cantidad);
    }
  },

  renderProductList() {
    const targets = PosDocSearchUI.listTargets(this._container, 'fac');
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
            </div>
            <div class="pos-prod-meta text-end">
              <div class="pos-prod-stock small text-muted">Exist. ${this.escapeHtml(this.formatQty(p.EXISTENCIA))}</div>
              <div class="pos-prod-price">${this.escapeHtml(this.formatMoney(p.PRECIO))}</div>
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
    const tbody = this._container?.querySelector('#fac-cart-tbody');
    if (!tbody) return;
    const lines = this._pedido?.lines || [];
    const h = this._pedido?.header;
    const editable = this.docEditable(h);
    if (!lines.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted py-3">Sin productos en el pedido</td></tr>';
      return;
    }
    tbody.innerHTML = lines
      .map((ln) => {
        const lineId = this.lineId(ln);
        const qty = Number(ln.CANTIDAD) || 0;
        const unitPrice = this.formatMoney(ln.PRECIO);
        const qtyControlsInner = editable
          ? `<button type="button" class="btn btn-outline-secondary btn-sm pos-qty-btn" data-action="qty-minus" data-id="${lineId}"${this._cartBusy ? ' disabled' : ''}>−</button>
              <span class="px-1">${qty}</span>
              <button type="button" class="btn btn-outline-secondary btn-sm pos-qty-btn" data-action="qty-plus" data-id="${lineId}"${this._cartBusy ? ' disabled' : ''}>+</button>`
          : `<span>${qty}</span>`;
        const qtyCell = `<div class="pos-cart-qty-price d-flex align-items-center justify-content-center gap-2 flex-wrap">
            <div class="d-flex align-items-center gap-1">${qtyControlsInner}</div>
            <span class="pos-cart-unit-price small text-nowrap">${this.escapeHtml(unitPrice)}</span>
          </div>`;
        const delBtn = editable
          ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="line-del" data-id="${lineId}" title="Quitar"${this._cartBusy ? ' disabled' : ''}><i class="fa-solid fa-trash"></i></button>`
          : '';
        return `<tr>
          <td class="small">${this.escapeHtml(ln.CODPROD)}</td>
          <td class="small">${this.escapeHtml(ln.DESPROD)}<br><span class="text-muted">${this.escapeHtml(ln.CODMEDIDA)}</span></td>
          <td class="text-end small pos-cart-exist">${this.escapeHtml(this.formatQty(ln.EXISTENCIA))}</td>
          <td class="text-center">${qtyCell}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(ln.TOTALPRECIO))}</td>
          <td class="text-end">${delBtn}</td>
        </tr>`;
      })
      .join('');
  },

  renderOrderSummary() {
    const totalEl = this._container?.querySelector('#fac-header-total');
    const itemsEl = this._container?.querySelector('#fac-header-items');
    const docEl = this._container?.querySelector('#fac-header-doc');
    const h = this._pedido?.header;
    const lines = this._pedido?.lines || [];
    const total = h?.TOTALPRECIO ?? 0;
    const itemCount = lines.reduce((sum, ln) => sum + (Number(ln.CANTIDAD) || 0), 0);
    if (totalEl) totalEl.textContent = this.formatMoney(total);
    if (itemsEl) {
      itemsEl.textContent = itemCount === 1 ? '1 item' : `${itemCount} items`;
    }
    if (docEl && h) docEl.textContent = this.docLabel();
  },

  renderHeaderInfo() {
    const cliente = this._container?.querySelector('#fac-cliente-nombre');
    const h = this._pedido?.header;
    if (cliente && h) {
      cliente.textContent = h.DOC_NOMCLIE || '—';
      const inp = this._container.querySelector('#fac-cliente-search');
      if (inp && !inp.matches(':focus')) inp.value = h.DOC_NOMCLIE || '';
    }
    const fechaInp = this._container?.querySelector('#fac-doc-fecha');
    if (fechaInp && h && !fechaInp.matches(':focus')) {
      fechaInp.value = DocFecha.inputValueFromHeader(h);
    }
    const vendedorSel = this._container?.querySelector('#fac-doc-vendedor');
    if (vendedorSel && h && document.activeElement !== vendedorSel) {
      const codven = h.CODVEN != null && h.CODVEN !== '' ? String(h.CODVEN) : '';
      vendedorSel.value = codven;
    }
    const cajaSel = this._container?.querySelector('#fac-doc-caja');
    if (cajaSel && document.activeElement !== cajaSel) {
      cajaSel.value = this.resolveCodcajaSelectValue(h);
    }
  },

  resolveInitialCodcaja(header) {
    const stored = header?.CODCAJA;
    if (stored != null && stored !== '' && Number(stored) > 0) return String(stored);
    if (this._cajas.length) return String(this._cajas[0].CODCAJA);
    return '';
  },

  resolveCodcajaSelectValue(header) {
    if (this._selectedCodcaja !== null) return this._selectedCodcaja;
    return this.resolveInitialCodcaja(header);
  },

  readCodcajaForFinalizar() {
    const sel = this._container?.querySelector('#fac-doc-caja');
    const val = sel?.value?.trim() ?? '';
    if (!val) return null;
    const cod = parseInt(val, 10);
    return Number.isNaN(cod) ? null : cod;
  },

  renderPrecioCampoSelector(editable) {
    const disabled = !editable ? ' disabled' : '';
    const opts = this.PRECIO_CAMPO_OPTIONS.map(
      (o) =>
        `<option value="${o.value}"${o.value === this._precioCampo ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
    ).join('');
    return `
      <div class="pos-precio-campo-wrap ms-auto">
        <select class="form-select form-select-sm" id="fac-precio-campo" title="Columna de precio"${disabled}>
          ${opts}
        </select>
      </div>`;
  },

  renderCajaField() {
    const h = this._pedido?.header;
    const codcaja = this.resolveCodcajaSelectValue(h);
    const disabled = !this.docEditable(h) ? ' disabled' : '';
    const opts = (this._cajas || [])
      .map(
        (c) =>
          `<option value="${c.CODCAJA}"${String(c.CODCAJA) === codcaja ? ' selected' : ''}>${this.escapeHtml(c.DESCAJA)}</option>`
      )
      .join('');
    return `
      <div class="pos-header-caja-wrap">
        <label class="form-label small mb-0" for="fac-doc-caja">Caja</label>
        <select class="form-select form-select-sm" id="fac-doc-caja"${disabled}>
          <option value="">— Sin caja —</option>
          ${opts}
        </select>
      </div>`;
  },

  renderVendedorField() {
    const h = this._pedido?.header;
    const codven = h?.CODVEN != null && h.CODVEN !== '' ? String(h.CODVEN) : '';
    const disabled = !this.docEditable(h) ? ' disabled' : '';
    const opts = (this._vendedores || [])
      .map(
        (v) =>
          `<option value="${v.CODEMPLEADO}"${String(v.CODEMPLEADO) === codven ? ' selected' : ''}>${this.escapeHtml(v.NOMEMPLEADO)}</option>`
      )
      .join('');
    return `
      <div class="pos-doc-vendedor-wrap">
        <label class="form-label small mb-0" for="fac-doc-vendedor">Vendedor <span class="text-danger">*</span></label>
        <select class="form-select form-select-sm" id="fac-doc-vendedor"${disabled}>
          <option value="">— Seleccione —</option>
          ${opts}
        </select>
      </div>`;
  },

  syncEditorControls() {
    const editable = this.docEditable(this._pedido?.header);
    PosDocSearchUI.syncControls(this._container, 'fac', editable);
    ['#fac-cliente-search', '#fac-cliente-nuevo', '#fac-doc-fecha', '#fac-doc-vendedor', '#fac-doc-caja', '#fac-precio-campo'].forEach((sel) => {
      const el = this._container?.querySelector(sel);
      if (el) el.disabled = !editable;
    });
    const fab = this._container?.querySelector('#btn-fac-finalizar');
    if (fab) fab.style.display = editable ? '' : 'none';
    this.syncClienteSearchEmphasis();
    this.syncVendedorEmphasis();
  },

  renderAll() {
    this.renderHeaderInfo();
    this.renderCart();
    this.renderOrderSummary();
    this.syncEditorControls();
  },

  async certificarPedido(coddoc, correlativo) {
    const label = `${coddoc} #${correlativo}`;
    const confirm = await CatalogosUI.fireConfirm({
      title: 'Certificar factura',
      html: `<p class="mb-0">¿Certificar la factura <strong>${this.escapeHtml(label)}</strong> ante SAT (Infile)?</p>`,
      icon: 'question',
      confirmText: 'CERTIFICAR',
      confirmClass: 'btn-catalogo-guardar',
    });
    if (!confirm) return;

    try {
      const url = `/api/fel/certificar/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}?empnit=${encodeURIComponent(F.getEmpNit())}`;
      const data = await F.fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const fel = data.fel || {};
      F.toast(
        `Certificado — UUID ${fel.uuid || ''}${fel.serie ? ` · Serie ${fel.serie}` : ''}${fel.numero ? ` · No. ${fel.numero}` : ''}`,
        'success'
      );
      await this.fetchPedidosList();
      this.refreshListDom();
    } catch (err) {
      F.alert('Error FEL', err.message || 'No se pudo certificar', 'error');
    }
  },

  async eliminarPedido(coddoc, correlativo) {
    const label = `${coddoc} #${correlativo}`;
    const pass = await CatalogosUI.confirmEliminarDocumento({ label, tipo: 'pedido' });
    if (!pass) return;
    const url = this.apiUrl(`/pedidos/${encodeURIComponent(coddoc)}/${correlativo}`);
    await F.fetchJson(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass: String(pass) }),
    });
    F.toast('Pedido eliminado', 'success');
    await this.fetchPedidosList();
    this.refreshListDom();
  },

  async fraccionarFactura(coddoc, correlativo) {
    const label = `${coddoc} #${correlativo}`;
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Enviar a cola de trabajo?',
      html: `<p class="mb-0">La factura <strong>${this.escapeHtml(label)}</strong> se enviará a la cola de trabajo de fraccionamiento.</p>
             <p class="mb-0 mt-2 small text-muted">Esta acción no se puede deshacer desde aquí.</p>`,
      icon: 'warning',
      confirmText: 'Sí, fraccionar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;
    const res = await F.fetchJson(
      this.apiUrl(`/pedidos/${encodeURIComponent(coddoc)}/${correlativo}/fraccionar`),
      { method: 'POST' }
    );
    F.toast(`Factura enviada a fraccionamiento (cola #${res.ID})`, 'success');
    await this.fetchPedidosList();
    this.refreshListDom();
  },

  async imprimirPedido(coddoc, correlativo) {
    try {
      const url = this.apiUrl(`/pedidos/${encodeURIComponent(coddoc)}/${correlativo}`, {
        _: Date.now(),
      });
      const pedido = await F.fetchJson(url);
      const h = pedido.header || {};
      const titulo = h.DESDOC || 'Factura';
      await DocPrint.printDocument({
        title: titulo,
        header: h,
        lines: pedido.lines || [],
      });
    } catch (err) {
      F.toast(err.message || 'Error al imprimir', 'error');
    }
  },

  refreshListDom() {
    const tbody = this._container?.querySelector('#fac-list-tbody');
    if (tbody) tbody.innerHTML = this.renderListTableBodyHtml();
    const sub = this._container?.querySelector('.pos-list-sub');
    if (sub) {
      sub.textContent = `${this.filteredPedidosList().length} factura(s) · ${this.listFechaLabel()}`;
    }
  },

  renderListTableBodyHtml() {
    const rows = this.filteredPedidosList();
    if (!rows.length) {
      return `<tr><td colspan="11" class="text-center text-muted py-4">No hay facturas en esta fecha</td></tr>`;
    }
    return rows
      .map((r) => {
        const label = `${r.CODDOC} #${r.CORRELATIVO}`;
        const cliente = r.DOC_NOMCLIE || r.NEGOCIO || 'Sin cliente';
        const negocio = [r.TIPONEGOCIO, r.NEGOCIO].filter(Boolean).join(' · ') || '—';
        const vendedor = String(r.VENDEDOR || '').trim() || '—';
        const caja = this.formatCajaLista(r);
        const pago = this.formatFormaPago(r.CONCRE);
        const pagoClass = String(r.CONCRE || 'CON').trim().toUpperCase() === 'CRE' ? 'text-warning' : 'text-success';
        return `
          <tr class="fac-list-row" data-coddoc="${this.escapeHtml(r.CODDOC)}" data-correlativo="${r.CORRELATIVO}">
            <td class="fw-semibold text-nowrap">${this.escapeHtml(label)}</td>
            <td>${this.escapeHtml(cliente)}</td>
            <td class="small text-muted">${this.escapeHtml(negocio)}</td>
            <td class="small">${this.escapeHtml(vendedor)}</td>
            <td class="small text-nowrap">${this.escapeHtml(caja)}</td>
            <td class="small fw-semibold ${pagoClass}">${this.escapeHtml(pago)}</td>
            <td class="fac-fel-col">${this.formatFelCell(r)}</td>
            <td class="text-center">${Number(r.LINEAS) || 0}</td>
            <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
            <td class="text-nowrap">${this.escapeHtml(this.formatHoraPedido(r))}</td>
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
                <th scope="col">Cliente</th>
                <th scope="col">Negocio</th>
                <th scope="col">Vendedor</th>
                <th scope="col">Caja</th>
                <th scope="col">Pago</th>
                <th scope="col">FEL</th>
                <th scope="col" class="text-center">Líneas</th>
                <th scope="col" class="text-end">Total</th>
                <th scope="col">Hora</th>
                <th scope="col" class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="fac-list-tbody">${this.renderListTableBodyHtml()}</tbody>
          </table>
        </div>
      </div>`;
  },

  renderPedidoEnvModalHtml() {
    if (!this._pedidoEnvModalOpen) return '';
    const rows = this.filteredPedidosEnvList();
    const body =
      rows.length === 0
        ? `<div class="fac-env-modal-empty text-muted text-center py-4">
            <i class="fa-solid fa-inbox fa-2x mb-2 opacity-50"></i>
            <p class="mb-0 small">No hay pedidos (ENV), cotizaciones (COT) ni comandas (CRS) operados disponibles.</p>
          </div>`
        : `<div class="table-responsive fac-env-modal-table-wrap">
            <table class="table table-sm table-hover align-middle mb-0 fac-env-modal-table">
              <thead class="table-light">
                <tr>
                  <th>Tipo</th>
                  <th>CODDOC</th>
                  <th>CORRELATIVO</th>
                  <th>FECHA</th>
                  <th>CLIENTE</th>
                  <th class="text-end">IMPORTE</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (r) => `
                  <tr class="fac-env-pedido-row" role="button" tabindex="0"
                    data-coddoc="${this.escapeHtml(r.CODDOC)}" data-correlativo="${this.escapeHtml(r.CORRELATIVO)}">
                    <td><span class="badge text-bg-secondary">${this.escapeHtml(r.TIPODOC || '—')}</span></td>
                    <td class="fw-semibold">${this.escapeHtml(r.CODDOC)}</td>
                    <td>${this.escapeHtml(r.CORRELATIVO)}</td>
                    <td class="text-nowrap">${this.escapeHtml(this.formatFechaPedido(r))}</td>
                    <td>${this.escapeHtml(r.DOC_NOMCLIE || r.NEGOCIO || '—')}</td>
                    <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>`;

    return `
      <div class="fac-env-modal-overlay" id="fac-pedido-env-overlay" role="dialog" aria-modal="true" aria-labelledby="fac-pedido-env-title">
        <div class="fac-env-modal card shadow-lg border-0">
          <div class="fac-env-modal-header card-header bg-white border-0 pb-0">
            <div class="d-flex align-items-start justify-content-between gap-2">
              <div>
                <h5 class="fac-env-modal-title mb-1" id="fac-pedido-env-title">
                  <i class="fa-solid fa-file-import me-2 text-primary"></i>Tomar datos
                </h5>
                <p class="small text-muted mb-0">Seleccione un pedido (ENV), cotización (COT) o comanda (CRS) operado para cargarlo en facturación.</p>
              </div>
              <button type="button" class="btn btn-sm btn-light fac-env-modal-close" id="btn-fac-pedido-env-cerrar" aria-label="Cerrar">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div class="input-group input-group-sm mt-3">
              <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input type="search" class="form-control" id="fac-pedido-env-search"
                placeholder="Buscar documento, cliente…" value="${this.escapeHtml(this._pedidoEnvFilter)}" autocomplete="off">
            </div>
          </div>
          <div class="card-body fac-env-modal-body pt-2">${body}</div>
        </div>
      </div>`;
  },

  renderListHeaderAndModal(count) {
    return `
        <div class="pos-list-header">
          <h2 class="pos-list-title">Facturación del día</h2>
          <p class="pos-list-sub text-muted mb-0">${count} factura(s) · ${this.escapeHtml(this.listFechaLabel())}</p>
          <button type="button" class="btn btn-sm btn-outline-primary fac-btn-tomar-pedido mt-2" id="btn-fac-tomar-pedido">
            <i class="fa-solid fa-file-import me-1"></i>Tomar datos (pedido / cotización / comanda)
          </button>
        </div>
        <div id="fac-pedido-env-modal-root">${this.renderPedidoEnvModalHtml()}</div>`;
  },

  filteredPedidosEnvList() {
    const q = String(this._pedidoEnvFilter || '').trim().toLowerCase();
    if (!q) return this._pedidosEnvList || [];
    return (this._pedidosEnvList || []).filter((r) => {
      const hay = [
        r.TIPODOC,
        r.CODDOC,
        r.CORRELATIVO,
        r.DOC_NOMCLIE,
        r.NEGOCIO,
        this.formatFechaPedido(r),
        r.TOTALPRECIO,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  },

  async fetchPedidosEnv(q = '') {
    const data = await F.fetchJson(
      this.apiUrl('/pedidos-env', { ...(q ? { q } : {}), _: String(Date.now()) }),
      { cache: 'no-store' }
    );
    this._pedidosEnvList = data.rows || [];
    return this._pedidosEnvList;
  },

  refreshPedidoEnvModalDom() {
    const root = this._container?.querySelector('#fac-pedido-env-modal-root');
    if (root) root.innerHTML = this.renderPedidoEnvModalHtml();
    if (this._pedidoEnvModalOpen) this.bindPedidoEnvModalEvents();
  },

  closePedidoEnvModal() {
    this._pedidoEnvModalOpen = false;
    this._pedidoEnvFilter = '';
    this.refreshPedidoEnvModalDom();
  },

  async openPedidoEnvModal() {
    this._pedidoEnvModalOpen = true;
    this._pedidoEnvFilter = '';
    this.refreshPedidoEnvModalDom();
    const tbody = this._container?.querySelector('.fac-env-modal-body');
    if (tbody) {
      tbody.innerHTML = `<div class="text-center text-muted py-4"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando documentos…</div>`;
    }
    try {
      await this.fetchPedidosEnv();
      this.refreshPedidoEnvModalDom();
    } catch (err) {
      const root = this._container?.querySelector('#fac-pedido-env-modal-root');
      if (root) {
        root.innerHTML = `
          <div class="fac-env-modal-overlay" id="fac-pedido-env-overlay">
            <div class="fac-env-modal card shadow-lg border-0">
              <div class="card-body">
                <div class="alert alert-danger mb-3">${this.escapeHtml(err.message)}</div>
                <button type="button" class="btn btn-sm btn-secondary" id="btn-fac-pedido-env-cerrar">Cerrar</button>
              </div>
            </div>
          </div>`;
        root.querySelector('#btn-fac-pedido-env-cerrar')?.addEventListener('click', () => this.closePedidoEnvModal());
      }
    }
  },

  bindPedidoEnvModalEvents() {
    this._container?.querySelector('#btn-fac-pedido-env-cerrar')?.addEventListener('click', () => {
      this.closePedidoEnvModal();
    });
    this._container?.querySelector('#fac-pedido-env-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'fac-pedido-env-overlay') this.closePedidoEnvModal();
    });
    const search = this._container?.querySelector('#fac-pedido-env-search');
    search?.addEventListener('input', () => {
      this._pedidoEnvFilter = search.value;
      this.refreshPedidoEnvModalDom();
    });
    this._container?.querySelectorAll('.fac-env-pedido-row').forEach((row) => {
      const pick = () => {
        const coddoc = row.getAttribute('data-coddoc');
        const correlativo = row.getAttribute('data-correlativo');
        this.confirmarPedidoEnv(coddoc, correlativo).catch((err) => F.toast(err.message, 'error'));
      };
      row.addEventListener('click', pick);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      });
    });
  },

  async confirmarPedidoEnv(coddoc, correlativo) {
    const row = (this._pedidosEnvList || []).find(
      (r) => String(r.CODDOC) === String(coddoc) && String(r.CORRELATIVO) === String(correlativo),
    );
    const cliente = this.escapeHtml(row?.DOC_NOMCLIE || row?.NEGOCIO || '—');
    const importe = this.escapeHtml(this.formatMoney(row?.TOTALPRECIO));
    const tipo = this.escapeHtml(row?.TIPODOC || '');
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Agregar a facturación?',
      html: `<p class="mb-2">Se creará una nueva factura con el cliente y productos del documento:</p>
        <p class="mb-0">${tipo ? `<span class="badge text-bg-secondary me-1">${tipo}</span>` : ''}
        <strong>${this.escapeHtml(coddoc)}-${this.escapeHtml(correlativo)}</strong> · ${cliente}<br>
        <span class="text-muted">${importe}</span></p>`,
      icon: 'question',
      confirmText: 'Sí, cargar',
    });
    if (!ok) return;
    await this.crearFacturaDesdePedido(coddoc, correlativo);
  },

  async crearFacturaDesdePedido(coddocPedido, correlativoPedido) {
    if (this._container?.querySelector('#fac-list-coddoc')) {
      DocTipoSelect.syncFromDom(this._container, 'fac-list-coddoc', this);
    }
    const url = this.apiUrl('/pedidos/desde-pedido');
    const res = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        CODDOC_PEDIDO: coddocPedido,
        CORRELATIVO_PEDIDO: correlativoPedido,
        CODDOC_FAC: this.activeCoddoc(),
        USUARIO: this.usuario(),
      }),
    });
    this.closePedidoEnvModal();
    const fac = res.factura?.header;
    if (!fac) throw new Error('No se recibió la factura creada');
    F.toast(`Factura ${fac.CODDOC}-${fac.CORRELATIVO} creada desde documento`, 'success');
    await this.showEditor(fac.CODDOC, fac.CORRELATIVO);
  },

  renderListScreen() {
    const count = this.filteredPedidosList().length;
    return `
      <div class="pos-list-wrap">
        ${this.renderListHeaderAndModal(count)}
        <div class="fac-list-toolbar mb-3">
          <div class="fac-list-toolbar-fecha">
            <label class="form-label small mb-1" for="fac-list-fecha">Fecha</label>
            <input type="date" class="form-control form-control-sm" id="fac-list-fecha"
              value="${this.escapeHtml(this._listFecha || this.todayIsoDate())}" aria-label="Fecha del listado">
          </div>
          ${DocTipoSelect.renderSelectHtml({
            selectId: 'fac-list-coddoc',
            tipos: this._config?.tiposDocumento,
            selected: this.activeCoddoc(),
            label: 'Serie',
            className: 'doc-tipo-select-wrap fac-list-toolbar-serie',
          })}
          <div class="fac-list-toolbar-search flex-grow-1">
            <label class="form-label small mb-1" for="fac-list-search">Buscar</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input type="search" class="form-control pos-search-glow" id="fac-list-search"
                placeholder="Documento, cliente, negocio…" value="${this.escapeHtml(this._listFilter)}" autocomplete="off">
            </div>
          </div>
        </div>
        ${this.renderListTableHtml()}
        <button type="button" class="btn-onneb-nuevo-fab pos-list-fab-nuevo" id="btn-fac-list-nuevo"
          aria-label="Nueva factura" title="Nueva factura"${this.activeCoddoc() ? '' : ' disabled'}>
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>`;
  },

  renderEditorShell() {
    const tipoLabel = this._config?.tiposDocumento?.[0]?.DESDOC || 'Pedidos';
    const editable = this.docEditable(this._pedido?.header);
    return `
      <div class="pos-vista-wrap">
        <div class="pos-header card shadow-sm">
          <div class="card-body pos-header-body">
            <div class="pos-header-top d-flex flex-wrap align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary pos-btn-atras" id="btn-fac-atras">
                <i class="fa-solid fa-arrow-left me-1"></i>Atrás
              </button>
              <div class="pos-header-brand">
                ${typeof EmpresaLogo !== 'undefined' ? EmpresaLogo.posHeaderLogoHtml() : '<img src="/icons/icon-72.png" width="40" height="40" alt="OnneB" class="pos-header-logo">'}
              </div>
              <div class="pos-header-doc-label small fw-semibold" id="fac-header-doc">${this.escapeHtml(this.docLabel())}</div>
              <div class="pos-doc-meta-fields d-flex flex-wrap align-items-end gap-2">
                ${DocFecha.renderField('fac-doc-fecha', this._pedido?.header)}
                ${this.renderVendedorField()}
              </div>
              <div class="pos-header-summary-wrap ms-auto d-flex flex-wrap align-items-end gap-3">
                ${this.renderCajaField()}
                <div class="pos-header-summary text-end">
                  <h3 class="pos-header-total mb-0" id="fac-header-total">Q 0.00</h3>
                  <div class="pos-header-items" id="fac-header-items">0 items</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="pos-main">
          <div class="pos-panel pos-panel-search card shadow-sm">
            <div class="card-header py-2 d-flex align-items-center gap-2 flex-wrap w-100">
              <i class="fa-solid fa-box"></i>
              <span class="fw-semibold">Productos</span>
              <span class="small text-muted">(${this.escapeHtml(tipoLabel)})</span>
              ${this.renderPrecioCampoSelector(editable)}
            </div>
            <div class="card-body">
              <div class="input-group input-group-sm mb-2 pos-search-group">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control pos-search-glow" id="fac-product-search"
                  placeholder="Código o descripción… (Enter)" autocomplete="off"${editable ? '' : ' disabled'}>
              </div>
              <div class="pos-product-list" id="fac-product-list"></div>
            </div>
          </div>
          <div class="pos-panel pos-panel-cart card shadow-sm">
            <div class="card-header py-2 d-flex align-items-center gap-2 flex-wrap">
              <div class="d-flex align-items-center gap-2">
                <i class="fa-solid fa-receipt"></i>
                <span class="fw-semibold">Pedido actual</span>
              </div>
            </div>
            <div class="card-body">
              <div class="pos-cliente-wrap mb-2 position-relative">
                <label class="form-label small mb-1">Cliente</label>
                <div class="input-group input-group-sm">
                  <input type="search" class="form-control pos-search-glow" id="fac-cliente-search"
                    placeholder="Buscar cliente… (requerido)" autocomplete="off"${editable ? '' : ' disabled'}>
                  <button type="button" class="btn btn-outline-primary text-nowrap" id="fac-cliente-nuevo"
                    title="Crear cliente nuevo"${editable ? '' : ' disabled'}>NUEVO (+)</button>
                </div>
                <div id="fac-cliente-nombre" class="small text-muted mt-1"></div>
                <div id="fac-cliente-results" class="list-group position-absolute w-100 shadow-sm d-none"
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
                        <th class="text-center">Cant. / Precio</th>
                        <th class="text-end">Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody id="fac-cart-tbody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${editable ? PosDocSearchUI.fabBarHtml('fac') : ''}
        ${PosDocSearchUI.productModalHtml('fac')}
      </div>`;
  },

  bindListEvents() {
    const search = this._container?.querySelector('#fac-list-search');
    search?.addEventListener('input', () => {
      this._listFilter = search.value;
      this.refreshListDom();
    });

    const fechaInp = this._container?.querySelector('#fac-list-fecha');
    fechaInp?.addEventListener('change', async () => {
      const val = fechaInp.value?.trim();
      if (!val || val === this._listFecha) return;
      this._listFecha = val;
      this._listFilter = search?.value || '';
      try {
        await this.fetchPedidosList();
        this.refreshListDom();
      } catch (err) {
        F.toast(err.message || 'Error al cargar facturas', 'error');
      }
    });

    DocTipoSelect.bind(this._container, 'fac-list-coddoc', this);

    this._container?.querySelector('#fac-list-tbody')?.addEventListener('click', async (e) => {
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
      const row = btn.closest('.fac-list-row');
      if (!row) return;
      const coddoc = row.getAttribute('data-coddoc');
      const correlativo = row.getAttribute('data-correlativo');
      const action = btn.getAttribute('data-action');
      try {
        if (action === 'editar') await this.showEditor(coddoc, correlativo);
        else if (action === 'imprimir') await this.imprimirPedido(coddoc, correlativo);
        else if (action === 'certificar') await this.certificarPedido(coddoc, correlativo);
        else if (action === 'fraccionar') await this.fraccionarFactura(coddoc, correlativo);
        else if (action === 'eliminar') await this.eliminarPedido(coddoc, correlativo);
      } catch (err) {
        F.toast(err.message || 'Error', 'error');
      }
    });

    this._container?.querySelector('#btn-fac-list-nuevo')?.addEventListener('click', () => this.onNuevoPedido());
    this._container?.querySelector('#btn-fac-tomar-pedido')?.addEventListener('click', () => {
      this.openPedidoEnvModal().catch((err) => F.toast(err.message, 'error'));
    });

    PosDocSearchUI.bindDocKeyboard(this, {
      isDetail: () => false,
      onNuevo: () => this.onNuevoPedido(),
    });
  },

  bindEditorEvents() {
    PosDocSearchUI.bind(this, 'fac', {
      getEditable: () => this.docEditable(this._pedido?.header),
      buscarProductos: this.buscarProductos,
      onProductPick: (row) => this.onProductClick(row),
    });

    PosDocSearchUI.bindDocKeyboard(this, {
      isDetail: () => true,
      getEditable: () => this.docEditable(this._pedido?.header),
      onNuevo: () => this.onNuevoPedido(),
      onFinalizar: () => this.finalizarPedido(),
    });
    const precioCampoSel = this._container?.querySelector('#fac-precio-campo');
    if (precioCampoSel) {
      precioCampoSel.addEventListener('change', () => {
        if (precioCampoSel.disabled) return;
        this._precioCampo = precioCampoSel.value || 'PRECIO';
        const q = this._container?.querySelector('#fac-product-search')?.value?.trim() || '';
        if (q) this.buscarProductos(q).catch((err) => F.toast(err.message, 'error'));
      });
    }

    this._container?.querySelector('#fac-cart-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled || this._cartBusy) return;
      e.preventDefault();
      const id = Number(btn.getAttribute('data-id'));
      const line = this.findLineById(id);
      if (!line) {
        F.toast('No se encontró la línea del pedido', 'warning');
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
        F.toast(err.message || 'Error al actualizar el pedido', 'error');
      } finally {
        this.setCartBusy(false);
        this.renderCart();
      }
    });

    this._container?.querySelector('#btn-fac-atras')?.addEventListener('click', () => this.showList());
    this._container?.querySelector('#btn-fac-finalizar')?.addEventListener('click', () => {
      this.finalizarPedido().catch((err) => F.toast(err.message, 'error'));
    });

    const fechaInp = this._container?.querySelector('#fac-doc-fecha');
    if (fechaInp) {
      fechaInp.addEventListener('change', () => {
        if (fechaInp.disabled) return;
        const val = fechaInp.value?.trim();
        if (!val) return;
        this.guardarFechaDocumento(val).catch((err) => F.toast(err.message, 'error'));
      });
    }

    const vendedorSel = this._container?.querySelector('#fac-doc-vendedor');
    if (vendedorSel) {
      vendedorSel.addEventListener('change', () => {
        if (vendedorSel.disabled) return;
        const val = vendedorSel.value?.trim();
        this.guardarVendedorDocumento(val).catch((err) => F.toast(err.message, 'error'));
      });
    }

    const cajaSel = this._container?.querySelector('#fac-doc-caja');
    if (cajaSel) {
      cajaSel.addEventListener('change', () => {
        if (cajaSel.disabled) return;
        this._selectedCodcaja = cajaSel.value?.trim() || '';
      });
    }

    this._container?.querySelector('#fac-cliente-nuevo')?.addEventListener('click', () => {
      this.onNuevoCliente().catch((err) => F.toast(err.message, 'error'));
    });

    const clienteSearch = this._container?.querySelector('#fac-cliente-search');
    const clienteList = this._container?.querySelector('#fac-cliente-results');
    if (clienteSearch && clienteList) {
      const runCli = F.debounce(async () => {
        const q = clienteSearch.value.trim();
        if (q.length < 2) {
          clienteList.classList.add('d-none');
          return;
        }
        try {
          const rows = await this.buscarClientes(q);
          if (!rows.length) {
            clienteList.innerHTML = '<div class="list-group-item small text-muted">Sin resultados</div>';
          } else {
            clienteList.innerHTML = rows
              .map(
                (c) =>
                  `<button type="button" class="list-group-item list-group-item-action small"
                    data-codcliente="${c.CODCLIENTE}">
                    <strong>${this.escapeHtml(c.NEGOCIO || c.NOMBRECLIENTE)}</strong>
                    <span class="text-muted d-block">${this.escapeHtml(c.NOMBRECLIENTE || '')} · ${this.escapeHtml(c.NIT || '')}</span>
                  </button>`
              )
              .join('');
          }
          clienteList.classList.remove('d-none');
        } catch (err) {
          clienteList.innerHTML = `<div class="list-group-item text-danger small">${this.escapeHtml(err.message)}</div>`;
          clienteList.classList.remove('d-none');
        }
      }, 350);
      clienteSearch.addEventListener('input', runCli);
      clienteList.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-codcliente]');
        if (!btn) return;
        const cod = parseInt(btn.getAttribute('data-codcliente'), 10);
        clienteList.classList.add('d-none');
        await this.aplicarCliente(cod);
      });
      document.addEventListener('click', (e) => {
        if (!clienteSearch.contains(e.target) && !clienteList.contains(e.target)) {
          clienteList.classList.add('d-none');
        }
      });
    }
  },

  async buscarProductos(q) {
    const term = String(q ?? '').trim();
    if (!term) {
      PosDocSearchUI.resetProductSearch(this, 'fac');
      return;
    }
    if (this._loadingProducts) return;
    this._loadingProducts = true;
    const spinner = '<p class="text-muted small text-center py-3"><i class="fa-solid fa-spinner fa-spin"></i></p>';
    PosDocSearchUI.setListsHtml(this._container, 'fac', spinner);
    try {
      const data = await this.fetchProductos(term);
      this._productos = data.rows || [];
      if (!this._productos.length) {
        PosDocSearchUI.setListsHtml(
          this._container,
          'fac',
          '<p class="text-muted small text-center py-3 mb-0">Sin resultados para la búsqueda</p>'
        );
        return;
      }
      this.renderProductList();
    } catch (err) {
      const errHtml = `<p class="text-danger small text-center py-3">${this.escapeHtml(err.message)}</p>`;
      PosDocSearchUI.setListsHtml(this._container, 'fac', errHtml);
    } finally {
      this._loadingProducts = false;
    }
  },

  async buscarClientes(q) {
    const emp = F.getEmpNit();
    const params = new URLSearchParams({ empnit: emp, q, limit: '15', habilitado: 'SI', _: Date.now() });
    const data = await F.fetchJson(`/api/clientes?${params}`);
    return data.rows || [];
  },

  async guardarFechaDocumento(fecha) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._pedido?.header)) return;
    const actual = DocFecha.inputValueFromHeader(this._pedido.header);
    if (fecha === actual) return;
    const url = this.apiUrl(`/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}`);
    this._pedido = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ FECHA: fecha }),
    });
    this.renderHeaderInfo();
    F.toast('Fecha actualizada', 'success');
  },

  async fetchVendedores() {
    if (this._vendedores.length) return this._vendedores;
    const data = await F.fetchJson(this.apiUrl('/vendedores', { _: Date.now() }));
    this._vendedores = data.rows || [];
    return this._vendedores;
  },

  async fetchCajasAbiertas() {
    const data = await F.fetchJson(this.apiUrl('/cajas-abiertas', { _: Date.now() }));
    this._cajas = data.rows || [];
    return this._cajas;
  },

  async guardarVendedorDocumento(codven) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._pedido?.header)) return;
    const h = this._pedido.header;
    const actual = h.CODVEN != null && h.CODVEN !== '' ? String(h.CODVEN) : '';
    const next = codven || '';
    if (next === actual) return;
    const url = this.apiUrl(`/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}`);
    this._pedido = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CODVEN: next ? parseInt(next, 10) : null }),
    });
    this.renderHeaderInfo();
    this.syncVendedorEmphasis();
    F.toast('Vendedor actualizado', 'success');
  },

  async aplicarCliente(codcliente) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._pedido?.header)) return;
    const url = this.apiUrl(`/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}`);
    this._pedido = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CODCLIENTE: codcliente }),
    });
    this.renderHeaderInfo();
    this.syncClienteSearchEmphasis();
    F.toast('Cliente actualizado', 'success');
  },

  async onNuevoCliente() {
    if (!this.docEditable(this._pedido?.header)) {
      F.toast('El pedido no está en edición', 'warning');
      return;
    }
    const data = await ClientesView.showForm('Nuevo cliente', {}, false, { profile: 'facturacion' });
    if (!data) return;
    try {
      const res = await F.fetchJson(ClientesView.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const cod = res.CODCLIENTE;
      if (!cod) throw new Error('No se recibió el código del cliente');
      await this.aplicarCliente(cod);
      const inp = this._container?.querySelector('#fac-cliente-search');
      if (inp) inp.value = data.NOMBRECLIENTE || data.NEGOCIO || String(cod);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async showList() {
    this._screen = 'list';
    this._pedido = null;
    PosDocSearchUI.unbindDocKeyboard(this);
    PosDocSearchUI.teardown('fac');
    await this.fetchPedidosList();
    this._container.innerHTML = this.renderListScreen();
    this.bindListEvents();
  },

  async showEditor(coddoc, correlativo, opts = {}) {
    this._screen = 'editor';
    PosDocSearchUI.unbindDocKeyboard(this);
    PosDocSearchUI.teardown('fac');
    if (coddoc && correlativo) {
      await this.loadPedido(coddoc, correlativo, { skipRender: true });
    }
    await this.fetchVendedores();
    await this.fetchCajasAbiertas();
    this._selectedCodcaja = null;
    this._container.innerHTML = this.renderEditorShell();
    this.bindEditorEvents();
    PosDocSearchUI.resetProductSearch(this, 'fac');
    this.renderAll();
    if (opts.focusProductSearch) {
      PosDocSearchUI.focusProductSearch(this._container, 'fac');
    }
  },

  async onNuevoPedido() {
    try {
      if (this._container?.querySelector('#fac-list-coddoc')) {
        DocTipoSelect.syncFromDom(this._container, 'fac-list-coddoc', this);
      }
      await this.crearPedido();
      const key = this.docKey();
      if (key) await this.showEditor(key.coddoc, key.correlativo, { focusProductSearch: true });
    } catch (err) {
      F.toast(err.message || 'Error al crear pedido', 'error');
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

    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando ${this.escapeHtml(this._tituloModulo || 'Facturación')}…</div>`;

    try {
      const [config] = await Promise.all([this.fetchConfig(), this.fetchUrlFel().catch(() => '')]);
      this._config = config;
      DocTipoSelect.initView(this);
      if (!this._config.coddocDefault) {
        container.innerHTML = `
          <div class="alert alert-warning m-3 w-100">
            Configure un tipo de documento de facturación (${this.tipodocsLabelHtml()}) activo para esta empresa.
          </div>`;
        return;
      }
      this._listFecha = this.todayIsoDate();
      this._listFilter = '';
      this._pedidosList = [];
      await this.showList();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
    }
  },
};

function createFacturacionViewClone(overrides = {}) {
  const view = Object.create(FacturacionView);
  Object.assign(
    view,
    {
      _container: null,
      _config: null,
      _pedido: null,
      _productos: [],
      _pedidosList: [],
      _listFilter: '',
      _listFecha: null,
      _selectedCoddoc: '',
      _screen: 'list',
      _loadingProducts: false,
      _searchTimer: null,
      _cartBusy: false,
      _vendedores: [],
      _cajas: [],
      _selectedCodcaja: null,
      _precioCampo: 'PRECIO',
      _urlFel: '',
      _pedidosEnvList: [],
      _pedidoEnvModalOpen: false,
      _pedidoEnvFilter: '',
    },
    overrides
  );
  return view;
}

const FacturasElectronicasView = createFacturacionViewClone({
  _grupo: 'fel',
  _tituloModulo: 'Facturas Electrónicas',
});
