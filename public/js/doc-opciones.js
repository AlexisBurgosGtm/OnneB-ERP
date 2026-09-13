/**
 * Acciones comunes sobre documentos (imprimir, editar, eliminar) desde la vista Documentos.
 */
const DocOpciones = {
  /** Prefijo telefónico WhatsApp (GT OnneB / SV FS-SV). */
  WHATSAPP_DIAL_CODE: '502',

  FEL_TIPOS_CERTIFICABLES: ['FEF', 'FEC', 'FNC'],
  FEL_URL_OPCION: 'URL FEL',
  CERTIFICA_AL_FINALIZAR_OPCION: 'CERTIFICA AL FINALIZAR',
  FACTURA_SE_PASA_A_FRACCIONAMIENTO_AUTOM_OPCION: 'FACTURA SE PASA A FRACCIONAMIENTO AUTOM',
  PERMITE_FRACCIONAMIENTO_FACTURAS_OPCION: 'PERMITE FRACCIONAMIENTO FACTURAS',
  MUESTRA_FORMATO_FEL_ONLINE_OPCION: 'MUESTRA FORMATO FEL ONLINE',
  IMPRIME_TICKET_AL_GUARDAR_VENTA_OPCION: 'IMPRIME TICKET AL GUARDAR VENTA',

  EDITOR_BY_TIPODOC: {
    ENV: { menu: 'pedidos-mostrador', view: () => PosView },
    CRS: { menu: 'comandas-restaurante', view: () => ComandasRestauranteView },
    COT: { menu: 'cotizaciones', view: () => CotizacionesView },
    FAC: { menu: 'facturacion', view: () => FacturacionView },
    FEF: { menu: 'facturacion', view: () => FacturacionView },
    FEC: { menu: 'facturacion', view: () => FacturacionView },
    FES: { menu: 'facturacion', view: () => FacturacionView },
    DEV: { menu: 'notas-credito', view: () => NotasCreditoView },
    FNC: { menu: 'notas-credito', view: () => NotasCreditoView },
    FNA: { menu: 'notas-abono', view: () => NotasAbonoView },
    DVP: { menu: 'notas-debito', view: () => NotasDebitoView },
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
    if (typeof value === 'object') return DocFecha.formatDisplay(value);
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return DocFecha.formatDisplay(`${m[1]}-${m[2]}-${m[3]}`);
    return DocFecha.formatDisplay({ FECHA: s });
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

  /** Solo operado (no anulado). Permite corte y FEL: solo cambia CODDOC/correlativo interno. */
  puedeCambiarSerieInterna(row) {
    if (!row) return false;
    return DocFecha.editableStatus(row.STATUS);
  },

  /** Solo O ↔ I (anular es proceso aparte). */
  puedeCambiarStatus(row) {
    if (!row) return false;
    const status = String(row.STATUS || '').trim().toUpperCase();
    return status === 'O' || status === 'I';
  },

  patchStatusUrl(coddoc, correlativo) {
    return `/api/documentos/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/status?empnit=${encodeURIComponent(F.getEmpNit())}`;
  },

  async cambiarStatus(coddoc, correlativo, status) {
    const next = String(status || '').trim().toUpperCase();
    if (next !== 'O' && next !== 'I') {
      throw new Error('STATUS inválido (solo O o I)');
    }
    await F.fetchJson(this.patchStatusUrl(coddoc, correlativo), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ STATUS: next }),
    });
    F.toast(`Status actualizado a ${next}`, 'success');
    return true;
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

  /**
   * Muestra Eliminar en Archivo → Documentos para todo documento no FEL y no anulado.
   * El servidor aplica corte de caja, documentos relacionados y política de eliminación.
   */
  puedeEliminar(row) {
    if (!row) return false;
    if (this.estaCertificadoFel(row)) return false;
    const status = String(row.STATUS || '').trim().toUpperCase();
    return status !== 'A';
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

  seriesAlternasUrl(coddoc, correlativo) {
    return (
      `/api/documentos/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/series-alternas` +
      `?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`
    );
  },

  cambiarSerieUrl(coddoc, correlativo) {
    return (
      `/api/documentos/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/cambiar-serie` +
      `?empnit=${encodeURIComponent(F.getEmpNit())}`
    );
  },

  async fetchSeriesAlternas(coddoc, correlativo) {
    return F.fetchJson(this.seriesAlternasUrl(coddoc, correlativo));
  },

  async cambiarSerieInterna(coddoc, correlativo, nuevoCoddoc) {
    const data = await F.fetchJson(this.cambiarSerieUrl(coddoc, correlativo), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CODDOC: nuevoCoddoc }),
    });
    const dest = data?.DESTINO || {};
    F.toast(
      `Serie cambiada a ${dest.CODDOC || nuevoCoddoc} · ${dest.CORRELATIVO ?? ''}`,
      'success'
    );
    return data;
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

  async fetchCertificaAlFinalizar() {
    const params = new URLSearchParams({
      opcion: this.CERTIFICA_AL_FINALIZAR_OPCION,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/config/sino?${params}`, { cache: 'no-store' });
    return String(data.sino ?? 'NO').trim().toUpperCase() === 'SI';
  },

  async fetchPermiteFraccionamientoFacturas() {
    const params = new URLSearchParams({
      opcion: this.PERMITE_FRACCIONAMIENTO_FACTURAS_OPCION,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/config/sino?${params}`, { cache: 'no-store' });
    return String(data.sino ?? 'SI').trim().toUpperCase() === 'SI';
  },

  async fetchFacturaSePasaAFraccionamientoAutom() {
    const params = new URLSearchParams({
      opcion: this.FACTURA_SE_PASA_A_FRACCIONAMIENTO_AUTOM_OPCION,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/config/sino?${params}`, { cache: 'no-store' });
    return String(data.sino ?? 'NO').trim().toUpperCase() === 'SI';
  },

  async fetchMuestraFormatoFelOnline() {
    const params = new URLSearchParams({
      opcion: this.MUESTRA_FORMATO_FEL_ONLINE_OPCION,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/config/muestra-formato-fel?${params}`, { cache: 'no-store' });
    const modo = String(data.modo ?? 'NO').trim().toUpperCase();
    if (modo === 'SI' || modo === 'AMBOS') return modo;
    return 'NO';
  },

  async fetchImprimeTicketAlGuardarVenta() {
    const params = new URLSearchParams({
      opcion: this.IMPRIME_TICKET_AL_GUARDAR_VENTA_OPCION,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/config/sino?${params}`, { cache: 'no-store' });
    return String(data.sino ?? 'NO').trim().toUpperCase() === 'SI';
  },

  /**
   * Tras finalizar FAC / facturación / DEV / FNA (no FEL):
   * si IMPRIME TICKET AL GUARDAR VENTA = SI → muestra formato imprimible del sistema.
   * Documentos FEL (FEF/FEC/FES/FNC): no aplica; solo «Muestra formato FEL online» al certificar.
   * @param {{ tipodoc?: string, alreadyPrintedSistema?: boolean, onImprimir?: () => Promise<void>|void }} opts
   */
  async maybeImprimirTicketTrasFinalizar(opts = {}) {
    if (opts.alreadyPrintedSistema) return false;
    const tipodoc = String(opts.tipodoc || '').trim().toUpperCase();
    if (tipodoc && (this.esTipoCertificableFel(tipodoc) || tipodoc === 'FES')) {
      return false;
    }
    let imprime = false;
    try {
      imprime = await this.fetchImprimeTicketAlGuardarVenta();
    } catch (_) {
      return false;
    }
    if (!imprime || typeof opts.onImprimir !== 'function') return false;
    await opts.onImprimir();
    return true;
  },

  esTipoCertificableFel(tipodoc) {
    return this.FEL_TIPOS_CERTIFICABLES.includes(String(tipodoc || '').trim().toUpperCase());
  },

  async abrirFelOnline(felValue) {
    const fel = String(felValue ?? '').trim();
    if (!fel) {
      F.toast('No hay UUID FEL para abrir el documento online', 'warning');
      return false;
    }
    let baseUrl = '';
    try {
      baseUrl = await this.fetchUrlFel();
    } catch (err) {
      F.toast(err.message || 'No se pudo leer la URL FEL', 'error');
      return false;
    }
    if (!baseUrl) {
      F.toast('Configure la URL FEL en Config general', 'warning');
      return false;
    }
    const url = this.joinFelUrl(baseUrl, fel);
    if (!url) {
      F.toast('No se pudo construir la URL del documento FEL', 'warning');
      return false;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  },

  /**
   * Tras certificar: muestra formato según MUESTRA FORMATO FEL ONLINE.
   * @param {{ felUuid?: string, onImprimirSistema?: () => Promise<void>|void }} opts
   */
  async mostrarFormatosTrasCertificar(opts = {}) {
    const modo = await this.fetchMuestraFormatoFelOnline().catch(() => 'NO');
    const felUuid = String(opts.felUuid ?? '').trim();
    const showOnline = modo === 'SI' || modo === 'AMBOS';
    const showSistema = modo === 'NO' || modo === 'AMBOS';

    if (showOnline) {
      await this.abrirFelOnline(felUuid);
    }
    if (showSistema && typeof opts.onImprimirSistema === 'function') {
      await opts.onImprimirSistema();
    }
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

  /**
   * Certifica sin confirmación y aplica la visualización de formatos configurada.
   * @param {string} coddoc
   * @param {number|string} correlativo
   * @param {{ onImprimirSistema?: () => Promise<void>|void, silentError?: boolean }} [opts]
   */
  async certificarYMostrarFormatos(coddoc, correlativo, opts = {}) {
    const data = await this.certificar(coddoc, correlativo);
    const fel = data.fel || {};
    const felUuid = String(fel.uuid || fel.UUID || data.FEL_UUDI || '').trim();
    await this.mostrarFormatosTrasCertificar({
      felUuid,
      onImprimirSistema: opts.onImprimirSistema,
    });
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

  async solicitarTelefonoWhatsapp(opts = {}) {
    const dial = String(opts.dialCode || this.WHATSAPP_DIAL_CODE || '502').replace(/\D/g, '') || '502';
    const prefill = String(opts.prefill || '').replace(/\D/g, '').slice(-8);
    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Enviar por WhatsApp',
      html: `
        <form class="catalogo-form text-start" autocomplete="off" novalidate onsubmit="return false">
          <p class="small text-muted mb-2">Ingrese el número del destinatario (8 dígitos, +${this.escapeHtml(dial)}).</p>
          <label for="doc-opciones-wa-telefono" class="form-label small mb-0">Teléfono</label>
          <div class="input-group input-group-sm">
            <span class="input-group-text">+${this.escapeHtml(dial)}</span>
            <input type="tel" class="form-control" id="doc-opciones-wa-telefono"
              inputmode="numeric" maxlength="8" pattern="[0-9]{8}"
              placeholder="12345678" value="${this.escapeHtml(prefill)}" autocomplete="off">
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
        return { local: raw, full: `${dial}${raw}`, dial };
      },
    });
    return result.isConfirmed ? result.value : null;
  },

  async ensureWhatsappReady() {
    const st = await this.getWhatsappStatus();
    if (!st || st.state !== 'ready') {
      throw new Error('WhatsApp no está conectado. Active la sesión en Configuraciones → WhatsApp.');
    }
    return st;
  },

  async getWhatsappStatus() {
    try {
      return await F.fetchJson(`/api/whatsapp/status?_=${Date.now()}`, { cache: 'no-store' });
    } catch {
      return { state: 'error', connected: false };
    }
  },

  async isWhatsappBaileysReady() {
    const st = await this.getWhatsappStatus();
    return Boolean(st && st.state === 'ready');
  },

  /**
   * Envío unificado de reportes por WhatsApp.
   * - Pide teléfono (prefijo WHATSAPP_DIAL_CODE).
   * - Si Baileys está ready → envía según kind: text | pdf | image.
   * - Si no → siempre wa.me con texto (opts.text).
   *
   * @param {{
   *   kind: 'text'|'pdf'|'image',
   *   text: string,
   *   phone?: { local: string, full: string, dial?: string },
   *   prefill?: string,
   *   report?: object,
   *   html?: string,
   *   fileName?: string,
   *   caption?: string,
   *   imageBase64?: string,
   *   mimetype?: string,
   * }} opts
   */
  async enviarReporteWhatsapp(opts = {}) {
    const kind = String(opts.kind || 'text').toLowerCase();
    if (!['text', 'pdf', 'image'].includes(kind)) {
      throw new Error(`Tipo WhatsApp no soportado: ${kind}`);
    }
    const phone = opts.phone || (await this.solicitarTelefonoWhatsapp({ prefill: opts.prefill }));
    if (!phone) return { ok: false, cancelled: true };

    const textFallback = String(opts.text || opts.caption || '').trim();
    const baileysReady = await this.isWhatsappBaileysReady();

    if (!baileysReady) {
      if (!textFallback) {
        throw new Error('Sin texto para enviar. Conecte WhatsApp en Configuraciones o provea un resumen de texto.');
      }
      this.abrirWhatsapp(phone.local, textFallback);
      return { ok: true, via: 'wa.me', kind: 'text', phone };
    }

    const to = phone.full || `${this.WHATSAPP_DIAL_CODE}${phone.local || ''}`;
    if (kind === 'text') {
      if (!textFallback) throw new Error('Mensaje de texto vacío');
      const result = await F.fetchJson('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, text: textFallback }),
      });
      return { ok: true, via: 'baileys', kind: 'text', phone, result };
    }

    if (kind === 'pdf') {
      const hasReport = opts.report && typeof opts.report === 'object';
      const hasHtml = typeof opts.html === 'string' && opts.html.trim();
      if (!hasReport && !hasHtml) {
        throw new Error('Falta el reporte (report) o el HTML del imprimible para el PDF');
      }
      const result = await F.fetchJson('/api/whatsapp/send-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          report: hasReport ? opts.report : undefined,
          html: hasHtml ? opts.html : undefined,
          fileName: opts.fileName || 'documento.pdf',
          caption: opts.caption || textFallback || '',
        }),
      });
      return { ok: true, via: 'baileys', kind: 'pdf', phone, result };
    }

    // image
    if (!opts.imageBase64) throw new Error('Falta la imagen (imageBase64)');
    const result = await F.fetchJson('/api/whatsapp/send-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        imageBase64: opts.imageBase64,
        fileName: opts.fileName || 'imagen.jpg',
        caption: opts.caption || textFallback || '',
        mimetype: opts.mimetype || undefined,
      }),
    });
    return { ok: true, via: 'baileys', kind: 'image', phone, result };
  },

  /**
   * Genera PDF en servidor (DOCUMENTOS/) y lo envía por Baileys, o wa.me si no hay sesión.
   * Preferir `enviarReporteWhatsapp({ kind: 'pdf', … })` en botones nuevos.
   */
  async enviarPdfWhatsapp(opts = {}) {
    return this.enviarReporteWhatsapp({
      ...opts,
      kind: 'pdf',
      text: opts.text || opts.caption || '',
    });
  },

  /**
   * HTML del mismo imprimible que DocPrint (plantilla BD o built-in).
   */
  async fetchPrintableHtml(coddoc, correlativo, opts = {}) {
    const emp = F.getEmpNit();
    let formato = 'CARTA';
    if (typeof DocPrint !== 'undefined' && DocPrint.fetchFormatoImpresion) {
      try {
        formato = await DocPrint.fetchFormatoImpresion();
      } catch {
        /* ignore */
      }
    }
    const papel =
      typeof DocPrint !== 'undefined' && DocPrint.normalizeFormato
        ? DocPrint.normalizeFormato(formato)
        : String(formato || 'CARTA').toUpperCase();

    if (typeof PrintReport !== 'undefined' && PrintReport.ensureLogo) {
      try {
        await PrintReport.ensureLogo();
      } catch {
        /* ignore */
      }
    }

    try {
      const params = new URLSearchParams({ empnit: emp });
      const data = await F.fetchJson(`/api/formatos-impresion/render?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coddoc: String(coddoc),
          correlativo: Number(correlativo),
          papel,
          title: opts.title || undefined,
          logoUrl:
            typeof PrintReport !== 'undefined' && PrintReport.getLogoDataUrl
              ? PrintReport.getLogoDataUrl()
              : undefined,
        }),
      });
      if (data?.html) return data.html;
    } catch (err) {
      console.warn('[DocOpciones] plantilla WhatsApp:', err.message || err);
    }

    if (typeof DocPrint === 'undefined') {
      throw new Error('No se pudo obtener el imprimible del documento');
    }
    const doc = opts.doc || (await this.fetchDetalle(coddoc, correlativo));
    const h = doc.header || {};
    const lines = doc.lines || [];
    const tipodoc = String(h.TIPODOC || opts.row?.TIPODOC || '').trim().toUpperCase();
    const title = String(opts.title || h.DESDOC || tipodoc || 'Documento').trim();
    const footerNote =
      tipodoc === 'COT'
        ? 'Cotización — documento sin validez fiscal'
        : opts.footerNote || 'Documento generado por POS OnneB';
    let muestraPeso = false;
    try {
      muestraPeso = await DocPrint.fetchMuestraPeso();
    } catch {
      /* ignore */
    }
    return DocPrint.wrapHtml({
      title,
      bodyHtml: DocPrint.buildDocumentHtml(
        { title, header: h, lines, footerNote, muestraPeso },
        papel
      ),
      formato: papel,
    });
  },

  async enviarWhatsapp(coddoc, correlativo, row) {
    const phone = await this.solicitarTelefonoWhatsapp();
    if (!phone) return { ok: false, cancelled: true };
    const doc = await this.fetchDetalle(coddoc, correlativo);
    const text = this.buildWhatsappDetalleText(doc, row);
    const h = doc.header || {};
    const tipodoc = String(h.TIPODOC || row?.TIPODOC || '').trim().toUpperCase();
    const titulo = String(row?.DESDOC || h.DESDOC || tipodoc || 'Documento').trim();
    const html = await this.fetchPrintableHtml(coddoc, correlativo, {
      title: titulo,
      doc,
      row,
    });
    const safeDoc = String(coddoc || 'doc').replace(/[^\w\-]+/g, '_');
    const safeCorr = String(correlativo ?? '').replace(/[^\w\-]+/g, '_');
    const fileName = `documento-${safeDoc}-${safeCorr}.pdf`;
    const caption = `${titulo} ${safeDoc}-${safeCorr}`.trim();
    const result = await this.enviarReporteWhatsapp({
      kind: 'pdf',
      phone,
      text,
      html,
      fileName,
      caption,
    });
    if (result?.via === 'wa.me') {
      F.toast('WhatsApp Web no conectado: se abrió el mensaje de texto', 'info');
    } else if (result?.ok) {
      F.toast('PDF enviado por WhatsApp', 'success');
    }
    return result;
  },

  abrirWhatsapp(telefono8, text) {
    const dial = this.WHATSAPP_DIAL_CODE || '502';
    const local = String(telefono8 || '').replace(/\D/g, '').slice(-8);
    const url = `https://wa.me/${dial}${local}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  },

  async enviarWhatsappTexto(text) {
    return this.enviarReporteWhatsapp({ kind: 'text', text: String(text || '') });
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
    const footerNote =
      tipodoc === 'COT' ? 'Cotización — documento sin validez fiscal' : 'Documento generado por POS OnneB';

    await DocPrint.printDocument({
      title: titulo,
      header: h,
      lines,
      footerNote,
    });
  },

  async eliminar(coddoc, correlativo, label, row) {
    const pass = await CatalogosUI.confirmEliminarDocumento({
      label: label || `${coddoc} #${correlativo}`,
      tipo: 'documento',
      kind: 'documento',
      coddoc,
      correlativo,
      tipodoc: row?.TIPODOC || '',
    });
    if (!pass) return false;
    await F.fetchJson(this.deleteUrl(coddoc, correlativo), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pass: String(pass),
        USUARIO: String(F.session('user')?.usuario || '').trim() || undefined,
      }),
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

    if (typeof AutorizacionesUI !== 'undefined') {
      const allowed = await AutorizacionesUI.gateAccionDocumento({
        accion: 'editar',
        coddoc,
        correlativo,
        tipodoc: t,
        label: `${coddoc} #${correlativo}`,
      });
      if (!allowed) return false;
    }

    const mainContent = document.getElementById('main-content');
    if (!mainContent) return false;

    this.activateMenuLink(cfg.menu);
    mainContent.className = 'main-content flex-grow-1 d-flex p-2 p-md-3';
    await view.load(mainContent);
    await view.showEditor(coddoc, correlativo, { skipAuth: true });
    return true;
  },

  /** Tipodocs de factura aplicables a entregas parciales (Pendientes Entrega). */
  TIPODOC_ENTREGAS: ['FAC', 'FEF', 'FEC', 'FES', 'FEL'],

  puedeHistorialEntregas(row) {
    if (!row) return false;
    const tipodoc = String(row.TIPODOC || '').trim().toUpperCase();
    return this.TIPODOC_ENTREGAS.includes(tipodoc);
  },

  formatQtyEntrega(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-GT', { maximumFractionDigits: 4 });
  },

  formatDateEntrega(value) {
    if (value === null || value === undefined || value === '') return '—';
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    return this.formatFecha(value);
  },

  entregasApiUrl(path = '', params = {}) {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const qs = new URLSearchParams({ empnit: empNit, ...params });
    const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    return `/api/pendientes-entrega${segment}?${qs.toString()}`;
  },

  historialEntregasTableHtml(entregas, { allowDelete = false } = {}) {
    if (!entregas.length) {
      return '<p class="text-muted small mb-0 text-start">Aún no hay entregas registradas para este documento.</p>';
    }
    return `<div class="table-responsive text-start" style="max-height: 420px">
      <table class="table table-sm table-hover mb-0">
        <thead class="table-light sticky-top">
          <tr>
            <th>#</th>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Entregado a</th>
            <th class="text-end">Und.</th>
            <th class="text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${entregas
            .map((e) => {
              const delBtn = allowDelete
                ? `<button type="button" class="btn btn-sm btn-outline-danger pe-hist-del" data-id="${e.ID}" title="Eliminar entrega">
                    <i class="fa-solid fa-trash"></i>
                  </button>`
                : '';
              return `<tr>
                <td class="font-monospace small">${this.escapeHtml(e.ID)}</td>
                <td>${this.escapeHtml(this.formatDateEntrega(e.FECHA))}</td>
                <td>${this.escapeHtml(e.HORA || '—')}</td>
                <td>${this.escapeHtml(e.ENTREGADO_A || '—')}</td>
                <td class="text-end">${this.escapeHtml(this.formatQtyEntrega(e.TOTALUNIDADES))}</td>
                <td class="text-center text-nowrap">
                  <button type="button" class="btn btn-sm btn-outline-secondary pe-hist-print" data-id="${e.ID}" title="Imprimir">
                    <i class="fa-solid fa-print"></i>
                  </button>
                  ${delBtn}
                </td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
  },

  async imprimirEntrega(id) {
    const data = await F.fetchJson(
      this.entregasApiUrl(`entregas/${encodeURIComponent(id)}`, { _: String(Date.now()) }),
      { cache: 'no-store' }
    );
    const e = data.entrega || {};
    const h = data.header || {};
    const lines = Array.isArray(e.DETALLE) ? e.DETALLE : [];
    const rows = lines.length
      ? lines
          .map(
            (r) => `<tr>
              <td>${this.escapeHtml(r.CODPROD || '')}</td>
              <td>${this.escapeHtml(r.DESPROD || '')}</td>
              <td>${this.escapeHtml(r.CODMEDIDA || '')}</td>
              <td style="text-align:right">${this.escapeHtml(this.formatQtyEntrega(r.TOTALUNIDADES))}</td>
              <td style="text-align:right">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="5">Sin detalle</td></tr>';

    const body = `
      <h2 style="margin:0 0 8px">Comprobante de entrega</h2>
      <p style="margin:0 0 4px"><strong>Documento:</strong> ${this.escapeHtml(e.CODDOC || h.CODDOC || '')} #${this.escapeHtml(e.CORRELATIVO ?? h.CORRELATIVO ?? '')}</p>
      <p style="margin:0 0 4px"><strong>Cliente:</strong> ${this.escapeHtml(h.CLIENTE || '—')}</p>
      <p style="margin:0 0 4px"><strong>Fecha entrega:</strong> ${this.escapeHtml(this.formatDateEntrega(e.FECHA))} ${this.escapeHtml(e.HORA || '')}</p>
      <p style="margin:0 0 12px"><strong>Entregado a:</strong> ${this.escapeHtml(e.ENTREGADO_A || '—')}</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px" border="1" cellpadding="4">
        <thead>
          <tr>
            <th>Código</th><th>Producto</th><th>Medida</th>
            <th>Cantidad</th><th>Importe</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:12px;text-align:right"><strong>Total und.:</strong> ${this.escapeHtml(this.formatQtyEntrega(e.TOTALUNIDADES))}</p>
      <p style="margin-top:28px">_________________________<br><span style="font-size:11px">Firma / recibido</span></p>
    `;

    if (typeof PrintReport !== 'undefined' && PrintReport.openAndPrint) {
      const logo = typeof PrintReport.ensureLogo === 'function' ? await PrintReport.ensureLogo() : null;
      const emp = PrintReport.getEmpresaNombre?.() || '';
      const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Entrega #${this.escapeHtml(e.ID)}</title>
        <style>body{font-family:Segoe UI,Arial,sans-serif;padding:16px;color:#111} @media print{body{padding:0}}</style></head>
        <body>
          <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
            ${logo ? `<img src="${logo}" alt="" style="height:48px">` : ''}
            <div><strong>${this.escapeHtml(emp)}</strong></div>
          </div>
          ${body}
        </body></html>`;
      await PrintReport.openAndPrint(full);
      return;
    }

    const w = window.open('', '_blank');
    if (!w) throw new Error('Ventana de impresión bloqueada');
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Entrega</title></head><body>${body}</body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  },

  /**
   * Modal de historial de entregas (solo consulta + reimpresión).
   * Usado desde Archivo → Documentos.
   */
  async mostrarHistorialEntregas(coddoc, correlativo, row = null) {
    const label = `${coddoc} #${correlativo}`;
    Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: 'Historial de entregas',
      html: `<p class="text-muted mb-0"><i class="fa-solid fa-spinner fa-spin me-1"></i>Cargando…</p>`,
      showConfirmButton: false,
      showCancelButton: false,
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    const data = await F.fetchJson(
      this.entregasApiUrl(`${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/entregas`, {
        _: String(Date.now()),
      }),
      { cache: 'no-store' }
    );
    const entregas = data.entregas || [];
    const cliente = String(row?.DOC_NOMCLIE || row?.CLIENTE || '').trim();

    await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: `Historial de entregas · ${this.escapeHtml(label)}`,
      html: `
        <div class="text-start">
          ${cliente ? `<p class="small text-muted mb-2">${this.escapeHtml(cliente)}</p>` : ''}
          ${this.historialEntregasTableHtml(entregas, { allowDelete: false })}
        </div>
      `,
      width: Math.min(720, window.innerWidth - 24),
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.cancelButtonHtml('Cerrar') : 'Cerrar',
      didOpen: () => {
        const root = Swal.getHtmlContainer();
        root?.querySelectorAll('.pe-hist-print').forEach((btn) => {
          btn.addEventListener('click', () => {
            this.imprimirEntrega(btn.getAttribute('data-id')).catch((err) =>
              F.toast(err.message || 'No se pudo imprimir', 'error')
            );
          });
        });
      },
    });
  },
};

if (typeof F !== 'undefined') {
  F.DocOpciones = DocOpciones;
}
