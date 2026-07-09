/**
 * Línea especial CODPROD=DESCUENTO (sin producto en catálogo ni documento referencia).
 */
const DocLineaDescuentoUi = {
  CODPROD: 'DESCUENTO',

  isLinea(line) {
    return String(line?.CODPROD || '').trim().toUpperCase() === this.CODPROD;
  },

  async prompt(view) {
    const { isConfirmed, value } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Agregar descuento',
      html: `
        <div class="text-start">
          <label class="form-label small mb-0" for="doc-descuento-desprod">Descripción</label>
          <input type="text" id="doc-descuento-desprod" class="form-control form-control-sm mb-3"
            maxlength="200" placeholder="Ej. Descuento por promoción" autocomplete="off">
          <label class="form-label small mb-0" for="doc-descuento-monto">Monto</label>
          <input type="number" id="doc-descuento-monto" class="form-control form-control-sm"
            min="0.01" step="0.01" placeholder="0.00">
          <p class="small text-muted mb-0 mt-2">Se agregará como línea <strong>${this.CODPROD}</strong> sin afectar inventario.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Agregar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => document.getElementById('doc-descuento-desprod')?.focus(),
      preConfirm: () => {
        const desprod = document.getElementById('doc-descuento-desprod')?.value?.trim();
        const monto = Number(document.getElementById('doc-descuento-monto')?.value);
        if (!desprod) {
          Swal.showValidationMessage('Ingrese la descripción del descuento');
          return false;
        }
        if (!Number.isFinite(monto) || monto <= 0) {
          Swal.showValidationMessage('Ingrese un monto mayor a cero');
          return false;
        }
        return { desprod, monto };
      },
    });
    if (!isConfirmed || !value) return null;
    return value;
  },

  postBody({ desprod, monto }) {
    return {
      tipo: 'descuento',
      CODPROD: this.CODPROD,
      DESPROD: desprod,
      MONTO: monto,
    };
  },
};
