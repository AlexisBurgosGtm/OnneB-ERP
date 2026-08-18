/**
 * Utilidades compartidas para libros contables (filtros, export Excel, fechas).
 */
const LibroContableCommon = {
  MESES: [
    { value: 1, label: 'ENERO' },
    { value: 2, label: 'FEBRERO' },
    { value: 3, label: 'MARZO' },
    { value: 4, label: 'ABRIL' },
    { value: 5, label: 'MAYO' },
    { value: 6, label: 'JUNIO' },
    { value: 7, label: 'JULIO' },
    { value: 8, label: 'AGOSTO' },
    { value: 9, label: 'SEPTIEMBRE' },
    { value: 10, label: 'OCTUBRE' },
    { value: 11, label: 'NOVIEMBRE' },
    { value: 12, label: 'DICIEMBRE' },
  ],

  buildAnios() {
    const list = [];
    for (let y = 2020; y <= new Date().getFullYear() + 1; y += 1) {
      list.push({ value: y, label: String(y) });
    }
    return list;
  },

  defaultPeriod() {
    const now = new Date();
    return { mes: now.getMonth() + 1, anio: now.getFullYear() };
  },

  mesLabel(mes) {
    return this.MESES.find((m) => m.value === Number(mes))?.label || String(mes);
  },

  formatDate(value) {
    if (value === null || value === undefined || value === '') return '—';
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) return '—';
    const day = String(dt.getDate()).padStart(2, '0');
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const year = dt.getFullYear();
    return `${day}/${month}/${year}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  periodSelectsHtml(prefix, mes, anio) {
    const mesOpts = this.MESES.map(
      (m) =>
        `<option value="${m.value}"${Number(mes) === m.value ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const anioOpts = this.buildAnios()
      .map(
        (a) =>
          `<option value="${a.value}"${Number(anio) === a.value ? ' selected' : ''}>${a.label}</option>`
      )
      .join('');
    return `
      <div class="${prefix}-filter-mes">
        <label for="${prefix}-mes" class="form-label small mb-1">Mes</label>
        <select class="form-select form-select-sm" id="${prefix}-mes">${mesOpts}</select>
      </div>
      <div class="${prefix}-filter-anio">
        <label for="${prefix}-anio" class="form-label small mb-1">Año</label>
        <select class="form-select form-select-sm" id="${prefix}-anio">${anioOpts}</select>
      </div>
    `;
  },

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  searchInputHtml(prefix, value = '', placeholder = 'NIT, nombre, serie, número…') {
    const val = this.escapeHtml(value);
    return `
      <div class="${prefix}-filter-search flex-grow-1">
        <label for="${prefix}-search" class="form-label small mb-1">Buscar</label>
        <div class="input-group input-group-sm">
          <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
          <input type="search" class="form-control" id="${prefix}-search"
            placeholder="${placeholder}"
            value="${val}" autocomplete="off" spellcheck="false">
          <button type="button" class="btn btn-outline-secondary" id="btn-${prefix}-search-clear"
            title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  },

  normalizeSearch(q) {
    return String(q || '').trim().toLowerCase();
  },

  rowMatchesSearch(row, q, extraValues = []) {
    const nq = this.normalizeSearch(q);
    if (!nq) return true;
    const parts = [
      row?.LINEA,
      row?.TIPODOC,
      row?.FEL_SERIE,
      row?.FEL_NUMERO,
      row?.DOC_NIT,
      row?.DOC_NOMCLIE,
      row?.CODDOC,
      row?.CORRELATIVO,
      row?.STATUS,
      ...extraValues,
    ];
    const hay = parts
      .map((v) => String(v ?? '').trim().toLowerCase())
      .filter(Boolean)
      .join(' ');
    return hay.includes(nq);
  },

  bindSearch(container, prefix, view) {
    const search = container?.querySelector(`#${prefix}-search`);
    const clearBtn = container?.querySelector(`#btn-${prefix}-search-clear`);
    if (!search) return;
    const apply = () => {
      view._filterQuery = search.value;
      view.refreshDom();
    };
    search.addEventListener('input', apply);
    search.addEventListener('search', apply);
    clearBtn?.addEventListener('click', () => {
      search.value = '';
      view._filterQuery = '';
      view.refreshDom();
      search.focus();
    });
  },

  actionButtonsHtml(prefix) {
    return `
      <button type="button" class="btn btn-sm btn-outline-primary" id="btn-${prefix}-recargar">
        <i class="fa-solid fa-rotate me-1"></i>Actualizar
      </button>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-${prefix}-imprimir">
        <i class="fa-solid fa-print me-1"></i>Imprimir
      </button>
      <button type="button" class="btn btn-sm btn-outline-success" id="btn-${prefix}-export">
        <i class="fa-solid fa-file-excel me-1"></i>Exportar (xlsx)
      </button>
    `;
  },

  bindPeriodAndActions(container, prefix, view) {
    container?.querySelector(`#${prefix}-mes`)?.addEventListener('change', (e) => {
      view._mes = Number(e.target.value);
      view.reload().catch((err) => F.toast(err.message, 'error'));
    });
    container?.querySelector(`#${prefix}-anio`)?.addEventListener('change', (e) => {
      view._anio = Number(e.target.value);
      view.reload().catch((err) => F.toast(err.message, 'error'));
    });
    container?.querySelector(`#btn-${prefix}-recargar`)?.addEventListener('click', () => {
      view.reload().catch((err) => F.toast(err.message, 'error'));
    });
    container?.querySelector(`#btn-${prefix}-imprimir`)?.addEventListener('click', () => {
      view.imprimir().catch((err) => F.toast(err.message, 'error'));
    });
    container?.querySelector(`#btn-${prefix}-export`)?.addEventListener('click', () => {
      view.exportExcel().catch((err) => F.toast(err.message, 'error'));
    });
  },

  buildExportUrl(apiPath, mes, anio) {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const params = new URLSearchParams({
      empnit: empNit,
      mes: String(mes),
      anio: String(anio),
      _: String(Date.now()),
    });
    return `${apiPath}/export?${params.toString()}`;
  },

  async downloadExport(exportUrl, btn, fallbackFilename) {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa en la sesión');
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(exportUrl, { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const blob = await res.blob();
      const dispo = res.headers.get('Content-Disposition') || '';
      const match = dispo.match(/filename="?([^"]+)"?/i);
      const filename = match ? match[1] : fallbackFilename;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      F.toast('Excel exportado', 'success');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  renderWarningsHtml(warnings, escapeHtml) {
    if (!warnings?.length) return '';
    const items = warnings
      .slice(0, 8)
      .map((w) => `<li>${escapeHtml(w.message)}</li>`)
      .join('');
    const more =
      warnings.length > 8
        ? `<li class="text-muted">… y ${warnings.length - 8} más</li>`
        : '';
    return `
      <div class="alert alert-warning py-2 px-3 mb-3 small libro-contable-warnings" role="alert">
        <strong><i class="fa-solid fa-triangle-exclamation me-1"></i>Advertencias</strong>
        <ul class="mb-0 mt-1 ps-3">${items}${more}</ul>
      </div>
    `;
  },
};
