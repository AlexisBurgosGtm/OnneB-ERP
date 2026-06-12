/**
 * Vista Config general — Config PASS y opciones SINO
 */
const ConfigGeneralView = {
  ADMIN_CONFIG_ID: 2,
  OPERATOR_CONFIG_ID: 4,
  INVENTARIO_CONFIG_ID: 3,
  TICKET_VENTA_CONFIG_ID: 11,
  CLAVE_VENDEDOR_CONFIG_ID: 17,
  COBRO_PREDETERMINADO_CONFIG_ID: 15,

  SINO_OPTIONS: [
    {
      id: 3,
      title: 'Permite inventario negativo',
      icon: 'fa-boxes-stacked',
      fallbackDesc: 'Permite vender en negativo',
    },
    {
      id: 17,
      title: 'Solicita clave del vendedor en ventas',
      icon: 'fa-user-lock',
      fallbackDesc: 'Exige clave del vendedor al registrar ventas',
    },
    {
      id: 11,
      title: 'Imprime ticket al guardar venta',
      icon: 'fa-receipt',
      fallbackDesc: 'Imprime ticket automáticamente al finalizar la venta',
    },
    {
      id: 15,
      title: 'Tipo de cobro predeterminado',
      icon: 'fa-money-bill-wave',
      fallbackDesc: 'Determina si las nuevas facturas están por contado o crédito',
      labels: { SI: 'CRÉDITO', NO: 'CONTADO' },
    },
  ],

  PASS_CARDS: [
    {
      id: 2,
      slug: 'admin',
      title: 'Clave de administrador',
      fallbackDesc: 'Clave para autorizar movimientos',
      placeholder: 'Clave de administrador',
    },
    {
      id: 4,
      slug: 'operador',
      title: 'Clave de Operador',
      fallbackDesc: 'Clave del operador',
      placeholder: 'Clave de operador',
      ignoreDbDesc: true,
    },
  ],

  _container: null,
  _passMeta: {},
  _sinoMeta: {},
  _invSaldoPendientes: null,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  normalizeSino(value) {
    const s = String(value ?? 'NO')
      .trim()
      .toUpperCase();
    return s === 'SI' ? 'SI' : 'NO';
  },

  sinoButtonClass(sino) {
    return this.normalizeSino(sino) === 'SI' ? 'btn-empleado-activo--si' : 'btn-empleado-activo--no';
  },

  getSinoOption(configId) {
    return this.SINO_OPTIONS.find((opt) => opt.id === configId) || null;
  },

  getSinoLabel(option, sino) {
    const val = this.normalizeSino(sino);
    if (option?.labels?.[val]) return option.labels[val];
    return val;
  },

  getSinoToggleTitle(option, sino) {
    const val = this.normalizeSino(sino);
    const next = val === 'SI' ? 'NO' : 'SI';
    return `Clic para cambiar a ${this.getSinoLabel(option, next)}`;
  },

  renderSinoToggleButton(option, sino) {
    const val = this.normalizeSino(sino);
    const label = this.getSinoLabel(option, val);
    const wideClass = option.labels ? ' config-sino-toggle--wide' : '';
    return `
      <button
        type="button"
        class="btn btn-empleado-activo config-sino-toggle${wideClass} ${this.sinoButtonClass(val)}"
        data-config-id="${option.id}"
        data-sino="${val}"
        aria-pressed="${val === 'SI'}"
        title="${this.escapeHtml(this.getSinoToggleTitle(option, val))}"
      >${this.escapeHtml(label)}</button>`;
  },

  renderSinoCard(option, meta = {}) {
    const desc = meta.descripcion || option.fallbackDesc;
    const sino = this.normalizeSino(meta.sino);
    return `
      <div class="card config-card-compact" data-sino-card="${option.id}">
        <div class="card-body">
          <div class="config-card-row">
            <div class="config-card-info">
              <h6 class="card-title mb-0">
                <i class="fa-solid ${option.icon} me-1 text-primary"></i>${this.escapeHtml(option.title)}
              </h6>
              <p class="card-text mb-0">${this.escapeHtml(desc)}</p>
            </div>
            ${this.renderSinoToggleButton(option, sino)}
          </div>
        </div>
      </div>`;
  },

  renderPassCard(card, meta = {}) {
    const desc = card.ignoreDbDesc ? card.fallbackDesc : meta.descripcion || card.fallbackDesc;
    return `
      <div class="card config-card-compact mb-2">
        <div class="card-body">
          <h6 class="card-title mb-1">
            <i class="fa-solid fa-key me-1 text-primary"></i>${this.escapeHtml(card.title)}
          </h6>
          <p class="card-text mb-2">${this.escapeHtml(desc)}</p>
          <label for="input-${card.slug}-pass" class="form-label config-field-label">Valor actual (PASS)</label>
          <div class="input-group input-group-sm">
            <input
              type="password"
              class="form-control"
              id="input-${card.slug}-pass"
              name="${card.slug}-pass"
              autocomplete="off"
              spellcheck="false"
              placeholder="${this.escapeHtml(card.placeholder)}"
            >
            <button
              type="button"
              class="btn btn-toggle-pass"
              id="btn-toggle-${card.slug}-pass"
              aria-label="Mostrar u ocultar clave"
              title="Ver clave"
            >
              <i class="fa-solid fa-eye" aria-hidden="true"></i>
            </button>
            <button type="button" class="btn btn-actualizar-pass btn-sm" id="btn-actualizar-${card.slug}-pass">
              <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Actualizar
            </button>
          </div>
        </div>
      </div>`;
  },

  renderInvSaldoCard(pendientes = 0) {
    const count = Number(pendientes) || 0;
    const statusText =
      count === 0
        ? 'Todos los productos tienen registro en INVSALDO.'
        : `${count} producto(s) sin registro en INVSALDO.`;
    return `
      <div class="card config-card-compact mt-2">
        <div class="card-body">
          <h6 class="card-title mb-1">
            <i class="fa-solid fa-warehouse me-1 text-primary"></i>Sincronizar saldos de inventario
          </h6>
          <p class="card-text mb-1">
            Crea registros faltantes en <strong>INVSALDO</strong> (bodega 0, saldo inicial = existencia).
          </p>
          <p class="config-invsaldo-status mb-2" id="config-invsaldo-status">${this.escapeHtml(statusText)}</p>
          <button type="button" class="btn btn-actualizar-pass btn-sm" id="btn-sincronizar-invsaldo"
            ${count === 0 ? 'disabled' : ''}>
            <i class="fa-solid fa-wrench" aria-hidden="true"></i> Corregir INVSALDO
          </button>
        </div>
      </div>`;
  },

  renderAll() {
    const sinoCards = this.SINO_OPTIONS.map((opt) =>
      this.renderSinoCard(opt, this._sinoMeta[opt.id] || {})
    ).join('');
    return `
      <div class="config-general-panel">
        ${this.PASS_CARDS.map((card) => this.renderPassCard(card, this._passMeta[card.id] || {})).join('')}
        <div class="config-sino-grid">${sinoCards}</div>
        ${this.renderInvSaldoCard(this._invSaldoPendientes)}
      </div>`;
  },

  updateSinoButton(btn, sino, option) {
    const val = this.normalizeSino(sino);
    const opt = option || this.getSinoOption(parseInt(btn.getAttribute('data-config-id'), 10));
    btn.textContent = this.getSinoLabel(opt, val);
    btn.dataset.sino = val;
    btn.setAttribute('aria-pressed', val === 'SI' ? 'true' : 'false');
    btn.title = this.getSinoToggleTitle(opt, val);
    btn.classList.remove('btn-empleado-activo--si', 'btn-empleado-activo--no');
    btn.classList.add(this.sinoButtonClass(val));
  },

  bindPassEvents(card) {
    const input = document.getElementById(`input-${card.slug}-pass`);
    const btnToggle = document.getElementById(`btn-toggle-${card.slug}-pass`);
    btnToggle?.addEventListener('click', () => {
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btnToggle.querySelector('i').className = isPass ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      btnToggle.title = isPass ? 'Ocultar clave' : 'Ver clave';
    });

    document.getElementById(`btn-actualizar-${card.slug}-pass`)?.addEventListener('click', () => {
      this.onActualizarPass(card);
    });
  },

  bindEvents() {
    this.PASS_CARDS.forEach((card) => this.bindPassEvents(card));

    this._container?.querySelectorAll('.config-sino-toggle').forEach((btn) => {
      btn.addEventListener('click', () => this.onToggleSino(btn));
    });

    document.getElementById('btn-sincronizar-invsaldo')?.addEventListener('click', () => {
      this.onSincronizarInvSaldo();
    });
  },

  async fetchPass(configId) {
    return F.fetchJson(`/api/config/${configId}/pass?_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async fetchSino(configId) {
    return F.fetchJson(`/api/config/${configId}/sino?_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async onToggleSino(btn) {
    const configId = parseInt(btn.getAttribute('data-config-id'), 10);
    if (Number.isNaN(configId)) return;
    const current = this.normalizeSino(btn.getAttribute('data-sino'));
    const next = current === 'SI' ? 'NO' : 'SI';
    btn.disabled = true;
    try {
      await F.fetchJson(`/api/config/${configId}/sino`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sino: next }),
      });
      this._sinoMeta[configId] = { ...(this._sinoMeta[configId] || {}), sino: next };
      this.updateSinoButton(btn, next, this.getSinoOption(configId));
      F.toast('Configuración actualizada', 'success');
    } catch (err) {
      F.toast(err.message || 'Error al actualizar', 'error');
    } finally {
      btn.disabled = false;
    }
  },

  async onActualizarPass(card) {
    const input = document.getElementById(`input-${card.slug}-pass`);
    const pass = input?.value ?? '';
    if (!pass.trim()) {
      F.toast('Ingrese una clave', 'warning');
      return;
    }

    const ok = await CatalogosUI.fireConfirm({
      title: '¿Actualizar clave?',
      text: `Se guardará la nueva ${card.title.toLowerCase()}.`,
      icon: 'question',
      confirmText: 'Guardar',
    });
    if (!ok) return;

    try {
      await F.fetchJson(`/api/config/${card.id}/pass`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: pass.trim() }),
      });
      F.toast('Clave actualizada', 'success');
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async fetchInvSaldoPendientes() {
    const empNit = F.getEmpNit();
    if (!empNit) return { pendientes: 0 };
    const params = new URLSearchParams({ empnit: empNit, _: String(Date.now()) });
    return F.fetchJson(`/api/inventario/saldo/pendientes?${params.toString()}`, {
      cache: 'no-store',
    });
  },

  updateInvSaldoCard(pendientes) {
    this._invSaldoPendientes = pendientes;
    const status = document.getElementById('config-invsaldo-status');
    const btn = document.getElementById('btn-sincronizar-invsaldo');
    const count = Number(pendientes) || 0;
    if (status) {
      status.textContent =
        count === 0
          ? 'Todos los productos tienen registro en INVSALDO.'
          : `${count} producto(s) sin registro en INVSALDO.`;
    }
    if (btn) btn.disabled = count === 0;
  },

  async onSincronizarInvSaldo() {
    const empNit = F.getEmpNit();
    if (!empNit) {
      F.toast('No hay empresa activa en la sesión', 'warning');
      return;
    }
    const pendientes = Number(this._invSaldoPendientes) || 0;
    if (pendientes <= 0) {
      F.toast('No hay productos pendientes de sincronizar', 'info');
      return;
    }

    const ok = await CatalogosUI.fireConfirm({
      title: '¿Corregir INVSALDO?',
      text: `Se crearán ${pendientes} registro(s) en INVSALDO para productos sin saldo.`,
      icon: 'question',
      confirmText: 'Corregir',
    });
    if (!ok) return;

    const btn = document.getElementById('btn-sincronizar-invsaldo');
    if (btn) btn.disabled = true;

    try {
      const params = new URLSearchParams({ empnit: empNit });
      const data = await F.fetchJson(`/api/inventario/saldo/sincronizar?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      this.updateInvSaldoCard(data.pendientes ?? 0);
      F.toast(`INVSALDO actualizado: ${data.creados ?? 0} registro(s) creado(s)`, 'success');
    } catch (err) {
      this.updateInvSaldoCard(this._invSaldoPendientes);
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
      </div>`;

    try {
      const empNit = F.getEmpNit();
      const passFetches = this.PASS_CARDS.map((card) => this.fetchPass(card.id));
      const sinoFetches = this.SINO_OPTIONS.map((opt) => this.fetchSino(opt.id));
      const fetches = [...passFetches, ...sinoFetches];
      if (empNit) fetches.push(this.fetchInvSaldoPendientes());
      const results = await Promise.all(fetches);
      const passResults = results.slice(0, this.PASS_CARDS.length);
      const sinoResults = results.slice(
        this.PASS_CARDS.length,
        this.PASS_CARDS.length + this.SINO_OPTIONS.length
      );
      const invSaldoMeta = empNit ? results[results.length - 1] : { pendientes: 0 };

      this._passMeta = {};
      this.PASS_CARDS.forEach((card, i) => {
        this._passMeta[card.id] = passResults[i];
      });
      this._sinoMeta = {};
      this.SINO_OPTIONS.forEach((opt, i) => {
        this._sinoMeta[opt.id] = sinoResults[i];
      });
      this._invSaldoPendientes = invSaldoMeta.pendientes ?? 0;

      container.innerHTML = this.renderAll();
      this.PASS_CARDS.forEach((card) => {
        const input = document.getElementById(`input-${card.slug}-pass`);
        if (input) input.value = this._passMeta[card.id]?.pass ?? '';
      });
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-0" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          No se pudo cargar la configuración: ${this.escapeHtml(err.message)}
        </div>`;
      F.toast('Error al cargar configuración', 'error');
    }
  },
};
