/**
 * Configuraciones → WhatsApp: contactos y envíos programados (por EMPNIT).
 */
const WhatsappProgramacionUI = {
  DIAS: [
    { id: '1', label: 'L' },
    { id: '2', label: 'M' },
    { id: '3', label: 'X' },
    { id: '4', label: 'J' },
    { id: '5', label: 'V' },
    { id: '6', label: 'S' },
    { id: '7', label: 'D' },
  ],

  _empnit: '',
  _data: { dialCode: '502', reportes: [], contactos: [], programacion: [] },
  _loadError: '',
  _form: null,

  setLoadError(message) {
    this._loadError = message || 'No se pudo cargar la programación';
  },

  async load(empnit) {
    this._empnit = String(empnit || '').trim();
    this._loadError = '';
    if (!this._empnit) {
      this._data = { dialCode: '502', reportes: [], contactos: [], programacion: [] };
      return this._data;
    }
    const data = await F.fetchJson(
      `/api/whatsapp/programacion?empnit=${encodeURIComponent(this._empnit)}&_=${Date.now()}`,
      { cache: 'no-store' }
    );
    this._data = {
      dialCode: data.dialCode || '502',
      reportes: Array.isArray(data.reportes) ? data.reportes : [],
      contactos: Array.isArray(data.contactos) ? data.contactos : [],
      programacion: Array.isArray(data.programacion) ? data.programacion : [],
    };
    return this._data;
  },

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  reporteNombre(codigo) {
    const found = (this._data.reportes || []).find((r) => r.codigo === codigo);
    return found?.nombre || codigo || '—';
  },

  contactoById(id) {
    return (this._data.contactos || []).find((c) => String(c.ID) === String(id)) || null;
  },

  diasLabel(dias) {
    const set = new Set(String(dias || '').split(',').filter(Boolean));
    if (set.size === 7) return 'Todos los días';
    const names = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 7: 'Dom' };
    return this.DIAS.filter((d) => set.has(d.id)).map((d) => names[d.id]).join(', ') || '—';
  },

  render() {
    return `<div id="config-wa-programacion" class="config-wa-agenda card shadow-sm">${this.renderBody()}</div>`;
  },

  renderBody() {
    if (this._loadError) {
      return `
        <div class="card-body">
          <h6 class="mb-1"><i class="fa-solid fa-clock me-1 text-success"></i>Envíos programados</h6>
          <p class="small text-danger mb-0">${this.escapeHtml(this._loadError)}</p>
        </div>`;
    }
    if (!this._empnit) {
      return `
        <div class="card-body">
          <h6 class="mb-1"><i class="fa-solid fa-clock me-1 text-success"></i>Envíos programados</h6>
          <p class="small text-muted mb-0">Seleccione una empresa para configurar los envíos.</p>
        </div>`;
    }
    return `
      <div class="card-body">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-2">
          <div>
            <h6 class="mb-1"><i class="fa-solid fa-clock me-1 text-success"></i>Envíos programados</h6>
            <p class="small text-muted mb-0">
              El servidor envía el PDF a la hora indicada, sin abrir el navegador,
              si WhatsApp está conectado y el ERP está encendido.
              Si la hora de hoy ya pasó y la tarea existía antes, se envía al reiniciar.
            </p>
          </div>
        </div>
        ${this.renderProgramacion()}
        ${this.renderContactos()}
      </div>`;
  },

  renderContactos() {
    const editing = this._form?.kind === 'contacto' ? this._form : null;
    const rows = (this._data.contactos || []).map((c) => `
      <tr>
        <td>${this.escapeHtml(c.NOMBRE)}</td>
        <td><code>${this.escapeHtml(c.TELEFONO)}</code></td>
        <td>${c.ACTIVO === 'SI' ? 'Activo' : 'Inactivo'}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-wa-edit-contacto="${c.ID}">Editar</button>
          <button type="button" class="btn btn-outline-danger btn-sm" data-wa-del-contacto="${c.ID}">Quitar</button>
        </td>
      </tr>`).join('');
    const form = editing ? this.renderContactoForm(editing) : '';
    return `
      <div class="config-wa-block">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h6 class="mb-0 small text-uppercase text-muted">Contactos</h6>
          <button type="button" class="btn btn-outline-success btn-sm" id="btn-wa-nuevo-contacto">
            <i class="fa-solid fa-user-plus me-1"></i>Nuevo contacto
          </button>
        </div>
        ${form}
        ${
          rows
            ? `<div class="table-responsive"><table class="table table-sm align-middle mb-0">
                <thead><tr><th>Nombre</th><th>Teléfono</th><th>Estado</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
              </table></div>`
            : '<p class="small text-muted mb-0">Aún no hay contactos. Agregue a Raúl, Pedro, Carlos…</p>'
        }
      </div>`;
  },

  renderContactoForm(form) {
    const dial = this.escapeHtml(this._data.dialCode || '502');
    return `
      <form class="config-wa-form border rounded p-2 mb-2" id="form-wa-contacto">
        <div class="row g-2">
          <div class="col-md-5">
            <label class="form-label small mb-1">Nombre</label>
            <input class="form-control form-control-sm" name="nombre" required maxlength="120" value="${this.escapeHtml(form.nombre || '')}">
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-1">Teléfono</label>
            <input class="form-control form-control-sm" name="telefono" required inputmode="tel" placeholder="8 dígitos" value="${this.escapeHtml(form.telefono || '')}">
            <div class="form-text">Se guarda con prefijo +${dial}.</div>
          </div>
          <div class="col-md-3 d-flex align-items-end">
            <div class="form-check mb-1">
              <input class="form-check-input" type="checkbox" name="activo" id="wa-contacto-activo" ${form.activo !== 'NO' ? 'checked' : ''}>
              <label class="form-check-label small" for="wa-contacto-activo">Activo</label>
            </div>
          </div>
        </div>
        <div class="d-flex gap-2 mt-2">
          <button type="submit" class="btn btn-success btn-sm">Guardar contacto</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" data-wa-cancel>Cancelar</button>
        </div>
      </form>`;
  },

  renderProgramacion() {
    const editing = this._form?.kind === 'programa' ? this._form : null;
    const contactos = this._data.contactos || [];
    const rows = (this._data.programacion || []).map((p) => {
      const names = (p.contactos || [])
        .map((id) => this.contactoById(id)?.NOMBRE)
        .filter(Boolean)
        .join(', ');
      return `
        <tr>
          <td>${this.escapeHtml(this.reporteNombre(p.REPORTE))}</td>
          <td>${this.escapeHtml(p.HORA)}</td>
          <td>${this.escapeHtml(this.diasLabel(p.DIAS))}</td>
          <td>${this.escapeHtml(names || '—')}</td>
          <td>${p.ACTIVO === 'SI' ? 'Activo' : 'Inactivo'}</td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-wa-edit-prog="${p.ID}">Editar</button>
            <button type="button" class="btn btn-outline-danger btn-sm" data-wa-del-prog="${p.ID}">Quitar</button>
          </td>
        </tr>`;
    }).join('');
    return `
      <div class="config-wa-block">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <h6 class="mb-0 small text-uppercase text-muted">Programación</h6>
          <button type="button" class="btn btn-success btn-sm" id="btn-wa-nueva-prog">
            <i class="fa-solid fa-plus me-1"></i>Nuevo envío
          </button>
        </div>
        ${editing ? this.renderProgramaForm(editing) : ''}
        ${
          !contactos.length
            ? '<p class="small text-muted">Primero agregue al menos un contacto.</p>'
            : ''
        }
        ${
          rows
            ? `<div class="table-responsive"><table class="table table-sm align-middle mb-0">
                <thead><tr><th>Reporte</th><th>Hora</th><th>Días</th><th>Contactos</th><th>Estado</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
              </table></div>`
            : '<p class="small text-muted mb-0">No hay envíos programados.</p>'
        }
      </div>`;
  },

  renderProgramaForm(form) {
    const selected = new Set((form.contactos || []).map(String));
    const dias = new Set(form.dias || ['1', '2', '3', '4', '5', '6', '7']);
    const options = (this._data.reportes || []).map((r) => `
      <option value="${this.escapeHtml(r.codigo)}" ${form.reporte === r.codigo ? 'selected' : ''}>${this.escapeHtml(r.nombre)}</option>
    `).join('');
    const detalle = (this._data.reportes || []).find((r) => r.codigo === form.reporte)?.detalle || '';
    const checks = (this._data.contactos || [])
      .filter((c) => c.ACTIVO === 'SI' || selected.has(String(c.ID)))
      .map((c) => `
        <label class="form-check form-check-inline small me-3">
          <input class="form-check-input" type="checkbox" name="contacto" value="${c.ID}" ${selected.has(String(c.ID)) ? 'checked' : ''}>
          ${this.escapeHtml(c.NOMBRE)}
        </label>`).join('');
    const dayBtns = this.DIAS.map((d) => `
      <button type="button" class="btn btn-sm config-wa-day${dias.has(d.id) ? ' is-on' : ''}" data-wa-dia="${d.id}" aria-pressed="${dias.has(d.id) ? 'true' : 'false'}">${d.label}</button>
    `).join('');
    return `
      <form class="config-wa-form border rounded p-2 mb-2" id="form-wa-programa">
        <div class="row g-2">
          <div class="col-lg-7">
            <label class="form-label small mb-1">Reporte</label>
            <select class="form-select form-select-sm" name="reporte" id="wa-reporte" required>
              <option value="">Seleccione…</option>
              ${options}
            </select>
            <div class="form-text" id="wa-reporte-detalle">${this.escapeHtml(detalle)}</div>
          </div>
          <div class="col-lg-2">
            <label class="form-label small mb-1">Hora</label>
            <input class="form-control form-control-sm" type="time" name="hora" required value="${this.escapeHtml(form.hora || '17:00')}">
          </div>
          <div class="col-lg-3 d-flex align-items-end">
            <div class="form-check mb-1">
              <input class="form-check-input" type="checkbox" name="activo" id="wa-prog-activo" ${form.activo !== 'NO' ? 'checked' : ''}>
              <label class="form-check-label small" for="wa-prog-activo">Activo</label>
            </div>
          </div>
        </div>
        <div class="mt-2">
          <div class="form-label small mb-1">Días</div>
          <div class="d-flex flex-wrap gap-1" id="wa-dias">${dayBtns}</div>
        </div>
        <div class="mt-2">
          <div class="form-label small mb-1">Enviar a</div>
          ${checks || '<p class="small text-muted mb-0">No hay contactos activos.</p>'}
        </div>
        <div class="d-flex gap-2 mt-2">
          <button type="submit" class="btn btn-success btn-sm">Guardar envío</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" data-wa-cancel>Cancelar</button>
        </div>
      </form>`;
  },

  paint() {
    const root = document.getElementById('config-wa-programacion');
    if (!root) return;
    root.innerHTML = this.renderBody();
    this.bind(root);
  },

  bind() {
    const host = document.getElementById('config-wa-programacion');
    if (!host || host.dataset.waBound === '1') return;
    host.dataset.waBound = '1';
    host.addEventListener('click', (ev) => this.onClick(ev));
    host.addEventListener('submit', (ev) => this.onSubmit(ev));
    host.addEventListener('change', (ev) => this.onChange(ev));
  },

  onChange(ev) {
    if (ev.target?.id !== 'wa-reporte') return;
    const detalle = (this._data.reportes || []).find((r) => r.codigo === ev.target.value)?.detalle || '';
    const el = document.getElementById('wa-reporte-detalle');
    if (el) el.textContent = detalle;
  },

  async onClick(ev) {
    const nuevoC = ev.target.closest('#btn-wa-nuevo-contacto');
    const nuevaP = ev.target.closest('#btn-wa-nueva-prog');
    const cancel = ev.target.closest('[data-wa-cancel]');
    const editC = ev.target.closest('[data-wa-edit-contacto]');
    const delC = ev.target.closest('[data-wa-del-contacto]');
    const editP = ev.target.closest('[data-wa-edit-prog]');
    const delP = ev.target.closest('[data-wa-del-prog]');
    const dia = ev.target.closest('[data-wa-dia]');
    if (nuevoC) {
      this._form = { kind: 'contacto', id: null, nombre: '', telefono: '', activo: 'SI' };
      this.paint();
      return;
    }
    if (nuevaP) {
      if (!(this._data.contactos || []).some((c) => c.ACTIVO === 'SI')) {
        F.toast('Agregue un contacto activo primero', 'info');
        return;
      }
      this._form = {
        kind: 'programa',
        id: null,
        reporte: '',
        hora: '17:00',
        dias: ['1', '2', '3', '4', '5', '6', '7'],
        activo: 'SI',
        contactos: [],
      };
      this.paint();
      return;
    }
    if (cancel) {
      this._form = null;
      this.paint();
      return;
    }
    if (dia) {
      dia.classList.toggle('is-on');
      dia.setAttribute('aria-pressed', dia.classList.contains('is-on') ? 'true' : 'false');
      return;
    }
    if (editC) {
      const row = this.contactoById(editC.getAttribute('data-wa-edit-contacto'));
      if (!row) return;
      this._form = {
        kind: 'contacto',
        id: row.ID,
        nombre: row.NOMBRE,
        telefono: row.TELEFONO,
        activo: row.ACTIVO,
      };
      this.paint();
      return;
    }
    if (editP) {
      const row = (this._data.programacion || []).find((p) => String(p.ID) === editP.getAttribute('data-wa-edit-prog'));
      if (!row) return;
      this._form = {
        kind: 'programa',
        id: row.ID,
        reporte: row.REPORTE,
        hora: row.HORA,
        dias: String(row.DIAS || '').split(',').filter(Boolean),
        activo: row.ACTIVO,
        contactos: row.contactos || [],
      };
      this.paint();
      return;
    }
    if (delC) {
      await this.removeContacto(delC.getAttribute('data-wa-del-contacto'));
      return;
    }
    if (delP) {
      await this.removePrograma(delP.getAttribute('data-wa-del-prog'));
    }
  },

  async onSubmit(ev) {
    const form = ev.target;
    if (form?.id !== 'form-wa-contacto' && form?.id !== 'form-wa-programa') return;
    ev.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      if (form.id === 'form-wa-contacto') await this.saveContacto(form);
      else await this.savePrograma(form);
    } catch (err) {
      F.toast(err.message || 'No se pudo guardar', 'error');
      if (btn) btn.disabled = false;
    }
  },

  qs() {
    return `empnit=${encodeURIComponent(this._empnit)}`;
  },

  async saveContacto(form) {
    const payload = {
      empnit: this._empnit,
      nombre: form.nombre.value,
      telefono: form.telefono.value,
      activo: form.activo.checked ? 'SI' : 'NO',
    };
    const id = this._form?.id;
    await F.fetchJson(id ? `/api/whatsapp/programacion/contactos/${id}?${this.qs()}` : `/api/whatsapp/programacion/contactos?${this.qs()}`, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    this._form = null;
    await this.load(this._empnit);
    this.paint();
    F.toast('Contacto guardado', 'success');
  },

  async savePrograma(form) {
    const dias = [...form.querySelectorAll('[data-wa-dia].is-on')].map((btn) => btn.getAttribute('data-wa-dia'));
    const contactos = [...form.querySelectorAll('input[name="contacto"]:checked')].map((el) => Number(el.value));
    const payload = {
      empnit: this._empnit,
      reporte: form.reporte.value,
      hora: form.hora.value,
      dias,
      activo: form.activo.checked ? 'SI' : 'NO',
      contactos,
    };
    const id = this._form?.id;
    await F.fetchJson(id ? `/api/whatsapp/programacion/${id}?${this.qs()}` : `/api/whatsapp/programacion?${this.qs()}`, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    this._form = null;
    await this.load(this._empnit);
    this.paint();
    F.toast('Envío programado', 'success');
  },

  async removeContacto(id) {
    const ok = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Quitar contacto',
      text: 'Se eliminará este contacto de la empresa.',
      showCancelButton: true,
      confirmButtonText: 'Quitar',
    });
    if (!ok.isConfirmed) return;
    try {
      await F.fetchJson(`/api/whatsapp/programacion/contactos/${id}?${this.qs()}`, { method: 'DELETE' });
      await this.load(this._empnit);
      this.paint();
      F.toast('Contacto eliminado', 'success');
    } catch (err) {
      F.toast(err.message || 'No se pudo eliminar', 'error');
    }
  },

  async removePrograma(id) {
    const ok = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Quitar envío',
      text: 'Se eliminará esta programación. Los contactos se conservan.',
      showCancelButton: true,
      confirmButtonText: 'Quitar',
    });
    if (!ok.isConfirmed) return;
    try {
      await F.fetchJson(`/api/whatsapp/programacion/${id}?${this.qs()}`, { method: 'DELETE' });
      await this.load(this._empnit);
      this.paint();
      F.toast('Envío eliminado', 'success');
    } catch (err) {
      F.toast(err.message || 'No se pudo eliminar', 'error');
    }
  },
};
