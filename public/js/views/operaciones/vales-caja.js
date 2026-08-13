/**
 * Operaciones — Vales de Caja (DOCUMENTOS_VALES_CAJA).
 * Salidas de efectivo desde cajas abiertas; restan en el corte de caja.
 */
const ValesCajaView = {
  _container: null,
  _rows: [],
  _cajas: [],
  _tipos: [],
  _cajaDefault: null,
  _limitaEfectivoDisponible: false,
  _mes: new Date().getMonth() + 1,
  _anio: new Date().getFullYear(),

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

  todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  apiUrl(extra = {}) {
    const codempleado = F.sessionCodEmpleado();
    const params = new URLSearchParams({
      empnit: F.getEmpNit() || '',
      mes: String(this._mes),
      anio: String(this._anio),
      _: String(Date.now()),
      ...(codempleado != null ? { codempleado: String(codempleado) } : {}),
      ...extra,
    });
    return `/api/vales-caja?${params}`;
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
    return this._rows.reduce((acc, r) => acc + (Number(r.IMPORTE) || 0), 0);
  },

  findRow(novale) {
    return this._rows.find((r) => String(r.NOVALE) === String(novale)) || null;
  },

  renderTable() {
    if (!this._rows.length) {
      return '<p class="text-center text-muted py-4 mb-0">No hay vales de caja en el período seleccionado</p>';
    }
    const body = this._rows
      .map((r) => {
        const enCorte = String(r.CORTE || 'NO').trim().toUpperCase() === 'SI';
        const corteBadge = enCorte
          ? ` <span class="badge text-bg-light text-muted border">Corte #${this.escapeHtml(r.NOCORTE || '')}</span>`
          : '<span class="badge text-bg-success">Pendiente</span>';
        return `
      <tr data-novale="${this.escapeHtml(r.NOVALE)}">
        <td>${this.escapeHtml(r.NOVALE)}</td>
        <td>${this.formatFecha(r.FECHA)}</td>
        <td>${this.escapeHtml(r.DESCAJA || r.CODCAJA)}</td>
        <td>${this.escapeHtml(r.TIPO || '—')}</td>
        <td>${this.escapeHtml(r.RECIBE || '—')}</td>
        <td>${this.escapeHtml(r.DESCRIPCION || '—')}</td>
        <td class="text-end fw-semibold text-danger">${this.escapeHtml(this.formatMoney(r.IMPORTE))}</td>
        <td>${corteBadge}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-secondary vales-caja-print me-1" title="Imprimir">
            <i class="fa-solid fa-print"></i>
          </button>
          ${
            enCorte
              ? ''
              : `<button type="button" class="btn btn-sm btn-outline-primary vales-caja-edit me-1" title="Editar">
                   <i class="fa-solid fa-pen"></i>
                 </button>
                 <button type="button" class="btn btn-sm btn-outline-danger vales-caja-del" title="Eliminar">
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
              <th>#</th><th>Fecha</th><th>Caja</th><th>Tipo</th><th>Recibe</th>
              <th>Descripción</th><th class="text-end">Importe</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot>
            <tr class="table-light fw-semibold">
              <td colspan="6" class="text-end">Total período</td>
              <td class="text-end text-danger">${this.escapeHtml(this.formatMoney(this.totalMes()))}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  renderHtml() {
    return `
      <div class="catalogo-empresa-view vales-caja-view w-100">
        <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
          <div>
            <h5 class="mb-0">Vales de Caja</h5>
            <p class="small text-muted mb-0">
              Gastos en efectivo de cajas abiertas. Restan del efectivo esperado en el corte de caja.
            </p>
          </div>
        </div>
        <div class="card shadow-sm mb-3">
          <div class="card-body py-2">
            <div class="d-flex flex-wrap align-items-end gap-2">
              <div>
                <label class="form-label small mb-1" for="vales-caja-mes">Mes</label>
                <select class="form-select form-select-sm" id="vales-caja-mes">${this.mesOptionsHtml()}</select>
              </div>
              <div>
                <label class="form-label small mb-1" for="vales-caja-anio">Año</label>
                <select class="form-select form-select-sm" id="vales-caja-anio">${this.anioOptionsHtml()}</select>
              </div>
              <button type="button" class="btn btn-sm btn-outline-primary" id="vales-caja-filtrar">
                <i class="fa-solid fa-filter me-1"></i>Filtrar
              </button>
            </div>
          </div>
        </div>
        <div class="card shadow-sm">
          <div class="card-body p-0" id="vales-caja-table">${this.renderTable()}</div>
        </div>
        <button type="button" class="btn-onneb-nuevo-fab" id="vales-caja-nuevo"
          aria-label="Nuevo vale de caja" title="Nuevo vale de caja">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>`;
  },

  refreshTable() {
    const el = this._container?.querySelector('#vales-caja-table');
    if (el) el.innerHTML = this.renderTable();
  },

  async fetchData() {
    const data = await F.fetchJson(this.apiUrl(), { cache: 'no-store' });
    this._mes = Number(data.mes) || this._mes;
    this._anio = Number(data.anio) || this._anio;
    this._rows = data.rows || [];
    this._cajas = data.cajas || [];
    this._tipos = data.tipos || data.tiposComunes || [];
    this._cajaDefault = data.cajaDefault ?? data.preferredCaja ?? null;
    this._limitaEfectivoDisponible = Boolean(data.limitaEfectivoDisponible);
    return data;
  },

  async reloadLookups() {
    const codempleado = F.sessionCodEmpleado();
    const params = new URLSearchParams({ empnit: F.getEmpNit(), _: String(Date.now()) });
    if (codempleado != null) params.set('codempleado', String(codempleado));
    const data = await F.fetchJson(`/api/vales-caja/lookups?${params}`, { cache: 'no-store' });
    this._cajas = data.cajas || [];
    this._tipos = data.tipos || data.tiposComunes || [];
    this._cajaDefault = data.cajaDefault ?? data.preferredCaja ?? null;
    this._limitaEfectivoDisponible = Boolean(data.limitaEfectivoDisponible);
  },

  buildCajasOptions(selectedCodcaja, selectedDesc) {
    const cajas = [...this._cajas];
    const sel =
      selectedCodcaja != null && selectedCodcaja !== ''
        ? String(selectedCodcaja)
        : F.pickCajaDefault(cajas, this._cajaDefault);
    if (sel && !cajas.some((c) => String(c.CODCAJA) === sel)) {
      cajas.unshift({
        CODCAJA: selectedCodcaja || sel,
        DESCAJA: selectedDesc || `Caja ${selectedCodcaja || sel}`,
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

  tiposDatalistHtml() {
    return (this._tipos || [])
      .map((t) => `<option value="${this.escapeHtml(t)}"></option>`)
      .join('');
  },

  async showValeForm(row = null) {
    const editing = Boolean(row);
    await this.reloadLookups();
    if (!editing && !this._cajas.length) {
      F.toast('No hay cajas abiertas. Abra una caja antes de registrar vales.', 'warning');
      return;
    }

    const cajaOpts = this.buildCajasOptions(
      editing ? row.CODCAJA : '',
      editing ? row.DESCAJA : ''
    );
    if (!cajaOpts) {
      F.toast('No hay cajas disponibles', 'warning');
      return;
    }

    const fechaVal = editing ? this.fechaInputValue(row.FECHA) : this.todayIso();
    const importeVal = editing && row.IMPORTE != null ? String(Number(row.IMPORTE)) : '';
    const tipoVal = editing ? String(row.TIPO || '') : '';
    const descVal = editing ? String(row.DESCRIPCION || '') : '';
    const recibeVal = editing ? String(row.RECIBE || '') : '';
    const limita = this._limitaEfectivoDisponible;

    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: editing ? `Editar vale #${row.NOVALE}` : 'Nuevo vale de caja',
      width: 520,
      html: `
        <div class="text-start">
          <div class="mb-2">
            <label class="form-label small mb-0" for="vc-caja">Caja <span class="text-danger">*</span></label>
            <select id="vc-caja" class="form-select form-select-sm">
              <option value="">— Seleccione —</option>
              ${cajaOpts}
            </select>
            <div class="form-text${limita ? '' : ' d-none'}" id="vc-tope-hint">Tope: efectivo inicial de la caja.</div>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="form-label small mb-0" for="vc-fecha">Fecha</label>
              <input type="date" id="vc-fecha" class="form-control form-control-sm" value="${this.escapeHtml(fechaVal)}">
            </div>
            <div class="col-6">
              <label class="form-label small mb-0" for="vc-importe">Importe (efectivo) <span class="text-danger">*</span></label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">Q</span>
                <input type="number" id="vc-importe" class="form-control text-end" min="0.01" step="0.01" value="${this.escapeHtml(importeVal)}">
              </div>
            </div>
          </div>
          <div class="mb-2">
            <label class="form-label small mb-0" for="vc-tipo">Tipo <span class="text-danger">*</span></label>
            <input type="text" id="vc-tipo" class="form-control form-control-sm" list="vc-tipo-list"
              maxlength="150" placeholder="Seleccione o escriba" value="${this.escapeHtml(tipoVal)}" autocomplete="off">
            <datalist id="vc-tipo-list">${this.tiposDatalistHtml()}</datalist>
          </div>
          <div class="mb-2">
            <label class="form-label small mb-0" for="vc-recibe">Recibe <span class="text-danger">*</span></label>
            <input type="text" id="vc-recibe" class="form-control form-control-sm" maxlength="150"
              placeholder="Nombre de quien recibe el efectivo" value="${this.escapeHtml(recibeVal)}">
          </div>
          <div class="mb-0">
            <label class="form-label small mb-0" for="vc-desc">Descripción <span class="text-danger">*</span></label>
            <input type="text" id="vc-desc" class="form-control form-control-sm" maxlength="250"
              placeholder="Detalle del gasto" value="${this.escapeHtml(descVal)}">
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Guardar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        const cajaEl = document.getElementById('vc-caja');
        const importeEl = document.getElementById('vc-importe');
        const hintEl = document.getElementById('vc-tope-hint');
        const syncTope = () => {
          if (!limita || !cajaEl || !importeEl || !hintEl) return;
          const caja = this._cajas.find((c) => String(c.CODCAJA) === String(cajaEl.value));
          const tope = Number(caja?.EFECTIVOINICIAL);
          if (caja && Number.isFinite(tope)) {
            importeEl.max = String(tope);
            hintEl.textContent = `Tope: efectivo inicial ${this.formatMoney(tope)}.`;
            hintEl.classList.remove('d-none');
          } else {
            importeEl.removeAttribute('max');
            hintEl.textContent = 'Tope: efectivo inicial de la caja.';
          }
        };
        cajaEl?.addEventListener('change', syncTope);
        syncTope();
        cajaEl?.focus();
      },
      preConfirm: () => {
        const CODCAJA = document.getElementById('vc-caja')?.value?.trim();
        const FECHA = document.getElementById('vc-fecha')?.value?.trim();
        const IMPORTE = Number(document.getElementById('vc-importe')?.value);
        const TIPO = document.getElementById('vc-tipo')?.value?.trim() || '';
        const RECIBE = document.getElementById('vc-recibe')?.value?.trim() || '';
        const DESCRIPCION = document.getElementById('vc-desc')?.value?.trim() || '';
        if (!CODCAJA) {
          Swal.showValidationMessage('Seleccione una caja');
          return false;
        }
        if (!Number.isFinite(IMPORTE) || IMPORTE <= 0) {
          Swal.showValidationMessage('Ingrese un importe válido');
          return false;
        }
        if (limita) {
          const caja = this._cajas.find((c) => String(c.CODCAJA) === String(CODCAJA));
          const tope = Number(caja?.EFECTIVOINICIAL);
          if (Number.isFinite(tope) && IMPORTE - tope > 0.0005) {
            Swal.showValidationMessage(
              `El importe supera el efectivo inicial (${this.formatMoney(tope)})`
            );
            return false;
          }
        }
        if (!FECHA) {
          Swal.showValidationMessage('Ingrese la fecha');
          return false;
        }
        if (!TIPO) {
          Swal.showValidationMessage('Indique el tipo');
          return false;
        }
        if (!RECIBE) {
          Swal.showValidationMessage('Indique quién recibe');
          return false;
        }
        if (!DESCRIPCION) {
          Swal.showValidationMessage('Indique la descripción');
          return false;
        }
        return { CODCAJA, FECHA, IMPORTE, TIPO, RECIBE, DESCRIPCION };
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
        data = await F.fetchJson(`/api/vales-caja/${encodeURIComponent(row.NOVALE)}?${params}`, {
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
      const mesEl = this._container?.querySelector('#vales-caja-mes');
      const anioEl = this._container?.querySelector('#vales-caja-anio');
      if (mesEl) mesEl.value = String(this._mes);
      if (anioEl) anioEl.value = String(this._anio);
      this.refreshTable();
      F.toast(editing ? 'Vale actualizado' : 'Vale registrado', 'success');
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo guardar el vale', 'error');
    }
  },

  async printVale(row) {
    if (!row || typeof NominaPrint === 'undefined') {
      F.toast('Impresión no disponible', 'warning');
      return;
    }
    try {
      await NominaPrint.printValeCaja(row);
    } catch (err) {
      F.toast(err.message || 'No se pudo imprimir', 'error');
    }
  },

  async onDelete(novale) {
    const row = this.findRow(novale);
    if (!row) return;
    const label = `VC #${novale}`;
    const pass = await CatalogosUI.confirmEliminarDocumento({
      label,
      tipo: 'vale de caja',
      kind: 'documento',
      coddoc: 'VC',
      correlativo: novale,
      tipodoc: 'VALES_CAJA',
    });
    if (!pass) return;
    try {
      const data = await F.fetchJson(
        `/api/vales-caja/${encodeURIComponent(novale)}?empnit=${encodeURIComponent(F.getEmpNit() || '')}&mes=${this._mes}&anio=${this._anio}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pass: String(pass),
            USUARIO: String(F.session('user')?.usuario || '').trim() || undefined,
          }),
        }
      );
      this._rows = data.rows || [];
      this.refreshTable();
      F.toast('Vale eliminado', 'success');
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo eliminar', 'error');
    }
  },

  bindEvents() {
    this._container?.querySelector('#vales-caja-filtrar')?.addEventListener('click', async () => {
      const mes = parseInt(this._container.querySelector('#vales-caja-mes')?.value, 10);
      const anio = parseInt(this._container.querySelector('#vales-caja-anio')?.value, 10);
      if (Number.isFinite(mes)) this._mes = mes;
      if (Number.isFinite(anio)) this._anio = anio;
      try {
        await this.fetchData();
        this.refreshTable();
      } catch (err) {
        F.toast(err.message || 'No se pudo filtrar', 'error');
      }
    });
    this._container?.querySelector('#vales-caja-nuevo')?.addEventListener('click', () => {
      this.showValeForm(null);
    });
    this._container?.querySelector('#vales-caja-table')?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-novale]');
      if (!tr) return;
      const novale = tr.getAttribute('data-novale');
      if (e.target.closest('.vales-caja-print')) {
        const row = this.findRow(novale);
        if (row) this.printVale(row);
        return;
      }
      if (e.target.closest('.vales-caja-edit')) {
        const row = this.findRow(novale);
        if (row) this.showValeForm(row);
        return;
      }
      if (e.target.closest('.vales-caja-del')) {
        this.onDelete(novale);
      }
    });
  },

  async load(container) {
    this._container = container;
    container.innerHTML = '<p class="text-muted p-3">Cargando vales de caja…</p>';
    try {
      await this.fetchData();
      container.innerHTML = this.renderHtml();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger m-3">${this.escapeHtml(err.message || 'Error')}</div>`;
    }
  },
};
