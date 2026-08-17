/**
 * Recursos Humanos — Control de Asistencia (QR / búsqueda manual).
 */
const ControlAsistenciaView = {
  _container: null,
  _fecha: '',
  _rows: [],

  escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  apiHoy(fecha) {
    return `/api/asistencia/hoy?empnit=${encodeURIComponent(F.getEmpNit())}&fecha=${encodeURIComponent(fecha)}&_=${Date.now()}`;
  },

  formatHora(v) {
    if (!v) return '—';
    return String(v).slice(0, 8);
  },

  renderTable() {
    if (!this._rows.length) {
      return '<p class="text-center text-muted py-4 mb-0">Sin registros de asistencia para esta fecha</p>';
    }
    const body = this._rows
      .map(
        (r) => `<tr>
          <td>${this.escapeHtml(r.CODEMPLEADO)}</td>
          <td>${this.escapeHtml(r.NOMEMPLEADO || '—')}</td>
          <td>${this.escapeHtml(r.DEPARTAMENTO || '—')}</td>
          <td>${this.escapeHtml(this.formatHora(r.HORA_ENTRADA))}</td>
          <td>${this.escapeHtml(this.formatHora(r.HORA_SALIDA))}</td>
        </tr>`
      )
      .join('');
    return `
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead><tr>
            <th>Cód.</th><th>Empleado</th><th>Departamento</th>
            <th>Entrada</th><th>Salida</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  },

  renderHtml() {
    return `<div class="catalogo-empresa-view control-asistencia-view w-100">
      <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
        <div>
          <h5 class="mb-0">Control de Asistencia</h5>
          <p class="small text-muted mb-0">Registre entrada y salida con el QR o el código de barras del carné, o buscando al empleado.</p>
        </div>
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <input type="date" class="form-control form-control-sm" id="asistencia-fecha" value="${this.escapeHtml(this._fecha)}" style="width:auto">
          <button type="button" class="btn btn-sm btn-primary" id="asistencia-btn-qr">
            <i class="fa-solid fa-qrcode me-1"></i>Leer QR
          </button>
          <button type="button" class="btn btn-sm btn-outline-primary" id="asistencia-btn-buscar">
            <i class="fa-solid fa-magnifying-glass me-1"></i>Buscar empleado
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="asistencia-btn-recargar">
            <i class="fa-solid fa-rotate me-1"></i>Actualizar
          </button>
        </div>
      </div>
      <div class="card"><div class="card-body p-0" id="asistencia-table">${this.renderTable()}</div></div>
    </div>`;
  },

  accionLabel(accion) {
    if (accion === 'ENTRADA') return 'entrada';
    if (accion === 'SALIDA') return 'salida';
    return '';
  },

  async confirmarYMarcar(estado) {
    const accion = estado?.accion;
    const emp = estado?.empleado || {};
    if (accion === 'COMPLETO') {
      F.toast(`${emp.NOMEMPLEADO || 'Empleado'} ya tiene entrada y salida hoy`, 'warning');
      return;
    }
    const tipo = this.accionLabel(accion);
    const ok = await CatalogosUI.fireConfirm({
      title: `¿Registrar ${tipo}?`,
      html: `
        <p class="mb-1 text-start"><strong>${this.escapeHtml(emp.NOMEMPLEADO || '')}</strong>
          <span class="text-muted">(cód. ${this.escapeHtml(emp.CODEMPLEADO)})</span></p>
        <p class="small text-muted mb-1 text-start">Departamento: ${this.escapeHtml(emp.DEPARTAMENTO || '—')}</p>
        <p class="mb-0 text-start">Se registrará la <strong>${tipo}</strong>
          a las <strong>${this.escapeHtml(estado.horaActual || '')}</strong>
          del <strong>${this.escapeHtml(estado.fecha || '')}</strong>.</p>
        ${
          estado.registro?.HORA_ENTRADA
            ? `<p class="small text-muted mt-2 mb-0 text-start">Entrada previa: ${this.escapeHtml(estado.registro.HORA_ENTRADA)}</p>`
            : ''
        }
      `,
      icon: 'question',
      confirmText: `Registrar ${tipo}`,
    });
    if (!ok) return;

    const data = await F.fetchJson(
      `/api/asistencia/marcar?empnit=${encodeURIComponent(F.getEmpNit())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          CODEMPLEADO: emp.CODEMPLEADO,
          USUARIO: F.session('user')?.usuario || null,
        }),
      }
    );
    F.toast(
      `${data.marcado === 'ENTRADA' ? 'Entrada' : 'Salida'} registrada (${data.hora || ''})`,
      'success'
    );
    await this.reloadRows();
  },

  async procesarCodigoEmpleado(codempleado) {
    const estado = await F.fetchJson(
      `/api/asistencia/estado/${encodeURIComponent(codempleado)}?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`
    );
    await this.confirmarYMarcar(estado);
  },

  async procesarQr(raw) {
    const estado = await F.fetchJson(
      `/api/asistencia/preview-qr?empnit=${encodeURIComponent(F.getEmpNit())}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ QR: raw }),
      }
    );
    await this.confirmarYMarcar(estado);
  },

  async openQrScanner() {
    if (typeof BarcodeScannerUI === 'undefined') {
      F.alert('Error', 'Lector de cámara no disponible', 'error');
      return;
    }
    await BarcodeScannerUI.openQr({
      onScan: async (code) => {
        try {
          await this.procesarQr(code);
        } catch (err) {
          F.alert('Error', err.message || 'No se pudo procesar el QR', 'error');
        }
      },
    });
  },

  looksLikeCarne(raw) {
    const text = String(raw || '').trim();
    if (!text.includes('-')) return false;
    const parts = text.split('-');
    if (parts.length < 2) return false;
    const cod = parseInt(parts[parts.length - 1], 10);
    const empnit = parts.slice(0, -1).join('-').trim();
    return Boolean(empnit && Number.isFinite(cod) && cod > 0);
  },

  async openBusquedaManual() {
    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Buscar empleado',
      width: 480,
      html: `
        <div class="text-start">
          <label class="form-label small mb-0" for="asistencia-buscar-q">Nombre, código o carné</label>
          <input type="search" id="asistencia-buscar-q" class="form-control form-control-sm mb-2"
            placeholder="Nombre, código o empnit-codempleado" autocomplete="off">
          <div id="asistencia-buscar-list" class="list-group asistencia-buscar-list" style="max-height:280px;overflow:auto"></div>
          <input type="hidden" id="asistencia-buscar-cod" value="">
          <input type="hidden" id="asistencia-buscar-carne" value="">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Continuar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        const input = document.getElementById('asistencia-buscar-q');
        const list = document.getElementById('asistencia-buscar-list');
        const hidden = document.getElementById('asistencia-buscar-cod');
        const hiddenCarne = document.getElementById('asistencia-buscar-carne');
        let timer = null;
        const clearPick = () => {
          if (hidden) hidden.value = '';
          if (hiddenCarne) hiddenCarne.value = '';
        };
        const pick = (cod, carne = '') => {
          if (hidden) hidden.value = String(cod || '');
          if (hiddenCarne) hiddenCarne.value = String(carne || '');
        };
        const render = (rows) => {
          if (!list) return;
          if (!rows.length) {
            list.innerHTML = '<div class="list-group-item small text-muted">Sin resultados</div>';
            return;
          }
          list.innerHTML = rows
            .map(
              (r) => `<button type="button" class="list-group-item list-group-item-action py-2"
                data-cod="${this.escapeHtml(r.CODEMPLEADO)}"
                data-carne="${this.escapeHtml(r.CARNE || `${F.getEmpNit()}-${r.CODEMPLEADO}`)}">
                <div class="fw-semibold">${this.escapeHtml(r.NOMEMPLEADO)}</div>
                <div class="small text-muted">Cód. ${this.escapeHtml(r.CODEMPLEADO)}
                  ${r.DEPARTAMENTO ? ` · ${this.escapeHtml(r.DEPARTAMENTO)}` : ''}</div>
              </button>`
            )
            .join('');
          if (rows.length === 1) {
            const only = list.querySelector('[data-cod]');
            only?.classList.add('active');
            pick(only?.getAttribute('data-cod'), only?.getAttribute('data-carne'));
          }
        };
        const search = async () => {
          const q = String(input?.value || '').trim();
          if (q.length < 2 && !this.looksLikeCarne(q)) {
            list.innerHTML = '<div class="list-group-item small text-muted">Escriba para buscar o lea el código de barras…</div>';
            return;
          }
          try {
            const data = await F.fetchJson(
              `/api/asistencia/empleados/buscar?empnit=${encodeURIComponent(F.getEmpNit())}&q=${encodeURIComponent(q)}&_=${Date.now()}`
            );
            render(data.rows || []);
          } catch (err) {
            list.innerHTML = `<div class="list-group-item small text-danger">${this.escapeHtml(err.message || 'Error')}</div>`;
          }
        };
        const confirmIfReady = () => {
          const q = String(input?.value || '').trim();
          if (this.looksLikeCarne(q)) {
            if (hiddenCarne) hiddenCarne.value = q;
            Swal.clickConfirm();
            return true;
          }
          const items = list?.querySelectorAll('[data-cod]') || [];
          if (items.length === 1) {
            pick(items[0].getAttribute('data-cod'), items[0].getAttribute('data-carne'));
            Swal.clickConfirm();
            return true;
          }
          if (hidden?.value) {
            Swal.clickConfirm();
            return true;
          }
          return false;
        };
        input?.addEventListener('input', () => {
          clearPick();
          clearTimeout(timer);
          timer = setTimeout(search, 180);
        });
        input?.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          confirmIfReady();
        });
        list?.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-cod]');
          if (!btn) return;
          list.querySelectorAll('.active').forEach((el) => el.classList.remove('active'));
          btn.classList.add('active');
          pick(btn.getAttribute('data-cod'), btn.getAttribute('data-carne'));
        });
        list?.addEventListener('dblclick', (e) => {
          const btn = e.target.closest('[data-cod]');
          if (!btn) return;
          pick(btn.getAttribute('data-cod'), btn.getAttribute('data-carne'));
          Swal.clickConfirm();
        });
        input?.focus();
      },
      preConfirm: () => {
        const carne = String(document.getElementById('asistencia-buscar-carne')?.value || '').trim();
        const typed = String(document.getElementById('asistencia-buscar-q')?.value || '').trim();
        if (this.looksLikeCarne(carne) || this.looksLikeCarne(typed)) {
          return { carne: this.looksLikeCarne(carne) ? carne : typed };
        }
        const cod = String(document.getElementById('asistencia-buscar-cod')?.value || '').trim();
        if (!cod) {
          Swal.showValidationMessage('Seleccione un empleado o lea el código de barras del carné');
          return false;
        }
        return { CODEMPLEADO: cod };
      },
    });
    if (!result.isConfirmed) return;
    try {
      if (result.value?.carne) {
        await this.procesarQr(result.value.carne);
      } else {
        await this.procesarCodigoEmpleado(result.value.CODEMPLEADO);
      }
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo registrar', 'error');
    }
  },

  refreshTable() {
    const el = this._container?.querySelector('#asistencia-table');
    if (el) el.innerHTML = this.renderTable();
  },

  async reloadRows() {
    const fecha = this._fecha || this.todayIso();
    const data = await F.fetchJson(this.apiHoy(fecha), { cache: 'no-store' });
    this._fecha = data.fecha || fecha;
    this._rows = data.rows || [];
    const input = this._container?.querySelector('#asistencia-fecha');
    if (input) input.value = this._fecha;
    this.refreshTable();
  },

  bindEvents() {
    this._container?.querySelector('#asistencia-btn-qr')?.addEventListener('click', () => {
      this.openQrScanner().catch((err) =>
        F.alert('Error', err.message || 'No se pudo abrir la cámara', 'error')
      );
    });
    this._container?.querySelector('#asistencia-btn-buscar')?.addEventListener('click', () => {
      this.openBusquedaManual().catch((err) =>
        F.alert('Error', err.message || 'Error en búsqueda', 'error')
      );
    });
    this._container?.querySelector('#asistencia-btn-recargar')?.addEventListener('click', () => {
      this.reloadRows().catch((err) => F.toast(err.message || 'Error', 'error'));
    });
    this._container?.querySelector('#asistencia-fecha')?.addEventListener('change', (e) => {
      this._fecha = e.target.value || this.todayIso();
      this.reloadRows().catch((err) => F.toast(err.message || 'Error', 'error'));
    });
  },

  async load(container) {
    this._container = container;
    this._fecha = this.todayIso();
    container.className = 'main-content flex-grow-1 d-flex p-3';
    container.innerHTML = '<p class="text-muted">Cargando asistencia…</p>';
    try {
      await this.reloadRows();
      container.innerHTML = this.renderHtml();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `<p class="text-danger">${this.escapeHtml(err.message || 'Error al cargar')}</p>`;
    }
  },
};
