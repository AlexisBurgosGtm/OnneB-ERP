/**
 * Vista Updater — consulta UPDATE_QUERIES (BD externa) y ejecuta en BD interna.
 */
const UPDATER_ANIOS = [];
for (let y = 2024; y <= 2030; y += 1) {
  UPDATER_ANIOS.push({ value: y, label: String(y) });
}

const UpdaterView = {
  _container: null,
  _rows: [],
  _anio: new Date().getFullYear(),
  _loading: false,
  _executing: false,

  defaultAnio() {
    const y = new Date().getFullYear();
    if (y < 2024) return 2024;
    if (y > 2030) return 2030;
    return y;
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatFecha(value) {
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

  truncateQry(text, max = 120) {
    const s = String(text ?? '').trim();
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
  },

  anioOptionsHtml(selected) {
    return UPDATER_ANIOS.map(
      (o) =>
        `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
    ).join('');
  },

  renderTableBodyHtml(rows) {
    if (!rows?.length) {
      return '<tr><td colspan="5" class="text-center text-muted py-4">Sin registros en UPDATE_QUERIES</td></tr>';
    }
    return rows
      .map((row) => {
        const qryFull = this.escapeHtml(String(row.QRY ?? ''));
        const qryShort = this.escapeHtml(this.truncateQry(row.QRY));
        return `<tr>
          <td>${this.escapeHtml(row.ID)}</td>
          <td>${this.escapeHtml(row.VERSION)}</td>
          <td>${this.escapeHtml(row.DB)}</td>
          <td>${this.escapeHtml(this.formatFecha(row.FECHA))}</td>
          <td class="updater-qry-cell" title="${qryFull}">${qryShort}</td>
        </tr>`;
      })
      .join('');
  },

  renderHtml() {
    return `
      <div class="updater-vista-wrap catalogo-vista-wrap">
        <div class="card updater-filters-card shadow-sm mb-3">
          <div class="card-body">
            <div class="d-flex flex-wrap align-items-end gap-3">
              <div>
                <label for="updater-anio" class="form-label small mb-1">Año (VERSION)</label>
                <select class="form-select form-select-sm" id="updater-anio" style="min-width: 7rem">
                  ${this.anioOptionsHtml(this._anio)}
                </select>
              </div>
              <div class="pb-1">
                <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-updater-refresh">
                  <i class="fa-solid fa-rotate me-1" aria-hidden="true"></i>Actualizar
                </button>
              </div>
              <div class="pb-1 ms-auto">
                <button type="button" class="btn btn-sm btn-primary" id="btn-updater-execute">
                  <i class="fa-solid fa-play me-1" aria-hidden="true"></i>Ejecutar en BD interna (DB=P)
                </button>
              </div>
            </div>
            <div class="small text-muted mt-2" id="updater-count">${this._rows.length} registro(s)</div>
          </div>
        </div>
        <div class="card updater-table-card shadow-sm">
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped mb-0">
                <thead class="table-light sticky-top">
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">VERSION</th>
                    <th scope="col">DB</th>
                    <th scope="col">FECHA</th>
                    <th scope="col">QRY</th>
                  </tr>
                </thead>
                <tbody id="updater-tbody">${this.renderTableBodyHtml(this._rows)}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async fetchList() {
    return F.fetchJson('/api/updater/queries');
  },

  async reload() {
    if (this._loading) return;
    this._loading = true;
    const tbody = this._container?.querySelector('#updater-tbody');
    const countEl = this._container?.querySelector('#updater-count');
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm me-2"></span>Cargando…</td></tr>';
    }
    try {
      const data = await this.fetchList();
      this._rows = data.rows || [];
      if (tbody) tbody.innerHTML = this.renderTableBodyHtml(this._rows);
      if (countEl) countEl.textContent = `${this._rows.length} registro(s) en total`;
    } catch (err) {
      this._rows = [];
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${this.escapeHtml(err.message || 'Error al cargar')}</td></tr>`;
      }
      F.toast(err.message || 'Error al cargar queries', 'error');
    } finally {
      this._loading = false;
    }
  },

  formatExecuteLog(data) {
    const ok = Number(data.executed) || 0;
    const fail = Number(data.failed) || 0;
    const total = Number(data.total) || (data.results || []).length;
    const header = [
      `Año: ${data.anio} · DB: ${data.db}`,
      `Correctas: ${ok} · Errores: ${fail} · Total: ${total}`,
      '—'.repeat(48),
    ].join('\n');
    const lines = (data.results || []).map((r) => {
      if (r.ok) return `[OK]    ID ${r.id}`;
      return `[ERROR] ID ${r.id}: ${r.error || 'Error desconocido'}`;
    });
    return `${header}\n${lines.join('\n') || 'Sin queries ejecutadas.'}`;
  },

  async showResultsModal(data) {
    const logText = this.formatExecuteLog(data);
    const icon = data.failed > 0 ? (data.executed > 0 ? 'warning' : 'error') : 'success';
    const title =
      data.failed > 0
        ? data.executed > 0
          ? 'Actualización con advertencias'
          : 'Actualización fallida'
        : 'Actualización completada';

    if (typeof Swal === 'undefined') {
      F.alert(title, logText, icon);
      return;
    }

    await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title,
      html: `<pre class="updater-result-log">${this.escapeHtml(logText)}</pre>`,
      icon,
      width: '42rem',
      confirmButtonText:
        typeof CatalogosUI !== 'undefined'
          ? CatalogosUI.guardarButtonHtml('Cerrar')
          : 'Cerrar',
    });
  },

  async onExecute() {
    if (this._executing) return;

    const countP = (this._rows || []).filter(
      (r) =>
        String(r.DB ?? '').trim().toUpperCase() === 'P' && Number(r.VERSION) === this._anio
    ).length;

    let confirm = false;
    if (typeof CatalogosUI !== 'undefined' && CatalogosUI.fireConfirm) {
      confirm = await CatalogosUI.fireConfirm({
        title: '¿Ejecutar actualizaciones?',
        text: `Se ejecutarán ${countP || 'las'} query(s) con VERSION=${this._anio} y DB=P en la base de datos interna, una a una (continúa aunque alguna falle).`,
        icon: 'warning',
        confirmText: 'INICIAR',
      });
    } else if (typeof Swal !== 'undefined') {
      const r = await Swal.fire({
        title: '¿Ejecutar actualizaciones?',
        text: `VERSION=${this._anio}, DB=P → base de datos interna.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'INICIAR',
        cancelButtonText: 'Cancelar',
      });
      confirm = r.isConfirmed;
    }

    if (!confirm) return;

    this._executing = true;
    const btn = document.getElementById('btn-updater-execute');
    const refreshBtn = document.getElementById('btn-updater-refresh');
    if (btn) btn.disabled = true;
    if (refreshBtn) refreshBtn.disabled = true;

    try {
      await F.runMutation(async () => {
        const data = await F.fetchJson('/api/updater/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anio: this._anio, db: 'P' }),
        });
        await this.showResultsModal(data);
        if (data.executed > 0) {
          F.toast(`${data.executed} query(s) aplicadas correctamente`, data.failed > 0 ? 'warning' : 'success');
        } else if (data.failed > 0) {
          F.toast('Ninguna query se aplicó; revise el detalle', 'warning');
        } else {
          F.toast('No hay queries para ejecutar', 'info');
        }
        await this.reload();
      });
    } catch (err) {
      F.toast(err.message || 'Error al ejecutar', 'error');
    } finally {
      this._executing = false;
      if (btn) btn.disabled = false;
      if (refreshBtn) refreshBtn.disabled = false;
    }
  },

  bindEvents() {
    document.getElementById('updater-anio')?.addEventListener('change', (e) => {
      this._anio = parseInt(e.target.value, 10) || this.defaultAnio();
    });
    document.getElementById('btn-updater-refresh')?.addEventListener('click', () => this.reload());
    document.getElementById('btn-updater-execute')?.addEventListener('click', () => this.onExecute());
  },

  load(container) {
    this._container = container;
    this._anio = this.defaultAnio();
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start');
    container.innerHTML = this.renderHtml();
    this.bindEvents();
    this.reload();
  },
};
