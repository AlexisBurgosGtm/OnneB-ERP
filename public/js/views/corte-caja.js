/**
 * Vista Corte de caja — abrir/cerrar cajas y registrar cortes.
 */
const CorteCajaView = {
  _container: null,
  _cajas: [],
  _selectedCodcaja: null,
  _resumen: null,
  _loading: false,

  escapeHtml(value) {
    if (value == null) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  },

  usuario() {
    const u = F.session('user');
    return u?.usuario || u?.nomempleado || 'SN';
  },

  apiUrl(path, params = {}) {
    const q = new URLSearchParams({ empnit: F.getEmpNit() || '', ...params, _: String(Date.now()) });
    return `/api/corte-caja${path}?${q.toString()}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'Q 0.00';
    return `Q ${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  selectedCaja() {
    return (this._cajas || []).find((c) => String(c.CODCAJA) === String(this._selectedCodcaja)) || null;
  },

  isAbierta(caja) {
    return Number(caja?.STATUS) === 1;
  },

  renderStat(label, value, extraClass = '') {
    return `
      <div class="corte-caja-stat ${extraClass}">
        <span class="corte-caja-stat-label">${this.escapeHtml(label)}</span>
        <span class="corte-caja-stat-value">${this.escapeHtml(value)}</span>
      </div>`;
  },

  renderCajasHtml() {
    if (!this._cajas.length) {
      return `<p class="text-muted small mb-0">No hay cajas registradas para esta empresa.</p>`;
    }
    return `
      <div class="corte-caja-list-stack d-flex flex-column gap-2">
        ${this._cajas
          .map((c) => {
            const abierta = this.isAbierta(c);
            const selected = String(c.CODCAJA) === String(this._selectedCodcaja);
            return `
            <button type="button" class="card corte-caja-caja-card w-100 text-start p-3${selected ? ' is-selected' : ''}"
              data-codcaja="${c.CODCAJA}">
              <div class="d-flex justify-content-between align-items-start mb-1">
                <strong>${this.escapeHtml(c.DESCAJA)}</strong>
                <span class="badge ${abierta ? 'text-bg-success' : 'text-bg-secondary'}">
                  ${abierta ? 'Abierta' : 'Cerrada'}
                </span>
              </div>
              <div class="small text-muted">Código ${this.escapeHtml(c.CODCAJA)}</div>
              ${abierta ? `<div class="small mt-1">Efectivo inicial: <strong>${this.escapeHtml(this.formatMoney(c.EFECTIVOINICIAL))}</strong></div>` : ''}
            </button>`;
          })
          .join('')}
      </div>`;
  },

  renderResumenHtml() {
    const caja = this.selectedCaja();
    if (!caja) {
      return `
        <div class="card shadow-sm corte-caja-panel-card h-100">
          <div class="card-body text-muted text-center py-4">Seleccione una caja</div>
        </div>`;
    }

    if (!this.isAbierta(caja)) {
      return `
        <div class="card shadow-sm corte-caja-panel-card h-100">
          <div class="card-body">
            <h6 class="card-title mb-2">
              <i class="fa-solid fa-lock me-1 text-secondary"></i>${this.escapeHtml(caja.DESCAJA)}
            </h6>
            <p class="small text-muted mb-3">La caja está cerrada. Abra la caja para registrar ventas y realizar el corte al final del turno.</p>
            <button type="button" class="btn btn-success btn-sm" id="btn-corte-abrir">
              <i class="fa-solid fa-lock-open me-1"></i>Abrir caja
            </button>
          </div>
        </div>`;
    }

    const r = this._resumen;
    if (!r) {
      return `
        <div class="card shadow-sm corte-caja-panel-card h-100">
          <div class="card-body text-center text-muted py-4">
            <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando resumen…
          </div>
        </div>`;
    }

    return `
      <div class="card shadow-sm corte-caja-panel-card h-100">
        <div class="card-body">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <h6 class="card-title mb-0">
              <i class="fa-solid fa-cash-register me-1 text-primary"></i>${this.escapeHtml(caja.DESCAJA)} — turno abierto
            </h6>
            <span class="badge text-bg-success">Abierta</span>
          </div>
          <div class="corte-caja-stats mb-3">
            ${this.renderStat('Movimientos', String(r.totalMovimientos))}
            ${this.renderStat('Total venta', this.formatMoney(r.totalVenta))}
            ${this.renderStat('Crédito', this.formatMoney(r.totalCredito))}
            ${this.renderStat('Efectivo inicial', this.formatMoney(r.efectivoInicial))}
            ${this.renderStat('Efectivo ventas', this.formatMoney(r.fpEfectivo))}
            ${this.renderStat('Efectivo esperado', this.formatMoney(r.efectivoEsperado), 'text-primary')}
            ${this.renderStat('Tarjeta', this.formatMoney(r.fpTarjeta))}
            ${this.renderStat('Depósito', this.formatMoney(r.fpDeposito))}
            ${this.renderStat('Cheque', this.formatMoney(r.fpCheque))}
          </div>
          <hr class="my-3">
          <h6 class="small fw-semibold mb-2">Cerrar caja — arqueo</h6>
          <div class="row g-2">
            <div class="col-md-6">
              <label class="form-label small mb-0" for="corte-total-reportado">Efectivo contado</label>
              <input type="number" id="corte-total-reportado" class="form-control form-control-sm"
                min="0" step="0.01" value="${this.escapeHtml(String(r.efectivoEsperado))}">
            </div>
            <div class="col-md-6">
              <label class="form-label small mb-0" for="corte-reportado-tarjeta">Tarjeta reportada</label>
              <input type="number" id="corte-reportado-tarjeta" class="form-control form-control-sm"
                min="0" step="0.01" value="${this.escapeHtml(String(r.fpTarjeta))}">
            </div>
            <div class="col-md-6">
              <label class="form-label small mb-0" for="corte-reportado-cheques">Cheques reportados</label>
              <input type="number" id="corte-reportado-cheques" class="form-control form-control-sm"
                min="0" step="0.01" value="${this.escapeHtml(String(r.fpCheque))}">
            </div>
            <div class="col-md-6">
              <label class="form-label small mb-0" for="corte-reportado-deposito">Depósito reportado</label>
              <input type="number" id="corte-reportado-deposito" class="form-control form-control-sm"
                min="0" step="0.01" value="${this.escapeHtml(String(r.fpDeposito))}">
            </div>
            <div class="col-12">
              <label class="form-label small mb-0" for="corte-obs">Observaciones</label>
              <input type="text" id="corte-obs" class="form-control form-control-sm" maxlength="200" placeholder="Opcional">
            </div>
          </div>
          <div class="d-flex flex-wrap gap-2 mt-3">
            <button type="button" class="btn btn-danger btn-sm" id="btn-corte-cerrar">
              <i class="fa-solid fa-lock me-1"></i>Cerrar caja
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" id="btn-corte-refrescar">
              <i class="fa-solid fa-rotate-right me-1"></i>Refrescar
            </button>
          </div>
        </div>
      </div>`;
  },

  renderHtml() {
    return `
      <div class="corte-caja-wrap w-100">
        <div class="card shadow-sm mb-0">
          <div class="card-body">
            <h5 class="card-title mb-2">
              <i class="fa-solid fa-money-check me-1 text-primary"></i>Corte de caja
            </h5>
            <p class="small text-muted mb-3">
              Abra la caja al iniciar el turno (efectivo inicial). Al cerrarla se genera un registro en
              <strong>CORTES</strong> con el resumen de movimientos del período.
            </p>
            <div class="row g-3 corte-caja-main-row">
              <div class="col-12 col-lg-4">
                <h6 class="small fw-semibold mb-2">Cajas</h6>
                <div id="corte-caja-list">${this.renderCajasHtml()}</div>
              </div>
              <div class="col-12 col-lg-8" id="corte-caja-panel">${this.renderResumenHtml()}</div>
            </div>
          </div>
        </div>
      </div>`;
  },

  refreshPanels() {
    const list = this._container?.querySelector('#corte-caja-list');
    const panel = this._container?.querySelector('#corte-caja-panel');
    if (list) list.innerHTML = this.renderCajasHtml();
    if (panel) panel.innerHTML = this.renderResumenHtml();
    this.bindPanelEvents();
  },

  bindCajaSelect() {
    this._container?.querySelectorAll('[data-codcaja]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        this._selectedCodcaja = btn.dataset.codcaja;
        this._resumen = null;
        this.refreshPanels();
        await this.loadResumen();
        this.refreshPanels();
      });
    });
  },

  bindPanelEvents() {
    this.bindCajaSelect();
    document.getElementById('btn-corte-abrir')?.addEventListener('click', () => this.onAbrir());
    document.getElementById('btn-corte-cerrar')?.addEventListener('click', () => this.onCerrar());
    document.getElementById('btn-corte-refrescar')?.addEventListener('click', () => this.refreshResumen());
  },

  async onAbrir() {
    const caja = this.selectedCaja();
    if (!caja || this._loading) return;

    const { isConfirmed, value } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Abrir caja',
      html: `
        <p class="small text-muted mb-3">${this.escapeHtml(caja.DESCAJA)}</p>
        <label class="form-label small mb-0 text-start w-100" for="corte-abrir-efectivo">Efectivo inicial en caja</label>
        <input type="number" id="corte-abrir-efectivo" class="form-control" min="0" step="0.01" value="0">
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Abrir caja'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => document.getElementById('corte-abrir-efectivo')?.focus(),
      preConfirm: () => {
        const v = Number(document.getElementById('corte-abrir-efectivo')?.value ?? 0);
        if (!Number.isFinite(v) || v < 0) {
          Swal.showValidationMessage('Ingrese un monto válido');
          return false;
        }
        return v;
      },
    });
    if (!isConfirmed) return;

    this._loading = true;
    try {
      const url = `/api/corte-caja/${encodeURIComponent(caja.CODCAJA)}/abrir?empnit=${encodeURIComponent(F.getEmpNit())}`;
      await F.fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ EFECTIVOINICIAL: value }),
      });
      F.toast('Caja abierta', 'success');
      await this.reload();
    } catch (err) {
      F.toast(err.message || 'No se pudo abrir la caja', 'error');
    } finally {
      this._loading = false;
    }
  },

  async onCerrar() {
    const caja = this.selectedCaja();
    if (!caja || !this._resumen || this._loading) return;

    const totalReportado = Number(document.getElementById('corte-total-reportado')?.value ?? 0);
    const reportadoTarjeta = Number(document.getElementById('corte-reportado-tarjeta')?.value ?? 0);
    const reportadoCheques = Number(document.getElementById('corte-reportado-cheques')?.value ?? 0);
    const reportadoDeposito = Number(document.getElementById('corte-reportado-deposito')?.value ?? 0);
    const obs = document.getElementById('corte-obs')?.value?.trim() || '';

    const diff = Math.round((totalReportado - this._resumen.efectivoEsperado) * 100) / 100;
    const diffTxt =
      diff === 0
        ? 'Sin diferencia en efectivo.'
        : diff < 0
          ? `Faltante: ${this.formatMoney(Math.abs(diff))}`
          : `Sobrante: ${this.formatMoney(diff)}`;

    const { isConfirmed } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Cerrar caja',
      html: `
        <p class="small mb-2">Se registrará el corte y la caja quedará <strong>cerrada</strong>.</p>
        <p class="small text-muted mb-0">${this.escapeHtml(diffTxt)}</p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Cerrar caja'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
    });
    if (!isConfirmed) return;

    this._loading = true;
    try {
      const url = `/api/corte-caja/${encodeURIComponent(caja.CODCAJA)}/cerrar?empnit=${encodeURIComponent(F.getEmpNit())}`;
      const data = await F.fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          TOTALREPORTADO: totalReportado,
          REPORTADOTARJETA: reportadoTarjeta,
          REPORTADOCHEQUES: reportadoCheques,
          REPORTADO_DEPOSITO: reportadoDeposito,
          OBS: obs,
          USUARIO: this.usuario(),
        }),
      });
      const msg =
        data.faltante > 0
          ? `Corte #${data.corte.CORRELATIVO} — faltante ${this.formatMoney(data.faltante)}`
          : data.sobrante > 0
            ? `Corte #${data.corte.CORRELATIVO} — sobrante ${this.formatMoney(data.sobrante)}`
            : `Corte #${data.corte.CORRELATIVO} registrado`;
      F.toast(msg, 'success');
      await this.reload();
    } catch (err) {
      F.toast(err.message || 'No se pudo cerrar la caja', 'error');
    } finally {
      this._loading = false;
    }
  },

  async loadCajas() {
    const data = await F.fetchJson(this.apiUrl('/cajas'));
    this._cajas = data.rows || [];
    if (!this._selectedCodcaja && this._cajas.length) {
      const abierta = this._cajas.find((c) => this.isAbierta(c));
      this._selectedCodcaja = abierta ? abierta.CODCAJA : this._cajas[0].CODCAJA;
    }
  },

  async loadResumen() {
    const caja = this.selectedCaja();
    if (!caja || !this.isAbierta(caja)) {
      this._resumen = null;
      return;
    }
    const data = await F.fetchJson(this.apiUrl(`/${caja.CODCAJA}/resumen`));
    this._resumen = data.resumen;
  },

  async refreshResumen() {
    try {
      await this.loadResumen();
      this.refreshPanels();
    } catch (err) {
      F.toast(err.message || 'Error al cargar resumen', 'error');
    }
  },

  async reload() {
    await this.loadCajas();
    await this.loadResumen();
    this.refreshPanels();
  },

  async load(container) {
    this._container = container;
    this._cajas = [];
    this._resumen = null;
    this._selectedCodcaja = null;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start');
    container.innerHTML = `
      <div class="text-center text-muted py-5 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando corte de caja…
      </div>`;

    try {
      await this.loadCajas();
      await this.loadResumen();
      container.innerHTML = this.renderHtml();
      this.bindPanelEvents();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger mb-0 w-100">
          No se pudo cargar corte de caja: ${this.escapeHtml(err.message)}
        </div>`;
      F.toast('Error al cargar corte de caja', 'error');
    }
  },
};
