/**
 * Vista Vehículos — CRUD sobre dbo.VEHICULOS filtrado por EMPNIT.
 */
const VEHICULOS_TIPO_OPTIONS = [
  { value: 'SEDAN', label: 'SEDAN' },
  { value: 'PICKUP', label: 'PICKUP' },
  { value: 'CABEZAL', label: 'CABEZAL' },
  { value: 'PLATAFORMA', label: 'PLATAFORMA' },
];

const VEHICULOS_FORM_FIELDS = [
  { key: 'CODVEHICULO', label: 'Código', type: 'number', readonlyOnEdit: true, hideOnNew: true },
  { key: 'PLACA', label: 'Placa', required: true },
  { key: 'TIPO', label: 'Tipo', type: 'select', required: true, options: VEHICULOS_TIPO_OPTIONS },
  { key: 'DESCRIPCION', label: 'Descripción' },
  { key: 'MARCA', label: 'Marca' },
  { key: 'LINEA', label: 'Línea' },
  { key: 'MODELO', label: 'Modelo (año)', type: 'number' },
  { key: 'CHASIS', label: 'Chasis' },
  { key: 'MOTOR', label: 'Motor' },
  { key: 'KILOMETRAJE_INICIAL', label: 'Kilometraje inicial', type: 'number', step: '0.01' },
  { key: 'KILOMETRAJE_ACTUAL', label: 'Kilometraje actual', type: 'number', step: '0.01' },
  { key: 'F_ACEITE', label: 'Fecha aceite', type: 'date' },
  { key: 'F_SERVICIO', label: 'Fecha servicio', type: 'date' },
];

function vehiculosMapFormToApi(data) {
  const toNum = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    PLACA: String(data.PLACA || '').trim().toUpperCase(),
    TIPO: data.TIPO,
    DESCRIPCION: data.DESCRIPCION || null,
    MARCA: data.MARCA || null,
    LINEA: data.LINEA || null,
    MODELO: toNum(data.MODELO),
    CHASIS: data.CHASIS || null,
    MOTOR: data.MOTOR || null,
    KILOMETRAJE_INICIAL: toNum(data.KILOMETRAJE_INICIAL),
    KILOMETRAJE_ACTUAL: toNum(data.KILOMETRAJE_ACTUAL),
    F_ACEITE: data.F_ACEITE || null,
    F_SERVICIO: data.F_SERVICIO || null,
    FOTO: data.FOTO === undefined ? null : data.FOTO,
  };
}

function vehiculosValidateForm(data) {
  if (!data.PLACA) return 'La placa es obligatoria';
  if (!data.TIPO) return 'Seleccione el tipo de vehículo';
  const tipo = String(data.TIPO).trim().toUpperCase();
  if (!VEHICULOS_TIPO_OPTIONS.some((o) => o.value === tipo)) {
    return 'TIPO debe ser SEDAN, PICKUP, CABEZAL o PLATAFORMA';
  }
  return null;
}

const VehiculosViewBase = createCatalogoEmpresaView({
  slug: 'vehiculos',
  apiPath: '/api/vehiculos',
  icon: 'fa-car',
  labelSingular: 'vehículo',
  labelPlural: 'vehículo(s)',
  viewTitle: 'Vehículos',
  idKey: 'CODVEHICULO',
  dataAttr: 'codvehiculo',
  formWidth: 680,
  searchPlaceholder: 'Buscar por placa, descripción, marca, tipo, titular…',
  searchKeys: [
    'CODVEHICULO',
    'PLACA',
    'DESCRIPCION',
    'MARCA',
    'LINEA',
    'TIPO',
    'TITULAR',
    'CHASIS',
    'MOTOR',
    'NIT',
  ],
  formFields: VEHICULOS_FORM_FIELDS,
  createKeys: [
    'PLACA',
    'TIPO',
    'DESCRIPCION',
    'MARCA',
    'LINEA',
    'MODELO',
    'CHASIS',
    'MOTOR',
    'KILOMETRAJE_INICIAL',
    'KILOMETRAJE_ACTUAL',
    'F_ACEITE',
    'F_SERVICIO',
    'FOTO',
  ],
  updateKeys: [
    'PLACA',
    'TIPO',
    'DESCRIPCION',
    'MARCA',
    'LINEA',
    'MODELO',
    'CHASIS',
    'MOTOR',
    'KILOMETRAJE_INICIAL',
    'KILOMETRAJE_ACTUAL',
    'F_ACEITE',
    'F_SERVICIO',
    'FOTO',
  ],
  allowEmpty: [
    'DESCRIPCION',
    'MARCA',
    'LINEA',
    'MODELO',
    'CHASIS',
    'MOTOR',
    'KILOMETRAJE_INICIAL',
    'KILOMETRAJE_ACTUAL',
    'F_ACEITE',
    'F_SERVICIO',
    'FOTO',
  ],
  mapFormToApi: vehiculosMapFormToApi,
  validateForm: vehiculosValidateForm,
  tableColumns: [
    { key: 'PLACA', label: 'Placa' },
    { key: 'TIPO', label: 'Tipo' },
    { key: 'DESCRIPCION', label: 'Descripción' },
    { key: 'MARCA', label: 'Marca' },
    { key: 'LINEA', label: 'Línea' },
    { key: 'MODELO', label: 'Modelo', type: 'number' },
    { key: 'KILOMETRAJE_ACTUAL', label: 'Km actual', type: 'number' },
  ],
  getRowLabel(row) {
    return row?.PLACA || row?.DESCRIPCION || '';
  },
});

const VehiculosView = {
  ...VehiculosViewBase,

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatKm(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-GT', { maximumFractionDigits: 2 });
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).slice(0, 10);
    const [y, m, day] = s.split('-');
    if (day && m && y) return `${day}/${m}/${y}`;
    return s;
  },

  vehiculoHistorialLabel(row) {
    const placa = row?.PLACA || '';
    const extra = [row?.DESCRIPCION, row?.MARCA, row?.LINEA].filter(Boolean).join(' · ');
    if (placa && extra) return `${placa} — ${extra}`;
    return placa || extra || `Vehículo #${row?.CODVEHICULO ?? ''}`;
  },

  accionesRowHtml(id) {
    return `<div class="catalogo-acciones d-flex flex-wrap justify-content-end gap-1">
      <button type="button" class="btn btn-sm btn-outline-secondary btn-vehiculo-historial" data-codvehiculo="${this.escapeHtml(id)}" title="Historial">
        <i class="fa-solid fa-clock-rotate-left"></i> Historial
      </button>
      ${CatalogosUI.btnEditar(id, 'codvehiculo')}
      ${CatalogosUI.btnEliminar(id, 'codvehiculo')}
    </div>`;
  },

  renderTableBodyHtml(rows) {
    const colSpan = 8;
    const cols = [
      { key: 'PLACA', label: 'Placa' },
      { key: 'TIPO', label: 'Tipo' },
      { key: 'DESCRIPCION', label: 'Descripción' },
      { key: 'MARCA', label: 'Marca' },
      { key: 'LINEA', label: 'Línea' },
      { key: 'MODELO', label: 'Modelo', type: 'number' },
      { key: 'KILOMETRAJE_ACTUAL', label: 'Km actual', type: 'number' },
    ];
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún registro coincide con la búsqueda'
        : 'Sin registros';
      return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const cells = cols
          .map((c) => `<td>${this.formatCell(row[c.key], c)}</td>`)
          .join('');
        return `<tr>${cells}<td class="text-end">${this.accionesRowHtml(row.CODVEHICULO)}</td></tr>`;
      })
      .join('');
  },

  updateTableView() {
    const filtered = this.getFilteredRows();
    const tbody = this._container?.querySelector('#vehiculos-tbody');
    const badge = this._container?.querySelector('#vehiculos-count');
    if (tbody) {
      tbody.innerHTML = this.renderTableBodyHtml(filtered);
      this.bindRowActions();
    }
    if (badge) badge.innerHTML = this.badgeText(filtered.length, this._rows.length);
  },

  bindRowActions() {
    this._container?.querySelectorAll('.btn-catalogo-editar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEditar(btn.dataset.codvehiculo));
    });
    this._container?.querySelectorAll('.btn-catalogo-eliminar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEliminar(btn.dataset.codvehiculo));
    });
    this._container?.querySelectorAll('.btn-vehiculo-historial').forEach((btn) => {
      btn.addEventListener('click', () => this.onHistorial(btn.dataset.codvehiculo));
    });
  },

  async fetchHistorial(codvehiculo) {
    return F.fetchJson(
      `${this.apiBase(`/${encodeURIComponent(codvehiculo)}/historial`)}&_=${Date.now()}`,
      { cache: 'no-store' }
    );
  },

  async imprimirHistorial(data) {
    if (typeof PrintReport === 'undefined') {
      F.toast('Impresión no disponible', 'warning');
      return;
    }
    const v = data.vehiculo || {};
    const vehLabel = this.vehiculoHistorialLabel(v);
    const hoy = this.formatFecha(new Date().toISOString());

    const kmRows = (data.kilometrajes || [])
      .map(
        (r) => `<tr>
          <td>${PrintReport.escapeHtml(this.formatFecha(r.FECHA))}</td>
          <td>${PrintReport.escapeHtml(r.NOMEMPLEADO || '—')}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatKm(r.KMS_INICIAL))}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatKm(r.KMS_FINAL))}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatKm(r.KMS_RECORRIDO))}</td>
          <td class="text-center">${PrintReport.escapeHtml(r.TIPO_COMBUSTIBLE || '—')}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(r.IMPORTE_COMBUSTIBLE))}</td>
        </tr>`
      )
      .join('');

    const mecRows = (data.mecanica || [])
      .map(
        (r) => `<tr>
          <td>${PrintReport.escapeHtml(this.formatFecha(r.FECHA))}</td>
          <td>${PrintReport.escapeHtml(String(r.FALLA_REPORTADA || '—').slice(0, 120))}</td>
          <td>${PrintReport.escapeHtml(String(r.SERVICIO_REALIZADO || '—').slice(0, 120))}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(r.IMPORTE))}</td>
        </tr>`
      )
      .join('');

    const bodyHtml = `
      ${PrintReport.reportHeaderHtml({
        title: 'Historial del vehículo',
        subtitleHtml: `
          <p><strong>Vehículo:</strong> ${PrintReport.escapeHtml(vehLabel)}</p>
          <p><strong>Km actual:</strong> ${PrintReport.escapeHtml(this.formatKm(v.KILOMETRAJE_ACTUAL))}</p>
          <p><strong>Fecha reporte:</strong> ${PrintReport.escapeHtml(hoy)}</p>
        `,
      })}
      <section class="vh-report-section">
        <h2 class="vh-report-title">Kilometrajes (${(data.kilometrajes || []).length})</h2>
        <table class="vh-report-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Empleado</th>
              <th class="text-end">Km ini.</th>
              <th class="text-end">Km fin.</th>
              <th class="text-end">Km rec.</th>
              <th class="text-center">Combustible</th>
              <th class="text-end">Importe</th>
            </tr>
          </thead>
          <tbody>${kmRows || '<tr><td colspan="7" class="text-center text-muted">Sin registros</td></tr>'}</tbody>
        </table>
      </section>
      <section class="vh-report-section">
        <h2 class="vh-report-title">Servicio mecánica (${(data.mecanica || []).length})</h2>
        <table class="vh-report-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Falla reportada</th>
              <th>Servicio realizado</th>
              <th class="text-end">Importe</th>
            </tr>
          </thead>
          <tbody>${mecRows || '<tr><td colspan="4" class="text-center text-muted">Sin registros</td></tr>'}</tbody>
        </table>
      </section>`;

    await PrintReport.openAndPrint(
      () =>
        PrintReport.wrapDocument({
          title: `Historial — ${vehLabel}`,
          bodyHtml,
          extraStyles: `
        .vh-report-section{margin-bottom:1.25rem;page-break-inside:avoid}
        .vh-report-title{font-size:13px;margin:0 0 .35rem;padding:.35rem .5rem;background:#f0f0f0;border:1px solid #ccc}
        .vh-report-table{width:100%;border-collapse:collapse;font-size:11px}
        .vh-report-table th,.vh-report-table td{padding:4px 6px;border:1px solid #ddd}
      `,
        }),
      'width=900,height=700'
    );
  },

  async onHistorial(id) {
    try {
      const data = await this.fetchHistorial(id);
      if (!(data.kilometrajes || []).length && !(data.mecanica || []).length) {
        F.toast('Sin registros de historial para este vehículo', 'warning');
        return;
      }
      await this.imprimirHistorial(data);
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo cargar el historial', 'error');
    }
  },

  todayIsoDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  fieldDef(key) {
    return VEHICULOS_FORM_FIELDS.find((f) => f.key === key);
  },

  fotoFieldHtml(isEdit = false) {
    const quitarBtn = isEdit
      ? `<button type="button" class="btn btn-sm btn-outline-danger d-none mt-2" id="vehiculo-foto-quitar">
          <i class="fa-solid fa-trash-can me-1"></i>Quitar foto
        </button>`
      : '';
    return `
      <div class="mb-2 vehiculo-foto-field">
        <label class="form-label small mb-0" for="vehiculo-foto-file">Foto del vehículo</label>
        <input type="file" class="form-control form-control-sm" id="vehiculo-foto-file"
          accept="image/png,image/jpeg,image/gif,image/webp">
        <input type="hidden" name="FOTO" id="vehiculo-foto-hex" value="">
        <div class="vehiculo-foto-preview mt-2" id="vehiculo-foto-preview" aria-live="polite"></div>
        ${quitarBtn}
      </div>`;
  },

  renderFotoPreview(hex) {
    const preview = document.getElementById('vehiculo-foto-preview');
    const hexInput = document.getElementById('vehiculo-foto-hex');
    const quitarBtn = document.getElementById('vehiculo-foto-quitar');
    if (!preview) return;
    if (!hex) {
      preview.innerHTML = '<span class="small text-muted">Sin foto</span>';
      if (hexInput) hexInput.value = '';
      if (quitarBtn) quitarBtn.classList.add('d-none');
      return;
    }
    const mime = typeof EmpresaLogo !== 'undefined' ? EmpresaLogo.detectMime(hex) : 'image/png';
    const dataUrl = typeof EmpresaLogo !== 'undefined' ? EmpresaLogo.hexToDataUrl(hex, mime) : null;
    if (!dataUrl) {
      preview.innerHTML = '<span class="small text-muted">Foto no válida</span>';
      if (hexInput) hexInput.value = '';
      if (quitarBtn) quitarBtn.classList.add('d-none');
      return;
    }
    preview.innerHTML = `<img src="${dataUrl}" alt="Vista previa vehículo" class="vehiculo-foto-preview-img">`;
    if (hexInput) hexInput.value = hex;
    if (quitarBtn) quitarBtn.classList.remove('d-none');
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

  bindFotoField(existingHex = '', isEdit = false) {
    const fileInput = document.getElementById('vehiculo-foto-file');
    const quitarBtn = document.getElementById('vehiculo-foto-quitar');
    if (existingHex) this.renderFotoPreview(String(existingHex));
    else this.renderFotoPreview('');

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const hex = await this.fileToHex(file);
        this.renderFotoPreview(hex);
      } catch (err) {
        fileInput.value = '';
        Swal.showValidationMessage(err.message || 'No se pudo leer la imagen');
      }
    });

    quitarBtn?.addEventListener('click', () => {
      if (fileInput) fileInput.value = '';
      this.renderFotoPreview('');
    });
  },

  readFotoFromForm(data) {
    const hexInput = document.getElementById('vehiculo-foto-hex');
    const hex = hexInput?.value?.trim();
    data.FOTO = hex || null;
    return data;
  },

  buildFormHtml(row = {}, isEdit = false) {
    const today = this.todayIsoDate();
    const formRow = { ...row };
    if (!isEdit) {
      if (!formRow.F_ACEITE) formRow.F_ACEITE = today;
      if (!formRow.F_SERVICIO) formRow.F_SERVICIO = today;
    }

    const field = (key) => this.fieldHtml(this.fieldDef(key), formRow, isEdit);

    const pair = (key1, key2) => {
      const html1 = field(key1);
      const html2 = field(key2);
      if (!html1 && !html2) return '';
      return `
        <div class="row g-2 mb-2">
          <div class="col-6">${html1 || ''}</div>
          <div class="col-6">${html2 || ''}</div>
        </div>`;
    };

    return `
      ${this.fotoFieldHtml(isEdit)}
      ${pair('PLACA', 'TIPO')}
      ${pair('DESCRIPCION', 'MARCA')}
      ${pair('LINEA', 'MODELO')}
      ${pair('CHASIS', 'MOTOR')}
      ${pair('KILOMETRAJE_INICIAL', 'KILOMETRAJE_ACTUAL')}
      ${pair('F_ACEITE', 'F_SERVICIO')}
    `;
  },

  readFormData() {
    const data = {};
    VEHICULOS_FORM_FIELDS.forEach((fieldDef) => {
      const input = document.querySelector(`.swal2-html-container [name="${fieldDef.key}"]`);
      if (!input) return;
      data[fieldDef.key] = input.value.trim();
    });
    return data;
  },

  async persistForm(payload, isEdit, id) {
    if (isEdit) {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return;
    }
    await F.fetchJson(this.apiBase(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async showForm(title, row = {}, isEdit = false, id = null) {
    const view = this;
    const existingHex = row.FOTO || '';
    return CatalogosUI.fireForm({
      title,
      html: view.buildFormHtml(row, isEdit),
      width: 680,
      didOpen: () => view.bindFotoField(existingHex, isEdit),
      preConfirm: async () => {
        const data = view.readFormData();
        view.readFotoFromForm(data);
        const err = vehiculosValidateForm(data);
        if (err) {
          Swal.showValidationMessage(err);
          return false;
        }
        const payload = vehiculosMapFormToApi(data);
        Swal.showLoading();
        Swal.getCancelButton()?.setAttribute('disabled', 'true');
        try {
          await view.persistForm(payload, isEdit, id);
          return payload;
        } catch (e) {
          Swal.hideLoading();
          Swal.getCancelButton()?.removeAttribute('disabled');
          Swal.showValidationMessage(e.message || 'Error al guardar');
          return false;
        }
      },
    });
  },

  async onNuevo() {
    const data = await this.showForm('Nuevo vehículo');
    if (!data) return;
    F.toast('Vehículo creado', 'success');
    await this.load(this._container);
  },

  async onEditar(id) {
    let row = this.findRow(id);
    try {
      row = await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`) + `&_=${Date.now()}`, {
        cache: 'no-store',
      });
    } catch (err) {
      F.alert('Error', err.message, 'error');
      return;
    }
    const data = await this.showForm('Editar vehículo', row, true, id);
    if (!data) return;
    F.toast('Vehículo actualizado', 'success');
    await this.load(this._container);
  },

  async onEliminar(id) {
    const row = this.findRow(id);
    const nombre = this.rowLabel(row, id);
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Eliminar vehículo?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(nombre)}</strong></p>`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!confirm) return;
    const pass = await CatalogosUI.solicitarClaveAdmin({
      title: 'Autorizar eliminación',
      text: 'Ingrese la clave de administrador para eliminar el vehículo.',
      confirmText: 'Eliminar',
    });
    if (!pass) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), { method: 'DELETE' });
      F.toast('Vehículo eliminado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },
};
