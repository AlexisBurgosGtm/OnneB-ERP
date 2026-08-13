/**
 * Configuración general de nómina + CRUD departamentos.
 */
const NominaConfigView = {
  _container: null,
  _config: null,
  _departamentos: [],

  escapeHtml(v) {
    if (v == null) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  apiUrl() {
    return `/api/nomina/config?empnit=${encodeURIComponent(F.getEmpNit())}`;
  },

  deptApi(path = '') {
    const emp = encodeURIComponent(F.getEmpNit());
    const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    return `/api/nomina/departamentos${segment}?empnit=${emp}`;
  },

  field(id, label, value, { type = 'text', step, col = 'col-6 col-md-4 col-xl-3' } = {}) {
    const stepAttr = step ? ` step="${step}"` : '';
    return `<div class="${col}">
      <label class="form-label small mb-0" for="${id}">${this.escapeHtml(label)}</label>
      <input type="${type}" class="form-control form-control-sm" id="${id}" value="${this.escapeHtml(value ?? '')}"${stepAttr}>
    </div>`;
  },

  renderDepartamentosTable() {
    const rows = this._departamentos || [];
    if (!rows.length) {
      return `<p class="small text-muted mb-0 py-2">Sin departamentos. Agregue al menos uno para asignarlos a empleados.</p>`;
    }
    return `
      <div class="table-responsive nomina-dept-table">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Activo</th>
              <th class="text-end"></th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `
              <tr data-id="${this.escapeHtml(r.ID)}">
                <td class="fw-semibold">${this.escapeHtml(r.CODIGO)}</td>
                <td>${this.escapeHtml(r.NOMBRE)}</td>
                <td>
                  <span class="badge ${String(r.ACTIVO).toUpperCase() === 'SI' ? 'text-bg-success' : 'text-bg-secondary'}">
                    ${String(r.ACTIVO).toUpperCase() === 'SI' ? 'Sí' : 'No'}
                  </span>
                </td>
                <td class="text-end text-nowrap">
                  <button type="button" class="btn btn-sm btn-outline-primary nomina-dept-edit" title="Editar">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-danger nomina-dept-del" title="Eliminar">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
  },

  renderHtml() {
    const c = this._config || {};
    return `<div class="catalogo-empresa-view nomina-config-view w-100">
      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div>
          <h5 class="mb-0">Configuración de nómina</h5>
          <p class="small text-muted mb-0">Parámetros del patrono e impuestos · catálogo de departamentos.</p>
        </div>
        <button type="button" class="btn btn-sm btn-catalogo-guardar" id="nomina-config-guardar">
          <i class="fa-solid fa-floppy-disk me-1"></i>Guardar parámetros
        </button>
      </div>

      <div class="row g-3 align-items-start">
        <div class="col-lg-7">
          <div class="card shadow-sm nomina-config-params-card">
            <div class="card-header py-2 px-3 small fw-semibold bg-light border-0">
              <i class="fa-solid fa-sliders me-1 text-primary"></i>Parámetros
            </div>
            <div class="card-body py-2 px-3">
              <div class="row g-2">
                ${this.field('nomina-nit', 'NIT patrono', c.NIT_PATRONO)}
                ${this.field('nomina-razon', 'Razón social', c.RAZON_SOCIAL, { col: 'col-6 col-md-8 col-xl-6' })}
                ${this.field('nomina-igss-patrono', 'No. patrono IGSS', c.IGSS_NUMERO_PATRONO)}
                ${this.field('nomina-centro', 'Centro trabajo', c.IGSS_CENTRO_TRABAJO || '1')}
                ${this.field('nomina-email', 'Correo IGSS', c.IGSS_EMAIL, { col: 'col-12 col-md-8 col-xl-6' })}
                ${this.field('nomina-pct-lab', '% IGSS lab.', c.PORC_IGSS_LABORAL ?? 4.83, { type: 'number', step: '0.01', col: 'col-4 col-md-3' })}
                ${this.field('nomina-pct-pat', '% IGSS pat.', c.PORC_IGSS_PATRONAL ?? 10.67, { type: 'number', step: '0.01', col: 'col-4 col-md-3' })}
                ${this.field('nomina-pct-isr', '% ISR', c.PORC_ISR ?? 0, { type: 'number', step: '0.01', col: 'col-4 col-md-3' })}
                ${this.field('nomina-dias', 'Días mes', c.DIAS_MES ?? 30, { type: 'number', step: '0.01', col: 'col-4 col-md-3' })}
                ${this.field('nomina-minimo', 'Salario mín.', c.SALARIO_MINIMO, { type: 'number', step: '0.01', col: 'col-6 col-md-4' })}
                <div class="col-12">
                  <label class="form-label small mb-0" for="nomina-obs">Observaciones</label>
                  <input type="text" class="form-control form-control-sm" id="nomina-obs" value="${this.escapeHtml(c.OBS || '')}" placeholder="Opcional">
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="col-lg-5">
          <div class="card shadow-sm nomina-config-dept-card h-100">
            <div class="card-header py-2 px-3 d-flex align-items-center justify-content-between gap-2 bg-light border-0">
              <span class="small fw-semibold">
                <i class="fa-solid fa-building me-1 text-primary"></i>Departamentos
              </span>
              <button type="button" class="btn btn-sm btn-outline-primary" id="nomina-dept-add">
                <i class="fa-solid fa-plus me-1"></i>Nuevo
              </button>
            </div>
            <div class="card-body py-2 px-3" id="nomina-dept-list">${this.renderDepartamentosTable()}</div>
          </div>
        </div>
      </div>
    </div>`;
  },

  collectForm() {
    const get = (id) => document.getElementById(id)?.value ?? '';
    return {
      NIT_PATRONO: get('nomina-nit').trim(),
      RAZON_SOCIAL: get('nomina-razon').trim(),
      IGSS_NUMERO_PATRONO: get('nomina-igss-patrono').trim(),
      IGSS_CENTRO_TRABAJO: get('nomina-centro').trim() || '1',
      IGSS_EMAIL: get('nomina-email').trim(),
      PORC_IGSS_LABORAL: Number(get('nomina-pct-lab')) || 0,
      PORC_IGSS_PATRONAL: Number(get('nomina-pct-pat')) || 0,
      PORC_ISR: Number(get('nomina-pct-isr')) || 0,
      DIAS_MES: Number(get('nomina-dias')) || 30,
      SALARIO_MINIMO: get('nomina-minimo') === '' ? null : Number(get('nomina-minimo')),
      OBS: get('nomina-obs').trim(),
    };
  },

  async reloadDepartamentos() {
    const data = await F.fetchJson(`${this.deptApi()}&_=${Date.now()}`, { cache: 'no-store' });
    this._departamentos = data.rows || [];
    const el = this._container?.querySelector('#nomina-dept-list');
    if (el) el.innerHTML = this.renderDepartamentosTable();
  },

  async promptDepartamento(row = null) {
    const isEdit = !!row;
    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: isEdit ? 'Editar departamento' : 'Nuevo departamento',
      html: `
        <div class="text-start">
          <div class="mb-2">
            <label class="form-label small">Código</label>
            <input type="text" id="nd-codigo" class="form-control form-control-sm" maxlength="20"
              value="${this.escapeHtml(row?.CODIGO || '')}" ${isEdit ? '' : 'autofocus'}>
          </div>
          <div class="mb-2">
            <label class="form-label small">Nombre</label>
            <input type="text" id="nd-nombre" class="form-control form-control-sm" maxlength="120"
              value="${this.escapeHtml(row?.NOMBRE || '')}">
          </div>
          <div class="mb-0">
            <label class="form-label small">Activo</label>
            <select id="nd-activo" class="form-select form-select-sm">
              <option value="SI"${String(row?.ACTIVO || 'SI').toUpperCase() !== 'NO' ? ' selected' : ''}>Sí</option>
              <option value="NO"${String(row?.ACTIVO || '').toUpperCase() === 'NO' ? ' selected' : ''}>No</option>
            </select>
          </div>
        </div>`,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Guardar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      preConfirm: () => {
        const CODIGO = document.getElementById('nd-codigo')?.value?.trim() || '';
        const NOMBRE = document.getElementById('nd-nombre')?.value?.trim() || '';
        if (!CODIGO) {
          Swal.showValidationMessage('Indique el código');
          return false;
        }
        if (!NOMBRE) {
          Swal.showValidationMessage('Indique el nombre');
          return false;
        }
        return {
          CODIGO,
          NOMBRE,
          ACTIVO: document.getElementById('nd-activo')?.value || 'SI',
        };
      },
    });
    if (!result.isConfirmed) return;
    try {
      if (isEdit) {
        await F.fetchJson(this.deptApi(`/${row.ID}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value),
        });
      } else {
        await F.fetchJson(this.deptApi(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value),
        });
      }
      F.toast(isEdit ? 'Departamento actualizado' : 'Departamento creado', 'success');
      await this.reloadDepartamentos();
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo guardar', 'error');
    }
  },

  bindEvents() {
    this._container?.querySelector('#nomina-config-guardar')?.addEventListener('click', async () => {
      try {
        const data = await F.fetchJson(this.apiUrl(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.collectForm()),
        });
        this._config = data.config || data;
        F.toast('Configuración guardada', 'success');
      } catch (err) {
        F.alert('Error', err.message || 'No se pudo guardar', 'error');
      }
    });

    this._container?.querySelector('#nomina-dept-add')?.addEventListener('click', () => {
      this.promptDepartamento(null);
    });

    this._container?.querySelector('#nomina-dept-list')?.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.nomina-dept-edit');
      const delBtn = e.target.closest('.nomina-dept-del');
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.dataset.id;
      const row = this._departamentos.find((r) => String(r.ID) === String(id));
      if (!row) return;
      if (editBtn) {
        this.promptDepartamento(row);
        return;
      }
      if (delBtn) {
        const ok = await CatalogosUI.confirmSalir({
          title: '¿Eliminar departamento?',
          text: `${row.CODIGO} — ${row.NOMBRE}`,
        });
        if (!ok) return;
        try {
          await F.fetchJson(this.deptApi(`/${row.ID}`), { method: 'DELETE' });
          F.toast('Departamento eliminado', 'success');
          await this.reloadDepartamentos();
        } catch (err) {
          F.alert('Error', err.message || 'No se pudo eliminar', 'error');
        }
      }
    });
  },

  async load(container) {
    this._container = container;
    container.className = 'main-content flex-grow-1 d-flex p-3';
    container.innerHTML = '<p class="text-muted">Cargando configuración…</p>';
    try {
      const [cfgData, deptData] = await Promise.all([
        F.fetchJson(`${this.apiUrl()}&_=${Date.now()}`, { cache: 'no-store' }),
        F.fetchJson(`${this.deptApi()}&_=${Date.now()}`, { cache: 'no-store' }),
      ]);
      this._config = cfgData.config || {};
      this._departamentos = deptData.rows || [];
      container.innerHTML = this.renderHtml();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `<p class="text-danger">${this.escapeHtml(err.message || 'Error al cargar')}</p>`;
    }
  },
};
