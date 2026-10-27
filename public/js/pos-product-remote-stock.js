/**
 * Existencia en otras sedes (COMMUNITY_EMPRESAS_SYNC + consulta externa /producto).
 */
const PosProductListUI = {
  remoteStockButtonHtml(codprod, escapeHtml) {
    const esc = typeof escapeHtml === 'function' ? escapeHtml : (v) => String(v ?? '');
    const cod = esc(String(codprod ?? '').trim());
    if (!cod) return '';
    return `<button type="button" class="btn btn-sm btn-link pos-remote-stock-btn p-0"
      data-pos-remote-stock="1" data-codprod="${cod}"
      title="Existencia en otras sedes" aria-label="Existencia en otras sedes">
      <i class="fa-solid fa-wifi" aria-hidden="true"></i>
    </button>`;
  },
};

const PosRemoteStockUI = {
  _modal: null,
  _bound: false,

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatQty(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '0';
    return v.toLocaleString('es-GT', { maximumFractionDigits: 3 });
  },

  ensureModal() {
    let el = document.getElementById('pos-remote-stock-modal');
    if (!el) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div class="modal fade" id="pos-remote-stock-modal" tabindex="-1" aria-hidden="true"
          aria-labelledby="pos-remote-stock-modal-title">
          <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-lg">
            <div class="modal-content">
              <div class="modal-header">
                <h2 class="modal-title h6" id="pos-remote-stock-modal-title">Existencia en sedes</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
              </div>
              <div class="modal-body p-0">
                <div id="pos-remote-stock-loader" class="text-center py-4 text-muted small" hidden>
                  <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Consultando sedes…
                </div>
                <div class="table-responsive">
                  <table class="table table-sm table-striped align-middle mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Sucursal</th>
                        <th>Código</th>
                        <th>Descripción</th>
                        <th class="text-end">Existencia</th>
                        <th class="text-end">Físico</th>
                      </tr>
                    </thead>
                    <tbody id="pos-remote-stock-tbody"></tbody>
                  </table>
                </div>
                <p id="pos-remote-stock-empty" class="small text-muted text-center py-3 mb-0" hidden></p>
              </div>
            </div>
          </div>
        </div>`;
      el = wrap.firstElementChild;
      document.body.appendChild(el);
    } else if (el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
    if (!this._modal && typeof bootstrap !== 'undefined') {
      this._modal = bootstrap.Modal.getOrCreateInstance(el);
      el.addEventListener('show.bs.modal', () => {
        document.body.classList.add('pos-remote-stock-modal-open');
        if (window.OnnebPace) window.OnnebPace.stop();
      });
      el.addEventListener('hidden.bs.modal', () => {
        document.body.classList.remove('pos-remote-stock-modal-open');
      });
    }
    return el;
  },

  renderRows(rows) {
    const tbody = document.getElementById('pos-remote-stock-tbody');
    const empty = document.getElementById('pos-remote-stock-empty');
    if (!tbody) return;
    if (!rows?.length) {
      tbody.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'No hay sedes con enlace configurado en COMMUNITY_EMPRESAS_SYNC.';
      }
      return;
    }
    if (empty) empty.hidden = true;
    tbody.innerHTML = rows
      .map((row) => {
        const suc = this.escapeHtml(row.empnombre || row.empnit || '—');
        if (!row.ok) {
          return `<tr class="table-warning">
            <td>${suc}</td>
            <td colspan="4" class="small text-danger">${this.escapeHtml(row.error || 'Sin datos')}</td>
          </tr>`;
        }
        const p = row.producto || {};
        return `<tr>
          <td>${suc}</td>
          <td><code class="small">${this.escapeHtml(p.CODPROD)}</code></td>
          <td>${this.escapeHtml(p.DESPROD)}${p.DESMARCA ? ` <span class="text-muted small">(${this.escapeHtml(p.DESMARCA)})</span>` : ''}</td>
          <td class="text-end">${this.escapeHtml(this.formatQty(p.EXISTENCIA))}</td>
          <td class="text-end">${this.escapeHtml(this.formatQty(p.FISICO))}</td>
        </tr>`;
      })
      .join('');
  },

  async openModal(codprod) {
    const cod = String(codprod || '').trim();
    if (!cod) return;
    const el = this.ensureModal();
    const title = document.getElementById('pos-remote-stock-modal-title');
    const loader = document.getElementById('pos-remote-stock-loader');
    const tbody = document.getElementById('pos-remote-stock-tbody');
    const empty = document.getElementById('pos-remote-stock-empty');
    if (title) title.textContent = `Existencia en sedes — ${cod}`;
    if (tbody) tbody.innerHTML = '';
    if (empty) empty.hidden = true;
    if (loader) loader.hidden = false;
    if (window.OnnebPace) window.OnnebPace.stop();
    this._modal?.show();
    try {
      const data = await F.fetchJson(
        `/api/community/stock-sedes?codprod=${encodeURIComponent(cod)}&_=${Date.now()}`,
        { cache: 'no-store', trackLastError: false }
      );
      this.renderRows(data.rows || []);
    } catch (err) {
      if (tbody) tbody.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        empty.textContent = err.message || 'No se pudo consultar las sedes';
      }
    } finally {
      if (loader) loader.hidden = true;
      if (window.OnnebPace) window.OnnebPace.stop();
    }
  },

  bindDelegation() {
    if (this._bound) return;
    this._bound = true;
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest('[data-pos-remote-stock]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const cod =
          btn.getAttribute('data-codprod') ||
          btn.closest('.pos-product-item')?.getAttribute('data-codprod');
        if (cod) this.openModal(cod);
      },
      true
    );
  },
};

PosRemoteStockUI.bindDelegation();
