/**
 * Historial de precios (últimas facturas FAC/FEL) por cliente.
 * Usado en POS, cotizaciones y facturación.
 */
const ClienteHistorialPreciosUI = {
  buttonHtml(id) {
    const btnId = String(id || 'cliente-historial').trim() || 'cliente-historial';
    return `<button type="button" class="btn btn-outline-secondary" id="${btnId}"
      title="Historial de precios del cliente"
      aria-label="Historial de facturas del cliente">
      <i class="fa-solid fa-clock-rotate-left"></i>
    </button>`;
  },

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

  formatQty(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  },

  formatFecha(row) {
    if (typeof DocFecha !== 'undefined' && DocFecha.formatDisplay) {
      return DocFecha.formatDisplay(row);
    }
    const f = row?.FECHA;
    if (!f) return '—';
    return String(f).slice(0, 10);
  },

  async fetchHistorial(codcliente, limit = 10) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const params = new URLSearchParams({
      empnit: emp,
      limit: String(limit),
      _: String(Date.now()),
    });
    return F.fetchJson(
      `/api/pos/clientes/${encodeURIComponent(codcliente)}/historial-facturas?${params}`
    );
  },

  /**
   * @param {{ codcliente: number|string, clienteNombre?: string }} opts
   */
  async open(opts = {}) {
    const codcliente = Number(opts.codcliente);
    if (!Number.isFinite(codcliente) || codcliente <= 0) {
      F.toast('Seleccione un cliente primero', 'warning');
      return;
    }
    const clienteNom =
      String(opts.clienteNombre || '').trim() || `Cliente ${codcliente}`;

    Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Historial de precios',
      html: `<p class="text-muted small mb-2">Cargando facturas de <strong>${this.escapeHtml(clienteNom)}</strong>…</p>`,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
      allowOutsideClick: true,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      const data = await this.fetchHistorial(codcliente, 10);
      const rows = data.rows || [];
      let bodyHtml;
      if (!rows.length) {
        bodyHtml =
          '<p class="text-muted small mb-0 text-center py-3">No hay facturas FAC/FEL recientes para este cliente.</p>';
      } else {
        bodyHtml = rows
          .map((doc) => {
            const fecha = this.escapeHtml(this.formatFecha(doc));
            const tip = this.escapeHtml(doc.TIPODOC || '');
            const label = this.escapeHtml(`${doc.CODDOC} #${doc.CORRELATIVO}`);
            const total = this.escapeHtml(this.formatMoney(doc.TOTALPRECIO));
            const lines = doc.lines || [];
            const linesHtml = lines.length
              ? `<table class="table table-sm table-bordered mb-0">
                  <thead class="table-light">
                    <tr>
                      <th>Cód.</th>
                      <th>Producto</th>
                      <th class="text-center">Med.</th>
                      <th class="text-end">Cant.</th>
                      <th class="text-end">Precio</th>
                      <th class="text-end">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${lines
                      .map(
                        (ln) => `<tr>
                      <td class="small text-nowrap">${this.escapeHtml(ln.CODPROD)}</td>
                      <td class="small">${this.escapeHtml(ln.DESPROD)}</td>
                      <td class="small text-center">${this.escapeHtml(ln.CODMEDIDA)}</td>
                      <td class="small text-end">${this.escapeHtml(this.formatQty(ln.CANTIDAD))}</td>
                      <td class="small text-end fw-semibold">${this.escapeHtml(this.formatMoney(ln.PRECIO))}</td>
                      <td class="small text-end">${this.escapeHtml(this.formatMoney(ln.TOTALPRECIO))}</td>
                    </tr>`
                      )
                      .join('')}
                  </tbody>
                </table>`
              : '<p class="small text-muted mb-0">Sin productos</p>';
            return `<div class="border rounded mb-2 overflow-hidden">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-1 px-2 py-1 bg-light border-bottom">
                <span class="small fw-semibold">${label} <span class="badge text-bg-secondary">${tip}</span></span>
                <span class="small text-muted">${fecha}</span>
                <span class="small fw-semibold">${total}</span>
              </div>
              <div class="p-1">${linesHtml}</div>
            </div>`;
          })
          .join('');
      }
      Swal.update({
        html: `
          <p class="small text-muted mb-2">Últimas ${rows.length || 0} facturas · <strong>${this.escapeHtml(clienteNom)}</strong></p>
          <div class="text-start" style="max-height: min(60vh, 520px); overflow-y: auto;">${bodyHtml}</div>
        `,
      });
      Swal.hideLoading();
    } catch (err) {
      Swal.close();
      throw err;
    }
  },
};
