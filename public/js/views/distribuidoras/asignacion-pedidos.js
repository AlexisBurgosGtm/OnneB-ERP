/**
 * Distribuidoras → Asignación de Facturas.
 * Parámetros compartidos (embarque + fechas) arriba de las tabs.
 */
const AsignacionPedidosView = {
  _container: null,
  _rows: [],
  _truncated: false,
  _filterQuery: '',
  _fechaDesde: '',
  _fechaHasta: '',
  _codEmbarque: '',
  _embarquesOpts: [],
  _cantidad: 0,
  _importe: 0,
  _tab: 'lista',
  _loading: false,
  _existenciasRows: [],
  _existenciasSelectedCodprod: '',
  _facturasProductoRows: [],
  _facturasProductoLoading: false,
  _docsEmbarqueRows: [],
  _docsEmbarqueLoading: false,
  _felCertificandoTodas: false,
  _editFac: null,
  _editFacBusy: false,
  _editFacProducts: [],
  _editFacSearchTimer: null,
  _editFacBsModal: null,

  TABS: [
    { id: 'lista', label: 'Pendientes de Asignar' },
    { id: 'existencias', label: 'Revisión de Existencias' },
    { id: 'observaciones', label: 'Revisión de Observaciones' },
    { id: 'fel', label: 'Facturación Electrónica' },
  ],

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatQty(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return Number.isInteger(n) ? String(n) : n.toLocaleString('es-GT', { maximumFractionDigits: 3 });
  },

  formatDateDdMmYyyy(value) {
    if (value === null || value === undefined || value === '') return '—';
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    return this.escapeHtml(s);
  },

  todayIsoDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  ensureDefaultFechas() {
    const today = this.todayIsoDate();
    if (!this._fechaDesde) this._fechaDesde = today;
    if (!this._fechaHasta) this._fechaHasta = today;
  },

  requireEmbarqueSeleccionado() {
    const emb = String(this._codEmbarque || '').trim();
    if (!emb) {
      F.toast('Seleccione un embarque en Parámetros', 'warning');
      return null;
    }
    return emb;
  },

  apiUrl(params = {}) {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    this.ensureDefaultFechas();
    const qs = new URLSearchParams({
      empnit: empNit,
      from: this._fechaDesde,
      to: this._fechaHasta,
      _: String(Date.now()),
      ...params,
    });
    const q = String(this._filterQuery || '').trim();
    if (q) qs.set('q', q);
    const emb = String(this._codEmbarque || '').trim();
    if (emb) qs.set('codembarque', emb);
    return `/api/asignacion-pedidos?${qs.toString()}`;
  },

  apiPath(path, params = {}) {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const qs = new URLSearchParams({ empnit: empNit, _: String(Date.now()), ...params });
    return `/api/asignacion-pedidos${path}?${qs.toString()}`;
  },

  embarquesApiUrl() {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    this.ensureDefaultFechas();
    const qs = new URLSearchParams({
      empnit: empNit,
      finalizado: 'NO',
      from: this._fechaDesde,
      to: this._fechaHasta,
      _: String(Date.now()),
    });
    return `/api/embarques?${qs.toString()}`;
  },

  async loadEmbarquesOpts() {
    try {
      const data = await F.fetchJson(this.embarquesApiUrl(), { cache: 'no-store' });
      this._embarquesOpts = (data.rows || [])
        .map((r) => ({
          value: String(r.CODEMBARQUE || '').trim(),
          label: `${String(r.CODEMBARQUE || '').trim()}${
            r.DESEMBARQUE ? ` — ${String(r.DESEMBARQUE).trim()}` : ''
          }`,
        }))
        .filter((o) => o.value);
      if (this._codEmbarque && !this._embarquesOpts.some((o) => o.value === this._codEmbarque)) {
        // Mantener selección actual aunque salga del rango (por si se cambió fecha).
        this._embarquesOpts.unshift({
          value: this._codEmbarque,
          label: `${this._codEmbarque} (fuera de rango)`,
        });
      }
    } catch (err) {
      this._embarquesOpts = [];
      F.toast(err.message || 'No se pudieron cargar embarques', 'warning');
    }
  },

  patchCodembarqueUrl() {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    return `/api/asignacion-pedidos/codembarque?empnit=${encodeURIComponent(empNit)}`;
  },

  facApiUrl(path, extraParams = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    const params = new URLSearchParams({
      empnit: emp,
      grupo: 'mixto',
      _: String(Date.now()),
      ...extraParams,
    });
    return `/api/facturacion${segment}?${params}`;
  },

  felUudiValue(row) {
    return String(row?.FEL_UUDI ?? row?.FEL ?? '').trim();
  },

  /** Tipos SAT certificables (misma regla que Facturas Electrónicas / API FEL). */
  FEL_TIPOS_CERTIFICABLES: ['FEF', 'FEC', 'FNC'],

  tipodocOf(row) {
    return String(row?.TIPODOC || '').trim().toUpperCase();
  },

  /**
   * Pendiente de certificar FEL: sin FEL_UUDI.
   * Se muestra Certificar en todas las no certificadas; la API valida el tipodoc al certificar.
   */
  needsCertificarFel(row) {
    return !this.felUudiValue(row);
  },

  /** @deprecated alias */
  needsCertificarFef(row) {
    return this.needsCertificarFel(row);
  },

  pendientesCertificarFel() {
    return (this._docsEmbarqueRows || []).filter((r) => this.needsCertificarFel(r));
  },

  docEditable(header) {
    if (this.felUudiValue(header)) return false;
    const status = String(header?.STATUS || '').trim().toUpperCase();
    if (status !== 'O') return false;
    if (String(header?.CORTE || 'NO').trim().toUpperCase() !== 'SI') return true;
    return String(header?.TIPODOC || '').trim().toUpperCase() === 'FAC';
  },

  canEditFacRow(row) {
    return !this.felUudiValue(row);
  },

  editFacButtonHtml(row, opts = {}) {
    const coddoc = this.escapeHtml(row?.CODDOC ?? '');
    const correlativo = this.escapeHtml(row?.CORRELATIVO ?? '');
    if (!this.canEditFacRow(row)) {
      return `<button type="button" class="btn btn-sm btn-outline-secondary" disabled
        title="Documento certificado FEL: no se puede editar">Editar</button>`;
    }
    const extraClass = opts.className ? ` ${opts.className}` : '';
    return `<button type="button" class="btn btn-sm btn-outline-secondary${extraClass}" data-action="editar-fac"
      data-coddoc="${coddoc}" data-correlativo="${correlativo}"
      title="Editar productos">Editar</button>`;
  },

  lineId(ln) {
    const id = ln?.ID ?? ln?.Id ?? ln?.id;
    return id != null ? String(id) : '';
  },

  findEditLine(lineId) {
    const n = Number(lineId);
    return (this._editFac?.pedido?.lines || []).find((l) => Number(this.lineId(l)) === n) || null;
  },

  codprodsEnFactura() {
    const set = new Set();
    (this._editFac?.pedido?.lines || []).forEach((ln) => {
      const c = String(ln.CODPROD || '').trim().toUpperCase();
      if (c) set.add(c);
    });
    return set;
  },

  findRow(coddoc, correlativo) {
    const c = String(coddoc || '').trim();
    const n = String(correlativo || '').trim();
    return this._rows.find(
      (r) => String(r.CODDOC || '').trim() === c && String(r.CORRELATIVO ?? '').trim() === n
    );
  },

  async imprimir(coddoc, correlativo) {
    const row = this.findRow(coddoc, correlativo);
    if (typeof DocOpciones !== 'undefined' && DocOpciones.imprimir) {
      await DocOpciones.imprimir(coddoc, correlativo, row);
      return;
    }
    F.toast('No se pudo imprimir', 'error');
  },

  embarqueOptionsHtml() {
    const opts = [{ value: '', label: 'Todos' }, ...this._embarquesOpts];
    return opts
      .map(
        (o) =>
          `<option value="${this.escapeHtml(o.value)}"${
            String(this._codEmbarque) === String(o.value) ? ' selected' : ''
          }>${this.escapeHtml(o.label)}</option>`
      )
      .join('');
  },

  rowEmbarqueOptionsHtml(selected) {
    const sel = String(selected || '').trim();
    const known = new Set(this._embarquesOpts.map((o) => o.value));
    const parts = [
      `<option value="">— Sin asignar —</option>`,
      ...this._embarquesOpts.map(
        (o) =>
          `<option value="${this.escapeHtml(o.value)}"${sel === o.value ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
      ),
    ];
    if (sel && !known.has(sel)) {
      parts.splice(
        1,
        0,
        `<option value="${this.escapeHtml(sel)}" selected>${this.escapeHtml(sel)} (actual)</option>`
      );
    }
    return parts.join('');
  },

  renderParametrosHtml() {
    this.ensureDefaultFechas();
    return `
      <div class="card asignacion-pedidos-params-card mb-3">
        <div class="card-header py-2 px-3 fw-semibold">Parámetros</div>
        <div class="card-body py-2 px-3">
          <div class="asignacion-pedidos-params-row">
            <div class="asignacion-pedidos-filter-item asignacion-pedidos-filter-embarque">
              <label for="asig-ped-embarque" class="small text-muted mb-0">Embarque</label>
              <select class="form-select form-select-sm" id="asig-ped-embarque" aria-label="Embarque">
                ${this.embarqueOptionsHtml()}
              </select>
            </div>
            <div class="asignacion-pedidos-filter-item asignacion-pedidos-filter-print">
              <label class="small text-muted mb-0">&nbsp;</label>
              <button type="button" class="btn btn-sm btn-outline-primary text-nowrap" id="btn-asig-ped-impresion">
                <i class="fa-solid fa-print me-1"></i>Impresión de Documentos
              </button>
            </div>
            <div class="asignacion-pedidos-filter-item">
              <label for="asig-ped-fecha-desde" class="small text-muted mb-0">Fecha inicial</label>
              <input type="date" class="form-control form-control-sm" id="asig-ped-fecha-desde"
                value="${this.escapeHtml(this._fechaDesde)}" aria-label="Fecha inicial">
            </div>
            <div class="asignacion-pedidos-filter-item">
              <label for="asig-ped-fecha-hasta" class="small text-muted mb-0">Fecha final</label>
              <input type="date" class="form-control form-control-sm" id="asig-ped-fecha-hasta"
                value="${this.escapeHtml(this._fechaHasta)}" aria-label="Fecha final">
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderTableBodyHtml(rows) {
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún documento coincide con la búsqueda'
        : 'No hay facturas FAC/FEL para mostrar en el rango seleccionado';
      return `<tr><td colspan="9" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map(
        (row) => `<tr data-coddoc="${this.escapeHtml(row.CODDOC)}" data-correlativo="${this.escapeHtml(row.CORRELATIVO)}">
          <td>${this.escapeHtml(row.EMPLEADO || '—')}</td>
          <td>${this.formatDateDdMmYyyy(row.FECHA)}</td>
          <td>${this.escapeHtml(row.CODDOC)}</td>
          <td>${this.escapeHtml(row.CORRELATIVO)}</td>
          <td>${this.escapeHtml(row.CLIENTE || '—')}</td>
          <td>${this.escapeHtml(row.MUNICIPIO || '—')}</td>
          <td class="text-end">${this.formatMoney(row.TOTALPRECIO)}</td>
          <td class="asignacion-pedidos-emb-cell">
            <select class="form-select form-select-sm asig-ped-row-embarque"
              data-coddoc="${this.escapeHtml(row.CODDOC)}"
              data-correlativo="${this.escapeHtml(row.CORRELATIVO)}"
              data-prev="${this.escapeHtml(row.CODEMBARQUE || '')}"
              aria-label="Asignar embarque">
              ${this.rowEmbarqueOptionsHtml(row.CODEMBARQUE)}
            </select>
          </td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-action="imprimir"
              data-coddoc="${this.escapeHtml(row.CODDOC)}" data-correlativo="${this.escapeHtml(row.CORRELATIVO)}"
              title="Imprimir" aria-label="Imprimir">
              <i class="fa-solid fa-print"></i>
            </button>
          </td>
        </tr>`
      )
      .join('');
  },

  renderListaHtml() {
    const rows = this._rows;
    const trunc = this._truncated
      ? '<span class="text-warning ms-1">(lista limitada; ajuste fechas o buscador)</span>'
      : '';
    return `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <span class="catalogo-empresa-badge">${rows.length} documento(s) en lista${trunc}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-asig-ped-refresh">
          <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
        </button>
      </div>
      <div class="asignacion-pedidos-search-row mb-2">
        <div class="input-group input-group-sm catalogo-empresa-search" style="max-width:28rem">
          <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
          <input type="search" class="form-control" id="asig-ped-search"
            placeholder="Empleado, documento, cliente, municipio, embarque…"
            value="${this.escapeHtml(this._filterQuery)}" autocomplete="off" spellcheck="false">
          <button type="button" class="btn btn-outline-secondary" id="btn-asig-ped-search-clear"
            title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      <div class="asignacion-pedidos-totales mb-2">
        <span class="asignacion-pedidos-total-item">
          Cantidad Documentos <strong>${Number(this._cantidad) || 0}</strong>
        </span>
        <span class="asignacion-pedidos-total-importe">
          Total importe: ${this.formatMoney(this._importe)}
        </span>
      </div>
      <div class="table-responsive asignacion-pedidos-table-wrap">
        <table class="table table-sm table-hover table-striped">
          <thead>
            <tr>
              <th>Empleado / vendedor</th>
              <th>Fecha</th>
              <th>CODDOC</th>
              <th>Correlativo</th>
              <th>Cliente</th>
              <th>Municipio</th>
              <th class="text-end">Total</th>
              <th>CODEMBARQUE</th>
              <th class="text-end">Acciones</th>
            </tr>
          </thead>
          <tbody id="asig-ped-tbody">${this.renderTableBodyHtml(rows)}</tbody>
        </table>
      </div>
    `;
  },

  renderExistenciasTableBody() {
    const rows = this._existenciasRows;
    if (!rows.length) {
      return `<tr><td colspan="7" class="text-center text-muted py-4">Sin productos en el embarque seleccionado</td></tr>`;
    }
    return rows
      .map((r) => {
        const active =
          String(this._existenciasSelectedCodprod) === String(r.CODPROD) ? ' table-active' : '';
        return `<tr class="asig-ped-exist-row${active}" data-codprod="${this.escapeHtml(r.CODPROD)}" role="button" style="cursor:pointer">
          <td>${this.escapeHtml(r.CODPROD)}</td>
          <td>${this.escapeHtml(r.DESPROD || '—')}</td>
          <td class="text-end">${this.formatQty(r.UXC)}</td>
          <td class="text-end">${this.formatQty(r.CAJAS)}</td>
          <td class="text-end">${this.formatQty(r.UNIDADES)}</td>
          <td class="text-end">${this.formatQty(r.TOTALUNIDADES)}</td>
          <td class="text-end">${this.formatQty(r.EXISTENCIA)}</td>
        </tr>`;
      })
      .join('');
  },

  renderFacturasProductoBody() {
    if (!this._existenciasSelectedCodprod) {
      return `<tr><td colspan="4" class="text-center text-muted py-4">Seleccione un producto</td></tr>`;
    }
    if (this._facturasProductoLoading) {
      return `<tr><td colspan="4" class="text-center text-muted py-3"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</td></tr>`;
    }
    if (!this._facturasProductoRows.length) {
      return `<tr><td colspan="4" class="text-center text-muted py-4">Sin facturas con este producto</td></tr>`;
    }
    return this._facturasProductoRows
      .map(
        (r) => `<tr>
          <td>${this.escapeHtml(r.CODDOC)}</td>
          <td>${this.escapeHtml(r.CORRELATIVO)}</td>
          <td class="text-end">${this.formatQty(r.TOTALUNIDADES)}</td>
          <td class="text-end">${this.editFacButtonHtml(r)}</td>
        </tr>`
      )
      .join('');
  },

  renderExistenciasHtml() {
    const emb = String(this._codEmbarque || '').trim();
    if (!emb) {
      return `<div class="alert alert-info mb-0">Seleccione un embarque en Parámetros para revisar existencias.</div>`;
    }
    return `
      <div class="row g-3">
        <div class="col-12 col-lg-8">
          <div class="card h-100">
            <div class="card-header py-2 px-3 d-flex justify-content-between align-items-center">
              <span class="fw-semibold">Picking — embarque ${this.escapeHtml(emb)}</span>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-asig-ped-exist-refresh">
                <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
              </button>
            </div>
            <div class="card-body p-2">
              <div class="table-responsive asignacion-pedidos-exist-table-wrap">
                <table class="table table-sm table-hover mb-0">
                  <thead>
                    <tr>
                      <th>CODPROD</th>
                      <th>DESPROD</th>
                      <th class="text-end">UXC</th>
                      <th class="text-end">CAJAS</th>
                      <th class="text-end">UNIDADES</th>
                      <th class="text-end">Tot. embarque</th>
                      <th class="text-end">Existencia</th>
                    </tr>
                  </thead>
                  <tbody id="asig-ped-exist-tbody">${this.renderExistenciasTableBody()}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div class="col-12 col-lg-4">
          <div class="card h-100">
            <div class="card-header py-2 px-3 fw-semibold">
              Facturas con este producto
              ${
                this._existenciasSelectedCodprod
                  ? `<span class="text-muted fw-normal small ms-1">(${this.escapeHtml(this._existenciasSelectedCodprod)})</span>`
                  : ''
              }
            </div>
            <div class="card-body p-2">
              <div class="table-responsive">
                <table class="table table-sm table-hover mb-0">
                  <thead>
                    <tr>
                      <th>CODDOC</th>
                      <th>Correlativo</th>
                      <th class="text-end">Unidades</th>
                      <th class="text-end"></th>
                    </tr>
                  </thead>
                  <tbody id="asig-ped-facprod-tbody">${this.renderFacturasProductoBody()}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderDocsEmbarqueAlert() {
    return `<div class="alert alert-info mb-0">Seleccione un embarque en Parámetros para ver las facturas asociadas.</div>`;
  },

  renderObservacionesBody() {
    if (this._docsEmbarqueLoading) {
      return `<tr><td colspan="8" class="text-center text-muted py-3"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</td></tr>`;
    }
    if (!this._docsEmbarqueRows.length) {
      return `<tr><td colspan="8" class="text-center text-muted py-4">Sin facturas en el embarque seleccionado</td></tr>`;
    }
    return this._docsEmbarqueRows
      .map(
        (r) => `<tr>
          <td>${this.escapeHtml(r.VENDEDOR || '—')}</td>
          <td>${this.formatDateDdMmYyyy(r.FECHA)}</td>
          <td>${this.escapeHtml(r.CODDOC)}</td>
          <td>${this.escapeHtml(r.CORRELATIVO)}</td>
          <td>${this.escapeHtml(r.CLIENTE || '—')}</td>
          <td class="text-end">${this.formatMoney(r.TOTALPRECIO)}</td>
          <td class="small">${this.escapeHtml(r.OBSERVACIONES || '—')}</td>
          <td class="text-end text-nowrap">${this.editFacButtonHtml(r)}</td>
        </tr>`
      )
      .join('');
  },

  renderObservacionesHtml() {
    const emb = String(this._codEmbarque || '').trim();
    if (!emb) return this.renderDocsEmbarqueAlert();
    return `
      <div class="card">
        <div class="card-header py-2 px-3 d-flex justify-content-between align-items-center">
          <span class="fw-semibold">Facturas del embarque ${this.escapeHtml(emb)}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-asig-ped-obs-refresh">
            <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
          </button>
        </div>
        <div class="card-body p-2">
          <div class="table-responsive asignacion-pedidos-table-wrap">
            <table class="table table-sm table-hover mb-0">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Fecha</th>
                  <th>CODDOC</th>
                  <th>Correlativo</th>
                  <th>Cliente</th>
                  <th class="text-end">Importe</th>
                  <th>Observaciones</th>
                  <th class="text-end"></th>
                </tr>
              </thead>
              <tbody id="asig-ped-obs-tbody">${this.renderObservacionesBody()}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  renderFelBody() {
    if (this._docsEmbarqueLoading) {
      return `<tr><td colspan="11" class="text-center text-muted py-3"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</td></tr>`;
    }
    if (!this._docsEmbarqueRows.length) {
      return `<tr><td colspan="11" class="text-center text-muted py-4">Sin facturas en el embarque seleccionado</td></tr>`;
    }
    return this._docsEmbarqueRows
      .map((r) => {
        const fel = this.felUudiValue(r);
        const tipodoc = this.tipodocOf(r);
        const canCert = this.needsCertificarFel(r);
        const certBtn = canCert
          ? `<button type="button" class="btn btn-sm btn-outline-success" data-action="certificar-fef"
              data-coddoc="${this.escapeHtml(r.CODDOC)}" data-correlativo="${this.escapeHtml(r.CORRELATIVO)}"
              title="Certificar FEL">Certificar</button>`
          : `<span class="badge text-bg-success" title="Ya certificado">Certificado</span>`;
        const felLabel =
          !fel
            ? '—'
            : fel.length <= 18
              ? this.escapeHtml(fel)
              : this.escapeHtml(`${fel.slice(0, 8)}…${fel.slice(-4)}`);
        return `<tr>
          <td>${this.escapeHtml(r.VENDEDOR || '—')}</td>
          <td>${this.formatDateDdMmYyyy(r.FECHA)}</td>
          <td>${this.escapeHtml(r.CODDOC)}</td>
          <td><span class="badge text-bg-secondary">${this.escapeHtml(tipodoc || '—')}</span></td>
          <td>${this.escapeHtml(r.CORRELATIVO)}</td>
          <td>${this.escapeHtml(r.NIT || '—')}</td>
          <td>${this.escapeHtml(r.CLIENTE || '—')}</td>
          <td class="text-end">${this.formatMoney(r.TOTALPRECIO)}</td>
          <td class="small font-monospace" title="${this.escapeHtml(fel)}">${felLabel}</td>
          <td class="text-end text-nowrap">${this.editFacButtonHtml(r)}</td>
          <td class="text-end text-nowrap">${certBtn}</td>
        </tr>`;
      })
      .join('');
  },

  renderFelHtml() {
    const emb = String(this._codEmbarque || '').trim();
    if (!emb) return this.renderDocsEmbarqueAlert();
    const pendientes = this.pendientesCertificarFel().length;
    const busy = Boolean(this._felCertificandoTodas);
    return `
      <div class="card">
        <div class="card-header py-2 px-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span class="fw-semibold">Facturación electrónica — embarque ${this.escapeHtml(emb)}</span>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-asig-ped-fel-refresh"
              ${busy ? 'disabled' : ''}>
              <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
            </button>
            <button type="button" class="btn btn-sm btn-success" id="btn-asig-ped-fel-cert-todas"
              title="Certificar FEL todas las facturas pendientes (FEF/FEC/FNC sin UUID)"
              ${busy ? 'disabled' : ''}>
              ${
                busy
                  ? '<i class="fa-solid fa-spinner fa-spin me-1"></i>Certificando…'
                  : '<i class="fa-solid fa-file-circle-check me-1"></i>Certificar todas'
              }
              ${!busy && pendientes ? `<span class="badge text-bg-light text-success ms-1">${pendientes}</span>` : ''}
            </button>
          </div>
        </div>
        <div class="card-body p-2">
          <div class="table-responsive asignacion-pedidos-table-wrap">
            <table class="table table-sm table-hover mb-0">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Fecha</th>
                  <th>CODDOC</th>
                  <th>Tipo</th>
                  <th>Correlativo</th>
                  <th>NIT</th>
                  <th>Cliente</th>
                  <th class="text-end">Importe</th>
                  <th>FEL_UUDI</th>
                  <th class="text-end"></th>
                  <th class="text-end"></th>
                </tr>
              </thead>
              <tbody id="asig-ped-fel-tbody">${this.renderFelBody()}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  renderEditFacModalHtml() {
    return `
      <div class="modal fade" id="asig-ped-edit-fac-modal" tabindex="-1" aria-labelledby="asig-ped-edit-fac-title" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header py-2">
              <h5 class="modal-title" id="asig-ped-edit-fac-title">Editar productos de factura</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <div id="asig-ped-edit-fac-meta" class="small text-muted mb-3"></div>
              <div class="row g-3">
                <div class="col-12 col-lg-5">
                  <div class="card h-100 asig-ped-edit-search-card">
                    <div class="card-header py-2 px-3 fw-semibold">Buscar productos</div>
                    <div class="card-body p-2 d-flex flex-column">
                      <label class="form-label small mb-1" for="asig-ped-edit-prod-search">Agregar producto</label>
                      <input type="search" class="form-control form-control-sm" id="asig-ped-edit-prod-search"
                        placeholder="Código o descripción…" autocomplete="off" disabled>
                      <div id="asig-ped-edit-prod-results" class="asig-ped-edit-prod-results mt-2 flex-grow-1"></div>
                    </div>
                  </div>
                </div>
                <div class="col-12 col-lg-7">
                  <div class="card h-100 asig-ped-edit-lines-card">
                    <div class="card-header py-2 px-3 d-flex justify-content-between align-items-center">
                      <span class="fw-semibold">Productos de la factura</span>
                      <span class="small" id="asig-ped-edit-fac-total"></span>
                    </div>
                    <div class="card-body p-2">
                      <div class="table-responsive asig-ped-edit-lines-wrap">
                        <table class="table table-sm table-hover mb-0">
                          <thead>
                            <tr>
                              <th>Código</th>
                              <th>Producto</th>
                              <th class="text-center">Cantidad</th>
                              <th class="text-end">Importe</th>
                              <th class="text-end"></th>
                            </tr>
                          </thead>
                          <tbody id="asig-ped-edit-fac-tbody">
                            <tr><td colspan="5" class="text-center text-muted py-3">Seleccione una factura</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer py-2">
              <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  renderPlaceholder(title, note) {
    return `
      <div class="asignacion-pedidos-placeholder text-muted text-center py-5">
        <i class="fa-solid fa-layer-group fa-2x mb-3 d-block"></i>
        <p class="mb-1 fw-semibold">${this.escapeHtml(title)}</p>
        <p class="small mb-0">${this.escapeHtml(note || 'Esta sección se implementará sin salir de Asignación de pedidos.')}</p>
      </div>
    `;
  },

  renderTabBody() {
    if (this._tab === 'lista') return this.renderListaHtml();
    if (this._tab === 'existencias') return this.renderExistenciasHtml();
    if (this._tab === 'observaciones') return this.renderObservacionesHtml();
    if (this._tab === 'fel') return this.renderFelHtml();
    return this.renderPlaceholder('Asignación de pedidos');
  },

  renderShell() {
    const tabs = this.TABS.map((t) => {
      const active = this._tab === t.id;
      return `<li class="nav-item" role="presentation">
        <button type="button" class="nav-link${active ? ' active' : ''}" data-asig-tab="${t.id}"
          role="tab" aria-selected="${active ? 'true' : 'false'}">${this.escapeHtml(t.label)}</button>
      </li>`;
    }).join('');

    return `
      <div class="catalogo-empresa-panel catalogo-vista-wrap asignacion-pedidos-wrap">
        ${this.renderParametrosHtml()}
        <ul class="nav nav-tabs asignacion-pedidos-tabs px-1 mb-3" role="tablist">${tabs}</ul>
        <div class="asignacion-pedidos-tab-body px-1">${this.renderTabBody()}</div>
      </div>
    `;
  },

  applyListPayload(data) {
    this._rows = data.rows || [];
    this._truncated = Boolean(data.truncated);
    this._cantidad = Number(data.cantidad) || 0;
    this._importe = Number(data.importe) || 0;
    if (data.from) this._fechaDesde = String(data.from).slice(0, 10);
    if (data.to) this._fechaHasta = String(data.to).slice(0, 10);
  },

  updateTotalesDom() {
    const wrap = this._container?.querySelector('.asignacion-pedidos-totales');
    if (!wrap) return;
    wrap.innerHTML = `
      <span class="asignacion-pedidos-total-item">
        Cantidad Documentos <strong>${Number(this._cantidad) || 0}</strong>
      </span>
      <span class="asignacion-pedidos-total-importe">
        Total importe: ${this.formatMoney(this._importe)}
      </span>`;
    const badge = this._container?.querySelector('.catalogo-empresa-badge');
    if (badge) {
      const trunc = this._truncated
        ? '<span class="text-warning ms-1">(lista limitada; ajuste fechas o buscador)</span>'
        : '';
      badge.innerHTML = `${this._rows.length} documento(s) en lista${trunc}`;
    }
  },

  async openImpresionModal(codembarqueOverride) {
    const emb = String(codembarqueOverride || '').trim() || this.requireEmbarqueSeleccionado();
    if (!emb) return;

    await Swal.fire({
      title: 'Impresión de Documentos',
      html: `
        <p class="small text-muted mb-3">Embarque <strong>${this.escapeHtml(emb)}</strong> (sin filtro de fechas; excluye anuladas).</p>
        <div class="asig-ped-print-cards">
          <button type="button" class="asig-ped-print-card" data-print="picking">
            <i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i>
            <span>Resumen Productos</span>
            <small>Picking</small>
          </button>
          <button type="button" class="asig-ped-print-card" data-print="listado">
            <i class="fa-solid fa-list" aria-hidden="true"></i>
            <span>Listado Documentos</span>
            <small>Resumen de facturas</small>
          </button>
          <button type="button" class="asig-ped-print-card" data-print="facturas">
            <i class="fa-solid fa-file-invoice" aria-hidden="true"></i>
            <span>Imprimir Facturas</span>
            <small>Una página por factura</small>
          </button>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Cerrar',
      width: 640,
      customClass: { popup: 'asig-ped-print-swal' },
      didOpen: (popup) => {
        popup.querySelectorAll('.asig-ped-print-card').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const action = btn.getAttribute('data-print');
            Swal.close();
            try {
              if (action === 'picking') await this.printPicking(emb);
              else if (action === 'listado') await this.printListadoDocumentos(emb);
              else if (action === 'facturas') await this.printFacturasEmbarque(emb);
            } catch (err) {
              F.alert('Error', err.message || 'No se pudo imprimir', 'error');
            }
          });
        });
      },
    });
  },

  /** Agrupa documentos del embarque por vendedor: VENDEDOR, DOCUMENTOS, IMPORTE. */
  resumenPorVendedor(docRows) {
    const map = new Map();
    for (const r of docRows || []) {
      const nombre = String(r.VENDEDOR || '').trim() || 'Sin vendedor';
      const cur = map.get(nombre) || { VENDEDOR: nombre, DOCUMENTOS: 0, IMPORTE: 0 };
      cur.DOCUMENTOS += 1;
      cur.IMPORTE += Number(r.TOTALPRECIO) || 0;
      map.set(nombre, cur);
    }
    return Array.from(map.values()).sort((a, b) =>
      String(a.VENDEDOR).localeCompare(String(b.VENDEDOR), 'es')
    );
  },

  renderResumenVendedorPrintHtml(docRows) {
    const resumen = this.resumenPorVendedor(docRows);
    if (!resumen.length) return '';
    const esc = PrintReport.escapeHtml.bind(PrintReport);
    const body = resumen
      .map(
        (r) => `<tr>
          <td>${esc(r.VENDEDOR)}</td>
          <td class="text-end">${esc(String(r.DOCUMENTOS))}</td>
          <td class="text-end">${esc(this.formatMoney(r.IMPORTE))}</td>
        </tr>`
      )
      .join('');
    const totalDocs = resumen.reduce((s, r) => s + r.DOCUMENTOS, 0);
    const totalImp = resumen.reduce((s, r) => s + r.IMPORTE, 0);
    return `
      <div class="asig-ped-print-resumen-vendedor" style="margin-top:1.25rem;page-break-inside:avoid">
        <h3 style="font-size:13px;margin:0 0 .4rem 0">Resumen por vendedor</h3>
        <table>
          <thead>
            <tr>
              <th>VENDEDOR</th>
              <th class="text-end">DOCUMENTOS</th>
              <th class="text-end">IMPORTE</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot>
            <tr class="totals">
              <td><strong>Total</strong></td>
              <td class="text-end"><strong>${esc(String(totalDocs))}</strong></td>
              <td class="text-end"><strong>${esc(this.formatMoney(totalImp))}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  renderPickingDocsCountHtml(cantidad) {
    const n = Number(cantidad) || 0;
    return `
      <div class="asig-ped-print-docs-count" style="text-align:center;margin:.75rem 0 1rem 0;page-break-inside:avoid">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#555">Cantidad de documentos</div>
        <div style="font-size:42px;font-weight:800;line-height:1.1;margin-top:.15rem">${PrintReport.escapeHtml(String(n))}</div>
      </div>`;
  },

  async printPicking(codembarque) {
    if (typeof PrintReport === 'undefined') throw new Error('Módulo de impresión no disponible');
    const [data, docsData] = await Promise.all([
      F.fetchJson(this.apiPath('/picking', { codembarque }), { cache: 'no-store' }),
      F.fetchJson(this.apiPath('/documentos-embarque', { codembarque }), { cache: 'no-store' }),
    ]);
    const rows = data.rows || [];
    const docRows = docsData.rows || [];
    if (!rows.length) {
      F.toast('No hay productos para este embarque', 'warning');
      return;
    }
    await PrintReport.ensureLogo?.();
    const bodyRows = rows
      .map(
        (r) => `<tr>
          <td>${PrintReport.escapeHtml(r.CODPROD)}</td>
          <td>${PrintReport.escapeHtml(r.DESPROD)}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatQty(r.UXC))}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatQty(r.CAJAS))}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatQty(r.UNIDADES))}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(r.IMPORTE))}</td>
        </tr>`
      )
      .join('');
    const totalImp = rows.reduce((s, r) => s + Number(r.IMPORTE || 0), 0);
    await PrintReport.openAndPrint(
      PrintReport.wrapDocument({
        title: `Picking ${codembarque}`,
        bodyHtml: `
          ${PrintReport.reportHeaderHtml({
            title: 'Picking — Resumen de productos',
            subtitleHtml: `<p><strong>Embarque:</strong> ${PrintReport.escapeHtml(codembarque)}</p>`,
          })}
          ${this.renderPickingDocsCountHtml(docRows.length)}
          <table>
            <thead>
              <tr>
                <th>CODPROD</th><th>DESPROD</th><th class="text-end">UXC</th>
                <th class="text-end">CAJAS</th><th class="text-end">UNIDADES</th><th class="text-end">IMPORTE</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>
              <tr class="totals">
                <td colspan="5" class="text-end"><strong>Total</strong></td>
                <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(totalImp))}</strong></td>
              </tr>
            </tfoot>
          </table>
          ${this.renderResumenVendedorPrintHtml(docRows)}
        `,
      })
    );
  },

  async printListadoDocumentos(codembarque) {
    if (typeof PrintReport === 'undefined') throw new Error('Módulo de impresión no disponible');
    const data = await F.fetchJson(
      this.apiPath('/documentos-embarque', { codembarque }),
      { cache: 'no-store' }
    );
    const rows = data.rows || [];
    if (!rows.length) {
      F.toast('No hay documentos para este embarque', 'warning');
      return;
    }
    await PrintReport.ensureLogo?.();
    const bodyRows = rows
      .map(
        (r) => `<tr>
          <td>${PrintReport.escapeHtml(r.VENDEDOR || '—')}</td>
          <td>${PrintReport.escapeHtml(this.formatDateDdMmYyyy(r.FECHA))}</td>
          <td>${PrintReport.escapeHtml(r.CODDOC)}</td>
          <td>${PrintReport.escapeHtml(r.CORRELATIVO)}</td>
          <td>${PrintReport.escapeHtml(r.CLIENTE || '—')}</td>
          <td>${PrintReport.escapeHtml(r.DIRECCION || '—')}</td>
          <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(r.TOTALPRECIO))}
            <span style="font-size:9px;font-weight:700;margin-left:4px">${PrintReport.escapeHtml(r.CONCRE || '')}</span>
          </td>
        </tr>`
      )
      .join('');
    const totalImp = rows.reduce((s, r) => s + Number(r.TOTALPRECIO || 0), 0);
    await PrintReport.openAndPrint(
      PrintReport.wrapDocument({
        title: `Listado ${codembarque}`,
        bodyHtml: `
          ${PrintReport.reportHeaderHtml({
            title: 'Listado de documentos',
            subtitleHtml: `<p><strong>Embarque:</strong> ${PrintReport.escapeHtml(codembarque)} · <strong>Docs:</strong> ${rows.length}</p>`,
          })}
          <table>
            <thead>
              <tr>
                <th>Vendedor</th><th>Fecha</th><th>CODDOC</th><th>Correlativo</th>
                <th>Cliente</th><th>Dirección</th><th class="text-end">Total</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
            <tfoot>
              <tr class="totals">
                <td colspan="6" class="text-end"><strong>Total</strong></td>
                <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(totalImp))}</strong></td>
              </tr>
            </tfoot>
          </table>
          ${this.renderResumenVendedorPrintHtml(rows)}
        `,
      })
    );
  },

  async renderFacturaBodyHtml(row, formato, logoUrl) {
    const coddoc = String(row.CODDOC || '').trim();
    const correlativo = row.CORRELATIVO;
    const emp = F.getEmpNit();
    const params = new URLSearchParams({ empnit: emp });
    try {
      const data = await F.fetchJson(`/api/formatos-impresion/render?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coddoc,
          correlativo: Number(correlativo),
          papel: formato,
          title: String(row.DESDOC || row.TIPODOC || 'Documento').trim() || undefined,
          logoUrl: logoUrl || undefined,
        }),
      });
      if (data?.bodyHtml) {
        return { bodyHtml: data.bodyHtml, css: String(data.css || '') };
      }
    } catch (err) {
      console.warn('[AsignacionPedidos] render plantilla:', err.message || err);
    }

    if (typeof DocOpciones !== 'undefined' && DocOpciones.fetchDetalle && typeof DocPrint !== 'undefined') {
      const doc = await DocOpciones.fetchDetalle(coddoc, correlativo);
      const h = doc.header || {};
      const tipodoc = String(h.TIPODOC || row.TIPODOC || '').trim().toUpperCase();
      const title = String(row.DESDOC || h.DESDOC || tipodoc || 'Documento').trim();
      const footerNote =
        tipodoc === 'COT' ? 'Cotización — documento sin validez fiscal' : 'Documento generado por POS OnneB';
      return {
        bodyHtml: DocPrint.buildDocumentHtml(
          { title, header: h, lines: doc.lines || [], footerNote },
          formato
        ),
        css: '',
      };
    }
    throw new Error(`No se pudo renderizar ${coddoc} #${correlativo}`);
  },

  async printFacturasEmbarque(codembarque) {
    if (typeof PrintReport === 'undefined' || typeof DocPrint === 'undefined') {
      throw new Error('Módulo de impresión no disponible');
    }
    const data = await F.fetchJson(
      this.apiPath('/documentos-embarque', { codembarque }),
      { cache: 'no-store' }
    );
    const rows = data.rows || [];
    if (!rows.length) {
      F.toast('No hay facturas para este embarque', 'warning');
      return;
    }

    F.toast(`Preparando ${rows.length} factura(s)…`, 'info');
    const formato = await DocPrint.fetchFormatoImpresion();
    await PrintReport.ensureLogo();
    const logoUrl = PrintReport.getLogoDataUrl();

    const pages = [];
    const cssParts = [];
    for (const row of rows) {
      const rendered = await this.renderFacturaBodyHtml(row, formato, logoUrl);
      pages.push(rendered.bodyHtml);
      if (rendered.css) cssParts.push(rendered.css);
    }

    const bodyHtml = pages
      .map((html, idx) => {
        const breakCls = idx < pages.length - 1 ? ' asig-ped-factura-page--break' : '';
        return `<div class="asig-ped-factura-page${breakCls}">${html}</div>`;
      })
      .join('\n');

    const extraCss = `
      ${cssParts.join('\n')}
      .asig-ped-factura-page--break{page-break-after:always}
      .asig-ped-factura-page{page-break-inside:avoid}
      @media print{
        .asig-ped-factura-page--break{page-break-after:always}
      }
    `;

    await PrintReport.openAndPrint(
      DocPrint.wrapHtml({
        title: `Facturas embarque ${codembarque}`,
        bodyHtml,
        formato,
        extraCss,
      }),
      DocPrint.windowFeaturesFor(formato),
      DocPrint.printOptionsFor(formato)
    );
  },

  bindTabs() {
    this._container?.querySelectorAll('[data-asig-tab]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-asig-tab');
        if (!id || id === this._tab) return;
        this._tab = id;
        if (id === 'existencias') {
          await this.loadExistencias();
        } else if (id === 'observaciones' || id === 'fel') {
          await this.loadDocumentosEmbarque();
        }
        this._container.innerHTML = this.renderShell();
        this.bindEvents();
      });
    });
  },

  bindParametros() {
    const desde = document.getElementById('asig-ped-fecha-desde');
    const hasta = document.getElementById('asig-ped-fecha-hasta');
    const emb = document.getElementById('asig-ped-embarque');

    desde?.addEventListener('change', async () => {
      this._fechaDesde = String(desde.value || '').slice(0, 10);
      if (this._fechaHasta && this._fechaDesde > this._fechaHasta) {
        this._fechaHasta = this._fechaDesde;
      }
      await this.reloadAfterParamsChange();
    });
    hasta?.addEventListener('change', async () => {
      this._fechaHasta = String(hasta.value || '').slice(0, 10);
      if (this._fechaDesde && this._fechaHasta < this._fechaDesde) {
        this._fechaDesde = this._fechaHasta;
      }
      await this.reloadAfterParamsChange();
    });
    emb?.addEventListener('change', async () => {
      this._codEmbarque = String(emb.value || '').trim();
      this._existenciasSelectedCodprod = '';
      this._facturasProductoRows = [];
      this._docsEmbarqueRows = [];
      await this.reloadAfterParamsChange();
    });
    document
      .getElementById('btn-asig-ped-impresion')
      ?.addEventListener('click', () => this.openImpresionModal());
  },

  async reloadAfterParamsChange() {
    await this.loadEmbarquesOpts();
    if (this._tab === 'lista') await this.fetchList({ skipEmbarques: true });
    else if (this._tab === 'existencias') {
      await this.loadExistencias();
      this._container.innerHTML = this.renderShell();
      this.bindEvents();
    } else if (this._tab === 'observaciones' || this._tab === 'fel') {
      await this.loadDocumentosEmbarque();
      this._container.innerHTML = this.renderShell();
      this.bindEvents();
    } else {
      this._container.innerHTML = this.renderShell();
      this.bindEvents();
    }
  },

  bindListaFilters() {
    const search = document.getElementById('asig-ped-search');
    const clearBtn = document.getElementById('btn-asig-ped-search-clear');
    if (search) {
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._filterQuery = search.value;
          this.fetchList();
        }
      });
    }
    clearBtn?.addEventListener('click', () => {
      if (search) search.value = '';
      this._filterQuery = '';
      this.fetchList();
      search?.focus();
    });
    document.getElementById('btn-asig-ped-refresh')?.addEventListener('click', () => this.fetchList());
  },

  bindPrint() {
    this._container?.querySelector('#asig-ped-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="imprimir"]');
      if (!btn) return;
      e.preventDefault();
      try {
        await this.imprimir(btn.getAttribute('data-coddoc'), btn.getAttribute('data-correlativo'));
      } catch (err) {
        F.alert('Error', err.message || 'No se pudo imprimir', 'error');
      }
    });
  },

  async onRowEmbarqueChange(sel) {
    if (!sel || sel.disabled) return;
    const coddoc = String(sel.getAttribute('data-coddoc') || '').trim();
    const correlativo = String(sel.getAttribute('data-correlativo') || '').trim();
    const prev = String(sel.getAttribute('data-prev') || '').trim();
    const next = String(sel.value || '').trim();
    if (!coddoc || correlativo === '' || prev === next) return;

    sel.disabled = true;
    try {
      await F.fetchJson(this.patchCodembarqueUrl(), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CODDOC: coddoc, CORRELATIVO: correlativo, CODEMBARQUE: next }),
      });
      sel.setAttribute('data-prev', next);
      const row = this.findRow(coddoc, correlativo);
      if (row) row.CODEMBARQUE = next;

      const filtro = String(this._codEmbarque || '').trim();
      if (filtro && next !== filtro) {
        const idx = this._rows.findIndex(
          (r) =>
            String(r.CODDOC || '').trim() === coddoc &&
            String(r.CORRELATIVO ?? '').trim() === correlativo
        );
        if (idx >= 0) {
          const removed = this._rows.splice(idx, 1)[0];
          this._cantidad = Math.max(0, (Number(this._cantidad) || 0) - 1);
          this._importe = Math.max(0, (Number(this._importe) || 0) - Number(removed?.TOTALPRECIO || 0));
          sel.closest('tr')?.remove();
          const tbody = this._container?.querySelector('#asig-ped-tbody');
          if (tbody && !this._rows.length) {
            tbody.innerHTML =
              '<tr><td colspan="9" class="text-center text-muted py-4">No hay facturas FAC/FEL para mostrar en el rango seleccionado</td></tr>';
          }
          this.updateTotalesDom();
        }
      }
      F.toast(next ? `Asignado a ${next}` : 'Embarque quitado', 'success');
    } catch (err) {
      sel.value = prev;
      F.toast(err.message || 'No se pudo actualizar el embarque', 'error');
    } finally {
      sel.disabled = false;
    }
  },

  bindRowEmbarque() {
    const tbody = this._container?.querySelector('#asig-ped-tbody');
    if (!tbody) return;
    tbody.addEventListener('change', (e) => {
      const sel = e.target.closest('select.asig-ped-row-embarque');
      if (!sel || !tbody.contains(sel)) return;
      this.onRowEmbarqueChange(sel);
    });
  },

  async loadExistencias() {
    const emb = String(this._codEmbarque || '').trim();
    if (!emb) {
      this._existenciasRows = [];
      this._facturasProductoRows = [];
      return;
    }
    try {
      const data = await F.fetchJson(
        this.apiPath('/picking', { codembarque: emb, existencia: '1' }),
        { cache: 'no-store' }
      );
      this._existenciasRows = data.rows || [];
    } catch (err) {
      this._existenciasRows = [];
      F.toast(err.message || 'No se pudo cargar el picking', 'error');
    }
  },

  async loadFacturasProducto(codprod) {
    const emb = String(this._codEmbarque || '').trim();
    this._existenciasSelectedCodprod = String(codprod || '').trim();
    this._facturasProductoRows = [];
    if (!emb || !this._existenciasSelectedCodprod) return;
    this._facturasProductoLoading = true;
    const tbody = this._container?.querySelector('#asig-ped-facprod-tbody');
    if (tbody) tbody.innerHTML = this.renderFacturasProductoBody();
    try {
      const data = await F.fetchJson(
        this.apiPath('/facturas-producto', {
          codembarque: emb,
          codprod: this._existenciasSelectedCodprod,
        }),
        { cache: 'no-store' }
      );
      this._facturasProductoRows = data.rows || [];
    } catch (err) {
      this._facturasProductoRows = [];
      F.toast(err.message || 'No se pudieron cargar facturas', 'error');
    } finally {
      this._facturasProductoLoading = false;
      const tbodyExist = this._container?.querySelector('#asig-ped-exist-tbody');
      if (tbodyExist) tbodyExist.innerHTML = this.renderExistenciasTableBody();
      const tbodyFac = this._container?.querySelector('#asig-ped-facprod-tbody');
      if (tbodyFac) tbodyFac.innerHTML = this.renderFacturasProductoBody();
      this.bindExistenciasEvents();
    }
  },

  async loadDocumentosEmbarque() {
    const emb = String(this._codEmbarque || '').trim();
    if (!emb) {
      this._docsEmbarqueRows = [];
      return;
    }
    this._docsEmbarqueLoading = true;
    try {
      const data = await F.fetchJson(this.apiPath('/documentos-embarque', { codembarque: emb }), {
        cache: 'no-store',
      });
      this._docsEmbarqueRows = data.rows || [];
    } catch (err) {
      this._docsEmbarqueRows = [];
      F.toast(err.message || 'No se pudieron cargar facturas del embarque', 'error');
    } finally {
      this._docsEmbarqueLoading = false;
    }
  },

  bindExistenciasEvents() {
    document
      .getElementById('btn-asig-ped-exist-refresh')
      ?.addEventListener('click', async () => {
        await this.loadExistencias();
        this._container.innerHTML = this.renderShell();
        this.bindEvents();
      });

    this._container?.querySelector('#asig-ped-exist-tbody')?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.asig-ped-exist-row');
      if (!tr) return;
      const codprod = tr.getAttribute('data-codprod');
      if (codprod) this.loadFacturasProducto(codprod);
    });

    this._container?.querySelector('#asig-ped-facprod-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="editar-fac"]');
      if (!btn) return;
      e.preventDefault();
      this.openEditFacModal(btn.getAttribute('data-coddoc'), btn.getAttribute('data-correlativo'));
    });
  },

  bindObservacionesEvents() {
    document.getElementById('btn-asig-ped-obs-refresh')?.addEventListener('click', async () => {
      await this.loadDocumentosEmbarque();
      const tbody = this._container?.querySelector('#asig-ped-obs-tbody');
      if (tbody) tbody.innerHTML = this.renderObservacionesBody();
    });
    this._container?.querySelector('#asig-ped-obs-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="editar-fac"]');
      if (!btn) return;
      e.preventDefault();
      this.openEditFacModal(btn.getAttribute('data-coddoc'), btn.getAttribute('data-correlativo'));
    });
  },

  bindFelEvents() {
    document.getElementById('btn-asig-ped-fel-refresh')?.addEventListener('click', async () => {
      if (this._felCertificandoTodas) return;
      await this.loadDocumentosEmbarque();
      this.refreshFelTabDom();
    });
    document
      .getElementById('btn-asig-ped-fel-cert-todas')
      ?.addEventListener('click', () => this.certificarTodasFef());
    this._container?.querySelector('#asig-ped-fel-tbody')?.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-action="editar-fac"]');
      if (editBtn) {
        e.preventDefault();
        this.openEditFacModal(editBtn.getAttribute('data-coddoc'), editBtn.getAttribute('data-correlativo'));
        return;
      }
      const certBtn = e.target.closest('[data-action="certificar-fef"]');
      if (!certBtn) return;
      e.preventDefault();
      if (this._felCertificandoTodas) {
        F.toast('Espere a que termine Certificar todas', 'warning');
        return;
      }
      await this.certificarFef(
        certBtn.getAttribute('data-coddoc'),
        certBtn.getAttribute('data-correlativo'),
        certBtn
      );
    });
  },

  refreshFelTabDom() {
    if (this._tab !== 'fel' || !this._container) return;
    this._container.innerHTML = this.renderShell();
    this.bindEvents();
  },

  async certificarFefApi(coddoc, correlativo) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const url = `/api/fel/certificar/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}?empnit=${encodeURIComponent(emp)}`;
    return F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  },

  async certificarFef(coddoc, correlativo, btn) {
    const c = String(coddoc || '').trim();
    const n = String(correlativo || '').trim();
    if (!c || n === '') return;
    const row = this._docsEmbarqueRows.find(
      (r) => String(r.CODDOC || '').trim() === c && String(r.CORRELATIVO ?? '').trim() === n
    );
    if (row && this.felUudiValue(row)) {
      F.toast('El documento ya está certificado', 'warning');
      return;
    }
    if (btn) btn.disabled = true;
    try {
      if (typeof DocOpciones === 'undefined' || !DocOpciones.certificarYMostrarFormatos) {
        throw new Error('Módulo FEL no disponible');
      }
      await DocOpciones.certificarYMostrarFormatos(c, n, {
        onImprimirSistema: async () => {
          if (typeof DocOpciones.imprimir === 'function') {
            await DocOpciones.imprimir(c, n, row || null);
          }
        },
      });
      await this.loadDocumentosEmbarque();
      this.refreshFelTabDom();
    } catch (err) {
      F.alert('Error FEL', err.message || 'No se pudo certificar', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async certificarTodasFef() {
    if (this._felCertificandoTodas) return;
    const pendientes = this.pendientesCertificarFel();
    if (!pendientes.length) {
      F.toast('No hay facturas pendientes de certificar en este embarque', 'info');
      return;
    }

    const confirm = await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: 'Certificar todas',
      html: `<p class="mb-0 text-start">Se intentará certificar <strong>${pendientes.length}</strong> factura(s) sin FEL_UUDI, una por una.</p>
        <p class="small text-muted text-start mb-0 mt-2">Las ya certificadas se omiten. Si alguna no es certificable (p. ej. FAC), se reportará al final.</p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, certificar',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm.isConfirmed) return;

    this._felCertificandoTodas = true;
    this.refreshFelTabDom();

    let okCount = 0;
    const errors = [];
    const total = pendientes.length;

    Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: 'Certificando FEL…',
      html: `<p class="mb-1" id="asig-ped-fel-cert-progress">0 / ${total}</p>
        <p class="small text-muted mb-0" id="asig-ped-fel-cert-current">Iniciando…</p>`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
      for (let i = 0; i < pendientes.length; i += 1) {
        const row = pendientes[i];
        const label = `${row.CODDOC} #${row.CORRELATIVO}`;
        const progressEl = document.getElementById('asig-ped-fel-cert-progress');
        const currentEl = document.getElementById('asig-ped-fel-cert-current');
        if (progressEl) progressEl.textContent = `${i + 1} / ${total}`;
        if (currentEl) currentEl.textContent = `Certificando ${label}…`;

        try {
          await this.certificarFefApi(row.CODDOC, row.CORRELATIVO);
          okCount += 1;
        } catch (err) {
          errors.push(`${label}: ${err.message || 'Error'}`);
        }
      }
    } finally {
      this._felCertificandoTodas = false;
      try {
        Swal.close();
      } catch (_) {
        /* ignore */
      }
      await this.loadDocumentosEmbarque();
      this.refreshFelTabDom();
    }

    if (errors.length && okCount) {
      F.alert(
        'Certificación parcial',
        `Certificadas: ${okCount}. Fallidas: ${errors.length}.\n\n${errors.slice(0, 8).join('\n')}${
          errors.length > 8 ? `\n… (+${errors.length - 8})` : ''
        }`,
        'warning'
      );
    } else if (errors.length) {
      F.alert(
        'Error FEL',
        `No se pudo certificar ninguna.\n\n${errors.slice(0, 8).join('\n')}${
          errors.length > 8 ? `\n… (+${errors.length - 8})` : ''
        }`,
        'error'
      );
    } else {
      F.toast(`Certificadas ${okCount} factura(s)`, 'success');
    }
  },

  async openEditFacModal(coddoc, correlativo) {
    const c = String(coddoc || '').trim();
    const n = String(correlativo || '').trim();
    if (!c || n === '') return;

    const known =
      this._docsEmbarqueRows.find(
        (r) => String(r.CODDOC || '').trim() === c && String(r.CORRELATIVO ?? '').trim() === n
      ) ||
      this._facturasProductoRows.find(
        (r) => String(r.CODDOC || '').trim() === c && String(r.CORRELATIVO ?? '').trim() === n
      );
    if (known && !this.canEditFacRow(known)) {
      F.toast('Documento certificado FEL: no se puede editar', 'warning');
      return;
    }

    this._editFac = { coddoc: c, correlativo: n, pedido: null };
    this._editFacProducts = [];
    this.ensureEditFacModal();
    this.renderEditFacLoading();
    this._editFacBsModal?.show();

    try {
      const pedido = await F.fetchJson(
        this.facApiUrl(`/pedidos/${encodeURIComponent(c)}/${encodeURIComponent(n)}`),
        { cache: 'no-store' }
      );
      if (!this._editFac || this._editFac.coddoc !== c || String(this._editFac.correlativo) !== n) {
        return;
      }
      if (this.felUudiValue(pedido?.header)) {
        this.hideEditFacModal();
        F.toast('Documento certificado FEL: no se puede editar', 'warning');
        return;
      }
      this._editFac.pedido = pedido;
      this.renderEditFacModalContent();
    } catch (err) {
      this.hideEditFacModal();
      F.alert('Error', err.message || 'No se pudo cargar la factura', 'error');
    }
  },

  /** Modal en document.body: evita backdrop/z-index rotos por transform/overflow del main-content. */
  ensureEditFacModal() {
    let el = document.getElementById('asig-ped-edit-fac-modal');
    if (el && !el.querySelector('.asig-ped-edit-search-card')) {
      this.destroyEditFacModal();
      el = null;
    }
    if (!el) {
      const wrap = document.createElement('div');
      wrap.innerHTML = this.renderEditFacModalHtml().trim();
      el = wrap.firstElementChild;
      document.body.appendChild(el);
    }
    if (typeof bootstrap === 'undefined' || !bootstrap.Modal) return;
    this._editFacBsModal = bootstrap.Modal.getOrCreateInstance(el, {
      backdrop: true,
      keyboard: true,
      focus: true,
    });
    if (el.dataset.asigHiddenBound !== '1') {
      el.dataset.asigHiddenBound = '1';
      el.addEventListener('hidden.bs.modal', () => {
        this.cleanupEditFacBackdrop();
        this.onEditFacModalClosed();
      });
    }
    this.bindEditFacModalEvents();
  },

  hideEditFacModal() {
    try {
      this._editFacBsModal?.hide();
    } catch (_) {
      /* ignore */
    }
    this.cleanupEditFacBackdrop();
  },

  cleanupEditFacBackdrop() {
    document.querySelectorAll('.modal-backdrop').forEach((node) => node.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
  },

  destroyEditFacModal() {
    const el = document.getElementById('asig-ped-edit-fac-modal');
    try {
      const instance = this._editFacBsModal || (el && bootstrap?.Modal?.getInstance(el));
      instance?.dispose();
    } catch (_) {
      /* ignore */
    }
    this._editFacBsModal = null;
    el?.remove();
    this.cleanupEditFacBackdrop();
  },

  async onEditFacModalClosed() {
    this._editFac = null;
    this._editFacProducts = [];
    if (this._editFacSearchTimer) {
      clearTimeout(this._editFacSearchTimer);
      this._editFacSearchTimer = null;
    }
    this.cleanupEditFacBackdrop();
    try {
      if (this._tab === 'existencias') {
        const selected = this._existenciasSelectedCodprod;
        await this.loadExistencias();
        this._container.innerHTML = this.renderShell();
        this.bindEvents();
        if (selected) await this.loadFacturasProducto(selected);
      } else if (this._tab === 'observaciones' || this._tab === 'fel') {
        await this.loadDocumentosEmbarque();
        this._container.innerHTML = this.renderShell();
        this.bindEvents();
      }
    } catch (_) {
      /* ignore refresh errors on close */
    }
  },

  renderEditFacLoading() {
    const title = document.getElementById('asig-ped-edit-fac-title');
    const meta = document.getElementById('asig-ped-edit-fac-meta');
    const tbody = document.getElementById('asig-ped-edit-fac-tbody');
    const search = document.getElementById('asig-ped-edit-prod-search');
    const results = document.getElementById('asig-ped-edit-prod-results');
    const total = document.getElementById('asig-ped-edit-fac-total');
    if (title && this._editFac) {
      title.textContent = `Editar productos — ${this._editFac.coddoc} #${this._editFac.correlativo}`;
    }
    if (meta) meta.textContent = 'Cargando documento…';
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted py-3"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</td></tr>';
    }
    if (search) {
      search.value = '';
      search.disabled = true;
    }
    if (results) results.innerHTML = '';
    if (total) total.textContent = '';
  },

  renderEditFacModalContent() {
    const pedido = this._editFac?.pedido;
    const h = pedido?.header;
    const meta = document.getElementById('asig-ped-edit-fac-meta');
    const search = document.getElementById('asig-ped-edit-prod-search');
    const total = document.getElementById('asig-ped-edit-fac-total');
    const editable = this.docEditable(h);

    if (meta && h) {
      const tip = String(h.TIPODOC || '').trim();
      meta.innerHTML = `
        Cliente: <strong>${this.escapeHtml(h.DOC_NOMCLIE || '—')}</strong>
        · NIT: ${this.escapeHtml(h.DOC_NIT || '—')}
        · Tipo: ${this.escapeHtml(tip || '—')}
        · Estado: ${this.escapeHtml(h.STATUS || '—')}
        ${
          editable
            ? ''
            : this.felUudiValue(h)
              ? '<span class="text-danger ms-2">Certificado FEL: no se puede editar</span>'
              : '<span class="text-danger ms-2">Documento no editable (solo lectura)</span>'
        }`;
    }
    if (total && h) total.textContent = `Total: ${this.formatMoney(h.TOTALPRECIO)}`;
    if (search) search.disabled = !editable;
    this.renderEditFacLines();
    this.renderEditFacProductResults();
  },

  renderEditFacLines() {
    const tbody = document.getElementById('asig-ped-edit-fac-tbody');
    if (!tbody) return;
    const lines = this._editFac?.pedido?.lines || [];
    const editable = this.docEditable(this._editFac?.pedido?.header);
    const busy = this._editFacBusy;
    if (!lines.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted py-3">Sin productos en la factura</td></tr>';
      return;
    }
    tbody.innerHTML = lines
      .map((ln) => {
        const id = this.lineId(ln);
        const qty = Number(ln.CANTIDAD) || 0;
        const qtyHtml = editable
          ? `<div class="d-inline-flex align-items-center gap-1">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-action="qty-minus" data-id="${this.escapeHtml(id)}"${busy ? ' disabled' : ''}>−</button>
              <input type="number" class="form-control form-control-sm text-center asig-ped-edit-qty" style="width:4.5rem"
                data-id="${this.escapeHtml(id)}" value="${qty}" min="0.001" step="any"${busy ? ' disabled' : ''}>
              <button type="button" class="btn btn-outline-secondary btn-sm" data-action="qty-plus" data-id="${this.escapeHtml(id)}"${busy ? ' disabled' : ''}>+</button>
            </div>`
          : `<span>${this.formatQty(qty)}</span>`;
        const delBtn = editable
          ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="line-del" data-id="${this.escapeHtml(id)}" title="Quitar línea"${busy ? ' disabled' : ''}><i class="fa-solid fa-trash"></i></button>`
          : '';
        return `<tr>
          <td class="small">${this.escapeHtml(ln.CODPROD)}</td>
          <td class="small">${this.escapeHtml(ln.DESPROD)}<br><span class="text-muted">${this.escapeHtml(ln.CODMEDIDA || '')}</span></td>
          <td class="text-center">${qtyHtml}</td>
          <td class="text-end">${this.formatMoney(ln.TOTALPRECIO)}</td>
          <td class="text-end">${delBtn}</td>
        </tr>`;
      })
      .join('');
  },

  renderEditFacProductResults() {
    const wrap = document.getElementById('asig-ped-edit-prod-results');
    if (!wrap) return;
    const editable = this.docEditable(this._editFac?.pedido?.header);
    if (!editable) {
      wrap.innerHTML = '';
      return;
    }
    const existing = this.codprodsEnFactura();
    const rows = (this._editFacProducts || []).filter(
      (p) => !existing.has(String(p.CODPROD || '').trim().toUpperCase())
    );
    if (!this._editFacProducts.length) {
      wrap.innerHTML = '';
      return;
    }
    if (!rows.length) {
      wrap.innerHTML =
        '<p class="small text-muted mb-0">Los resultados ya están en la factura o no hay coincidencias nuevas.</p>';
      return;
    }
    wrap.innerHTML = `
      <div class="list-group list-group-flush asig-ped-edit-prod-list">
        ${rows
          .map(
            (p) => `<button type="button" class="list-group-item list-group-item-action py-2 px-2"
              data-action="add-prod"
              data-codprod="${this.escapeHtml(p.CODPROD)}"
              data-codmedida="${this.escapeHtml(p.CODMEDIDA)}">
              <div class="fw-semibold small">${this.escapeHtml(p.CODPROD)} · ${this.escapeHtml(p.CODMEDIDA || '')}</div>
              <div class="small text-muted">${this.escapeHtml(p.DESPROD || '')}</div>
              <div class="small">Precio: ${this.formatMoney(p.PRECIO)}</div>
            </button>`
          )
          .join('')}
      </div>`;
  },

  bindEditFacModalEvents() {
    const modal = document.getElementById('asig-ped-edit-fac-modal');
    if (!modal || modal.dataset.asigEditBound === '1') return;
    modal.dataset.asigEditBound = '1';

    const search = document.getElementById('asig-ped-edit-prod-search');
    const results = document.getElementById('asig-ped-edit-prod-results');
    const tbody = document.getElementById('asig-ped-edit-fac-tbody');

    search?.addEventListener('input', () => {
      if (this._editFacSearchTimer) clearTimeout(this._editFacSearchTimer);
      this._editFacSearchTimer = setTimeout(() => {
        this.buscarProductosEditFac(search.value).catch((err) =>
          F.toast(err.message || 'Error al buscar', 'error')
        );
      }, 280);
    });

    results?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="add-prod"]');
      if (!btn) return;
      e.preventDefault();
      await this.agregarLineaEditFac(
        btn.getAttribute('data-codprod'),
        btn.getAttribute('data-codmedida')
      );
    });

    tbody?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || !tbody.contains(btn)) return;
      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');
      if (action === 'qty-minus' || action === 'qty-plus') {
        const line = this.findEditLine(id);
        if (!line) return;
        const cur = Number(line.CANTIDAD) || 0;
        const next = action === 'qty-plus' ? cur + 1 : cur - 1;
        if (next <= 0) {
          await this.eliminarLineaEditFac(id);
          return;
        }
        await this.actualizarCantidadEditFac(id, next);
      } else if (action === 'line-del') {
        await this.eliminarLineaEditFac(id);
      }
    });

    tbody?.addEventListener('change', async (e) => {
      const inp = e.target.closest('input.asig-ped-edit-qty');
      if (!inp || !tbody.contains(inp)) return;
      const id = inp.getAttribute('data-id');
      const qty = Number(inp.value);
      if (!Number.isFinite(qty) || qty <= 0) {
        F.toast('Cantidad inválida', 'warning');
        this.renderEditFacLines();
        return;
      }
      await this.actualizarCantidadEditFac(id, qty);
    });
  },

  bindEvents() {
    this.bindTabs();
    this.bindParametros();
    this.bindEditFacModalEvents();
    if (this._tab === 'lista') {
      this.bindListaFilters();
      this.bindPrint();
      this.bindRowEmbarque();
    } else if (this._tab === 'existencias') {
      this.bindExistenciasEvents();
    } else if (this._tab === 'observaciones') {
      this.bindObservacionesEvents();
    } else if (this._tab === 'fel') {
      this.bindFelEvents();
    }
  },

  async buscarProductosEditFac(q) {
    const term = String(q || '').trim();
    if (!term) {
      this._editFacProducts = [];
      this.renderEditFacProductResults();
      return;
    }
    const data = await F.fetchJson(this.facApiUrl('/productos', { q: term, limit: '40' }), {
      cache: 'no-store',
    });
    this._editFacProducts = data.rows || data.productos || [];
    this.renderEditFacProductResults();
  },

  setEditFacBusy(busy) {
    this._editFacBusy = Boolean(busy);
    this.renderEditFacLines();
    const search = document.getElementById('asig-ped-edit-prod-search');
    if (search) search.disabled = busy || !this.docEditable(this._editFac?.pedido?.header);
  },

  async agregarLineaEditFac(codprod, codmedida) {
    const key = this._editFac;
    if (!key?.coddoc) return;
    if (!this.docEditable(key.pedido?.header)) {
      F.toast('El documento no está en edición', 'warning');
      return;
    }
    const code = String(codprod || '').trim().toUpperCase();
    if (this.codprodsEnFactura().has(code)) {
      F.toast('El producto ya está en la factura', 'warning');
      return;
    }
    this.setEditFacBusy(true);
    try {
      const res = await F.fetchJson(
        this.facApiUrl(
          `/pedidos/${encodeURIComponent(key.coddoc)}/${encodeURIComponent(key.correlativo)}/lineas`
        ),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            CODPROD: codprod,
            CODMEDIDA: codmedida,
            CANTIDAD: 1,
          }),
        }
      );
      this._editFac.pedido = res.pedido;
      this._editFacProducts = [];
      const search = document.getElementById('asig-ped-edit-prod-search');
      if (search) search.value = '';
      this.renderEditFacModalContent();
      F.toast('Producto agregado', 'success');
    } catch (err) {
      F.toast(err.message || 'No se pudo agregar', 'error');
    } finally {
      this.setEditFacBusy(false);
    }
  },

  async actualizarCantidadEditFac(lineId, cantidad) {
    const key = this._editFac;
    if (!key?.coddoc) return;
    this.setEditFacBusy(true);
    try {
      const res = await F.fetchJson(
        this.facApiUrl(
          `/pedidos/${encodeURIComponent(key.coddoc)}/${encodeURIComponent(key.correlativo)}/lineas/${encodeURIComponent(lineId)}`
        ),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ CANTIDAD: cantidad }),
        }
      );
      this._editFac.pedido = res.pedido;
      this.renderEditFacModalContent();
    } catch (err) {
      F.toast(err.message || 'No se pudo actualizar la cantidad', 'error');
      this.renderEditFacLines();
    } finally {
      this.setEditFacBusy(false);
    }
  },

  async eliminarLineaEditFac(lineId) {
    const key = this._editFac;
    if (!key?.coddoc) return;
    const ok = await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: 'Quitar producto',
      text: '¿Eliminar esta línea de la factura?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Quitar',
      cancelButtonText: 'Cancelar',
    });
    if (!ok.isConfirmed) return;
    this.setEditFacBusy(true);
    try {
      const res = await F.fetchJson(
        this.facApiUrl(
          `/pedidos/${encodeURIComponent(key.coddoc)}/${encodeURIComponent(key.correlativo)}/lineas/${encodeURIComponent(lineId)}`
        ),
        { method: 'DELETE' }
      );
      this._editFac.pedido = res.pedido;
      this.renderEditFacModalContent();
      F.toast('Línea eliminada', 'success');
    } catch (err) {
      F.toast(err.message || 'No se pudo eliminar la línea', 'error');
    } finally {
      this.setEditFacBusy(false);
    }
  },

  async fetchList(opts = {}) {
    if (this._tab !== 'lista' || !this._container) return;
    if (this._loading) return;
    this._loading = true;
    const tbody = this._container.querySelector('#asig-ped-tbody');
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="text-center text-muted py-3"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</td></tr>';
    }
    try {
      if (!opts.skipEmbarques) await this.loadEmbarquesOpts();
      const data = await F.fetchJson(this.apiUrl(), { cache: 'no-store' });
      this.applyListPayload(data);
      this._container.innerHTML = this.renderShell();
      this.bindEvents();
    } catch (err) {
      F.toast(err.message || 'Error al cargar facturas', 'error');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-3">${this.escapeHtml(err.message)}</td></tr>`;
      }
    } finally {
      this._loading = false;
    }
  },

  async load(container) {
    const navToken =
      typeof F !== 'undefined' && typeof F.getMenuNavToken === 'function' ? F.getMenuNavToken() : 0;
    this._container = container;
    this._felCertificandoTodas = false;
    this.destroyEditFacModal();
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');

    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100" role="alert">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese seleccionando una empresa.
        </div>`;
      return;
    }

    this._tab = 'lista';
    this._fechaDesde = this.todayIsoDate();
    this._fechaHasta = this.todayIsoDate();
    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando facturas…
      </div>`;

    try {
      await this.loadEmbarquesOpts();
      const data = await F.fetchJson(this.apiUrl(), { cache: 'no-store' });
      if (typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) {
        return;
      }
      this.applyListPayload(data);
      container.innerHTML = this.renderShell();
      this.bindEvents();
    } catch (err) {
      if (typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) {
        return;
      }
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          No se pudo cargar: ${this.escapeHtml(err.message)}
        </div>`;
      F.toast('Error al cargar asignación de pedidos', 'error');
    }
  },
};
