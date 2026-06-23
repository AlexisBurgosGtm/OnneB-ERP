/**
 * Acciones comunes sobre documentos (imprimir, editar, eliminar) desde la vista Documentos.
 */
const DocOpciones = {
  FEL_TIPOS_CERTIFICABLES: ['FEF', 'FEC', 'FNC'],
  FEL_URL_OPCION: 'URL FEL',

  EDITOR_BY_TIPODOC: {
    ENV: { menu: 'pedidos-mostrador', view: () => PosView },
    COT: { menu: 'cotizaciones', view: () => CotizacionesView },
    FAC: { menu: 'facturacion', view: () => FacturacionView },
    FEF: { menu: 'facturacion', view: () => FacturacionView },
    FEC: { menu: 'facturacion', view: () => FacturacionView },
    FES: { menu: 'facturacion', view: () => FacturacionView },
    DEV: { menu: 'notas-credito', view: () => NotasCreditoView },
    FNC: { menu: 'notas-credito', view: () => NotasCreditoView },
    COM: { menu: 'compras', view: () => ComprasView },
    ENT: { menu: 'entradas-inventario', view: () => EntradasInventarioView },
    SAL: { menu: 'salidas-inventario', view: () => SalidasInventarioView },
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).slice(0, 10);
    const [y, m, d] = s.split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
    return s;
  },

  felUudiValue(row) {
    return String(row?.FEL_UUDI ?? row?.FEL ?? '').trim();
  },

  estaCertificadoFel(row) {
    return Boolean(this.felUudiValue(row));
  },

  puedeEditar(row) {
    if (!row) return false;
    if (this.estaCertificadoFel(row)) return false;
    const statusOk = DocFecha.editableStatus(row.STATUS);
    const corte = String(row.CORTE || 'NO').trim().toUpperCase();
    if (corte === 'SI') return false;
    const tipodoc = String(row.TIPODOC || '').trim().toUpperCase();
    return statusOk && Boolean(this.EDITOR_BY_TIPODOC[tipodoc]);
  },

  puedeCambiarFecha(row) {
    if (!row) return false;
    if (this.estaCertificadoFel(row)) return false;
    return DocFecha.editableStatus(row.STATUS);
  },

  puedeCambiarCaja(row) {
    if (!row) return false;
    if (this.estaCertificadoFel(row)) return false;
    if (!DocFecha.editableStatus(row.STATUS)) return false;
    const corte = String(row.CORTE || 'NO').trim().toUpperCase();
    return corte !== 'SI';
  },

  puedeCertificarFel(row) {
    if (!row || this.estaCertificadoFel(row)) return false;
    const tipodoc = String(row.TIPODOC || '').trim().toUpperCase();
    if (!this.FEL_TIPOS_CERTIFICABLES.includes(tipodoc)) return false;
    return DocFecha.editableStatus(row.STATUS);
  },

  puedeVerFelOnline(row) {
    return this.estaCertificadoFel(row);
  },

  puedeEliminar(row) {
    return this.puedeEditar(row);
  },

  fechaInputFromRow(row) {
    return DocFecha.inputValueFromHeader(row);
  },

  patchFechaUrl(coddoc, correlativo) {
    return `/api/documentos/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/fecha?empnit=${encodeURIComponent(F.getEmpNit())}`;
  },

  patchCajaUrl(coddoc, correlativo) {
    return `/api/documentos/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/caja?empnit=${encodeURIComponent(F.getEmpNit())}`;
  },

  async cambiarFecha(coddoc, correlativo, fechaIso) {
    await F.fetchJson(this.patchFechaUrl(coddoc, correlativo), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ FECHA: fechaIso }),
    });
    F.toast('Fecha del documento actualizada', 'success');
    return true;
  },

  async fetchCajas() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/cajas?${params}`);
    return data.rows || [];
  },

  async cambiarCaja(coddoc, correlativo, codcaja) {
    await F.fetchJson(this.patchCajaUrl(coddoc, correlativo), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CODCAJA: codcaja }),
    });
    F.toast('Caja del documento actualizada', 'success');
    return true;
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
    return String(data.pass ?? '').trim();
  },

  async certificar(coddoc, correlativo) {
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
    return data;
  },

  buildWhatsappDetalleText(doc, row) {
    const h = doc.header || {};
    const lines = doc.lines || [];
    const titulo = String(row?.DESDOC || h.DESDOC || h.TIPODOC || 'Documento').trim();
    const parts = [];
    parts.push(`*${titulo}*`);
    parts.push(`${h.CODDOC} #${h.CORRELATIVO}`);
    parts.push(`Fecha: ${this.formatFecha(h.FECHA)}`);
    if (h.DOC_NOMCLIE) parts.push(`Cliente: ${h.DOC_NOMCLIE}`);
    if (h.DOC_NIT) parts.push(`NIT: ${h.DOC_NIT}`);
    if (h.FEL_SERIE || h.FEL_NUMERO) {
      parts.push(`FEL: ${[h.FEL_SERIE, h.FEL_NUMERO].filter(Boolean).join(' ')}`);
    }
    parts.push('');
    lines.forEach((ln) => {
      const cant = Number(ln.CANTIDAD) || 0;
      const total = this.formatMoney(ln.TOTALPRECIO);
      parts.push(`• ${ln.CODPROD} ${ln.DESPROD} — ${cant} ${ln.CODMEDIDA || ''} — ${total}`);
    });
    parts.push('');
    parts.push(`*Total: ${this.formatMoney(h.TOTALPRECIO)}*`);
    return parts.join('\n');
  },

  async solicitarTelefonoWhatsapp() {
    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Enviar por WhatsApp',
      html: `
        <form class="catalogo-form text-start" autocomplete="off" novalidate onsubmit="return false">
          <p class="small text-muted mb-2">Ingrese el número del destinatario (8 dígitos, Guatemala +502).</p>
          <label for="doc-opciones-wa-telefono" class="form-label small mb-0">Teléfono</label>
          <div class="input-group input-group-sm">
            <span class="input-group-text">+502</span>
            <input type="tel" class="form-control" id="doc-opciones-wa-telefono"
              inputmode="numeric" maxlength="8" pattern="[0-9]{8}"
              placeholder="12345678" autocomplete="off">
          </div>
        </form>
      `,
      width: 400,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Enviar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        document.getElementById('doc-opciones-wa-telefono')?.focus();
      },
      preConfirm: () => {
        const raw = String(document.getElementById('doc-opciones-wa-telefono')?.value ?? '').replace(/\D/g, '');
        if (raw.length !== 8) {
          Swal.showValidationMessage('Ingrese exactamente 8 dígitos');
          return false;
        }
        return raw;
      },
    });
    return result.isConfirmed ? result.value : null;
  },

  async enviarWhatsapp(coddoc, correlativo, row) {
    const telefono = await this.solicitarTelefonoWhatsapp();
    if (!telefono) return false;
    const doc = await this.fetchDetalle(coddoc, correlativo);
    const text = this.buildWhatsappDetalleText(doc, row);
    const url = `https://wa.me/502${telefono}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  },

  detalleUrl(coddoc, correlativo) {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      _: String(Date.now()),
    });
    return `/api/documentos/detalle/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}?${params}`;
  },

  deleteUrl(coddoc, correlativo) {
    return `/api/documentos/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}?empnit=${encodeURIComponent(F.getEmpNit())}`;
  },

  async fetchDetalle(coddoc, correlativo) {
    return F.fetchJson(this.detalleUrl(coddoc, correlativo));
  },

  async imprimir(coddoc, correlativo, row) {
    const doc = await this.fetchDetalle(coddoc, correlativo);
    const h = doc.header || {};
    const lines = doc.lines || [];
    const tipodoc = String(h.TIPODOC || row?.TIPODOC || '').trim().toUpperCase();
    const titulo = String(row?.DESDOC || h.DESDOC || tipodoc || 'Documento').trim();

    const rows = lines
      .map(
        (ln) => `<tr>
          <td>${this.escapeHtml(ln.CODPROD)}</td>
          <td>${this.escapeHtml(ln.DESPROD)}</td>
          <td>${this.escapeHtml(ln.CODMEDIDA)}</td>
          <td class="text-end">${Number(ln.CANTIDAD) || 0}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(ln.TOTALPRECIO))}</td>
        </tr>`
      )
      .join('');

    const html = PrintReport.wrapDocument({
      title: titulo,
      bodyHtml: `
        ${PrintReport.reportHeaderHtml({
          title: titulo,
          subtitleHtml: `
            <p><strong>${this.escapeHtml(h.CODDOC)} #${this.escapeHtml(h.CORRELATIVO)}</strong>
              · ${this.escapeHtml(this.formatFecha(h.FECHA))}
              · ${PrintReport.escapeHtml(h.USUARIO || '')}</p>
            <p><strong>Cliente:</strong> ${PrintReport.escapeHtml(h.DOC_NOMCLIE || '—')}</p>
            ${h.OBS ? `<p><em>${PrintReport.escapeHtml(h.OBS)}</em></p>` : ''}
          `,
        })}
        <table>
          <thead>
            <tr><th>Cód.</th><th>Producto</th><th>Medida</th><th class="text-end">Cant.</th><th class="text-end">Total</th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="5">Sin líneas</td></tr>'}</tbody>
        </table>
        <p class="text-end"><strong>Total: ${PrintReport.escapeHtml(this.formatMoney(h.TOTALPRECIO))}</strong></p>
      `,
    });
    PrintReport.openAndPrint(html, 'width=800,height=600');
  },

  async eliminar(coddoc, correlativo, label) {
    const pass = await CatalogosUI.confirmEliminarDocumento({
      label,
      tipo: 'documento',
    });
    if (!pass) return false;
    await F.fetchJson(this.deleteUrl(coddoc, correlativo), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass: String(pass) }),
    });
    F.toast('Documento eliminado', 'success');
    return true;
  },

  activateMenuLink(menuKey) {
    document.querySelectorAll('.sidebar-link').forEach((l) => l.classList.remove('is-active'));
    const link = document.querySelector(`.sidebar-link[data-menu="${menuKey}"]`);
    link?.classList.add('is-active');
    const mainTitle = document.getElementById('main-title');
    if (mainTitle && link) {
      const label = link.textContent.replace(/\s+/g, ' ').trim();
      if (label) mainTitle.textContent = label;
    }
  },

  async abrirEditor(tipodoc, coddoc, correlativo) {
    const t = String(tipodoc || '').trim().toUpperCase();
    const cfg = this.EDITOR_BY_TIPODOC[t];
    if (!cfg) {
      F.toast('No hay editor disponible para este tipo de documento', 'warning');
      return false;
    }
    const view = cfg.view?.();
    if (!view || typeof view.load !== 'function' || typeof view.showEditor !== 'function') {
      F.toast('Vista de edición no disponible', 'warning');
      return false;
    }

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return false;

    this.activateMenuLink(cfg.menu);
    mainContent.className = 'main-content flex-grow-1 d-flex p-2 p-md-3';
    await view.load(mainContent);
    await view.showEditor(coddoc, correlativo);
    return true;
  },
};

if (typeof F !== 'undefined') {
  F.DocOpciones = DocOpciones;
}
