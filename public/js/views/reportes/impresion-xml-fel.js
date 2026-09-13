/**
 * Reportes → Impresión XML FEL — vista previa de XML SAT con formato local FEL.
 */
const ImpresionXmlFelView = {
  _container: null,
  _xmlText: '',
  _previewHtml: '',

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiUrl() {
    const empnit = F.getEmpNit();
    if (!empnit) throw new Error('No hay empresa activa');
    return `/api/fel-xml/render?empnit=${encodeURIComponent(empnit)}`;
  },

  bindEvents() {
    const input = this._container?.querySelector('#fel-xml-file');
    const btnPrint = this._container?.querySelector('#fel-xml-btn-print');
    const btnClear = this._container?.querySelector('#fel-xml-btn-clear');

    input?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await this.renderFromXml(text, file.name);
      } catch (err) {
        F.alert('Error', err.message || 'No se pudo leer el archivo', 'error');
      } finally {
        e.target.value = '';
      }
    });

    btnPrint?.addEventListener('click', () => this.printPreview());
    btnClear?.addEventListener('click', () => this.clearPreview());
  },

  clearPreview() {
    this._xmlText = '';
    this._previewHtml = '';
    const frame = this._container?.querySelector('#fel-xml-preview');
    const meta = this._container?.querySelector('#fel-xml-meta');
    if (frame) frame.srcdoc = '<p style="font-family:sans-serif;color:#666;padding:1rem">Cargue un archivo XML de SAT para ver la vista previa.</p>';
    if (meta) meta.textContent = '';
    this._container?.querySelector('#fel-xml-actions')?.classList.add('d-none');
  },

  async renderFromXml(xmlText, fileName = '') {
    this._xmlText = xmlText;
    const meta = this._container?.querySelector('#fel-xml-meta');
    const frame = this._container?.querySelector('#fel-xml-preview');
    const actions = this._container?.querySelector('#fel-xml-actions');
    if (meta) meta.textContent = 'Procesando…';
    if (actions) actions.classList.add('d-none');

    const logoUrl =
      typeof PrintReport !== 'undefined' && PrintReport.getLogoDataUrl
        ? PrintReport.getLogoDataUrl()
        : '';

    try {
      const data = await F.fetchJson(this.apiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml: xmlText, papel: 'TICKET', logoUrl }),
      });

      this._previewHtml = data.html || '';
      if (frame) frame.srcdoc = this._previewHtml;
      if (meta) {
        const parts = [
          fileName ? `Archivo: ${fileName}` : null,
          data.tipodoc ? `Tipo: ${data.tipodoc}` : null,
          data.satTipo ? `SAT: ${data.satTipo}` : null,
          data.lineCount != null ? `${data.lineCount} línea(s)` : null,
        ].filter(Boolean);
        meta.textContent = parts.join(' · ') || 'Vista generada';
      }
      if (actions) actions.classList.remove('d-none');
      F.toast('Vista XML generada', 'success');
    } catch (err) {
      if (meta) meta.textContent = '';
      F.alert('Error', err.message || 'No se pudo interpretar el XML', 'error');
    }
  },

  printPreview() {
    if (!this._previewHtml) {
      F.toast('Cargue un XML primero', 'warning');
      return;
    }
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
      F.alert('Impresión', 'Permita ventanas emergentes para imprimir', 'warning');
      return;
    }
    w.document.open();
    w.document.write(this._previewHtml);
    w.document.close();
    w.focus();
    w.onload = () => w.print();
  },

  renderShell() {
    return `
      <div class="catalogo-vista-wrap impresion-xml-fel-wrap">
        <h2 class="catalogo-vista-title h5 mb-3">Impresión XML FEL</h2>
        <p class="small text-muted mb-3">
          Cargue un archivo XML certificado de SAT (Guatemala) para visualizarlo con el formato de ticket FEL configurado en el sistema.
        </p>
        <div class="card shadow-sm border-0 mb-3">
          <div class="card-body d-flex flex-wrap align-items-center gap-2">
            <label class="btn btn-primary btn-sm mb-0" for="fel-xml-file">
              <i class="fa-solid fa-file-code me-1"></i>Cargar XML
            </label>
            <input type="file" id="fel-xml-file" class="d-none" accept=".xml,text/xml,application/xml">
            <span id="fel-xml-meta" class="small text-muted"></span>
            <div id="fel-xml-actions" class="ms-auto d-none d-flex gap-2">
              <button type="button" class="btn btn-outline-secondary btn-sm" id="fel-xml-btn-clear">Limpiar</button>
              <button type="button" class="btn btn-outline-primary btn-sm" id="fel-xml-btn-print">
                <i class="fa-solid fa-print me-1"></i>Imprimir
              </button>
            </div>
          </div>
        </div>
        <div class="card shadow-sm border-0">
          <div class="card-body p-0">
            <iframe id="fel-xml-preview" class="fel-xml-preview-frame" title="Vista previa FEL"
              srcdoc="<p style='font-family:sans-serif;color:#666;padding:1rem'>Cargue un archivo XML de SAT para ver la vista previa.</p>"></iframe>
          </div>
        </div>
      </div>`;
  },

  async load(container) {
    this._container = container;
    container.innerHTML = this.renderShell();
    this.bindEvents();
  },
};
