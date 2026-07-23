/**
 * RH — Vales a empleados (descuento de efectivo en corte de caja).
 */
const NominaValesView = {
  _container: null,
  _rows: [],
  _empleados: [],
  _cajas: [],
  _mes: new Date().getMonth() + 1,
  _anio: new Date().getFullYear(),
  _loading: false,

  escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatMoney(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatFecha(v) {
    if (!v) return '—';
    const s = String(v).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return this.escapeHtml(s);
    return `${m[3]}-${m[2]}-${m[1]}`;
  },

  fechaInputValue(v) {
    if (!v) return this.todayIso();
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    }
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : this.todayIso();
  },

  usuario() {
    const u = F.session('user') || {};
    return u.usuario || u.username || 'SN';
  },

  apiUrl(extra = {}) {
    const params = new URLSearchParams({
      empnit: F.getEmpNit() || '',
      mes: String(this._mes),
      anio: String(this._anio),
      _: String(Date.now()),
      ...extra,
    });
    return `/api/nomina/vales?${params}`;
  },

  todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  mesOptionsHtml() {
    const labels = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return labels
      .map(
        (label, i) =>
          `<option value="${i + 1}"${this._mes === i + 1 ? ' selected' : ''}>${label}</option>`
      )
      .join('');
  },

  anioOptionsHtml() {
    const y = new Date().getFullYear();
    const years = [];
    for (let a = y + 1; a >= y - 5; a -= 1) years.push(a);
    return years
      .map((a) => `<option value="${a}"${this._anio === a ? ' selected' : ''}>${a}</option>`)
      .join('');
  },

  totalMes() {
    return this._rows.reduce((acc, r) => acc + (Number(r.MONTO) || 0), 0);
  },

  totalAbonos() {
    return this._rows.reduce((acc, r) => acc + (Number(r.ABONOS) || 0), 0);
  },

  totalSaldo() {
    return this._rows.reduce((acc, r) => acc + (Number(r.SALDO) || 0), 0);
  },

  saldoVale(r) {
    const s = Number(r?.SALDO);
    if (Number.isFinite(s)) return s;
    return Math.max(0, (Number(r?.MONTO) || 0) - (Number(r?.ABONOS) || 0));
  },

  findRow(id) {
    return this._rows.find((r) => String(r.ID) === String(id)) || null;
  },

  renderTable() {
    if (!this._rows.length) {
      return '<p class="text-center text-muted py-4 mb-0">No hay vales en el período seleccionado</p>';
    }
    const body = this._rows
      .map((r) => {
        const enCorte = String(r.CORTE || 'NO').trim().toUpperCase() === 'SI';
        const saldo = this.saldoVale(r);
        const pendiente = saldo > 0.005;
        const estadoBadge = pendiente
          ? '<span class="badge text-bg-success">Pendiente</span>'
          : '<span class="badge text-bg-secondary">Finalizado</span>';
        const corteBadge = enCorte
          ? ` <span class="badge text-bg-light text-muted border">Corte #${this.escapeHtml(r.NOCORTE || '')}</span>`
          : '';
        return `
      <tr data-id="${this.escapeHtml(r.ID)}">
        <td>${this.escapeHtml(r.ID)}</td>
        <td>${this.formatFecha(r.FECHA)}</td>
        <td>${this.escapeHtml(r.NOMEMPLEADO || r.CODEMP)}</td>
        <td>${this.escapeHtml(r.DESCAJA || r.CODCAJA)}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.MONTO))}</td>
        <td class="text-end text-success">${this.escapeHtml(this.formatMoney(r.ABONOS))}</td>
        <td class="text-end fw-semibold text-primary">${this.escapeHtml(this.formatMoney(saldo))}</td>
        <td>${this.escapeHtml(r.DESCRIPCION || '—')}</td>
        <td>${estadoBadge}${corteBadge}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-secondary nomina-vale-print me-1" title="Imprimir vale">
            <i class="fa-solid fa-print"></i>
          </button>
          ${
            pendiente
              ? `<button type="button" class="btn btn-sm btn-outline-success nomina-vale-abonar me-1" title="Abonar">
                   <i class="fa-solid fa-dollar-sign"></i>
                 </button>`
              : ''
          }
          <button type="button" class="btn btn-sm btn-outline-secondary nomina-vale-historial me-1" title="Historial de pagos">
            <i class="fa-solid fa-clock-rotate-left"></i>
          </button>
          ${
            enCorte
              ? ''
              : `<button type="button" class="btn btn-sm btn-outline-primary nomina-vale-edit me-1" title="Editar">
                   <i class="fa-solid fa-pen"></i>
                 </button>
                 <button type="button" class="btn btn-sm btn-outline-danger nomina-vale-del" title="Eliminar">
                   <i class="fa-solid fa-trash"></i>
                 </button>`
          }
        </td>
      </tr>`;
      })
      .join('');
    return `
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>ID</th><th>Fecha</th><th>Empleado</th><th>Caja</th>
              <th class="text-end">Monto</th><th class="text-end">Abonos</th><th class="text-end">Saldo</th>
              <th>Descripción</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot>
            <tr class="table-light fw-semibold">
              <td colspan="4" class="text-end">Total período</td>
              <td class="text-end">${this.escapeHtml(this.formatMoney(this.totalMes()))}</td>
              <td class="text-end text-success">${this.escapeHtml(this.formatMoney(this.totalAbonos()))}</td>
              <td class="text-end text-primary">${this.escapeHtml(this.formatMoney(this.totalSaldo()))}</td>
              <td colspan="3"></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  renderHtml() {
    return `
      <div class="catalogo-empresa-view nomina-vales-view w-100">
        <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
          <div>
            <h5 class="mb-0">Vales a empleados</h5>
            <p class="small text-muted mb-0">Los vales restan efectivo y los abonos suman efectivo en el corte de la caja seleccionada.</p>
          </div>
        </div>
        <div class="card shadow-sm mb-3">
          <div class="card-body py-2">
            <div class="d-flex flex-wrap align-items-end gap-2">
              <div>
                <label class="form-label small mb-1" for="nomina-vale-mes">Mes</label>
                <select class="form-select form-select-sm" id="nomina-vale-mes">${this.mesOptionsHtml()}</select>
              </div>
              <div>
                <label class="form-label small mb-1" for="nomina-vale-anio">Año</label>
                <select class="form-select form-select-sm" id="nomina-vale-anio">${this.anioOptionsHtml()}</select>
              </div>
              <button type="button" class="btn btn-sm btn-outline-primary" id="nomina-vale-filtrar">
                <i class="fa-solid fa-filter me-1"></i>Filtrar
              </button>
            </div>
          </div>
        </div>
        <div class="card shadow-sm">
          <div class="card-body p-0" id="nomina-vale-table">${this.renderTable()}</div>
        </div>
        <button type="button" class="btn-onneb-nuevo-fab" id="nomina-vale-nuevo"
          aria-label="Nuevo vale" title="Nuevo vale">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>`;
  },

  refreshTable() {
    const el = this._container?.querySelector('#nomina-vale-table');
    if (el) el.innerHTML = this.renderTable();
  },

  async fetchData() {
    const data = await F.fetchJson(this.apiUrl(), { cache: 'no-store' });
    this._mes = Number(data.mes) || this._mes;
    this._anio = Number(data.anio) || this._anio;
    this._rows = data.rows || [];
    this._empleados = data.empleados || [];
    this._cajas = data.cajas || [];
    return data;
  },

  async reloadLookups() {
    const data = await F.fetchJson(
      `/api/nomina/vales/lookups?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`,
      { cache: 'no-store' }
    );
    this._empleados = data.empleados || [];
    this._cajas = data.cajas || [];
  },

  buildCajasOptions(selectedCodcaja, selectedDesc) {
    const cajas = [...this._cajas];
    const sel = selectedCodcaja != null && selectedCodcaja !== '' ? String(selectedCodcaja) : '';
    if (sel && !cajas.some((c) => String(c.CODCAJA) === sel)) {
      cajas.unshift({
        CODCAJA: selectedCodcaja,
        DESCAJA: selectedDesc || `Caja ${selectedCodcaja}`,
      });
    }
    return cajas
      .map((c) => {
        const v = String(c.CODCAJA);
        const selected = sel && v === sel ? ' selected' : '';
        return `<option value="${this.escapeHtml(v)}"${selected}>${this.escapeHtml(c.DESCAJA)} (${this.escapeHtml(v)})</option>`;
      })
      .join('');
  },

  async showValeForm(row = null) {
    const editing = Boolean(row);
    await this.reloadLookups();
    if (!editing && !this._cajas.length) {
      F.toast('No hay cajas abiertas. Abra una caja antes de registrar vales.', 'warning');
      return;
    }

    const selEmp = editing ? String(row.CODEMP) : '';
    const empleados = [...this._empleados];
    if (selEmp && !empleados.some((e) => String(e.CODEMPLEADO) === selEmp)) {
      empleados.unshift({
        CODEMPLEADO: row.CODEMP,
        NOMEMPLEADO: row.NOMEMPLEADO || `Empleado ${row.CODEMP}`,
      });
    }
    if (!empleados.length) {
      F.toast('No hay empleados activos', 'warning');
      return;
    }

    const empOpts = empleados
      .map((e) => {
        const v = String(e.CODEMPLEADO);
        const selected = selEmp && v === selEmp ? ' selected' : '';
        return `<option value="${this.escapeHtml(v)}"${selected}>${this.escapeHtml(e.NOMEMPLEADO)} (${this.escapeHtml(v)})</option>`;
      })
      .join('');
    const cajaOpts = this.buildCajasOptions(
      editing ? row.CODCAJA : '',
      editing ? row.DESCAJA : ''
    );
    if (!cajaOpts) {
      F.toast('No hay cajas disponibles', 'warning');
      return;
    }

    const fechaVal = editing ? this.fechaInputValue(row.FECHA) : this.todayIso();
    const montoVal = editing && row.MONTO != null ? String(Number(row.MONTO)) : '';
    const descVal = editing ? String(row.DESCRIPCION || '') : '';

    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: editing ? `Editar vale #${row.ID}` : 'Nuevo vale a empleado',
      width: 520,
      html: `
        <div class="text-start">
          <div class="mb-2">
            <label class="form-label small mb-0" for="nv-empleado">Empleado <span class="text-danger">*</span></label>
            <select id="nv-empleado" class="form-select form-select-sm">
              <option value="">— Seleccione —</option>
              ${empOpts}
            </select>
          </div>
          <div class="mb-2">
            <label class="form-label small mb-0" for="nv-caja">Caja <span class="text-danger">*</span></label>
            <select id="nv-caja" class="form-select form-select-sm">
              <option value="">— Seleccione —</option>
              ${cajaOpts}
            </select>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="form-label small mb-0" for="nv-fecha">Fecha</label>
              <input type="date" id="nv-fecha" class="form-control form-control-sm" value="${this.escapeHtml(fechaVal)}">
            </div>
            <div class="col-6">
              <label class="form-label small mb-0" for="nv-monto">Monto <span class="text-danger">*</span></label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">Q</span>
                <input type="number" id="nv-monto" class="form-control text-end" min="0.01" step="0.01" value="${this.escapeHtml(montoVal)}">
              </div>
            </div>
          </div>
          <div class="mb-0">
            <label class="form-label small mb-0" for="nv-desc">Descripción</label>
            <input type="text" id="nv-desc" class="form-control form-control-sm" maxlength="250" placeholder="Opcional" value="${this.escapeHtml(descVal)}">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Guardar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => document.getElementById('nv-empleado')?.focus(),
      preConfirm: () => {
        const CODEMP = document.getElementById('nv-empleado')?.value?.trim();
        const CODCAJA = document.getElementById('nv-caja')?.value?.trim();
        const FECHA = document.getElementById('nv-fecha')?.value?.trim();
        const MONTO = Number(document.getElementById('nv-monto')?.value);
        const DESCRIPCION = document.getElementById('nv-desc')?.value?.trim() || '';
        if (!CODEMP) {
          Swal.showValidationMessage('Seleccione un empleado');
          return false;
        }
        if (!CODCAJA) {
          Swal.showValidationMessage('Seleccione una caja');
          return false;
        }
        if (!Number.isFinite(MONTO) || MONTO <= 0) {
          Swal.showValidationMessage('Ingrese un monto válido');
          return false;
        }
        if (!FECHA) {
          Swal.showValidationMessage('Ingrese la fecha');
          return false;
        }
        return { CODEMP, CODCAJA, FECHA, MONTO, DESCRIPCION, USUARIO: this.usuario() };
      },
    });

    if (!result.isConfirmed || !result.value) return;
    try {
      let data;
      if (editing) {
        const params = new URLSearchParams({
          empnit: F.getEmpNit() || '',
          mes: String(this._mes),
          anio: String(this._anio),
        });
        data = await F.fetchJson(`/api/nomina/vales/${encodeURIComponent(row.ID)}?${params}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value),
        });
      } else {
        data = await F.fetchJson(this.apiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value),
        });
      }
      this._rows = data.rows || [];
      if (data.mes) this._mes = Number(data.mes);
      if (data.anio) this._anio = Number(data.anio);
      const mesEl = this._container?.querySelector('#nomina-vale-mes');
      const anioEl = this._container?.querySelector('#nomina-vale-anio');
      if (mesEl) mesEl.value = String(this._mes);
      if (anioEl) anioEl.value = String(this._anio);
      this.refreshTable();
      F.toast(editing ? 'Vale actualizado' : 'Vale registrado', 'success');
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo guardar el vale', 'error');
    }
  },

  async showNuevoForm() {
    return this.showValeForm(null);
  },

  async onAbonar(id) {
    const row = this.findRow(id);
    if (!row) {
      F.toast('Vale no encontrado', 'warning');
      return;
    }
    const saldo = this.saldoVale(row);
    if (!(saldo > 0.005)) {
      F.toast('El vale no tiene saldo pendiente', 'warning');
      return;
    }
    await this.reloadLookups();
    if (!this._cajas.length) {
      F.toast('No hay cajas abiertas. Abra una caja para registrar el abono.', 'warning');
      return;
    }
    const cajaOpts = this.buildCajasOptions(row.CODCAJA, row.DESCAJA);
    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: `Abonar vale #${row.ID}`,
      width: 440,
      html: `
        <div class="text-start">
          <p class="small text-muted mb-2">
            ${this.escapeHtml(row.NOMEMPLEADO || row.CODEMP)} · Saldo:
            <strong class="text-primary">${this.escapeHtml(this.formatMoney(saldo))}</strong>
          </p>
          <div class="mb-2">
            <label class="form-label small mb-0" for="nv-pago-caja">Caja <span class="text-danger">*</span></label>
            <select id="nv-pago-caja" class="form-select form-select-sm">
              <option value="">— Seleccione —</option>
              ${cajaOpts}
            </select>
          </div>
          <div class="mb-2">
            <label class="form-label small mb-0" for="nv-pago-fecha">Fecha del pago</label>
            <input type="date" id="nv-pago-fecha" class="form-control form-control-sm" value="${this.todayIso()}">
          </div>
          <div class="mb-0">
            <label class="form-label small mb-0" for="nv-pago-monto">Importe abonado <span class="text-danger">*</span></label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">Q</span>
              <input type="number" id="nv-pago-monto" class="form-control text-end" min="0.01" step="0.01" max="${saldo}" value="${saldo}">
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Guardar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => document.getElementById('nv-pago-caja')?.focus(),
      preConfirm: () => {
        const CODCAJA = document.getElementById('nv-pago-caja')?.value?.trim();
        const FECHA = document.getElementById('nv-pago-fecha')?.value?.trim();
        const MONTO = Number(document.getElementById('nv-pago-monto')?.value);
        if (!CODCAJA) {
          Swal.showValidationMessage('Seleccione una caja abierta');
          return false;
        }
        if (!FECHA) {
          Swal.showValidationMessage('Ingrese la fecha del pago');
          return false;
        }
        if (!Number.isFinite(MONTO) || MONTO <= 0) {
          Swal.showValidationMessage('Ingrese un importe válido');
          return false;
        }
        if (MONTO > saldo + 0.0005) {
          Swal.showValidationMessage(`El pago no puede superar el saldo (${this.formatMoney(saldo)})`);
          return false;
        }
        return { CODCAJA, FECHA, MONTO, USUARIO: this.usuario() };
      },
    });
    if (!result.isConfirmed || !result.value) return;
    try {
      const params = new URLSearchParams({
        empnit: F.getEmpNit() || '',
        mes: String(this._mes),
        anio: String(this._anio),
      });
      const data = await F.fetchJson(`/api/nomina/vales/${encodeURIComponent(id)}/pagos?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.value),
      });
      this._rows = data.rows || [];
      this.refreshTable();
      F.toast('Abono registrado', 'success');
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo registrar el abono', 'error');
    }
  },

  renderHistorialHtml(pagos) {
    if (!pagos.length) {
      return '<p class="text-muted small text-center mb-0 py-3">Sin pagos registrados</p>';
    }
    const body = pagos
      .map((p) => {
        const enCorte = String(p.CORTE || 'NO').trim().toUpperCase() === 'SI';
        return `
      <tr data-pago-id="${this.escapeHtml(p.ID)}">
        <td>${this.escapeHtml(p.ID)}</td>
        <td>${this.formatFecha(p.FECHA)}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(p.MONTO))}</td>
        <td>${enCorte ? `<span class="badge text-bg-secondary">Corte #${this.escapeHtml(p.NOCORTE || '')}</span>` : '<span class="badge text-bg-success">Pendiente</span>'}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-secondary nomina-vale-pago-print me-1" title="Imprimir abono">
            <i class="fa-solid fa-print"></i>
          </button>
          ${
            enCorte
              ? ''
              : `<button type="button" class="btn btn-sm btn-outline-danger nomina-vale-pago-del" title="Eliminar pago">
                   <i class="fa-solid fa-trash"></i>
                 </button>`
          }
        </td>
      </tr>`;
      })
      .join('');
    return `
      <div class="table-responsive" style="max-height: 360px">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th>ID</th><th>Fecha</th><th class="text-end">Importe</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  },

  async onImprimirVale(id) {
    const row = this.findRow(id);
    if (!row) {
      F.toast('Vale no encontrado', 'warning');
      return;
    }
    try {
      await NominaPrint.printValeEmpleado(row);
    } catch (err) {
      F.toast(err.message || 'No se pudo imprimir el vale', 'error');
    }
  },

  async onImprimirAbono(valeId, pagoId) {
    const vale = this.findRow(valeId);
    if (!vale) {
      F.toast('Vale no encontrado', 'warning');
      return;
    }
    try {
      const data = await F.fetchJson(
        `/api/nomina/vales/${encodeURIComponent(valeId)}/pagos?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`,
        { cache: 'no-store' }
      );
      const pago = (data.pagos || []).find((p) => String(p.ID) === String(pagoId));
      if (!pago) {
        F.toast('Abono no encontrado', 'warning');
        return;
      }
      await NominaPrint.printAbonoVale({ pago, vale });
    } catch (err) {
      F.toast(err.message || 'No se pudo imprimir el abono', 'error');
    }
  },

  async onHistorial(id) {
    const row = this.findRow(id);
    if (!row) {
      F.toast('Vale no encontrado', 'warning');
      return;
    }
    let pagos = [];
    try {
      const data = await F.fetchJson(
        `/api/nomina/vales/${encodeURIComponent(id)}/pagos?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`,
        { cache: 'no-store' }
      );
      pagos = data.pagos || [];
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo cargar el historial', 'error');
      return;
    }

    await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: `Historial de pagos · Vale #${row.ID}`,
      width: 640,
      html: `
        <p class="small text-muted text-start mb-2">
          ${this.escapeHtml(row.NOMEMPLEADO || row.CODEMP)} ·
          Abonos: <strong class="text-success">${this.escapeHtml(this.formatMoney(row.ABONOS))}</strong> ·
          Saldo: <strong class="text-primary">${this.escapeHtml(this.formatMoney(this.saldoVale(row)))}</strong>
        </p>
        <div id="nv-historial-wrap">${this.renderHistorialHtml(pagos)}</div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
      didOpen: () => {
        const wrap = document.getElementById('nv-historial-wrap');
        wrap?.addEventListener('click', async (e) => {
          const printBtn = e.target.closest('.nomina-vale-pago-print');
          if (printBtn) {
            const tr = printBtn.closest('tr[data-pago-id]');
            const pagoId = tr?.getAttribute('data-pago-id');
            if (!pagoId) return;
            try {
              await this.onImprimirAbono(id, pagoId);
            } catch (err) {
              F.toast(err.message || 'No se pudo imprimir', 'error');
            }
            return;
          }
          const btn = e.target.closest('.nomina-vale-pago-del');
          if (!btn) return;
          const tr = btn.closest('tr[data-pago-id]');
          const pagoId = tr?.getAttribute('data-pago-id');
          if (!pagoId) return;
          Swal.close();
          const ok = await CatalogosUI.fireConfirm({
            title: '¿Eliminar pago?',
            text: 'Se restará de abonos y se sumará al saldo del vale.',
            icon: 'warning',
            confirmText: 'Eliminar',
          });
          if (!ok) {
            await this.onHistorial(id);
            return;
          }
          try {
            const params = new URLSearchParams({
              empnit: F.getEmpNit() || '',
              mes: String(this._mes),
              anio: String(this._anio),
            });
            const data = await F.fetchJson(
              `/api/nomina/vales/${encodeURIComponent(id)}/pagos/${encodeURIComponent(pagoId)}?${params}`,
              { method: 'DELETE' }
            );
            this._rows = data.rows || [];
            this.refreshTable();
            F.toast('Pago eliminado', 'success');
            await this.onHistorial(id);
          } catch (err) {
            F.alert('Error', err.message || 'No se pudo eliminar el pago', 'error');
            await this.onHistorial(id);
          }
        });
      },
    });
  },

  async onEditar(id) {
    const row = this.findRow(id);
    if (!row) {
      F.toast('Vale no encontrado', 'warning');
      return;
    }
    if (String(row.CORTE || 'NO').trim().toUpperCase() === 'SI') {
      F.toast('No se puede editar un vale ya incluido en un corte', 'warning');
      return;
    }
    return this.showValeForm(row);
  },

  async onEliminar(id) {
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Eliminar vale?',
      text: 'Solo se pueden eliminar vales pendientes de corte.',
      icon: 'warning',
      confirmText: 'Eliminar',
    });
    if (!ok) return;
    try {
      const data = await F.fetchJson(
        `/api/nomina/vales/${encodeURIComponent(id)}?empnit=${encodeURIComponent(F.getEmpNit())}`,
        { method: 'DELETE' }
      );
      this._rows = data.rows || [];
      this.refreshTable();
      F.toast('Vale eliminado', 'success');
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo eliminar', 'error');
    }
  },

  bindEvents() {
    this._container?.querySelector('#nomina-vale-nuevo')?.addEventListener('click', () => {
      this.showNuevoForm().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#nomina-vale-filtrar')?.addEventListener('click', () => {
      this._mes = Number(this._container.querySelector('#nomina-vale-mes')?.value) || this._mes;
      this._anio = Number(this._container.querySelector('#nomina-vale-anio')?.value) || this._anio;
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#nomina-vale-table')?.addEventListener('click', (e) => {
      const printBtn = e.target.closest('.nomina-vale-print');
      if (printBtn) {
        const tr = printBtn.closest('tr[data-id]');
        const id = tr?.getAttribute('data-id');
        if (id) this.onImprimirVale(id).catch((err) => F.toast(err.message, 'error'));
        return;
      }
      const abonarBtn = e.target.closest('.nomina-vale-abonar');
      if (abonarBtn) {
        const tr = abonarBtn.closest('tr[data-id]');
        const id = tr?.getAttribute('data-id');
        if (id) this.onAbonar(id).catch((err) => F.toast(err.message, 'error'));
        return;
      }
      const histBtn = e.target.closest('.nomina-vale-historial');
      if (histBtn) {
        const tr = histBtn.closest('tr[data-id]');
        const id = tr?.getAttribute('data-id');
        if (id) this.onHistorial(id).catch((err) => F.toast(err.message, 'error'));
        return;
      }
      const editBtn = e.target.closest('.nomina-vale-edit');
      if (editBtn) {
        const tr = editBtn.closest('tr[data-id]');
        const id = tr?.getAttribute('data-id');
        if (id) this.onEditar(id).catch((err) => F.toast(err.message, 'error'));
        return;
      }
      const delBtn = e.target.closest('.nomina-vale-del');
      if (!delBtn) return;
      const tr = delBtn.closest('tr[data-id]');
      const id = tr?.getAttribute('data-id');
      if (id) this.onEliminar(id).catch((err) => F.toast(err.message, 'error'));
    });
  },

  async reload() {
    await this.fetchData();
    this.refreshTable();
  },

  async load(container) {
    this._container = container;
    container.className = 'main-content flex-grow-1 d-flex p-3 align-items-stretch justify-content-start';
    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-0 w-100">
          No hay empresa activa. Cierre sesión e ingrese de nuevo.
        </div>`;
      return;
    }
    container.innerHTML = `
      <div class="text-center text-muted py-5 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando vales…
      </div>`;
    try {
      await this.fetchData();
      container.innerHTML = this.renderHtml();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-0 w-100">
          ${this.escapeHtml(err.message || 'Error al cargar vales')}
        </div>`;
    }
  },
};
