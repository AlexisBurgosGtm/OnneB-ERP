/**
 * Vista Corte de caja — abrir/cerrar cajas y registrar cortes.
 */
const CorteCajaView = {
  _container: null,
  _cajas: [],
  _selectedCodcaja: null,
  _resumen: null,
  _loading: false,
  _muestraDatos: false,

  escapeHtml(value) {
    if (value == null) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  },

  usuario() {
    const u = F.session('user');
    return u?.usuario || u?.username || 'SN';
  },

  usuarioNombre() {
    const u = F.session('user');
    return u?.username || u?.usuario || 'SN';
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

  renderClickableStat(label, value, filtro, extraClass = '') {
    return `
      <button type="button" class="corte-caja-stat corte-caja-stat-clickable ${extraClass}"
        data-corte-filtro="${this.escapeHtml(filtro)}" title="Ver detalle">
        <span class="corte-caja-stat-label">${this.escapeHtml(label)}</span>
        <span class="corte-caja-stat-value">${this.escapeHtml(value)}</span>
      </button>`;
  },

  renderResumenStats(r) {
    if (!this._muestraDatos) return '';

    const statOrClick = (label, value, filtro, extraClass = '') =>
      filtro
        ? this.renderClickableStat(label, value, filtro, extraClass)
        : this.renderStat(label, value, extraClass);

    let html = `
      ${this.renderStat('Movimientos', String(r.totalMovimientos))}
      ${this.renderStat('Total venta', this.formatMoney(r.totalVenta))}
      ${statOrClick('Crédito', this.formatMoney(r.totalCredito), 'credito')}
      ${this.renderStat('Efectivo inicial', this.formatMoney(r.efectivoInicial))}
      ${statOrClick('Efectivo esperado', this.formatMoney(r.efectivoEsperado), 'contado', 'text-primary')}
      ${statOrClick('Tarjeta', this.formatMoney(r.fpTarjeta), 'tarjeta')}
      ${statOrClick('Depósito', this.formatMoney(r.fpDeposito), 'deposito')}
      ${statOrClick('Cheque', this.formatMoney(r.fpCheque), 'cheque')}`;

    return html;
  },

  renderArqueoInputs(r) {
    const blind = !this._muestraDatos;
    const cashVal = blind ? '' : String(r.efectivoEsperado);
    const tarjetaVal = blind ? '' : String(r.fpTarjeta);
    const chequeVal = blind ? '' : String(r.fpCheque);
    const depositoVal = blind ? '' : String(r.fpDeposito);

    return `
      <div class="row g-2">
        <div class="col-md-6">
          <label class="form-label small mb-0" for="corte-total-reportado">Efectivo contado</label>
          <input type="number" id="corte-total-reportado" class="form-control form-control-sm"
            min="0" step="0.01" value="${this.escapeHtml(cashVal)}" placeholder="${blind ? '0.00' : ''}">
        </div>
        <div class="col-md-6">
          <label class="form-label small mb-0" for="corte-reportado-tarjeta">Tarjeta reportada</label>
          <input type="number" id="corte-reportado-tarjeta" class="form-control form-control-sm"
            min="0" step="0.01" value="${this.escapeHtml(tarjetaVal)}" placeholder="${blind ? '0.00' : ''}">
        </div>
        <div class="col-md-6">
          <label class="form-label small mb-0" for="corte-reportado-cheques">Cheques reportados</label>
          <input type="number" id="corte-reportado-cheques" class="form-control form-control-sm"
            min="0" step="0.01" value="${this.escapeHtml(chequeVal)}" placeholder="${blind ? '0.00' : ''}">
        </div>
        <div class="col-md-6">
          <label class="form-label small mb-0" for="corte-reportado-deposito">Depósito reportado</label>
          <input type="number" id="corte-reportado-deposito" class="form-control form-control-sm"
            min="0" step="0.01" value="${this.escapeHtml(depositoVal)}" placeholder="${blind ? '0.00' : ''}">
        </div>
        <div class="col-12">
          <label class="form-label small mb-0" for="corte-obs">Observaciones</label>
          <input type="text" id="corte-obs" class="form-control form-control-sm" maxlength="200" placeholder="Opcional">
        </div>
      </div>`;
  },

  buildCortePrintHtml({ caja, corte, resumen, reportado, faltante, sobrante, obs, usuarioNombre }) {
    const fecha = new Date().toLocaleString('es-GT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const money = (v) => PrintReport.escapeHtml(this.formatMoney(v));
    const row = (label, value, extraClass = '') =>
      `<tr><td>${PrintReport.escapeHtml(label)}</td><td class="text-end${extraClass ? ` ${extraClass}` : ''}">${value}</td></tr>`;

    const diffRow =
      faltante > 0
        ? row('Faltante', `<strong class="text-danger">${money(faltante)}</strong>`)
        : sobrante > 0
          ? row('Sobrante', `<strong class="text-success">${money(sobrante)}</strong>`)
          : row('Diferencia efectivo', '<strong>Sin diferencia</strong>');

    const bodyHtml = `
      ${PrintReport.reportHeaderHtml({
        title: 'Corte de caja',
        subtitleHtml: `
          <p><strong>Corte #${PrintReport.escapeHtml(corte.CORRELATIVO)}</strong> · ${PrintReport.escapeHtml(fecha)}</p>
          <p><strong>Caja:</strong> ${PrintReport.escapeHtml(caja.DESCAJA)} (${PrintReport.escapeHtml(caja.CODCAJA)})</p>
          <p><strong>Usuario:</strong> ${PrintReport.escapeHtml(usuarioNombre)}</p>
          ${obs ? `<p><strong>Observaciones:</strong> ${PrintReport.escapeHtml(obs)}</p>` : ''}
        `,
      })}
      <h2 class="corte-print-section">Resumen del turno</h2>
      <table>
        <tbody>
          ${row('Movimientos', PrintReport.escapeHtml(String(resumen.totalMovimientos)))}
          ${row('Total venta', money(resumen.totalVenta))}
          ${row('Ventas al crédito', money(resumen.totalCredito))}
          ${row('Efectivo inicial', money(resumen.efectivoInicial))}
          ${row('Efectivo ventas (contado)', money(resumen.fpEfectivo))}
          ${row('Efectivo esperado', money(resumen.efectivoEsperado))}
          ${row('Tarjeta (sistema)', money(resumen.fpTarjeta))}
          ${row('Depósito (sistema)', money(resumen.fpDeposito))}
          ${row('Cheque (sistema)', money(resumen.fpCheque))}
        </tbody>
      </table>
      <h2 class="corte-print-section">Arqueo reportado</h2>
      <table>
        <tbody>
          ${row('Efectivo contado', money(reportado.efectivo))}
          ${row('Tarjeta reportada', money(reportado.tarjeta))}
          ${row('Cheques reportados', money(reportado.cheques))}
          ${row('Depósito reportado', money(reportado.deposito))}
          ${diffRow}
        </tbody>
      </table>`;

    return PrintReport.wrapDocument({
      title: `Corte de caja #${corte.CORRELATIVO}`,
      bodyHtml,
      extraStyles: `
        h2.corte-print-section{font-size:.95rem;margin:1rem 0 .35rem;font-weight:600}
        table td:first-child{width:55%}
      `,
    });
  },

  imprimirCorte(payload) {
    if (typeof PrintReport === 'undefined') {
      F.toast('No se pudo abrir el imprimible', 'warning');
      return;
    }
    const html = this.buildCortePrintHtml(payload);
    PrintReport.openAndPrint(html, 'width=800,height=700');
  },

  async fetchMuestraDatosConfig() {
    try {
      const opcion = encodeURIComponent('MUESTRA DATOS EN CORTE DE CAJA');
      const data = await F.fetchJson(`/api/config/sino?opcion=${opcion}&_=${Date.now()}`);
      this._muestraDatos = String(data.sino || 'NO').trim().toUpperCase() === 'SI';
    } catch {
      this._muestraDatos = false;
    }
  },

  formatFecha(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-GT');
  },

  filtroTitulo(filtro) {
    const map = {
      credito: 'Facturas al crédito',
      contado: 'Ventas al contado',
      tarjeta: 'Pagos con tarjeta',
      deposito: 'Pagos con depósito',
      cheque: 'Pagos con cheque',
    };
    return map[filtro] || 'Documentos';
  },

  importeColumnLabel(filtro) {
    if (filtro === 'tarjeta') return 'Monto tarjeta';
    if (filtro === 'deposito') return 'Monto depósito';
    if (filtro === 'cheque') return 'Monto cheque';
    return 'Importe';
  },

  rowImporte(row, filtro) {
    if (filtro === 'tarjeta') return row.FPAGO_TARJETA;
    if (filtro === 'deposito') return row.FPAGO_DEPOSITO;
    if (filtro === 'cheque') return row.FPAGO_CHEQUE;
    return row.TOTALPRECIO;
  },

  renderDocumentosModalHtml(filtro, rows) {
    const importeLabel = this.importeColumnLabel(filtro);
    if (!rows.length) {
      return `<p class="text-muted small mb-0 text-center py-3">Sin documentos en este filtro.</p>`;
    }
    let total = 0;
    const body = rows
      .map((r) => {
        const imp = Number(this.rowImporte(r, filtro)) || 0;
        total += imp;
        return `
          <tr>
            <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
            <td class="text-nowrap">${this.escapeHtml(r.CODDOC)}</td>
            <td class="text-end">${this.escapeHtml(r.CORRELATIVO)}</td>
            <td>${this.escapeHtml(r.VENDEDOR || '—')}</td>
            <td>${this.escapeHtml(r.DOC_NOMCLIE || '—')}</td>
            <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(imp))}</td>
          </tr>`;
      })
      .join('');
    return `
      <div class="table-responsive corte-caja-docs-modal-table">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Fecha</th>
              <th>CODDOC</th>
              <th class="text-end">Correlativo</th>
              <th>Vendedor</th>
              <th>Cliente</th>
              <th class="text-end">${this.escapeHtml(importeLabel)}</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot class="table-light">
            <tr>
              <th colspan="5" class="text-end">${rows.length} documento(s)</th>
              <th class="text-end">${this.escapeHtml(this.formatMoney(total))}</th>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  async showDocumentosModal(filtro) {
    const caja = this.selectedCaja();
    if (!caja || !this.isAbierta(caja)) return;
    try {
      const data = await F.fetchJson(
        this.apiUrl(`/${caja.CODCAJA}/documentos`, { filtro })
      );
      await Swal.fire({
        ...CatalogosUI.modalBase(),
        title: this.filtroTitulo(filtro),
        width: '42rem',
        html: this.renderDocumentosModalHtml(filtro, data.rows || []),
        confirmButtonText: CatalogosUI.guardarButtonHtml('Cerrar'),
        showCancelButton: false,
      });
    } catch (err) {
      F.toast(err.message || 'No se pudo cargar el detalle', 'error');
    }
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
              ${abierta && this._muestraDatos ? `<div class="small mt-1">Efectivo inicial: <strong>${this.escapeHtml(this.formatMoney(c.EFECTIVOINICIAL))}</strong></div>` : ''}
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

    const statsHtml = this.renderResumenStats(r);
    const blindNotice = !this._muestraDatos
      ? `<div class="alert alert-warning py-2 px-3 small mb-3 corte-caja-blind-notice">
          <i class="fa-solid fa-eye-slash me-1"></i>
          <strong>Arqueo ciego:</strong> ingrese los montos contados. Los totales del sistema no se muestran por seguridad.
        </div>`
      : '';

    return `
      <div class="card shadow-sm corte-caja-panel-card h-100">
        <div class="card-body">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <h6 class="card-title mb-0">
              <i class="fa-solid fa-cash-register me-1 text-primary"></i>${this.escapeHtml(caja.DESCAJA)} — turno abierto
            </h6>
            <span class="badge text-bg-success">Abierta</span>
          </div>
          ${blindNotice}
          ${statsHtml ? `<div class="corte-caja-stats mb-3">${statsHtml}</div>` : ''}
          <hr class="my-3">
          <h6 class="small fw-semibold mb-2">Cerrar caja — arqueo</h6>
          ${this.renderArqueoInputs(r)}
          <div class="d-flex flex-wrap gap-2 mt-3">
            <button type="button" class="btn btn-danger btn-sm" id="btn-corte-cerrar">
              <i class="fa-solid fa-lock me-1"></i>Cerrar caja
            </button>
            ${this._muestraDatos ? `<button type="button" class="btn btn-outline-secondary btn-sm" id="btn-corte-refrescar">
              <i class="fa-solid fa-rotate-right me-1"></i>Refrescar
            </button>` : ''}
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
    this._container?.querySelectorAll('[data-corte-filtro]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const filtro = btn.getAttribute('data-corte-filtro');
        if (filtro) this.showDocumentosModal(filtro);
      });
    });
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

    if (!Number.isFinite(totalReportado) || totalReportado < 0) {
      F.toast('Ingrese un monto válido de efectivo contado', 'warning');
      return;
    }

    let confirmHtml = '<p class="small mb-2">Se registrará el corte y la caja quedará <strong>cerrada</strong>.</p>';
    if (this._muestraDatos) {
      const diff = Math.round((totalReportado - this._resumen.efectivoEsperado) * 100) / 100;
      const diffTxt =
        diff === 0
          ? 'Sin diferencia en efectivo.'
          : diff < 0
            ? `Faltante: ${this.formatMoney(Math.abs(diff))}`
            : `Sobrante: ${this.formatMoney(diff)}`;
      confirmHtml += `<p class="small text-muted mb-0">${this.escapeHtml(diffTxt)}</p>`;
    } else {
      confirmHtml +=
        '<p class="small text-muted mb-0">Confirme los montos ingresados antes de cerrar.</p>';
    }

    const { isConfirmed } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Cerrar caja',
      html: confirmHtml,
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
          USUARIO: this.usuarioNombre(),
        }),
      });
      const msg =
        data.faltante > 0
          ? `Corte #${data.corte.CORRELATIVO} — faltante ${this.formatMoney(data.faltante)}`
          : data.sobrante > 0
            ? `Corte #${data.corte.CORRELATIVO} — sobrante ${this.formatMoney(data.sobrante)}`
            : `Corte #${data.corte.CORRELATIVO} registrado`;
      F.toast(msg, 'success');
      this.imprimirCorte({
        caja,
        corte: data.corte,
        resumen: data.resumen,
        reportado: {
          efectivo: totalReportado,
          tarjeta: reportadoTarjeta,
          cheques: reportadoCheques,
          deposito: reportadoDeposito,
        },
        faltante: data.faltante,
        sobrante: data.sobrante,
        obs,
        usuarioNombre: this.usuarioNombre(),
      });
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
    await this.fetchMuestraDatosConfig();
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
      await this.fetchMuestraDatosConfig();
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
