/**
 * Edad del paciente (años y meses) a partir de fecha de nacimiento.
 */
const ConsultorioEdad = {
  parseDateOnly(raw) {
    const s = String(raw ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
    const dt = new Date(y, m - 1, d);
    if (Number.isNaN(dt.getTime())) return null;
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  },

  referenciaDate(refIso) {
    if (refIso) {
      const parsed = this.parseDateOnly(refIso);
      if (parsed) return parsed;
    }
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  },

  /**
   * @returns {{ years: number, months: number, label: string } | null}
   */
  calc(fechaNacimiento, refFechaIso) {
    const birth = this.parseDateOnly(fechaNacimiento);
    if (!birth) return null;
    const ref = this.referenciaDate(refFechaIso);
    if (ref < birth) return null;
    let years = ref.getFullYear() - birth.getFullYear();
    let months = ref.getMonth() - birth.getMonth();
    let days = ref.getDate() - birth.getDate();
    if (days < 0) {
      months -= 1;
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years < 0) return null;
    const yLabel = years === 1 ? '1 año' : `${years} años`;
    const mPart =
      months > 0 ? ` y ${months === 1 ? '1 mes' : `${months} meses`}` : years === 0 ? '0 meses' : '';
    const label = years === 0 && months === 0 ? 'Menor de 1 mes' : `${yLabel}${mPart}`;
    return { years, months, label };
  },

  label(fechaNacimiento, refFechaIso) {
    return this.calc(fechaNacimiento, refFechaIso)?.label || '—';
  },
};