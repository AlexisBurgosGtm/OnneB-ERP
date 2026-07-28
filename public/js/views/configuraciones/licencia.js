/**
 * Configuraciones → Licencia (instalación completa).
 */
const LicenciaView = {
  _container: null,
  _status: null,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  async load(container) {
    this._container = container;
    container.className = 'main-content flex-grow-1 d-flex p-3 align-items-stretch justify-content-start';
    container.innerHTML = `
      <div class="licencia-wrap w-100">
        <div class="text-muted small py-4 text-center">
          <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando licencia…
        </div>
      </div>`;
    try {
      await this.refresh();
      this.render();
    } catch (err) {
      container.innerHTML = `
        <div class="licencia-wrap w-100">
          <div class="alert alert-danger mb-0">${this.escapeHtml(err.message || 'Error')}</div>
        </div>`;
    }
  },

  async refresh() {
    this._status = await F.fetchJson(`/api/license/status?_=${Date.now()}`, { cache: 'no-store' });
    if (typeof LicenseAccess !== 'undefined') {
      LicenseAccess._status = this._status;
      LicenseAccess.updateExpiryBadge();
    }
    return this._status;
  },

  statusBadge(st) {
    const map = {
      open: { cls: 'text-bg-secondary', label: 'Modo abierto' },
      valid: { cls: 'text-bg-success', label: 'Licencia válida' },
      expired: { cls: 'text-bg-warning', label: 'Vencida' },
      invalid: { cls: 'text-bg-danger', label: 'Inválida' },
      missing: { cls: 'text-bg-warning', label: 'Sin licencia' },
    };
    const m = map[st.status] || { cls: 'text-bg-secondary', label: st.status || '—' };
    return `<span class="badge ${m.cls}">${this.escapeHtml(m.label)}</span>`;
  },

  formatDate(iso) {
    if (!iso) return 'Sin vencimiento';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('es-GT', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  render() {
    const wrap = this._container?.querySelector('.licencia-wrap') || this._container;
    if (!wrap) return;
    const st = this._status || {};
    const catalog = st.catalog || [];
    const activeMenus = st.menus === null ? null : new Set(st.menus || []);

    wrap.innerHTML = `
      <div class="licencia-panel w-100">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-1">Licencia de instalación</h2>
            <p class="text-muted small mb-0">
              Aplica a todo el sistema (no por empresa). Puede limitar módulos enteros o vistas individuales.
            </p>
          </div>
          ${this.statusBadge(st)}
        </div>

        <div class="row g-3 mb-3">
          <div class="col-md-6">
            <div class="card shadow-sm h-100">
              <div class="card-body">
                <div class="small text-muted mb-1">Cliente</div>
                <div class="fw-semibold">${this.escapeHtml(st.customer || '—')}</div>
                <div class="small text-muted mt-3 mb-1">Vencimiento</div>
                <div>${this.escapeHtml(this.formatDate(st.expiresAt))}</div>
                <div class="small text-muted mt-3 mb-1">Id licencia</div>
                <div class="small font-monospace">${this.escapeHtml(st.licenseId || '—')}</div>
                ${
                  st.notes
                    ? `<div class="small text-muted mt-3 mb-1">Notas</div><div class="small">${this.escapeHtml(st.notes)}</div>`
                    : ''
                }
                <div class="small text-muted mt-3">${this.escapeHtml(st.message || '')}</div>
                ${
                  !st.hasPublicKey
                    ? `<div class="alert alert-warning mt-3 mb-0 py-2 small">
                         Falta <code>config/license-public.pem</code>. Ejecute el generador una vez para crearla.
                       </div>`
                    : ''
                }
              </div>
            </div>
          </div>
          <div class="col-md-6">
            <div class="card shadow-sm h-100">
              <div class="card-body">
                <h3 class="h6">Activar licencia</h3>
                <p class="small text-muted">Cargue el archivo <code>.json</code> o descárguelo desde la nube (TOKENS.LICENCIA).</p>
                <input type="file" class="form-control form-control-sm mb-2" id="licencia-file" accept=".json,application/json">
                <div class="d-flex flex-wrap gap-2">
                  <button type="button" class="btn btn-sm btn-primary" id="licencia-btn-activar">
                    <i class="fa-solid fa-key me-1"></i>Activar archivo
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-primary" id="licencia-btn-from-host">
                    <i class="fa-solid fa-cloud-arrow-down me-1"></i>Descargar desde la nube
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-secondary" id="licencia-btn-reload">
                    <i class="fa-solid fa-rotate me-1"></i>Recargar
                  </button>
                  ${
                    st.mode === 'licensed' || st.status === 'expired' || st.status === 'invalid'
                      ? `<button type="button" class="btn btn-sm btn-outline-danger" id="licencia-btn-quitar">
                           Quitar licencia
                         </button>`
                      : ''
                  }
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card shadow-sm">
          <div class="card-header py-2 fw-semibold">Módulos y vistas</div>
          <div class="card-body">
            ${catalog
              .map((m) => {
                const labels = m.menuLabels || (m.menus || []).map((key) => ({ key, label: key }));
                const enabledCount = labels.filter(
                  (x) => activeMenus === null || activeMenus.has(x.key)
                ).length;
                const partial = activeMenus !== null && enabledCount > 0 && enabledCount < labels.length;
                const allOn = activeMenus === null || enabledCount === labels.length;
                return `
                <div class="mb-3 pb-3 border-bottom">
                  <div class="d-flex align-items-center gap-2 mb-2">
                    <i class="fa-solid ${allOn ? 'fa-circle-check text-success' : partial ? 'fa-circle-minus text-warning' : 'fa-circle-xmark text-muted'}"></i>
                    <strong class="small">${this.escapeHtml(m.title)}</strong>
                    <span class="small text-muted">${enabledCount}/${labels.length} vistas</span>
                  </div>
                  <div class="d-flex flex-wrap gap-1">
                    ${labels
                      .map((x) => {
                        const on = activeMenus === null || activeMenus.has(x.key);
                        return `<span class="badge ${on ? 'text-bg-success' : 'text-bg-light text-muted'}">${this.escapeHtml(x.label)}</span>`;
                      })
                      .join('')}
                  </div>
                </div>`;
              })
              .join('')}
            ${
              st.mode === 'open'
                ? `<p class="small text-muted mb-0">Modo abierto (LICENSE_OPEN=1): sin archivo de licencia todas las vistas están habilitadas.</p>`
                : st.status === 'missing' || st.status === 'expired' || st.status === 'invalid'
                  ? `<p class="small text-warning mb-0">Sin licencia activa solo está disponible esta pantalla. Active una licencia válida para usar el resto del sistema.</p>`
                  : ''
            }
          </div>
        </div>
      </div>`;

    this.bind();
  },

  bind() {
    this._container?.querySelector('#licencia-btn-reload')?.addEventListener('click', async () => {
      try {
        await this.refresh();
        this.render();
        if (typeof TipoEmpleadoAccess !== 'undefined') {
          TipoEmpleadoAccess.applySidebarVisibility();
        }
        if (typeof LicenseAccess !== 'undefined') {
          LicenseAccess.applyAfterRoleFilter();
        }
        F.toast('Estado de licencia actualizado', 'success');
      } catch (err) {
        F.toast(err.message || 'Error', 'error');
      }
    });

    this._container?.querySelector('#licencia-btn-from-host')?.addEventListener('click', () => {
      this.onDownloadFromHost().catch(() => {});
    });

    this._container?.querySelector('#licencia-btn-activar')?.addEventListener('click', async () => {
      const input = this._container?.querySelector('#licencia-file');
      const file = input?.files?.[0];
      if (!file) {
        F.toast('Seleccione un archivo de licencia', 'warning');
        return;
      }
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/license/activate', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo activar');
        this._status = data;
        if (typeof LicenseAccess !== 'undefined') {
          LicenseAccess._status = data;
          LicenseAccess.updateExpiryBadge();
        }
        this.render();
        if (typeof TipoEmpleadoAccess !== 'undefined') {
          TipoEmpleadoAccess.applySidebarVisibility();
        }
        if (typeof LicenseAccess !== 'undefined') {
          LicenseAccess.applyAfterRoleFilter();
        }
        F.toast('Licencia activada', 'success');
      } catch (err) {
        F.toast(err.message || 'Error al activar', 'error');
      }
    });

    this._container?.querySelector('#licencia-btn-quitar')?.addEventListener('click', async () => {
      const ok = await CatalogosUI.fireConfirm({
        title: '¿Quitar licencia?',
        text: 'Al quitar la licencia solo quedará disponible la opción Licencia hasta activar una nueva.',
      });
      if (!ok) return;
      try {
        const data = await F.fetchJson('/api/license?confirm=QUITAR', { method: 'DELETE' });
        this._status = data;
        if (typeof LicenseAccess !== 'undefined') {
          LicenseAccess._status = data;
          LicenseAccess.updateExpiryBadge();
        }
        this.render();
        if (typeof TipoEmpleadoAccess !== 'undefined') {
          TipoEmpleadoAccess.applySidebarVisibility();
        }
        if (typeof LicenseAccess !== 'undefined') {
          LicenseAccess.applyAfterRoleFilter();
        }
        F.toast('Licencia eliminada', 'success');
      } catch (err) {
        F.toast(err.message || 'Error', 'error');
      }
    });
  },

  async onDownloadFromHost() {
    const btn = this._container?.querySelector('#licencia-btn-from-host');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Descargando…';
    }
    try {
      const data = await F.fetchJson(`/api/license/from-host?_=${Date.now()}`, { cache: 'no-store' });
      const doc = data.license;
      if (!doc) throw new Error('La nube no devolvió licencia');

      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || 'onneb-license.json';
      a.click();
      URL.revokeObjectURL(url);

      const activate = await CatalogosUI.fireConfirm({
        title: 'Licencia descargada',
        text: '¿Desea activarla ahora en esta instalación?',
        confirmText: 'Sí, activar',
        cancelText: 'Solo descargar',
      });
      if (activate) {
        const res = await fetch('/api/license/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ license: doc }),
        });
        const activated = await res.json();
        if (!res.ok) throw new Error(activated.error || 'No se pudo activar');
        this._status = activated;
        if (typeof LicenseAccess !== 'undefined') {
          LicenseAccess._status = activated;
          LicenseAccess.updateExpiryBadge();
        }
        this.render();
        if (typeof TipoEmpleadoAccess !== 'undefined') {
          TipoEmpleadoAccess.applySidebarVisibility();
        }
        if (typeof LicenseAccess !== 'undefined') {
          LicenseAccess.applyAfterRoleFilter();
        }
        F.toast('Licencia descargada y activada', 'success');
      } else {
        F.toast('Licencia descargada. Puede activarla con el archivo.', 'success');
        this.render();
      }
    } catch (err) {
      F.toast(err.message || 'Error al descargar desde la nube', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down me-1"></i>Descargar desde la nube';
      }
    }
  },
};
