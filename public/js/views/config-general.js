/**
 * Vista Config general — Config ID=2 PASS, ID=3 SINO (inventario negativo)
 */
const ConfigGeneralView = {
  ADMIN_CONFIG_ID: 2,
  INVENTARIO_CONFIG_ID: 3,
  _container: null,
  _adminMeta: null,
  _inventarioMeta: null,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  renderAdminCard(meta = {}) {
    const desc = meta.descripcion || 'Clave para autorizar movimientos';
    return `
      <div class="card mb-3">
        <div class="card-body p-4">
          <h5 class="card-title mb-1">
            <i class="fa-solid fa-key me-2 text-primary"></i>Clave de administrador
          </h5>
          <p class="card-text mb-3">${this.escapeHtml(desc)}</p>
          <label for="input-admin-pass" class="form-label small">Valor actual (PASS)</label>
          <div class="input-group">
            <input
              type="password"
              class="form-control"
              id="input-admin-pass"
              name="admin-pass"
              autocomplete="off"
              spellcheck="false"
              placeholder="Clave de administrador"
            >
            <button
              type="button"
              class="btn btn-toggle-pass"
              id="btn-toggle-admin-pass"
              aria-label="Mostrar u ocultar clave"
              title="Ver clave"
            >
              <i class="fa-solid fa-eye" aria-hidden="true"></i>
            </button>
            <button type="button" class="btn btn-actualizar-pass" id="btn-actualizar-admin-pass">
              <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Actualizar
            </button>
          </div>
        </div>
      </div>
    `;
  },

  renderInventarioCard(meta = {}) {
    const desc = meta.descripcion || 'Permite vender en negativo';
    const sino = (meta.sino || 'NO').toUpperCase();
    return `
      <div class="card">
        <div class="card-body p-4">
          <h5 class="card-title mb-1">
            <i class="fa-solid fa-boxes-stacked me-2 text-primary"></i>Permite inventario negativo
          </h5>
          <p class="card-text mb-3">${this.escapeHtml(desc)}</p>
          <label for="select-inventario-negativo" class="form-label small">Valor (SINO)</label>
          <div class="input-group">
            <select class="form-select" id="select-inventario-negativo" name="inventario-negativo">
              <option value="SI"${sino === 'SI' ? ' selected' : ''}>SI</option>
              <option value="NO"${sino === 'NO' ? ' selected' : ''}>NO</option>
            </select>
            <button type="button" class="btn btn-actualizar-pass" id="btn-actualizar-inventario">
              <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Actualizar
            </button>
          </div>
        </div>
      </div>
    `;
  },

  renderAll() {
    return `
      <div class="config-general-panel">
        ${this.renderAdminCard(this._adminMeta)}
        ${this.renderInventarioCard(this._inventarioMeta)}
      </div>
    `;
  },

  bindEvents() {
    const input = document.getElementById('input-admin-pass');
    const btnToggle = document.getElementById('btn-toggle-admin-pass');
    const btnUpdatePass = document.getElementById('btn-actualizar-admin-pass');
    const btnUpdateInventario = document.getElementById('btn-actualizar-inventario');

    btnToggle?.addEventListener('click', () => {
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btnToggle.querySelector('i').className = isPass ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      btnToggle.title = isPass ? 'Ocultar clave' : 'Ver clave';
    });

    btnUpdatePass?.addEventListener('click', () => this.onActualizarPass());
    btnUpdateInventario?.addEventListener('click', () => this.onActualizarInventario());
  },

  async fetchPass() {
    return F.fetchJson(`/api/config/${this.ADMIN_CONFIG_ID}/pass?_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async fetchSino() {
    return F.fetchJson(`/api/config/${this.INVENTARIO_CONFIG_ID}/sino?_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async onActualizarPass() {
    const input = document.getElementById('input-admin-pass');
    const pass = input?.value ?? '';
    if (!pass.trim()) {
      F.toast('Ingrese una clave', 'warning');
      return;
    }

    const ok = await CatalogosUI.fireConfirm({
      title: '¿Actualizar clave?',
      text: 'Se guardará la nueva clave de administrador.',
      icon: 'question',
      confirmText: 'Guardar',
    });
    if (!ok) return;

    try {
      await F.fetchJson(`/api/config/${this.ADMIN_CONFIG_ID}/pass`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: pass.trim() }),
      });
      F.toast('Clave actualizada', 'success');
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onActualizarInventario() {
    const select = document.getElementById('select-inventario-negativo');
    const sino = select?.value;
    if (!sino) {
      F.toast('Seleccione SI o NO', 'warning');
      return;
    }

    const ok = await CatalogosUI.fireConfirm({
      title: '¿Actualizar configuración?',
      text: `Permite inventario negativo: ${sino}`,
      icon: 'question',
      confirmText: 'Guardar',
    });
    if (!ok) return;

    try {
      await F.fetchJson(`/api/config/${this.INVENTARIO_CONFIG_ID}/sino`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sino }),
      });
      if (this._inventarioMeta) this._inventarioMeta.sino = sino;
      F.toast('Configuración actualizada', 'success');
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');
    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando configuración…
      </div>
    `;

    try {
      const [adminMeta, inventarioMeta] = await Promise.all([this.fetchPass(), this.fetchSino()]);
      this._adminMeta = adminMeta;
      this._inventarioMeta = inventarioMeta;
      container.innerHTML = this.renderAll();
      const input = document.getElementById('input-admin-pass');
      if (input) input.value = adminMeta.pass ?? '';
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-0" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          No se pudo cargar la configuración: ${this.escapeHtml(err.message)}
        </div>
      `;
      F.toast('Error al cargar configuración', 'error');
    }
  },
};
