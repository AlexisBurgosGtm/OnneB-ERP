/**
 * Impresión profesional de documentos y recibos de pago (CARTA / TICKET).
 */
const DocPrint = {
  FORMATO_OPCION: 'FORMATO IMPRESION C O T',
  _formatoCache: null,

  escapeHtml(value) {
    return PrintReport.escapeHtml(value);
  },

  formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatFecha(value) {
    if (!value) return '—';
    if (typeof value === 'object') return DocFecha.formatDisplay(value);
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return DocFecha.formatDisplay(`${m[1]}-${m[2]}-${m[3]}`);
    return DocFecha.formatDisplay({ FECHA: s });
  },

  normalizeFormato(value) {
    return String(value || 'CARTA').trim().toUpperCase() === 'TICKET' ? 'TICKET' : 'CARTA';
  },

  async fetchFormatoImpresion(force = false) {
    if (!force && this._formatoCache) return this._formatoCache;
    try {
      const params = new URLSearchParams({
        opcion: this.FORMATO_OPCION,
        _: String(Date.now()),
      });
      const data = await F.fetchJson(`/api/config/formato-impresion?${params}`, { cache: 'no-store' });
      this._formatoCache = this.normalizeFormato(data.formato);
    } catch {
      this._formatoCache = 'CARTA';
    }
    return this._formatoCache;
  },

  isTicket(formato) {
    return this.normalizeFormato(formato) === 'TICKET';
  },

  layoutStyles(formato) {
    if (this.isTicket(formato)) {
      return `
        @page { margin: 4mm; size: 80mm auto; }
        body{font-family:Consolas,Monaco,monospace;padding:4mm 3mm;font-size:11px;color:#111;max-width:80mm;margin:0 auto}
        .doc-print-sheet{max-width:80mm}
        .report-header{margin-bottom:.5rem;border-bottom:1px dashed #999;padding-bottom:.4rem}
        .report-brand{flex-direction:column;align-items:center;text-align:center;gap:.25rem}
        .report-logo{max-height:42px;max-width:68px}
        .report-empresa-nombre{font-size:.85rem}
        .report-title{font-size:.8rem}
        .report-subtitle{font-size:10px}
        .doc-meta-grid{display:block}
        .doc-meta-item{margin-bottom:.15rem;font-size:10px}
        .doc-lines-table th,.doc-lines-table td{font-size:9px;padding:2px 3px}
        .doc-lines-table .col-desc{max-width:9rem;word-break:break-word}
        .doc-totals{font-size:10px}
        .doc-footer{margin-top:.5rem;font-size:9px;text-align:center;color:#555}
        table{width:100%;border-collapse:collapse;margin-top:.35rem}
        th,td{border:1px solid #ccc}
        th{background:#f3f3f3}
        .text-end{text-align:right}
      `;
    }
    return `
      @page { margin: 12mm; }
      body{font-family:Segoe UI,Helvetica,Arial,sans-serif;padding:0;font-size:12px;color:#1a1a1a;background:#fff}
      .doc-print-sheet{max-width:210mm;margin:0 auto}
      .report-header{margin-bottom:1rem;border-bottom:2px solid #1e3a5f;padding-bottom:.75rem}
      .report-brand{align-items:center}
      .report-logo{max-height:64px;max-width:150px}
      .report-empresa-nombre{font-size:1.15rem;color:#1e3a5f}
      .report-title{font-size:1rem;color:#333;margin-top:.15rem}
      .report-subtitle{font-size:11px;color:#555}
      .doc-meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.35rem .75rem;margin:.75rem 0 1rem;padding:.65rem .75rem;background:#f8fafc;border:1px solid #e2e8f0;border-radius:.35rem}
      .doc-meta-item{font-size:11px}
      .doc-meta-item strong{color:#334155}
      .doc-lines-table{margin-top:.5rem}
      .doc-lines-table th{background:#1e3a5f;color:#fff;border-color:#1e3a5f;font-weight:600;font-size:11px}
      .doc-lines-table td{border-color:#d1d5db;font-size:11px}
      .doc-lines-table tbody tr:nth-child(even){background:#f9fafb}
      .doc-totals{margin-top:.75rem;padding:.65rem .75rem;background:#f0f9ff;border:1px solid #bae6fd;border-radius:.35rem}
      .doc-totals-row{display:flex;justify-content:space-between;gap:1rem;font-size:12px;margin:.1rem 0}
      .doc-totals-row.grand{font-size:1rem;font-weight:700;color:#1e3a5f;margin-top:.35rem;padding-top:.35rem;border-top:1px solid #bae6fd}
      .doc-footer{margin-top:1.25rem;padding-top:.5rem;border-top:1px solid #e5e7eb;font-size:10px;color:#6b7280;text-align:center}
      table{width:100%;border-collapse:collapse}
      th,td{padding:5px 8px}
      .text-end{text-align:right}
    `;
  },

  metaItem(label, value) {
    if (value === null || value === undefined || value === '') return '';
    return `<div class="doc-meta-item"><strong>${this.escapeHtml(label)}:</strong> ${this.escapeHtml(value)}</div>`;
  },

  buildLinesTableHtml(lines, { ticket = false } = {}) {
    const rows = (lines || [])
      .map((ln) => {
        const desc = ticket
          ? `<span class="col-desc">${this.escapeHtml(ln.DESPROD || '')}</span>`
          : this.escapeHtml(ln.DESPROD || '');
        return `<tr>
          <td>${this.escapeHtml(ln.CODPROD)}</td>
          <td>${desc}</td>
          <td class="text-end">${this.escapeHtml(ln.CODMEDIDA || '')}</td>
          <td class="text-end">${Number(ln.CANTIDAD) || 0}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(ln.TOTALPRECIO))}</td>
        </tr>`;
      })
      .join('');
    return `
      <table class="doc-lines-table">
        <thead>
          <tr>
            <th>Cód.</th>
            <th>Descripción</th>
            <th class="text-end">Med.</th>
            <th class="text-end">Cant.</th>
            <th class="text-end">Total</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5" class="text-center text-muted">Sin líneas</td></tr>'}</tbody>
      </table>`;
  },

  buildDocumentHtml({ title, header, lines, extraMeta = [], footerNote = '' }, formato = 'CARTA') {
    const h = header || {};
    const ticket = this.isTicket(formato);
    const meta = [
      this.metaItem('Documento', `${h.CODDOC || ''} #${h.CORRELATIVO ?? ''}`),
      this.metaItem('Fecha', this.formatFecha(h.FECHA)),
      this.metaItem('Usuario', h.USUARIO),
      this.metaItem('Cliente', h.DOC_NOMCLIE),
      this.metaItem('NIT', h.DOC_NIT),
      this.metaItem('Dirección', h.DOC_DIRCLIE),
      ...extraMeta.map((m) => this.metaItem(m.label, m.value)).filter(Boolean),
    ]
      .filter(Boolean)
      .join('');

    const obs = h.OBS ? `<p class="doc-obs"><em>${this.escapeHtml(h.OBS)}</em></p>` : '';

    return `
      <div class="doc-print-sheet">
        ${PrintReport.reportHeaderHtml({
          title,
          subtitleHtml: ticket ? '' : `<p class="mb-0">${this.escapeHtml(title)}</p>`,
        })}
        <div class="doc-meta-grid">${meta}</div>
        ${obs}
        ${this.buildLinesTableHtml(lines, { ticket })}
        <div class="doc-totals">
          <div class="doc-totals-row grand">
            <span>Total</span>
            <span>${this.escapeHtml(this.formatMoney(h.TOTALPRECIO))}</span>
          </div>
        </div>
        ${footerNote ? `<div class="doc-footer">${footerNote}</div>` : '<div class="doc-footer">Documento generado por POS OnneB</div>'}
      </div>`;
  },

  buildReciboPagoHtml(data, formato = 'CARTA') {
    const ticket = this.isTicket(formato);
    const abono = data.abono || {};
    const factura = data.factura || {};
    const fpago = data.fpago || {};
    const cliente = data.cliente || '—';
    const facturaRef = `${abono.SERIEFAC || factura.CODDOC || ''} #${abono.NOFAC || factura.CORRELATIVO || ''}`.trim();

    const fpRows = [
      ['Efectivo', fpago.FPAGO_EFECTIVO],
      ['Tarjeta', fpago.FPAGO_TARJETA],
      ['Depósito', fpago.FPAGO_DEPOSITO],
      ['Cheque', fpago.FPAGO_CHEQUE],
    ]
      .filter(([, v]) => Number(v) > 0)
      .map(
        ([label, v]) =>
          `<div class="doc-totals-row"><span>${this.escapeHtml(label)}</span><span>${this.escapeHtml(this.formatMoney(v))}</span></div>`
      )
      .join('');

    const meta = [
      this.metaItem('Recibo', `${abono.CODDOC || ''} #${abono.CORRELATIVO ?? ''}`),
      this.metaItem('Fecha', this.formatFecha(data.fecha || new Date())),
      this.metaItem('Cliente', cliente),
      this.metaItem('Factura', facturaRef),
      this.metaItem('Usuario', data.usuario),
    ]
      .filter(Boolean)
      .join('');

    return `
      <div class="doc-print-sheet">
        ${PrintReport.reportHeaderHtml({
          title: 'Recibo de pago',
          subtitleHtml: ticket ? '' : '<p class="mb-0">Recibo de pago a cliente</p>',
        })}
        <div class="doc-meta-grid">${meta}</div>
        <div class="doc-totals">
          <div class="doc-totals-row grand">
            <span>Monto recibido</span>
            <span>${this.escapeHtml(this.formatMoney(abono.TOTALPRECIO || data.monto))}</span>
          </div>
          ${fpRows}
          <div class="doc-totals-row" style="margin-top:.5rem">
            <span>Saldo factura</span>
            <span>${this.escapeHtml(this.formatMoney(factura.DOC_SALDO))}</span>
          </div>
        </div>
        ${data.obs ? `<p class="doc-obs"><em>${this.escapeHtml(data.obs)}</em></p>` : ''}
        <div class="doc-footer">Recibo de pago — cuentas por cobrar</div>
      </div>`;
  },

  wrapHtml({ title, bodyHtml, formato }) {
    const extra = this.layoutStyles(formato);
    return PrintReport.wrapDocument({
      title,
      bodyHtml,
      extraStyles: extra,
    });
  },

  windowFeaturesFor(formato) {
    return this.isTicket(formato) ? 'width=360,height=720' : 'width=900,height=700';
  },

  async printDocument({ title, header, lines, extraMeta, footerNote, formato }) {
    const fmt = formato || (await this.fetchFormatoImpresion());
    await PrintReport.openAndPrint(
      () =>
        this.wrapHtml({
          title,
          bodyHtml: this.buildDocumentHtml({ title, header, lines, extraMeta, footerNote }, fmt),
          formato: fmt,
        }),
      this.windowFeaturesFor(fmt)
    );
  },

  async printReciboPagoCliente(data, formato) {
    const fmt = formato || (await this.fetchFormatoImpresion());
    await PrintReport.openAndPrint(
      () =>
        this.wrapHtml({
          title: 'Recibo de pago',
          bodyHtml: this.buildReciboPagoHtml(data, fmt),
          formato: fmt,
        }),
      this.windowFeaturesFor(fmt)
    );
  },
};

if (typeof F !== 'undefined') {
  F.DocPrint = DocPrint;
}
