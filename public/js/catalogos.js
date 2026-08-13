/**
 * UI global para catálogos — botones Nuevo, Editar, Eliminar
 */
const CatalogosUI = {
  escapeAttr(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  },

  btnNuevoFab(id = 'btn-catalogo-nuevo') {
    return `
      <button type="button" class="btn-catalogo-nuevo btn-onneb-nuevo-fab" id="${id}" aria-label="Nuevo registro" title="Nuevo">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </button>
    `;
  },

  btnVer(id, dataKey = 'empnit') {
    const attr = id !== undefined && id !== null && id !== '' ? `data-${dataKey}="${this.escapeAttr(id)}"` : '';
    return `
      <button type="button" class="btn btn-catalogo-ver" ${attr} aria-label="Ver detalle" title="Ver detalle">
        <i class="fa-solid fa-eye" aria-hidden="true"></i>
      </button>
    `;
  },

  btnEditar(id, dataKey = 'empnit') {
    const attr = id !== undefined && id !== null && id !== '' ? `data-${dataKey}="${this.escapeAttr(id)}"` : '';
    return `
      <button type="button" class="btn btn-catalogo-editar" ${attr} aria-label="Editar" title="Editar">
        <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
      </button>
    `;
  },

  btnEliminar(id, dataKey = 'empnit') {
    const attr = id !== undefined && id !== null && id !== '' ? `data-${dataKey}="${this.escapeAttr(id)}"` : '';
    return `
      <button type="button" class="btn btn-catalogo-eliminar" ${attr} aria-label="Eliminar" title="Eliminar">
        <i class="fa-solid fa-trash" aria-hidden="true"></i> Eliminar
      </button>
    `;
  },

  accionesRow(id, dataKey = 'empnit') {
    return `<div class="catalogo-acciones">${this.btnEditar(id, dataKey)}${this.btnEliminar(id, dataKey)}</div>`;
  },

  /** Opciones base modales: Cancelar izquierda, confirmar derecha */
  modalBase(overrides = {}) {
    const { customClass: customClassOverrides = {}, ...rest } = overrides;
    return {
      buttonsStyling: false,
      reverseButtons: false,
      customClass: {
        popup: 'modal-catalogo',
        actions: 'modal-catalogo-actions',
        confirmButton: 'btn-modal-guardar',
        cancelButton: 'btn-modal-cancelar',
        ...customClassOverrides,
      },
      ...rest,
    };
  },

  cancelButtonHtml(label = 'Cancelar') {
    return `<i class="fa-solid fa-right-from-bracket"></i> ${label}`;
  },

  guardarButtonHtml(label = 'Guardar') {
    return `<i class="fa-solid fa-floppy-disk"></i> ${label}`;
  },

  eliminarButtonHtml(label = 'Eliminar') {
    return `<i class="fa-solid fa-trash"></i> ${label}`;
  },

  aceptarButtonHtml(label = 'Aceptar') {
    return label;
  },

  /**
   * Campo de clave enmascarado (type=text + CSS) para evitar que el navegador ofrezca guardar contraseña.
   */
  secretInputFormHtml({
    inputId,
    label = 'Clave',
    placeholder = '',
    name = 'onneb-secret-auth',
    beforeInput = '',
    afterInput = '',
    formClass = '',
  } = {}) {
    const extraClass = formClass ? ` ${formClass}` : '';
    return `
      <form class="catalogo-form text-start secret-input-modal${extraClass}" autocomplete="off" novalidate
        onsubmit="return false">
        ${beforeInput}
        <label for="${this.escapeAttr(inputId)}" class="form-label small mb-0">${label}</label>
        <input
          type="text"
          id="${this.escapeAttr(inputId)}"
          class="form-control form-control-sm config-pass-mask"
          autocomplete="new-password"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          inputmode="text"
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          data-form-type="other"
          name="${this.escapeAttr(name)}"
          placeholder="${this.escapeAttr(placeholder)}"
        >
        ${afterInput}
      </form>`;
  },

  /** Enfoca el input y permite confirmar con Enter sin ocultar el botón Aceptar/Continuar. */
  wireSecretInputModal(inputId, { onInput } = {}) {
    const form = Swal.getPopup()?.querySelector('.secret-input-modal');
    form?.setAttribute('autocomplete', 'off');
    const input = document.getElementById(inputId);
    input?.focus();
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        Swal.clickConfirm();
      }
    });
    if (onInput) input?.addEventListener('input', onInput);
    return input;
  },

  /** Contenedor de campos del modal SweetAlert2 activo */
  getModalFieldRoot(popup) {
    const candidates = [
      popup?.querySelector?.('.catalogo-form'),
      typeof Swal !== 'undefined' ? Swal.getHtmlContainer?.()?.querySelector('.catalogo-form') : null,
      typeof Swal !== 'undefined' ? Swal.getHtmlContainer?.() : null,
      typeof document !== 'undefined'
        ? document.querySelector('.swal2-container.swal2-backdrop-show .catalogo-form')
        : null,
      typeof document !== 'undefined'
        ? document.querySelector('.swal2-container.swal2-backdrop-show .swal2-html-container')
        : null,
    ];
    return candidates.find(Boolean) || null;
  },

  /** Lee campos por name (o id) desde el modal visible */
  readNamedFields(popup, fieldNames, { idPrefix = '' } = {}) {
    const root = this.getModalFieldRoot(popup);
    if (!root) return {};
    const data = {};
    const names = Array.isArray(fieldNames) ? fieldNames : [];
    names.forEach((name) => {
      const byId = idPrefix ? root.querySelector(`#${idPrefix}${name}`) : null;
      const el = byId || root.querySelector(`[name="${name}"]`);
      if (!el || el.disabled) return;
      data[name] = String(el.value ?? '').trim();
    });
    return data;
  },

  /** Modal formulario — Guardar a la derecha */
  async fireForm({
    title,
    html,
    preConfirm,
    width = 520,
    confirmText = 'Guardar',
    didOpen,
    customClass,
    allowOutsideClick = true,
  } = {}) {
    let activePopup = null;
    const result = await Swal.fire({
      ...this.modalBase({ customClass }),
      title,
      html: `<div class="catalogo-form text-start">${html}</div>`,
      width,
      showCancelButton: true,
      confirmButtonText: this.guardarButtonHtml(confirmText),
      cancelButtonText: this.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      allowOutsideClick,
      preConfirm: () => {
        const popup = activePopup || Swal.getPopup();
        return typeof preConfirm === 'function' ? preConfirm(popup) : undefined;
      },
      didOpen: () => {
        activePopup = Swal.getPopup();
        if (typeof didOpen === 'function') didOpen(activePopup);
      },
    });
    return result.isConfirmed ? result.value : null;
  },

  /** Confirmación con botón principal a la derecha (Eliminar, Salir, Aceptar, etc.) */
  async fireConfirm({
    title,
    html = '',
    text = '',
    icon = 'question',
    confirmText = 'Aceptar',
    confirmClass = 'btn-modal-guardar',
    cancelText = 'Cancelar',
  }) {
    const result = await Swal.fire({
      ...this.modalBase({ customClass: { confirmButton: confirmClass } }),
      title,
      html: html || undefined,
      text: text || undefined,
      icon,
      showCancelButton: true,
      confirmButtonText:
        confirmClass === 'btn-catalogo-eliminar'
          ? this.eliminarButtonHtml(confirmText === 'Aceptar' || !confirmText ? 'Eliminar' : confirmText)
          : confirmText === 'Guardar'
            ? this.guardarButtonHtml('Guardar')
            : confirmText,
      cancelButtonText: this.cancelButtonHtml(cancelText),
    });
    return result.isConfirmed;
  },

  async confirmSalir({ title = '¿Cerrar sesión?', text = 'Volverá a la pantalla de inicio de sesión' }) {
    return this.fireConfirm({ title, text, icon: 'question', confirmText: 'Salir' });
  },

  /** ID Config PASS — clave de administrador (movimientos / autorización). */
  ADMIN_PASS_CONFIG_ID: 2,

  async verifyConfigPass(pass, configId = 2) {
    const data = await F.fetchJson(`/api/config/${encodeURIComponent(configId)}/verify-pass`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass: String(pass ?? '') }),
    });
    return Boolean(data?.ok);
  },

  /**
   * Modal con input tipo password; valida contra Config.PASS (ID=2 por defecto).
   * @returns {Promise<boolean>} true si la clave es correcta y el usuario confirmó.
   */
  async solicitarClaveAdmin({
    title = 'Clave requerida',
    text = 'Ingrese la clave de administrador para continuar.',
    configId = 2,
    confirmText = 'Aceptar',
    cancelText = 'Cancelar',
    confirmClass = null,
    verificarEnTiempoReal = true,
  } = {}) {
    const isEliminar = confirmText === 'Eliminar';
    const isPlainConfirm = confirmText === 'Aceptar' || confirmText === 'Continuar';
    const confirmCls = confirmClass || (isEliminar ? 'btn-catalogo-eliminar' : 'btn-modal-guardar');
    let lastVerifyOk = false;
    let verifySeq = 0;

    const setFeedback = (el, ok, message) => {
      if (!el) return;
      el.textContent = message;
      el.classList.remove('text-success', 'text-danger', 'text-muted');
      el.classList.add(ok ? 'text-success' : message ? 'text-danger' : 'text-muted');
    };

    const runVerify = async (pass, feedbackEl) => {
      const seq = ++verifySeq;
      if (!pass) {
        lastVerifyOk = false;
        setFeedback(feedbackEl, false, '');
        return false;
      }
      try {
        const ok = await this.verifyConfigPass(pass, configId);
        if (seq !== verifySeq) return ok;
        lastVerifyOk = ok;
        setFeedback(feedbackEl, ok, ok ? 'Clave correcta' : 'Clave incorrecta');
        return ok;
      } catch (err) {
        if (seq !== verifySeq) return false;
        lastVerifyOk = false;
        setFeedback(feedbackEl, false, err.message || 'Clave incorrecta');
        return false;
      }
    };

    const debouncedVerify = F.debounce((pass, feedbackEl) => {
      runVerify(pass, feedbackEl);
    }, 350);

    const result = await Swal.fire({
      ...this.modalBase({ customClass: { confirmButton: confirmCls } }),
      title,
      html: `
        ${this.secretInputFormHtml({
          inputId: 'config-pass-input',
          label: 'Clave',
          placeholder: 'Clave de administrador',
          name: 'onneb-admin-auth',
          formClass: 'config-pass-modal',
          beforeInput: `<p class="small text-muted mb-2 mb-sm-3">${text}</p>`,
          afterInput:
            '<div id="config-pass-feedback" class="small mt-1 config-pass-feedback" aria-live="polite"></div>',
        })}
      `,
      width: 420,
      showCancelButton: true,
      confirmButtonText: isEliminar
        ? this.eliminarButtonHtml(confirmText)
        : isPlainConfirm
          ? this.aceptarButtonHtml(confirmText)
          : this.guardarButtonHtml(confirmText),
      cancelButtonText: this.cancelButtonHtml(cancelText),
      focusConfirm: false,
      didOpen: () => {
        const feedback = document.getElementById('config-pass-feedback');
        this.wireSecretInputModal('config-pass-input', {
          onInput: verificarEnTiempoReal
            ? (e) => debouncedVerify(e.target.value, feedback)
            : undefined,
        });
      },
      preConfirm: async () => {
        const input = document.getElementById('config-pass-input');
        const feedback = document.getElementById('config-pass-feedback');
        const pass = input?.value ?? '';
        if (!pass) {
          Swal.showValidationMessage('Ingrese la clave');
          return false;
        }
        const ok = verificarEnTiempoReal && lastVerifyOk
          ? true
          : await runVerify(pass, feedback);
        if (!ok) {
          Swal.showValidationMessage('Clave incorrecta');
          return false;
        }
        return pass;
      },
    });
    return result.isConfirmed ? result.value : null;
  },

  /**
   * Gate global para eliminación de registros/documentos clave (no líneas de detalle).
   * - SOLICITA AUTORIZACIONES = SI → espera autorización (si aplica) → confirmación Sí/No (sin clave)
   * - SOLICITA AUTORIZACIONES = NO → solicita clave de administrador
   * @returns {Promise<{ pass: string|null }|null>} null si cancela
   */
  async authorizeEliminarRegistro({
    label = '',
    tipo = 'registro',
    kind = 'registro',
    title = null,
    html = null,
    passText = null,
    confirmText = 'Eliminar',
    coddoc = '',
    correlativo = '',
    tipodoc = '',
  } = {}) {
    const authUi = typeof AutorizacionesUI !== 'undefined' ? AutorizacionesUI : null;
    const solicita = authUi ? await authUi.isEnabled() : false;
    const labelTxt = String(label || '').trim() || String(tipo || 'registro');

    if (solicita) {
      let allowed = true;
      if (kind === 'documento' && authUi) {
        allowed = await authUi.gateAccionDocumento({
          accion: 'eliminar',
          coddoc,
          correlativo,
          tipodoc,
          label: labelTxt,
        });
      } else if (authUi) {
        allowed = await authUi.gateEliminarRegistro({
          label: labelTxt,
          tipoEntidad: tipo,
        });
      }
      if (!allowed) return null;

      const ok = await this.fireConfirm({
        title: title || `¿Eliminar ${tipo}?`,
        html:
          html ||
          `<p class="mb-0">Se eliminará permanentemente el ${tipo} <strong>${labelTxt}</strong>.</p>`,
        icon: 'warning',
        confirmText,
        confirmClass: 'btn-catalogo-eliminar',
      });
      if (!ok) return null;
      return { pass: null };
    }

    const pass = await this.solicitarClaveAdmin({
      title: 'Autorizar eliminación',
      text: passText || `Ingrese la clave de administrador para eliminar el ${tipo}.`,
      confirmText: confirmText === 'Continuar' ? 'Eliminar' : confirmText,
    });
    if (!pass) return null;
    return { pass: String(pass) };
  },

  /**
   * Eliminación de documento/registro clave.
   * Compatible con callers antiguos: retorna string de clave o '__AUTORIZADO__' tras wait+confirm.
   * @returns {Promise<string|null>}
   */
  async confirmEliminarDocumento({
    label,
    tipo = 'documento',
    kind = 'documento',
    title = null,
    html = null,
    passText = null,
    confirmText = 'Eliminar',
    coddoc = '',
    correlativo = '',
    tipodoc = '',
  } = {}) {
    const result = await this.authorizeEliminarRegistro({
      label,
      tipo,
      kind,
      title: title || (kind === 'documento' ? '¿Eliminar documento?' : `¿Eliminar ${tipo}?`),
      html:
        html ||
        `<p class="mb-0">Se eliminará permanentemente el ${tipo} <strong>${String(label || '').trim()}</strong>.</p>`,
      passText,
      confirmText,
      coddoc,
      correlativo,
      tipodoc,
    });
    if (!result) return null;
    return result.pass != null && String(result.pass) !== '' ? String(result.pass) : '__AUTORIZADO__';
  },
};

if (typeof F !== 'undefined') {
  F.solicitarClaveAdmin = (opts) => CatalogosUI.solicitarClaveAdmin(opts);
  F.verifyConfigPass = (pass, configId) => CatalogosUI.verifyConfigPass(pass, configId);
  F.ADMIN_PASS_CONFIG_ID = CatalogosUI.ADMIN_PASS_CONFIG_ID;
  F.authorizeEliminarRegistro = (opts) => CatalogosUI.authorizeEliminarRegistro(opts);
  F.confirmEliminarDocumento = (opts) => CatalogosUI.confirmEliminarDocumento(opts);
}
