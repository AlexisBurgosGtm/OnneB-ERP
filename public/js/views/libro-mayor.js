/**
 * Vista Libro Mayor — movimientos por cuenta con saldo acumulado.
 */
const LibroMayorView = {
  _container: null,
  _rows: [],
  _warnings: [],
  _totals: null,
  _mes: null,
  _anio: null,
  _loading: false,
  _exporting: false,
  _prefix: 'libro-mayor',

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiUrl() {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const params = new URLSearchParams({
      empnit: empNit,
      mes: String(this._mes),
      anio: String(this._anio),
      _: String(Date.now()),
    });
    return `/api/libro-mayor?${params.toString()}`;
  },

  badgeText() {
    const t = this._totals || {};
    const parts = [
      `${t.cuentas ?? 0} cuenta(s)`,
      `${t.movimientos ?? 0} movimiento(s)`,
      `${LibroContableCommon.mesLabel(this._mes)} ${this._anio}`,
      `Debe: ${LibroContableCommon.formatMoney(t.debe ?? 0)}`,
      `Haber: ${LibroContableCommon.formatMoney(t.haber ?? 0)}`,
    ];
    if ((t.sinFormato ?? 0) > 0) parts.push(`Sin formato: ${t.sinFormato}`);
    return parts.join(' · ');
  },

  renderFiltersCard() {
    const p = this._prefix;
    return `
      <div class="card libro-mayor-filters-card shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-end gap-2 libro-mayor-filters-row">
            ${LibroContableCommon.periodSelectsHtml(p, this._mes, this._anio)}
            <div class="libro-mayor-actions d-flex flex-wrap gap-2">
              ${LibroContableCommon.actionButtonsHtml(p)}
            </div>
          </div>
          <div class="libro-mayor-badge small text-muted mt-2" id="${p}-count">${this.escapeHtml(this.badgeText())}</div>
          <div class="small text-muted mt-1">
            Movimientos del libro diario agrupados por cuenta contable con saldo acumulado según naturaleza (D/A).
          </div>
        </div>
      </div>
    `;
  },

  rowClass(row) {
    if (row.TIPO === 'CUENTA') return 'libro-mayor-row-cuenta';
    if (row.TIPO === 'SUBTOTAL') return 'libro-mayor-row-subtotal';
    return '';
  },

  renderTableBodyHtml(rows) {
    if (!rows.length) {
      return `<tr><td colspan="7" class="text-center text-muted py-4">No hay movimientos para este período</td></tr>`;
    }
    return rows
      .map((row) => {
        const cls = this.rowClass(row);
        if (row.TIPO === 'CUENTA') {
          return `
            <tr class="${cls}">
              <td colspan="7" class="fw-semibold libro-mayor-cuenta-header">
                <i class="fa-solid fa-bookmark me-1 text-primary"></i>
                ${this.escapeHtml(row.CODCUENTA)} — ${this.escapeHtml(row.DESCRIPCION || '—')}
                <span class="badge text-bg-light ms-2">${this.escapeHtml(row.DA === 'A' ? 'Acreedora' : 'Deudora')}</span>
              </td>
            </tr>`;
        }
        const money = (v) =>
          v === null || v === undefined || v === ''
            ? '—'
            : `<span class="libro-contable-money">${this.escapeHtml(LibroContableCommon.formatMoney(v))}</span>`;
        return `
          <tr class="${cls}">
            <td class="text-center">${row.TIPO === 'SUBTOTAL' ? '' : this.escapeHtml(row.LINEA)}</td>
            <td>${row.FECHA ? this.escapeHtml(LibroContableCommon.formatDate(row.FECHA)) : '—'}</td>
            <td>${this.escapeHtml(row.DOC_REF || (row.TIPO === 'SUBTOTAL' ? '' : '—'))}</td>
            <td class="libro-mayor-col-glosa">${this.escapeHtml(row.GLOSA || '—')}</td>
            <td class="text-end">${money(row.DEBE)}</td>
            <td class="text-end">${money(row.HABER)}</td>
            <td class="text-end fw-semibold">${money(row.SALDO)}</td>
          </tr>`;
      })
      .join('');
  },

  renderTableCard() {
    return `
      <div class="card libro-mayor-table-card shadow-sm">
        <div class="table-responsive">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light sticky-top">
              <tr>
                <th class="text-center">No.</th>
                <th>Fecha</th>
                <th>Documento</th>
                <th>Glosa</th>
                <th class="text-end">Debe</th>
                <th class="text-end">Haber</th>
                <th class="text-end">Saldo</th>
              </tr>
            </thead>
            <tbody id="libro-mayor-tbody">${this.renderTableBodyHtml(this._rows)}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  render() {
    return `
      <div class="libro-mayor-wrap">
        ${this.renderFiltersCard()}
        <div id="libro-mayor-warnings-wrap">${LibroContableCommon.renderWarningsHtml(this._warnings, (v) => this.escapeHtml(v))}</div>
        ${this.renderTableCard()}
      </div>
    `;
  },

  refreshDom() {
    const countEl = this._container?.querySelector('#libro-mayor-count');
    if (countEl) countEl.textContent = this.badgeText();
    const warnWrap = this._container?.querySelector('#libro-mayor-warnings-wrap');
    if (warnWrap) {
      warnWrap.innerHTML = LibroContableCommon.renderWarningsHtml(this._warnings, (v) => this.escapeHtml(v));
    }
    const tbody = this._container?.querySelector('#libro-mayor-tbody');
    if (tbody) tbody.innerHTML = this.renderTableBodyHtml(this._rows);
  },

  bindEvents() {
    LibroContableCommon.bindPeriodAndActions(this._container, this._prefix, this);
  },

  async reload() {
    if (this._loading) return;
    this._loading = true;
    try {
      const data = await F.fetchJson(this.apiUrl(), { cache: 'no-store' });
      this._rows = data.rows || [];
      this._warnings = data.warnings || [];
      this._totals = data.totals || null;
      this.refreshDom();
    } finally {
      this._loading = false;
    }
  },

  async exportExcel() {
    if (this._exporting) return;
    this._exporting = true;
    const btn = this._container?.querySelector('#btn-libro-mayor-export');
    try {
      const url = LibroContableCommon.buildExportUrl('/api/libro-mayor', this._mes, this._anio);
      await LibroContableCommon.downloadExport(url, btn, `libro_mayor_${this._mes}_${this._anio}.xlsx`);
    } finally {
      this._exporting = false;
    }
  },

  async imprimir() {
    await PrintReport.ensureLogo();
    const title = 'Libro Mayor';
    const subtitleHtml = `
      <p><strong>Período:</strong> ${PrintReport.escapeHtml(LibroContableCommon.mesLabel(this._mes))} ${PrintReport.escapeHtml(String(this._anio))}</p>
      <p class="meta">Movimientos por cuenta con saldo acumulado</p>
    `;
    const bodyRows = this._rows
      .map((row) => {
        if (row.TIPO === 'CUENTA') {
          return `<tr class="section"><td colspan="7"><strong>${PrintReport.escapeHtml(row.CODCUENTA)} — ${PrintReport.escapeHtml(row.DESCRIPCION || '')}</strong></td></tr>`;
        }
        return `<tr>
          <td class="text-center">${PrintReport.escapeHtml(row.LINEA || '')}</td>
          <td>${PrintReport.escapeHtml(row.FECHA ? LibroContableCommon.formatDate(row.FECHA) : '')}</td>
          <td>${PrintReport.escapeHtml(row.DOC_REF || '')}</td>
          <td>${PrintReport.escapeHtml(row.GLOSA || '')}</td>
          <td class="text-end">${PrintReport.escapeHtml(LibroContableCommon.formatMoney(row.DEBE ?? 0))}</td>
          <td class="text-end">${PrintReport.escapeHtml(LibroContableCommon.formatMoney(row.HABER ?? 0))}</td>
          <td class="text-end">${PrintReport.escapeHtml(LibroContableCommon.formatMoney(row.SALDO ?? 0))}</td>
        </tr>`;
      })
      .join('');
    const t = this._totals || {};
    const footer = this._rows.length
      ? `<tfoot><tr class="totals">
          <td colspan="4" class="text-end">Totales</td>
          <td class="text-end">${PrintReport.escapeHtml(LibroContableCommon.formatMoney(t.debe))}</td>
          <td class="text-end">${PrintReport.escapeHtml(LibroContableCommon.formatMoney(t.haber))}</td>
          <td></td>
        </tr></tfoot>`
      : '';
    PrintReport.openAndPrint(
      PrintReport.wrapDocument({
        title,
        bodyHtml: `
          ${PrintReport.reportHeaderHtml({ title, subtitleHtml })}
          <table>
            <thead><tr>
              <th>No.</th><th>Fecha</th><th>Documento</th><th>Glosa</th>
              <th class="text-end">Debe</th><th class="text-end">Haber</th><th class="text-end">Saldo</th>
            </tr></thead>
            <tbody>${bodyRows || '<tr><td colspan="7">Sin registros</td></tr>'}</tbody>
            ${footer}
          </table>
        `,
      })
    );
  },

  async load(container) {
    this._container = container;
    const period = LibroContableCommon.defaultPeriod();
    this._mes = period.mes;
    this._anio = period.anio;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start');
    container.innerHTML = this.render();
    this.bindEvents();
    await this.reload();
  },
};
