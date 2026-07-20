/**
 * Tipo de entrega (F_ENTREGA / DIRENTREGA) en modal de finalizar documento.
 */
const DocEntrega = {
  TIENDA: 'RECOGE EN TIENDA',
  DOMICILIO: 'A DOMICILIO',

  normalize(raw) {
    const s = String(raw ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');
    if (!s) return '';
    if (s === this.TIENDA || s === 'TIENDA' || s === 'RECOGE') return this.TIENDA;
    if (s === this.DOMICILIO || s === 'DOMICILIO' || s === 'A DOMICILIO') return this.DOMICILIO;
    return '';
  },

  isDomicilio(raw) {
    return this.normalize(raw) === this.DOMICILIO;
  },

  /** Dirección guardada del documento (ignora vacío / SN). */
  dirDefault(header) {
    const dir = String(header?.DIRENTREGA ?? header?.dirEntrega ?? '').trim();
    if (!dir || dir.toUpperCase() === 'SN') return '';
    return dir;
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  /**
   * @param {{ prefix: string, fEntrega?: string, dirEntrega?: string }} opts
   */
  fieldsHtml(opts) {
    const prefix = String(opts?.prefix || 'doc');
    const current = this.normalize(opts?.fEntrega) || this.TIENDA;
    const showDir = current === this.DOMICILIO;
    const dirVal = this.escapeHtml(String(opts?.dirEntrega ?? '').trim());
    return `
      <div class="mb-2">
        <label class="form-label small mb-0" for="${prefix}-finalizar-entrega">Tipo Entrega</label>
        <select id="${prefix}-finalizar-entrega" class="form-select form-select-sm">
          <option value="${this.escapeHtml(this.TIENDA)}"${
            current === this.TIENDA ? ' selected' : ''
          }>RECOGE EN TIENDA</option>
          <option value="${this.escapeHtml(this.DOMICILIO)}"${
            current === this.DOMICILIO ? ' selected' : ''
          }>A DOMICILIO</option>
        </select>
      </div>
      <div class="mb-2${showDir ? '' : ' d-none'}" id="${prefix}-finalizar-direntrega-wrap">
        <label class="form-label small mb-0" for="${prefix}-finalizar-direntrega">Dirección de Entrega</label>
        <input type="text" id="${prefix}-finalizar-direntrega" class="form-control form-control-sm"
          value="${dirVal}" autocomplete="off" placeholder="Dirección de entrega…">
      </div>
    `;
  },

  bindToggle(prefix) {
    const sel = document.getElementById(`${prefix}-finalizar-entrega`);
    const wrap = document.getElementById(`${prefix}-finalizar-direntrega-wrap`);
    const input = document.getElementById(`${prefix}-finalizar-direntrega`);
    const syncVisibility = () => {
      const isDom = this.isDomicilio(sel?.value);
      wrap?.classList.toggle('d-none', !isDom);
    };
    sel?.addEventListener('change', () => {
      const isDom = this.isDomicilio(sel?.value);
      wrap?.classList.toggle('d-none', !isDom);
      // Solo al cambiar a domicilio: campo en blanco (no borra la dirección cargada al editar).
      if (isDom && input) input.value = '';
    });
    syncVisibility();
  },

  /**
   * @returns {{ F_ENTREGA: string, DIRENTREGA: string } | { error: string }}
   */
  readFromDom(prefix) {
    const fEntrega = this.normalize(document.getElementById(`${prefix}-finalizar-entrega`)?.value);
    if (!fEntrega) return { error: 'Seleccione el tipo de entrega' };
    if (fEntrega === this.DOMICILIO) {
      const dir = document.getElementById(`${prefix}-finalizar-direntrega`)?.value?.trim() || '';
      if (!dir) return { error: 'Ingrese la dirección de entrega' };
      return { F_ENTREGA: fEntrega, DIRENTREGA: dir };
    }
    return { F_ENTREGA: fEntrega, DIRENTREGA: 'SN' };
  },

  /** Solo tipo de entrega en listados (sin DIRENTREGA). */
  formatListLabel(row) {
    return this.normalize(row?.F_ENTREGA) || String(row?.F_ENTREGA || '').trim();
  },
};
