/**
 * Impresión carta del detalle de reportes (ítem seleccionado + rango de fechas).
 * HTML generado desde datos, no clonado del DOM.
 */
const ReportesDetallePrint = {
  esc(value) {
    return typeof PrintReport !== 'undefined' ? PrintReport.escapeHtml(value) : String(value ?? '');
  },

  extraStyles: `
    @page { size: letter; margin: 10mm 12mm; }
    .rdp-body { margin-top: 0.5rem; }
    .rdp-hero { border: 1px solid #c5c9d0; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; background: #fafbfc; }
    .rdp-hero-title { font-size: 15px; font-weight: 700; color: #111; margin: 0 0 2px; }
    .rdp-hero-sub { font-size: 11px; color: #555; margin: 0 0 8px; }
    .rdp-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 8px; }
    .rdp-kpi { border: 1px solid #e2e5ea; border-radius: 4px; padding: 5px 7px; background: #fff; }
    .rdp-kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em; color: #666; margin-bottom: 2px; }
    .rdp-kpi-value { font-size: 12px; font-weight: 650; color: #111; line-height: 1.2; }
    .rdp-section { margin-bottom: 14px; page-break-inside: avoid; }
    .rdp-section-title { font-size: 12px; font-weight: 700; margin: 0 0 6px; padding-bottom: 4px; border-bottom: 2px solid #198754; color: #145a32; }
    .rdp-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    .rdp-table th, .rdp-table td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
    .rdp-table th { background: #eef1f4; font-weight: 650; text-align: left; }
    .rdp-table .text-end { text-align: right; }
    .rdp-table tfoot td { background: #f3f4f6; font-weight: 650; }
    .rdp-empty { color: #666; font-size: 11px; padding: 6px 0; }
    @media print {
      .rdp-section { page-break-inside: auto; }
      .rdp-table thead { display: table-header-group; }
    }
  `,

  hero(title, subtitle, kpis) {
    const kpiHtml = (kpis || [])
      .map(
        (k) => `
        <div class="rdp-kpi">
          <div class="rdp-kpi-label">${this.esc(k.label)}</div>
          <div class="rdp-kpi-value">${this.esc(k.value)}</div>
        </div>`
      )
      .join('');
    return `
      <div class="rdp-hero">
        <div class="rdp-hero-title">${this.esc(title || '—')}</div>
        ${subtitle ? `<div class="rdp-hero-sub">${this.esc(subtitle)}</div>` : ''}
        <div class="rdp-kpis">${kpiHtml}</div>
      </div>`;
  },

  section(title, innerHtml) {
    if (!innerHtml) return '';
    return `
      <section class="rdp-section">
        <h2 class="rdp-section-title">${this.esc(title)}</h2>
        ${innerHtml}
      </section>`;
  },

  table(headers, rows, footRow) {
    if (!rows?.length) {
      return `<p class="rdp-empty">Sin registros en el período</p>`;
    }
    const head = headers.map((h) => `<th class="${h.align === 'end' ? 'text-end' : ''}">${this.esc(h.text)}</th>`).join('');
    const body = rows
      .map(
        (cells) =>
          `<tr>${cells
            .map((c, i) => {
              const align = headers[i]?.align === 'end' ? 'text-end' : '';
              const raw = c == null ? '' : String(c);
              const inner = headers[i]?.html ? raw : this.esc(raw);
              return `<td class="${align}">${inner}</td>`;
            })
            .join('')}</tr>`
      )
      .join('');
    const foot =
      footRow && footRow.length
        ? `<tfoot><tr>${footRow
            .map((c, i) => {
              const align = headers[i]?.align === 'end' ? 'text-end' : '';
              return `<td class="${align}">${this.esc(c)}</td>`;
            })
            .join('')}</tr></tfoot>`
        : '';
    return `<table class="rdp-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
  },

  async printLetterReport({ reportTitle, desde, hasta, formatFecha, buildBody }) {
    if (typeof PrintReport === 'undefined') {
      F.toast('Componente de impresión no disponible', 'error');
      return;
    }
    const body = typeof buildBody === 'function' ? buildBody() : '';
    if (!body) {
      F.toast('No hay detalle para imprimir', 'warning');
      return;
    }
    const fmt = formatFecha || ((v) => String(v || '—'));
    const subtitle = `Período: ${fmt(desde)} — ${fmt(hasta)}`;
    const html = PrintReport.wrapDocument({
      title: reportTitle,
      extraStyles: this.extraStyles,
      bodyHtml: `${PrintReport.reportHeaderHtml({
        title: reportTitle,
        subtitleHtml: this.esc(subtitle),
      })}<main class="rdp-body">${body}</main>`,
    });
    await PrintReport.openAndPrint(html, PrintReport.cartaFeatures());
  },
};