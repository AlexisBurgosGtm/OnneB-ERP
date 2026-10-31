/**
 * DOCUMENTOS.STATUS — etiqueta y badge para listas de documentos.
 */
const DocStatus = {
  normalize(status) {
    return String(status ?? '').trim().toUpperCase();
  },

  label(status) {
    const s = this.normalize(status);
    if (s === 'O') return 'Operado';
    if (s === 'A') return 'Anulado';
    if (s === 'I') return 'Bloqueado / inactivo';
    if (s === 'E') return 'En edición';
    return s || 'Sin estado';
  },

  badgeClass(status) {
    const s = this.normalize(status);
    if (s === 'O') return 'text-bg-success';
    if (s === 'A') return 'text-bg-danger';
    if (s === 'I') return 'text-bg-secondary';
    if (s === 'E') return 'text-bg-warning';
    return 'text-bg-light border text-dark';
  },

  badgeHtml(status, escapeHtml = (v) => String(v ?? '')) {
    const s = this.normalize(status);
    if (!s) return escapeHtml('—');
    const cls = this.badgeClass(s);
    const title = escapeHtml(this.label(s));
    return `<span class="badge ${cls} doc-status-badge" title="${title}">${escapeHtml(s)}</span>`;
  },
};
