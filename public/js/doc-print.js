/**
 * Impresión profesional de documentos y recibos de pago (CARTA / TICKET).
 * Usa plantillas por EMPNIT + TIPODOC cuando existen; si no, formato built-in.
 */
const DocPrint = {
  /** Ticket SAT / representación gráfica (mismo set que servidor). */
  FEL_TICKET_TIPODOCS: ['FEF', 'FEC', 'FES', 'FPC', 'FNC'],

  FORMATO_OPCION: 'FORMATO IMPRESION C O T',
  PESO_OPCION: 'MUESTRA PESO EN DOCUMENTOS',
  MARCAS_OPCION: 'MUESTRA MARCAS EN DOCUMENTOS',
  _formatoCache: null,
  _muestraPesoCache: null,
  _muestraMarcasCache: null,

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

  isFelTicketTipodoc(tipodoc) {
    return this.FEL_TICKET_TIPODOCS.includes(String(tipodoc || '').trim().toUpperCase());
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

  async fetchMuestraPeso(force = false) {
    if (!force && this._muestraPesoCache != null) return this._muestraPesoCache;
    try {
      const params = new URLSearchParams({
        opcion: this.PESO_OPCION,
        _: String(Date.now()),
      });
      const data = await F.fetchJson(`/api/config/sino?${params}`, { cache: 'no-store' });
      this._muestraPesoCache = String(data?.sino ?? data?.valor ?? 'NO').trim().toUpperCase() === 'SI';
    } catch {
      this._muestraPesoCache = false;
    }
    return this._muestraPesoCache;
  },

  async fetchMuestraMarcas(force = false) {
    if (!force && this._muestraMarcasCache != null) return this._muestraMarcasCache;
    try {
      const params = new URLSearchParams({
        opcion: this.MARCAS_OPCION,
        _: String(Date.now()),
      });
      const data = await F.fetchJson(`/api/config/sino?${params}`, { cache: 'no-store' });
      this._muestraMarcasCache = String(data?.sino ?? data?.valor ?? 'NO').trim().toUpperCase() === 'SI';
    } catch {
      this._muestraMarcasCache = false;
    }
    return this._muestraMarcasCache;
  },

  lineDescHtml(ln, { ticket = false, muestraMarcas = false } = {}) {
    const des = this.escapeHtml(ln.DESPROD || '');
    const marca = String(ln.DESMARCA || '').trim();
    const marcaBlock =
      muestraMarcas && marca
        ? `<div class="doc-line-marca"><strong>${this.escapeHtml(marca)}</strong></div>`
        : '';
    if (ticket) {
      return `<span class="col-desc">${des}${marcaBlock}</span>`;
    }
    return `${des}${marcaBlock}`;
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

  docObsCardHtml(obsText, ticket = false) {
    const text = String(obsText ?? '').trim();
    if (!text) return '';
    const body = this.escapeHtml(text);
    if (ticket) {
      return `<div class="fel-obs fel-obs-card fel-obs-doc fel-c"><div class="fel-obs-title">Observaciones</div><div class="fel-obs-body">${body}</div></div>`;
    }
    return `<div class="doc-obs-card doc-obs-doc"><div class="doc-obs-label">Observaciones</div><p class="doc-obs-body">${body}</p></div>`;
  },

  docObsCardStyles() {
    return `
      .doc-obs-card.doc-obs-doc{margin:.45rem 0;padding:.35rem .55rem;background:#fff;border:1px solid #d1d5db;border-radius:.3rem;box-shadow:none}
      .doc-obs-card.doc-obs-doc .doc-obs-label{font-size:9px;font-weight:700;color:#111;margin:0 0 .12rem;text-transform:uppercase;letter-spacing:.03em}
      .doc-obs-card.doc-obs-doc .doc-obs-body{font-size:10px;color:#111;margin:0;line-height:1.32;white-space:pre-line}
      .fel-obs-card.fel-obs-doc{margin:5px 0;padding:4px 6px;background:#fff;border:1px dashed #999;border-radius:2px}
      .fel-obs-card.fel-obs-doc .fel-obs-title{font-size:8px;font-weight:700;margin-bottom:1px;text-transform:uppercase;color:#111}
      .fel-obs-card.fel-obs-doc .fel-obs-body{font-size:8.5px;font-weight:400;line-height:1.28;white-space:pre-line;text-transform:none;color:#111}
    `;
  },

  layoutStyles(formato) {
    if (this.isTicket(formato)) {
      return `
        @page { size: 80mm auto; margin: 2mm; }
        html{width:100%;margin:0;padding:0;box-sizing:border-box}
        body{
          font-family:Consolas,Monaco,monospace;
          font-size:11px;color:#111;position:relative;
          width:100%!important;max-width:none!important;
          margin:0!important;padding:2mm 2.5mm!important;
          box-sizing:border-box;
        }
        .doc-print-sheet,.fel-ticket{
          width:100%!important;max-width:none!important;margin:0!important;
          box-sizing:border-box;
        }
        .report-header{margin-bottom:.5rem;border-bottom:1px dashed #999;padding-bottom:.4rem}
        .report-brand{flex-direction:column;align-items:center;text-align:center;gap:.25rem}
        .report-logo{max-height:42px;max-width:68px}
        .report-empresa-nombre{font-size:.85rem}
        .report-title{font-size:.8rem}
        .report-subtitle{font-size:10px}
        .doc-meta-grid{display:block}
        .doc-meta-item{margin-bottom:.15rem;font-size:10px}
        .doc-lines-table th,.doc-lines-table td{font-size:9px;padding:2px 3px}
        .doc-line-peso{display:block;font-size:8px;color:#666;margin-top:1px}
        .doc-lines-table .col-desc{max-width:none;word-break:break-word}
        .doc-totals{font-size:10px}
        .doc-footer{margin-top:.5rem;font-size:9px;text-align:center;color:#555}
        .fel-ticket.fac-ticket-doc .fel-logo{max-height:104px;max-width:140px;object-fit:contain;margin:0 auto 4px;display:block}
        .fel-sep{border:0;border-top:1px dashed #666;margin:6px 0}
        .fel-c{text-align:center}.fel-l{text-align:left}.fel-r{text-align:right}
        .fel-nombre{font-size:13px;font-weight:700;text-transform:uppercase;margin:2px 0}
        .fel-muted{font-size:9.5px;margin:1px 0;word-break:break-word}
        .fel-dte-tipo{font-size:11px;font-weight:700;margin:0 0 6px;text-transform:uppercase}
        .fel-meta{font-size:10.5px;margin:2px 0}
        .fel-detalle-title{font-size:11px;font-weight:700;margin:8px 0 4px;letter-spacing:.04em}
        .fel-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 6px}
        .fel-table th{font-size:9px;font-weight:700;padding:2px 1px;border-bottom:1px solid #333}
        .fel-table td{font-size:9.5px;padding:3px 1px;vertical-align:top;word-break:break-word}
        .fel-totals-row{display:flex;justify-content:flex-end;gap:10px;font-size:10.5px;margin:2px 0}
        .fel-totals-row.grand{font-size:12px;font-weight:700}
        .fel-totals-row.grand.fel-totals-row-letras{justify-content:space-between;width:100%;align-items:flex-start;gap:8px;flex-wrap:nowrap}
        .fel-totals-row.grand .fel-totals-letras-text{flex:1;min-width:0;text-align:left;font-size:9px;font-weight:400!important;line-height:1.35;color:#444;text-transform:none;padding-right:6px;margin-right:2px;border-right:1px dashed #bbb}
        .fel-totals-grand-right{flex-shrink:0;display:flex;justify-content:space-between;gap:8px;min-width:38%;font-size:inherit;font-weight:inherit}
        .doc-tipodoc-obs{margin:.35rem 0;font-size:9.5px;line-height:1.32;white-space:pre-line}
        ${this.docObsCardStyles()}
        table{width:100%;border-collapse:collapse;margin-top:.35rem}
        th,td{border:1px solid #ccc}
        th{background:#f3f3f3}
        .text-end{text-align:right}
        @media print{
          html,body{width:100%!important;max-width:80mm!important;margin:0 auto!important;padding:0!important}
          body{padding:1mm 1.5mm!important;font-size:11px!important}
          img{max-width:100%!important;height:auto!important}
        }
        .doc-prioridad-badge{display:none!important;visibility:hidden!important}
        @media screen{
          html,body{width:100%!important;max-width:none!important;margin:0!important;box-sizing:border-box}
          body{padding:1.25rem 1.75rem!important;font-size:15px!important;line-height:1.35!important}
          .doc-print-sheet,.fel-ticket{width:100%!important;max-width:none!important;margin:0!important}
          .report-logo{max-height:72px!important;max-width:140px!important}
          .report-empresa-nombre{font-size:1.35rem!important}
          .report-title{font-size:1.1rem!important}
          .report-subtitle,.doc-meta-item{font-size:14px!important}
          .doc-lines-table th,.doc-lines-table td{font-size:13px!important;padding:6px 8px!important}
          .doc-totals,.doc-totals-row{font-size:14px!important}
          .doc-totals-row.grand{font-size:1.15rem!important}
          .doc-footer{font-size:12px!important}
        }
      `;
    }
    return `
      @page { margin: 12mm; }
      body{font-family:Segoe UI,Helvetica,Arial,sans-serif;padding:0;font-size:12px;color:#1a1a1a;background:#fff;position:relative}
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
      .doc-line-marca{font-size:10px;line-height:1.25;margin-top:2px}
      .doc-lines-table tbody tr:nth-child(even){background:#f9fafb}
      .doc-totals{margin-top:.75rem;padding:.65rem .75rem;background:#f0f9ff;border:1px solid #bae6fd;border-radius:.35rem}
      .doc-totals-row{display:flex;justify-content:space-between;gap:1rem;font-size:12px;margin:.1rem 0}
      .doc-totals-row.grand{font-size:1rem;font-weight:700;color:#1e3a5f;margin-top:.35rem;padding-top:.35rem;border-top:1px solid #bae6fd}
      .doc-totals-row-letras{align-items:flex-start;flex-wrap:nowrap;gap:1rem}
      .doc-totals-row.grand .doc-totals-letras-text{flex:1;min-width:0;text-align:left;font-size:10px;font-weight:400!important;line-height:1.4;color:#64748b;text-transform:none;padding-right:.85rem;margin-right:.1rem;border-right:1px solid #cbd5e1}
      .doc-totals-grand-right{flex-shrink:0;display:flex;justify-content:space-between;gap:1rem;min-width:8.5rem;font-size:inherit;font-weight:inherit;color:inherit}
      .doc-tipodoc-obs{margin:.65rem 0 0;padding-top:.45rem;border-top:1px solid #e5e7eb;font-size:10px;color:#6b7280;text-align:center}
      .doc-tipodoc-obs-body{margin:0;white-space:pre-line;line-height:1.35}
      ${this.docObsCardStyles()}
      .doc-footer{margin-top:1.25rem;padding-top:.5rem;border-top:1px solid #e5e7eb;font-size:10px;color:#6b7280;text-align:center}
      table{width:100%;border-collapse:collapse}
      th,td{padding:5px 8px}
      .text-end{text-align:right}
      ${this.prioridadBadgeCss()}
    `;
  },

  metaItem(label, value) {
    if (value === null || value === undefined || value === '') return '';
    return `<div class="doc-meta-item"><strong>${this.escapeHtml(label)}:</strong> ${this.escapeHtml(value)}</div>`;
  },

  tipodocShowsTotalLetras(tipodoc) {
    return ['FAC', 'FPC', 'FEF', 'FEC', 'FES'].includes(String(tipodoc || '').trim().toUpperCase());
  },

  amountInWords(value) {
    const fn =
      (typeof AmountInWordsGt !== 'undefined' && AmountInWordsGt.amount) ||
      (typeof F !== 'undefined' && F.AmountInWordsGt?.amount);
    return fn ? fn(value) : '';
  },

  documentObsText(header) {
    const h = header || {};
    return String(h.OBS ?? h.obs ?? '').trim();
  },

  tipodocObsFooterHtml(text, ticket = false) {
    const t = String(text ?? '').trim();
    if (!t) return '';
    const body = this.escapeHtml(t);
    if (ticket) {
      return `<div class="fel-muted fel-c doc-tipodoc-obs">${body}</div>`;
    }
    return `<div class="doc-tipodoc-obs"><p class="doc-tipodoc-obs-body">${body}</p></div>`;
  },

  computeSubtotalDescuento(header, lines) {
    const h = header || {};
    const total = Number(h.TOTALPRECIO) || 0;
    const descuento = Number(h.TOTALDESCUENTO) || 0;
    const sumLineas = (lines || []).reduce((s, ln) => s + (Number(ln.TOTALPRECIO) || 0), 0);
    const subtotal = sumLineas > 0 ? sumLineas : Math.max(0, total + descuento);
    return { subtotal, descuento, total };
  },

  buildGrandTotalHtml(header, { ticket = false, tipodoc = '' } = {}) {
    const h = header || {};
    const totalFmt = this.escapeHtml(this.formatMoney(h.TOTALPRECIO));
    const letras = this.tipodocShowsTotalLetras(tipodoc)
      ? this.escapeHtml(this.amountInWords(h.TOTALPRECIO))
      : '';
    if (ticket && letras) {
      return `<div class="fel-totals-row grand fel-totals-row-letras">
        <span class="fel-totals-letras-text">${letras}</span>
        <div class="fel-totals-grand-right">
          <span>TOTAL</span>
          <span>${totalFmt}</span>
        </div>
      </div>`;
    }
    if (!ticket && letras) {
      return `<div class="doc-totals-row grand doc-totals-row-letras">
        <span class="doc-totals-letras-text">${letras}</span>
        <div class="doc-totals-grand-right">
          <span>Total</span>
          <span>${totalFmt}</span>
        </div>
      </div>`;
    }
    if (ticket) {
      return `<div class="fel-totals-row grand"><span>TOTAL</span><span>${totalFmt}</span></div>`;
    }
    return `<div class="doc-totals-row grand"><span>Total</span><span>${totalFmt}</span></div>`;
  },

  buildFacTicketHtml({ title, header, lines, footerNote = '', muestraMarcas = false }) {
    const h = header || {};
    const tot = this.computeSubtotalDescuento(h, lines);
    const obs = this.docObsCardHtml(this.documentObsText(h), true);
    const tipodocObs = this.tipodocObsFooterHtml(h.TIPODOC_OBS, true);
    const docLabel = `${h.CODDOC || ''} #${h.CORRELATIVO ?? ''}`.trim();
    const serie = String(h.FEL_SERIE || h.SERIEFAC || '').trim();
    const numero = String(h.FEL_NUMERO ?? h.NOFAC ?? '').trim();
    const concre = String(h.CONCRE || 'CON').trim().toUpperCase() === 'CRE' ? 'Crédito' : 'Contado';
    const logo = typeof PrintReport !== 'undefined' ? PrintReport.logoBlockHtml('fel-logo') : '';
    const nombre =
      typeof PrintReport !== 'undefined' ? this.escapeHtml(PrintReport.getEmpresaNombre()) : '—';
    const dirEntrega = (() => {
      const dir = String(h.DIRENTREGA || '').trim();
      if (!dir || dir.toUpperCase() === 'SN') return '';
      return dir;
    })();
    const telClie = String(h.DOC_TELEFONO ?? h.TELEFONOCLIENTE ?? '').trim();
    const lineRows = (lines || [])
      .map(
        (ln) => `<tr>
        <td class="fel-l">${Number(ln.CANTIDAD) || 0}</td>
        <td class="fel-l">${this.lineDescHtml(ln, { ticket: true, muestraMarcas })}</td>
        <td class="fel-r">${this.escapeHtml(this.formatMoney(ln.TOTALPRECIO))}</td>
      </tr>`
      )
      .join('');
    const grand = this.buildGrandTotalHtml(h, { ticket: true, tipodoc: 'FAC' });
    return `<div class="doc-print-sheet fel-ticket fac-ticket-doc">
      <div class="fel-c">
        ${logo}
        <div class="fel-nombre">${nombre}</div>
      </div>
      <hr class="fel-sep">
      <div class="fel-c">
        <div class="fel-dte-tipo">${this.escapeHtml(title)}</div>
        <div class="fel-meta"><strong>Doc.:</strong> ${this.escapeHtml(docLabel)}</div>
      </div>
      <div class="fel-l">
        ${serie ? `<div class="fel-meta"><strong>Serie:</strong> ${this.escapeHtml(serie)}</div>` : ''}
        ${numero ? `<div class="fel-meta"><strong>No.:</strong> ${this.escapeHtml(numero)}</div>` : ''}
        <div class="fel-meta"><strong>Fecha:</strong> ${this.escapeHtml(this.formatFecha(h.FECHA))}</div>
        <div class="fel-meta"><strong>Cliente:</strong> ${this.escapeHtml(h.DOC_NOMCLIE || '')}</div>
        <div class="fel-meta"><strong>NIT:</strong> ${this.escapeHtml(h.DOC_NIT || '')}</div>
        ${
          telClie
            ? `<div class="fel-meta"><strong>Tel. cliente:</strong> ${this.escapeHtml(telClie)}</div>`
            : ''
        }
        ${
          h.F_ENTREGA
            ? `<div class="fel-meta"><strong>Entrega:</strong> ${this.escapeHtml(h.F_ENTREGA)}</div>`
            : ''
        }
        ${
          dirEntrega
            ? `<div class="fel-meta"><strong>Dir. entrega:</strong> ${this.escapeHtml(dirEntrega)}</div>`
            : ''
        }
        ${
          h.VENDEDOR || h.NOMEMPLEADO
            ? `<div class="fel-meta"><strong>Vendedor:</strong> ${this.escapeHtml(h.VENDEDOR || h.NOMEMPLEADO)}</div>`
            : ''
        }
        <div class="fel-meta"><strong>Pago:</strong> ${this.escapeHtml(concre)}</div>
      </div>
      <div class="fel-c fel-detalle-title">DETALLE</div>
      <table class="fel-table">
        <thead><tr>
          <th class="col-cant fel-l">Cant.</th>
          <th class="col-desc fel-l">Descripción</th>
          <th class="col-tot fel-r">Total</th>
        </tr></thead>
        <tbody>${lineRows || '<tr><td colspan="3" class="fel-c">Sin líneas</td></tr>'}</tbody>
      </table>
      <hr class="fel-sep fel-sep-totals">
      <div class="fel-totals">
        <div class="fel-totals-row"><span>Subtotal</span><span>${this.escapeHtml(this.formatMoney(tot.subtotal))}</span></div>
        <div class="fel-totals-row"><span>Descuento</span><span>${this.escapeHtml(this.formatMoney(tot.descuento))}</span></div>
        ${grand}
      </div>
      ${obs}
      ${tipodocObs}
      <div class="fel-muted fel-c">${this.escapeHtml(footerNote || 'Documento generado por POS OnneB')}</div>
    </div>`;
  },

  buildInternalDocumentHtml(opts, formato = 'CARTA') {
    const h = opts.header || {};
    const tipodoc = String(h.TIPODOC || '').trim().toUpperCase();
    if (this.isTicket(formato) && tipodoc === 'FAC') {
      return this.buildFacTicketHtml(opts);
    }
    return this.buildDocumentHtml(opts, formato);
  },

  buildLinesTableHtml(lines, { ticket = false, includePrecio = false, muestraPeso = false, muestraMarcas = false } = {}) {
    const rows = (lines || [])
      .map((ln) => {
        const desc = this.lineDescHtml(ln, { ticket, muestraMarcas });
        const precioCell = includePrecio
          ? `<td class="text-end">${this.escapeHtml(this.formatMoney(ln.PRECIO))}</td>`
          : '';
        const tp = this.lineTotalPeso(ln);
        const pesoSuffix =
          muestraPeso && tp > 0
            ? `<span class="doc-line-peso">${this.escapeHtml(this.formatPeso(tp))}</span>`
            : '';
        return `<tr>
          <td>${this.escapeHtml(ln.CODPROD)}</td>
          <td>${desc}</td>
          <td class="text-end">${this.escapeHtml(ln.CODMEDIDA || '')}</td>
          <td class="text-end">${Number(ln.CANTIDAD) || 0}</td>
          ${precioCell}
          <td class="text-end">${this.escapeHtml(this.formatMoney(ln.TOTALPRECIO))}${pesoSuffix}</td>
        </tr>`;
      })
      .join('');
    const colCount = includePrecio ? 6 : 5;
    const precioHead = includePrecio ? '<th class="text-end">Precio</th>' : '';
    return `
      <table class="doc-lines-table">
        <thead>
          <tr>
            <th>Cód.</th>
            <th>Descripción</th>
            <th class="text-end">Med.</th>
            <th class="text-end">Cant.</th>
            ${precioHead}
            <th class="text-end">Total</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="${colCount}" class="text-center text-muted">Sin líneas</td></tr>`}</tbody>
      </table>`;
  },

  buildDocumentHtml({ title, header, lines, extraMeta = [], footerNote = '', muestraPeso = false, muestraMarcas = false }, formato = 'CARTA') {
    const h = header || {};
    const ticket = this.isTicket(formato);
    const tipodoc = String(h.TIPODOC || '').trim().toUpperCase();
    const esCompra = tipodoc === 'COM' || tipodoc === 'COP';
    const serie = esCompra
      ? String(h.SERIEFAC || '').trim()
      : String(h.FEL_SERIE || '').trim();
    const numero = esCompra
      ? String(h.NOFAC || '').trim()
      : String(h.FEL_NUMERO || '').trim();
    const meta = [
      this.metaItem('Documento', `${h.CODDOC || ''} #${h.CORRELATIVO ?? ''}`),
      this.metaItem('Fecha', this.formatFecha(h.FECHA)),
      this.metaItem('Serie', serie),
      this.metaItem('Número', numero),
      this.metaItem('Usuario', h.USUARIO),
      this.metaItem('Cliente', h.DOC_NOMCLIE),
      this.metaItem('NIT', h.DOC_NIT),
      this.metaItem('Dirección', h.DOC_DIRCLIE),
      this.metaItem('Tipo entrega', h.F_ENTREGA),
      this.metaItem(
        'Dirección de entrega',
        (() => {
          const dir = String(h.DIRENTREGA || '').trim();
          if (!dir || dir.toUpperCase() === 'SN') return '';
          return dir;
        })()
      ),
      this.metaItem('Vendedor', h.VENDEDOR || h.NOMEMPLEADO),
      this.metaItem('Tel. vendedor', h.VENDEDOR_TELEFONO || h.TELEFONOS),
      ...extraMeta.map((m) => this.metaItem(m.label, m.value)).filter(Boolean),
    ]
      .filter(Boolean)
      .join('');

    const obs = this.docObsCardHtml(this.documentObsText(h), ticket);
    const tipodocObs = this.tipodocObsFooterHtml(h.TIPODOC_OBS, ticket);
    const totalPeso = (lines || []).reduce((s, ln) => s + this.lineTotalPeso(ln), 0);
    const pesoTotalHtml =
      muestraPeso && totalPeso > 0
        ? `<div class="doc-totals-row"><span>Peso total</span><span>${this.escapeHtml(this.formatPeso(totalPeso))}</span></div>`
        : '';
    const anulado = this.isAnulado(h) ? this.anuladoStampHtml() : '';
    const prioridadBadge = ticket ? '' : this.prioridadBadgeHtml(h.PRIORIDAD);

    return `
      <div class="doc-print-sheet">
        ${anulado}
        ${prioridadBadge}
        ${PrintReport.reportHeaderHtml({
          title,
          subtitleHtml: ticket ? '' : `<p class="mb-0">${this.escapeHtml(title)}</p>`,
        })}
        <div class="doc-meta-grid">${meta}</div>
        ${obs}
        ${this.buildLinesTableHtml(lines, { ticket, includePrecio: true, muestraPeso, muestraMarcas })}
        <div class="doc-totals">
          ${pesoTotalHtml}
          ${this.buildGrandTotalHtml(h, { ticket, tipodoc })}
        </div>
        ${tipodocObs}
        ${footerNote ? `<div class="doc-footer">${footerNote}</div>` : '<div class="doc-footer">Documento generado por POS OnneB</div>'}
      </div>`;
  },

  buildReciboPagoHtml(data, formato = 'CARTA') {
    const ticket = this.isTicket(formato);
    const abono = data.abono || {};
    const factura = data.factura || {};
    const fpago = data.fpago || {};
    const cliente = data.cliente || '—';
    const facturas = Array.isArray(data.facturas) ? data.facturas.filter(Boolean) : null;
    const multi = Boolean(facturas?.length);
    const facturaRef = multi
      ? `${facturas.length} factura(s)`
      : `${abono.SERIEFAC || factura.CODDOC || ''} #${abono.NOFAC || factura.CORRELATIVO || ''}`.trim();

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
      this.metaItem(multi ? 'Facturas' : 'Factura', facturaRef),
      this.metaItem('Usuario', data.usuario),
      this.metaItem('NIT', data.nit),
      fpago.FPAGO_DESCRIPCION ? this.metaItem('Detalle pago', fpago.FPAGO_DESCRIPCION) : '',
    ]
      .filter(Boolean)
      .join('');

    let detalleHtml = '';
    if (multi) {
      const rows = facturas
        .map(
          (f) => `<tr>
            <td class="text-nowrap">${this.escapeHtml(f.CODDOC || f.CODDOC_FAC || '')} #${this.escapeHtml(f.CORRELATIVO ?? f.CORRELATIVO_FAC ?? '')}</td>
            <td class="text-end">${this.escapeHtml(this.formatMoney(f.ABONO ?? f.TOTALPRECIO))}</td>
            <td class="text-end">${this.escapeHtml(this.formatMoney(f.DOC_SALDO ?? f.FAC_DOC_SALDO))}</td>
          </tr>`
        )
        .join('');
      detalleHtml = `
        <table class="doc-lines-table" style="margin-top:.5rem">
          <thead>
            <tr>
              <th>Factura</th>
              <th class="text-end">Abono</th>
              <th class="text-end">Saldo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    } else {
      detalleHtml = `
        <div class="doc-totals-row" style="margin-top:.5rem">
          <span>Saldo factura</span>
          <span>${this.escapeHtml(this.formatMoney(factura.DOC_SALDO))}</span>
        </div>`;
    }

    return `
      <div class="doc-print-sheet">
        ${this.isAnulado(abono) || this.isAnulado(factura) ? this.anuladoStampHtml() : ''}
        ${PrintReport.reportHeaderHtml({
          title: 'Recibo de pago',
          subtitleHtml: ticket
            ? ''
            : `<p class="mb-0">${multi ? 'Recibo de caja CXC' : 'Recibo de pago a cliente'}</p>`,
        })}
        <div class="doc-meta-grid">${meta}</div>
        ${multi ? detalleHtml : ''}
        <div class="doc-totals">
          <div class="doc-totals-row grand">
            <span>Monto recibido</span>
            <span>${this.escapeHtml(this.formatMoney(abono.TOTALPRECIO || data.monto))}</span>
          </div>
          ${fpRows}
          ${multi ? '' : detalleHtml}
        </div>
        ${data.obs ? `<p class="doc-obs"><em>${this.escapeHtml(data.obs)}</em></p>` : ''}
        <div class="doc-footer">${multi ? 'Recibo de caja CXC — cuentas por cobrar' : 'Recibo de pago — cuentas por cobrar'}</div>
      </div>`;
  },

  wrapHtml({ title, bodyHtml, formato, extraCss = '' }) {
    const extra = `${this.layoutStyles(formato)}\n${extraCss || ''}`;
    return PrintReport.wrapDocument({
      title,
      bodyHtml,
      extraStyles: extra,
    });
  },

  windowFeaturesFor(formato) {
    if (typeof PrintReport !== 'undefined') {
      if (this.isTicket(formato) && PrintReport.ticketFeatures) return PrintReport.ticketFeatures();
      if (PrintReport.cartaFeatures) return PrintReport.cartaFeatures();
    }
    const w = Math.max(640, Math.min(920, (Number(window.screen?.availWidth) || 1200) - 120));
    const h = Math.max(520, Math.min(860, (Number(window.screen?.availHeight) || 800) - 100));
    return `left=48,top=40,width=${w},height=${h},scrollbars=yes,resizable=yes`;
  },

  printOptionsFor(formato) {
    return this.isTicket(formato) ? { ticket: true, papel: 'TICKET' } : { ticket: false };
  },

  isAnulado(header) {
    return String(header?.STATUS || '').trim().toUpperCase() === 'A';
  },

  anuladoStampHtml() {
    return `<div class="doc-anulado-stamp" aria-label="Anulado">ANULADO</div>`;
  },

  prioridadBadgeHtml(prioridad) {
    const p = String(prioridad || '').trim().toUpperCase();
    if (p !== 'BAJA' && p !== 'MEDIA' && p !== 'ALTA') return '';
    const cls = p === 'ALTA' ? 'alta' : p === 'MEDIA' ? 'media' : 'baja';
    return `<div class="doc-prioridad-badge doc-prioridad-badge--${cls}" aria-label="Prioridad ${this.escapeHtml(p)}">${this.escapeHtml(p)}</div>`;
  },

  prioridadBadgeCss() {
    return `
      .doc-prioridad-badge{
        position:fixed;top:8px;right:12px;z-index:60;
        padding:5px 12px;font-size:11px;font-weight:800;letter-spacing:.08em;
        text-transform:uppercase;border-radius:4px;line-height:1.2;
        box-shadow:0 1px 3px rgba(0,0,0,.12);
        -webkit-print-color-adjust:exact;print-color-adjust:exact
      }
      .doc-prioridad-badge--baja{background:#86efac;color:#14532d}
      .doc-prioridad-badge--media{background:#facc15;color:#713f12}
      .doc-prioridad-badge--alta{background:#ef4444;color:#fff}
      @media print{
        .doc-prioridad-badge{position:absolute;top:4px;right:6px}
      }
    `;
  },

  /**
   * Intenta imprimir con plantilla de BD (EMPNIT + CODDOC + CORRELATIVO → TIPODOC).
   * @returns {Promise<boolean>} true si se imprimió con plantilla
   */
  async tryPrintWithTemplate({ coddoc, correlativo, title, formato, logoUrl }) {
    const emp = F.getEmpNit();
    if (!emp || !coddoc || correlativo == null || correlativo === '') return false;
    const papel = this.normalizeFormato(formato);
    const params = new URLSearchParams({ empnit: emp });
    const data = await F.fetchJson(`/api/formatos-impresion/render?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coddoc: String(coddoc),
        correlativo: Number(correlativo),
        papel,
        title: title || undefined,
        logoUrl: logoUrl || undefined,
      }),
    });
    if (!data?.html) return false;
    await PrintReport.openAndPrint(data.html, this.windowFeaturesFor(papel), this.printOptionsFor(papel));
    return true;
  },

  async printDocument({ title, header, lines, extraMeta, footerNote, formato }) {
    const fmt = formato || (await this.fetchFormatoImpresion());
    const muestraPeso = await this.fetchMuestraPeso();
    const muestraMarcas = await this.fetchMuestraMarcas();
    const h = header || {};
    const coddoc = h.CODDOC;
    const correlativo = h.CORRELATIVO;

    if (coddoc != null && correlativo != null && correlativo !== '') {
      try {
        await PrintReport.ensureLogo();
        const used = await this.tryPrintWithTemplate({
          coddoc,
          correlativo,
          title,
          formato: fmt,
          logoUrl: PrintReport.getLogoDataUrl(),
        });
        if (used) return;
      } catch (err) {
        console.warn('[DocPrint] plantilla:', err.message || err);
      }
    }

    const tipodoc = String(h.TIPODOC || '').trim().toUpperCase();
    if (this.isTicket(fmt) && tipodoc !== 'FAC' && !this.isFelTicketTipodoc(tipodoc)) {
      throw new Error(
        'No se pudo renderizar el ticket. En Formatos de impresión, revise la plantilla TICKET del tipo de documento o pulse «Cargar default del sistema».'
      );
    }

    await PrintReport.openAndPrint(
      () =>
        this.wrapHtml({
          title,
          bodyHtml: this.buildInternalDocumentHtml(
            { title, header, lines, extraMeta, footerNote, muestraPeso, muestraMarcas },
            fmt
          ),
          formato: fmt,
        }),
      this.windowFeaturesFor(fmt),
      this.printOptionsFor(fmt)
    );
  },

  /**
   * Imprime por llave de documento (carga datos y plantilla en el servidor).
   */
  async printByKey({ coddoc, correlativo, title, formato }) {
    const fmt = formato || (await this.fetchFormatoImpresion());
    await PrintReport.ensureLogo();
    const used = await this.tryPrintWithTemplate({
      coddoc,
      correlativo,
      title,
      formato: fmt,
      logoUrl: PrintReport.getLogoDataUrl(),
    });
    if (used) return;
    throw new Error('No se pudo renderizar el documento');
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
      this.windowFeaturesFor(fmt),
      this.printOptionsFor(fmt)
    );
  },
};

if (typeof F !== 'undefined') {
  F.DocPrint = DocPrint;
}
