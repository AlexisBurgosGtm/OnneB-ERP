/**
 * Consulta NIT/CUI en SAT vía Infile desde formularios de cliente/proveedor en documentos.
 */
const DocNitSatLookup = {
  apiUrl(identificador) {
    const emp = F.getEmpNit();
    const params = new URLSearchParams({
      empnit: emp,
      identificador: String(identificador || '').trim(),
      _: String(Date.now()),
    });
    return `/api/fel/contribuyente?${params}`;
  },

  /** Convierte signos típicos del certificador en espacios (nombres/apellidos). */
  cleanNombreSat(nombre) {
    return String(nombre || '')
      .replace(/[.,;|/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  ensureStatusEl(nitInput) {
    const wrap = nitInput.closest('.mb-2') || nitInput.parentElement;
    if (!wrap) return null;
    let el = wrap.querySelector('.doc-nit-sat-status');
    if (!el) {
      el = document.createElement('p');
      el.className = 'doc-nit-sat-status small mb-0 mt-1';
      wrap.appendChild(el);
    }
    return el;
  },

  setStatus(nitInput, message, tone = 'muted') {
    const el = this.ensureStatusEl(nitInput);
    if (!el) return;
    el.className = `doc-nit-sat-status small mb-0 mt-1 text-${tone}`;
    el.textContent = message;
  },

  bindEnterLookup(opts = {}) {
    const { popup, nitFieldName = 'NIT', nameFieldName } = opts;
    if (!popup || !nitFieldName || !nameFieldName) return;

    const nitInput = popup.querySelector(`[name="${nitFieldName}"]`);
    const nameInput = popup.querySelector(`[name="${nameFieldName}"]`);
    if (!nitInput) return;

    nitInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();

      const ident = nitInput.value.trim();
      if (!ident) {
        this.setStatus(nitInput, 'Ingrese un NIT o DPI/CUI', 'warning');
        return;
      }

      this.setStatus(nitInput, 'Consultando en SAT…', 'primary');

      try {
        const data = await F.fetchJson(this.apiUrl(ident), { cache: 'no-store' });
        const nombre = this.cleanNombreSat(data?.nombre || '');
        if (nombre && nameInput) {
          nameInput.value = nombre;
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const mensaje = String(data?.mensaje || '').trim();
        const tipo = String(data?.tipo || '').trim();
        if (nombre) {
          const okMsg = mensaje || (tipo === 'CUI' ? 'Nombre obtenido de SAT (DPI/CUI)' : 'Nombre obtenido de SAT');
          this.setStatus(nitInput, okMsg, 'success');
          nameInput?.focus();
        } else {
          this.setStatus(nitInput, mensaje || 'No se encontró nombre para el identificador', 'warning');
        }
      } catch (err) {
        this.setStatus(nitInput, err.message || 'Error al consultar SAT', 'danger');
        nitInput.focus();
      }
    });
  },
};
