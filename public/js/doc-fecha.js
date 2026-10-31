/**
 * Utilidades de fecha de documento (POS / inventario / facturación).
 * Prioriza DOCUMENTOS.FECHA (calendario); evita desfases por zona horaria UTC.
 */
const DocFecha = {
  editableStatus(status) {
    return String(status || '').trim().toUpperCase() === 'O';
  },

  dateOnlyString(anio, mes, dia) {
    return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  },

  /**
   * Extrae YYYY-MM-DD desde DOCUMENTOS.FECHA.
   * DATE de SQL suele venir como ISO `YYYY-MM-DDT00:00:00.000Z` → usar día UTC.
   */
  fechaIsoFromValue(fecha) {
    if (fecha == null || fecha === '') return '';
    if (fecha instanceof Date) {
      if (Number.isNaN(fecha.getTime())) return '';
      return this.dateOnlyString(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate());
    }
    const s = String(fecha).trim();
    if (!s) return '';
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      return this.dateOnlyString(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return this.dateOnlyString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  },

  /** YYYY-MM-DD desde fila/header: primero FECHA, luego ANIO/MES/DIA. */
  fechaIsoFromHeader(header) {
    if (!header) return '';
    if (typeof header === 'string') return this.fechaIsoFromValue(header);
    const fromFecha = this.fechaIsoFromValue(header.FECHA);
    if (fromFecha) return fromFecha;
    const anio = Number(header.ANIO);
    const mes = Number(header.MES);
    const dia = Number(header.DIA);
    if (Number.isFinite(anio) && Number.isFinite(mes) && Number.isFinite(dia) && mes >= 1 && mes <= 12 && dia >= 1) {
      return this.dateOnlyString(anio, mes, dia);
    }
    return '';
  },

  inputValueFromHeader(header) {
    return this.fechaIsoFromHeader(header);
  },

  /** Muestra DOCUMENTOS.FECHA como dd/mm/yyyy. */
  formatDisplay(headerOrIso, empty = '—') {
    const iso = typeof headerOrIso === 'string' ? this.fechaIsoFromValue(headerOrIso) : this.fechaIsoFromHeader(headerOrIso);
    if (!iso) return empty;
    const [y, m, d] = iso.split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
    return iso;
  },

  todayIsoDate() {
    const d = new Date();
    return this.dateOnlyString(d.getFullYear(), d.getMonth() + 1, d.getDate());
  },

  renderField(id, header, opts = {}) {
    const lock = Boolean(opts.lockServerDate);
    const val = DocFecha.inputValueFromHeader(header);
    const editable = DocFecha.editableStatus(header?.STATUS);
    const disabled = !editable || lock;
    const title = lock
      ? 'Fecha fijada al día del servidor (configuración activa)'
      : 'Fecha del documento';
    return `
      <div class="pos-doc-fecha-wrap">
        <label class="form-label small mb-0" for="${id}">Fecha</label>
        <input type="date" class="form-control form-control-sm" id="${id}"
          value="${val}"${disabled ? ' disabled' : ''}${lock ? ' readonly' : ''}
          title="${title}" aria-label="Fecha del documento">
      </div>`;
  },

  /** Carga SI/NO y, si aplica, la fecha calendario del servidor ERP. */
  async loadPoliticaFechaServidorFacturas(fetchJson, getEmpNit) {
    const emp = getEmpNit();
    if (!emp) return { activa: false, fechaIso: '' };
    const opcion = 'OBLIGA FECHA SERVIDOR EN FAC FEL NC';
    const params = new URLSearchParams({ empnit: emp, opcion, _: String(Date.now()) });
    const sino = await fetchJson(`/api/config/sino?${params}`, { cache: 'no-store' });
    const activa = String(sino?.sino || '').trim().toUpperCase() === 'SI';
    if (!activa) return { activa: false, fechaIso: '' };
    const srv = await fetchJson(
      `/api/documentos/fecha-servidor?empnit=${encodeURIComponent(emp)}&_=${Date.now()}`,
      { cache: 'no-store' }
    );
    return { activa: true, fechaIso: String(srv?.FECHA || '').slice(0, 10) };
  },
};
