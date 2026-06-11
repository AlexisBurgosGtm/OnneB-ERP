/**
 * Vista Empresas — CRUD sobre dbo.Empresas
 */
const EmpresasView = {
  _container: null,
  _rows: [],

  tipoEmpresaOptions: [
    { value: '1', label: 'PRINCIPAL' },
    { value: '2', label: 'SUCURSAL' },
  ],

  formFields: [
    { key: 'EMPNIT', label: 'NIT', required: true, type: 'text' },
    { key: 'EMPNOMBRE', label: 'Nombre', type: 'text' },
    { key: 'EMPRAZONSOCIAL', label: 'Razón social', type: 'text' },
    { key: 'EMPDIRECCION', label: 'Dirección', type: 'text' },
    { key: 'EMPTELEFONO', label: 'Teléfono', type: 'text' },
    { key: 'EMPEMAIL', label: 'Email', type: 'email' },
    { key: 'EMPCONTACTO', label: 'Contacto', type: 'text' },
    { key: 'EMPTELCONTACTO', label: 'Tel. contacto', type: 'text' },
    {
      key: 'CODTIPOEMPRESA',
      label: 'Tipo empresa',
      type: 'select',
      options: null,
    },
    { key: 'OBJETIVO', label: 'Objetivo', type: 'number', step: '0.01' },
    { key: 'PRESUPUESTO', label: 'Presupuesto', type: 'number', step: '0.01' },
  ],

  tableColumns: [
    { key: 'EMPNIT', label: 'NIT' },
    { key: 'EMPNOMBRE', label: 'Nombre' },
    { key: 'EMPRAZONSOCIAL', label: 'Razón social' },
    { key: 'EMPTELEFONO', label: 'Teléfono' },
    { key: 'EMPEMAIL', label: 'Email' },
    { key: 'CODTIPOEMPRESA', label: 'Tipo' },
  ],

  labelTipoEmpresa(value) {
    const v = value === null || value === undefined ? '' : String(value);
    const opt = this.tipoEmpresaOptions.find((o) => o.value === v);
    return opt ? opt.label : '—';
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatCell(value, key) {
    if (key === 'CODTIPOEMPRESA') return this.escapeHtml(this.labelTipoEmpresa(value));
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'number') {
      return Number.isInteger(value)
        ? value
        : value.toLocaleString('es-GT', { maximumFractionDigits: 2 });
    }
    return this.escapeHtml(value);
  },

  fieldHtml(f, row, isEdit) {
    const req = f.required ? 'required' : '';
    const ro = isEdit && f.key === 'EMPNIT' ? 'readonly' : '';

    if (f.type === 'select') {
      const options = f.options || this.tipoEmpresaOptions;
      const val = row[f.key] !== null && row[f.key] !== undefined ? String(row[f.key]) : '';
      const optsHtml = options
        .map(
          (o) =>
            `<option value="${this.escapeHtml(o.value)}"${val === String(o.value) ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
        )
        .join('');
      return `
        <label class="form-label small mb-0">${this.escapeHtml(f.label)}</label>
        <select class="form-select form-select-sm" name="${f.key}" ${req}>
          <option value="">— Seleccione —</option>
          ${optsHtml}
        </select>
      `;
    }

    const val = row[f.key] ?? '';
    const step = f.step ? `step="${f.step}"` : '';
    return `
      <label class="form-label small mb-0">${this.escapeHtml(f.label)}</label>
      <input type="${f.type}" class="form-control form-control-sm" name="${f.key}"
        value="${this.escapeHtml(val)}" ${req} ${ro} ${step}>
    `;
  },

  buildFormHtml(row = {}, isEdit = false) {
    const f = (key) => this.formFields.find((x) => x.key === key);
    const single = (key) => {
      const field = f(key);
      return `<div class="mb-2">${this.fieldHtml(field, row, isEdit)}</div>`;
    };
    const pair = (key1, key2) => {
      const field1 = f(key1);
      const field2 = f(key2);
      return `
        <div class="row g-2 mb-2">
          <div class="col-6">${this.fieldHtml(field1, row, isEdit)}</div>
          <div class="col-6">${this.fieldHtml(field2, row, isEdit)}</div>
        </div>
      `;
    };

    return `
      ${single('EMPNIT')}
      ${single('EMPNOMBRE')}
      ${single('EMPRAZONSOCIAL')}
      ${single('EMPDIRECCION')}
      ${pair('EMPTELEFONO', 'EMPEMAIL')}
      ${pair('EMPCONTACTO', 'EMPTELCONTACTO')}
      ${single('CODTIPOEMPRESA')}
      ${pair('OBJETIVO', 'PRESUPUESTO')}
      ${this.logoFieldHtml()}
    `;
  },

  logoFieldHtml() {
    return `
      <div class="mb-2 empresa-logo-field">
        <label class="form-label small mb-0" for="empresa-logo-file">Logo empresa</label>
        <input type="file" class="form-control form-control-sm" id="empresa-logo-file"
          accept="image/png,image/jpeg,image/gif,image/webp">
        <input type="hidden" name="LOGO" id="empresa-logo-hex" value="">
        <div class="empresa-logo-preview mt-2" id="empresa-logo-preview" aria-live="polite"></div>
        <div class="form-check mt-1 d-none" id="empresa-logo-clear-wrap">
          <input type="checkbox" class="form-check-input" id="empresa-logo-clear">
          <label class="form-check-label small" for="empresa-logo-clear">Quitar logo</label>
        </div>
      </div>
    `;
  },

  renderLogoPreview(hex) {
    const preview = document.getElementById('empresa-logo-preview');
    const clearWrap = document.getElementById('empresa-logo-clear-wrap');
    const hexInput = document.getElementById('empresa-logo-hex');
    const clearCheck = document.getElementById('empresa-logo-clear');
    if (!preview) return;
    if (clearCheck) clearCheck.checked = false;
    if (!hex) {
      preview.innerHTML = '<span class="small text-muted">Sin logo</span>';
      if (hexInput) hexInput.value = '';
      if (clearWrap) clearWrap.classList.add('d-none');
      return;
    }
    const dataUrl = EmpresaLogo.hexToDataUrl(hex, EmpresaLogo.detectMime(hex));
    if (!dataUrl) {
      preview.innerHTML = '<span class="small text-muted">Logo no válido</span>';
      return;
    }
    preview.innerHTML = `<img src="${dataUrl}" alt="Vista previa logo" class="empresa-logo-preview-img">`;
    if (hexInput) hexInput.value = hex;
    if (clearWrap) clearWrap.classList.remove('d-none');
  },

  async fileToHex(file) {
    const maxBytes = 512 * 1024;
    if (file.size > maxBytes) {
      throw new Error('La imagen no debe superar 512 KB');
    }
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let hex = '';
    for (let i = 0; i < bytes.length; i += 1) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex.toUpperCase();
  },

  bindLogoField(existingHex = '') {
    const fileInput = document.getElementById('empresa-logo-file');
    const clearCheck = document.getElementById('empresa-logo-clear');
    if (existingHex) this.renderLogoPreview(String(existingHex));
    else this.renderLogoPreview('');

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const hex = await this.fileToHex(file);
        this.renderLogoPreview(hex);
      } catch (err) {
        fileInput.value = '';
        Swal.showValidationMessage(err.message || 'No se pudo leer la imagen');
      }
    });

    clearCheck?.addEventListener('change', () => {
      if (clearCheck.checked) {
        if (fileInput) fileInput.value = '';
        this.renderLogoPreview('');
        const hexInput = document.getElementById('empresa-logo-hex');
        if (hexInput) hexInput.value = '';
      }
    });
  },

  readLogoFromForm(data, isEdit) {
    const clearCheck = document.getElementById('empresa-logo-clear');
    const hexInput = document.getElementById('empresa-logo-hex');
    if (clearCheck?.checked) {
      data.LOGO = '';
      return data;
    }
    const hex = hexInput?.value?.trim();
    if (hex) data.LOGO = hex;
    else if (!isEdit) delete data.LOGO;
    return data;
  },

  readFormData() {
    const data = {};
    this.formFields.forEach((field) => {
      const input = document.querySelector(`.swal2-html-container [name="${field.key}"]`);
      if (!input) return;
      data[field.key] = input.value.trim();
    });
    return data;
  },

  async showForm(title, row = {}, isEdit = false) {
    const existingHex = row.LOGO || row.EMPLOGO || '';
    return CatalogosUI.fireForm({
      title,
      html: this.buildFormHtml(row, isEdit),
      width: 520,
      didOpen: () => this.bindLogoField(existingHex),
      preConfirm: () => {
        const data = this.readFormData();
        if (!data.EMPNIT) {
          Swal.showValidationMessage('El NIT es obligatorio');
          return false;
        }
        return this.readLogoFromForm(data, isEdit);
      },
    });
  },

  renderTable(rows) {
    const headers = [
      ...this.tableColumns.map((c) => `<th scope="col">${this.escapeHtml(c.label)}</th>`),
      '<th scope="col" class="text-end">Acciones</th>',
    ].join('');

    const colSpan = this.tableColumns.length + 1;

    const body = rows.length
      ? rows
          .map((row) => {
            const cells = this.tableColumns
              .map((c) => `<td>${this.formatCell(row[c.key], c.key)}</td>`)
              .join('');
            return `<tr>${cells}<td class="text-end">${CatalogosUI.accionesRow(row.EMPNIT)}</td></tr>`;
          })
          .join('')
      : `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">Sin registros</td></tr>`;

    return `
      <div class="empresas-panel catalogo-vista-wrap">
        <div class="d-flex justify-content-between align-items-center mb-2 px-1">
          <span class="empresas-badge"><i class="fa-solid fa-building me-1"></i>${rows.length} empresa(s)</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-empresas-refresh">
            <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
          </button>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped">
            <thead><tr>${headers}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-empresas-nuevo')}
      </div>
    `;
  },

  findRow(empnit) {
    return this._rows.find((r) => r.EMPNIT === empnit);
  },

  async onNuevo() {
    const data = await this.showForm('Nueva empresa');
    if (!data) return;
    try {
      await F.fetchJson('/api/empresas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Empresa creada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEditar(empnit) {
    let row = this.findRow(empnit);
    try {
      row = await F.fetchJson(`/api/empresas/${encodeURIComponent(empnit)}?_=${Date.now()}`);
    } catch (err) {
      F.alert('Error', err.message, 'error');
      return;
    }
    const data = await this.showForm('Editar empresa', row, true);
    if (!data) return;
    try {
      await F.fetchJson(`/api/empresas/${encodeURIComponent(empnit)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Empresa actualizada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEliminar(empnit) {
    const row = this.findRow(empnit);
    const nombre = row ? row.EMPNOMBRE || empnit : empnit;
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Eliminar empresa?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(nombre)}</strong> (${this.escapeHtml(empnit)})</p>`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!confirm) return;
    try {
      await F.fetchJson(`/api/empresas/${encodeURIComponent(empnit)}`, { method: 'DELETE' });
      F.toast('Empresa eliminada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  bindEvents() {
    document.getElementById('btn-empresas-refresh')?.addEventListener('click', () => this.load(this._container));
    document.getElementById('btn-empresas-nuevo')?.addEventListener('click', () => this.onNuevo());

    this._container.querySelectorAll('.btn-catalogo-editar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEditar(btn.dataset.empnit));
    });

    this._container.querySelectorAll('.btn-catalogo-eliminar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEliminar(btn.dataset.empnit));
    });
  },

  async load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');
    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando empresas…
      </div>
    `;

    try {
      const data = await F.fetchJson(`/api/empresas?_=${Date.now()}`, { cache: 'no-store' });
      this._rows = data.rows || [];
      container.innerHTML = this.renderTable(this._rows);
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          No se pudo cargar empresas: ${this.escapeHtml(err.message)}
        </div>
      `;
      F.toast('Error al cargar empresas', 'error');
    }
  },
};
