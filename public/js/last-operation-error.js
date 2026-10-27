/**
 * Último error de operación (solo uno; cada nuevo reemplaza al anterior).
 * Vista en Asistente → pestaña Último error.
 */
const LastOperationError = {
  STORAGE_KEY: 'onneb-last-operation-error',

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  get() {
    try {
      const raw = sessionStorage.getItem(this.STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : null;
    } catch {
      return null;
    }
  },

  clear() {
    try {
      sessionStorage.removeItem(this.STORAGE_KEY);
    } catch {
      /* ignore */
    }
  },

  summarizeInfileDetails(details) {
    if (!details || typeof details !== 'object') return '';
    const parsed = details.infileParsed;
    if (parsed && typeof parsed === 'object') {
      const parts = [];
      const codigo = String(parsed.codigo ?? parsed.codigo_error ?? '').trim();
      if (codigo && codigo !== '0') parts.push(`Código ${codigo}`);
      for (const key of ['mensaje', 'descripcion', 'Descripcion', 'error']) {
        const v = String(parsed[key] ?? '').trim();
        if (v) parts.push(v);
      }
      if (Array.isArray(parsed.descripcion_errores) && parsed.descripcion_errores.length) {
        const msgs = parsed.descripcion_errores
          .map((item) =>
            typeof item === 'object' && item
              ? String(item.mensaje_error || item.mensaje || '').trim()
              : String(item || '').trim()
          )
          .filter(Boolean);
        if (msgs.length) parts.push(msgs.join('; '));
      }
      if (parts.length) return parts.join(' — ');
    }
    const body = String(details.infileBody || '').trim();
    if (body) return body.length > 600 ? `${body.slice(0, 600)}…` : body;
    if (details.infileNetworkCode) {
      return `Red hacia Infile (${details.infileNetworkCode}${
        details.infileNetworkDetail ? `: ${details.infileNetworkDetail}` : ''
      })`;
    }
    return '';
  },

  inferFromUrl(url) {
    const path = String(url || '').split('?')[0];
    const cert = path.match(/\/api\/fel\/certificar\/([^/]+)\/([^/]+)/i);
    if (cert) {
      return {
        area: 'fel-certificar',
        label: 'Certificación FEL',
        coddoc: decodeURIComponent(cert[1]),
        correlativo: decodeURIComponent(cert[2]),
      };
    }
    const anul = path.match(/\/api\/fel\/anular\/([^/]+)\/([^/]+)/i);
    if (anul) {
      return {
        area: 'fel-anular',
        label: 'Anulación FEL',
        coddoc: decodeURIComponent(anul[1]),
        correlativo: decodeURIComponent(anul[2]),
      };
    }
    if (path.includes('/api/fel/')) {
      return { area: 'fel', label: 'Operación FEL' };
    }
    return { area: 'operacion', label: 'Operación' };
  },

  record(entry) {
    if (!entry || !entry.message) return;
    const prev = this.get();
    const merged = {
      ...(prev || {}),
      ...entry,
      at: entry.at || new Date().toISOString(),
    };
    try {
      sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(merged));
    } catch {
      /* ignore quota */
    }
  },

  recordFromFetchFailure({ url, method, message, httpStatus, payload, rawText, operation }) {
    const inferred = this.inferFromUrl(url);
    const op = operation && typeof operation === 'object' ? operation : {};
    const isNetwork =
      !httpStatus &&
      (message === 'Failed to fetch' ||
        message === 'NetworkError when attempting to fetch resource.' ||
        /network/i.test(String(message)));

    let detailHint = '';
    if (isNetwork) {
      detailHint =
        'No hubo respuesta del servidor (red, ERP apagado, URL incorrecta o bloqueo del navegador). Revise que el servicio OnneB esté en ejecución y la URL en la barra de direcciones.';
    }

    this.record({
      area: op.area || inferred.area,
      label: op.label || inferred.label,
      coddoc: op.coddoc ?? inferred.coddoc ?? null,
      correlativo: op.correlativo ?? inferred.correlativo ?? null,
      message: String(message || 'Error desconocido'),
      httpStatus: httpStatus ?? null,
      url: String(url || ''),
      method: String(method || 'GET').toUpperCase(),
      payload: payload ?? null,
      rawText: rawText ? String(rawText).slice(0, 12000) : null,
      networkError: isNetwork,
      hint: op.hint || detailHint || null,
    });
  },

  formatWhen(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'medium' });
    } catch {
      return iso;
    }
  },

  payloadPreview(payload) {
    if (!payload) return '';
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  },

  renderPanelHtml() {
    const err = this.get();
    if (!err) {
      return `<p class="small text-muted mb-0">No hay errores registrados en esta sesión. Al fallar una certificación u otra operación, aquí aparecerá solo el <strong>último</strong> error con detalle.</p>`;
    }
    const docLine =
      err.coddoc && err.correlativo != null
        ? `<div class="mb-1"><span class="text-muted">Documento:</span> <strong>${this.escapeHtml(
            err.coddoc
          )} #${this.escapeHtml(err.correlativo)}</strong></div>`
        : '';
    const httpLine =
      err.httpStatus != null
        ? `<div class="mb-1"><span class="text-muted">HTTP:</span> <strong>${this.escapeHtml(err.httpStatus)}</strong></div>`
        : err.networkError
          ? `<div class="mb-1"><span class="badge text-bg-warning">Sin respuesta HTTP (red)</span></div>`
          : '';
    const hint = err.hint
      ? `<p class="small text-warning-emphasis mb-2">${this.escapeHtml(err.hint)}</p>`
      : '';
    const payloadBlock = err.payload
      ? `<pre class="asistente-last-error-pre mb-2">${this.escapeHtml(this.payloadPreview(err.payload))}</pre>`
      : '';
    const rawBlock =
      err.rawText && !err.payload
        ? `<pre class="asistente-last-error-pre mb-2">${this.escapeHtml(err.rawText)}</pre>`
        : '';
    const d = err.payload?.details && typeof err.payload.details === 'object' ? err.payload.details : null;
    const infileBlock = d?.infileBody
      ? `<div class="small text-muted mb-1">Respuesta Infile</div><pre class="asistente-last-error-pre mb-2">${this.escapeHtml(
          String(d.infileBody)
        )}</pre>`
      : '';
    const infileSecondary = d?.infileBodySecondary
      ? `<div class="small text-muted mb-1">Infile (intento unificado)</div><pre class="asistente-last-error-pre mb-2">${this.escapeHtml(
          String(d.infileBodySecondary)
        )}</pre>`
      : '';
    const attemptsBlock =
      Array.isArray(d?.infileAttempts) && d.infileAttempts.length
        ? `<div class="small text-muted mb-1">Intentos Infile</div><pre class="asistente-last-error-pre mb-2">${this.escapeHtml(
            this.payloadPreview(d.infileAttempts)
          )}</pre>`
        : '';
    const detailsFromPayload =
      d && !d.infileBody
        ? `<pre class="asistente-last-error-pre mb-2">${this.escapeHtml(this.payloadPreview(d))}</pre>`
        : d && (d.infileNetworkCode || d.infileUrl || d.infileStep)
          ? `<pre class="asistente-last-error-pre mb-2">${this.escapeHtml(
              this.payloadPreview({
                infileStep: d.infileStep,
                infileUrl: d.infileUrl,
                infileNetworkCode: d.infileNetworkCode,
                infileNetworkDetail: d.infileNetworkDetail,
                statusCode: d.statusCode,
                coddoc: d.coddoc,
                correlativo: d.correlativo,
              })
            )}</pre>`
          : '';

    return `
      <div class="asistente-last-error-head mb-2">
        <div class="fw-semibold text-danger">${this.escapeHtml(err.label || err.area || 'Error')}</div>
        <div class="small text-muted">${this.escapeHtml(this.formatWhen(err.at))}</div>
      </div>
      ${docLine}
      ${httpLine}
      <div class="mb-2"><span class="text-muted">Mensaje:</span> ${this.escapeHtml(err.message)}</div>
      ${hint}
      <div class="small text-muted mb-1">${this.escapeHtml(err.method)} ${this.escapeHtml(err.url)}</div>
      ${infileBlock}
      ${infileSecondary}
      ${attemptsBlock}
      ${detailsFromPayload}
      ${payloadBlock}
      ${rawBlock}
      <div class="d-flex flex-wrap gap-2 mt-2">
        <button type="button" class="btn btn-sm btn-outline-primary" id="asist-error-copy">Copiar detalle</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="asist-error-clear">Borrar registro</button>
      </div>`;
  },

  buildPlainTextReport() {
    const err = this.get();
    if (!err) return '';
    const lines = [
      `[OnneB] Último error — ${err.label || err.area}`,
      `Fecha: ${this.formatWhen(err.at)}`,
      err.coddoc ? `Documento: ${err.coddoc} #${err.correlativo}` : null,
      err.httpStatus != null ? `HTTP: ${err.httpStatus}` : err.networkError ? 'Red: sin respuesta' : null,
      `Mensaje: ${err.message}`,
      err.hint ? `Nota: ${err.hint}` : null,
      `${err.method} ${err.url}`,
      err.payload?.details?.infileBody ? `Infile:\n${err.payload.details.infileBody}` : null,
      err.payload?.details?.infileBodySecondary
        ? `Infile (unificado):\n${err.payload.details.infileBodySecondary}`
        : null,
      err.payload ? `Payload:\n${this.payloadPreview(err.payload)}` : null,
      err.rawText ? `Respuesta:\n${err.rawText}` : null,
    ].filter(Boolean);
    return lines.join('\n');
  },

  bindPanel(container) {
    if (!container) return;
    const refresh = () => {
      container.innerHTML = this.renderPanelHtml();
      container.querySelector('#asist-error-copy')?.addEventListener('click', async () => {
        const text = this.buildPlainTextReport();
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          if (typeof F !== 'undefined') F.toast('Detalle copiado', 'success');
        } catch {
          if (typeof F !== 'undefined') F.toast('No se pudo copiar', 'warning');
        }
      });
      container.querySelector('#asist-error-clear')?.addEventListener('click', () => {
        this.clear();
        refresh();
        if (typeof F !== 'undefined') F.toast('Registro de error borrado', 'info');
      });
    };
    refresh();
  },
};
