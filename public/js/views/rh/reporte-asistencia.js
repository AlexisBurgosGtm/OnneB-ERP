/**
 * RH → Reporte de Asistencia (horas por mes/año).
 */
const ReporteAsistenciaView = {
  _container: null,
  _mes: null,
  _anio: null,
  _data: null,

  MESES: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ],

  escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  defaultPeriod() {
    const d = new Date();
    return { mes: d.getMonth() + 1, anio: d.getFullYear() };
  },

  mesLabel(m) {
    return this.MESES[Number(m) - 1] || String(m);
  },

  formatHoras(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return x.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  apiUrl() {
    const emp = F.getEmpNit();
    return `/api/asistencia/reporte?empnit=${encodeURIComponent(emp)}&mes=${this._mes}&anio=${this._anio}&_=${Date.now()}`;
  },

  renderDetalleRows(detalle) {
    if (!detalle?.length) {
      return '<tr><td colspan="5" class="text-center text-muted py-2">Sin detalle</td></tr>';
    }
    return detalle
      .map(
        (d) => `<tr>
          <td>${this.escapeHtml(d.FECHA || '—')}</td>
          <td class="text-nowrap">${this.escapeHtml(d.HORA_ENTRADA || '—')}</td>
          <td class="text-nowrap">${this.escapeHtml(d.HORA_SALIDA || '—')}</td>
          <td class="text-nowrap small text-muted">${this.escapeHtml(d.HORA_SALIDA_ALMUERZO || '—')} / ${this.escapeHtml(d.HORA_ENTRADA_ALMUERZO || '—')}</td>
          <td class="text-end fw-semibold">${this.escapeHtml(this.formatHoras(d.HORAS))}</td>
        </tr>`
      )
      .join('');
  },

  detalleModalHtml(emp) {
    return `
      <div class="table-responsive reporte-asistencia-modal-table">
        <table class="table table-sm table-striped align-middle mb-0 text-start">
          <thead class="table-light">
            <tr>
              <th>Fecha</th><th>Entrada</th><th>Salida</th><th>Almuerzo (S/E)</th><th class="text-end">Horas</th>
            </tr>
          </thead>
          <tbody>${this.renderDetalleRows(emp.detalle)}</tbody>
        </table>
      </div>
      <p class="small text-muted text-start mb-0 mt-2">Horas = salida − entrada (resta almuerzo si aplica).</p>`;
  },

  async showDetalleModal(emp) {
    if (!emp) return;
    const titulo = `${emp.NOMEMPLEADO || 'Empleado'} (${emp.CODEMPLEADO})`;
    const subt = `${this.escapeHtml(emp.DEPARTAMENTO || '—')} · ${this.escapeHtml(this.formatHoras(emp.HORAS))} h · ${this.escapeHtml(emp.DIAS ?? 0)} día(s)`;
    await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: this.escapeHtml(titulo),
      html: `<p class="small text-muted text-start mb-2">${subt}</p>${this.detalleModalHtml(emp)}`,
      width: 720,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
    });
  },

  renderTable() {
    const empleados = this._data?.empleados || [];
    if (!empleados.length) {
      return '<p class="text-center text-muted py-4 mb-0">Sin registros de asistencia en el período</p>';
    }
    const rows = empleados
      .map((e) => {
        const key = String(e.CODEMPLEADO);
        return `<tr class="reporte-asistencia-emp-row" data-cod="${this.escapeHtml(key)}" style="cursor:pointer" title="Ver detalle diario">
            <td>${this.escapeHtml(e.CODEMPLEADO)}</td>
            <td>${this.escapeHtml(e.NOMEMPLEADO || '—')}</td>
            <td>${this.escapeHtml(e.DEPARTAMENTO || '—')}</td>
            <td class="text-end">${this.escapeHtml(e.DIAS ?? 0)}</td>
            <td class="text-end fw-semibold">${this.escapeHtml(this.formatHoras(e.HORAS))}</td>
          </tr>`;
      })
      .join('');
    return `
      <div class="table-responsive reporte-asistencia-table-wrap">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th>Código</th>
              <th>Empleado</th>
              <th>Departamento</th>
              <th class="text-end">Días</th>
              <th class="text-end">Horas</th>
            </tr>
          </thead>
          <tbody>${rows}
            <tr class="table-light fw-bold">
              <td colspan="3" class="text-end">Total (${empleados.length} empleado(s))</td>
              <td class="text-end">—</td>
              <td class="text-end">${this.escapeHtml(this.formatHoras(this._data?.totalHoras))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="small text-muted mt-2 mb-0">Clic en un empleado para ver el detalle diario en una ventana.</p>`;
  },

  renderShell() {
    const p = this.defaultPeriod();
    if (!this._mes) this._mes = p.mes;
    if (!this._anio) this._anio = p.anio;
    const mesOpts = this.MESES.map(
      (label, i) =>
        `<option value="${i + 1}"${Number(this._mes) === i + 1 ? ' selected' : ''}>${label}</option>`
    ).join('');
    const years = [];
    for (let y = new Date().getFullYear() + 1; y >= new Date().getFullYear() - 5; y -= 1) years.push(y);
    const anioOpts = years
      .map((y) => `<option value="${y}"${Number(this._anio) === y ? ' selected' : ''}>${y}</option>`)
      .join('');
    return `
      <div class="catalogo-empresa-view reporte-asistencia-view w-100">
        <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-0">Reporte de Asistencia</h2>
            <p class="small text-muted mb-0">${this.escapeHtml(this.mesLabel(this._mes))} ${this.escapeHtml(this._anio)}</p>
          </div>
          <div class="d-flex flex-wrap gap-2 align-items-end">
            <div>
              <label class="form-label small mb-1" for="ras-mes">Mes</label>
              <select id="ras-mes" class="form-select form-select-sm">${mesOpts}</select>
            </div>
            <div>
              <label class="form-label small mb-1" for="ras-anio">Año</label>
              <select id="ras-anio" class="form-select form-select-sm">${anioOpts}</select>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary" id="ras-recargar"><i class="fa-solid fa-rotate me-1"></i>Actualizar</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="ras-imprimir"><i class="fa-solid fa-print me-1"></i>Imprimir</button>
          </div>
        </div>
        <div class="card shadow-sm"><div class="card-body p-0" id="ras-table">${this.renderTable()}</div></div>
      </div>`;
  },

  buildPrintHtml() {
    const empleados = this._data?.empleados || [];
    const body = empleados
      .map(
        (e) => `<tr>
          <td>${this.escapeHtml(e.CODEMPLEADO)}</td>
          <td>${this.escapeHtml(e.NOMEMPLEADO)}</td>
          <td>${this.escapeHtml(e.DEPARTAMENTO || '—')}</td>
          <td class="text-end">${this.escapeHtml(e.DIAS)}</td>
          <td class="text-end">${this.escapeHtml(this.formatHoras(e.HORAS))}</td>
        </tr>`
      )
      .join('');
    const title = `Reporte de Asistencia — ${this.mesLabel(this._mes)} ${this._anio}`;
    return PrintReport.wrapDocument({
      title,
      bodyHtml: `
      ${PrintReport.reportHeaderHtml({ title })}
      <table class="report-table"><thead><tr>
        <th>Código</th><th>Empleado</th><th>Depto.</th><th class="text-end">Días</th><th class="text-end">Horas</th>
      </tr></thead><tbody>${body}
      <tr><td colspan="3" class="text-end"><strong>Total</strong></td><td></td>
      <td class="text-end"><strong>${this.escapeHtml(this.formatHoras(this._data?.totalHoras))}</strong></td></tr>
      </tbody></table>`,
    });
  },

  async imprimir() {
    await PrintReport.ensureLogo();
    await PrintReport.openAndPrint(() => this.buildPrintHtml(), 'width=900,height=700');
  },

  findEmpleado(cod) {
    const list = this._data?.empleados || [];
    return list.find((e) => String(e.CODEMPLEADO) === String(cod));
  },

  bindEvents() {
    this._container?.querySelector('#ras-mes')?.addEventListener('change', (e) => {
      this._mes = Number(e.target.value);
      this.reload();
    });
    this._container?.querySelector('#ras-anio')?.addEventListener('change', (e) => {
      this._anio = Number(e.target.value);
      this.reload();
    });
    this._container?.querySelector('#ras-recargar')?.addEventListener('click', () => this.reload());
    this._container?.querySelector('#ras-imprimir')?.addEventListener('click', () => {
      this.imprimir().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#ras-table')?.addEventListener('click', (ev) => {
      const tr = ev.target.closest('.reporte-asistencia-emp-row');
      if (!tr) return;
      const cod = tr.getAttribute('data-cod');
      const emp = this.findEmpleado(cod);
      this.showDetalleModal(emp).catch((err) => F.toast(err.message, 'error'));
    });
  },

  async reload() {
    const table = this._container?.querySelector('#ras-table');
    if (table) table.innerHTML = '<p class="text-center text-muted py-4"><i class="fa-solid fa-spinner fa-spin me-1"></i>Cargando…</p>';
    try {
      this._data = await F.fetchJson(this.apiUrl(), { cache: 'no-store' });
      if (table) table.innerHTML = this.renderTable();
    } catch (err) {
      if (table) table.innerHTML = `<div class="alert alert-danger m-3">${this.escapeHtml(err.message)}</div>`;
    }
  },

  async load(container) {
    this._container = container;
    const p = this.defaultPeriod();
    this._mes = p.mes;
    this._anio = p.anio;
    container.className = 'main-content flex-grow-1 d-flex p-3 align-items-stretch justify-content-start';
    if (!F.getEmpNit()) {
      container.innerHTML = '<div class="alert alert-warning m-0 w-100">No hay empresa activa.</div>';
      return;
    }
    container.innerHTML = this.renderShell();
    this.bindEvents();
    await this.reload();
  },
};
