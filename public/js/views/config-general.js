/**
 * Vista Config general — Config ID=2 PASS (clave administrador)
 */
const ConfigGeneralView = {
  CONFIG_ID: 2,
  _container: null,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  renderPanel(meta = {}) {
    const desc = meta.descripcion || 'Clave para autorizar movimientos';
    return `
      <div class="config-general-panel">
        <div class="card">
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
      </div>
    `;
  },

  bindEvents() {
    const input = document.getElementById('input-admin-pass');
    const btnToggle = document.getElementById('btn-toggle-admin-pass');
    const btnUpdate = document.getElementById('btn-actualizar-admin-pass');

    btnToggle?.addEventListener('click', () => {
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btnToggle.querySelector('i').className = isPass ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      btnToggle.title = isPass ? 'Ocultar clave' : 'Ver clave';
    });

    btnUpdate?.addEventListener('click', () => this.onActualizar());
  },

  async fetchPass() {
    return F.fetchJson(`/api/config/${this.CONFIG_ID}/pass?_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async onActualizar() {
    const input = document.getElementById('input-admin-pass');
    const pass = input?.value ?? '';
    if (!pass.trim()) {
      F.toast('Ingrese una clave', 'warning');
      return;
    }

    const ok = await CatalogosUI.fireConfirm({
      title: '¿Actualizar clave?',
      text: 'Se guardará la nueva clave de administrador en la configuración.',
      icon: 'question',
      confirmText: 'Guardar',
    });
    if (!ok) return;

    try {
      await F.fetchJson(`/api/config/${this.CONFIG_ID}/pass`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: pass.trim() }),
      });
      F.toast('Clave actualizada', 'success');
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
      const data = await this.fetchPass();
      container.innerHTML = this.renderPanel(data);
      const input = document.getElementById('input-admin-pass');
      if (input) input.value = data.pass ?? '';
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
