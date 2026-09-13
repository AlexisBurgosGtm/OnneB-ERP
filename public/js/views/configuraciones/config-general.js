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
    CONFIGURACION_IVA: 'CONFIGURACION IVA',
    PERMITE_CAMBIAR_PRECIO_PEDIDOS: 'PERMITE CAMBIAR PRECIO EN PEDIDOS',
    SOLICITA_AUTORIZACIONES: 'SOLICITA AUTORIZACIONES',
    FORMATO_IMPRESION: 'FORMATO IMPRESION C O T',
    CERTIFICA_AL_FINALIZAR: 'CERTIFICA AL FINALIZAR',
    FACTURA_SE_PASA_A_FRACCIONAMIENTO_AUTOM: 'FACTURA SE PASA A FRACCIONAMIENTO AUTOM',
    MUESTRA_FORMATO_FEL_ONLINE: 'MUESTRA FORMATO FEL ONLINE',
    MAXIMO_FRACCIONAMIENTO_FACTURAS: 'MAXIMO FRACCIONAMIENTO FACTURAS',
    MUESTRA_DESPROD2_EN_DOCS_Y_PRODS: 'MUESTRA DESPROD2 EN DOCS Y PRODS',
    PERMITE_BIOMETRICO_EN_LOGIN: 'PERMITE BIOMETRICO EN LOGIN',
    PERMITE_FRACCIONAMIENTO_FACTURAS: 'PERMITE FRACCIONAMIENTO FACTURAS',
    DEFAULT_TIPO_DOCUMENTO_FINALIZADO: 'DEFAULT TIPO DOCUMENTO FINALIZADO',
    LIMITA_EFECTIVO_DISPONIBLE_EN_VALES_CAJA: 'LIMITA EFECTIVO DISPONIBLE EN VALES CAJA',
  },

  TEXT_CARDS: [
    {
      opcion: 'URL FEL',
      slug: 'url-fel',
      title: 'URL FEL',
      fallbackDesc: 'Dirección del servicio web de facturación electrónica (FEL)',
      placeholder: 'https://servicio-fel.ejemplo.com/api',
      fieldLabel: 'URL del servicio',
      inputType: 'text',
      icon: 'fa-link',
      saveConfirmTitle: '¿Actualizar URL?',
      saveConfirmText: 'Se guardará la URL del servicio FEL.',
      saveToast: 'URL FEL actualizada',
    },
    {
      opcion: 'MAXIMO FRACCIONAMIENTO FACTURAS',
      slug: 'maximo-fraccionamiento-fac',
      title: 'Máximo fraccionamiento facturas',
      fallbackDesc:
        'Monto máximo permitido por factura fraccionada (CF). Debe actualizarse según la legislación vigente.',
      placeholder: '2500',
      fieldLabel: 'Monto máximo (Q)',
      inputType: 'number',
      inputStep: '0.01',
      icon: 'fa-file-invoice-dollar',
      saveConfirmTitle: '¿Actualizar máximo?',
      saveConfirmText: 'Se guardará el monto máximo para fraccionamiento de facturas.',
      saveToast: 'Máximo de fraccionamiento actualizado',
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
      fallbackDesc:
        'Al finalizar FAC, DEV o FNA, muestra el ticket/formato del sistema. No aplica a documentos FEL (FEF/FEC/FES/FNC): ahí solo «Muestra formato FEL online» al certificar.',
    },
    {
      opcion: 'MUESTRA DATOS EN CORTE DE CAJA',
      title: 'Muestra datos en corte de caja',
      icon: 'fa-chart-pie',
      fallbackDesc: 'Muestra totales del sistema y detalle al cerrar; en NO el arqueo es ciego (sin montos visibles)',
    },
    {
      opcion: 'PERMITE CAMBIAR PRECIO EN PEDIDOS',
      title: 'Permite cambiar precio en pedidos',
      icon: 'fa-tag',
      fallbackDesc:
        'Permite modificar el precio al agregar productos en pedidos de mostrador y facturas (FAC/FEF/FEC/FES)',
    },
    {
      opcion: 'SOLICITA AUTORIZACIONES',
      title: 'Solicita autorizaciones',
      icon: 'fa-user-lock',
      fallbackDesc:
        'Si está en SI, las eliminaciones de registros/documentos clave piden autorización y luego confirmación Sí/No. Si está en NO, piden la clave de administrador. No aplica a quitar ítems de un documento.',
    },
    {
      opcion: 'CERTIFICA AL FINALIZAR',
      title: 'Certifica al finalizar',
      icon: 'fa-certificate',
      fallbackDesc: 'Al finalizar un documento FEL (FEF/FEC/FNC), certifica automáticamente ante SAT',
    },
    {
      opcion: 'PERMITE FRACCIONAMIENTO FACTURAS',
      title: 'Permite fraccionamiento facturas',
      icon: 'fa-scissors',
      fallbackDesc:
        'Si está en SI, aparece el botón para enviar facturas normales (FAC) a la cola de fraccionamiento. Si está en NO, el botón no se muestra.',
    },
    {
      opcion: 'FACTURA SE PASA A FRACCIONAMIENTO AUTOM',
      title: 'Factura se pasa a fraccionamiento autom',
      icon: 'fa-scissors',
      fallbackDesc:
        'Al finalizar una factura normal (FAC), la envía automáticamente a la cola de fraccionamiento',
    },
    {
      opcion: 'MUESTRA DESPROD2 EN DOCS Y PRODS',
      title: 'Muestra DESPROD2 en Docs y Prods',
      icon: 'fa-align-left',
      fallbackDesc:
        'En buscadores de documentos y productos, concatena DESPROD + DESPROD2 al buscar por descripción y lo muestra en la lista de resultados',
    },
    {
      opcion: 'MUESTRA PESO EN DOCUMENTOS',
      title: 'Muestra peso en documentos',
      icon: 'fa-weight-hanging',
      fallbackDesc:
        'Muestra el peso total por línea (PRECIOS.PESO × cantidad) en facturas, FEL y compras, y en el formato impreso interno',
    },
    {
      opcion: 'VISTAS EN PESTAÑAS',
      title: 'Vistas en pestañas',
      icon: 'fa-folder-closed',
      fallbackDesc:
        'Si está en SI, permite abrir varias vistas a la vez (máx. una pestaña por menú). Al cambiar de pestaña se recarga la vista. En NO se mantiene el comportamiento de un solo panel.',
    },
    {
      opcion: 'PERMITE BIOMETRICO EN LOGIN',
      title: 'Permite biométrico en login',
      icon: 'fa-fingerprint',
      fallbackDesc:
        'Si está en SI, permite iniciar sesión y registrar huella / passkeys. Si está en NO, no se solicita aunque el dispositivo lo soporte.',
    },
    {
      opcion: 'LIMITA EFECTIVO DISPONIBLE EN VALES CAJA',
      title: 'Limita efectivo disponible en vales caja',
      icon: 'fa-ticket',
      fallbackDesc:
        'Si está en SI, el importe de cada vale de caja no puede superar el efectivo inicial de la caja abierta. En NO no hay tope.',
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

  FORMATO_OPTIONS: [
    {
      opcion: 'FORMATO IMPRESION C O T',
      title: 'Formato de impresión facturas y recibos pago clientes',
      icon: 'fa-print',
      fallbackDesc: 'Carta: impresora normal. Ticket: impresora térmica 80 mm.',
      labels: { CARTA: 'Carta', TICKET: 'Ticket' },
      defaultValue: 'CARTA',
    },
  ],

  FOTO_OPTIONS: [
    {
      opcion: 'GUARDADO DE FOTOS',
      title: 'Guardado de fotos',
      icon: 'fa-image',
      fallbackDesc: 'LOCAL: carpeta Fotos_productos. HOST: almacenamiento WebDAV (STORAGE_SERVER).',
      labels: { LOCAL: 'LOCAL', HOST: 'HOST' },
      defaultValue: 'LOCAL',
    },
  ],

  FEL_FORMATO_OPTIONS: [
    {
      opcion: 'MUESTRA FORMATO FEL ONLINE',
      title: 'Muestra formato FEL online',
      icon: 'fa-file-invoice',
      fallbackDesc:
        'Al certificar: NO = solo formato del sistema · SI = solo FEL online · AMBOS = los dos',
      labels: { NO: 'NO', SI: 'SI', AMBOS: 'AMBOS' },
      defaultValue: 'NO',
      values: ['NO', 'SI', 'AMBOS'],
    },
  ],

  TIPOFAC_FINALIZADO_OPTIONS: [
    {
      opcion: 'DEFAULT TIPO DOCUMENTO FINALIZADO',
      title: 'Default Tipo documento Finalizado',
      icon: 'fa-file-circle-check',
      fallbackDesc:
        'Valor por defecto del selector Tipo Documento al finalizar pedidos, cotizaciones o facturas (si el selector está disponible).',
      labels: {
        FEF: 'FACTURA FEL NORMAL',
        FAC: 'ENVIO',
        FEC: 'FACTURA FEL CAMBIARIA',
      },
      defaultValue: 'FEF',
      values: ['FEF', 'FAC', 'FEC'],
    },
  ],

  PASS_CARDS: [
    {
      opcion: 'CLAVE ADMIN',
      slug: 'admin',
      title: 'Clave de administrador',
      fallbackDesc: 'Clave para autorizar movimientos',
      placeholder: 'Clave de administrador',
      tab: 'seguridad',
    },
    {
      opcion: 'CLAVE OPERADOR',
      slug: 'operador',
      title: 'Clave de Operador',
      fallbackDesc: 'Clave del operador',
      placeholder: 'Clave de operador',
      tab: 'seguridad',
    },
  ],

  TABS: [
    { id: 'seguridad', label: 'Seguridad', icon: 'fa-shield-halved' },
    { id: 'operacion', label: 'Operación', icon: 'fa-sliders' },
    { id: 'electronica', label: 'Electrónica', icon: 'fa-file-invoice' },
    { id: 'whatsapp', label: 'WhatsApp', icon: 'fa-brands fa-whatsapp' },
    { id: 'utilidades', label: 'Utilidades', icon: 'fa-wrench' },
  ],

  _tab: 'operacion',
  _container: null,
  _passMeta: {},
  _textMeta: {},
  _sinoMeta: {},
  _concreMeta: {},
  _formatoMeta: {},
  _fotoMeta: {},
  _felFormatoMeta: {},
  _tipofacFinalizadoMeta: {},
  _invSaldoPendientes: null,
  _whatsappStatus: null,
  _whatsappSocketBound: false,

  tabForSino(opcion) {
    const map = {
      'INVENTARIO NEGATIVO': 'operacion',
      'SOLICITA CLAVE VENDEDOR': 'seguridad',
      'IMPRIME TICKET AL GUARDAR VENTA': 'operacion',
      'MUESTRA DATOS EN CORTE DE CAJA': 'operacion',
      'PERMITE CAMBIAR PRECIO EN PEDIDOS': 'operacion',
      'SOLICITA AUTORIZACIONES': 'seguridad',
      'CERTIFICA AL FINALIZAR': 'electronica',
      'PERMITE FRACCIONAMIENTO FACTURAS': 'electronica',
      'FACTURA SE PASA A FRACCIONAMIENTO AUTOM': 'electronica',
      'MUESTRA DESPROD2 EN DOCS Y PRODS': 'operacion',
      'MUESTRA PESO EN DOCUMENTOS': 'operacion',
      'VISTAS EN PESTAÑAS': 'operacion',
      'PERMITE BIOMETRICO EN LOGIN': 'seguridad',
      'LIMITA EFECTIVO DISPONIBLE EN VALES CAJA': 'operacion',
    };
    return map[opcion] || 'operacion';
  },

  tabForText(opcion) {
    if (opcion === 'URL FEL') return 'electronica';
    if (opcion === 'MAXIMO FRACCIONAMIENTO FACTURAS') return 'electronica';
    return 'operacion';
  },

  tabClass(id) {
    return this._tab === id ? 'nav-link active' : 'nav-link';
  },

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

  normalizeFormato(value) {
    return String(value ?? 'CARTA').trim().toUpperCase() === 'TICKET' ? 'TICKET' : 'CARTA';
  },

  normalizeFotoModo(value) {
    return String(value ?? 'LOCAL').trim().toUpperCase() === 'HOST' ? 'HOST' : 'LOCAL';
  },

  normalizeFelFormatoModo(value) {
    const s = String(value ?? 'NO').trim().toUpperCase();
    if (s === 'SI') return 'SI';
    if (s === 'AMBOS') return 'AMBOS';
    return 'NO';
  },

  normalizeTipofacFinalizado(value) {
    const s = String(value ?? 'FEF').trim().toUpperCase();
    if (s === 'FAC' || s === 'FEC' || s === 'FEF') return s;
    return 'FEF';
  },

  getFormatoOption(opcion) {
    return this.FORMATO_OPTIONS.find((opt) => opt.opcion === opcion) || null;
  },

  getFotoOption(opcion) {
    return this.FOTO_OPTIONS.find((opt) => opt.opcion === opcion) || null;
  },

  getFelFormatoOption(opcion) {
    return this.FEL_FORMATO_OPTIONS.find((opt) => opt.opcion === opcion) || null;
  },

  getTipofacFinalizadoOption(opcion) {
    return this.TIPOFAC_FINALIZADO_OPTIONS.find((opt) => opt.opcion === opcion) || null;
  },

  getFormatoLabel(option, formato) {
    const val = this.normalizeFormato(formato);
    return option?.labels?.[val] || val;
  },

  getFotoLabel(option, modo) {
    const val = this.normalizeFotoModo(modo);
    return option?.labels?.[val] || val;
  },

  getFelFormatoLabel(option, modo) {
    const val = this.normalizeFelFormatoModo(modo);
    return option?.labels?.[val] || val;
  },

  getTipofacFinalizadoLabel(option, tipofac) {
    const val = this.normalizeTipofacFinalizado(tipofac);
    return option?.labels?.[val] || val;
  },

  renderFormatoCard(option, meta = {}) {
    const desc = meta.descripcion || option.fallbackDesc;
    const formato = this.normalizeFormato(meta.formato || option.defaultValue || 'CARTA');
    const options = ['CARTA', 'TICKET']
      .map((val) => {
        const label = this.getFormatoLabel(option, val);
        const sel = val === formato ? ' selected' : '';
        return `<option value="${val}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
    return `
      <div class="card config-card-compact" data-formato-card="${this.escapeHtml(option.opcion)}">
        <div class="card-body">
          <div class="config-card-row">
            <div class="config-card-info">
              <h6 class="card-title mb-0">
                <i class="fa-solid ${option.icon} me-1 text-primary"></i>${this.escapeHtml(option.title)}
              </h6>
              <p class="card-text mb-0">${this.escapeHtml(desc)}</p>
            </div>
            <select class="form-select form-select-sm config-formato-select" style="max-width:8rem"
              data-setting-opcion="${this.escapeHtml(option.opcion)}" aria-label="${this.escapeHtml(option.title)}">
              ${options}
            </select>
          </div>
        </div>
      </div>`;
  },

  renderFotoCard(option, meta = {}) {
    const desc = meta.descripcion || option.fallbackDesc;
    const modo = this.normalizeFotoModo(meta.modo || option.defaultValue || 'LOCAL');
    const options = ['LOCAL', 'HOST']
      .map((val) => {
        const label = this.getFotoLabel(option, val);
        const sel = val === modo ? ' selected' : '';
        return `<option value="${val}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
    return `
      <div class="card config-card-compact" data-foto-card="${this.escapeHtml(option.opcion)}">
        <div class="card-body">
          <div class="config-card-row">
            <div class="config-card-info">
              <h6 class="card-title mb-0">
                <i class="fa-solid ${option.icon} me-1 text-primary"></i>${this.escapeHtml(option.title)}
              </h6>
              <p class="card-text mb-0">${this.escapeHtml(desc)}</p>
            </div>
            <select class="form-select form-select-sm config-foto-select" style="max-width:8rem"
              data-setting-opcion="${this.escapeHtml(option.opcion)}" aria-label="${this.escapeHtml(option.title)}">
              ${options}
            </select>
          </div>
        </div>
      </div>`;
  },

  renderFelFormatoCard(option, meta = {}) {
    const desc = meta.descripcion || option.fallbackDesc;
    const modo = this.normalizeFelFormatoModo(meta.modo || option.defaultValue || 'NO');
    const values = option.values || ['NO', 'SI', 'AMBOS'];
    const options = values
      .map((val) => {
        const label = this.getFelFormatoLabel(option, val);
        const sel = val === modo ? ' selected' : '';
        return `<option value="${val}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
    return `
      <div class="card config-card-compact" data-fel-formato-card="${this.escapeHtml(option.opcion)}">
        <div class="card-body">
          <div class="config-card-row">
            <div class="config-card-info">
              <h6 class="card-title mb-0">
                <i class="fa-solid ${option.icon} me-1 text-primary"></i>${this.escapeHtml(option.title)}
              </h6>
              <p class="card-text mb-0">${this.escapeHtml(desc)}</p>
            </div>
            <select class="form-select form-select-sm config-fel-formato-select" style="max-width:8rem"
              data-setting-opcion="${this.escapeHtml(option.opcion)}" aria-label="${this.escapeHtml(option.title)}">
              ${options}
            </select>
          </div>
        </div>
      </div>`;
  },

  renderTipofacFinalizadoCard(option, meta = {}) {
    const desc = meta.descripcion || option.fallbackDesc;
    const tipofac = this.normalizeTipofacFinalizado(meta.tipofac || option.defaultValue || 'FEF');
    const values = option.values || ['FEF', 'FAC', 'FEC'];
    const options = values
      .map((val) => {
        const label = this.getTipofacFinalizadoLabel(option, val);
        const sel = val === tipofac ? ' selected' : '';
        return `<option value="${val}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
    return `
      <div class="card config-card-compact" data-tipofac-finalizado-card="${this.escapeHtml(option.opcion)}">
        <div class="card-body">
          <div class="config-card-row">
            <div class="config-card-info">
              <h6 class="card-title mb-0">
                <i class="fa-solid ${option.icon} me-1 text-primary"></i>${this.escapeHtml(option.title)}
              </h6>
              <p class="card-text mb-0">${this.escapeHtml(desc)}</p>
            </div>
            <select class="form-select form-select-sm config-tipofac-finalizado-select" style="max-width:14rem"
              data-setting-opcion="${this.escapeHtml(option.opcion)}" aria-label="${this.escapeHtml(option.title)}">
              ${options}
            </select>
          </div>
        </div>
      </div>`;
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
              type="text"
              class="form-control config-pass-mask"
              id="input-${card.slug}-pass"
              name="${card.slug}-pass-onneb"
              autocomplete="new-password"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              inputmode="text"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
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
    const fieldLabel = card.fieldLabel || 'Valor';
    const inputType = card.inputType || 'text';
    const icon = card.icon || 'fa-link';
    const stepAttr = card.inputStep ? `step="${card.inputStep}"` : '';
    const inputMode = inputType === 'number' ? 'decimal' : 'url';
    return `
      <div class="card config-card-compact">
        <div class="card-body">
          <h6 class="card-title mb-1">
            <i class="fa-solid ${icon} me-1 text-primary"></i>${this.escapeHtml(card.title)}
          </h6>
          <p class="card-text mb-2">${this.escapeHtml(desc)}</p>
          <label for="input-${card.slug}-text" class="form-label config-field-label">${this.escapeHtml(fieldLabel)}</label>
          <div class="input-group input-group-sm">
            <input
              type="${inputType}"
              class="form-control font-monospace"
              id="input-${card.slug}-text"
              name="${card.slug}-text"
              autocomplete="off"
              spellcheck="false"
              inputmode="${inputMode}"
              ${stepAttr}
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

  renderCorreccionProductosCard() {
    return `
      <div class="card config-card-compact">
        <div class="card-body">
          <h6 class="card-title mb-1">
            <i class="fa-solid fa-broom me-1 text-primary"></i>Corrección de Productos y Precios
          </h6>
          <p class="card-text mb-2">
            Elimina duplicados en <strong>PRODUCTOS</strong> y <strong>INVSALDO</strong> (EMPNIT+CODPROD)
            y en <strong>PRECIOS</strong> (EMPNIT+CODPROD+CODMEDIDA). Luego crea índices únicos para evitarlos.
          </p>
          <p class="config-correccion-prod-status mb-2 small text-muted" id="config-correccion-prod-status"></p>
          <button type="button" class="btn btn-actualizar-pass btn-sm" id="btn-correccion-productos-precios">
            <i class="fa-solid fa-play me-1" aria-hidden="true"></i> Ejecutar corrección
          </button>
        </div>
      </div>`;
  },

  renderCorregirSaldosCxcCard() {
    return `
      <div class="card config-card-compact">
        <div class="card-body">
          <h6 class="card-title mb-1">
            <i class="fa-solid fa-file-invoice-dollar me-1 text-primary"></i>Corregir saldos — Cuentas por Cobrar
          </h6>
          <p class="card-text mb-2">
            Recalcula <strong>DOC_ABONO</strong> y <strong>DOC_SALDO</strong> de facturas al crédito,
            sumando recibos (RCC), notas de crédito (DEV/FNC) y abonos bancarios
            (<strong>DOCUMENTOS_FACTURAS_ABONADAS</strong>) asociados.
          </p>
          <p class="config-correccion-cxc-status mb-2 small text-muted" id="config-correccion-cxc-status"></p>
          <button type="button" class="btn btn-actualizar-pass btn-sm" id="btn-corregir-saldos-cxc">
            <i class="fa-solid fa-arrows-rotate me-1" aria-hidden="true"></i> Corregir saldos CxC
          </button>
        </div>
      </div>`;
  },

  renderCorregirSaldosCxpCard() {
    return `
      <div class="card config-card-compact">
        <div class="card-body">
          <h6 class="card-title mb-1">
            <i class="fa-solid fa-file-invoice me-1 text-primary"></i>Corregir saldos — Cuentas por Pagar
          </h6>
          <p class="card-text mb-2">
            Recalcula <strong>DOC_ABONO</strong> y <strong>DOC_SALDO</strong> de compras al crédito,
            sumando pagos a proveedor (RCP), notas (DVP) y abonos bancarios
            (<strong>DOCUMENTOS_FACTURAS_ABONADAS</strong>) asociados.
          </p>
          <p class="config-correccion-cxp-status mb-2 small text-muted" id="config-correccion-cxp-status"></p>
          <button type="button" class="btn btn-actualizar-pass btn-sm" id="btn-corregir-saldos-cxp">
            <i class="fa-solid fa-arrows-rotate me-1" aria-hidden="true"></i> Corregir saldos CxP
          </button>
        </div>
      </div>`;
  },

  renderWhatsappPanel() {
    const st = this._whatsappStatus || {
      state: 'idle',
      connected: false,
      qrDataUrl: null,
      phone: null,
      name: null,
      error: null,
      library: '@whiskeysockets/baileys',
    };
    const state = String(st.state || 'idle');
    const library = st.library || '@whiskeysockets/baileys';
    let badgeClass = 'text-bg-secondary';
    let badgeLabel = 'Sin iniciar';
    if (state === 'ready' || st.connected) {
      badgeClass = 'text-bg-success';
      badgeLabel = 'Conectado';
    } else if (state === 'qr') {
      badgeClass = 'text-bg-warning';
      badgeLabel = 'Escanee el QR';
    } else if (state === 'connecting') {
      badgeClass = 'text-bg-info';
      badgeLabel = 'Conectando…';
    } else if (state === 'error') {
      badgeClass = 'text-bg-danger';
      badgeLabel = 'Error';
    } else if (state === 'logged_out') {
      badgeClass = 'text-bg-secondary';
      badgeLabel = 'Sesión cerrada';
    }

    const qrHtml = st.qrDataUrl
      ? `<img src="${this.escapeHtml(st.qrDataUrl)}" alt="QR WhatsApp" class="config-wa-qr img-fluid">`
      : `<div class="config-wa-qr-placeholder text-muted small">
           ${
             state === 'connecting'
               ? '<i class="fa-solid fa-spinner fa-spin me-1"></i>Generando código QR…'
               : 'Pulse <strong>Conectar</strong> para mostrar el código QR.'
           }
         </div>`;

    const phoneLine =
      st.phone || st.name
        ? `<p class="mb-1 small"><span class="text-muted">Cuenta:</span> <strong>${this.escapeHtml(
            [st.name, st.phone].filter(Boolean).join(' · ')
          )}</strong></p>`
        : '';

    const errLine = st.error
      ? `<p class="small text-danger mb-2"><i class="fa-solid fa-triangle-exclamation me-1"></i>${this.escapeHtml(
          st.error
        )}</p>`
      : '';

    return `
      <div class="config-wa-panel card shadow-sm">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-2">
            <div>
              <h6 class="mb-1">
                <i class="fa-brands fa-whatsapp me-1 text-success"></i>Inicio de sesión WhatsApp
              </h6>
              <p class="small text-muted mb-0">
                Vincula un dispositivo multi-device para envíos e integraciones del ERP
                (documentos, cobros, avisos). Si no hay sesión activa, los envíos siguen usando
                el enlace <code>wa.me</code> como hasta ahora.
              </p>
            </div>
            <span class="badge ${badgeClass}" id="config-wa-badge">${this.escapeHtml(badgeLabel)}</span>
          </div>
          <p class="config-wa-lib-label mb-3" title="Identificador de librería para soporte y correcciones futuras">
            <i class="fa-solid fa-code me-1"></i>Librería:
            <strong>${this.escapeHtml(library)}</strong>
            <span class="text-muted">(Baileys)</span>
          </p>
          ${phoneLine}
          ${errLine}
          <div class="config-wa-qr-wrap mb-3" id="config-wa-qr-wrap">${qrHtml}</div>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-success btn-sm" id="btn-wa-connect">
              <i class="fa-solid fa-qrcode me-1"></i>Conectar / Mostrar QR
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" id="btn-wa-refresh">
              <i class="fa-solid fa-arrows-rotate me-1"></i>Nuevo QR
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm" id="btn-wa-logout">
              <i class="fa-solid fa-right-from-bracket me-1"></i>Cerrar sesión
            </button>
          </div>
          <ol class="small text-muted mt-3 mb-0 ps-3">
            <li>En el teléfono: WhatsApp → Dispositivos vinculados → Vincular dispositivo.</li>
            <li>Escanee el código QR que aparece aquí.</li>
            <li>Mantenga el servidor del ERP encendido para conservar la sesión.</li>
          </ol>
        </div>
      </div>`;
  },

  renderWhatsappTab() {
    const agenda =
      typeof WhatsappProgramacionUI !== 'undefined' ? WhatsappProgramacionUI.render() : '';
    return `
      <div class="config-wa-stack">
        <div id="config-wa-login">${this.renderWhatsappPanel()}</div>
        ${agenda}
      </div>`;
  },

  renderTabCards(tabId) {
    const parts = [];
    if (tabId === 'whatsapp') return this.renderWhatsappTab();
    if (tabId === 'utilidades') {
      return `
        <div class="config-cards-grid">
          ${this.renderInvSaldoCard(this._invSaldoPendientes)}
          ${this.renderCorreccionProductosCard()}
          ${this.renderCorregirSaldosCxcCard()}
          ${this.renderCorregirSaldosCxpCard()}
        </div>`;
    }

    this.PASS_CARDS.filter((c) => (c.tab || 'seguridad') === tabId).forEach((card) => {
      parts.push(this.renderPassCard(card, this._passMeta[card.opcion] || {}));
    });
    this.TEXT_CARDS.filter((c) => this.tabForText(c.opcion) === tabId).forEach((card) => {
      parts.push(this.renderTextCard(card, this._textMeta[card.opcion] || {}));
    });
    this.SINO_OPTIONS.filter((opt) => this.tabForSino(opt.opcion) === tabId).forEach((opt) => {
      parts.push(this.renderSinoCard(opt, this._sinoMeta[opt.opcion] || {}));
    });
    if (tabId === 'operacion') {
      this.CONCRE_OPTIONS.forEach((opt) => {
        parts.push(this.renderConcreCard(opt, this._concreMeta[opt.opcion] || {}));
      });
      this.FORMATO_OPTIONS.forEach((opt) => {
        parts.push(this.renderFormatoCard(opt, this._formatoMeta[opt.opcion] || {}));
      });
      this.FOTO_OPTIONS.forEach((opt) => {
        parts.push(this.renderFotoCard(opt, this._fotoMeta[opt.opcion] || {}));
      });
      this.TIPOFAC_FINALIZADO_OPTIONS.forEach((opt) => {
        parts.push(this.renderTipofacFinalizadoCard(opt, this._tipofacFinalizadoMeta[opt.opcion] || {}));
      });
    }
    if (tabId === 'electronica') {
      this.FEL_FORMATO_OPTIONS.forEach((opt) => {
        parts.push(this.renderFelFormatoCard(opt, this._felFormatoMeta[opt.opcion] || {}));
      });
    }
    if (!parts.length) {
      return '<p class="text-muted small mb-0">Sin opciones en esta pestaña.</p>';
    }
    return `<div class="config-cards-grid">${parts.join('')}</div>`;
  },

  renderAll() {
    const tabsNav = this.TABS.map(
      (t) => `
        <li class="nav-item" role="presentation">
          <button type="button" class="${this.tabClass(t.id)}" data-config-tab="${t.id}" role="tab">
            <i class="${t.icon.startsWith('fa-brands') ? t.icon : `fa-solid ${t.icon}`} me-1"></i>${this.escapeHtml(t.label)}
          </button>
        </li>`
    ).join('');
    const panes = this.TABS.map(
      (t) => `
        <div class="config-general-tab-pane${this._tab === t.id ? '' : ' d-none'}" data-config-pane="${t.id}" role="tabpanel">
          ${this.renderTabCards(t.id)}
        </div>`
    ).join('');
    return `
      <div class="config-general-wrap w-100">
        <div class="config-general-panel">
          <ul class="nav nav-tabs config-general-tabs mb-3" role="tablist">
            ${tabsNav}
          </ul>
          ${panes}
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
      const masked = input?.classList.contains('config-pass-mask');
      input?.classList.toggle('config-pass-mask', !masked);
      const icon = btnToggle.querySelector('i');
      if (icon) icon.className = masked ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      btnToggle.title = masked ? 'Ocultar clave' : 'Ver clave';
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
    this._container?.querySelectorAll('.config-general-tabs [data-config-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-config-tab');
        if (!tab || tab === this._tab) return;
        this._tab = tab;
        this._container?.querySelectorAll('.config-general-tabs [data-config-tab]').forEach((b) => {
          const active = b.getAttribute('data-config-tab') === tab;
          b.classList.toggle('active', active);
        });
        this._container?.querySelectorAll('[data-config-pane]').forEach((pane) => {
          pane.classList.toggle('d-none', pane.getAttribute('data-config-pane') !== tab);
        });
        if (tab === 'whatsapp') this.refreshWhatsappStatus().catch(() => {});
      });
    });

    this.PASS_CARDS.forEach((card) => this.bindPassEvents(card));
    this.TEXT_CARDS.forEach((card) => this.bindTextEvents(card));

    this._container?.querySelectorAll('.config-sino-toggle').forEach((btn) => {
      if (btn.hasAttribute('data-concre')) {
        btn.addEventListener('click', () => this.onToggleConcre(btn));
      } else {
        btn.addEventListener('click', () => this.onToggleSino(btn));
      }
    });

    this._container?.querySelectorAll('.config-formato-select').forEach((sel) => {
      sel.addEventListener('change', () => this.onChangeFormato(sel));
    });

    this._container?.querySelectorAll('.config-foto-select').forEach((sel) => {
      sel.addEventListener('change', () => this.onChangeFotoModo(sel));
    });

    this._container?.querySelectorAll('.config-fel-formato-select').forEach((sel) => {
      sel.addEventListener('change', () => this.onChangeFelFormatoModo(sel));
    });

    this._container?.querySelectorAll('.config-tipofac-finalizado-select').forEach((sel) => {
      sel.addEventListener('change', () => this.onChangeTipofacFinalizado(sel));
    });

    document.getElementById('btn-sincronizar-invsaldo')?.addEventListener('click', () => {
      this.onSincronizarInvSaldo();
    });

    document.getElementById('btn-correccion-productos-precios')?.addEventListener('click', () => {
      this.onCorreccionProductosPrecios();
    });

    document.getElementById('btn-corregir-saldos-cxc')?.addEventListener('click', () => {
      this.onCorregirSaldosCuentas('cxc');
    });

    document.getElementById('btn-corregir-saldos-cxp')?.addEventListener('click', () => {
      this.onCorregirSaldosCuentas('cxp');
    });

    this.bindWhatsappEvents();
    if (typeof WhatsappProgramacionUI !== 'undefined') {
      WhatsappProgramacionUI.bind(this._container);
    }
  },

  bindWhatsappEvents() {
    document.getElementById('btn-wa-connect')?.addEventListener('click', () => {
      this.onWhatsappConnect(false).catch((err) => F.toast(err.message || 'Error WhatsApp', 'error'));
    });
    document.getElementById('btn-wa-refresh')?.addEventListener('click', () => {
      this.onWhatsappConnect(true).catch((err) => F.toast(err.message || 'Error WhatsApp', 'error'));
    });
    document.getElementById('btn-wa-logout')?.addEventListener('click', () => {
      this.onWhatsappLogout().catch((err) => F.toast(err.message || 'Error WhatsApp', 'error'));
    });
    this.bindWhatsappSocket();
  },

  bindWhatsappSocket() {
    if (this._whatsappSocketBound) return;
    const sock =
      (typeof F !== 'undefined' && typeof F.getSocket === 'function' && F.getSocket()) ||
      window.OnnebSocket ||
      null;
    if (!sock || typeof sock.on !== 'function') return;
    sock.on('whatsapp:status', (data) => {
      this._whatsappStatus = data || null;
      if (this._tab === 'whatsapp') this.paintWhatsappPanel();
    });
    this._whatsappSocketBound = true;
  },

  paintWhatsappPanel() {
    const login = this._container?.querySelector('#config-wa-login');
    if (login) {
      login.innerHTML = this.renderWhatsappPanel();
      this.bindWhatsappEvents();
      return;
    }
    const pane = this._container?.querySelector('[data-config-pane="whatsapp"]');
    if (!pane) return;
    pane.innerHTML = this.renderWhatsappTab();
    this.bindWhatsappEvents();
    if (typeof WhatsappProgramacionUI !== 'undefined') {
      WhatsappProgramacionUI.bind(pane);
    }
  },

  async refreshWhatsappStatus() {
    const data = await F.fetchJson(`/api/whatsapp/status?_=${Date.now()}`, { cache: 'no-store' });
    this._whatsappStatus = data;
    this.paintWhatsappPanel();
    return data;
  },

  async onWhatsappConnect(forceNewQr) {
    const btn = document.getElementById(forceNewQr ? 'btn-wa-refresh' : 'btn-wa-connect');
    if (btn) btn.disabled = true;
    try {
      const data = await F.fetchJson('/api/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceNewQr: Boolean(forceNewQr) }),
      });
      this._whatsappStatus = data;
      this.paintWhatsappPanel();
      if (data.state === 'ready') F.toast('WhatsApp conectado', 'success');
      else if (data.state === 'qr') F.toast('Escanee el código QR en WhatsApp', 'info');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async onWhatsappLogout() {
    const ok = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Cerrar sesión WhatsApp',
      html: '<p class="small text-muted text-start mb-0">Se desvinculará el dispositivo del ERP. Deberá escanear un nuevo QR para volver a conectar.</p>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Cerrar sesión'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
    });
    if (!ok.isConfirmed) return;
    const data = await F.fetchJson('/api/whatsapp/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    this._whatsappStatus = data;
    this.paintWhatsappPanel();
    F.toast('Sesión WhatsApp cerrada', 'success');
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

  async fetchFormato(opcion) {
    return F.fetchJson(`/api/config/formato-impresion?${this.configQuery(opcion)}&_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async fetchFotoModo(opcion) {
    return F.fetchJson(`/api/config/guardado-fotos?${this.configQuery(opcion)}&_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async fetchFelFormatoModo(opcion) {
    return F.fetchJson(`/api/config/muestra-formato-fel?${this.configQuery(opcion)}&_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async fetchTipofacFinalizado(opcion) {
    return F.fetchJson(`/api/config/tipofac-finalizado?${this.configQuery(opcion)}&_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async onChangeFormato(sel) {
    const opcion = sel.getAttribute('data-setting-opcion');
    if (!opcion) return;
    const formato = this.normalizeFormato(sel.value);
    const prev = this.normalizeFormato(this._formatoMeta[opcion]?.formato || 'CARTA');
    sel.disabled = true;
    try {
      await F.fetchJson(`/api/config/formato-impresion?${this.configQuery(opcion)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opcion, formato }),
      });
      this._formatoMeta[opcion] = { ...(this._formatoMeta[opcion] || {}), formato };
      if (typeof DocPrint !== 'undefined') DocPrint._formatoCache = formato;
      F.toast('Configuración actualizada', 'success');
    } catch (err) {
      sel.value = prev;
      F.toast(err.message || 'Error al actualizar', 'error');
    } finally {
      sel.disabled = false;
    }
  },

  async onChangeFotoModo(sel) {
    const opcion = sel.getAttribute('data-setting-opcion');
    if (!opcion) return;
    const modo = this.normalizeFotoModo(sel.value);
    const prev = this.normalizeFotoModo(this._fotoMeta[opcion]?.modo || 'LOCAL');
    sel.disabled = true;
    try {
      await F.fetchJson(`/api/config/guardado-fotos?${this.configQuery(opcion)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opcion, modo }),
      });
      this._fotoMeta[opcion] = { ...(this._fotoMeta[opcion] || {}), modo };
      F.toast('Configuración actualizada', 'success');
    } catch (err) {
      sel.value = prev;
      F.toast(err.message || 'Error al actualizar', 'error');
    } finally {
      sel.disabled = false;
    }
  },

  async onChangeFelFormatoModo(sel) {
    const opcion = sel.getAttribute('data-setting-opcion');
    if (!opcion) return;
    const modo = this.normalizeFelFormatoModo(sel.value);
    const prev = this.normalizeFelFormatoModo(this._felFormatoMeta[opcion]?.modo || 'NO');
    sel.disabled = true;
    try {
      await F.fetchJson(`/api/config/muestra-formato-fel?${this.configQuery(opcion)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opcion, modo }),
      });
      this._felFormatoMeta[opcion] = { ...(this._felFormatoMeta[opcion] || {}), modo };
      F.toast('Configuración actualizada', 'success');
    } catch (err) {
      sel.value = prev;
      F.toast(err.message || 'Error al actualizar', 'error');
    } finally {
      sel.disabled = false;
    }
  },

  async onChangeTipofacFinalizado(sel) {
    const opcion = sel.getAttribute('data-setting-opcion');
    if (!opcion) return;
    const tipofac = this.normalizeTipofacFinalizado(sel.value);
    const prev = this.normalizeTipofacFinalizado(this._tipofacFinalizadoMeta[opcion]?.tipofac || 'FEF');
    sel.disabled = true;
    try {
      await F.fetchJson(`/api/config/tipofac-finalizado?${this.configQuery(opcion)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opcion, tipofac }),
      });
      this._tipofacFinalizadoMeta[opcion] = { ...(this._tipofacFinalizadoMeta[opcion] || {}), tipofac };
      if (typeof DocTipofacPrioridad !== 'undefined') {
        DocTipofacPrioridad._defaultTipofacCache = tipofac;
      }
      F.toast('Configuración actualizada', 'success');
    } catch (err) {
      sel.value = prev;
      F.toast(err.message || 'Error al actualizar', 'error');
    } finally {
      sel.disabled = false;
    }
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
      if (
        opcion === 'VISTAS EN PESTAÑAS' &&
        typeof ViewTabs !== 'undefined' &&
        typeof ViewTabs.setEnabled === 'function'
      ) {
        ViewTabs.setEnabled(next === 'SI');
      }
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
    if (!value) {
      F.toast('Ingrese un valor', 'warning');
      return;
    }

    const ok = await CatalogosUI.fireConfirm({
      title: card.saveConfirmTitle || '¿Actualizar valor?',
      text: card.saveConfirmText || 'Se guardará el nuevo valor.',
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
      F.toast(card.saveToast || 'Configuración actualizada', 'success');
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

  async onCorreccionProductosPrecios() {
    const empNit = F.getEmpNit();
    if (!empNit) {
      F.toast('No hay empresa activa en la sesión', 'warning');
      return;
    }

    const ok = await CatalogosUI.fireConfirm({
      title: '¿Corregir productos y precios?',
      html: `
        <p class="mb-2 text-start">Se eliminarán filas duplicadas en:</p>
        <ul class="text-start small mb-2">
          <li><strong>PRODUCTOS</strong> e <strong>INVSALDO</strong>: EMPNIT + CODPROD</li>
          <li><strong>PRECIOS</strong>: EMPNIT + CODPROD + CODMEDIDA</li>
        </ul>
        <p class="mb-0 small text-muted text-start">Después se crearán índices únicos para evitar nuevas duplicidades.</p>
      `,
      icon: 'warning',
      confirmText: 'Ejecutar',
    });
    if (!ok) return;

    const btn = document.getElementById('btn-correccion-productos-precios');
    const statusEl = document.getElementById('config-correccion-prod-status');
    const prevHtml = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin me-1" aria-hidden="true"></i> Corrigiendo…';
    }
    if (statusEl) statusEl.textContent = 'Recorriendo tablas y eliminando duplicados…';

    try {
      const params = new URLSearchParams({ empnit: empNit });
      const data = await F.fetchJson(`/api/productos/correccion-duplicados?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const prodDel = data.productos?.eliminados ?? 0;
      const invDel = data.invsaldo?.eliminados ?? 0;
      const precDel = data.precios?.eliminados ?? 0;
      const idxCreated = (data.indexes?.created || []).length;
      const idxErrors = data.indexes?.errors || [];
      if (statusEl) {
        statusEl.textContent = `Listo: productos −${prodDel}, invsaldo −${invDel}, precios −${precDel}. Índices nuevos: ${idxCreated}.`;
      }
      if (idxErrors.length) {
        F.alert(
          'Corrección parcial',
          `Duplicados eliminados, pero hubo problemas al crear índices:\n${idxErrors.join('\n')}`,
          'warning'
        );
      } else {
        F.toast(
          `Corrección lista: −${prodDel} productos, −${invDel} invsaldo, −${precDel} precios`,
          'success'
        );
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message || 'Error en la corrección';
      F.alert('Error', err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        if (prevHtml) btn.innerHTML = prevHtml;
      }
    }
  },

  async onCorregirSaldosCuentas(tipo) {
    const isCxc = tipo === 'cxc';
    const empNit = F.getEmpNit();
    if (!empNit) {
      F.toast('No hay empresa activa en la sesión', 'warning');
      return;
    }

    const ok = await CatalogosUI.fireConfirm({
      title: isCxc ? '¿Corregir saldos CxC?' : '¿Corregir saldos CxP?',
      html: isCxc
        ? `<p class="mb-0 text-start small">Se recalcularán abonos y saldo de todas las <strong>facturas al crédito</strong>,
           sumando RCC, notas de crédito (DEV/FNC) y abonos bancarios asociados.</p>`
        : `<p class="mb-0 text-start small">Se recalcularán abonos y saldo de todas las <strong>compras al crédito</strong>,
           sumando RCP, notas (DVP) y abonos bancarios asociados.</p>`,
      icon: 'question',
      confirmText: 'Corregir',
    });
    if (!ok) return;

    const btnId = isCxc ? 'btn-corregir-saldos-cxc' : 'btn-corregir-saldos-cxp';
    const statusId = isCxc ? 'config-correccion-cxc-status' : 'config-correccion-cxp-status';
    const btn = document.getElementById(btnId);
    const statusEl = document.getElementById(statusId);
    const prevHtml = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin me-1" aria-hidden="true"></i> Corrigiendo…';
    }
    if (statusEl) statusEl.textContent = 'Recalculando saldos…';

    try {
      const api = isCxc ? '/api/cuentas-cobrar/corregir-saldos' : '/api/cuentas-pagar/corregir-saldos';
      const data = await F.fetchJson(`${api}?empnit=${encodeURIComponent(empNit)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const actualizadas = data.actualizadas ?? 0;
      const total = isCxc ? (data.totalFacturas ?? 0) : (data.totalCompras ?? 0);
      const label = isCxc ? 'factura(s)' : 'compra(s)';
      if (statusEl) {
        statusEl.textContent = `Listo: ${actualizadas} de ${total} ${label} actualizada(s).`;
      }
      F.toast(`Saldos corregidos: ${actualizadas} de ${total} ${label}`, 'success');
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message || 'Error al corregir saldos';
      F.alert('Error', err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        if (prevHtml) btn.innerHTML = prevHtml;
      }
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
      const formatoFetches = this.FORMATO_OPTIONS.map((opt) => this.fetchFormato(opt.opcion));
      const fotoFetches = this.FOTO_OPTIONS.map((opt) => this.fetchFotoModo(opt.opcion));
      const felFormatoFetches = this.FEL_FORMATO_OPTIONS.map((opt) => this.fetchFelFormatoModo(opt.opcion));
      const tipofacFinalizadoFetches = this.TIPOFAC_FINALIZADO_OPTIONS.map((opt) =>
        this.fetchTipofacFinalizado(opt.opcion)
      );
      const fetches = [
        ...passFetches,
        ...textFetches,
        ...sinoFetches,
        ...concreFetches,
        ...formatoFetches,
        ...fotoFetches,
        ...felFormatoFetches,
        ...tipofacFinalizadoFetches,
      ];
      if (empNit) fetches.push(this.fetchInvSaldoPendientes());
      fetches.push(
        F.fetchJson(`/api/whatsapp/status?_=${Date.now()}`, { cache: 'no-store' }).catch(() => ({
          state: 'idle',
          library: '@whiskeysockets/baileys',
        }))
      );
      if (typeof WhatsappProgramacionUI !== 'undefined') {
        fetches.push(
          WhatsappProgramacionUI.load(empNit).catch((err) => {
            WhatsappProgramacionUI.setLoadError(err.message);
            return null;
          })
        );
      }
      const results = await Promise.all(fetches);
      let idx = 0;
      const passResults = results.slice(idx, (idx += this.PASS_CARDS.length));
      const textResults = results.slice(idx, (idx += this.TEXT_CARDS.length));
      const sinoResults = results.slice(idx, (idx += this.SINO_OPTIONS.length));
      const concreResults = results.slice(idx, (idx += this.CONCRE_OPTIONS.length));
      const formatoResults = results.slice(idx, (idx += this.FORMATO_OPTIONS.length));
      const fotoResults = results.slice(idx, (idx += this.FOTO_OPTIONS.length));
      const felFormatoResults = results.slice(idx, (idx += this.FEL_FORMATO_OPTIONS.length));
      const tipofacFinalizadoResults = results.slice(idx, (idx += this.TIPOFAC_FINALIZADO_OPTIONS.length));
      let invSaldoMeta = { pendientes: 0 };
      if (empNit) {
        invSaldoMeta = results[idx] || { pendientes: 0 };
        idx += 1;
      }
      this._whatsappStatus = results[idx] || { state: 'idle', library: '@whiskeysockets/baileys' };

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
      this._formatoMeta = {};
      this.FORMATO_OPTIONS.forEach((opt, i) => {
        this._formatoMeta[opt.opcion] = formatoResults[i];
      });
      this._fotoMeta = {};
      this.FOTO_OPTIONS.forEach((opt, i) => {
        this._fotoMeta[opt.opcion] = fotoResults[i];
      });
      this._felFormatoMeta = {};
      this.FEL_FORMATO_OPTIONS.forEach((opt, i) => {
        this._felFormatoMeta[opt.opcion] = felFormatoResults[i];
      });
      this._tipofacFinalizadoMeta = {};
      this.TIPOFAC_FINALIZADO_OPTIONS.forEach((opt, i) => {
        this._tipofacFinalizadoMeta[opt.opcion] = tipofacFinalizadoResults[i];
      });
      this._invSaldoPendientes = invSaldoMeta.pendientes ?? 0;

      container.innerHTML = this.renderAll();
      this.PASS_CARDS.forEach((card) => {
        const input = document.getElementById(`input-${card.slug}-pass`);
        if (input) input.value = this._passMeta[card.opcion]?.pass ?? '';
      });
      this.TEXT_CARDS.forEach((card) => {
        const input = document.getElementById(`input-${card.slug}-text`);
        if (!input) return;
        const stored = this._textMeta[card.opcion]?.pass ?? '';
        input.value = stored || card.defaultValue || '';
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
