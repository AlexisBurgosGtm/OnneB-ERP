/**
 * Utilidades de fecha de documento (POS / inventario).
 */
const DocFecha = {
  editableStatus(status) {
    return String(status || '').trim().toUpperCase() === 'O';
  },

  inputValueFromHeader(header) {
    if (!header) return '';
    const anio = Number(header.ANIO);
    const mes = Number(header.MES);
    const dia = Number(header.DIA);
    if (Number.isFinite(anio) && Number.isFinite(mes) && Number.isFinite(dia) && mes >= 1 && mes <= 12 && dia >= 1) {
      return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    }
    if (!header.FECHA) return '';
    const s = String(header.FECHA);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  renderField(id, header) {
    const val = DocFecha.inputValueFromHeader(header);
    const disabled = DocFecha.editableStatus(header?.STATUS) ? '' : ' disabled';
    return `
      <div class="pos-doc-fecha-wrap">
        <label class="form-label small mb-0" for="${id}">Fecha</label>
        <input type="date" class="form-control form-control-sm" id="${id}"
          value="${val}"${disabled} aria-label="Fecha del documento">
      </div>`;
  },
};
