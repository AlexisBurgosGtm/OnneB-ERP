/**
 * Vista Fraccionamiento Facturas — cola DOCUMENTOS_COLA_TRABAJO.
 * Acciones: Certificar toda, Fraccionar en CF, Eliminar.
 */
const FraccionamientoFacView = {
  _container: null,
  _rows: [],
  _filterQuery: '',
  _tipodocs: [],
  _fraccionando: false,
  _fraccionCancel: false,
  _fraccionandoId: null,
  _fraccionQueue: [],
  _paramsSnapshot: null,
  _paramsLocked: false,
  _nextAt: null,
  _timerBadgeInterval: null,
  _runGeneration: 0,
  _maximoLegal: 2500,

  MINUTOS_OPTS: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90],

  LS_KEY: 'pos_onneb_ffac_params',
  LS_PROCESS_KEY: 'pos_onneb_ffac_process',

  defaultParams() {
    return { minutos: 15, minimo: 100, maximo: Math.min(500, this._maximoLegal || 2500), coddoc: '' };
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiUrl(path = '', extraParams = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    const params = new URLSearchParams({ empnit: emp, ...extraParams });
    return `/api/fraccionamiento-fac${segment}?${params}`;
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-');
      return `${d}-${m}-${y}`;
    }
    return this.escapeHtml(s);
  },

  formatCell(value) {
    if (value === null || value === undefined || value === '') return '—';
    return this.escapeHtml(value);
  },

  formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0.00';
    return n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  isFinalizado(row) {
    return String(row?.FINALIZADO || '').trim().toUpperCase() === 'SI';
  },

  loadParams() {
    try {
      const raw = localStorage.getItem(this.LS_KEY);
      if (!raw) return this.defaultParams();
      const parsed = JSON.parse(raw);
      const base = this.defaultParams();
      const maxLegal = Number(this._maximoLegal) > 0 ? Number(this._maximoLegal) : 2500;
      let maximo = Number(parsed.maximo) > 0 ? Number(parsed.maximo) : base.maximo;
      if (maximo > maxLegal) maximo = maxLegal;
      return {
        minutos: this.MINUTOS_OPTS.includes(Number(parsed.minutos))
          ? Number(parsed.minutos)
          : base.minutos,
        minimo: Number(parsed.minimo) > 0 ? Number(parsed.minimo) : base.minimo,
        maximo,
        coddoc: String(parsed.coddoc || '').trim(),
      };
    } catch (_) {
      return this.defaultParams();
    }
  },

  saveParams(partial = {}) {
    const current = this.readParamsFromDom();
    const next = { ...current, ...partial };
    try {
      localStorage.setItem(this.LS_KEY, JSON.stringify(next));
    } catch (_) {
      /* ignore quota */
    }
    return next;
  },

  readParamsFromDom() {
    const root = this._container;
    const minutos = Number(root?.querySelector('#ffac-param-minutos')?.value) || 15;
    const minimo = Number(root?.querySelector('#ffac-param-minimo')?.value) || 0;
    const maximo = Number(root?.querySelector('#ffac-param-maximo')?.value) || 0;
    const coddoc = String(root?.querySelector('#ffac-param-coddoc')?.value || '').trim();
    return { minutos, minimo, maximo, coddoc };
  },

  getParams() {
    if (this._paramsLocked && this._paramsSnapshot) {
      return { ...this._paramsSnapshot };
    }
    return this.readParamsFromDom();
  },

  setParamsLocked(locked) {
    this._paramsLocked = Boolean(locked);
    const root = this._container;
    if (!root) return;
    ['ffac-param-minutos', 'ffac-param-minimo', 'ffac-param-maximo', 'ffac-param-coddoc'].forEach((id) => {
      const el = root.querySelector(`#${id}`);
      if (el) el.disabled = this._paramsLocked;
    });
    const st = root.querySelector('#ffac-param-status');
    if (st && !this._paramsLocked) {
      st.textContent = '';
      st.classList.remove('text-warning');
    }
    this.updateTimerBadge();
  },

  lockParamsFromCurrent() {
    const snap = this.readParamsFromDom();
    this._paramsSnapshot = { ...snap };
    this.saveParams(snap);
    this.setParamsLocked(true);
    return snap;
  },

  unlockParamsIfIdle() {
    if (this._fraccionando || this._fraccionQueue.length) return;
    this._paramsSnapshot = null;
    this._nextAt = null;
    this.stopTimerBadge();
    this.setParamsLocked(false);
    this.clearProcessState();
  },

  processStatePayload() {
    return {
      empnit: F.getEmpNit() || '',
      active: Boolean(this._fraccionando || this._fraccionQueue.length),
      params: this._paramsSnapshot,
      currentId: this._fraccionandoId,
      queue: [...this._fraccionQueue],
      nextAt: this._nextAt,
      updatedAt: Date.now(),
    };
  },

  saveProcessState() {
    try {
      localStorage.setItem(this.LS_PROCESS_KEY, JSON.stringify(this.processStatePayload()));
    } catch (_) {
      /* ignore */
    }
  },

  loadProcessState() {
    try {
      const raw = localStorage.getItem(this.LS_PROCESS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  },

  clearProcessState() {
    try {
      localStorage.removeItem(this.LS_PROCESS_KEY);
    } catch (_) {
      /* ignore */
    }
  },

  formatCountdown(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  },

  updateTimerBadge() {
    const el = this._container?.querySelector('#ffac-timer-badge');
    if (!el) return;
    if (!this._paramsLocked && !this._fraccionando) {
      el.classList.add('d-none');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('d-none');
    if (this._nextAt && this._nextAt > Date.now()) {
      el.innerHTML = `<span class="badge text-bg-warning"><i class="fa-solid fa-clock me-1"></i>Siguiente CF en ${this.formatCountdown(this._nextAt - Date.now())}</span>`;
    } else if (this._fraccionando) {
      el.innerHTML = `<span class="badge text-bg-primary"><i class="fa-solid fa-spinner fa-spin me-1"></i>Generando…</span>`;
    } else {
      el.innerHTML = `<span class="badge text-bg-secondary">Proceso activo</span>`;
    }
  },

  startTimerBadge() {
    this.stopTimerBadge();
    this.updateTimerBadge();
    this._timerBadgeInterval = setInterval(() => this.updateTimerBadge(), 1000);
  },

  stopTimerBadge() {
    if (this._timerBadgeInterval) {
      clearInterval(this._timerBadgeInterval);
      this._timerBadgeInterval = null;
    }
  },

  async waitUntilNextAt(nextAt, rowLabel) {
    this._nextAt = nextAt;
    this.saveProcessState();
    this.startTimerBadge();
    while (Date.now() < nextAt) {
      if (this._fraccionCancel) break;
      const leftSec = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
      const leftMin = Math.floor(leftSec / 60);
      const sec = leftSec % 60;
      this.setProgress(`
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <span>
            <i class="fa-solid fa-hourglass-half me-1"></i>
            ${this.escapeHtml(rowLabel())}: siguiente factura en ${leftMin}:${String(sec).padStart(2, '0')}
            ${this._fraccionQueue.length ? ` · En cola: ${this._fraccionQueue.length}` : ''}
          </span>
          <button type="button" class="btn btn-sm btn-outline-danger" id="ffac-cancel-frac">Detener</button>
        </div>`);
      this._container?.querySelector('#ffac-cancel-frac')?.addEventListener('click', () => {
        this._fraccionCancel = true;
      });
      this.updateTimerBadge();
      await this.sleep(1000);
    }
    this._nextAt = null;
    this.saveProcessState();
    this.updateTimerBadge();
  },

  progressPct(emitido, total) {
    const t = Number(total) || 0;
    const e = Number(emitido) || 0;
    if (!(t > 0)) return 0;
    return Math.min(100, Math.round((e / t) * 100));
  },

  renderProgressBadge(row) {
    const id = Number(row.ID);
    const total = Number(row.TOTALPRECIO) || 0;
    const emitido = Number(row.TOTAL_EMITIDO) || 0;
    const pct = this.progressPct(emitido, total);
    const enCurso = this._fraccionando && Number(this._fraccionandoId) === id;
    const enCola = this._fraccionQueue.includes(id);

    if (enCurso) {
      return `<span class="badge text-bg-primary" title="Fraccionamiento en curso">
        <i class="fa-solid fa-spinner fa-spin me-1"></i>${pct}% · Q ${this.escapeHtml(this.formatMoney(emitido))} / Q ${this.escapeHtml(this.formatMoney(total))}
      </span>`;
    }
    if (enCola) {
      return `<span class="badge text-bg-info" title="En espera con los mismos parámetros">
        En cola · ${pct}%
      </span>`;
    }
    if (pct >= 100 || (total > 0 && emitido >= total - 0.02)) {
      return `<span class="badge text-bg-success">100% · Completo</span>`;
    }
    if (emitido > 0.005) {
      const docs = Number(row.DOCS_FRAC) || 0;
      return `<span class="badge text-bg-warning" title="Emitido / Total (CODEMBARQUE FRAC)">
        ${pct}% · Q ${this.escapeHtml(this.formatMoney(emitido))} / Q ${this.escapeHtml(this.formatMoney(total))}
        ${docs ? ` · ${docs} CF` : ''}
      </span>`;
    }
    return `<span class="badge text-bg-secondary">0% · Pendiente</span>`;
  },

  applyProgresoToRow(id, progreso) {
    const row = this._rows.find((r) => Number(r.ID) === Number(id));
    if (!row || !progreso) return;
    if (progreso.emitido != null) row.TOTAL_EMITIDO = progreso.emitido;
    if (progreso.totalFuente != null) row.TOTALPRECIO = progreso.totalFuente;
    this.refreshTable();
  },

  removeRowFromList(id) {
    this._rows = this._rows.filter((r) => Number(r.ID) !== Number(id));
    this.refreshTable();
  },

  validateParams(params = this.getParams()) {
    const maxLegal = Number(this._maximoLegal) > 0 ? Number(this._maximoLegal) : 2500;
    if (!params.coddoc) return 'Seleccione el CODDOC a generar en Parámetros';
    if (!(params.minimo > 0)) return 'Indique un Mínimo válido en Parámetros';
    if (!(params.maximo > 0)) return 'Indique un Máximo válido en Parámetros';
    if (params.maximo < params.minimo) return 'El Máximo debe ser mayor o igual al Mínimo';
    if (params.maximo > maxLegal) {
      return `El Máximo no puede superar Q ${this.formatMoney(maxLegal)} (límite en Configuraciones)`;
    }
    if (!this.MINUTOS_OPTS.includes(Number(params.minutos))) return 'Seleccione un intervalo de minutos válido';
    return null;
  },

  filteredRows() {
    const q = String(this._filterQuery || '').trim().toLowerCase();
    if (!q) return this._rows;
    return this._rows.filter((r) => {
      const hay = [
        r.TIPO,
        r.CODDOC,
        r.CORRELATIVO,
        r.FINALIZADO,
        r.DOC_NIT,
        r.DOC_NOMCLIE,
        r.TIPODOC,
        r.TOTALPRECIO,
        r.CONCRE,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  },

  formatFormaPago(concre) {
    return String(concre || 'CON').trim().toUpperCase() === 'CRE' ? 'CRÉDITO' : 'CONTADO';
  },

  renderTableBodyHtml() {
    const rows = this.filteredRows();
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún registro coincide con la búsqueda'
        : 'Sin registros en la cola de trabajo';
      return `<tr><td colspan="10" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((r) => {
        const id = r.ID;
        const label = `${r.CODDOC || '—'} #${r.CORRELATIVO ?? '—'}`;
        const done = this.isFinalizado(r);
        const busyThis = this._fraccionando && Number(this._fraccionandoId) === Number(id);
        const anyBusy = this._fraccionando || this._paramsLocked;
        const inQueue = this._fraccionQueue.includes(Number(id));
        const pago = this.formatFormaPago(r.CONCRE);
        const pagoClass =
          String(r.CONCRE || 'CON').trim().toUpperCase() === 'CRE' ? 'text-warning' : 'text-success';
        let fracBtn;
        if (busyThis) {
          fracBtn = `<button type="button" class="btn btn-sm btn-primary" disabled>
            <i class="fa-solid fa-spinner fa-spin me-1"></i>En proceso
          </button>`;
        } else if (inQueue) {
          fracBtn = `<button type="button" class="btn btn-sm btn-info" disabled>
            <i class="fa-solid fa-list me-1"></i>En cola
          </button>`;
        } else if (anyBusy) {
          fracBtn = `<button type="button" class="btn btn-sm btn-outline-primary" data-action="fraccionar-cf"
            data-id="${this.escapeHtml(id)}" title="Agregar a la cola con los parámetros bloqueados">
            <i class="fa-solid fa-plus me-1"></i>Agregar a cola
          </button>`;
        } else {
          fracBtn = `<button type="button" class="btn btn-sm btn-outline-primary" data-action="fraccionar-cf"
            data-id="${this.escapeHtml(id)}" title="Fraccionar en CF">
            <i class="fa-solid fa-scissors me-1"></i>Fraccionar en CF
          </button>`;
        }
        const actions = done
          ? `<span class="badge text-bg-success">Finalizado</span>`
          : `
            <div class="d-flex flex-wrap gap-1 justify-content-end">
              <button type="button" class="btn btn-sm btn-outline-success" data-action="certificar-toda"
                data-id="${this.escapeHtml(id)}" title="Certificar toda la factura"
                ${anyBusy ? 'disabled' : ''}>
                <i class="fa-solid fa-certificate me-1"></i>Certificar toda
              </button>
              ${fracBtn}
              <button type="button" class="btn btn-sm btn-outline-danger" data-action="eliminar"
                data-id="${this.escapeHtml(id)}" title="Eliminar ${this.escapeHtml(label)}"
                ${anyBusy ? 'disabled' : ''}>
                <i class="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </div>`;
        return `
          <tr class="${busyThis ? 'table-primary' : ''}">
            <td>${this.formatCell(r.TIPO)}</td>
            <td>${this.formatCell(r.CODDOC)}</td>
            <td class="text-end">${this.formatCell(r.CORRELATIVO)}</td>
            <td class="small">${this.formatCell(r.DOC_NOMCLIE)}</td>
            <td class="small fw-semibold ${pagoClass}">${this.escapeHtml(pago)}</td>
            <td class="text-end text-nowrap">Q ${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
            <td class="text-nowrap">${this.renderProgressBadge(r)}</td>
            <td>${this.formatFecha(r.FECHA_INICIO)}</td>
            <td>${this.formatCell(r.HORA_INICIO)}</td>
            <td class="text-end text-nowrap">${actions}</td>
          </tr>`;
      })
      .join('');
  },

  tipodocOptionsHtml(selected) {
    if (!this._tipodocs.length) {
      return '<option value="">Sin FEF/FEC (TIPOM=0)</option>';
    }
    return this._tipodocs
      .map((t) => {
        const label =
          t.DESDOC && t.DESDOC !== t.CODDOC
            ? `${t.CODDOC} — ${t.DESDOC} (${t.TIPODOC})`
            : `${t.CODDOC} (${t.TIPODOC})`;
        const sel = selected && selected === t.CODDOC ? ' selected' : '';
        return `<option value="${this.escapeHtml(t.CODDOC)}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
  },

  minutosOptionsHtml(selected) {
    return this.MINUTOS_OPTS.map((m) => {
      const sel = Number(selected) === m ? ' selected' : '';
      return `<option value="${m}"${sel}>${m} min</option>`;
    }).join('');
  },

  renderScreen(params) {
    const p = params || this.loadParams();
    return `
      <div class="catalogo-empresa-panel catalogo-vista-wrap w-100">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-2">
          <div>
            <h2 class="h5 mb-0"><i class="fa-solid fa-scissors me-2"></i>Fraccionamiento Facturas</h2>
            <p class="small text-muted mb-0">Cola de trabajo de documentos</p>
          </div>
          <div class="card shadow-sm flex-grow-1" style="max-width: 42rem">
            <div class="card-body py-2 px-3">
              <div class="d-flex align-items-center justify-content-between mb-2 gap-2 flex-wrap">
                <h6 class="mb-0 small text-uppercase text-muted">
                  <i class="fa-solid fa-sliders me-1"></i>Parámetros
                </h6>
                <div class="d-flex align-items-center gap-2">
                  <span id="ffac-timer-badge" class="d-none"></span>
                  <span class="small text-muted" id="ffac-param-status"></span>
                </div>
              </div>
              <div class="row g-2 align-items-end">
                <div class="col-6 col-md-3">
                  <label class="form-label small mb-0" for="ffac-param-minutos">Minutos</label>
                  <select class="form-select form-select-sm" id="ffac-param-minutos">
                    ${this.minutosOptionsHtml(p.minutos)}
                  </select>
                </div>
                <div class="col-6 col-md-2">
                  <label class="form-label small mb-0" for="ffac-param-minimo">Mínimo</label>
                  <input type="number" class="form-control form-control-sm" id="ffac-param-minimo"
                    min="0.01" step="0.01" value="${this.escapeHtml(p.minimo)}">
                </div>
                <div class="col-6 col-md-2">
                <div class="form-text small mb-0">Tope legal Q ${this.escapeHtml(this.formatMoney(this._maximoLegal))}</div>
                <label class="form-label small mb-0" for="ffac-param-maximo">Máximo</label>
                  <input type="number" class="form-control form-control-sm" id="ffac-param-maximo"
                    min="0.01" step="0.01" max="${this.escapeHtml(this._maximoLegal)}"
                    value="${this.escapeHtml(p.maximo)}">
                  
                </div>
                <div class="col-6 col-md-3">
                  <label class="form-label small mb-0" for="ffac-param-coddoc">CODDOC a generar</label>
                  <select class="form-select form-select-sm" id="ffac-param-coddoc">
                    <option value="">— Seleccione —</option>
                    ${this.tipodocOptionsHtml(p.coddoc)}
                  </select>
                </div>
                <div class="col-12 col-md-2">
                  <label class="form-label small mb-0" for="ffac-param-corr">Correlativo</label>
                  <input type="text" class="form-control form-control-sm" id="ffac-param-corr" readonly value="">
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="mb-3" style="max-width: 18rem">
          <div class="input-group input-group-sm">
            <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="ffac-search"
              placeholder="Buscar…" value="${this.escapeHtml(this._filterQuery)}" autocomplete="off">
          </div>
        </div>
        <div id="ffac-progress" class="d-none alert alert-info py-2 small mb-3" role="status"></div>
        <div class="card shadow-sm">
          <div class="table-responsive">
            <table class="table table-sm table-hover mb-0 align-middle">
              <thead class="table-light sticky-top">
                <tr>
                  <th>Tipo</th>
                  <th>Documento</th>
                  <th class="text-end">Correlativo</th>
                  <th>Cliente</th>
                  <th>Pago</th>
                  <th class="text-end">Total</th>
                  <th>Progreso</th>
                  <th>Inicio</th>
                  <th>Hora</th>
                  <th class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody id="ffac-tbody">${this.renderTableBodyHtml()}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  refreshTable() {
    const tbody = this._container?.querySelector('#ffac-tbody');
    if (tbody) tbody.innerHTML = this.renderTableBodyHtml();
  },

  setProgress(html, show = true) {
    const el = this._container?.querySelector('#ffac-progress');
    if (!el) return;
    if (!show) {
      el.classList.add('d-none');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('d-none');
    el.innerHTML = html;
  },

  async reloadCorrelativoParam() {
    const sel = this._container?.querySelector('#ffac-param-coddoc');
    const corrEl = this._container?.querySelector('#ffac-param-corr');
    if (!sel || !corrEl) return;
    const coddoc = this._paramsLocked && this._paramsSnapshot?.coddoc
      ? this._paramsSnapshot.coddoc
      : String(sel.value || '').trim();
    if (!coddoc) {
      corrEl.value = '';
      return;
    }
    try {
      const data = await F.fetchJson(
        this.apiUrl('/correlativo-siguiente', { coddoc, _: Date.now() }),
        { cache: 'no-store' }
      );
      corrEl.value = String(data.CORRELATIVO_SIGUIENTE ?? '');
    } catch (err) {
      corrEl.value = '—';
      F.toast(err.message || 'No se pudo leer correlativo', 'warning');
    }
  },

  bindParamEvents() {
    const root = this._container;
    if (!root) return;
    const persist = () => {
      this.clampMaximoInput();
      this.saveParams();
      const st = root.querySelector('#ffac-param-status');
      if (st) st.textContent = 'Guardado';
      setTimeout(() => {
        if (st) st.textContent = '';
      }, 1200);
    };
    ['ffac-param-minutos', 'ffac-param-minimo', 'ffac-param-maximo'].forEach((id) => {
      root.querySelector(`#${id}`)?.addEventListener('change', persist);
      root.querySelector(`#${id}`)?.addEventListener('blur', persist);
    });
    root.querySelector('#ffac-param-coddoc')?.addEventListener('change', () => {
      persist();
      this.reloadCorrelativoParam();
    });
  },

  bindEvents() {
    if (!this._container) return;
    const search = this._container.querySelector('#ffac-search');
    search?.addEventListener('input', () => {
      this._filterQuery = search.value || '';
      this.refreshTable();
    });
    this.bindParamEvents();
    this._container.querySelector('#ffac-tbody')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const action = btn.getAttribute('data-action');
      const id = parseInt(btn.getAttribute('data-id'), 10);
      if (!Number.isFinite(id)) return;
      if (action === 'eliminar') {
        this.onEliminar(id).catch((err) => F.alert('Error', err.message, 'error'));
      } else if (action === 'certificar-toda') {
        this.onCertificarToda(id).catch((err) => F.alert('Error', err.message, 'error'));
      } else if (action === 'fraccionar-cf') {
        this.onFraccionarCf(id).catch((err) => F.alert('Error', err.message, 'error'));
      }
    });
  },

  async fetchTipodocs() {
    const data = await F.fetchJson(this.apiUrl('/tipodocs-fel', { _: Date.now() }), {
      cache: 'no-store',
    });
    this._tipodocs = data.rows || [];
    const legal = Number(data.maximoLegal);
    if (Number.isFinite(legal) && legal > 0) this._maximoLegal = legal;
    return this._tipodocs;
  },

  clampMaximoInput() {
    const inp = this._container?.querySelector('#ffac-param-maximo');
    if (!inp) return;
    const maxLegal = Number(this._maximoLegal) > 0 ? Number(this._maximoLegal) : 2500;
    inp.setAttribute('max', String(maxLegal));
    const val = Number(inp.value);
    if (Number.isFinite(val) && val > maxLegal) {
      inp.value = String(maxLegal);
      F.toast(`Máximo limitado a Q ${this.formatMoney(maxLegal)} (configuración)`, 'info');
    }
  },

  async fetchRows() {
    const data = await F.fetchJson(this.apiUrl('', { _: Date.now() }), { cache: 'no-store' });
    this._rows = data.rows || [];
    return this._rows;
  },

  sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  },

  async onCertificarToda(id) {
    if (this._fraccionando || this._paramsLocked) {
      F.toast('Hay un fraccionamiento en curso. Certificar toda está bloqueado.', 'warning');
      return;
    }
    const params = this.getParams();
    const errParams = this.validateParams(params);
    if (errParams) {
      F.alert('Parámetros', errParams, 'warning');
      return;
    }

    const prep = await F.fetchJson(this.apiUrl(`/${id}/prep-certificar`, { _: Date.now() }), {
      cache: 'no-store',
    });
    const doc = prep.documento || {};
    // Certificar toda: la fecha del modal manda (no la del documento fuente).
    const fechaDefault = this.todayIso();

    await this.reloadCorrelativoParam();

    const payload = await CatalogosUI.fireForm({
      title: 'Certificar toda la factura',
      width: 560,
      confirmText: 'Certificar',
      html: `
        <p class="small text-muted mb-2">Fuente: <strong>${this.escapeHtml(doc.CODDOC)} #${this.escapeHtml(doc.CORRELATIVO)}</strong>
          ${doc.TIPODOC ? `· ${this.escapeHtml(doc.TIPODOC)}` : ''}</p>
        <p class="mb-3">Total: <strong>Q ${this.escapeHtml(this.formatMoney(doc.TOTALPRECIO))}</strong></p>
        <div class="mb-2">
          <label class="form-label small mb-0" for="ffac-nit">NIT</label>
          <input type="text" class="form-control form-control-sm" id="ffac-nit" name="DOC_NIT"
            value="${this.escapeHtml(doc.DOC_NIT || 'CF')}" autocomplete="off">
          <p class="small text-muted mb-0 mt-1">Enter para consultar nombre en SAT</p>
        </div>
        <div class="mb-2">
          <label class="form-label small mb-0" for="ffac-nom">Nombre cliente</label>
          <input type="text" class="form-control form-control-sm" id="ffac-nom" name="DOC_NOMCLIE"
            value="${this.escapeHtml(doc.DOC_NOMCLIE || '')}" required>
        </div>
        <div class="mb-2">
          <label class="form-label small mb-0" for="ffac-dir">Dirección</label>
          <input type="text" class="form-control form-control-sm" id="ffac-dir" name="DOC_DIRCLIE"
            value="${this.escapeHtml(doc.DOC_DIRCLIE || 'CIUDAD')}">
        </div>
        <div class="mb-0">
          <label class="form-label small mb-0" for="ffac-fecha">Fecha de emisión / certificación</label>
          <input type="date" class="form-control form-control-sm" id="ffac-fecha" name="FECHA"
            value="${this.escapeHtml(fechaDefault)}" required>
          <p class="small text-muted mb-0 mt-1">Aplica solo a la factura fiscal nueva (FechaHoraEmision y FEL_FECHA). El documento original de la cola no se modifica.</p>
        </div>
      `,
      didOpen: (popup) => {
        if (typeof DocNitSatLookup !== 'undefined') {
          DocNitSatLookup.bindEnterLookup({
            popup,
            nitFieldName: 'DOC_NIT',
            nameFieldName: 'DOC_NOMCLIE',
          });
        }
      },
      preConfirm: async (popup) => {
        const coddoc = params.coddoc;
        const nit = popup.querySelector('#ffac-nit')?.value?.trim() || 'CF';
        const nombre = popup.querySelector('#ffac-nom')?.value?.trim();
        const dir = popup.querySelector('#ffac-dir')?.value?.trim() || 'CIUDAD';
        const fecha = popup.querySelector('#ffac-fecha')?.value?.trim();
        if (!nombre) {
          Swal.showValidationMessage('Ingrese el nombre del cliente');
          return false;
        }
        if (!fecha) {
          Swal.showValidationMessage('Ingrese la fecha de emisión');
          return false;
        }
        try {
          const corrData = await F.fetchJson(
            this.apiUrl('/correlativo-siguiente', { coddoc, _: Date.now() }),
            { cache: 'no-store' }
          );
          const paramCorr = this._container?.querySelector('#ffac-param-corr');
          if (paramCorr) paramCorr.value = String(corrData.CORRELATIVO_SIGUIENTE ?? '');
        } catch (e) {
          Swal.showValidationMessage(e.message || 'No se pudo validar el correlativo');
          return false;
        }
        return {
          CODDOC: coddoc,
          DOC_NIT: nit,
          DOC_NOMCLIE: nombre,
          DOC_DIRCLIE: dir,
          FECHA: fecha,
          USUARIO: F.session('user')?.username || 'FAC',
        };
      },
    });

    if (!payload) return;

    try {
      const res = await F.fetchJson(this.apiUrl(`/${id}/certificar-toda`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const fel = res.fel || {};
      F.toast(
        `Certificado ${res.documento?.CODDOC || ''} #${res.documento?.CORRELATIVO ?? ''} — UUID ${fel.uuid || ''}`,
        'success'
      );
      if (typeof DocOpciones !== 'undefined' && DocOpciones.mostrarFormatosTrasCertificar) {
        const coddoc = res.documento?.CODDOC;
        const correlativo = res.documento?.CORRELATIVO;
        await DocOpciones.mostrarFormatosTrasCertificar({
          felUuid: fel.uuid || '',
          onImprimirSistema:
            coddoc != null && correlativo != null
              ? () => DocOpciones.imprimir(coddoc, correlativo)
              : undefined,
        });
      }
      this.removeRowFromList(id);
      await this.reloadCorrelativoParam();
    } catch (err) {
      F.alert('Error FEL', err.message || 'No se pudo certificar', 'error');
    }
  },

  async onFraccionarCf(id) {
    const row = this._rows.find((r) => Number(r.ID) === Number(id));
    const label = row
      ? `${row.CODDOC || '—'} #${row.CORRELATIVO ?? '—'}`
      : `ID ${id}`;

    // Proceso activo: solo encolar (mismos parámetros / mismo timer)
    if (this._fraccionando || this._paramsLocked) {
      if (Number(this._fraccionandoId) === Number(id)) {
        F.toast('Esta factura ya se está fraccionando', 'info');
        return;
      }
      if (this._fraccionQueue.includes(Number(id))) {
        F.toast(`${label} ya está en cola`, 'info');
        return;
      }
      if (!this._paramsSnapshot) {
        F.toast('No hay parámetros bloqueados activos', 'warning');
        return;
      }
      this._fraccionQueue.push(Number(id));
      this.saveProcessState();
      this.refreshTable();
      F.toast(
        `${label} agregada a la cola. Se iniciará tras el timer / factura en curso.`,
        'success'
      );
      return;
    }

    const params = this.lockParamsFromCurrent();
    const errParams = this.validateParams(params);
    if (errParams) {
      this.unlockParamsIfIdle();
      F.alert('Parámetros', errParams, 'warning');
      return;
    }

    const prep = await F.fetchJson(this.apiUrl(`/${id}/prep-certificar`, { _: Date.now() }), {
      cache: 'no-store',
    });
    const doc = prep.documento || {};
    const total = Number(doc.TOTALPRECIO) || 0;
    if (!(total > 0)) {
      this.unlockParamsIfIdle();
      F.alert('Sin total', 'El documento fuente no tiene total a fraccionar.', 'warning');
      return;
    }

    const emitido = Number(row?.TOTAL_EMITIDO) || 0;
    const docsFrac = Number(row?.DOCS_FRAC) || 0;
    const restante = Math.max(0, total - emitido);
    const esReanudacion = emitido > 0.005 || docsFrac > 0;
    const estMin = Math.max(1, Math.ceil((esReanudacion ? restante : total) / params.maximo));
    const estMax = Math.max(estMin, Math.ceil((esReanudacion ? restante : total) / params.minimo));

    const ok = await CatalogosUI.fireConfirm({
      title: esReanudacion ? '¿Reanudar fraccionamiento?' : '¿Fraccionar en CF?',
      html: `
        <p class="mb-2">Fuente <strong>${this.escapeHtml(doc.CODDOC)} #${this.escapeHtml(doc.CORRELATIVO)}</strong>
        · Total Q <strong>${this.escapeHtml(this.formatMoney(total))}</strong></p>
        ${
          esReanudacion
            ? `<p class="mb-2 text-warning">Ya hay <strong>${docsFrac}</strong> CF asociadas (CODEMBARQUE FRAC) por
               Q <strong>${this.escapeHtml(this.formatMoney(emitido))}</strong>.
               Solo se completará el restante: Q <strong>${this.escapeHtml(this.formatMoney(restante))}</strong>.</p>`
            : ''
        }
        <p class="mb-2">Se repartirán productos (mismo CODPROD, CODMEDIDA, PRECIO) en
        <code>${this.escapeHtml(params.coddoc)}</code> a CF, entre
        Q ${this.escapeHtml(this.formatMoney(params.minimo))} y Q ${this.escapeHtml(this.formatMoney(params.maximo))},
        cada ${params.minutos} min.</p>
        <p class="small text-muted mb-0">Estimado restante: ~${estMin}–${estMax} factura(s). Parámetros bloqueados; puede agregar otras facturas a la cola.</p>`,
      icon: 'question',
      confirmText: esReanudacion ? 'Reanudar' : 'Iniciar',
    });
    if (!ok) {
      this.unlockParamsIfIdle();
      return;
    }

    await this.runFraccionamiento(id, params, { skipFirstWait: true });
  },

  async runFraccionamiento(id, params, opts = {}) {
    const skipFirstWait = Boolean(opts.skipFirstWait);
    const runId = ++this._runGeneration;
    this._fraccionando = true;
    this._fraccionCancel = false;
    this._fraccionandoId = Number(id);
    this._paramsSnapshot = { ...params };
    this.setParamsLocked(true);
    this.startTimerBadge();
    this.saveProcessState();
    this.refreshTable();

    const fecha = this.todayIso();
    const usuario = F.session('user')?.username || 'FAC';
    const intervalMs = Number(params.minutos) * 60 * 1000;
    const generadas = [];
    let idx = 0;
    let completado = false;
    let first = true;

    const rowLabel = () => {
      const row = this._rows.find((r) => Number(r.ID) === Number(id));
      return row ? `${row.CODDOC || '—'} #${row.CORRELATIVO ?? '—'}` : `ID ${id}`;
    };

    try {
      while (!completado) {
        if (runId !== this._runGeneration) return;
        if (this._fraccionCancel) break;

        const shouldWait = !(first && skipFirstWait) && (idx > 0 || (first && this._nextAt));
        if (shouldWait) {
          const nextAt =
            this._nextAt && this._nextAt > Date.now()
              ? this._nextAt
              : Date.now() + intervalMs;
          await this.waitUntilNextAt(nextAt, rowLabel);
          if (this._fraccionCancel) break;
        }
        first = false;

        idx += 1;
        this._nextAt = null;
        this.saveProcessState();
        this.updateTimerBadge();
        this.setProgress(`
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <span>
              <i class="fa-solid fa-spinner fa-spin me-1"></i>
              ${this.escapeHtml(rowLabel())}: generando CF #${idx} (${this.escapeHtml(params.coddoc)})…
            </span>
            <button type="button" class="btn btn-sm btn-outline-danger" id="ffac-cancel-frac">Detener</button>
          </div>`);
        this._container?.querySelector('#ffac-cancel-frac')?.addEventListener('click', () => {
          this._fraccionCancel = true;
        });

        const res = await F.fetchJson(this.apiUrl(`/${id}/fraccionar-cf`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            CODDOC: params.coddoc,
            minimo: params.minimo,
            maximo: params.maximo,
            FECHA: fecha,
            USUARIO: usuario,
          }),
        });

        if (runId !== this._runGeneration) return;

        if (res.documento && !res.alreadyDone) {
          generadas.push(res.documento);
          if (res.felError) {
            F.toast(
              `CF ${res.documento?.CODDOC} #${res.documento?.CORRELATIVO} creada (sin FEL): ${res.felError}`,
              'warning'
            );
          } else {
            F.toast(
              `CF ${res.documento?.CODDOC} #${res.documento?.CORRELATIVO} — Q ${this.formatMoney(res.documento?.TOTALPRECIO)}`,
              'success'
            );
          }
        }
        // Mantener bloqueos UI mientras el proceso sigue
        this.setParamsLocked(true);
        this.startTimerBadge();
        this.applyProgresoToRow(id, res.progreso);
        completado = Boolean(res.alreadyDone || res.progreso?.completado);
        if (completado) this.removeRowFromList(id);
        else {
          // Programar siguiente intervalo (persiste si se cambia de vista)
          this._nextAt = Date.now() + intervalMs;
          this.saveProcessState();
        }
        await this.reloadCorrelativoParam();
        this.refreshTable();
        this.updateTimerBadge();
      }

      if (this._fraccionCancel) {
        this.setProgress(
          `<i class="fa-solid fa-ban me-1"></i>Detenido en ${this.escapeHtml(rowLabel())}. Generadas ${generadas.length}. Estado guardado para reanudar.`,
          true
        );
        F.toast(`Fraccionamiento detenido (${generadas.length}). Puede reanudar después.`, 'warning');
        this._fraccionQueue = [];
        this.clearProcessState();
      } else if (completado) {
        this.setProgress(
          `<i class="fa-solid fa-check me-1"></i>${this.escapeHtml(rowLabel())} completada y retirada de la cola.`,
          true
        );
        F.toast('Factura fraccionada, finalizada y retirada de la cola', 'success');
      }
    } catch (err) {
      this.setProgress(
        `<i class="fa-solid fa-circle-exclamation me-1"></i>Error: ${this.escapeHtml(err.message)}`,
        true
      );
      F.alert('Error al fraccionar', err.message || 'Fallo en el proceso', 'error');
      this.saveProcessState();
    } finally {
      if (runId !== this._runGeneration) return;

      this._fraccionando = false;
      this._fraccionandoId = null;
      const wasCancel = this._fraccionCancel;
      this._fraccionCancel = false;
      this.refreshTable();

      const nextId = !wasCancel ? this._fraccionQueue.shift() : null;
      this.saveProcessState();

      if (nextId && this._paramsSnapshot) {
        // Respeta el timer ya iniciado antes de la siguiente FAC en cola
        const waitAt = this._nextAt && this._nextAt > Date.now() ? this._nextAt : Date.now() + intervalMs;
        this._fraccionando = true;
        this._fraccionandoId = nextId;
        this.setParamsLocked(true);
        this.refreshTable();
        F.toast(`Siguiente en cola: esperando timer…`, 'info');
        await this.waitUntilNextAt(waitAt, () => `Cola #${nextId}`);
        if (this._fraccionCancel) {
          this._fraccionando = false;
          this._fraccionandoId = null;
          this._fraccionQueue = [];
          this.unlockParamsIfIdle();
          return;
        }
        await this.runFraccionamiento(nextId, this._paramsSnapshot, { skipFirstWait: true });
        return;
      }

      this.unlockParamsIfIdle();
      try {
        await this.fetchRows();
      } catch (_) {
        /* vista pudo no estar montada */
      }
      this.refreshTable();
      await this.reloadCorrelativoParam();
      setTimeout(() => this.setProgress('', false), 8000);
    }
  },

  async onEliminar(id) {
    const row = this._rows.find((r) => Number(r.ID) === Number(id));
    const label = row
      ? `${row.CODDOC || '—'} #${row.CORRELATIVO ?? '—'} (ID ${id})`
      : `ID ${id}`;
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Eliminar de la cola?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(label)}</strong> de la cola de trabajo y se limpiará <code>ID_COLA_TRABAJO</code> del documento.</p>`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!confirm) return;
    const pass = await CatalogosUI.solicitarClaveAdmin({
      title: 'Autorizar eliminación',
      text: 'Ingrese la clave de administrador para eliminar el registro.',
      confirmText: 'Eliminar',
    });
    if (!pass) return;
    await F.fetchJson(this.apiUrl(`/${id}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass: String(pass) }),
    });
    F.toast('Registro eliminado y documento liberado de cola', 'success');
    await this.fetchRows();
    this.refreshTable();
  },

  async load(container) {
    const wasRunning = this._fraccionando;
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-2', 'p-md-3');

    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese de nuevo.
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando cola de trabajo…
      </div>`;

    try {
      this._filterQuery = '';
      const saved = this.loadProcessState();
      const emp = F.getEmpNit();
      let params = this.loadParams();

      // Rehidratar proceso persistido (cambio de vista / recarga)
      if (!wasRunning && saved?.active && saved.empnit === emp && saved.params) {
        this._paramsSnapshot = { ...saved.params };
        this._fraccionQueue = Array.isArray(saved.queue) ? saved.queue.map(Number) : [];
        this._fraccionandoId = saved.currentId != null ? Number(saved.currentId) : null;
        this._nextAt = saved.nextAt && Number(saved.nextAt) > Date.now() ? Number(saved.nextAt) : null;
        params = { ...params, ...saved.params };
      }

      await Promise.all([this.fetchRows(), this.fetchTipodocs()]);
      // Releer params con el tope legal ya cargado
      params = this.loadParams();
      if (saved?.active && saved.empnit === emp && saved.params) {
        params = { ...params, ...saved.params };
        if (Number(params.maximo) > Number(this._maximoLegal)) {
          params.maximo = Number(this._maximoLegal);
        }
      }
      container.innerHTML = this.renderScreen(params);
      this.bindEvents();
      this.clampMaximoInput();

      if (wasRunning || (saved?.active && saved.empnit === emp && saved.params)) {
        this.setParamsLocked(true);
        this.startTimerBadge();
        // Aplicar valores bloqueados al DOM
        if (this._paramsSnapshot) {
          const p = this._paramsSnapshot;
          const setVal = (id, v) => {
            const el = container.querySelector(`#${id}`);
            if (el) el.value = v;
          };
          setVal('ffac-param-minutos', p.minutos);
          setVal('ffac-param-minimo', p.minimo);
          setVal('ffac-param-maximo', p.maximo);
          setVal('ffac-param-coddoc', p.coddoc);
        }
      }

      await this.reloadCorrelativoParam();
      this.refreshTable();

      // Reanudar loop si estaba persistido y no hay loop vivo
      if (
        !wasRunning &&
        saved?.active &&
        saved.empnit === emp &&
        saved.params &&
        saved.currentId
      ) {
        F.toast('Reanudando fraccionamiento pendiente…', 'info');
        const resumeId = Number(saved.currentId);
        // Si el documento ya no está en cola, pasar al siguiente
        const stillThere = this._rows.some((r) => Number(r.ID) === resumeId);
        if (stillThere) {
          await this.runFraccionamiento(resumeId, saved.params, {
            skipFirstWait: !(this._nextAt && this._nextAt > Date.now()),
          });
        } else if (this._fraccionQueue.length) {
          const nextId = this._fraccionQueue.shift();
          await this.runFraccionamiento(nextId, saved.params, {
            skipFirstWait: !(this._nextAt && this._nextAt > Date.now()),
          });
        } else {
          this.unlockParamsIfIdle();
        }
      }
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
    }
  },
};
