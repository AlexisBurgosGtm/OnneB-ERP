/**
 * Solicitud de clave de vendedor al finalizar (config SOLICITA CLAVE VENDEDOR = SI).
 */
const DocVendedorClave = {
  SETTING_OPCION: 'SOLICITA CLAVE VENDEDOR',
  INPUT_ID: 'doc-vendedor-clave-input',

  async fetchSolicitaClave() {
    const params = new URLSearchParams({
      opcion: this.SETTING_OPCION,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/config/sino?${params}`, { cache: 'no-store' });
    return String(data.sino || 'NO').trim().toUpperCase() === 'SI';
  },

  readClaveInput() {
    return document.getElementById(this.INPUT_ID)?.value?.trim() || '';
  },

  /**
   * Muestra modal de clave, busca vendedor y actualiza el documento.
   * @returns {Promise<boolean>} false si el usuario canceló o la clave no es válida
   */
  async promptAndApply({ apiLookupUrl, vendedorSelectId, view }) {
    const solicita = await this.fetchSolicitaClave();
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
