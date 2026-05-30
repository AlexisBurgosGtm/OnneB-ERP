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
      <button type="button" class="btn-catalogo-nuevo" id="${id}" aria-label="Nuevo registro" title="Nuevo">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </button>
    `;
  },

  btnEditar(empnit) {
    const attr = empnit ? `data-empnit="${this.escapeAttr(empnit)}"` : '';
    return `
      <button type="button" class="btn btn-catalogo-editar" ${attr} aria-label="Editar" title="Editar">
        <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
      </button>
    `;
  },

  btnEliminar(empnit) {
    const attr = empnit ? `data-empnit="${this.escapeAttr(empnit)}"` : '';
    return `
      <button type="button" class="btn btn-catalogo-eliminar" ${attr} aria-label="Eliminar" title="Eliminar">
        <i class="fa-solid fa-trash" aria-hidden="true"></i> Eliminar
      </button>
    `;
  },

  accionesRow(empnit) {
    return `<div class="catalogo-acciones">${this.btnEditar(empnit)}${this.btnEliminar(empnit)}</div>`;
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

  /** Modal formulario — Guardar a la derecha */
  async fireForm({ title, html, preConfirm, width = 520, confirmText = 'Guardar' }) {
    const result = await Swal.fire({
      ...this.modalBase(),
      title,
      html: `<div class="catalogo-form text-start">${html}</div>`,
      width,
      showCancelButton: true,
      confirmButtonText: this.guardarButtonHtml(confirmText),
      cancelButtonText: this.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      preConfirm,
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
          ? `<i class="fa-solid fa-trash"></i> ${confirmText}`
          : confirmText === 'Guardar'
            ? this.guardarButtonHtml(confirmText)
            : confirmText === 'Salir'
              ? `<i class="fa-solid fa-right-from-bracket"></i> ${confirmText}`
              : `<i class="fa-solid fa-check"></i> ${confirmText}`,
      cancelButtonText: this.cancelButtonHtml(cancelText),
    });
    return result.isConfirmed;
  },

  async confirmSalir({ title = '¿Cerrar sesión?', text = 'Volverá a la pantalla de inicio de sesión' }) {
    return this.fireConfirm({ title, text, icon: 'question', confirmText: 'Salir' });
  },
};
