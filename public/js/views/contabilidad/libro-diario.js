/**
 * Vista Libro Diario — partidas contables generadas desde formatos por documento.
 */
const LIBRO_DIARIO_MESES = [
  { value: 1, label: 'ENERO' },
  { value: 2, label: 'FEBRERO' },
  { value: 3, label: 'MARZO' },
  { value: 4, label: 'ABRIL' },
  { value: 5, label: 'MAYO' },
  { value: 6, label: 'JUNIO' },
  { value: 7, label: 'JULIO' },
  { value: 8, label: 'AGOSTO' },
  { value: 9, label: 'SEPTIEMBRE' },
  { value: 10, label: 'OCTUBRE' },
  { value: 11, label: 'NOVIEMBRE' },
  { value: 12, label: 'DICIEMBRE' },
];

const LIBRO_DIARIO_ANIOS = [];
for (let y = 2020; y <= new Date().getFullYear() + 1; y += 1) {
  LIBRO_DIARIO_ANIOS.push({ value: y, label: String(y) });
}

function libroDiarioFormatDate(value) {
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
}

const LibroDiarioView = {
  _container: null,
  _rows: [],
  _warnings: [],
  _totals: null,
  _mes: null,
  _anio: null,
  _loading: false,
  _exporting: false,

  tableColumns: [
    { key: 'LINEA', label: 'No.', align: 'center' },
    { key: 'FECHA', label: 'Fecha', type: 'date' },
    { key: 'DOC_REF', label: 'Documento' },
    { key: 'TIPODOC', label: 'Tipo' },
    { key: 'TIPOPAGO', label: 'Pago' },
    { key: 'CODFORMATO', label: 'Formato' },
    { key: 'CODCUENTA', label: 'Cuenta' },
    { key: 'DESCRIPCION_CUENTA', label: 'Descripción cuenta', cellClass: 'libro-diario-col-desc' },
    { key: 'DEBE', label: 'Debe', type: 'money' },
    { key: 'HABER', label: 'Haber', type: 'money' },
    { key: 'CENTRO_COSTO', label: 'C. costo', align: 'center' },
  ],

  defaultPeriod() {
    const now = new Date();
    return { mes: now.getMonth() + 1, anio: now.getFullYear() };
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  mesLabel(mes) {
    return LIBRO_DIARIO_MESES.find((m) => m.value === Number(mes))?.label || String(mes);
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  fechaDisplay(row) {
    const fel = String(row?.FECHA ?? '').trim();
    if (fel) return libroDiarioFormatDate(fel);
    return '—';
  },

  formatCell(row, col) {
    const key = col.key;
    if (key === 'FECHA') return this.escapeHtml(this.fechaDisplay(row));
    const value = row[key];
    if (value === null || value === undefined || value === '') return '—';
    if (col.type === 'money') {
      const cls = Number(value) < 0 ? ' libro-diario-money-neg' : '';
      return `<span class="libro-diario-money${cls}">${this.escapeHtml(this.formatMoney(value))}</span>`;
    }
    return this.escapeHtml(value);
  },

  rowClass(row) {
    const classes = [];
    if (row.ANULADO) classes.push('libro-diario-row-anulado');
    else if (row.ES_NOTA_CREDITO) classes.push('libro-diario-row-nc');
    return classes.join(' ');
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
    return `/api/libro-diario?${params.toString()}`;
  },

  badgeText() {
    const t = this._totals || {};
    const parts = [
      `${t.lineas ?? 0} partida(s)`,
      `${t.documentos ?? 0} documento(s)`,
      `${this.mesLabel(this._mes)} ${this._anio}`,
      `Debe: ${this.formatMoney(t.debe ?? 0)}`,
      `Haber: ${this.formatMoney(t.haber ?? 0)}`,
    ];
    if ((t.anulados ?? 0) > 0) parts.push(`Anulados: ${t.anulados}`);
    if ((t.sinFormato ?? 0) > 0) parts.push(`Sin formato: ${t.sinFormato}`);
    if ((t.sinPartidas ?? 0) > 0) parts.push(`Sin partidas: ${t.sinPartidas}`);
    return parts.join(' · ');
  },

  renderWarningsHtml() {
    if (!this._warnings.length) return '';
    const items = this._warnings
      .slice(0, 8)
      .map((w) => `<li>${this.escapeHtml(w.message)}</li>`)
      .join('');
    const more =
      this._warnings.length > 8
        ? `<li class="text-muted">… y ${this._warnings.length - 8} más</li>`
        : '';
    return `
      <div class="alert alert-warning py-2 px-3 mb-3 small libro-diario-warnings" role="alert">
        <strong><i class="fa-solid fa-triangle-exclamation me-1"></i>Advertencias</strong>
        <ul class="mb-0 mt-1 ps-3">${items}${more}</ul>
      </div>
    `;
  },

  renderFiltersCard() {
    const mesOpts = LIBRO_DIARIO_MESES.map(
      (m) =>
        `<option value="${m.value}"${Number(this._mes) === m.value ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const anioOpts = LIBRO_DIARIO_ANIOS.map(
      (a) =>
        `<option value="${a.value}"${Number(this._anio) === a.value ? ' selected' : ''}>${a.label}</option>`
    ).join('');

    return `
      <div class="card libro-diario-filters-card shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-end gap-2 libro-diario-filters-row">
            <div class="libro-diario-filter-mes">
              <label for="libro-diario-mes" class="form-label small mb-1">Mes</label>
              <select class="form-select form-select-sm" id="libro-diario-mes">
                ${mesOpts}
              </select>
            </div>
            <div class="libro-diario-filter-anio">
              <label for="libro-diario-anio" class="form-label small mb-1">Año</label>
              <select class="form-select form-select-sm" id="libro-diario-anio">
                ${anioOpts}
              </select>
            </div>
            <div class="libro-diario-actions d-flex gap-2">
              <button type="button" class="btn btn-sm btn-outline-primary" id="btn-libro-diario-recargar">
                <i class="fa-solid fa-rotate me-1"></i>Actualizar
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-libro-diario-imprimir">
                <i class="fa-solid fa-print me-1"></i>Imprimir
              </button>
              <button type="button" class="btn btn-sm btn-outline-success" id="btn-libro-diario-export">
                <i class="fa-solid fa-file-excel me-1"></i>Exportar (xlsx)
              </button>
            </div>
          </div>
          <div class="libro-diario-badge small text-muted mt-2" id="libro-diario-count">${this.escapeHtml(this.badgeText())}</div>
          <div class="small text-muted mt-1">
            Documentos con <strong>CONTABLE = SI</strong>. El formato aplicado depende de
            <strong>contado</strong> (<code>CODFORMATOCON</code>) o <strong>crédito</strong> (<code>CODFORMATOCRE</code>)
            según <code>CONCRE</code> del documento. Montos: TOTAL, SUBTOTAL, IVA, COSTO.
          </div>
        </div>
      </div>
    `;
  },

  renderTableBodyHtml(rows) {
    if (!rows.length) {
      return `<tr><td colspan="${this.tableColumns.length}" class="text-center text-muted py-4">No hay partidas para este período</td></tr>`;
    }
    return rows
      .map((row) => {
        const cls = this.rowClass(row);
        const cells = this.tableColumns
          .map((col) => {
            const align =
              col.align === 'center' ? ' text-center' : col.type === 'money' ? ' text-end' : '';
            const extra = col.cellClass ? ` ${col.cellClass}` : '';
            return `<td class="${`${align}${extra}`.trim()}">${this.formatCell(row, col)}</td>`;
          })
          .join('');
        return `<tr class="${cls}">${cells}</tr>`;
      })
      .join('');
  },

  renderTableFooterHtml() {
    const t = this._totals;
    if (!t || !this._rows.length) return '';
    return `
      <tfoot>
        <tr>
          <td colspan="8" class="text-end">Totales (sin anulados):</td>
          <td class="text-end libro-diario-money">${this.escapeHtml(this.formatMoney(t.debe))}</td>
          <td class="text-end libro-diario-money">${this.escapeHtml(this.formatMoney(t.haber))}</td>
          <td></td>
        </tr>
      </tfoot>
    `;
  },

  renderTableCard() {
    const headers = this.tableColumns
      .map((c) => {
        const align =
          c.align === 'center' ? ' text-center' : c.type === 'money' ? ' text-end' : '';
        const extra = c.cellClass ? ` ${c.cellClass}` : '';
        return `<th scope="col" class="${`${align}${extra}`.trim()}">${this.escapeHtml(c.label)}</th>`;
      })
      .join('');
    return `
      <div class="card libro-diario-table-card shadow-sm">
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped mb-0">
            <thead class="table-light sticky-top">
              <tr>${headers}</tr>
            </thead>
            <tbody id="libro-diario-tbody">${this.renderTableBodyHtml(this._rows)}</tbody>
            ${this.renderTableFooterHtml()}
          </table>
        </div>
      </div>
    `;
  },

  render() {
    return `
      <div class="libro-diario-wrap">
        ${this.renderFiltersCard()}
        <div id="libro-diario-warnings-wrap">${this.renderWarningsHtml()}</div>
        ${this.renderTableCard()}
      </div>
    `;
  },

  refreshDom() {
    const countEl = this._container?.querySelector('#libro-diario-count');
    if (countEl) countEl.textContent = this.badgeText();
    const warnWrap = this._container?.querySelector('#libro-diario-warnings-wrap');
    if (warnWrap) warnWrap.innerHTML = this.renderWarningsHtml();
    const tbody = this._container?.querySelector('#libro-diario-tbody');
    if (tbody) tbody.innerHTML = this.renderTableBodyHtml(this._rows);
    const table = this._container?.querySelector('.libro-diario-table-card table');
    if (table) {
      table.querySelector('tfoot')?.remove();
      const footer = this.renderTableFooterHtml();
      if (footer) table.insertAdjacentHTML('beforeend', footer);
    }
  },

  bindEvents() {
    this._container?.querySelector('#libro-diario-mes')?.addEventListener('change', (e) => {
      this._mes = Number(e.target.value);
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#libro-diario-anio')?.addEventListener('change', (e) => {
      this._anio = Number(e.target.value);
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-libro-diario-recargar')?.addEventListener('click', () => {
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-libro-diario-imprimir')?.addEventListener('click', () => {
      this.imprimir().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-libro-diario-export')?.addEventListener('click', () => {
      this.exportExcel().catch((err) => F.toast(err.message, 'error'));
    });
  },

  async exportExcel() {
    if (this._exporting) return;
    this._exporting = true;
    const btn = this._container?.querySelector('#btn-libro-diario-export');
    try {
      const url = LibroContableCommon.buildExportUrl('/api/libro-diario', this._mes, this._anio);
      await LibroContableCommon.downloadExport(url, btn, `libro_diario_${this._mes}_${this._anio}.xlsx`);
    } finally {
      this._exporting = false;
    }
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

  async imprimir() {
    await PrintReport.ensureLogo();
    const title = 'Libro Diario';
    const subtitleHtml = `
      <p><strong>Período:</strong> ${PrintReport.escapeHtml(this.mesLabel(this._mes))} ${PrintReport.escapeHtml(String(this._anio))}</p>
      <p class="meta">Partidas generadas desde formatos contables por tipo de documento</p>
    `;
    const headCells = this.tableColumns.map((c) => `<th>${PrintReport.escapeHtml(c.label)}</th>`).join('');
    const bodyRows = this._rows
      .map((row) => {
        const cells = this.tableColumns
          .map((col) => {
            const align = col.type === 'money' ? ' class="text-end"' : '';
            let val;
            if (col.key === 'FECHA') val = this.fechaDisplay(row);
            else if (col.type === 'money') val = this.formatMoney(row[col.key]);
            else val = row[col.key] ?? '—';
            return `<td${align}>${PrintReport.escapeHtml(val)}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    const t = this._totals || {};
    const footerRow = this._rows.length
      ? `<tr class="totals">
          <td colspan="8" class="text-end">Totales (sin anulados)</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(t.debe))}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(t.haber))}</td>
          <td></td>
        </tr>`
      : '';
    const bodyHtml = `
      ${PrintReport.reportHeaderHtml({ title, subtitleHtml })}
      <table>
        <thead><tr>${headCells}</tr></thead>
        <tbody>${bodyRows || `<tr><td colspan="${this.tableColumns.length}">Sin registros</td></tr>`}</tbody>
        ${footerRow ? `<tfoot>${footerRow}</tfoot>` : ''}
      </table>
    `;
    PrintReport.openAndPrint(
      PrintReport.wrapDocument({
        title,
        bodyHtml,
      })
    );
  },

  async load(container) {
    this._container = container;
    const period = this.defaultPeriod();
    this._mes = period.mes;
    this._anio = period.anio;
    this._rows = [];
    this._warnings = [];
    this._totals = null;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start');
    container.innerHTML = this.render();
    this.bindEvents();
    await this.reload();
  },
};
