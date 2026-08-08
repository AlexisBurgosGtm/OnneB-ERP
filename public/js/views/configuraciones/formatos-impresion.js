/**
 * Vista Formatos de impresión — plantillas HTML/CSS por EMPNIT + TIPODOC + PAPEL.
 * Incluye diseñador visual y vista previa al 100%.
 */
const FormatosImpresionView = {
  _container: null,
  _rows: [],
  _tipodocs: [],
  _selectedId: null,
  _draft: null,
  _variables: null,
  _editorTab: 'visual',
  _previewHtml: null,
  /** @type {'list'|'designer'} */
  _screen: 'list',
  _transitioning: false,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiUrl(path = '', extra = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    const params = new URLSearchParams({ empnit: emp, ...extra });
    return `/api/formatos-impresion${segment}?${params}`;
  },

  usuario() {
    return F.session('user')?.username || '';
  },

  emptyDraft() {
    return {
      ID: null,
      TIPODOC: '',
      PAPEL: 'CARTA',
      NOMBRE: '',
      HTML: '',
      CSS: '',
      ACTIVO: 'SI',
      ES_DEFAULT: false,
    };
  },

  async fetchTipodocs() {
    const data = await F.fetchJson(this.apiUrl('/tipodocs'), { cache: 'no-store' });
    this._tipodocs = data.rows || [];
    return this._tipodocs;
  },

  async fetchList() {
    const data = await F.fetchJson(this.apiUrl(), { cache: 'no-store' });
    this._rows = data.rows || [];
    return this._rows;
  },

  async fetchDefault(papel, tipodoc = '') {
    const extra = { papel };
    if (tipodoc) extra.tipodoc = tipodoc;
    const data = await F.fetchJson(this.apiUrl('/default', extra), { cache: 'no-store' });
    return data;
  },

  async fetchVariables() {
    if (this._variables) return this._variables;
    const data = await F.fetchJson(this.apiUrl('/variables'), { cache: 'no-store' });
    this._variables = data.groups || [];
    return this._variables;
  },

  tipodocOptionsHtml(selected) {
    const sel = String(selected || '').toUpperCase();
    const opts = this._tipodocs
      .map((t) => {
        const v = t.TIPODOC;
        const label = t.DESCRIPCION && t.DESCRIPCION !== v ? `${v} — ${t.DESCRIPCION}` : v;
        return `<option value="${this.escapeHtml(v)}"${v === sel ? ' selected' : ''}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
    return `<option value="">— Seleccione —</option>${opts}`;
  },

  listRowsHtml() {
    if (!this._rows.length) {
      return `<tr><td colspan="6" class="text-center text-muted py-4">Sin formatos personalizados. Pulse <strong>Nuevo</strong> para crear uno a partir del default del sistema.</td></tr>`;
    }
    return this._rows
      .map((r) => {
        return `<tr class="fi-list-row" data-id="${r.ID}">
          <td class="fw-semibold">${this.escapeHtml(r.TIPODOC)}</td>
          <td><span class="badge text-bg-light border">${this.escapeHtml(r.PAPEL)}</span></td>
          <td>${this.escapeHtml(r.NOMBRE)}</td>
          <td class="text-center">${this.escapeHtml(r.ACTIVO)}</td>
          <td class="text-end small text-muted text-nowrap">${r.HTML_LEN || 0} c</td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-primary fi-btn-editar" data-id="${r.ID}" title="Editar">
              <i class="fa-solid fa-pen me-1"></i>Editar
            </button>
          </td>
        </tr>`;
      })
      .join('');
  },

  variablesHelpHtml(groups) {
    return (groups || [])
      .map(
        (g) => `
      <div class="fi-var-group mb-2">
        <div class="fw-semibold small">${this.escapeHtml(g.name)}</div>
        <div class="fi-var-chips">
          ${(g.vars || [])
            .map(
              (v) =>
                `<button type="button" class="btn btn-sm btn-outline-secondary fi-var-chip" data-var="${this.escapeHtml(v)}">${this.escapeHtml(v)}</button>`
            )
            .join('')}
        </div>
      </div>`
      )
      .join('');
  },

  paperFrameClass(papel) {
    return String(papel || 'CARTA').toUpperCase() === 'TICKET' ? 'fi-paper--ticket' : 'fi-paper--carta';
  },

  renderEditorHtml() {
    const d = this._draft || this.emptyDraft();
    const isNew = !d.ID;
    const tabVisual = this._editorTab === 'visual';
    const D = typeof FormatoImpresionDesigner !== 'undefined' ? FormatoImpresionDesigner : null;
    const title = isNew
      ? 'Nuevo formato'
      : `Editar ${this.escapeHtml(d.TIPODOC || '')} · ${this.escapeHtml(d.PAPEL || '')}`;

    return `
      <div class="fi-editor fi-editor--full">
        <div class="fi-designer-toolbar sticky-top">
          <div class="d-flex flex-wrap align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="fi-btn-atras" title="Volver al listado">
              <i class="fa-solid fa-arrow-left me-1"></i>Listado
            </button>
            <div class="fi-designer-title">
              <strong>${title}</strong>
              <span class="badge text-bg-light border ms-1">${this.escapeHtml(d.ES_DEFAULT ? 'Basado en default' : 'Personalizado')}</span>
            </div>
            <div class="btn-group btn-group-sm ms-auto" role="group" aria-label="Modo editor">
              <button type="button" class="btn ${tabVisual ? 'btn-primary' : 'btn-outline-secondary'}" id="fi-tab-visual">
                <i class="fa-solid fa-wand-magic-sparkles me-1"></i>Diseñador
              </button>
              <button type="button" class="btn ${!tabVisual ? 'btn-primary' : 'btn-outline-secondary'}" id="fi-tab-codigo">
                <i class="fa-solid fa-code me-1"></i>Código
              </button>
            </div>
          </div>
        </div>

        <div class="fi-designer-scroll">
          <div class="fi-editor-meta row g-2 mb-2 px-1">
            <div class="col-md-3">
              <label class="form-label small mb-0" for="fi-tipodoc">Tipo documento (TIPODOC)</label>
              <select class="form-select form-select-sm" id="fi-tipodoc"${isNew ? '' : ' disabled'}>
                ${this.tipodocOptionsHtml(d.TIPODOC)}
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label small mb-0" for="fi-papel">Papel</label>
              <select class="form-select form-select-sm" id="fi-papel"${isNew ? '' : ' disabled'}>
                <option value="CARTA"${d.PAPEL === 'CARTA' ? ' selected' : ''}>CARTA</option>
                <option value="TICKET"${d.PAPEL === 'TICKET' ? ' selected' : ''}>TICKET</option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label small mb-0" for="fi-nombre">Nombre</label>
              <input type="text" class="form-control form-control-sm" id="fi-nombre" maxlength="100"
                value="${this.escapeHtml(d.NOMBRE)}" placeholder="Ej. Factura carta">
            </div>
            <div class="col-md-2">
              <label class="form-label small mb-0" for="fi-activo">Activo</label>
              <select class="form-select form-select-sm" id="fi-activo">
                <option value="SI"${d.ACTIVO === 'SI' ? ' selected' : ''}>SI</option>
                <option value="NO"${d.ACTIVO === 'NO' ? ' selected' : ''}>NO</option>
              </select>
            </div>
          </div>

          <div class="fi-pane-visual${tabVisual ? '' : ' d-none'}" id="fi-pane-visual">
            ${D ? D.toolbarHtml() : ''}
            <div class="fi-canvas-stage mt-2">
              <div class="fi-canvas-label small text-muted mb-1">Lienzo al 100% · edite textos y formato; los campos azules son variables</div>
              <div class="fi-paper ${this.paperFrameClass(d.PAPEL)}" id="fi-paper">
                <iframe id="fi-design-frame" class="fi-design-frame" title="Diseñador visual"></iframe>
              </div>
            </div>
            <p class="small text-muted mt-2 mb-0">Use la barra para negritas, alineación, insertar campos o bloques (encabezado, líneas, totales…).</p>
          </div>

          <div class="fi-pane-codigo${tabVisual ? ' d-none' : ''}" id="fi-pane-codigo">
            <div class="row g-2">
              <div class="col-lg-8">
                <label class="form-label small mb-0" for="fi-html">HTML de la plantilla</label>
                <textarea class="form-control form-control-sm font-monospace fi-code" id="fi-html" rows="16"
                  spellcheck="false">${this.escapeHtml(d.HTML)}</textarea>
                <label class="form-label small mb-0 mt-2" for="fi-css">CSS</label>
                <textarea class="form-control form-control-sm font-monospace fi-code" id="fi-css" rows="10"
                  spellcheck="false">${this.escapeHtml(d.CSS)}</textarea>
              </div>
              <div class="col-lg-4">
                <div class="fi-help card bg-light border-0">
                  <div class="card-body p-2">
                    <div class="small fw-semibold mb-1">Variables</div>
                    <p class="small text-muted mb-2">Use <code>{{DOC.CODDOC}}</code>, bloques <code>{{#LINES}}…{{/LINES}}</code> y <code>{{{EMPRESA.LOGO_URL}}}</code> sin escapar.</p>
                    <div id="fi-variables">${this.variablesHelpHtml(this._variables)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="fi-designer-actions d-flex flex-wrap gap-2 mt-3 pb-3">
            <button type="button" class="btn btn-sm btn-primary" id="fi-btn-guardar">
              <i class="fa-solid fa-floppy-disk me-1"></i>Guardar
            </button>
            <button type="button" class="btn btn-sm btn-outline-primary" id="fi-btn-preview">
              <i class="fa-solid fa-eye me-1"></i>Vista previa 100%
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="fi-btn-cargar-default">
              <i class="fa-solid fa-rotate-left me-1"></i>Cargar default
            </button>
            ${
              d.ID
                ? `<button type="button" class="btn btn-sm btn-outline-danger ms-auto" id="fi-btn-eliminar">
              <i class="fa-solid fa-trash me-1"></i>Eliminar
            </button>`
                : ''
            }
          </div>
        </div>
      </div>
      <div id="fi-preview-modal-root"></div>`;
  },

  renderListPanelHtml() {
    return `
      <div class="fi-list-panel">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 px-1">
          <div>
            <h2 class="h5 mb-0">Formatos de impresión</h2>
            <p class="small text-muted mb-0">Plantillas por empresa y TIPODOC. Elija un formato para editarlo o cree uno nuevo.</p>
          </div>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="fi-btn-refresh">
              <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
            </button>
            <button type="button" class="btn btn-sm btn-primary" id="fi-btn-nuevo">
              <i class="fa-solid fa-plus me-1"></i>Nuevo
            </button>
          </div>
        </div>
        <div class="card shadow-sm fi-list-card">
          <div class="table-responsive">
            <table class="table table-sm table-hover table-striped mb-0">
              <thead class="table-light sticky-top">
                <tr>
                  <th>TIPODOC</th>
                  <th>Papel</th>
                  <th>Nombre</th>
                  <th class="text-center">Activo</th>
                  <th class="text-end">Tamaño</th>
                  <th class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody id="fi-list-tbody">${this.listRowsHtml()}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  render() {
    const screen = this._screen === 'designer' ? 'designer' : 'list';
    return `
      <div class="formatos-impresion-wrap catalogo-vista-wrap fi-screen-${screen}">
        <div class="fi-panels">
          <section class="fi-panel fi-panel-list${screen === 'list' ? ' is-active' : ''}" id="fi-panel-list" aria-hidden="${screen !== 'list'}">
            ${this.renderListPanelHtml()}
          </section>
          <section class="fi-panel fi-panel-designer${screen === 'designer' ? ' is-active' : ''}" id="fi-panel-designer" aria-hidden="${screen !== 'designer'}">
            <div id="fi-editor-root">${this._draft && screen === 'designer' ? this.renderEditorHtml() : ''}</div>
          </section>
        </div>
      </div>`;
  },

  goToList() {
    this.closePreviewModal();
    this._screen = 'list';
    this._draft = null;
    this._selectedId = null;
    const wrap = this._container?.querySelector('.formatos-impresion-wrap');
    const list = this._container?.querySelector('#fi-panel-list');
    const designer = this._container?.querySelector('#fi-panel-designer');
    if (!wrap || !list || !designer) {
      this._container.innerHTML = this.render();
      this.bindEvents();
      return;
    }
    wrap.classList.remove('fi-screen-designer');
    wrap.classList.add('fi-screen-list');
    designer.classList.remove('is-active');
    designer.setAttribute('aria-hidden', 'true');
    list.classList.add('is-active');
    list.setAttribute('aria-hidden', 'false');
    const editorRoot = this._container?.querySelector('#fi-editor-root');
    if (editorRoot) editorRoot.innerHTML = '';
    list.innerHTML = this.renderListPanelHtml();
    this.bindEvents();
  },

  goToDesigner() {
    this._screen = 'designer';
    const wrap = this._container?.querySelector('.formatos-impresion-wrap');
    const list = this._container?.querySelector('#fi-panel-list');
    const designer = this._container?.querySelector('#fi-panel-designer');
    const editorRoot = this._container?.querySelector('#fi-editor-root');
    if (!wrap || !list || !designer || !editorRoot) {
      this._container.innerHTML = this.render();
      this.bindEvents();
      if (this._draft && this._editorTab === 'visual') {
        window.setTimeout(() => this.loadDesignFrame(), 40);
      }
      return;
    }
    editorRoot.innerHTML = this.renderEditorHtml();
    this.bindEditorEvents();
    wrap.classList.remove('fi-screen-list');
    wrap.classList.add('fi-screen-designer');
    list.classList.remove('is-active');
    list.setAttribute('aria-hidden', 'true');
    designer.classList.add('is-active');
    designer.setAttribute('aria-hidden', 'false');
    if (this._editorTab === 'visual') {
      window.setTimeout(() => this.loadDesignFrame(), 40);
    }
  },

  syncVisualToTextarea() {
    const frame = this._container?.querySelector('#fi-design-frame');
    const ta = this._container?.querySelector('#fi-html');
    if (!frame?.contentDocument?.body || !ta) return;
    if (typeof FormatoImpresionDesigner === 'undefined') return;
    ta.value = FormatoImpresionDesigner.designToHtml(frame.contentDocument.body.innerHTML);
  },

  loadDesignFrame() {
    const frame = this._container?.querySelector('#fi-design-frame');
    const paper = this._container?.querySelector('#fi-paper');
    if (!frame || typeof FormatoImpresionDesigner === 'undefined') return;
    const html = this._container?.querySelector('#fi-html')?.value || this._draft?.HTML || '';
    const css = this._container?.querySelector('#fi-css')?.value || this._draft?.CSS || '';
    const papel = this._container?.querySelector('#fi-papel')?.value || this._draft?.PAPEL || 'CARTA';
    const width = FormatoImpresionDesigner.paperWidthPx(papel);
    if (paper) {
      paper.classList.toggle('fi-paper--ticket', papel === 'TICKET');
      paper.classList.toggle('fi-paper--carta', papel !== 'TICKET');
      paper.style.width = `${width}px`;
    }
    frame.style.width = `${width}px`;
    const designBody = FormatoImpresionDesigner.htmlToDesign(html);
    const docHtml = FormatoImpresionDesigner.buildFrameHtml({
      bodyHtml: designBody,
      css,
      papel,
    });
    frame.onload = () => {
      try {
        const h = Math.max(520, (frame.contentDocument?.body?.scrollHeight || 0) + 40);
        frame.style.height = `${h}px`;
      } catch {
        /* cross-origin ignore */
      }
    };
    frame.srcdoc = docHtml;
  },

  readDraftFromDom() {
    if (this._editorTab === 'visual') this.syncVisualToTextarea();
    const tipodoc = this._container?.querySelector('#fi-tipodoc')?.value || this._draft?.TIPODOC || '';
    const papel = this._container?.querySelector('#fi-papel')?.value || this._draft?.PAPEL || 'CARTA';
    return {
      ...this._draft,
      TIPODOC: String(tipodoc).trim().toUpperCase(),
      PAPEL: String(papel).trim().toUpperCase() === 'TICKET' ? 'TICKET' : 'CARTA',
      NOMBRE: this._container?.querySelector('#fi-nombre')?.value?.trim() || '',
      HTML: this._container?.querySelector('#fi-html')?.value || '',
      CSS: this._container?.querySelector('#fi-css')?.value || '',
      ACTIVO: this._container?.querySelector('#fi-activo')?.value === 'SI' ? 'SI' : 'NO',
    };
  },

  setEditorTab(tab) {
    if (tab === 'codigo' && this._editorTab === 'visual') this.syncVisualToTextarea();
    this._editorTab = tab === 'codigo' ? 'codigo' : 'visual';
    const visual = this._container?.querySelector('#fi-pane-visual');
    const codigo = this._container?.querySelector('#fi-pane-codigo');
    const btnV = this._container?.querySelector('#fi-tab-visual');
    const btnC = this._container?.querySelector('#fi-tab-codigo');
    visual?.classList.toggle('d-none', this._editorTab !== 'visual');
    codigo?.classList.toggle('d-none', this._editorTab !== 'codigo');
    btnV?.classList.toggle('btn-primary', this._editorTab === 'visual');
    btnV?.classList.toggle('btn-outline-secondary', this._editorTab !== 'visual');
    btnC?.classList.toggle('btn-primary', this._editorTab === 'codigo');
    btnC?.classList.toggle('btn-outline-secondary', this._editorTab !== 'codigo');
    if (this._editorTab === 'visual') {
      this.loadDesignFrame();
    }
  },

  refreshList() {
    const tbody = this._container?.querySelector('#fi-list-tbody');
    if (tbody) tbody.innerHTML = this.listRowsHtml();
    this.bindListEvents();
  },

  async selectRow(id) {
    const data = await F.fetchJson(this.apiUrl(`/${id}`), { cache: 'no-store' });
    this._selectedId = data.ID;
    this._draft = { ...data, ES_DEFAULT: false };
    this._editorTab = 'visual';
    this.goToDesigner();
  },

  async onNuevo() {
    const papel = 'TICKET';
    const tipodoc = 'FEF';
    const def = await this.fetchDefault(papel, tipodoc);
    this._selectedId = null;
    this._editorTab = 'visual';
    this._draft = {
      ...this.emptyDraft(),
      TIPODOC: tipodoc,
      PAPEL: papel,
      NOMBRE: def.NOMBRE || 'Ticket FEL — Factura electrónica',
      HTML: def.HTML || '',
      CSS: def.CSS || '',
      ES_DEFAULT: true,
    };
    this.goToDesigner();
  },

  async onCargarDefault() {
    const d = this.readDraftFromDom();
    const def = await this.fetchDefault(d.PAPEL, d.TIPODOC);
    const htmlEl = this._container?.querySelector('#fi-html');
    const cssEl = this._container?.querySelector('#fi-css');
    if (htmlEl) htmlEl.value = def.HTML || '';
    if (cssEl) cssEl.value = def.CSS || '';
    if (!this._container?.querySelector('#fi-nombre')?.value) {
      const nom = this._container?.querySelector('#fi-nombre');
      if (nom) nom.value = def.NOMBRE || '';
    }
    if (this._editorTab === 'visual') this.loadDesignFrame();
    F.toast('Default del sistema cargado en el editor', 'info');
  },

  async onGuardar() {
    const d = this.readDraftFromDom();
    if (!d.TIPODOC) {
      F.toast('Seleccione un TIPODOC', 'warning');
      return;
    }
    if (!d.HTML.trim()) {
      F.toast('El HTML es obligatorio', 'warning');
      return;
    }
    if (!d.NOMBRE) d.NOMBRE = `Formato ${d.TIPODOC} ${d.PAPEL}`;
    const payload = {
      TIPODOC: d.TIPODOC,
      PAPEL: d.PAPEL,
      NOMBRE: d.NOMBRE,
      HTML: d.HTML,
      CSS: d.CSS,
      ACTIVO: d.ACTIVO,
      USUARIO: this.usuario(),
    };
    if (d.ID) {
      await F.fetchJson(this.apiUrl(`/${d.ID}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      F.toast('Formato actualizado', 'success');
      await this.fetchList();
      const data = await F.fetchJson(this.apiUrl(`/${d.ID}`), { cache: 'no-store' });
      this._selectedId = data.ID;
      this._draft = { ...data, ES_DEFAULT: false };
      this.goToDesigner();
    } else {
      const res = await F.fetchJson(this.apiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      F.toast('Formato creado', 'success');
      await this.fetchList();
      if (res.ID) {
        const data = await F.fetchJson(this.apiUrl(`/${res.ID}`), { cache: 'no-store' });
        this._selectedId = data.ID;
        this._draft = { ...data, ES_DEFAULT: false };
        this.goToDesigner();
      }
    }
  },

  async onEliminar() {
    const d = this._draft;
    if (!d?.ID) return;
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Eliminar formato?',
      html: `<p class="mb-0">Se eliminará el formato <strong>${this.escapeHtml(d.TIPODOC)} / ${this.escapeHtml(d.PAPEL)}</strong>. La impresión volverá al default del sistema.</p>`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!ok) return;
    await F.fetchJson(this.apiUrl(`/${d.ID}`), { method: 'DELETE' });
    F.toast('Formato eliminado', 'success');
    await this.fetchList();
    this.goToList();
  },

  closePreviewModal() {
    const root = this._container?.querySelector('#fi-preview-modal-root');
    if (root) root.innerHTML = '';
    this._previewHtml = null;
  },

  showPreviewModal(html, papel) {
    const root = this._container?.querySelector('#fi-preview-modal-root');
    if (!root) return;
    this._previewHtml = html;
    const isTicket = String(papel).toUpperCase() === 'TICKET';
    const width = isTicket ? 302 : 794;
    root.innerHTML = `
      <div class="fi-preview-overlay" id="fi-preview-overlay" role="dialog" aria-modal="true" aria-label="Vista previa al 100%">
        <div class="fi-preview-dialog">
          <div class="fi-preview-header">
            <div>
              <strong>Vista previa</strong>
              <span class="badge text-bg-success ms-2">Zoom 100%</span>
              <span class="small text-muted ms-2">${isTicket ? 'Ticket 80mm' : 'Carta A4'} · ${width}px</span>
            </div>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary" id="fi-preview-print">
                <i class="fa-solid fa-print me-1"></i>Imprimir
              </button>
              <button type="button" class="btn btn-sm btn-light" id="fi-preview-close" aria-label="Cerrar">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
          <div class="fi-preview-body">
            <div class="fi-preview-sheet ${isTicket ? 'fi-preview-sheet--ticket' : 'fi-preview-sheet--carta'}" style="width:${width}px">
              <iframe id="fi-preview-frame" class="fi-preview-frame" title="Vista previa 100%"
                style="width:${width}px;zoom:1;transform:none"></iframe>
            </div>
          </div>
        </div>
      </div>`;
    const frame = root.querySelector('#fi-preview-frame');
    if (frame) {
      frame.onload = () => {
        try {
          const doc = frame.contentDocument;
          if (!doc) return;
          doc.documentElement.style.zoom = '1';
          doc.body.style.zoom = '1';
          doc.body.style.transform = 'none';
          const h = Math.max(900, (doc.body?.scrollHeight || 0) + 48);
          frame.style.height = `${h}px`;
          frame.style.zoom = '1';
          frame.style.transform = 'none';
        } catch {
          /* ignore */
        }
      };
      frame.srcdoc = html;
    }
    root.querySelector('#fi-preview-close')?.addEventListener('click', () => this.closePreviewModal());
    root.querySelector('#fi-preview-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'fi-preview-overlay') this.closePreviewModal();
    });
    root.querySelector('#fi-preview-print')?.addEventListener('click', () => {
      if (typeof PrintReport !== 'undefined' && this._previewHtml) {
        PrintReport.openAndPrint(
          this._previewHtml,
          PrintReport.maximizedFeatures ? PrintReport.maximizedFeatures() : undefined,
          { ticket: isTicket, papel: isTicket ? 'TICKET' : 'CARTA' }
        ).catch(() => {
          const w = frame?.contentWindow;
          if (w) {
            w.focus();
            w.print();
          }
        });
        return;
      }
      const w = frame?.contentWindow;
      if (w) {
        w.focus();
        w.print();
      }
    });
  },

  async onPreview() {
    const d = this.readDraftFromDom();
    await PrintReport.ensureLogo();
    const data = await F.fetchJson(this.apiUrl('/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        HTML: d.HTML,
        CSS: d.CSS,
        papel: d.PAPEL,
        logoUrl: PrintReport.getLogoDataUrl() || undefined,
      }),
    });
    if (!data?.html) {
      F.toast('No se pudo generar la vista previa', 'warning');
      return;
    }
    this.showPreviewModal(data.html, d.PAPEL);
  },

  execDesignCommand(cmd, value = null) {
    const frame = this._container?.querySelector('#fi-design-frame');
    const doc = frame?.contentDocument;
    if (!doc) return;
    doc.body.focus();
    try {
      doc.execCommand(cmd, false, value);
    } catch {
      /* ignore */
    }
  },

  insertIntoDesign(htmlSnippet) {
    const frame = this._container?.querySelector('#fi-design-frame');
    const doc = frame?.contentDocument;
    if (!doc || typeof FormatoImpresionDesigner === 'undefined') return;
    const designHtml = FormatoImpresionDesigner.htmlToDesign(htmlSnippet);
    doc.body.focus();
    try {
      doc.execCommand('insertHTML', false, designHtml);
    } catch {
      doc.body.insertAdjacentHTML('beforeend', designHtml);
    }
  },

  bindListEvents() {
    this._container?.querySelectorAll('.fi-btn-editar').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = Number(btn.getAttribute('data-id'));
        this.selectRow(id).catch((err) => F.toast(err.message, 'error'));
      });
    });
    this._container?.querySelectorAll('.fi-list-row').forEach((row) => {
      row.addEventListener('dblclick', () => {
        const id = Number(row.getAttribute('data-id'));
        this.selectRow(id).catch((err) => F.toast(err.message, 'error'));
      });
    });
  },

  bindEditorEvents() {
    this._container?.querySelector('#fi-btn-atras')?.addEventListener('click', () => {
      this.goToList();
    });
    this._container?.querySelector('#fi-tab-visual')?.addEventListener('click', () => this.setEditorTab('visual'));
    this._container?.querySelector('#fi-tab-codigo')?.addEventListener('click', () => this.setEditorTab('codigo'));

    this._container?.querySelector('#fi-btn-guardar')?.addEventListener('click', () => {
      this.onGuardar().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#fi-btn-preview')?.addEventListener('click', () => {
      this.onPreview().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#fi-btn-cargar-default')?.addEventListener('click', () => {
      this.onCargarDefault().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#fi-btn-eliminar')?.addEventListener('click', () => {
      this.onEliminar().catch((err) => F.toast(err.message, 'error'));
    });

    this._container?.querySelector('#fi-papel')?.addEventListener('change', () => {
      if (this._editorTab === 'visual') this.loadDesignFrame();
    });

    this._container?.querySelector('#fi-css')?.addEventListener('change', () => {
      if (this._editorTab === 'visual') {
        this.syncVisualToTextarea();
        this.loadDesignFrame();
      }
    });

    this._container?.querySelectorAll('.fi-visual-toolbar [data-cmd]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.execDesignCommand(btn.getAttribute('data-cmd'));
      });
    });

    this._container?.querySelector('.fi-font-size')?.addEventListener('change', (e) => {
      const v = e.target.value;
      if (!v) return;
      this.execDesignCommand('fontSize', v);
      e.target.value = '';
    });

    const varSel = this._container?.querySelector('.fi-insert-var');
    if (varSel && typeof FormatoImpresionDesigner !== 'undefined') {
      FormatoImpresionDesigner.fillVarSelect(varSel, this._variables);
      varSel.addEventListener('change', () => {
        const v = varSel.value;
        if (!v) return;
        this.insertIntoDesign(`{{${v}}}`);
        varSel.value = '';
      });
    }

    this._container?.querySelector('.fi-insert-block')?.addEventListener('change', (e) => {
      const id = e.target.value;
      if (!id || typeof FormatoImpresionDesigner === 'undefined') return;
      const block = FormatoImpresionDesigner.BLOCKS.find((b) => b.id === id);
      if (block) this.insertIntoDesign(block.html);
      e.target.value = '';
    });

    this._container?.querySelector('.fi-insert-field-type')?.addEventListener('change', (e) => {
      const id = e.target.value;
      if (!id || typeof FormatoImpresionDesigner === 'undefined') return;
      const field = FormatoImpresionDesigner.FIELD_TYPES.find((f) => f.id === id);
      const html = field?.insertHtml || '';
      e.target.value = '';
      if (!html) return;
      if (this._editorTab === 'visual') {
        this.insertIntoDesign(html);
        return;
      }
      const ta = this._container?.querySelector('#fi-html');
      if (!ta) return;
      const start = ta.selectionStart || 0;
      const end = ta.selectionEnd || 0;
      const text = ta.value;
      ta.value = text.slice(0, start) + html + text.slice(end);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + html.length;
    });

    this._container?.querySelectorAll('.fi-var-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.getAttribute('data-var') || '';
        const insert =
          v.includes('LINES') && !v.startsWith('{{') ? `{{#LINES}}\n  \n{{/LINES}}` : `{{${v}}}`;
        if (this._editorTab === 'visual') {
          this.insertIntoDesign(insert);
          return;
        }
        const ta = this._container?.querySelector('#fi-html');
        if (!ta) return;
        const start = ta.selectionStart || 0;
        const end = ta.selectionEnd || 0;
        const text = ta.value;
        ta.value = text.slice(0, start) + insert + text.slice(end);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + insert.length;
      });
    });
  },

  bindEvents() {
    this._container?.querySelector('#fi-btn-refresh')?.addEventListener('click', () => {
      this.fetchList()
        .then(() => this.refreshList())
        .catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#fi-btn-nuevo')?.addEventListener('click', () => {
      this.onNuevo().catch((err) => F.toast(err.message, 'error'));
    });
    this.bindListEvents();
    if (this._screen === 'designer') this.bindEditorEvents();
  },

  async load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'flex-column', 'p-3');

    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese de nuevo.
        </div>`;
      return;
    }

    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando formatos…</div>`;
    try {
      const results = await Promise.allSettled([
        this.fetchTipodocs(),
        this.fetchList(),
        this.fetchVariables(),
      ]);
      if (results[1].status === 'rejected') {
        const reason = results[1].reason;
        throw reason instanceof Error ? reason : new Error(String(reason?.message || reason || 'No se pudo cargar el listado'));
      }
      this._tipodocs = results[0].status === 'fulfilled' ? this._tipodocs : [];
      this._variables = results[2].status === 'fulfilled' ? this._variables : this._variables || [];
      this._draft = null;
      this._selectedId = null;
      this._editorTab = 'visual';
      this._screen = 'list';
      container.innerHTML = this.render();
      this.bindEvents();
      results.forEach((r, i) => {
        if (r.status === 'rejected') console.warn('[FormatosImpresion] fetch', i, r.reason);
      });
    } catch (err) {
      const msg = err?.message || String(err) || 'Error al cargar formatos de impresión';
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(msg)}
        </div>`;
    }
  },
};
