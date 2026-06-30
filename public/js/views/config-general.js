/**
 * Vista Config general — SETTINGS (OPCION / VALOR)
 */
const ConfigGeneralView = {
  SETTING_OPCION: {
    CLAVE_ADMIN: 'CLAVE ADMIN',
    CLAVE_OPERADOR: 'CLAVE OPERADOR',
    INVENTARIO_NEGATIVO: 'INVENTARIO NEGATIVO',
    SOLICITA_CLAVE_VENDEDOR: 'SOLICITA CLAVE VENDEDOR',
    IMPRIME_TICKET: 'IMPRIME TICKET AL GUARDAR VENTA',
    COBRO_PREDETERMINADO: 'COBRO PREDETERMINADO',
    URL_FEL: 'URL FEL',
    MUESTRA_DATOS_CORTE: 'MUESTRA DATOS EN CORTE DE CAJA',
  },

  TEXT_CARDS: [
    {
      opcion: 'URL FEL',
      slug: 'url-fel',
      title: 'URL FEL',
      fallbackDesc: 'Dirección del servicio web de facturación electrónica (FEL)',
      placeholder: 'https://servicio-fel.ejemplo.com/api',
    },
  ],

  SINO_OPTIONS: [
    {
      opcion: 'INVENTARIO NEGATIVO',
      title: 'Permite inventario negativo',
      icon: 'fa-boxes-stacked',
      fallbackDesc: 'Permite vender en negativo',
    },
    {
      opcion: 'SOLICITA CLAVE VENDEDOR',
      title: 'Solicita clave del vendedor en ventas',
      icon: 'fa-user-lock',
      fallbackDesc: 'Exige clave del vendedor al registrar ventas',
    },
    {
      opcion: 'IMPRIME TICKET AL GUARDAR VENTA',
      title: 'Imprime ticket al guardar venta',
      icon: 'fa-receipt',
      fallbackDesc: 'Imprime ticket automáticamente al finalizar la venta',
    },
    {
      opcion: 'MUESTRA DATOS EN CORTE DE CAJA',
      title: 'Muestra datos en corte de caja',
      icon: 'fa-chart-pie',
      fallbackDesc: 'Muestra totales del sistema y detalle al cerrar; en NO el arqueo es ciego (sin montos visibles)',
    },
  ],

  CONCRE_OPTIONS: [
    {
      opcion: 'COBRO PREDETERMINADO',
      title: 'Tipo de cobro predeterminado',
      icon: 'fa-money-bill-wave',
      fallbackDesc: 'Determina si las nuevas facturas están por contado o crédito',
      labels: { CON: 'CONTADO', CRE: 'CRÉDITO' },
    },
  ],

  PASS_CARDS: [
    {
      opcion: 'CLAVE ADMIN',
      slug: 'admin',
      title: 'Clave de administrador',
      fallbackDesc: 'Clave para autorizar movimientos',
      placeholder: 'Clave de administrador',
    },
    {
      opcion: 'CLAVE OPERADOR',
      slug: 'operador',
      title: 'Clave de Operador',
      fallbackDesc: 'Clave del operador',
      placeholder: 'Clave de operador',
    },
  ],

  _container: null,
  _passMeta: {},
  _textMeta: {},
  _sinoMeta: {},
  _concreMeta: {},
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

  normalizeConcre(value) {
    const s = String(value ?? 'CON')
      .trim()
      .toUpperCase();
    if (s === 'CRE' || s === 'SI') return 'CRE';
    return 'CON';
  },

  concreButtonClass(concre) {
    return this.normalizeConcre(concre) === 'CRE' ? 'btn-empleado-activo--si' : 'btn-empleado-activo--no';
  },

  getConcreOption(opcion) {
    return this.CONCRE_OPTIONS.find((opt) => opt.opcion === opcion) || null;
  },

  getConcreLabel(option, concre) {
    const val = this.normalizeConcre(concre);
    if (option?.labels?.[val]) return option.labels[val];
    return val;
  },

  getConcreToggleTitle(option, concre) {
    const val = this.normalizeConcre(concre);
    const next = val === 'CRE' ? 'CON' : 'CRE';
    return `Clic para cambiar a ${this.getConcreLabel(option, next)}`;
  },

  renderConcreToggleButton(option, concre) {
    const val = this.normalizeConcre(concre);
    const label = this.getConcreLabel(option, val);
    const wideClass = option.labels ? ' config-sino-toggle--wide' : '';
    return `
      <button
        type="button"
        class="btn btn-empleado-activo config-sino-toggle${wideClass} ${this.concreButtonClass(val)}"
        data-setting-opcion="${this.escapeHtml(option.opcion)}"
        data-concre="${val}"
        aria-pressed="${val === 'CRE'}"
        title="${this.escapeHtml(this.getConcreToggleTitle(option, val))}"
      >${this.escapeHtml(label)}</button>`;
  },

  renderConcreCard(option, meta = {}) {
    const desc = meta.descripcion || option.fallbackDesc;
    const concre = this.normalizeConcre(meta.concre);
    return `
      <div class="card config-card-compact" data-concre-card="${this.escapeHtml(option.opcion)}">
        <div class="card-body">
          <div class="config-card-row">
            <div class="config-card-info">
              <h6 class="card-title mb-0">
                <i class="fa-solid ${option.icon} me-1 text-primary"></i>${this.escapeHtml(option.title)}
              </h6>
              <p class="card-text mb-0">${this.escapeHtml(desc)}</p>
            </div>
            ${this.renderConcreToggleButton(option, concre)}
          </div>
        </div>
      </div>`;
  },

  sinoButtonClass(sino) {
    return this.normalizeSino(sino) === 'SI' ? 'btn-empleado-activo--si' : 'btn-empleado-activo--no';
  },

  getSinoOption(opcion) {
    return this.SINO_OPTIONS.find((opt) => opt.opcion === opcion) || null;
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
        data-setting-opcion="${this.escapeHtml(option.opcion)}"
        data-sino="${val}"
        aria-pressed="${val === 'SI'}"
        title="${this.escapeHtml(this.getSinoToggleTitle(option, val))}"
      >${this.escapeHtml(label)}</button>`;
  },

  renderSinoCard(option, meta = {}) {
    const desc = meta.descripcion || option.fallbackDesc;
    const sino = this.normalizeSino(meta.sino);
    return `
      <div class="card config-card-compact" data-sino-card="${this.escapeHtml(option.opcion)}">
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
    const desc = meta.descripcion || card.fallbackDesc;
    return `
      <div class="card config-card-compact">
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

  renderTextCard(card, meta = {}) {
    const desc = meta.descripcion || card.fallbackDesc;
    return `
      <div class="card config-card-compact">
        <div class="card-body">
          <h6 class="card-title mb-1">
            <i class="fa-solid fa-link me-1 text-primary"></i>${this.escapeHtml(card.title)}
          </h6>
          <p class="card-text mb-2">${this.escapeHtml(desc)}</p>
          <label for="input-${card.slug}-text" class="form-label config-field-label">URL del servicio</label>
          <div class="input-group input-group-sm">
            <input
              type="text"
              class="form-control font-monospace"
              id="input-${card.slug}-text"
              name="${card.slug}-text"
              autocomplete="off"
              spellcheck="false"
              inputmode="url"
              placeholder="${this.escapeHtml(card.placeholder)}"
            >
            <button type="button" class="btn btn-actualizar-pass btn-sm" id="btn-actualizar-${card.slug}-text">
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
      <div class="card config-card-compact">
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
      this.renderSinoCard(opt, this._sinoMeta[opt.opcion] || {})
    ).join('');
    const concreCards = this.CONCRE_OPTIONS.map((opt) =>
      this.renderConcreCard(opt, this._concreMeta[opt.opcion] || {})
    ).join('');
    return `
      <div class="config-general-wrap w-100">
        <div class="config-general-panel">
          <div class="config-cards-grid">
            ${this.PASS_CARDS.map((card) => this.renderPassCard(card, this._passMeta[card.opcion] || {})).join('')}
            ${this.TEXT_CARDS.map((card) => this.renderTextCard(card, this._textMeta[card.opcion] || {})).join('')}
            ${sinoCards}
            ${concreCards}
            ${this.renderInvSaldoCard(this._invSaldoPendientes)}
          </div>
        </div>
      </div>`;
  },

  updateConcreButton(btn, concre, option) {
    const val = this.normalizeConcre(concre);
    const opt = option || this.getConcreOption(btn.getAttribute('data-setting-opcion'));
    btn.textContent = this.getConcreLabel(opt, val);
    btn.dataset.concre = val;
    btn.setAttribute('aria-pressed', val === 'CRE' ? 'true' : 'false');
    btn.title = this.getConcreToggleTitle(opt, val);
    btn.classList.remove('btn-empleado-activo--si', 'btn-empleado-activo--no');
    btn.classList.add(this.concreButtonClass(val));
  },

  updateSinoButton(btn, sino, option) {
    const val = this.normalizeSino(sino);
    const opt = option || this.getSinoOption(btn.getAttribute('data-setting-opcion'));
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

  bindTextEvents(card) {
    document.getElementById(`btn-actualizar-${card.slug}-text`)?.addEventListener('click', () => {
      this.onActualizarText(card);
    });
  },

  bindEvents() {
    this.PASS_CARDS.forEach((card) => this.bindPassEvents(card));
    this.TEXT_CARDS.forEach((card) => this.bindTextEvents(card));

    this._container?.querySelectorAll('.config-sino-toggle').forEach((btn) => {
      if (btn.hasAttribute('data-concre')) {
        btn.addEventListener('click', () => this.onToggleConcre(btn));
      } else {
        btn.addEventListener('click', () => this.onToggleSino(btn));
      }
    });

    document.getElementById('btn-sincronizar-invsaldo')?.addEventListener('click', () => {
      this.onSincronizarInvSaldo();
    });
  },

  configQuery(opcion) {
    return `opcion=${encodeURIComponent(opcion)}`;
  },

  async fetchPass(opcion) {
    return F.fetchJson(`/api/config/pass?${this.configQuery(opcion)}&_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async fetchSino(opcion) {
    return F.fetchJson(`/api/config/sino?${this.configQuery(opcion)}&_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async fetchConcre(opcion) {
    return F.fetchJson(`/api/config/concre?${this.configQuery(opcion)}&_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async onToggleConcre(btn) {
    const opcion = btn.getAttribute('data-setting-opcion');
    if (!opcion) return;
    const current = this.normalizeConcre(btn.getAttribute('data-concre'));
    const next = current === 'CRE' ? 'CON' : 'CRE';
    btn.disabled = true;
    try {
      await F.fetchJson(`/api/config/concre?${this.configQuery(opcion)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opcion, concre: next }),
      });
      this._concreMeta[opcion] = { ...(this._concreMeta[opcion] || {}), concre: next };
      this.updateConcreButton(btn, next, this.getConcreOption(opcion));
      F.toast('Configuración actualizada', 'success');
    } catch (err) {
      F.toast(err.message || 'Error al actualizar', 'error');
    } finally {
      btn.disabled = false;
    }
  },

  async onToggleSino(btn) {
    const opcion = btn.getAttribute('data-setting-opcion');
    if (!opcion) return;
    const current = this.normalizeSino(btn.getAttribute('data-sino'));
    const next = current === 'SI' ? 'NO' : 'SI';
    btn.disabled = true;
    try {
      await F.fetchJson(`/api/config/sino?${this.configQuery(opcion)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opcion, sino: next }),
      });
      this._sinoMeta[opcion] = { ...(this._sinoMeta[opcion] || {}), sino: next };
      this.updateSinoButton(btn, next, this.getSinoOption(opcion));
      F.toast('Configuración actualizada', 'success');
    } catch (err) {
      F.toast(err.message || 'Error al actualizar', 'error');
    } finally {
      btn.disabled = false;
    }
  },

  async onActualizarText(card) {
    const input = document.getElementById(`input-${card.slug}-text`);
    const value = (input?.value ?? '').trim();

    const ok = await CatalogosUI.fireConfirm({
      title: '¿Actualizar URL?',
      text: `Se guardará la URL del servicio FEL.`,
      icon: 'question',
      confirmText: 'Guardar',
    });
    if (!ok) return;

    try {
      await F.fetchJson(`/api/config/pass?${this.configQuery(card.opcion)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opcion: card.opcion, pass: value }),
      });
      F.toast('URL FEL actualizada', 'success');
    } catch (err) {
      F.alert('Error', err.message, 'error');
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
      await F.fetchJson(`/api/config/pass?${this.configQuery(card.opcion)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opcion: card.opcion, pass: pass.trim() }),
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
      const passFetches = this.PASS_CARDS.map((card) => this.fetchPass(card.opcion));
      const textFetches = this.TEXT_CARDS.map((card) => this.fetchPass(card.opcion));
      const sinoFetches = this.SINO_OPTIONS.map((opt) => this.fetchSino(opt.opcion));
      const concreFetches = this.CONCRE_OPTIONS.map((opt) => this.fetchConcre(opt.opcion));
      const fetches = [...passFetches, ...textFetches, ...sinoFetches, ...concreFetches];
      if (empNit) fetches.push(this.fetchInvSaldoPendientes());
      const results = await Promise.all(fetches);
      const passResults = results.slice(0, this.PASS_CARDS.length);
      const textResults = results.slice(
        this.PASS_CARDS.length,
        this.PASS_CARDS.length + this.TEXT_CARDS.length
      );
      const sinoResults = results.slice(
        this.PASS_CARDS.length + this.TEXT_CARDS.length,
        this.PASS_CARDS.length + this.TEXT_CARDS.length + this.SINO_OPTIONS.length
      );
      const concreResults = results.slice(
        this.PASS_CARDS.length + this.TEXT_CARDS.length + this.SINO_OPTIONS.length,
        this.PASS_CARDS.length + this.TEXT_CARDS.length + this.SINO_OPTIONS.length + this.CONCRE_OPTIONS.length
      );
      const invSaldoMeta = empNit ? results[results.length - 1] : { pendientes: 0 };

      this._passMeta = {};
      this.PASS_CARDS.forEach((card, i) => {
        this._passMeta[card.opcion] = passResults[i];
      });
      this._textMeta = {};
      this.TEXT_CARDS.forEach((card, i) => {
        this._textMeta[card.opcion] = textResults[i];
      });
      this._sinoMeta = {};
      this.SINO_OPTIONS.forEach((opt, i) => {
        this._sinoMeta[opt.opcion] = sinoResults[i];
      });
      this._concreMeta = {};
      this.CONCRE_OPTIONS.forEach((opt, i) => {
        this._concreMeta[opt.opcion] = concreResults[i];
      });
      this._invSaldoPendientes = invSaldoMeta.pendientes ?? 0;

      container.innerHTML = this.renderAll();
      this.PASS_CARDS.forEach((card) => {
        const input = document.getElementById(`input-${card.slug}-pass`);
        if (input) input.value = this._passMeta[card.opcion]?.pass ?? '';
      });
      this.TEXT_CARDS.forEach((card) => {
        const input = document.getElementById(`input-${card.slug}-text`);
        if (input) input.value = this._textMeta[card.opcion]?.pass ?? '';
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
