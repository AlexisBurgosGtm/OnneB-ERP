/**
 * Solicitud de clave de vendedor al finalizar (config SOLICITA CLAVE VENDEDOR = SI).
 * Cajero y Administrador no solicitan clave: usan el selector de vendedor (o el de sesión).
 */
const DocVendedorClave = {
  SETTING_OPCION: 'SOLICITA CLAVE VENDEDOR',
  INPUT_ID: 'doc-vendedor-clave-input',

  isCajeroSession() {
    if (typeof TipoEmpleadoAccess === 'undefined') return false;
    return Number(TipoEmpleadoAccess.getCodTipo()) === TipoEmpleadoAccess.TIPO_CAJERO;
  },

  isAdminSession() {
    if (typeof F !== 'undefined' && typeof F.isAdminOrSuperUser === 'function') {
      return F.isAdminOrSuperUser();
    }
    if (typeof TipoEmpleadoAccess === 'undefined') return false;
    const user = typeof F !== 'undefined' ? F.session('user') : null;
    if (user?.superUser) return true;
    return Number(TipoEmpleadoAccess.getCodTipo(user)) === TipoEmpleadoAccess.TIPO_ADMIN;
  },

  async fetchSolicitaClave() {
    const params = new URLSearchParams({
      opcion: this.SETTING_OPCION,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/config/sino?${params}`, { cache: 'no-store' });
    return String(data.sino || 'NO').trim().toUpperCase() === 'SI';
  },

  /** true si la config pide clave y el usuario no es cajero ni administrador. */
  async shouldSolicitarClave() {
    if (this.isCajeroSession() || this.isAdminSession()) return false;
    return this.fetchSolicitaClave();
  },

  readClaveInput() {
    return document.getElementById(this.INPUT_ID)?.value?.trim() || '';
  },

  /**
   * Muestra modal de clave, busca vendedor y actualiza el documento.
   * @returns {Promise<boolean>} false si el usuario canceló o la clave no es válida
   */
  async promptAndApply({ apiLookupUrl, vendedorSelectId, view }) {
    const solicita = await this.shouldSolicitarClave();
    if (!solicita) return true;

    const { isConfirmed, value: clave } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Clave del vendedor',
      html: `
        <p class="small text-muted mb-3">Ingrese la clave del empleado vendedor para registrar la venta.</p>
        ${CatalogosUI.secretInputFormHtml({
          inputId: this.INPUT_ID,
          label: 'Clave',
          placeholder: 'Clave del vendedor',
          name: 'onneb-vendedor-auth',
        })}`,
      icon: 'lock',
      showCancelButton: true,
      confirmButtonText: CatalogosUI.aceptarButtonHtml('Continuar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => CatalogosUI.wireSecretInputModal(this.INPUT_ID),
      preConfirm: () => {
        const v = this.readClaveInput();
        if (!v) {
          Swal.showValidationMessage('Ingrese la clave del vendedor');
          return false;
        }
        return v;
      },
    });

    if (!isConfirmed) return false;

    let vendedor;
    try {
      vendedor = await F.fetchJson(apiLookupUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave }),
      });
    } catch (err) {
      Swal.fire({
        ...CatalogosUI.modalBase(),
        icon: 'error',
        title: 'Clave no válida',
        text: err.message || 'No se encontró un vendedor activo con esa clave',
      });
      return false;
    }

    const cod = String(vendedor.CODEMPLEADO);
    const sel = view._container?.querySelector(vendedorSelectId);
    if (sel) sel.value = cod;
    await view.guardarVendedorDocumento(cod);
    return true;
  },
};
