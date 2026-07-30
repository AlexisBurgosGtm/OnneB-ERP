/**
 * Selector de serie (CODDOC) para crear documentos y filtrar el listado.
 */
const DocTipoSelect = {
  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  tipos(config) {
    return config?.tiposDocumento || [];
  },

  resolve(tipos, current) {
    const list = (tipos || []).map((t) => String(t.CODDOC ?? '').trim()).filter(Boolean);
    const cur = String(current ?? '').trim();
    if (cur && list.includes(cur)) return cur;
    return list[0] || '';
  },

  applyToConfig(config, coddoc) {
    const selected = this.resolve(this.tipos(config), coddoc);
    if (config) config.coddocDefault = selected || null;
    return selected;
  },

  initView(view) {
    const preferred = String(view._selectedCoddoc || view._config?.coddocDefault || '').trim();
    const selected = this.applyToConfig(view._config, preferred);
    view._selectedCoddoc = selected;
    return selected;
  },

  /**
   * Recarga tipos/series desde el API de la vista (evita selector desfasado
   * cuando otro usuario agregó series). Conserva la serie seleccionada si sigue activa.
   */
  async reloadTiposDocumento(view) {
    if (!view || typeof view.fetchConfig !== 'function') return view?._config || null;
    const prev = String(view._selectedCoddoc || '').trim();
    view._config = await view.fetchConfig();
    if (prev) view._selectedCoddoc = prev;
    this.initView(view);
    return view._config;
  },

  active(view) {
    return view._selectedCoddoc || view._config?.coddocDefault || '';
  },

  renderSelectHtml({
    selectId,
    tipos,
    selected,
    label = 'Serie',
    className = 'doc-tipo-select-wrap',
  }) {
    const esc = this.escapeHtml.bind(this);
    const id = esc(selectId);
    if (!tipos?.length) {
      return `<div class="${esc(className)}">
        <label class="form-label small mb-1" for="${id}">${esc(label)}</label>
        <select class="form-select form-select-sm" id="${id}" disabled>
          <option value="">Sin series activas</option>
        </select>
      </div>`;
    }
    const opts = tipos
      .map((t) => {
        const cod = String(t.CODDOC ?? '').trim();
        const des = String(t.DESDOC ?? cod).trim();
        const sel = cod === selected ? ' selected' : '';
        return `<option value="${esc(cod)}"${sel}>${esc(cod)} — ${esc(des)}</option>`;
      })
      .join('');
    return `<div class="${esc(className)}">
      <label class="form-label small mb-1" for="${id}">${esc(label)}</label>
      <select class="form-select form-select-sm" id="${id}" aria-label="${esc(label)}">${opts}</select>
    </div>`;
  },

  bind(container, selectId, view, onChange) {
    const sel = container?.querySelector(`#${selectId}`);
    if (!sel) return;
    sel.addEventListener('change', async () => {
      DocTipoSelect.syncFromDom(container, selectId, view);
      if (typeof onChange === 'function') {
        await onChange(DocTipoSelect.active(view));
      }
    });
  },

  syncFromDom(container, selectId, view) {
    const sel = container?.querySelector(`#${selectId}`);
    if (!sel) {
      if (view._config) DocTipoSelect.initView(view);
      return DocTipoSelect.active(view);
    }
    const coddoc = DocTipoSelect.applyToConfig(view._config, sel.value?.trim() || '');
    view._selectedCoddoc = coddoc;
    return coddoc;
  },
};
