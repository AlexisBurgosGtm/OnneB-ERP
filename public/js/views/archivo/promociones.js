/**
 * Archivo → Promociones — campañas (PROMOCIONES) y registros asociados.
 * El ID es IDENTITY: no se muestra ni se envía al crear.
 */
const PromocionesView = {
  _container: null,
  _rows: [],
  _filterQuery: '',
  _registros: [],
  _editRegId: null,
  _promoModal: null,
  _fabricantes: [],

  PROMO_TIPOS: [
    { value: 'POR IMPORTE', label: 'POR IMPORTE' },
    { value: 'POR DOCUMENTO', label: 'POR DOCUMENTO' },
    { value: 'POR FABRICANTE', label: 'POR FABRICANTE' },
  ],

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  currencySymbol() {
    try {
      const parts = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).formatToParts(0);
      return parts.find((p) => p.type === 'currency')?.value?.trim() || 'Q';
    } catch {
      return 'Q';
    }
  },

  apiBase(path = '') {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const base = `/api/promociones${path}`;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}empnit=${encodeURIComponent(empNit)}`;
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) return this.escapeHtml(s);
    const d = String(dt.getDate()).padStart(2, '0');
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    return `${d}/${mo}/${dt.getFullYear()}`;
  },

  toDateInput(value) {
    if (!value) return '';
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  },

  truncate(text, max = 80) {
    const s = String(text || '').trim();
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
  },

  formatNum(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('es', {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
  },

  findRow(id) {
    return this._rows.find((r) => String(r.ID) === String(id));
  },

  getFilteredRows() {
    const q = this._filterQuery.trim().toLowerCase();
    if (!q) return this._rows;
    return this._rows.filter((r) =>
      [
        r.NOMBRE,
        r.STATUS,
        r.TIPO,
        this.formatFecha(r.FECHA_INICIO),
        this.formatFecha(r.FECHA_FIN),
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .some((v) => v.includes(q))
    );
  },

  statusBadgeHtml(row) {
    const status = String(row.STATUS || '').toUpperCase() === 'FINALIZADA' ? 'FINALIZADA' : 'ACTIVA';
    const cls = status === 'ACTIVA' ? 'text-bg-success' : 'text-bg-danger';
    return `<button type="button" class="badge ${cls} border-0 promo-status-badge"
      data-id="${this.escapeHtml(row.ID)}" title="Cambiar estado">${this.escapeHtml(status)}</button>`;
  },

  renderTableBodyHtml(rows) {
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún registro coincide con la búsqueda'
        : 'Sin campañas de promociones';
      return `<tr><td colspan="6" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const nombre = this.escapeHtml(this.truncate(row.NOMBRE, 90));
        const nombreFull = this.escapeHtml(row.NOMBRE || '');
        const tipo = this.escapeHtml(row.TIPO || '—');
        return `<tr>
          <td title="${nombreFull}">${nombre}</td>
          <td class="text-nowrap small">${tipo}</td>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(row.FECHA_INICIO))}</td>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(row.FECHA_FIN))}</td>
          <td class="text-center">${this.statusBadgeHtml(row)}</td>
          <td class="text-end">
            <div class="catalogo-acciones">
              <button type="button" class="btn btn-sm btn-outline-success promo-btn-puntos"
                data-id="${this.escapeHtml(row.ID)}" title="Puntos acumulados">
                <i class="fa-solid fa-star"></i> Puntos Acumulados
              </button>
              <button type="button" class="btn btn-sm btn-outline-primary promo-btn-registros"
                data-id="${this.escapeHtml(row.ID)}" title="Registros de la promoción">
                <i class="fa-solid fa-list"></i> Registros
              </button>
              ${CatalogosUI.btnEditar(row.ID, 'id')}
              ${CatalogosUI.btnEliminar(row.ID, 'id')}
            </div>
          </td>
        </tr>`;
      })
      .join('');
  },

  badgeText(filteredCount, totalCount) {
    const empNombre = F.getEmpNitNombre() || '';
    const extra = empNombre ? ` · ${this.escapeHtml(empNombre)}` : '';
    const q = this._filterQuery.trim();
    const countLabel =
      q && filteredCount !== totalCount
        ? `${filteredCount} de ${totalCount} promocion(es)`
        : `${totalCount} promocion(es)`;
    return `<i class="fa-solid fa-tags me-1"></i>${countLabel}${extra}`;
  },

  updateTableView() {
    const filtered = this.getFilteredRows();
    const tbody = this._container?.querySelector('#promociones-tbody');
    const badge = this._container?.querySelector('#promociones-count');
    if (tbody) {
      tbody.innerHTML = this.renderTableBodyHtml(filtered);
      this.bindRowActions();
    }
    if (badge) badge.innerHTML = this.badgeText(filtered.length, this._rows.length);
  },

  renderTable() {
    const filtered = this.getFilteredRows();
    return `
      <div class="catalogo-empresa-panel catalogo-vista-wrap">
        <h2 class="catalogo-vista-title h5 mb-2 px-1">Promociones</h2>
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 px-1">
          <span class="catalogo-empresa-badge" id="promociones-count">${this.badgeText(
            filtered.length,
            this._rows.length
          )}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-promociones-refresh">
            <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
          </button>
        </div>
        <div class="catalogo-empresa-search-wrap px-1 mb-2">
          <div class="input-group input-group-sm catalogo-empresa-search">
            <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="promociones-search"
              placeholder="Buscar por nombre, estado o fecha…" value="${this.escapeHtml(this._filterQuery)}"
              autocomplete="off" spellcheck="false">
            <button type="button" class="btn btn-outline-secondary" id="btn-promociones-search-clear"
              title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped">
            <thead>
              <tr>
                <th>Nombre / descripción</th>
                <th>Tipo</th>
                <th>Fecha inicio</th>
                <th>Fecha fin</th>
                <th class="text-center">Estado</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="promociones-tbody">${this.renderTableBodyHtml(filtered)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-promociones-nuevo')}
      </div>`;
  },

  formHtml(row = {}) {
    const tipoSel = String(row.TIPO || '').trim().toUpperCase();
    const tipoOpts = this.PROMO_TIPOS.map(
      (t) =>
        `<option value="${t.value}"${tipoSel === t.value ? ' selected' : ''}>${t.label}</option>`
    ).join('');
    const fabOpts = (this._fabricantes || [])
      .map((f) => {
        const selected = String(f.CODCLAUNO) === String(row.CODCLAUNO ?? '') ? ' selected' : '';
        return `<option value="${this.escapeHtml(f.CODCLAUNO)}"${selected}>${this.escapeHtml(
          f.DESCLAUNO || f.CODCLAUNO
        )}</option>`;
      })
      .join('');
    const showFab = tipoSel === 'POR FABRICANTE';
    return `
      <div class="mb-2 text-start">
        <label class="form-label small mb-0" for="promo-nombre">Nombre / descripción</label>
        <textarea id="promo-nombre" class="form-control form-control-sm" rows="4"
          required placeholder="Descripción larga de la campaña">${this.escapeHtml(row.NOMBRE || '')}</textarea>
      </div>
      <div class="row g-2 mb-2">
        <div class="col-12 col-sm-6">
          <label class="form-label small mb-0" for="promo-fecha-inicio">Fecha inicio</label>
          <input type="date" id="promo-fecha-inicio" class="form-control form-control-sm"
            value="${this.escapeHtml(this.toDateInput(row.FECHA_INICIO))}">
        </div>
        <div class="col-12 col-sm-6">
          <label class="form-label small mb-0" for="promo-fecha-fin">Fecha fin</label>
          <input type="date" id="promo-fecha-fin" class="form-control form-control-sm"
            value="${this.escapeHtml(this.toDateInput(row.FECHA_FIN))}">
        </div>
      </div>
      <div class="mb-2 text-start">
        <label class="form-label small mb-0" for="promo-tipo">Tipo</label>
        <select id="promo-tipo" class="form-select form-select-sm">
          <option value="">— Seleccione —</option>
          ${tipoOpts}
        </select>
      </div>
      <div class="mb-2 text-start${showFab ? '' : ' d-none'}" id="promo-fab-wrap">
        <label class="form-label small mb-0" for="promo-codclauno">Fabricante</label>
        <select id="promo-codclauno" class="form-select form-select-sm">
          <option value="">— Seleccione fabricante —</option>
          ${fabOpts}
        </select>
      </div>
      <div class="mb-2 text-start">
        <label class="form-label small mb-0" for="promo-factor-puntos">Factor puntos</label>
        <input type="number" id="promo-factor-puntos" class="form-control form-control-sm"
          min="0" step="any" placeholder="Puntos por venta / importe / documento"
          value="${this.escapeHtml(row.FACTOR_PUNTOS ?? '')}">
        <p class="small text-muted mb-0 mt-1">Indica a cuántos puntos equivale cada venta (por importe o por documento).</p>
      </div>
      <div class="mb-2 text-start">
        <label class="form-label small mb-0" for="promo-valor-punto">Valor punto (${this.escapeHtml(this.currencySymbol())})</label>
        <input type="number" id="promo-valor-punto" class="form-control form-control-sm"
          min="0" step="any" placeholder="${this.escapeHtml(this.formatMoney(1))}"
          value="${this.escapeHtml(row.VALORPUNTO ?? '')}">
        <p class="small text-muted mb-0 mt-1">Equivale en dinero a cada punto acumulado (ej. canje).</p>
      </div>`;
  },

  syncTipoFields() {
    const tipo = String(document.getElementById('promo-tipo')?.value || '')
      .trim()
      .toUpperCase();
    const wrap = document.getElementById('promo-fab-wrap');
    if (wrap) wrap.classList.toggle('d-none', tipo !== 'POR FABRICANTE');
  },

  async ensureFabricantes() {
    if (this._fabricantes?.length) return this._fabricantes;
    const data = await F.fetchJson(`${this.apiBase('/clasificacionuno')}&_=${Date.now()}`, {
      cache: 'no-store',
    });
    this._fabricantes = data.rows || [];
    return this._fabricantes;
  },

  readPromoForm() {
    const NOMBRE = document.getElementById('promo-nombre')?.value?.trim() || '';
    const FECHA_INICIO = document.getElementById('promo-fecha-inicio')?.value || '';
    const FECHA_FIN = document.getElementById('promo-fecha-fin')?.value || '';
    const TIPO = String(document.getElementById('promo-tipo')?.value || '')
      .trim()
      .toUpperCase();
    const factorRaw = document.getElementById('promo-factor-puntos')?.value;
    const valorPuntoRaw = document.getElementById('promo-valor-punto')?.value;
    const codClaRaw = document.getElementById('promo-codclauno')?.value;
    if (!NOMBRE) {
      Swal.showValidationMessage('El nombre / descripción es obligatorio');
      return false;
    }
    if (FECHA_INICIO && FECHA_FIN && FECHA_FIN < FECHA_INICIO) {
      Swal.showValidationMessage('La fecha fin no puede ser anterior a la fecha inicio');
      return false;
    }
    if (TIPO && !this.PROMO_TIPOS.some((t) => t.value === TIPO)) {
      Swal.showValidationMessage('Tipo de promoción inválido');
      return false;
    }
    let FACTOR_PUNTOS = null;
    if (factorRaw !== undefined && String(factorRaw).trim() !== '') {
      FACTOR_PUNTOS = Number(factorRaw);
      if (!Number.isFinite(FACTOR_PUNTOS) || FACTOR_PUNTOS < 0) {
        Swal.showValidationMessage('Factor puntos inválido');
        return false;
      }
    }
    let VALORPUNTO = null;
    if (valorPuntoRaw !== undefined && String(valorPuntoRaw).trim() !== '') {
      VALORPUNTO = Number(valorPuntoRaw);
      if (!Number.isFinite(VALORPUNTO) || VALORPUNTO < 0) {
        Swal.showValidationMessage('Valor punto inválido');
        return false;
      }
    }
    let CODCLAUNO = null;
    if (TIPO === 'POR FABRICANTE') {
      CODCLAUNO = parseInt(codClaRaw, 10);
      if (!Number.isFinite(CODCLAUNO) || CODCLAUNO <= 0) {
        Swal.showValidationMessage('Seleccione un fabricante');
        return false;
      }
    }
    return {
      NOMBRE,
      FECHA_INICIO: FECHA_INICIO || null,
      FECHA_FIN: FECHA_FIN || null,
      TIPO: TIPO || null,
      FACTOR_PUNTOS,
      VALORPUNTO,
      CODCLAUNO,
    };
  },

  async showForm(title, row = {}, isEdit = false) {
    try {
      await this.ensureFabricantes();
    } catch (err) {
      F.toast(err.message || 'No se pudieron cargar fabricantes', 'warning');
      this._fabricantes = [];
    }
    return CatalogosUI.fireForm({
      title,
      html: this.formHtml(row),
      width: 560,
      didOpen: () => {
        document.getElementById('promo-nombre')?.focus();
        document.getElementById('promo-tipo')?.addEventListener('change', () => this.syncTipoFields());
        this.syncTipoFields();
      },
      preConfirm: () => this.readPromoForm(),
    });
  },

  async onNuevo() {
    const data = await this.showForm('Nueva promoción');
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Promoción creada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEditar(id) {
    const row = this.findRow(id);
    if (!row) return;
    const data = await this.showForm('Editar promoción', row, true);
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Promoción actualizada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEliminar(id) {
    const row = this.findRow(id);
    const nombre = this.truncate(row?.NOMBRE || `promoción #${id}`, 60);
    const auth = await CatalogosUI.authorizeEliminarRegistro({
      label: nombre,
      tipo: 'promoción',
      kind: 'registro',
      title: '¿Eliminar promoción?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(nombre)}</strong> y sus registros asociados.</p>`,
      confirmText: 'Eliminar',
    });
    if (!auth) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: auth.pass != null ? String(auth.pass) : '__AUTORIZADO__' }),
      });
      F.toast('Promoción eliminada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onToggleStatus(id) {
    const row = this.findRow(id);
    if (!row) return;
    const current = String(row.STATUS || '').toUpperCase() === 'FINALIZADA' ? 'FINALIZADA' : 'ACTIVA';
    const next = current === 'ACTIVA' ? 'FINALIZADA' : 'ACTIVA';
    const ok = await CatalogosUI.fireConfirm({
      title: 'Cambiar estado',
      html: `<p class="mb-0">¿Pasar de <strong>${this.escapeHtml(current)}</strong> a <strong>${this.escapeHtml(
        next
      )}</strong>?</p>`,
      icon: 'question',
      confirmText: 'Cambiar',
    });
    if (!ok) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ STATUS: next }),
      });
      F.toast(`Estado: ${next}`, 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  registroFormHtml(row = {}) {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`;
    return `
      <input type="hidden" id="promo-reg-id" value="${this.escapeHtml(row.ID || '')}">
      <div class="mb-2 text-start">
        <label class="form-label small mb-0" for="promo-reg-fecha">Fecha</label>
        <input type="date" id="promo-reg-fecha" class="form-control form-control-sm"
          value="${this.escapeHtml(this.toDateInput(row.FECHA) || iso)}" required>
      </div>
      <div class="mb-2 text-start">
        <label class="form-label small mb-0" for="promo-reg-codigo">Código</label>
        <input type="number" id="promo-reg-codigo" class="form-control form-control-sm" step="1"
          value="${this.escapeHtml(row.CODIGO ?? '')}">
      </div>
      <div class="mb-2 text-start">
        <label class="form-label small mb-0" for="promo-reg-tipo">Tipo</label>
        <input type="text" id="promo-reg-tipo" class="form-control form-control-sm" maxlength="50"
          value="${this.escapeHtml(row.TIPO || '')}" required>
      </div>
      <div class="mb-2 text-start">
        <label class="form-label small mb-0" for="promo-reg-valor">Valor</label>
        <input type="text" id="promo-reg-valor" class="form-control form-control-sm" maxlength="200"
          value="${this.escapeHtml(row.VALOR || '')}">
      </div>
      <div class="d-flex flex-wrap gap-2">
        <button type="button" class="btn btn-sm btn-primary" id="promo-reg-guardar">
          <i class="fa-solid fa-floppy-disk me-1"></i><span id="promo-reg-guardar-label">Agregar</span>
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary d-none" id="promo-reg-cancelar">
          Cancelar edición
        </button>
      </div>`;
  },

  registrosListHtml() {
    if (!this._registros.length) {
      return '<p class="text-muted small mb-0 text-center py-3">Sin registros en esta promoción.</p>';
    }
    const body = this._registros
      .map(
        (r) => `<tr>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
          <td class="text-end">${this.escapeHtml(r.CODIGO ?? '—')}</td>
          <td>${this.escapeHtml(r.TIPO || '—')}</td>
          <td>${this.escapeHtml(r.VALOR || '—')}</td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-secondary promo-reg-editar" data-id="${this.escapeHtml(
              r.ID
            )}" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
            <button type="button" class="btn btn-sm btn-outline-danger promo-reg-eliminar" data-id="${this.escapeHtml(
              r.ID
            )}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>`
      )
      .join('');
    return `
      <div class="table-responsive" style="max-height: 22rem;">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th>Fecha</th>
              <th class="text-end">Código</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  },

  registrosModalHtml(promo) {
    return `
      <div class="row g-3 text-start promo-registros-modal">
        <div class="col-12 col-lg-4">
          <div class="card h-100">
            <div class="card-header py-2 small fw-semibold">Nuevo registro</div>
            <div class="card-body" id="promo-reg-form">${this.registroFormHtml()}</div>
          </div>
        </div>
        <div class="col-12 col-lg-8">
          <div class="card h-100">
            <div class="card-header py-2 small fw-semibold">
              ${this.escapeHtml(this.truncate(promo.NOMBRE || 'Promoción', 70))}
            </div>
            <div class="card-body p-2" id="promo-reg-list">${this.registrosListHtml()}</div>
          </div>
        </div>
      </div>`;
  },

  refreshRegistrosPanel() {
    const list = document.getElementById('promo-reg-list');
    if (list) list.innerHTML = this.registrosListHtml();
    this.bindRegistroListEvents();
  },

  setRegistroForm(row) {
    const form = document.getElementById('promo-reg-form');
    if (!form) return;
    form.innerHTML = this.registroFormHtml(row || {});
    const editing = Boolean(row?.ID);
    this._editRegId = editing ? row.ID : null;
    const label = document.getElementById('promo-reg-guardar-label');
    const cancel = document.getElementById('promo-reg-cancelar');
    const head = form.closest('.card')?.querySelector('.card-header');
    if (label) label.textContent = editing ? 'Guardar' : 'Agregar';
    if (cancel) cancel.classList.toggle('d-none', !editing);
    if (head) head.textContent = editing ? 'Editar registro' : 'Nuevo registro';
    this.bindRegistroFormEvents();
  },

  readRegistroForm() {
    const FECHA = document.getElementById('promo-reg-fecha')?.value || '';
    const codigoRaw = document.getElementById('promo-reg-codigo')?.value;
    const TIPO = document.getElementById('promo-reg-tipo')?.value?.trim() || '';
    const VALOR = document.getElementById('promo-reg-valor')?.value?.trim() || '';
    if (!FECHA) {
      F.toast('La fecha es obligatoria', 'warning');
      return null;
    }
    if (!TIPO) {
      F.toast('El tipo es obligatorio', 'warning');
      return null;
    }
    let CODIGO = null;
    if (codigoRaw !== undefined && String(codigoRaw).trim() !== '') {
      CODIGO = parseInt(codigoRaw, 10);
      if (!Number.isFinite(CODIGO)) {
        F.toast('El código debe ser un entero', 'warning');
        return null;
      }
    }
    return { FECHA, CODIGO, TIPO, VALOR };
  },

  bindRegistroFormEvents() {
    document.getElementById('promo-reg-guardar')?.addEventListener('click', () => {
      this.saveRegistro().catch((err) => F.toast(err.message || 'No se pudo guardar', 'error'));
    });
    document.getElementById('promo-reg-cancelar')?.addEventListener('click', () => this.setRegistroForm(null));
  },

  bindRegistroListEvents() {
    document.querySelectorAll('.promo-reg-editar').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'));
        const row = this._registros.find((r) => Number(r.ID) === id);
        if (row) this.setRegistroForm(row);
      });
    });
    document.querySelectorAll('.promo-reg-eliminar').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'));
        this.deleteRegistro(id).catch((err) => F.toast(err.message || 'No se pudo eliminar', 'error'));
      });
    });
  },

  async fetchRegistros(idPromo) {
    const data = await F.fetchJson(this.apiBase(`/${encodeURIComponent(idPromo)}/registros`));
    this._registros = data.rows || [];
    return data;
  },

  async saveRegistro() {
    const promo = this._promoModal;
    if (!promo) return;
    const payload = this.readRegistroForm();
    if (!payload) return;
    const editId = this._editRegId;
    if (editId) {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(promo.ID)}/registros/${encodeURIComponent(editId)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      F.toast('Registro actualizado', 'success');
    } else {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(promo.ID)}/registros`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      F.toast('Registro creado', 'success');
    }
    await this.fetchRegistros(promo.ID);
    this.setRegistroForm(null);
    this.refreshRegistrosPanel();
  },

  async deleteRegistro(id) {
    const promo = this._promoModal;
    if (!promo || !id) return;
    const promoId = promo.ID;
    const row = this._registros.find((r) => Number(r.ID) === Number(id));
    const label = `${this.formatFecha(row?.FECHA)} · ${row?.TIPO || 'registro'}`;
    const auth = await CatalogosUI.authorizeEliminarRegistro({
      label,
      tipo: 'registro de promoción',
      kind: 'registro',
      title: '¿Eliminar registro?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(label)}</strong>.</p>`,
      confirmText: 'Eliminar',
    });
    if (!auth) {
      await this.onRegistros(promoId);
      return;
    }
    await F.fetchJson(this.apiBase(`/${encodeURIComponent(promoId)}/registros/${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass: auth.pass != null ? String(auth.pass) : '__AUTORIZADO__' }),
    });
    F.toast('Registro eliminado', 'success');
    await this.onRegistros(promoId);
  },

  async onRegistros(id) {
    const promo = this.findRow(id);
    if (!promo) return;
    this._promoModal = promo;
    this._editRegId = null;
    try {
      await this.fetchRegistros(id);
    } catch (err) {
      F.toast(err.message || 'No se pudieron cargar los registros', 'error');
      return;
    }
    await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Registros de la promoción',
      width: '72rem',
      html: this.registrosModalHtml(promo),
      showConfirmButton: false,
      showCancelButton: true,
      allowOutsideClick: false,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
      didOpen: () => {
        this.bindRegistroFormEvents();
        this.bindRegistroListEvents();
      },
      didClose: () => {
        this._promoModal = null;
        this._registros = [];
        this._editRegId = null;
      },
    });
  },

  puntosMetricaLabel(tipo) {
    if (tipo === 'POR DOCUMENTO') return 'Documentos';
    if (tipo === 'POR FABRICANTE') return 'Importe fabricante';
    return 'Importe';
  },

  puntosAcumuladosListHtml(data) {
    const tipo = data.tipo || 'POR DOCUMENTO';
    const metricaLabel = this.puntosMetricaLabel(tipo);
    if (!data.rows?.length) {
      return '<p class="text-muted small mb-0 text-center py-3">Sin registros asociados a esta promoción.</p>';
    }
    const body = data.rows
      .map((r) => {
        const metrica =
          tipo === 'POR DOCUMENTO' ? this.formatNum(r.documentos, 0) : this.formatNum(r.totalPrecio, 2);
        return `<tr>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
          <td class="text-end">${this.escapeHtml(r.CODIGO ?? '—')}</td>
          <td>${this.escapeHtml(r.TIPO || '—')}</td>
          <td>${this.escapeHtml(r.VALOR || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatNum(r.documentos, 0))}</td>
          <td class="text-end">${this.escapeHtml(metrica)}</td>
          <td class="text-end">${this.escapeHtml(this.formatNum(r.puntos, 2))}</td>
          <td class="text-end">${this.escapeHtml(this.formatNum(r.puntosCobrados, 2))}</td>
          <td class="text-end fw-semibold text-success">
            ${this.escapeHtml(this.formatNum(r.puntosDisponibles, 2))}
            ${r.dineroDisponible != null && Number(data.valorPunto) > 0
              ? `<div class="small text-muted fw-normal">${this.escapeHtml(this.formatMoney(r.dineroDisponible))}</div>`
              : ''}
          </td>
        </tr>`;
      })
      .join('');
    const totMetrica =
      tipo === 'POR DOCUMENTO'
        ? this.formatNum(data.totales?.documentos, 0)
        : this.formatNum(data.totales?.totalPrecio, 2);
    return `
      <div class="table-responsive" style="max-height: 26rem;">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th>Fecha</th>
              <th class="text-end">Código</th>
              <th>Tipo reg.</th>
              <th>Valor</th>
              <th class="text-end">Docs</th>
              <th class="text-end">${this.escapeHtml(metricaLabel)}</th>
              <th class="text-end">Acum.</th>
              <th class="text-end">Cobrados</th>
              <th class="text-end">Disponibles</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot class="table-light">
            <tr>
              <th colspan="4" class="text-end">Totales</th>
              <th class="text-end">${this.escapeHtml(this.formatNum(data.totales?.documentos, 0))}</th>
              <th class="text-end">${this.escapeHtml(totMetrica)}</th>
              <th class="text-end">${this.escapeHtml(this.formatNum(data.totales?.puntos, 2))}</th>
              <th class="text-end">${this.escapeHtml(this.formatNum(data.totales?.puntosCobrados, 2))}</th>
              <th class="text-end">
                ${this.escapeHtml(this.formatNum(data.totales?.puntosDisponibles, 2))}
                ${data.totales?.dineroDisponible != null && Number(data.valorPunto) > 0
                  ? `<div class="small text-muted fw-normal">${this.escapeHtml(this.formatMoney(data.totales.dineroDisponible))}</div>`
                  : ''}
              </th>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  puntosAcumuladosModalHtml(data) {
    const promo = data.promo || {};
    const fab =
      data.tipo === 'POR FABRICANTE' && promo.DESCLAUNO
        ? ` · Fabricante: <strong>${this.escapeHtml(promo.DESCLAUNO)}</strong>`
        : '';
    return `
      <div class="text-start">
        <p class="small text-muted mb-2">
          Tipo: <strong>${this.escapeHtml(data.tipo || '—')}</strong>
          · Factor: <strong>${this.escapeHtml(this.formatNum(data.factor, 4))}</strong>
          · Valor punto: <strong>${this.escapeHtml(this.formatMoney(data.valorPunto ?? data.promo?.VALORPUNTO ?? 0))}</strong>${fab}
        </p>
        <p class="small text-muted mb-2">
          Facturas válidas FAC/FEL (operadas) con <code>PROMOCION_CODIGO</code> igual al código del registro.
        </p>
        ${this.puntosAcumuladosListHtml(data)}
      </div>`;
  },

  async onPuntosAcumulados(id) {
    const promo = this.findRow(id);
    if (!promo) return;
    try {
      const data = await F.fetchJson(
        `${this.apiBase(`/${encodeURIComponent(id)}/puntos-acumulados`)}&_=${Date.now()}`,
        { cache: 'no-store' }
      );
      await Swal.fire({
        ...CatalogosUI.modalBase(),
        title: `Puntos Acumulados — ${this.escapeHtml(this.truncate(promo.NOMBRE || '', 40))}`,
        width: '56rem',
        html: this.puntosAcumuladosModalHtml(data),
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
      });
    } catch (err) {
      F.toast(err.message || 'No se pudieron calcular los puntos', 'error');
    }
  },

  bindRowActions() {
    this._container?.querySelectorAll('.btn-catalogo-editar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEditar(btn.dataset.id));
    });
    this._container?.querySelectorAll('.btn-catalogo-eliminar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEliminar(btn.dataset.id));
    });
    this._container?.querySelectorAll('.promo-status-badge').forEach((btn) => {
      btn.addEventListener('click', () => this.onToggleStatus(btn.getAttribute('data-id')));
    });
    this._container?.querySelectorAll('.promo-btn-registros').forEach((btn) => {
      btn.addEventListener('click', () => this.onRegistros(btn.getAttribute('data-id')));
    });
    this._container?.querySelectorAll('.promo-btn-puntos').forEach((btn) => {
      btn.addEventListener('click', () => this.onPuntosAcumulados(btn.getAttribute('data-id')));
    });
  },

  bindSearch() {
    const search = document.getElementById('promociones-search');
    const clearBtn = document.getElementById('btn-promociones-search-clear');
    if (!search) return;
    const applyFilter = F.debounce(() => {
      this._filterQuery = search.value;
      this.updateTableView();
    }, 200);
    search.addEventListener('input', applyFilter);
    search.addEventListener('search', applyFilter);
    clearBtn?.addEventListener('click', () => {
      search.value = '';
      this._filterQuery = '';
      this.updateTableView();
      search.focus();
    });
  },

  bindEvents() {
    document.getElementById('btn-promociones-refresh')?.addEventListener('click', () => {
      this._filterQuery = '';
      this.load(this._container);
    });
    document.getElementById('btn-promociones-nuevo')?.addEventListener('click', () => this.onNuevo());
    this.bindSearch();
    this.bindRowActions();
  },

  async load(container) {
    const navToken =
      typeof F !== 'undefined' && typeof F.getMenuNavToken === 'function' ? F.getMenuNavToken() : 0;
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');

    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100" role="alert">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese seleccionando una empresa.
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando promociones…
      </div>`;

    try {
      const data = await F.fetchJson(`${this.apiBase()}&_=${Date.now()}`, { cache: 'no-store' });
      if (typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) return;
      this._rows = data.rows || [];
      container.innerHTML = this.renderTable();
      this.bindEvents();
    } catch (err) {
      if (typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) return;
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          No se pudo cargar: ${this.escapeHtml(err.message)}
        </div>`;
      F.toast('Error al cargar promociones', 'error');
    }
  },
};
