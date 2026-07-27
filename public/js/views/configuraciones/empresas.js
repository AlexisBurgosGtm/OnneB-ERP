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
            return `<tr>${cells}<td class="text-end">${this.accionesEmpresaHtml(row.EMPNIT)}</td></tr>`;
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

  accionesEmpresaHtml(empnit) {
    return `
      <div class="catalogo-acciones empresas-acciones">
        ${CatalogosUI.btnEditar(empnit)}
        <button type="button" class="btn btn-sm btn-outline-warning btn-empresas-cambiar-empnit"
          data-empnit="${this.escapeHtml(empnit)}" title="Cambiar EMPNIT">
          <i class="fa-solid fa-right-left me-1" aria-hidden="true"></i>Cambiar Empnit
        </button>
        ${CatalogosUI.btnEliminar(empnit)}
      </div>
    `;
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
      html: `
        <p class="mb-2">Se eliminarán todos los datos de <strong>${this.escapeHtml(nombre)}</strong>
        (<code>${this.escapeHtml(empnit)}</code>) en las tablas de la base de datos.</p>
        <p class="mb-0 small text-muted">Esta operación no se puede deshacer. Se pedirá clave de administrador.</p>
      `,
      icon: 'warning',
      confirmText: 'Continuar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!confirm) return;

    const pass = await CatalogosUI.solicitarClaveAdmin({
      title: 'Autorizar eliminación',
      text: 'Ingrese la clave de administrador para continuar.',
      confirmText: 'Continuar',
    });
    if (!pass) return;

    await this.mostrarModalEliminarEmpresa({ empnit, nombre, pass });
  },

  async mostrarModalEliminarEmpresa({ empnit, nombre, pass }) {
    const actual = String(empnit || '').trim();
    let running = false;
    let empresaEliminada = false;
    const tableCounts = new Map();

    const result = await Swal.fire({
      ...CatalogosUI.modalBase({
        customClass: { confirmButton: 'btn-modal-cancelar', cancelButton: 'btn-modal-cancelar' },
      }),
      title: 'Eliminar datos de empresa',
      width: 720,
      html: `
        <div class="text-start empresas-eliminar-datos">
          <p class="small mb-2">
            <strong>${this.escapeHtml(nombre)}</strong>
            (<code>${this.escapeHtml(actual)}</code>)
          </p>
          <div class="d-flex flex-wrap gap-2 mb-3">
            <button type="button" class="btn btn-sm btn-catalogo-eliminar" id="empresas-eliminar-todo" disabled>
              <i class="fa-solid fa-trash-can me-1"></i>Eliminar todo
            </button>
          </div>
          <div class="empresas-cambiar-empnit-progress" id="empresas-eliminar-progress">
            <div class="d-flex align-items-center gap-2 mb-2 small text-muted" id="empresas-eliminar-status">
              <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
              <span>Escaneando tablas…</span>
            </div>
            <div class="table-responsive empresas-eliminar-tablas-wrap">
              <table class="table table-sm table-striped mb-2 empresas-eliminar-tablas">
                <thead>
                  <tr>
                    <th>Tabla</th>
                    <th class="text-end" style="width:6rem">Registros</th>
                    <th class="text-end" style="width:7rem"></th>
                  </tr>
                </thead>
                <tbody id="empresas-eliminar-tbody">
                  <tr><td colspan="3" class="text-muted small">Cargando…</td></tr>
                </tbody>
              </table>
            </div>
            <div class="empresas-cambiar-empnit-log d-none" id="empresas-eliminar-log"></div>
          </div>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
      allowOutsideClick: () => !running,
      allowEscapeKey: () => !running,
      didOpen: () => {
        const tbody = document.getElementById('empresas-eliminar-tbody');
        const statusEl = document.getElementById('empresas-eliminar-status');
        const logEl = document.getElementById('empresas-eliminar-log');
        const btnTodo = document.getElementById('empresas-eliminar-todo');
        const cancelBtn = Swal.getCancelButton();

        const setStatus = (msg, spinning = true) => {
          if (!statusEl) return;
          statusEl.innerHTML = spinning
            ? `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>${this.escapeHtml(msg)}</span>`
            : `<i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i><span>${this.escapeHtml(msg)}</span>`;
        };

        const appendLog = (html) => {
          if (!logEl) return;
          logEl.classList.remove('d-none');
          logEl.insertAdjacentHTML('beforeend', html);
          logEl.scrollTop = logEl.scrollHeight;
        };

        const renderRow = (item) => {
          const key = `${item.schema}.${item.name}`;
          const count = item.ok === false ? '—' : Number(item.count) || 0;
          const errTip = item.error ? ` title="${this.escapeHtml(item.error)}"` : '';
          const disabled = running ? 'disabled' : '';
          const zeroClass = count === 0 ? 'text-muted' : '';
          return `
            <tr data-table-key="${this.escapeHtml(key)}" data-schema="${this.escapeHtml(item.schema)}" data-name="${this.escapeHtml(item.name)}">
              <td class="small"${errTip}>${this.escapeHtml(item.table || key)}</td>
              <td class="text-end small ${zeroClass} empresas-eliminar-count">${count}</td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-outline-danger empresas-eliminar-tabla-btn" ${disabled}
                  data-schema="${this.escapeHtml(item.schema)}" data-name="${this.escapeHtml(item.name)}">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </td>
            </tr>
          `;
        };

        const refreshTableButtons = () => {
          if (btnTodo) btnTodo.disabled = running;
          tbody?.querySelectorAll('.empresas-eliminar-tabla-btn').forEach((btn) => {
            btn.disabled = running;
          });
        };

        const updateRowCount = (schema, name, count) => {
          const key = `${schema}.${name}`;
          tableCounts.set(key, count);
          const tr = tbody?.querySelector(`tr[data-table-key="${key}"]`);
          if (!tr) return;
          const countEl = tr.querySelector('.empresas-eliminar-count');
          if (countEl) {
            countEl.textContent = String(count);
            countEl.classList.toggle('text-muted', count === 0);
          }
        };

        const runDelete = async ({ all, schema, name, tableLabel }) => {
          if (running) return;
          running = true;
          refreshTableButtons();
          if (cancelBtn) cancelBtn.disabled = true;

          try {
            setStatus(all ? 'Eliminando todas las tablas…' : `Eliminando ${tableLabel}…`);
            const summary = await this.ejecutarEliminarDatosStream({
              empnit: actual,
              pass,
              all,
              schema,
              name,
              onEvent: (evt) => {
                if (evt.type === 'status') {
                  setStatus(evt.message || 'Procesando…');
                  return;
                }
                if (evt.type === 'table-start') {
                  setStatus(`Tabla ${evt.index}/${evt.total}: ${evt.table}`);
                  return;
                }
                if (evt.type === 'table-done') {
                  if (evt.ok) {
                    updateRowCount(evt.schema, evt.name, 0);
                    appendLog(
                      `<div class="empresas-cambiar-empnit-log-ok"><i class="fa-solid fa-check me-1"></i>${this.escapeHtml(
                        evt.table
                      )} <span class="text-muted">(${Number(evt.rowsAffected) || 0} fila(s))</span></div>`
                    );
                  } else {
                    appendLog(
                      `<div class="empresas-cambiar-empnit-log-err"><i class="fa-solid fa-xmark me-1"></i>${this.escapeHtml(
                        evt.table
                      )}: ${this.escapeHtml(evt.error || 'Error')}</div>`
                    );
                  }
                }
              },
            });

            if (summary.empresaEliminada) {
              empresaEliminada = true;
            }

            setStatus(
              `Listo: ${summary.okCount || 0} ok · ${summary.failCount || 0} error(es)`,
              summary.failCount === 0
            );

            if (summary.failCount > 0) {
              F.toast(`Eliminación con ${summary.failCount} error(es)`, 'warning');
            } else if (summary.empresaEliminada) {
              F.toast('Empresa eliminada', 'success');
              Swal.close();
              if (typeof window.goToLogin === 'function') {
                window.goToLogin();
              }
            } else {
              F.toast('Registros eliminados', 'success');
            }
          } catch (err) {
            setStatus(err.message || 'Error', false);
            F.alert('Error', err.message, 'error');
          } finally {
            running = false;
            refreshTableButtons();
            if (cancelBtn && !empresaEliminada) cancelBtn.disabled = false;
          }
        };

        btnTodo?.addEventListener('click', async () => {
          const ok = await CatalogosUI.fireConfirm({
            title: '¿Eliminar todo?',
            html: `<p class="mb-0">Se borrarán <strong>todos</strong> los registros de <code>${this.escapeHtml(actual)}</code> en cada tabla, incluida la empresa.</p>`,
            icon: 'warning',
            confirmText: 'Eliminar todo',
            confirmClass: 'btn-catalogo-eliminar',
          });
          if (!ok) return;
          await runDelete({ all: true });
        });

        tbody?.addEventListener('click', async (e) => {
          const btn = e.target.closest('.empresas-eliminar-tabla-btn');
          if (!btn || running) return;
          const schema = btn.dataset.schema;
          const name = btn.dataset.name;
          const tableLabel = `${schema}.${name}`;
          const count = tableCounts.get(tableLabel) ?? 0;
          const ok = await CatalogosUI.fireConfirm({
            title: '¿Eliminar registros?',
            html: `<p class="mb-0">Se eliminarán <strong>${count}</strong> registro(s) de <code>${this.escapeHtml(tableLabel)}</code>.</p>`,
            icon: 'warning',
            confirmText: 'Eliminar',
            confirmClass: 'btn-catalogo-eliminar',
          });
          if (!ok) return;
          await runDelete({ schema, name, tableLabel });
        });

        (async () => {
          try {
            const rows = [];
            await this.ejecutarEliminarResumenStream({
              empnit: actual,
              pass,
              onEvent: (evt) => {
                if (evt.type === 'table-count') {
                  rows.push(evt);
                  tableCounts.set(`${evt.schema}.${evt.name}`, evt.ok === false ? 0 : Number(evt.count) || 0);
                  setStatus(`Escaneando ${evt.index}/${evt.total}: ${evt.table}`);
                }
              },
            });
            if (tbody) {
              tbody.innerHTML = rows.length
                ? rows.map((item) => renderRow(item)).join('')
                : '<tr><td colspan="3" class="text-muted small">Sin tablas con EMPNIT</td></tr>';
            }
            setStatus(`${rows.length} tabla(s) · ${rows.reduce((a, r) => a + (Number(r.count) || 0), 0)} registro(s)`, false);
            if (btnTodo) btnTodo.disabled = false;
          } catch (err) {
            if (tbody) {
              tbody.innerHTML = `<tr><td colspan="3" class="text-danger small">${this.escapeHtml(err.message || 'Error al escanear')}</td></tr>`;
            }
            setStatus(err.message || 'Error al escanear', false);
          }
        })();
      },
    });

    if (!empresaEliminada && result.isDismissed) {
      await this.load(this._container);
    }
  },

  async ejecutarNdjsonStream(url, body, onEvent) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify(body),
    });

    const contentType = String(res.headers.get('content-type') || '');
    if (!res.ok) {
      let message = `Error ${res.status}`;
      try {
        const data = await res.json();
        message = data.error || message;
      } catch (_) {
        /* ignore */
      }
      throw new Error(message);
    }

    if (!contentType.includes('application/x-ndjson') || !res.body) {
      const data = await res.json();
      if (typeof onEvent === 'function') onEvent(data);
      return data;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let evt;
        try {
          evt = JSON.parse(trimmed);
        } catch (_) {
          continue;
        }
        if (typeof onEvent === 'function') onEvent(evt);
        if (evt.type === 'done') summary = evt;
        if (evt.type === 'fatal') {
          throw new Error(evt.error || 'Error en el proceso');
        }
      }
    }

    if (buffer.trim()) {
      try {
        const evt = JSON.parse(buffer.trim());
        if (typeof onEvent === 'function') onEvent(evt);
        if (evt.type === 'done') summary = evt;
        if (evt.type === 'fatal') throw new Error(evt.error || 'Error en el proceso');
      } catch (err) {
        if (err.message && !err.message.includes('JSON')) throw err;
      }
    }

    if (!summary) {
      throw new Error('No se recibió confirmación del proceso');
    }
    return summary;
  },

  ejecutarEliminarResumenStream({ empnit, pass, onEvent }) {
    return this.ejecutarNdjsonStream(
      `/api/empresas/${encodeURIComponent(empnit)}/eliminacion-resumen?stream=1`,
      { pass },
      onEvent
    );
  },

  ejecutarEliminarDatosStream({ empnit, pass, all, schema, name, onEvent }) {
    const body = { pass };
    if (all) body.all = true;
    else {
      body.schema = schema;
      body.name = name;
    }
    return this.ejecutarNdjsonStream(
      `/api/empresas/${encodeURIComponent(empnit)}/eliminar-datos?stream=1`,
      body,
      onEvent
    );
  },

  async onCambiarEmpnit(empnit) {
    const row = this.findRow(empnit);
    const nombre = row ? row.EMPNOMBRE || empnit : empnit;
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Cambiar EMPNIT?',
      html: `
        <p class="mb-2">Se actualizará el EMPNIT de <strong>${this.escapeHtml(nombre)}</strong>
        (<code>${this.escapeHtml(empnit)}</code>) en <strong>todas</strong> las tablas de la base de datos.</p>
        <p class="mb-0 small text-muted">Esta operación no se puede deshacer fácilmente. Continúe solo si está seguro.</p>
      `,
      icon: 'warning',
      confirmText: 'Continuar',
      confirmClass: 'btn-modal-guardar',
    });
    if (!confirm) return;

    const pass = await CatalogosUI.solicitarClaveAdmin({
      title: 'Autorizar cambio de EMPNIT',
      text: 'Ingrese la clave de administrador para continuar.',
      confirmText: 'Continuar',
    });
    if (!pass) return;

    const actual = String(empnit || '').trim();
    let running = false;

    const result = await Swal.fire({
      ...CatalogosUI.modalBase({
        customClass: { confirmButton: 'btn-modal-guardar', cancelButton: 'btn-modal-cancelar' },
      }),
      title: 'Cambiar EMPNIT',
      width: 520,
      html: `
        <form class="catalogo-form text-start empresas-cambiar-empnit-form" autocomplete="off" novalidate onsubmit="return false">
          <label class="form-label small mb-0" for="empresas-empnit-actual">EMPNIT actual</label>
          <input type="text" class="form-control form-control-sm mb-3" id="empresas-empnit-actual"
            value="${this.escapeHtml(actual)}" readonly>

          <label class="form-label small mb-0" for="empresas-empnit-nuevo">EMPNIT nuevo</label>
          <input type="text" class="form-control form-control-sm mb-2" id="empresas-empnit-nuevo"
            value="" autocomplete="off" placeholder="Nuevo EMPNIT">

          <div id="empresas-cambiar-empnit-progress" class="empresas-cambiar-empnit-progress d-none">
            <div class="d-flex align-items-center gap-2 mb-2 small text-muted" id="empresas-cambiar-empnit-status">
              <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
              <span>Preparando…</span>
            </div>
            <div class="empresas-cambiar-empnit-log" id="empresas-cambiar-empnit-log"></div>
          </div>
        </form>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Ejecutar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      allowOutsideClick: () => !running,
      allowEscapeKey: () => !running,
      didOpen: () => {
        document.getElementById('empresas-empnit-nuevo')?.focus();
      },
      preConfirm: async () => {
        const nuevo = String(document.getElementById('empresas-empnit-nuevo')?.value ?? '').trim();
        if (!nuevo) {
          Swal.showValidationMessage('Ingrese el EMPNIT nuevo');
          return false;
        }
        if (nuevo.toUpperCase() === actual.toUpperCase()) {
          Swal.showValidationMessage('El EMPNIT nuevo debe ser distinto al actual');
          return false;
        }

        running = true;
        const confirmBtn = Swal.getConfirmButton();
        const cancelBtn = Swal.getCancelButton();
        if (confirmBtn) confirmBtn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = true;

        const progressWrap = document.getElementById('empresas-cambiar-empnit-progress');
        const statusEl = document.getElementById('empresas-cambiar-empnit-status');
        const logEl = document.getElementById('empresas-cambiar-empnit-log');
        progressWrap?.classList.remove('d-none');
        if (logEl) logEl.innerHTML = '';

        const setStatus = (msg, spinning = true) => {
          if (!statusEl) return;
          statusEl.innerHTML = spinning
            ? `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>${this.escapeHtml(msg)}</span>`
            : `<i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i><span>${this.escapeHtml(msg)}</span>`;
        };

        const appendLog = (html) => {
          if (!logEl) return;
          logEl.insertAdjacentHTML('beforeend', html);
          logEl.scrollTop = logEl.scrollHeight;
        };

        try {
          setStatus('Recorriendo tablas…');
          const summary = await this.ejecutarCambiarEmpnitStream({
            from: actual,
            to: nuevo,
            pass,
            onEvent: (evt) => {
              if (evt.type === 'status') {
                setStatus(evt.message || 'Procesando…');
                return;
              }
              if (evt.type === 'table-start') {
                setStatus(`Tabla ${evt.index}/${evt.total}: ${evt.table}`);
                return;
              }
              if (evt.type === 'table-done') {
                if (evt.ok) {
                  appendLog(
                    `<div class="empresas-cambiar-empnit-log-ok"><i class="fa-solid fa-check me-1"></i>${this.escapeHtml(
                      evt.table
                    )} <span class="text-muted">(${Number(evt.rowsAffected) || 0} fila(s))</span></div>`
                  );
                } else {
                  appendLog(
                    `<div class="empresas-cambiar-empnit-log-err"><i class="fa-solid fa-xmark me-1"></i>${this.escapeHtml(
                      evt.table
                    )}: ${this.escapeHtml(evt.error || 'Error')}</div>`
                  );
                }
                return;
              }
              if (evt.type === 'fatal') {
                throw new Error(evt.error || 'Error al cambiar EMPNIT');
              }
            },
          });

          setStatus(
            `Listo: ${summary.okCount || 0} ok · ${summary.failCount || 0} error(es)`,
            false
          );
          if (summary.failCount > 0) {
            Swal.showValidationMessage(
              `El proceso terminó con ${summary.failCount} error(es). Revise el detalle.`
            );
            running = false;
            if (confirmBtn) confirmBtn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;
            return false;
          }
          return { from: actual, to: nuevo, summary };
        } catch (err) {
          running = false;
          if (confirmBtn) confirmBtn.disabled = false;
          if (cancelBtn) cancelBtn.disabled = false;
          setStatus(err.message || 'Error', false);
          Swal.showValidationMessage(err.message || 'No se pudo cambiar el EMPNIT');
          return false;
        }
      },
    });

    if (!result.isConfirmed || !result.value) return;
    F.toast(`EMPNIT actualizado: ${actual} → ${result.value.to}`, 'success');
    await this.load(this._container);
  },

  async ejecutarCambiarEmpnitStream({ from, to, pass, onEvent }) {
    const res = await fetch('/api/empresas/cambiar-empnit?stream=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify({
        EMPNIT_ACTUAL: from,
        EMPNIT_NUEVO: to,
        pass,
      }),
    });

    const contentType = String(res.headers.get('content-type') || '');
    if (!res.ok) {
      let message = `Error ${res.status}`;
      try {
        const data = await res.json();
        message = data.error || message;
      } catch (_) {
        /* ignore */
      }
      throw new Error(message);
    }

    if (!contentType.includes('application/x-ndjson') || !res.body) {
      const data = await res.json();
      if (typeof onEvent === 'function') {
        (data.results || []).forEach((item, i) => {
          onEvent({
            type: 'table-done',
            index: i + 1,
            total: data.total || (data.results || []).length,
            ...item,
          });
        });
        onEvent({ type: 'done', ...data });
      }
      return data;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let evt;
        try {
          evt = JSON.parse(trimmed);
        } catch (_) {
          continue;
        }
        if (typeof onEvent === 'function') onEvent(evt);
        if (evt.type === 'done') summary = evt;
        if (evt.type === 'fatal') {
          throw new Error(evt.error || 'Error al cambiar EMPNIT');
        }
      }
    }

    if (buffer.trim()) {
      try {
        const evt = JSON.parse(buffer.trim());
        if (typeof onEvent === 'function') onEvent(evt);
        if (evt.type === 'done') summary = evt;
        if (evt.type === 'fatal') throw new Error(evt.error || 'Error al cambiar EMPNIT');
      } catch (err) {
        if (err.message && !err.message.includes('JSON')) throw err;
      }
    }

    if (!summary) {
      throw new Error('No se recibió confirmación del proceso');
    }
    return summary;
  },

  bindEvents() {
    document.getElementById('btn-empresas-refresh')?.addEventListener('click', () => this.load(this._container));
    document.getElementById('btn-empresas-nuevo')?.addEventListener('click', () => this.onNuevo());

    this._container.querySelectorAll('.btn-catalogo-editar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEditar(btn.dataset.empnit));
    });

    this._container.querySelectorAll('.btn-empresas-cambiar-empnit').forEach((btn) => {
      btn.addEventListener('click', () => this.onCambiarEmpnit(btn.dataset.empnit));
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
