/**
 * Vista Libro Balance — Balance General y Estado de Resultados.
 */
const LibroBalanceView = {
  _container: null,
  _rows: [],
  _warnings: [],
  _totals: null,
  _mes: null,
  _anio: null,
  _loading: false,
  _exporting: false,
  _prefix: 'libro-balance',

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
    return `/api/libro-balance?${params.toString()}`;
  },

  badgeText() {
    const t = this._totals || {};
    return [
      `${t.cuentas ?? 0} cuenta(s) con movimiento`,
      `${LibroContableCommon.mesLabel(this._mes)} ${this._anio}`,
      `Utilidad: ${LibroContableCommon.formatMoney(t.utilidad ?? 0)}`,
    ].join(' · ');
  },

  renderFiltersCard() {
    const p = this._prefix;
    return `
      <div class="card libro-balance-filters-card shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-end gap-2 libro-balance-filters-row">
            ${LibroContableCommon.periodSelectsHtml(p, this._mes, this._anio)}
            <div class="libro-balance-actions d-flex flex-wrap gap-2">
              ${LibroContableCommon.actionButtonsHtml(p)}
            </div>
          </div>
          <div class="libro-balance-badge small text-muted mt-2" id="${p}-count">${this.escapeHtml(this.badgeText())}</div>
          <div class="small text-muted mt-1">
            Saldos del período según movimientos contables actuales (formatos de documentos).
            Se integrarán más tipos de documento posteriormente.
          </div>
        </div>
      </div>
    `;
  },

  renderSummaryCards() {
    const t = this._totals || {};
    return `
      <div class="row g-2 mb-3 libro-balance-summary">
        <div class="col-md-3 col-6">
          <div class="card shadow-sm h-100"><div class="card-body py-2">
            <div class="small text-muted">Ingresos</div>
            <div class="fw-semibold libro-contable-money">${this.escapeHtml(LibroContableCommon.formatMoney(t.ingresos))}</div>
          </div></div>
        </div>
        <div class="col-md-3 col-6">
          <div class="card shadow-sm h-100"><div class="card-body py-2">
            <div class="small text-muted">Costos</div>
            <div class="fw-semibold libro-contable-money">${this.escapeHtml(LibroContableCommon.formatMoney(t.costos))}</div>
          </div></div>
        </div>
        <div class="col-md-3 col-6">
          <div class="card shadow-sm h-100"><div class="card-body py-2">
            <div class="small text-muted">Gastos</div>
            <div class="fw-semibold libro-contable-money">${this.escapeHtml(LibroContableCommon.formatMoney(t.gastos))}</div>
          </div></div>
        </div>
        <div class="col-md-3 col-6">
          <div class="card shadow-sm h-100 border-primary"><div class="card-body py-2">
            <div class="small text-muted">Utilidad del período</div>
            <div class="fw-bold libro-contable-money text-primary">${this.escapeHtml(LibroContableCommon.formatMoney(t.utilidad))}</div>
          </div></div>
        </div>
      </div>
    `;
  },

  rowClass(row) {
    if (row.TIPO === 'TITULO') return 'libro-balance-row-titulo';
    if (row.TIPO === 'GRUPO') return 'libro-balance-row-grupo';
    return '';
  },

  indentLevel(row) {
    if (row.TIPO === 'GRUPO') return 1;
    if (row.TIPO === 'CUENTA') return 2 + Math.max(0, Number(row.NIVEL || 1) - 1);
    return 0;
  },

  renderTableBodyHtml(rows) {
    if (!rows.length) {
      return `<tr><td colspan="5" class="text-center text-muted py-4">No hay saldos para este período</td></tr>`;
    }
    return rows
      .map((row) => {
        const cls = this.rowClass(row);
        const pad = this.indentLevel(row) * 12;
        const money = (v) =>
          v === null || v === undefined || v === ''
            ? ''
            : `<span class="libro-contable-money">${this.escapeHtml(LibroContableCommon.formatMoney(v))}</span>`;
        if (row.TIPO === 'TITULO') {
          return `<tr class="${cls}"><td colspan="5" class="fw-bold libro-balance-titulo">${this.escapeHtml(row.DESCRIPCION)}</td></tr>`;
        }
        if (row.TIPO === 'GRUPO') {
          return `<tr class="${cls}">
            <td style="padding-left:${pad}px" class="fw-semibold">${this.escapeHtml(row.ESTFIN || row.DESCRIPCION)}</td>
            <td colspan="3"></td>
            <td class="text-end fw-semibold">${money(row.SALDO)}</td>
          </tr>`;
        }
        return `<tr class="${cls}">
          <td style="padding-left:${pad}px">${this.escapeHtml(row.CODCUENTA || '')}</td>
          <td>${this.escapeHtml(row.DESCRIPCION || '—')}</td>
          <td class="text-end">${money(row.DEBE)}</td>
          <td class="text-end">${money(row.HABER)}</td>
          <td class="text-end fw-semibold">${money(row.SALDO)}</td>
        </tr>`;
      })
      .join('');
  },

  renderTableCard() {
    return `
      <div class="card libro-balance-table-card shadow-sm">
        <div class="table-responsive">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light sticky-top">
              <tr>
                <th>Cuenta / Grupo</th>
                <th>Descripción</th>
                <th class="text-end">Debe</th>
                <th class="text-end">Haber</th>
                <th class="text-end">Saldo</th>
              </tr>
            </thead>
            <tbody id="libro-balance-tbody">${this.renderTableBodyHtml(this._rows)}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  render() {
    return `
      <div class="libro-balance-wrap">
        ${this.renderFiltersCard()}
        <div id="libro-balance-warnings-wrap">${LibroContableCommon.renderWarningsHtml(this._warnings, (v) => this.escapeHtml(v))}</div>
        ${this.renderSummaryCards()}
        ${this.renderTableCard()}
      </div>
    `;
  },

  refreshDom() {
    const countEl = this._container?.querySelector('#libro-balance-count');
    if (countEl) countEl.textContent = this.badgeText();
    const warnWrap = this._container?.querySelector('#libro-balance-warnings-wrap');
    if (warnWrap) {
      warnWrap.innerHTML = LibroContableCommon.renderWarningsHtml(this._warnings, (v) => this.escapeHtml(v));
    }
    const summary = this._container?.querySelector('.libro-balance-summary');
    if (summary) summary.outerHTML = this.renderSummaryCards();
    const tbody = this._container?.querySelector('#libro-balance-tbody');
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
    const btn = this._container?.querySelector('#btn-libro-balance-export');
    try {
      const url = LibroContableCommon.buildExportUrl('/api/libro-balance', this._mes, this._anio);
      await LibroContableCommon.downloadExport(url, btn, `libro_balance_${this._mes}_${this._anio}.xlsx`);
    } finally {
      this._exporting = false;
    }
  },

  async imprimir() {
    await PrintReport.ensureLogo();
    const title = 'Balance General y Estado de Resultados';
    const t = this._totals || {};
    const subtitleHtml = `
      <p><strong>Período:</strong> ${PrintReport.escapeHtml(LibroContableCommon.mesLabel(this._mes))} ${PrintReport.escapeHtml(String(this._anio))}</p>
      <p class="meta">Ingresos: ${PrintReport.escapeHtml(LibroContableCommon.formatMoney(t.ingresos))} ·
        Costos: ${PrintReport.escapeHtml(LibroContableCommon.formatMoney(t.costos))} ·
        Gastos: ${PrintReport.escapeHtml(LibroContableCommon.formatMoney(t.gastos))} ·
        Utilidad: ${PrintReport.escapeHtml(LibroContableCommon.formatMoney(t.utilidad))}</p>
    `;
    const bodyRows = this._rows
      .map((row) => {
        if (row.TIPO === 'TITULO') {
          return `<tr class="section"><td colspan="5"><strong>${PrintReport.escapeHtml(row.DESCRIPCION)}</strong></td></tr>`;
        }
        if (row.TIPO === 'GRUPO') {
          return `<tr><td class="fw-semibold">${PrintReport.escapeHtml(row.ESTFIN || row.DESCRIPCION)}</td><td colspan="3"></td><td class="text-end">${PrintReport.escapeHtml(LibroContableCommon.formatMoney(row.SALDO))}</td></tr>`;
        }
        return `<tr>
          <td>${PrintReport.escapeHtml(row.CODCUENTA || '')}</td>
          <td>${PrintReport.escapeHtml(row.DESCRIPCION || '')}</td>
          <td class="text-end">${PrintReport.escapeHtml(LibroContableCommon.formatMoney(row.DEBE ?? 0))}</td>
          <td class="text-end">${PrintReport.escapeHtml(LibroContableCommon.formatMoney(row.HABER ?? 0))}</td>
          <td class="text-end">${PrintReport.escapeHtml(LibroContableCommon.formatMoney(row.SALDO ?? 0))}</td>
        </tr>`;
      })
      .join('');
    PrintReport.openAndPrint(
      PrintReport.wrapDocument({
        title,
        bodyHtml: `
          ${PrintReport.reportHeaderHtml({ title, subtitleHtml })}
          <table>
            <thead><tr>
              <th>Cuenta</th><th>Descripción</th>
              <th class="text-end">Debe</th><th class="text-end">Haber</th><th class="text-end">Saldo</th>
            </tr></thead>
            <tbody>${bodyRows || '<tr><td colspan="5">Sin registros</td></tr>'}</tbody>
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
