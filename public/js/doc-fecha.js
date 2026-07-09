/**
 * Utilidades de fecha de documento (POS / inventario / facturación).
 * Siempre prioriza ANIO/MES/DIA; evita desfases por zona horaria en ISO UTC.
 */
const DocFecha = {
  editableStatus(status) {
    return String(status || '').trim().toUpperCase() === 'O';
  },

  dateOnlyString(anio, mes, dia) {
    return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  },

  fechaIsoFromHeader(header) {
    if (!header) return '';
    const anio = Number(header.ANIO);
    const mes = Number(header.MES);
    const dia = Number(header.DIA);
    if (Number.isFinite(anio) && Number.isFinite(mes) && Number.isFinite(dia) && mes >= 1 && mes <= 12 && dia >= 1) {
      return this.dateOnlyString(anio, mes, dia);
    }
    const s = String(header.FECHA ?? '').trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    if (/T00:00:00(\.000)?Z$/i.test(s)) {
      return this.dateOnlyString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return this.dateOnlyString(d.getFullYear(), d.getMonth() + 1, d.getDate());
  },

  inputValueFromHeader(header) {
    return this.fechaIsoFromHeader(header);
  },

  formatDisplay(headerOrIso, empty = '—') {
    const iso = typeof headerOrIso === 'string' ? headerOrIso : this.fechaIsoFromHeader(headerOrIso);
    if (!iso) return empty;
    const [y, m, d] = iso.split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
    return iso;
  },

  todayIsoDate() {
    const d = new Date();
    return this.dateOnlyString(d.getFullYear(), d.getMonth() + 1, d.getDate());
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
