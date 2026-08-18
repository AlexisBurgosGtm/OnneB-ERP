/**
 * Datos de nómina por empleado activo (salario, IGSS, etc.).
 */
const NominaEmpleadosView = {
  _container: null,
  _rows: [],
  _departamentos: [],
  _filter: '',

  escapeHtml(v) {
    if (v == null) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value);
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) {
      return `${String(dmy[1]).padStart(2, '0')}/${String(dmy[2]).padStart(2, '0')}/${dmy[3]}`;
    }
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${d.getUTCFullYear()}`;
    } catch {
      return '—';
    }
  },

  formatMoney(v) {
    const n = Number(v);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  apiUrl() {
    return `/api/nomina/empleados?empnit=${encodeURIComponent(F.getEmpNit())}`;
  },

  deptApi() {
    return `/api/nomina/departamentos?empnit=${encodeURIComponent(F.getEmpNit())}&activos=1`;
  },

  departamentoOptionsHtml(selected) {
    const sel = String(selected || '').trim();
    const activos = (this._departamentos || []).filter(
      (d) => String(d.ACTIVO || 'SI').toUpperCase() === 'SI'
    );
    const options = ['<option value="">— Sin departamento —</option>'];
    let found = !sel;
    for (const d of activos) {
      const nombre = String(d.NOMBRE || '').trim();
      if (!nombre) continue;
      const isSel = nombre === sel;
      if (isSel) found = true;
      options.push(
        `<option value="${this.escapeHtml(nombre)}"${isSel ? ' selected' : ''}>${this.escapeHtml(
          d.CODIGO ? `${d.CODIGO} — ${nombre}` : nombre
        )}</option>`
      );
    }
    if (sel && !found) {
      options.push(
        `<option value="${this.escapeHtml(sel)}" selected>${this.escapeHtml(sel)} (no catálogo)</option>`
      );
    }
    return options.join('');
  },

  filteredRows() {
    const q = this._filter.trim().toLowerCase();
    if (!q) return this._rows;
    return this._rows.filter((r) =>
      [r.CODEMPLEADO, r.NOMEMPLEADO, r.DPI, r.IGSS, r.DEPARTAMENTO, r.FECHA_NACIMIENTO]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ')
        .includes(q)
    );
  },

  renderTable() {
    const rows = this.filteredRows();
    if (!rows.length) {
      return '<p class="text-center text-muted py-4 mb-0">No hay empleados activos en esta empresa</p>';
    }
    const body = rows
      .map(
        (r) => `
      <tr data-cod="${this.escapeHtml(r.CODEMPLEADO)}">
        <td>${this.escapeHtml(r.CODEMPLEADO)}</td>
        <td>${this.escapeHtml(r.NOMEMPLEADO)}</td>
        <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA_NACIMIENTO))}</td>
        <td>${this.escapeHtml(r.DPI || '—')}</td>
        <td>${this.escapeHtml(r.IGSS || '—')}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.SALARIO_BASE))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.BONO_LEY))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.BONO_ADICIONAL))}</td>
        <td>${this.escapeHtml(r.DEPARTAMENTO || '—')}</td>
        <td>${this.escapeHtml(r.COD_CENTRO_TRABAJO || '—')}</td>
        <td>${this.escapeHtml(r.CONDICION_LABORAL || 'P')}</td>
        <td class="text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-primary nomina-emp-edit" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary nomina-emp-carne" title="Generar carné">
            <i class="fa-solid fa-id-badge"></i>
          </button>
        </td>
      </tr>`
      )
      .join('');
    return `
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead><tr>
            <th>Cód.</th><th>Empleado</th><th>Nacimiento</th><th>DPI</th><th>IGSS</th>
            <th class="text-end">Salario base</th>
            <th class="text-end">Bono ley</th>
            <th class="text-end">Bono adic.</th>
            <th>Departamento</th><th>Centro</th><th>Cond.</th><th></th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  },

  renderHtml() {
    return `<div class="catalogo-empresa-view nomina-empleados-view w-100">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h5 class="mb-0">Datos nómina — empleados</h5>
          <p class="small text-muted mb-0">Solo empleados con ACTIVO = SI. Configure salario y datos IGSS antes de generar planillas.</p>
        </div>
        <button type="button" class="btn btn-sm btn-outline-primary" id="nomina-emp-recargar">
          <i class="fa-solid fa-rotate me-1"></i>Actualizar
        </button>
      </div>
      <div class="mb-3">
        <input type="search" class="form-control form-control-sm" id="nomina-emp-search"
          placeholder="Buscar empleado…" value="${this.escapeHtml(this._filter)}">
      </div>
      <div class="card"><div class="card-body p-0" id="nomina-emp-table">${this.renderTable()}</div></div>
    </div>`;
  },

  async showEditForm(row) {
    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: `Nómina — ${row.NOMEMPLEADO}`,
      width: 560,
      html: `
        <div class="text-start">
          <div class="mb-2">
            <label class="form-label small">Salario base</label>
            <input type="number" step="0.001" id="ne-salario" class="form-control form-control-sm" value="${Number(row.SALARIO_BASE) || ''}">
          </div>
          <div class="mb-2">
            <label class="form-label small">Departamento</label>
            <select id="ne-depto" class="form-select form-select-sm">
              ${this.departamentoOptionsHtml(row.DEPARTAMENTO)}
            </select>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="form-label small">Bono ley</label>
              <input type="number" step="0.001" id="ne-bono-ley" class="form-control form-control-sm" value="${Number(row.BONO_LEY) || ''}">
            </div>
            <div class="col-6">
              <label class="form-label small">Bono adicional</label>
              <input type="number" step="0.001" id="ne-bono-adi" class="form-control form-control-sm" value="${Number(row.BONO_ADICIONAL) || ''}">
            </div>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="form-label small">Fecha ingreso</label>
              <input type="date" id="ne-ingreso" class="form-control form-control-sm" value="${String(row.FECHA_INGRESO || '').slice(0, 10)}">
            </div>
            <div class="col-6">
              <label class="form-label small">Fecha baja</label>
              <input type="date" id="ne-baja" class="form-control form-control-sm" value="${String(row.FECHA_BAJA || '').slice(0, 10)}">
            </div>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="form-label small">Centro trabajo</label>
              <input type="text" id="ne-centro" class="form-control form-control-sm" value="${this.escapeHtml(row.COD_CENTRO_TRABAJO || '')}">
            </div>
            <div class="col-6">
              <label class="form-label small">Condición laboral</label>
              <select id="ne-cond" class="form-select form-select-sm">
                <option value="P"${row.CONDICION_LABORAL === 'T' ? '' : ' selected'}>Permanente</option>
                <option value="T"${row.CONDICION_LABORAL === 'T' ? ' selected' : ''}>Temporal</option>
              </select>
            </div>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="form-label small">Tipo salario IGSS</label>
              <input type="text" id="ne-tipo-sal" class="form-control form-control-sm" value="${this.escapeHtml(row.TIPO_SALARIO_IGSS || '01')}" placeholder="01">
            </div>
            <div class="col-6">
              <label class="form-label small">Tiempo completo</label>
              <select id="ne-tc" class="form-select form-select-sm">
                <option value="SI"${String(row.TIEMPO_COMPLETO || 'SI').toUpperCase() !== 'NO' ? ' selected' : ''}>Sí</option>
                <option value="NO"${String(row.TIEMPO_COMPLETO || '').toUpperCase() === 'NO' ? ' selected' : ''}>No</option>
              </select>
            </div>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="form-label small">Horas mes</label>
              <input type="number" step="0.01" id="ne-horas" class="form-control form-control-sm" value="${row.HORAS_MES ?? ''}">
            </div>
            <div class="col-6">
              <label class="form-label small">Cód. ocupación IGSS</label>
              <input type="text" id="ne-ocup" class="form-control form-control-sm" value="${this.escapeHtml(row.COD_OCUPACION_IGSS || '')}">
            </div>
          </div>
          <div class="mb-2">
            <label class="form-label small">Cuenta banco</label>
            <input type="text" id="ne-banco" class="form-control form-control-sm" value="${this.escapeHtml(row.CUENTA_BANCO || '')}">
          </div>
          <div class="mb-0">
            <label class="form-label small">Observaciones</label>
            <textarea id="ne-obs" class="form-control form-control-sm" rows="2">${this.escapeHtml(row.OBS || '')}</textarea>
          </div>
          <div class="mt-3">
            <button type="button" class="btn btn-sm btn-outline-secondary w-100" id="ne-btn-carne">
              <i class="fa-solid fa-id-badge me-1"></i>Generar carné
            </button>
          </div>
        </div>`,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Guardar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      didOpen: () => {
        document.getElementById('ne-btn-carne')?.addEventListener('click', (e) => {
          e.preventDefault();
          this.generarCarne(row).catch((err) =>
            F.alert('Error', err.message || 'No se pudo generar el carné', 'error')
          );
        });
      },
      preConfirm: () => ({
        SALARIO_BASE: Number(document.getElementById('ne-salario')?.value) || 0,
        DEPARTAMENTO: document.getElementById('ne-depto')?.value?.trim() || null,
        BONO_LEY: Number(document.getElementById('ne-bono-ley')?.value) || 0,
        BONO_ADICIONAL: Number(document.getElementById('ne-bono-adi')?.value) || 0,
        FECHA_INGRESO: document.getElementById('ne-ingreso')?.value || null,
        FECHA_BAJA: document.getElementById('ne-baja')?.value || null,
        COD_CENTRO_TRABAJO: document.getElementById('ne-centro')?.value?.trim() || null,
        CONDICION_LABORAL: document.getElementById('ne-cond')?.value || 'P',
        TIPO_SALARIO_IGSS: document.getElementById('ne-tipo-sal')?.value?.trim() || null,
        TIEMPO_COMPLETO: document.getElementById('ne-tc')?.value || 'SI',
        HORAS_MES: document.getElementById('ne-horas')?.value === '' ? null : Number(document.getElementById('ne-horas')?.value),
        COD_OCUPACION_IGSS: document.getElementById('ne-ocup')?.value?.trim() || null,
        CUENTA_BANCO: document.getElementById('ne-banco')?.value?.trim() || null,
        OBS: document.getElementById('ne-obs')?.value?.trim() || null,
      }),
    });
    if (!result.isConfirmed) return;
    try {
      await F.fetchJson(
        `/api/nomina/empleados/${row.CODEMPLEADO}?empnit=${encodeURIComponent(F.getEmpNit())}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value),
        }
      );
      F.toast('Datos guardados', 'success');
      await this.reloadRows();
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo guardar', 'error');
    }
  },

  fotoUrl(codempleado) {
    return EmpleadoCarne.fotoUrl(codempleado);
  },

  async generarCarne(row) {
    await EmpleadoCarne.imprimir(row);
  },

  refreshTable() {
    const el = this._container?.querySelector('#nomina-emp-table');
    if (el) el.innerHTML = this.renderTable();
  },

  async reloadRows() {
    const [empData, deptData] = await Promise.all([
      F.fetchJson(`${this.apiUrl()}&_=${Date.now()}`, { cache: 'no-store' }),
      F.fetchJson(`${this.deptApi()}&_=${Date.now()}`, { cache: 'no-store' }).catch(() => ({ rows: [] })),
    ]);
    this._rows = empData.rows || [];
    this._departamentos = deptData.rows || [];
    this.refreshTable();
  },

  bindEvents() {
    this._container?.querySelector('#nomina-emp-recargar')?.addEventListener('click', () => this.reloadRows());
    this._container?.querySelector('#nomina-emp-search')?.addEventListener('input', (e) => {
      this._filter = e.target.value;
      this.refreshTable();
    });
    this._container?.querySelector('#nomina-emp-table')?.addEventListener('click', (e) => {
      const carneBtn = e.target.closest('.nomina-emp-carne');
      if (carneBtn) {
        const tr = carneBtn.closest('tr');
        const cod = tr?.dataset.cod;
        const row = this._rows.find((r) => String(r.CODEMPLEADO) === String(cod));
        if (row) {
          this.generarCarne(row).catch((err) =>
            F.alert('Error', err.message || 'No se pudo generar el carné', 'error')
          );
        }
        return;
      }
      const btn = e.target.closest('.nomina-emp-edit');
      if (!btn) return;
      const tr = btn.closest('tr');
      const cod = tr?.dataset.cod;
      const row = this._rows.find((r) => String(r.CODEMPLEADO) === String(cod));
      if (row) this.showEditForm(row);
    });
  },

  async load(container) {
    this._container = container;
    container.className = 'main-content flex-grow-1 d-flex p-3 align-items-stretch justify-content-start';
    container.innerHTML = '<p class="text-muted">Cargando empleados…</p>';
    try {
      await this.reloadRows();
      container.innerHTML = this.renderHtml();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `<p class="text-danger">${this.escapeHtml(err.message || 'Error al cargar')}</p>`;
    }
  },
};
