/**
 * Vista Cuentas por cobrar — facturas al crédito con saldo pendiente.
 */
const CuentasPorCobrarView = {
  _container: null,
  _rows: [],
  _total: 0,
  _sumSaldo: 0,
  _sumTotal: 0,
  _truncated: false,
  _filterQuery: '',
  _vistaTipo: 'lista',
  _calYear: null,
  _calMonth: null,
  _saldoMes: null,
  _saldoAnio: null,
  _saldoMesesRows: [],
  _saldoMesesTotales: null,
  _consolidadoRows: [],
  _consolidadoTotales: null,
  _loading: false,
  _guardandoRecibo: false,
  _corregiendoSaldos: false,

  MENU_OPCIONES: [
    { action: 'nuevo-abono', label: 'NUEVO ABONO', icon: 'fa-solid fa-money-bill-transfer', className: 'btn-success text-white' },
    { action: 'historial', label: 'HISTORIAL', icon: 'fa-solid fa-clock-rotate-left', className: 'btn-outline-primary' },
    { action: 'estado-cuenta', label: 'ESTADO CUENTA', icon: 'fa-solid fa-file-invoice', className: 'btn-outline-secondary' },
    { action: 'reimprimir', label: 'REIMPRIMIR', icon: 'fa-solid fa-print', className: 'btn-outline-secondary' },
    { action: 'whatsapp', label: 'WHATSAPP', icon: 'fa-brands fa-whatsapp', className: 'btn-outline-success' },
  ],

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiUrl(extraParams = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const params = new URLSearchParams({ empnit: emp, limit: '500', ...extraParams });
    return `/api/cuentas-cobrar/documentos?${params}`;
  },

  facturaUrl(coddoc, correlativo) {
    const emp = F.getEmpNit();
    return `/api/cuentas-cobrar/facturas/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}?empnit=${encodeURIComponent(emp)}`;
  },

  abonosUrl(coddoc, correlativo) {
    const emp = F.getEmpNit();
    return `/api/cuentas-cobrar/facturas/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/abonos?empnit=${encodeURIComponent(emp)}`;
  },

  async fetchRccTipos() {
    const emp = F.getEmpNit();
    return F.fetchJson(`/api/cuentas-cobrar/rcc/tipos?empnit=${encodeURIComponent(emp)}&_=${Date.now()}`, {
      cache: 'no-store',
    });
  },

  async fetchSiguienteRcc(coddoc) {
    const emp = F.getEmpNit();
    const params = new URLSearchParams({ empnit: emp, _: String(Date.now()) });
    if (coddoc) params.set('coddoc', coddoc);
    return F.fetchJson(`/api/cuentas-cobrar/rcc/siguiente?${params}`, { cache: 'no-store' });
  },

  async fetchCajasAbiertas() {
    const emp = F.getEmpNit();
    const codempleado = F.sessionCodEmpleado();
    const params = new URLSearchParams({ empnit: emp, _: String(Date.now()) });
    if (codempleado != null) params.set('codempleado', String(codempleado));
    return F.fetchJson(`/api/cuentas-cobrar/cajas-abiertas?${params}`, {
      cache: 'no-store',
    });
  },

  renderCajasAbiertasSelectHtml(cajas, cajaDefault = null) {
    if (!cajas?.length) {
      return '<p class="small text-danger mb-0">No hay cajas abiertas</p>';
    }
    const preferred = F.pickCajaDefault(cajas, cajaDefault);
    const options = cajas
      .map((c) => {
        const id = c.CODCAJA;
        const label = c.DESCAJA ? `${c.DESCAJA} (${id})` : `Caja ${id}`;
        const sel = String(id) === String(preferred) ? ' selected' : '';
        return `<option value="${this.escapeHtml(id)}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
    return `<select id="cxp-abono-caja" class="form-select form-select-sm">${options}</select>`;
  },

  renderRccCoddocSelectHtml(tipos, selectedCoddoc) {
    if (!tipos?.length) {
      return '<p class="small text-danger mb-0">No hay documentos RCC activos</p>';
    }
    const options = tipos
      .map((t) => {
        const cod = t.CODDOC;
        const label = t.DESDOC ? `${cod} — ${t.DESDOC}` : cod;
        const sel = String(cod) === String(selectedCoddoc) ? ' selected' : '';
        return `<option value="${this.escapeHtml(cod)}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
    return `
      <select id="cxp-abono-coddoc" class="form-select form-select-sm fw-semibold">
        ${options}
      </select>`;
  },

  async wireCoddocRccChange() {
    const select = document.getElementById('cxp-abono-coddoc');
    const corrInp = document.getElementById('cxp-abono-correlativo');
    if (!select || !corrInp) return;

    const loadCorrelativo = async (coddoc) => {
      corrInp.value = '…';
      corrInp.disabled = true;
      try {
        const data = await this.fetchSiguienteRcc(coddoc);
        corrInp.value = String(data.rcc?.CORRELATIVO ?? '');
      } catch (err) {
        corrInp.value = '';
        F.toast(err.message || 'No se pudo cargar el correlativo', 'error');
      } finally {
        corrInp.disabled = false;
      }
    };

    select.addEventListener('change', () => {
      loadCorrelativo(select.value).catch(() => {});
    });
  },

  usuario() {
    const u = F.session('user');
    return u?.username || u?.usuario || 'CXC';
  },

  todayIsoDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatQty(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '0';
    return n.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).slice(0, 10);
    const [y, m, d] = s.split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
    return s;
  },

  fpagoInputValue(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return '0';
    return String(Math.round(n * 100) / 100);
  },

  docLabel(row) {
    return `${row?.CODDOC || ''} #${row?.CORRELATIVO ?? ''}`;
  },

  isVencido(row) {
    const v = String(row?.VENCIMIENTO || '').slice(0, 10);
    if (!v) return false;
    const today = new Date();
    const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return v < t;
  },

  initCalMonth() {
    const d = new Date();
    if (this._calYear == null) {
      this._calYear = d.getFullYear();
      this._calMonth = d.getMonth();
    }
  },

  initSaldoMes() {
    const d = new Date();
    if (this._saldoAnio == null) this._saldoAnio = d.getFullYear();
    if (this._saldoMes == null) this._saldoMes = d.getMonth() + 1;
  },

  monthNames() {
    return [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
  },

  monthLabel(year, monthIndex) {
    return `${this.monthNames()[monthIndex]} ${year}`;
  },

  vencimientoIso(row) {
    const v = row?.VENCIMIENTO;
    if (!v) return null;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  },

  aggregateVencimientosPorDia() {
    const map = new Map();
    for (const r of this.filteredRows()) {
      const key = this.vencimientoIso(r);
      if (!key) continue;
      const entry = map.get(key) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += Number(r.DOC_SALDO) || 0;
      map.set(key, entry);
    }
    return map;
  },

  rowsForVencimiento(isoDate) {
    return this.filteredRows().filter((r) => this.vencimientoIso(r) === isoDate);
  },

  saldoMesesUrl(mes, anio) {
    const emp = F.getEmpNit();
    const params = new URLSearchParams({
      empnit: emp,
      mes: String(mes),
      anio: String(anio),
      _: String(Date.now()),
    });
    return `/api/cuentas-cobrar/saldo-meses?${params}`;
  },

  async fetchSaldoMeses() {
    this.initSaldoMes();
    const data = await F.fetchJson(this.saldoMesesUrl(this._saldoMes, this._saldoAnio), {
      cache: 'no-store',
    });
    this._saldoMesesRows = data.rows || [];
    this._saldoMesesTotales = data.totales || null;
    this._saldoMes = Number(data.mes) || this._saldoMes;
    this._saldoAnio = Number(data.anio) || this._saldoAnio;
    return this._saldoMesesRows;
  },

  consolidadoProductosUrl() {
    const emp = F.getEmpNit();
    const params = new URLSearchParams({
      empnit: emp,
      _: String(Date.now()),
    });
    return `/api/cuentas-cobrar/consolidado-productos?${params}`;
  },

  async fetchConsolidadoProductos() {
    const data = await F.fetchJson(this.consolidadoProductosUrl(), { cache: 'no-store' });
    this._consolidadoRows = data.rows || [];
    this._consolidadoTotales = data.totales || null;
    return this._consolidadoRows;
  },

  shiftSaldoMes(delta) {
    this.initSaldoMes();
    let mes = this._saldoMes + delta;
    let anio = this._saldoAnio;
    while (mes < 1) {
      mes += 12;
      anio -= 1;
    }
    while (mes > 12) {
      mes -= 12;
      anio += 1;
    }
    this._saldoMes = mes;
    this._saldoAnio = anio;
  },

  filteredRows() {
    return (this._rows || []).filter((r) => {
      const saldo = Number(r.SALDO_PENDIENTE ?? r.DOC_SALDO) || 0;
      return saldo > 0.005;
    });
  },

  async fetchDocumentos() {
    const params = { _: String(Date.now()) };
    const q = this._filterQuery.trim();
    if (q) params.q = q;
    const data = await F.fetchJson(this.apiUrl(params), { cache: 'no-store' });
    this._rows = data.rows || [];
    this._total = Number(data.total) || this._rows.length;
    this._sumSaldo = Number(data.sumSaldo) || 0;
    this._sumTotal = Number(data.sumTotal) || 0;
    this._truncated = Boolean(data.truncated);
    return this._rows;
  },

  async corregirSaldos() {
    if (this._corregiendoSaldos) return;
    const ok = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Corregir saldos',
      html: `
        <p class="small text-muted mb-0 text-start">
          Se recalcularán <strong>abonos</strong> y <strong>saldo</strong> de todas las facturas al crédito,
          sumando los pagos de clientes (RCC) y notas de crédito (DEV/FNC) asociados a cada factura
          (según el monto real de cada documento vinculado). No modifica el monto de los RCC existentes.
        </p>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Corregir'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
    });
    if (!ok.isConfirmed) return;

    this._corregiendoSaldos = true;
    const btn = this._container?.querySelector('#cxp-btn-corregir-saldos');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Corrigiendo…';
    }
    try {
      const emp = F.getEmpNit();
      const data = await F.fetchJson(`/api/cuentas-cobrar/corregir-saldos?empnit=${encodeURIComponent(emp)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      F.toast(
        `Saldos corregidos: ${data.actualizadas ?? 0} de ${data.totalFacturas ?? 0} factura(s)`,
        'success'
      );
      await this.fetchDocumentos();
      this._container.innerHTML = this.renderShell();
      this.bindEvents();
    } catch (err) {
      F.toast(err.message || 'No se pudieron corregir los saldos', 'error');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-arrows-rotate me-1"></i>Corregir saldos';
      }
    } finally {
      this._corregiendoSaldos = false;
    }
  },

  renderTableBodyHtml() {
    const rows = this.filteredRows();
    if (!rows.length) {
      return `<tr><td colspan="9" class="text-center text-muted py-4">No hay facturas al crédito con saldo pendiente</td></tr>`;
    }
    return rows
      .map((r) => {
        const vencido = this.isVencido(r);
        const rowCls = vencido ? 'cxp-row-vencido' : '';
        return `<tr class="cxp-row ${rowCls}" data-coddoc="${this.escapeHtml(r.CODDOC)}" data-correlativo="${this.escapeHtml(r.CORRELATIVO)}" role="button" tabindex="0">
          <td class="small">${this.escapeHtml(r.EMPLEADO || r.VENDEDOR || '—')}</td>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
          <td class="text-nowrap${vencido ? ' text-danger fw-semibold' : ''}">${this.escapeHtml(this.formatFecha(r.VENCIMIENTO))}</td>
          <td class="fw-semibold text-nowrap">${this.escapeHtml(r.CODDOC)} #${this.escapeHtml(r.CORRELATIVO)}</td>
          <td>${this.escapeHtml(r.DOC_NOMCLIE || r.NEGOCIO || '—')}</td>
          <td class="small text-muted">${this.escapeHtml(r.NEGOCIO || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
          <td class="text-end text-success">${this.escapeHtml(this.formatMoney(r.DOC_ABONO))}</td>
          <td class="text-end fw-semibold text-primary">${this.escapeHtml(this.formatMoney(r.DOC_SALDO))}</td>
        </tr>`;
      })
      .join('');
  },

  renderVistaToggleHtml() {
    const listaActive = this._vistaTipo === 'lista';
    const calActive = this._vistaTipo === 'calendario';
    const saldoActive = this._vistaTipo === 'saldo-meses';
    const consActive = this._vistaTipo === 'consolidado-productos';
    return `
      <div class="cxp-vista-btns btn-group btn-group-sm" role="group" aria-label="Tipo de vista">
        <button type="button" class="btn ${listaActive ? 'btn-primary' : 'btn-outline-secondary'}" id="cxp-vista-lista"
          title="Lista de facturas">
          <i class="fa-solid fa-list me-1"></i>Lista
        </button>
        <button type="button" class="btn ${calActive ? 'btn-primary' : 'btn-outline-secondary'}" id="cxp-vista-calendario"
          title="Calendario de vencimientos">
          <i class="fa-solid fa-calendar-days me-1"></i>Calendario
        </button>
        <button type="button" class="btn btn-outline-secondary" id="cxp-vista-resumen"
          title="Resumen por cliente">
          <i class="fa-solid fa-table-cells me-1"></i>Resumen
        </button>
        <button type="button" class="btn ${saldoActive ? 'btn-primary' : 'btn-outline-secondary'}" id="cxp-vista-saldo-meses"
          title="Saldos por mes">
          <i class="fa-solid fa-calendar-check me-1"></i>Saldo meses
        </button>
        <button type="button" class="btn ${consActive ? 'btn-primary' : 'btn-outline-secondary'}" id="cxp-vista-consolidado"
          title="Consolidado de productos en facturas con saldo">
          <i class="fa-solid fa-boxes-stacked me-1"></i>Consolidado productos
        </button>
      </div>`;
  },

  buildResumenPorCliente() {
    const map = new Map();
    for (const r of this.filteredRows()) {
      const cod = r.CODCLIENTE != null && r.CODCLIENTE !== '' ? String(r.CODCLIENTE) : '—';
      const nombre = r.DOC_NOMCLIE || r.NEGOCIO || '—';
      const saldo = Number(r.SALDO_PENDIENTE ?? r.DOC_SALDO) || 0;
      const cur = map.get(cod) || { codigo: cod, nombre, documentos: 0, saldo: 0 };
      if ((!cur.nombre || cur.nombre === '—') && nombre && nombre !== '—') cur.nombre = nombre;
      cur.documentos += 1;
      cur.saldo += saldo;
      map.set(cod, cur);
    }
    return [...map.values()].sort((a, b) => b.saldo - a.saldo || String(a.nombre).localeCompare(String(b.nombre)));
  },

  async mostrarResumen() {
    const rows = this.buildResumenPorCliente();
    const totalDocs = rows.reduce((s, r) => s + r.documentos, 0);
    const totalSaldo = rows.reduce((s, r) => s + r.saldo, 0);
    const body = rows.length
      ? rows
          .map(
            (r) => `
        <tr>
          <td class="text-nowrap">${this.escapeHtml(r.codigo)}</td>
          <td>${this.escapeHtml(r.nombre)}</td>
          <td class="text-end">${r.documentos}</td>
          <td class="text-end fw-semibold text-primary">${this.escapeHtml(this.formatMoney(r.saldo))}</td>
        </tr>`
          )
          .join('')
      : `<tr><td colspan="4" class="text-center text-muted py-3">Sin documentos</td></tr>`;
    await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Resumen por cliente',
      width: 720,
      html: `
        <div class="table-responsive" style="max-height: 420px">
          <table class="table table-sm table-hover table-striped mb-0">
            <thead class="table-light sticky-top">
              <tr>
                <th>Cód. cliente</th>
                <th>Cliente</th>
                <th class="text-end">Documentos</th>
                <th class="text-end">Saldo total</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
            <tfoot class="table-light fw-semibold">
              <tr>
                <td colspan="2" class="text-end">Totales</td>
                <td class="text-end">${totalDocs}</td>
                <td class="text-end text-primary">${this.escapeHtml(this.formatMoney(totalSaldo))}</td>
              </tr>
            </tfoot>
          </table>
        </div>`,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
    });
  },

  renderCalDayTableHtml(rows) {
    if (!rows.length) {
      return '<p class="text-muted small text-center mb-0 py-3">Sin facturas con vencimiento en esta fecha</p>';
    }
    const body = rows
      .map((r) => {
        const vencido = this.isVencido(r);
        return `<tr class="cxp-cal-day-row${vencido ? ' cxp-row-vencido' : ''}" data-coddoc="${this.escapeHtml(r.CODDOC)}" data-correlativo="${this.escapeHtml(r.CORRELATIVO)}" role="button" tabindex="0">
          <td class="fw-semibold text-nowrap">${this.escapeHtml(r.CODDOC)} #${this.escapeHtml(r.CORRELATIVO)}</td>
          <td>${this.escapeHtml(r.DOC_NOMCLIE || r.NEGOCIO || '—')}</td>
          <td class="small">${this.escapeHtml(r.EMPLEADO || r.VENDEDOR || '—')}</td>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
          <td class="text-end fw-semibold text-primary">${this.escapeHtml(this.formatMoney(r.DOC_SALDO))}</td>
        </tr>`;
      })
      .join('');
    const totalSaldo = rows.reduce((s, r) => s + (Number(r.DOC_SALDO) || 0), 0);
    return `
      <div class="table-responsive cxp-cal-day-table" style="max-height: 360px">
        <table class="table table-sm table-hover table-striped mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th>Documento</th>
              <th>Cliente</th>
              <th>Empleado</th>
              <th>Fecha</th>
              <th class="text-end">Total</th>
              <th class="text-end">Doc.Saldo</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot class="table-light">
            <tr>
              <td colspan="5" class="text-end fw-semibold">${rows.length} documento(s)</td>
              <td class="text-end fw-bold text-primary">${this.escapeHtml(this.formatMoney(totalSaldo))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="small text-muted mt-2 mb-0 text-start">Clic en una fila para ver opciones del documento.</p>`;
  },

  async mostrarFacturasDelDia(isoDate) {
    const rows = this.rowsForVencimiento(isoDate);
    if (!rows.length) return;
    await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: `Vencimientos — ${this.formatFecha(isoDate)}`,
      html: this.renderCalDayTableHtml(rows),
      width: 720,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
      didOpen: () => {
        const onRowPick = (row) => {
          const coddoc = row.getAttribute('data-coddoc');
          const correlativo = row.getAttribute('data-correlativo');
          if (!coddoc || !correlativo) return;
          Swal.close();
          this.onRowAction(coddoc, correlativo).catch((err) => F.toast(err.message || 'Error', 'error'));
        };
        Swal.getPopup()?.querySelectorAll('.cxp-cal-day-row').forEach((row) => {
          row.addEventListener('click', () => onRowPick(row));
          row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRowPick(row);
            }
          });
        });
      },
    });
  },

  renderCalendarHtml() {
    this.initCalMonth();
    const year = this._calYear;
    const month = this._calMonth;
    const byDay = this.aggregateVencimientosPorDia();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;
    const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const today = this.todayIsoDate();
    let cells = '';

    for (let i = 0; i < startWeekday; i += 1) {
      cells += '<div class="cxp-cal-cell cxp-cal-cell--muted"></div>';
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const data = byDay.get(iso);
      const hasDue = Boolean(data?.count);
      const isToday = iso === today;
      const vencido = hasDue && iso < today;
      const cls = [
        'cxp-cal-cell',
        isToday ? 'cxp-cal-cell--today' : '',
        hasDue ? 'cxp-cal-cell--due cxp-cal-cell--clickable' : '',
        vencido ? 'cxp-cal-cell--overdue' : '',
      ]
        .filter(Boolean)
        .join(' ');
      cells += `
        <div class="${cls}" data-cal-date="${iso}"${hasDue ? ' role="button" tabindex="0"' : ''}>
          <div class="cxp-cal-day">${day}</div>
          ${
            hasDue
              ? `
            <div class="cxp-cal-meta">
              <span class="cxp-cal-count">${data.count} doc.</span>
              <span class="cxp-cal-amount">${this.escapeHtml(this.formatMoney(data.total))}</span>
            </div>`
              : ''
          }
        </div>`;
    }

    const totalCells = startWeekday + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < trailing; i += 1) {
      cells += '<div class="cxp-cal-cell cxp-cal-cell--muted"></div>';
    }

    return `
      <div class="cxp-cal-wrap card shadow-sm">
        <div class="card-body">
          <div class="cxp-cal-toolbar d-flex align-items-center justify-content-between gap-2 mb-3">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="cxp-cal-prev" title="Mes anterior">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <h3 class="h6 mb-0 fw-semibold text-center flex-grow-1">${this.escapeHtml(this.monthLabel(year, month))}</h3>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="cxp-cal-next" title="Mes siguiente">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
          <div class="cxp-cal-grid">
            ${weekDays.map((d) => `<div class="cxp-cal-weekday">${d}</div>`).join('')}
            ${cells}
          </div>
          <p class="small text-muted mt-3 mb-0">
            Días marcados tienen facturas al crédito con vencimiento y saldo pendiente. Clic en un día para ver el detalle.
          </p>
        </div>
      </div>`;
  },

  renderListaHtml() {
    return `
        <div class="card shadow-sm">
          <div class="table-responsive">
            <table class="table table-sm table-hover table-striped mb-0 cxp-table">
              <thead class="table-light sticky-top">
                <tr>
                  <th>Empleado</th>
                  <th>Fecha</th>
                  <th>Vence</th>
                  <th>Documento</th>
                  <th>Cliente</th>
                  <th>Negocio</th>
                  <th class="text-end">Total</th>
                  <th class="text-end">Abonos</th>
                  <th class="text-end">Doc.Saldo</th>
                </tr>
              </thead>
              <tbody id="cxp-tbody">${this.renderTableBodyHtml()}</tbody>
              <tfoot class="table-light">
                <tr>
                  <td colspan="8" class="text-end fw-semibold">Doc. saldo (listado)</td>
                  <td class="text-end fw-bold text-primary">${this.escapeHtml(this.formatMoney(this._sumSaldo))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <p class="small text-muted mt-2 mb-0">Clic en una fila para ver opciones del documento.</p>`;
  },

  renderSaldoMesesOptionsHtml(selected, values, labels) {
    return values
      .map((v, i) => {
        const label = labels ? labels[i] : String(v);
        const sel = Number(v) === Number(selected) ? ' selected' : '';
        return `<option value="${v}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
  },

  renderSaldoMesesHtml() {
    this.initSaldoMes();
    const mes = this._saldoMes;
    const anio = this._saldoAnio;
    const totals = this._saldoMesesTotales || {
      saldoAnterior: 0,
      creditos: 0,
      abonos: 0,
      saldoActual: 0,
      count: 0,
    };
    const years = [];
    const yNow = new Date().getFullYear();
    for (let y = yNow - 8; y <= yNow + 1; y += 1) years.push(y);
    if (!years.includes(anio)) years.push(anio);
    years.sort((a, b) => a - b);

    const body =
      this._saldoMesesRows.length === 0
        ? `<tr><td colspan="6" class="text-center text-muted py-4">Sin movimientos ni saldos hasta ${this.escapeHtml(this.monthLabel(anio, mes - 1))}</td></tr>`
        : this._saldoMesesRows
            .map(
              (r) => `<tr>
          <td>${this.escapeHtml(r.CLIENTE || '—')}</td>
          <td class="small text-muted">${this.escapeHtml(r.NEGOCIO || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.SALDO_ANTERIOR))}</td>
          <td class="text-end text-primary">${this.escapeHtml(this.formatMoney(r.CREDITOS))}</td>
          <td class="text-end text-success">${this.escapeHtml(this.formatMoney(r.ABONOS))}</td>
          <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(r.SALDO_ACTUAL))}</td>
        </tr>`
            )
            .join('');

    return `
      <div class="card shadow-sm mb-3">
        <div class="card-body py-2">
          <div class="d-flex flex-wrap align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="cxp-saldo-prev" title="Mes anterior">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <label class="small mb-0 text-muted" for="cxp-saldo-mes">Mes</label>
            <select id="cxp-saldo-mes" class="form-select form-select-sm" style="width: auto; min-width: 8rem;">
              ${this.renderSaldoMesesOptionsHtml(mes, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], this.monthNames())}
            </select>
            <label class="small mb-0 text-muted" for="cxp-saldo-anio">Año</label>
            <select id="cxp-saldo-anio" class="form-select form-select-sm" style="width: auto; min-width: 5.5rem;">
              ${this.renderSaldoMesesOptionsHtml(anio, years)}
            </select>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="cxp-saldo-next" title="Mes siguiente">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
            <span class="small text-muted ms-1">Estado general hasta ${this.escapeHtml(this.monthLabel(anio, mes - 1))}</span>
          </div>
        </div>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body py-2 px-3">
              <div class="small text-muted">Saldo anterior</div>
              <div class="fw-semibold">${this.escapeHtml(this.formatMoney(totals.saldoAnterior))}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body py-2 px-3">
              <div class="small text-muted">Créditos del mes</div>
              <div class="fw-semibold text-primary">${this.escapeHtml(this.formatMoney(totals.creditos))}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body py-2 px-3">
              <div class="small text-muted">Abonos del mes</div>
              <div class="fw-semibold text-success">${this.escapeHtml(this.formatMoney(totals.abonos))}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body py-2 px-3">
              <div class="small text-muted">Saldo actual</div>
              <div class="fw-bold text-primary">${this.escapeHtml(this.formatMoney(totals.saldoActual))}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="card shadow-sm">
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped mb-0 cxp-table">
            <thead class="table-light sticky-top">
              <tr>
                <th>Cliente</th>
                <th>Negocio</th>
                <th class="text-end">Saldo anterior</th>
                <th class="text-end">Créditos</th>
                <th class="text-end">Abonos</th>
                <th class="text-end">Saldo actual</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
            <tfoot class="table-light">
              <tr>
                <td colspan="2" class="text-end fw-semibold">${totals.count || 0} cliente(s)</td>
                <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(totals.saldoAnterior))}</td>
                <td class="text-end fw-semibold text-primary">${this.escapeHtml(this.formatMoney(totals.creditos))}</td>
                <td class="text-end fw-semibold text-success">${this.escapeHtml(this.formatMoney(totals.abonos))}</td>
                <td class="text-end fw-bold text-primary">${this.escapeHtml(this.formatMoney(totals.saldoActual))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <p class="small text-muted mt-2 mb-0">
        Incluye facturas al crédito y abonos (RCC / notas de crédito) con fecha hasta el mes seleccionado.
      </p>`;
  },

  renderConsolidadoProductosHtml() {
    const totals = this._consolidadoTotales || {
      productos: 0,
      totalUnidades: 0,
      totalPrecio: 0,
    };
    const body =
      this._consolidadoRows.length === 0
        ? `<tr><td colspan="4" class="text-center text-muted py-4">Sin productos en facturas con saldo</td></tr>`
        : this._consolidadoRows
            .map(
              (r) => `
        <tr>
          <td class="fw-semibold text-nowrap">${this.escapeHtml(r.CODPROD || '—')}</td>
          <td>${this.escapeHtml(r.DESPROD || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatQty(r.TOTALUNIDADES))}</td>
          <td class="text-end fw-semibold text-primary">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
        </tr>`
            )
            .join('');
    return `
      <div class="card shadow-sm">
        <div class="card-header bg-white py-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <span class="fw-semibold"><i class="fa-solid fa-boxes-stacked me-1 text-primary"></i>Consolidado productos</span>
            <span class="small text-muted ms-1">Agrupado por código en facturas con saldo pendiente</span>
          </div>
          <div class="d-flex flex-wrap gap-3 small">
            <span><span class="text-muted">Productos:</span> <strong>${totals.productos || 0}</strong></span>
            <span><span class="text-muted">Unidades:</span> <strong>${this.escapeHtml(this.formatQty(totals.totalUnidades))}</strong></span>
            <span><span class="text-muted">Total:</span> <strong class="text-primary">${this.escapeHtml(this.formatMoney(totals.totalPrecio))}</strong></span>
          </div>
        </div>
        <div class="table-responsive" style="max-height: min(70vh, 36rem);">
          <table class="table table-sm table-hover table-striped align-middle mb-0 cxp-table">
            <thead class="table-light sticky-top">
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th class="text-end">Total unidades</th>
                <th class="text-end">Total precio</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
            <tfoot class="table-light">
              <tr>
                <th colspan="2" class="text-end">${totals.productos || 0} producto(s)</th>
                <th class="text-end">${this.escapeHtml(this.formatQty(totals.totalUnidades))}</th>
                <th class="text-end text-primary">${this.escapeHtml(this.formatMoney(totals.totalPrecio))}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
  },

  renderShell() {
    const count = this.filteredRows().length;
    const truncHint = this._truncated
      ? `<p class="small text-warning mb-0 mt-1"><i class="fa-solid fa-triangle-exclamation me-1"></i>Mostrando ${count} de ${this._total} documento(s). Refine la búsqueda para ver más.</p>`
      : '';
    const showListaTools = this._vistaTipo === 'lista' || this._vistaTipo === 'calendario';
    let contentHtml = this.renderListaHtml();
    if (this._vistaTipo === 'calendario') contentHtml = this.renderCalendarHtml();
    if (this._vistaTipo === 'saldo-meses') contentHtml = this.renderSaldoMesesHtml();
    if (this._vistaTipo === 'consolidado-productos') contentHtml = this.renderConsolidadoProductosHtml();

    return `
      <div class="cxp-wrap w-100">
        <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-1"><i class="fa-solid fa-hand-holding-dollar me-2 text-primary"></i>Cuentas por cobrar</h2>
            <p class="text-muted small mb-0">Facturas al crédito (CONCRE = CRE) con saldo pendiente</p>
          </div>
          <div class="cxp-summary card border-0 shadow-sm">
            <div class="card-body py-2 px-3 d-flex flex-wrap gap-3 align-items-center">
              ${this.renderVistaToggleHtml()}
              <div class="small">
                <span class="text-muted">Documentos:</span>
                <strong class="ms-1">${count}</strong>
              </div>
              <div class="small">
                <span class="text-muted">Doc. saldo total:</span>
                <strong class="ms-1 text-primary">${this.escapeHtml(this.formatMoney(this._sumSaldo))}</strong>
              </div>
            </div>
          </div>
        </div>
        ${
          showListaTools
            ? `
        <div class="card shadow-sm mb-3">
          <div class="card-body py-2">
            <div class="d-flex flex-wrap align-items-center gap-2">
              <div class="input-group input-group-sm flex-grow-1" style="min-width: 12rem;">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control" id="cxp-search"
                  placeholder="Buscar documento, cliente, empleado, NIT…"
                  value="${this.escapeHtml(this._filterQuery)}" autocomplete="off">
              </div>
              <button type="button" class="btn btn-sm btn-outline-warning text-nowrap" id="cxp-btn-corregir-saldos"
                title="Recalcular saldos y abonos de facturas al crédito">
                <i class="fa-solid fa-arrows-rotate me-1"></i>Corregir saldos
              </button>
            </div>
            ${truncHint}
          </div>
        </div>`
            : ''
        }
        ${contentHtml}
      </div>`;
  },

  renderMenuOpcionesHtml() {
    return `
      <div class="cxp-menu-grid">
        ${this.MENU_OPCIONES.map(
          (opt) => `
          <button type="button" class="btn cxp-menu-btn ${opt.className}" data-cxp-action="${opt.action}">
            <i class="${opt.icon}"></i>
            <span>${this.escapeHtml(opt.label)}</span>
          </button>`
        ).join('')}
      </div>`;
  },

  renderFpagoCardHtml(saldoMax, prefix = 'cxp-abono-fpago') {
    return `
      <div class="card fac-finalizar-fpago-card mt-2" id="${prefix}-card">
        <div class="card-header py-2 px-3 small fw-semibold bg-light border-0">
          <i class="fa-solid fa-wallet me-1 text-primary"></i>Formas de pago
        </div>
        <div class="card-body py-2 px-3">
          <p class="small text-muted mb-2">El monto del abono es la suma de las formas de pago (máx. ${this.escapeHtml(this.formatMoney(saldoMax))}).</p>
          <div class="row g-2">
            <div class="col-6">
              <label class="form-label small mb-0" for="${prefix}-efectivo">Efectivo</label>
              <input type="number" id="${prefix}-efectivo" class="form-control form-control-sm cxp-fpago-input" min="0" step="0.01" value="0">
            </div>
            <div class="col-6">
              <label class="form-label small mb-0" for="${prefix}-tarjeta">Tarjeta</label>
              <input type="number" id="${prefix}-tarjeta" class="form-control form-control-sm cxp-fpago-input" min="0" step="0.01" value="0">
            </div>
            <div class="col-6">
              <label class="form-label small mb-0" for="${prefix}-deposito">Depósito</label>
              <input type="number" id="${prefix}-deposito" class="form-control form-control-sm cxp-fpago-input" min="0" step="0.01" value="0">
            </div>
            <div class="col-6">
              <label class="form-label small mb-0" for="${prefix}-cheque">Cheque</label>
              <input type="number" id="${prefix}-cheque" class="form-control form-control-sm cxp-fpago-input" min="0" step="0.01" value="0">
            </div>
          </div>
          <div class="mt-2 small text-end fw-semibold text-primary" id="${prefix}-sum">Monto abono: ${this.escapeHtml(this.formatMoney(0))}</div>
          <div class="mt-2 mb-0">
            <label class="form-label small mb-0" for="${prefix}-desc">Detalles del pago</label>
            <input type="text" id="${prefix}-desc" class="form-control form-control-sm" placeholder="No. boleta, cheque o tarjeta (opcional)" maxlength="200">
          </div>
        </div>
      </div>`;
  },

  sumFpagoInputs(prefix = 'cxp-abono-fpago') {
    const ids = [`${prefix}-efectivo`, `${prefix}-tarjeta`, `${prefix}-deposito`, `${prefix}-cheque`];
    return ids.reduce((acc, id) => acc + (Number(document.getElementById(id)?.value ?? 0) || 0), 0);
  },

  bindFpagoRefresh(saldoMax, prefix = 'cxp-abono-fpago') {
    const sumEl = document.getElementById(`${prefix}-sum`);
    const refresh = () => {
      if (!sumEl) return;
      const sum = this.sumFpagoInputs(prefix);
      sumEl.textContent = `Monto abono: ${this.formatMoney(sum)}`;
      if (sum > saldoMax + 0.001) {
        sumEl.classList.add('text-danger');
        sumEl.classList.remove('text-primary');
      } else {
        sumEl.classList.remove('text-danger');
        sumEl.classList.add('text-primary');
      }
    };
    [`${prefix}-efectivo`, `${prefix}-tarjeta`, `${prefix}-deposito`, `${prefix}-cheque`].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', refresh);
    });
    refresh();
  },

  readFpagoFromDom(prefix = 'cxp-abono-fpago') {
    return {
      FPAGO_EFECTIVO: Number(document.getElementById(`${prefix}-efectivo`)?.value ?? 0),
      FPAGO_TARJETA: Number(document.getElementById(`${prefix}-tarjeta`)?.value ?? 0),
      FPAGO_DEPOSITO: Number(document.getElementById(`${prefix}-deposito`)?.value ?? 0),
      FPAGO_CHEQUE: Number(document.getElementById(`${prefix}-cheque`)?.value ?? 0),
      FPAGO_DESCRIPCION: document.getElementById(`${prefix}-desc`)?.value?.trim() || '',
    };
  },

  async imprimirReciboAbono({ facturaRow, abono, factura, fpago = {}, monto }) {
    if (typeof DocPrint === 'undefined') {
      F.toast('Impresión no disponible', 'warning');
      return;
    }
    await DocPrint.printReciboPagoCliente({
      abono,
      factura: {
        CODDOC: facturaRow?.CODDOC || abono?.SERIEFAC,
        CORRELATIVO: facturaRow?.CORRELATIVO || abono?.NOFAC,
        DOC_SALDO: factura?.DOC_SALDO ?? facturaRow?.DOC_SALDO,
      },
      fpago,
      cliente: facturaRow?.DOC_NOMCLIE || facturaRow?.NEGOCIO || '—',
      usuario: abono?.USUARIO || this.usuario(),
      fecha: abono?.FECHA || this.todayIsoDate(),
      monto: monto ?? abono?.TOTALPRECIO,
    });
  },

  async imprimirReciboDesdeHistorial(abono, facturaRow) {
    let fpago = {};
    try {
      if (typeof DocOpciones !== 'undefined' && abono?.CODDOC && abono?.CORRELATIVO != null) {
        const doc = await DocOpciones.fetchDetalle(abono.CODDOC, abono.CORRELATIVO);
        const h = doc.header || {};
        fpago = {
          FPAGO_EFECTIVO: h.FPAGO_EFECTIVO,
          FPAGO_TARJETA: h.FPAGO_TARJETA,
          FPAGO_DEPOSITO: h.FPAGO_DEPOSITO,
          FPAGO_CHEQUE: h.FPAGO_CHEQUE,
          FPAGO_DESCRIPCION: h.FPAGO_DESCRIPCION,
        };
      }
    } catch {
      /* sin detalle de formas de pago */
    }
    const facturaSaldo = facturaRow?.DOC_SALDO;
    await this.imprimirReciboAbono({
      facturaRow: { ...facturaRow, DOC_SALDO: facturaSaldo },
      abono,
      fpago,
      monto: abono.TOTALPRECIO,
    });
  },

  renderAbonosTableHtml(abonos, facturaRow = null) {
    if (!abonos?.length) {
      return '<p class="text-muted small text-center mb-0 py-3">Sin abonos ni notas de crédito registrados</p>';
    }
    const rows = abonos
      .map((a) => {
        const tipo = String(a.TIPODOC || '').trim();
        const tipoCls =
          tipo === 'RCC' ? 'bg-success' : tipo === 'DEV' || tipo === 'FNC' ? 'bg-warning text-dark' : 'bg-secondary';
        const docLabel = a.DESDOC
          ? `${a.CODDOC} — ${a.DESDOC} #${a.CORRELATIVO}`
          : `${a.CODDOC} #${a.CORRELATIVO}`;
        const printBtn =
          tipo === 'RCC'
            ? `<button type="button" class="btn btn-sm btn-outline-secondary py-0 px-1 cxp-print-recibo-btn"
                data-coddoc="${this.escapeHtml(a.CODDOC)}" data-correlativo="${this.escapeHtml(a.CORRELATIVO)}"
                title="Imprimir recibo"><i class="fa-solid fa-print"></i></button>`
            : '';
        return `<tr>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(a.FECHA))}</td>
          <td><span class="badge ${tipoCls}">${this.escapeHtml(tipo || '—')}</span></td>
          <td class="fw-semibold">${this.escapeHtml(docLabel)}</td>
          <td class="text-end fw-semibold text-success">${this.escapeHtml(this.formatMoney(a.TOTALPRECIO))}</td>
          <td class="small">${this.escapeHtml(a.USUARIO || '—')}</td>
          <td class="text-end">${printBtn}</td>
        </tr>`;
      })
      .join('');
    const facturaAttr = facturaRow
      ? ` data-fac-coddoc="${this.escapeHtml(facturaRow.CODDOC)}" data-fac-correlativo="${this.escapeHtml(facturaRow.CORRELATIVO)}"`
      : '';
    return `
      <div class="table-responsive cxp-historial-table" style="max-height: 360px"${facturaAttr} id="cxp-historial-wrap">
        <table class="table table-sm table-striped mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Documento</th>
              <th class="text-end">Monto</th>
              <th>Usuario</th>
              <th class="text-end">Recibo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  findRow(coddoc, correlativo) {
    return this._rows.find(
      (r) => String(r.CODDOC) === String(coddoc) && String(r.CORRELATIVO) === String(correlativo),
    );
  },

  async fetchFacturaDetalle(coddoc, correlativo) {
    return F.fetchJson(`${this.facturaUrl(coddoc, correlativo)}&_=${Date.now()}`, { cache: 'no-store' });
  },

  estadoCuentaUrl(codcliente) {
    const emp = F.getEmpNit();
    return `/api/cuentas-cobrar/clientes/${encodeURIComponent(codcliente)}/estado-cuenta?empnit=${encodeURIComponent(emp)}`;
  },

  async fetchEstadoCuentaCliente(codcliente) {
    return F.fetchJson(`${this.estadoCuentaUrl(codcliente)}&_=${Date.now()}`, { cache: 'no-store' });
  },

  async resolveCodcliente(row) {
    if (row?.CODCLIENTE != null && row.CODCLIENTE !== '') {
      return Number(row.CODCLIENTE);
    }
    const det = await this.fetchFacturaDetalle(row.CODDOC, row.CORRELATIVO);
    const cod = det?.factura?.CODCLIENTE;
    return cod != null ? Number(cod) : null;
  },

  renderEstadoCuentaFacturasTableHtml(facturas) {
    if (!facturas?.length) {
      return '<p class="text-muted small text-center mb-0 py-2">Sin facturas al crédito</p>';
    }
    const rows = facturas
      .map(
        (f) => `<tr>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(f.FECHA))}</td>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(f.VENCIMIENTO))}</td>
          <td class="fw-semibold text-nowrap">${this.escapeHtml(f.CODDOC)} #${this.escapeHtml(f.CORRELATIVO)}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(f.TOTALPRECIO))}</td>
          <td class="text-end text-success">${this.escapeHtml(this.formatMoney(f.DOC_ABONO))}</td>
          <td class="text-end fw-semibold text-primary">${this.escapeHtml(this.formatMoney(f.DOC_SALDO))}</td>
        </tr>`
      )
      .join('');
    return `
      <div class="table-responsive" style="max-height: 240px">
        <table class="table table-sm table-striped mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th>Fecha</th>
              <th>Vence</th>
              <th>Documento</th>
              <th class="text-end">Total</th>
              <th class="text-end">Abonos</th>
              <th class="text-end">Doc.Saldo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  renderEstadoCuentaAbonosTableHtml(abonos) {
    if (!abonos?.length) {
      return '<p class="text-muted small text-center mb-0 py-2">Sin abonos ni notas de crédito</p>';
    }
    const rows = abonos
      .map((a) => {
        const tipo = String(a.TIPODOC || '').trim();
        const tipoCls =
          tipo === 'RCC' ? 'bg-success' : tipo === 'DEV' || tipo === 'FNC' ? 'bg-warning text-dark' : 'bg-secondary';
        return `<tr>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(a.FECHA))}</td>
          <td><span class="badge ${tipoCls}">${this.escapeHtml(tipo || '—')}</span></td>
          <td class="fw-semibold text-nowrap">${this.escapeHtml(a.CODDOC)} #${this.escapeHtml(a.CORRELATIVO)}</td>
          <td class="small text-muted">${this.escapeHtml(a.FACTURA_REF || '—')}</td>
          <td class="text-end fw-semibold text-success">${this.escapeHtml(this.formatMoney(a.TOTALPRECIO))}</td>
          <td class="small">${this.escapeHtml(a.USUARIO || '—')}</td>
        </tr>`;
      })
      .join('');
    return `
      <div class="table-responsive" style="max-height: 280px">
        <table class="table table-sm table-striped mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Documento</th>
              <th>Factura ref.</th>
              <th class="text-end">Monto</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  renderEstadoCuentaMovimientosTableHtml(movimientos, totales = {}) {
    if (!movimientos?.length) {
      return '<p class="text-muted small text-center mb-0 py-2">Sin movimientos registrados</p>';
    }
    const rows = movimientos
      .map((m) => {
        const tipo = String(m.TIPODOC || '').trim();
        const docLabel = `${m.CODDOC} #${m.CORRELATIVO}`;
        const ref = m.MOV === 'A' && m.FACTURA_REF
          ? `<div class="text-muted" style="font-size:.72rem">Ref: ${this.escapeHtml(m.FACTURA_REF)}</div>`
          : '';
        return `<tr>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(m.FECHA))}</td>
          <td class="text-nowrap">${this.escapeHtml(tipo || '—')}</td>
          <td>${this.escapeHtml(docLabel)}${ref}</td>
          <td class="text-end">${m.CREDITO ? this.escapeHtml(this.formatMoney(m.CREDITO)) : ''}</td>
          <td class="text-end text-success">${m.ABONO ? this.escapeHtml(this.formatMoney(m.ABONO)) : ''}</td>
          <td class="text-end fw-semibold text-primary">${this.escapeHtml(this.formatMoney(m.SALDO))}</td>
        </tr>`;
      })
      .join('');
    return `
      <div class="table-responsive" style="max-height: 360px">
        <table class="table table-sm table-striped mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Documento</th>
              <th class="text-end">Créditos</th>
              <th class="text-end">Abonos</th>
              <th class="text-end">Saldo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot class="table-light">
            <tr>
              <td colspan="3" class="text-end fw-semibold">Totales</td>
              <td class="text-end fw-bold">${this.escapeHtml(this.formatMoney(totales.totalCreditos))}</td>
              <td class="text-end fw-bold text-success">${this.escapeHtml(this.formatMoney(totales.totalAbonosMov))}</td>
              <td class="text-end fw-bold text-primary">${this.escapeHtml(this.formatMoney(totales.totalSaldo))}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  renderEstadoCuentaBodyHtml(data) {
    const c = data.cliente || {};
    const t = data.totales || {};
    const nombre = c.DOC_NOMCLIE || c.NOMBRECLIENTE || c.NEGOCIO || '—';
    return `
      <div class="text-start small">
        <p class="mb-1"><strong>Cliente:</strong> ${this.escapeHtml(nombre)}</p>
        <p class="mb-1"><strong>Negocio:</strong> ${this.escapeHtml(c.NEGOCIO || '—')}</p>
        <p class="mb-2"><strong>NIT:</strong> ${this.escapeHtml(c.NIT || '—')}</p>
        <div class="row g-2 mb-3">
          <div class="col-4">
            <div class="border rounded p-2 text-center">
              <div class="text-muted">Total créditos</div>
              <strong>${this.escapeHtml(this.formatMoney(t.totalCreditos))}</strong>
              <div class="text-muted" style="font-size:.75rem">${t.countFacturas || 0} doc.</div>
            </div>
          </div>
          <div class="col-4">
            <div class="border rounded p-2 text-center">
              <div class="text-muted">Total abonos</div>
              <strong class="text-success">${this.escapeHtml(this.formatMoney(t.totalAbonosMov))}</strong>
              <div class="text-muted" style="font-size:.75rem">${t.countAbonos || 0} mov.</div>
            </div>
          </div>
          <div class="col-4">
            <div class="border rounded p-2 text-center">
              <div class="text-muted">Saldo</div>
              <strong class="text-primary">${this.escapeHtml(this.formatMoney(t.totalSaldo))}</strong>
            </div>
          </div>
        </div>
        <p class="fw-semibold mb-1">Movimientos (orden de ingreso)</p>
        ${this.renderEstadoCuentaMovimientosTableHtml(data.movimientos, t)}
      </div>`;
  },

  async imprimirEstadoCuenta(data) {
    const c = data.cliente || {};
    const t = data.totales || {};
    const movimientos = data.movimientos || [];
    const nombre = c.DOC_NOMCLIE || c.NOMBRECLIENTE || c.NEGOCIO || '';
    const hoy = this.formatFecha(this.todayIsoDate());

    const rows = movimientos.length
      ? movimientos
          .map((m) => {
            const tipo = String(m.TIPODOC || '').trim();
            const docLabel = `${m.CODDOC} #${m.CORRELATIVO}`;
            const ref = m.MOV === 'A' && m.FACTURA_REF ? ` (Ref: ${m.FACTURA_REF})` : '';
            return `<tr>
              <td>${PrintReport.escapeHtml(this.formatFecha(m.FECHA))}</td>
              <td>${PrintReport.escapeHtml(tipo || '—')}</td>
              <td>${PrintReport.escapeHtml(docLabel + ref)}</td>
              <td class="text-end">${m.CREDITO ? PrintReport.escapeHtml(this.formatMoney(m.CREDITO)) : ''}</td>
              <td class="text-end">${m.ABONO ? PrintReport.escapeHtml(this.formatMoney(m.ABONO)) : ''}</td>
              <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(m.SALDO))}</td>
            </tr>`;
          })
          .join('')
      : '<tr><td colspan="6" style="text-align:center;color:#666">Sin movimientos registrados</td></tr>';

    const bodyHtml = `
      ${PrintReport.reportHeaderHtml({
        title: 'Estado de cuenta — cliente',
        subtitleHtml: `
          <p><strong>Cliente:</strong> ${PrintReport.escapeHtml(nombre)}</p>
          ${c.NEGOCIO ? `<p><strong>Negocio:</strong> ${PrintReport.escapeHtml(c.NEGOCIO)}</p>` : ''}
          ${c.NIT ? `<p><strong>NIT:</strong> ${PrintReport.escapeHtml(c.NIT)}</p>` : ''}
          <p><strong>Fecha:</strong> ${PrintReport.escapeHtml(hoy)}</p>
        `,
      })}
      <table class="ecc-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Documento</th>
            <th class="text-end">Créditos</th>
            <th class="text-end">Abonos</th>
            <th class="text-end">Saldo</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="totals">
            <td colspan="3" class="text-end"><strong>Totales</strong></td>
            <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(t.totalCreditos))}</strong></td>
            <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(t.totalAbonosMov))}</strong></td>
            <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(t.totalSaldo))}</strong></td>
          </tr>
        </tfoot>
      </table>
    `;

    await PrintReport.openAndPrint(
      () =>
        PrintReport.wrapDocument({
          title: 'Estado de cuenta — cliente',
          bodyHtml,
          extraStyles: `
        .ecc-table{font-size:11px}
        .ecc-table th,.ecc-table td{padding:5px 7px}
        .ecc-table tbody tr:nth-child(even){background:#fafafa}
        .ecc-table tfoot td{background:#f0f0f0;border-top:2px solid #999}
      `,
        }),
      'width=900,height=700'
    );
  },

  async showMenuDocumento(coddoc, correlativo) {
    const row = this.findRow(coddoc, correlativo);
    if (!row) {
      F.toast('Documento no encontrado en la lista', 'warning');
      return;
    }
    const label = this.docLabel(row);
    await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Opciones del documento',
      html: `
        <p class="small text-muted text-start mb-2">${this.escapeHtml(label)} · ${this.escapeHtml(row.DOC_NOMCLIE || '')}</p>
        ${this.renderMenuOpcionesHtml()}
      `,
      width: 580,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
      didOpen: () => {
        Swal.getPopup()?.querySelectorAll('[data-cxp-action]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const action = btn.getAttribute('data-cxp-action');
            Swal.close();
            await this.handleMenuAction(action, row);
          });
        });
      },
    });
  },

  async handleMenuAction(action, row) {
    const coddoc = row.CODDOC;
    const correlativo = row.CORRELATIVO;
    try {
      if (action === 'nuevo-abono') {
        await this.nuevoAbono(row);
        return;
      }
      if (action === 'historial') {
        await this.mostrarHistorial(row);
        return;
      }
      if (action === 'estado-cuenta') {
        await this.mostrarEstadoCuenta(row);
        return;
      }
      if (action === 'reimprimir') {
        if (typeof DocOpciones !== 'undefined') {
          await DocOpciones.imprimir(coddoc, correlativo, row);
        } else {
          F.toast('Impresión no disponible', 'warning');
        }
        return;
      }
      if (action === 'whatsapp') {
        if (typeof DocOpciones !== 'undefined') {
          await DocOpciones.enviarWhatsapp(coddoc, correlativo, row);
        } else {
          F.toast('WhatsApp no disponible', 'warning');
        }
      }
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo completar la acción', 'error');
    }
  },

  async nuevoAbono(row) {
    if (this._guardandoRecibo) return;
    const coddoc = row.CODDOC;
    const correlativo = row.CORRELATIVO;
    const fechaHoy = this.todayIsoDate();
    const saldo = Number(row.SALDO_PENDIENTE ?? row.DOC_SALDO) || 0;
    const totalFactura = Number(row.TOTALPRECIO) || 0;
    const abonos = Number(row.DOC_ABONO) || 0;
    const cliente = String(row.DOC_NOMCLIE || row.NEGOCIO || '—');

    let rccTipos;
    let rccPreview;
    let cajasAbiertas;
    try {
      const tiposData = await this.fetchRccTipos();
      rccTipos = tiposData.rows || [];
      if (!rccTipos.length) {
        F.alert('Error', 'No hay tipo de documento RCC activo', 'error');
        return;
      }
      const firstCoddoc = rccTipos[0].CODDOC;
      const prevData = await this.fetchSiguienteRcc(firstCoddoc);
      rccPreview = prevData.rcc;
      const cajasData = await this.fetchCajasAbiertas();
      cajasAbiertas = cajasData.rows || [];
      this._cajaDefaultAbono = cajasData.cajaDefault ?? cajasData.preferredCaja ?? null;
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo obtener el documento RCC', 'error');
      return;
    }
    if (!rccPreview?.CODDOC) {
      F.alert('Error', 'No hay tipo de documento RCC activo', 'error');
      return;
    }
    if (!cajasAbiertas.length) {
      F.alert('Caja requerida', 'Abra una caja antes de registrar un recibo de pago (RCC).', 'warning');
      return;
    }

    const { isConfirmed, value } = await Swal.fire({
      ...CatalogosUI.modalBase({ customClass: { popup: 'modal-catalogo fac-finalizar-modal' } }),
      title: 'Nuevo abono',
      width: '44rem',
      html: `
        <div class="text-start fac-finalizar-modal-body">
          <p class="small text-muted mb-2">Factura <strong>${this.escapeHtml(coddoc)} #${this.escapeHtml(correlativo)}</strong></p>
          <div class="row g-2 mb-2">
            <div class="col-md-3">
              <label class="form-label small mb-0">Fecha</label>
              <input type="date" id="cxp-abono-fecha" class="form-control form-control-sm" value="${fechaHoy}" disabled>
            </div>
            <div class="col-md-3">
              <label class="form-label small mb-0" for="cxp-abono-coddoc">CODDOC (RCC)</label>
              ${this.renderRccCoddocSelectHtml(rccTipos, rccPreview.CODDOC)}
            </div>
            <div class="col-md-3">
              <label class="form-label small mb-0" for="cxp-abono-correlativo">Correlativo</label>
              <input type="text" id="cxp-abono-correlativo" class="form-control form-control-sm bg-light fw-semibold text-end" value="${this.escapeHtml(rccPreview.CORRELATIVO)}" readonly>
            </div>
            <div class="col-md-3">
              <label class="form-label small mb-0">Cliente</label>
              <input type="text" class="form-control form-control-sm bg-light" value="${this.escapeHtml(cliente)}" readonly title="${this.escapeHtml(cliente)}">
            </div>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-md-4">
              <label class="form-label small mb-0" for="cxp-abono-caja">Caja <span class="text-danger">*</span></label>
              ${this.renderCajasAbiertasSelectHtml(cajasAbiertas, this._cajaDefaultAbono)}
            </div>
            <div class="col-md-8">
              <p class="small text-muted mb-0 mt-4">El recibo entra al corte de la caja seleccionada.</p>
            </div>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-4">
              <label class="form-label small mb-0">Total factura</label>
              <input type="text" class="form-control form-control-sm bg-light text-end" value="${this.escapeHtml(this.formatMoney(totalFactura))}" readonly>
            </div>
            <div class="col-4">
              <label class="form-label small mb-0">Abonos</label>
              <input type="text" class="form-control form-control-sm bg-light text-end" value="${this.escapeHtml(this.formatMoney(abonos))}" readonly>
            </div>
            <div class="col-4">
              <label class="form-label small mb-0">Saldo</label>
              <input type="text" class="form-control form-control-sm bg-light text-end" value="${this.escapeHtml(this.formatMoney(saldo))}" readonly>
            </div>
          </div>
          ${this.renderFpagoCardHtml(saldo)}
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Guardar abono'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        this.bindFpagoRefresh(saldo);
        this.wireCoddocRccChange();
        document.getElementById('cxp-abono-fpago-efectivo')?.focus();
      },
      preConfirm: async () => {
        const coddocRcc = document.getElementById('cxp-abono-coddoc')?.value?.trim();
        if (!coddocRcc) {
          Swal.showValidationMessage('Seleccione el documento RCC');
          return false;
        }
        const codcaja = document.getElementById('cxp-abono-caja')?.value?.trim();
        if (!codcaja) {
          Swal.showValidationMessage('Seleccione una caja abierta');
          return false;
        }
        const monto = Math.round(this.sumFpagoInputs() * 1000) / 1000;
        if (!Number.isFinite(monto) || monto <= 0) {
          Swal.showValidationMessage('Indique el monto del abono en las formas de pago');
          return false;
        }
        if (monto > saldo + 0.001) {
          Swal.showValidationMessage(`El abono no puede superar el saldo (${this.formatMoney(saldo)})`);
          return false;
        }
        const payload = {
          MONTO: monto,
          CODDOC_RCC: coddocRcc,
          CODCAJA: Number(codcaja),
          ...this.readFpagoFromDom(),
          USUARIO: this.usuario(),
        };
        Swal.showLoading();
        Swal.getCancelButton()?.setAttribute('disabled', 'true');
        Swal.getConfirmButton()?.setAttribute('disabled', 'true');
        this._guardandoRecibo = true;
        try {
          const res = await F.fetchJson(this.abonosUrl(coddoc, correlativo), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          return { ...res, fpago: payload };
        } catch (e) {
          Swal.hideLoading();
          Swal.getCancelButton()?.removeAttribute('disabled');
          Swal.getConfirmButton()?.removeAttribute('disabled');
          Swal.showValidationMessage(e.message || 'Error al guardar el abono');
          return false;
        } finally {
          this._guardandoRecibo = false;
        }
      },
    });

    if (!isConfirmed || !value) return;

    F.toast(`Abono ${value.abono?.CODDOC}-${value.abono?.CORRELATIVO} registrado`, 'success');
    try {
      await this.imprimirReciboAbono({
        facturaRow: row,
        abono: value.abono,
        factura: value.factura,
        fpago: value.fpago,
        monto: value.abono?.TOTALPRECIO,
      });
    } catch {
      /* impresión opcional */
    }
    await this.fetchDocumentos();
    this._container.innerHTML = this.renderShell();
    this.bindEvents();
  },

  async mostrarHistorial(row) {
    const data = await this.fetchFacturaDetalle(row.CODDOC, row.CORRELATIVO);
    const abonos = data.abonos || [];
    const totalMov = abonos.reduce((s, a) => s + (Number(a.TOTALPRECIO) || 0), 0);
    await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Historial de abonos y notas de crédito',
      html: `
        <p class="small text-muted text-start mb-2">
          Factura <strong>${this.escapeHtml(row.CODDOC)} #${this.escapeHtml(row.CORRELATIVO)}</strong>
          · ${this.escapeHtml(row.DOC_NOMCLIE || '')}
        </p>
        <p class="small text-muted text-start mb-2">RCC, DEV y FNC vinculados por SERIEFAC / NOFAC</p>
        ${this.renderAbonosTableHtml(abonos, row)}
        <p class="text-end mt-2 mb-0 small"><strong>Total: ${this.escapeHtml(this.formatMoney(totalMov))}</strong></p>
      `,
      width: 680,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
      didOpen: () => {
        document.querySelectorAll('.cxp-print-recibo-btn').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const cod = btn.getAttribute('data-coddoc');
            const corr = btn.getAttribute('data-correlativo');
            const abono = abonos.find(
              (a) => String(a.CODDOC) === String(cod) && String(a.CORRELATIVO) === String(corr)
            );
            if (!abono) return;
            try {
              await this.imprimirReciboDesdeHistorial(abono, row);
            } catch (err) {
              F.toast(err.message || 'No se pudo imprimir', 'error');
            }
          });
        });
      },
    });
  },

  async mostrarEstadoCuenta(row) {
    Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Generando estado de cuenta',
      html: '<p class="small text-muted mb-0">Consultando movimientos del cliente…</p>',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });
    let codcliente;
    try {
      codcliente = await this.resolveCodcliente(row);
      if (!codcliente) {
        Swal.close();
        F.alert('Error', 'No se pudo identificar el cliente del documento', 'error');
        return;
      }
      const data = await this.fetchEstadoCuentaCliente(codcliente);
      Swal.close();
      const bodyHtml = this.renderEstadoCuentaBodyHtml(data);
      await Swal.fire({
        ...CatalogosUI.modalBase(),
        title: 'Estado de cuenta — cliente',
        html: bodyHtml,
        width: 760,
        showCancelButton: true,
        cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
        confirmButtonText: '<i class="fa-solid fa-print me-1"></i> Imprimir',
        showConfirmButton: true,
      }).then((result) => {
        if (result.isConfirmed && typeof PrintReport !== 'undefined') {
          this.imprimirEstadoCuenta(data);
        }
      });
    } catch (err) {
      Swal.close();
      F.alert('Error', err.message || 'No se pudo cargar el estado de cuenta', 'error');
    }
  },

  async onRowAction(coddoc, correlativo) {
    await this.showMenuDocumento(coddoc, correlativo);
  },

  bindEvents() {
    const search = this._container?.querySelector('#cxp-search');
    let searchTimer = null;
    search?.addEventListener('input', () => {
      this._filterQuery = search.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        try {
          this._loading = true;
          await this.fetchDocumentos();
          this._container.innerHTML = this.renderShell();
          this.bindEvents();
        } catch (err) {
          F.toast(err.message || 'Error al buscar', 'error');
        } finally {
          this._loading = false;
        }
      }, 350);
    });

    const reloadShell = () => {
      this._container.innerHTML = this.renderShell();
      this.bindEvents();
    };

    const switchVista = async (value) => {
      if (value === this._vistaTipo) return;
      this._vistaTipo = value;
      if (value === 'calendario') this.initCalMonth();
      if (value === 'saldo-meses') {
        this.initSaldoMes();
        this._container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando saldos del mes…</div>`;
        try {
          await this.fetchSaldoMeses();
        } catch (err) {
          F.toast(err.message || 'No se pudo cargar saldo meses', 'error');
        }
      }
      if (value === 'consolidado-productos') {
        this._container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando consolidado de productos…</div>`;
        try {
          await this.fetchConsolidadoProductos();
        } catch (err) {
          F.toast(err.message || 'No se pudo cargar el consolidado', 'error');
        }
      }
      reloadShell();
    };

    this._container?.querySelector('#cxp-vista-lista')?.addEventListener('click', () => {
      switchVista('lista');
    });
    this._container?.querySelector('#cxp-vista-calendario')?.addEventListener('click', () => {
      switchVista('calendario');
    });
    this._container?.querySelector('#cxp-vista-resumen')?.addEventListener('click', () => {
      this.mostrarResumen().catch((err) => F.toast(err.message || 'Error', 'error'));
    });
    this._container?.querySelector('#cxp-vista-saldo-meses')?.addEventListener('click', () => {
      switchVista('saldo-meses');
    });
    this._container?.querySelector('#cxp-vista-consolidado')?.addEventListener('click', () => {
      switchVista('consolidado-productos');
    });

    this._container?.querySelector('#cxp-cal-prev')?.addEventListener('click', () => {
      this.initCalMonth();
      this._calMonth -= 1;
      if (this._calMonth < 0) {
        this._calMonth = 11;
        this._calYear -= 1;
      }
      reloadShell();
    });

    this._container?.querySelector('#cxp-cal-next')?.addEventListener('click', () => {
      this.initCalMonth();
      this._calMonth += 1;
      if (this._calMonth > 11) {
        this._calMonth = 0;
        this._calYear += 1;
      }
      reloadShell();
    });

    const onCalDayPick = (cell) => {
      const iso = cell.getAttribute('data-cal-date');
      if (!iso || !cell.classList.contains('cxp-cal-cell--clickable')) return;
      this.mostrarFacturasDelDia(iso).catch((err) => F.toast(err.message || 'Error', 'error'));
    };

    this._container?.querySelectorAll('.cxp-cal-cell--clickable').forEach((cell) => {
      cell.addEventListener('click', () => onCalDayPick(cell));
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCalDayPick(cell);
        }
      });
    });

    const reloadSaldoMeses = async () => {
      this._container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando saldos del mes…</div>`;
      try {
        await this.fetchSaldoMeses();
      } catch (err) {
        F.toast(err.message || 'No se pudo cargar saldo meses', 'error');
      }
      reloadShell();
    };

    this._container?.querySelector('#cxp-saldo-prev')?.addEventListener('click', () => {
      this.shiftSaldoMes(-1);
      reloadSaldoMeses();
    });
    this._container?.querySelector('#cxp-saldo-next')?.addEventListener('click', () => {
      this.shiftSaldoMes(1);
      reloadSaldoMeses();
    });
    this._container?.querySelector('#cxp-saldo-mes')?.addEventListener('change', (e) => {
      this._saldoMes = Number(e.target.value) || this._saldoMes;
      reloadSaldoMeses();
    });
    this._container?.querySelector('#cxp-saldo-anio')?.addEventListener('change', (e) => {
      this._saldoAnio = Number(e.target.value) || this._saldoAnio;
      reloadSaldoMeses();
    });

    this._container?.querySelector('#cxp-btn-corregir-saldos')?.addEventListener('click', () => {
      this.corregirSaldos().catch((err) => F.toast(err.message || 'Error al corregir saldos', 'error'));
    });

    const onRowPick = (row) => {
      const coddoc = row.getAttribute('data-coddoc');
      const correlativo = row.getAttribute('data-correlativo');
      if (!coddoc || !correlativo) return;
      this.onRowAction(coddoc, correlativo).catch((err) => F.toast(err.message || 'Error', 'error'));
    };

    this._container?.querySelectorAll('.cxp-row').forEach((row) => {
      row.addEventListener('click', () => onRowPick(row));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRowPick(row);
        }
      });
    });
  },

  async load(container) {
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

    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando cuentas por cobrar…</div>`;
    try {
      this.initCalMonth();
      this.initSaldoMes();
      await this.fetchDocumentos();
      container.innerHTML = this.renderShell();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
    }
  },
};
