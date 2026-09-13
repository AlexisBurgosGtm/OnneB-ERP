/**
 * Vista Partidas de diario manuales — alimentan Libro Diario / Mayor / Balance.
 */
const PD_MESES = [
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
];

const PD_ANIOS = [];
for (let y = 2020; y <= new Date().getFullYear() + 1; y += 1) {
  PD_ANIOS.push({ value: y, label: String(y) });
}

const PartidasDiarioView = {
  _container: null,
  _rows: [],
  _cuentas: [],
  _mes: null,
  _anio: null,
  _loading: false,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  defaultPeriod() {
    const now = new Date();
    return { mes: now.getMonth() + 1, anio: now.getFullYear() };
  },

  formatMoney(n) {
    const x = Number(n) || 0;
    return x.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  },

  formatDate(value) {
    if (!value) return '—';
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) return '—';
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  },

  toIsoDate(value) {
    if (!value) return '';
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) return '';
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  },

  apiUrl(path = '', extra = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    const params = new URLSearchParams({ empnit: emp, ...extra });
    return `/api/conta-asientos${segment}?${params}`;
  },

  emptyLine() {
    return { CODCUENTA: '', DEBE: '', HABER: '', CENTRO_COSTO: '1' };
  },

  optionsHtml(list, selected) {
    return list
      .map(
        (o) =>
          `<option value="${o.value}"${Number(selected) === Number(o.value) ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
      )
      .join('');
  },

  async loadCuentas() {
    try {
      const data = await F.fetchJson(
        `/api/nomenclatura-contable?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`,
        { cache: 'no-store' }
      );
      this._cuentas = (data.rows || data || []).filter(
        (c) => String(c.PD || '').toUpperCase() !== 'P' && String(c.ACTIVO || 'SI').toUpperCase() !== 'NO'
      );
    } catch (_) {
      this._cuentas = [];
    }
  },

  load(container) {
    this._container = container;
    const def = this.defaultPeriod();
    this._mes = def.mes;
    this._anio = def.anio;
    this._rows = [];
    this.reloadList();
  },

  async reloadList() {
    if (!this._container) return;
    this._loading = true;
    this.render();
    try {
      await this.loadCuentas();
      const data = await F.fetchJson(
        this.apiUrl('', { mes: this._mes, anio: this._anio, _: Date.now() }),
        { cache: 'no-store' }
      );
      this._rows = data.rows || [];
    } catch (err) {
      this._rows = [];
      F.toast(err.message || 'Error al cargar partidas', 'error');
    } finally {
      this._loading = false;
      this.render();
    }
  },

  render() {
    if (!this._container) return;
    const rowsHtml = this._loading
      ? `<tr><td colspan="7" class="text-center text-muted py-4">Cargando…</td></tr>`
      : this._rows.length
        ? this._rows
            .map((r) => {
              const anulado = !!r.ANULADO || String(r.STATUS).toUpperCase() === 'A';
              return `<tr class="${anulado ? 'table-secondary text-muted' : ''}" data-id="${r.ID}">
                <td class="text-center">${this.escapeHtml(r.CORRELATIVO)}</td>
                <td>${this.escapeHtml(this.formatDate(r.FECHA))}</td>
                <td>${this.escapeHtml(r.GLOSA || '—')}</td>
                <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTAL_DEBE))}</td>
                <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTAL_HABER))}</td>
                <td class="text-center">${anulado ? '<span class="badge text-bg-secondary">Anulada</span>' : '<span class="badge text-bg-success">Activa</span>'}</td>
                <td class="text-end text-nowrap">
                  <button type="button" class="btn btn-sm btn-outline-primary pd-btn-edit" data-id="${r.ID}" ${anulado ? 'disabled' : ''} title="Editar">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-warning pd-btn-anular" data-id="${r.ID}" ${anulado ? 'disabled' : ''} title="Anular">
                    <i class="fa-solid fa-ban"></i>
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-danger pd-btn-del" data-id="${r.ID}" title="Eliminar">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </td>
              </tr>`;
            })
            .join('')
        : `<tr><td colspan="7" class="text-center text-muted py-4">No hay partidas en el período</td></tr>`;

    this._container.innerHTML = `
      <div class="partidas-diario-wrap w-100">
        <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
          <div>
            <h5 class="mb-1"><i class="fa-solid fa-pen-to-square me-2 text-primary"></i>Partidas de diario</h5>
            <p class="small text-muted mb-0">Asientos manuales que se integran al Libro Diario, Mayor y Balance.</p>
          </div>
          <div class="d-flex flex-wrap align-items-end gap-2">
            <div>
              <label class="form-label small mb-0" for="pd-mes">Mes</label>
              <select id="pd-mes" class="form-select form-select-sm">${this.optionsHtml(PD_MESES, this._mes)}</select>
            </div>
            <div>
              <label class="form-label small mb-0" for="pd-anio">Año</label>
              <select id="pd-anio" class="form-select form-select-sm">${this.optionsHtml(PD_ANIOS, this._anio)}</select>
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="pd-btn-refresh">
              <i class="fa-solid fa-rotate me-1"></i>Actualizar
            </button>
            <button type="button" class="btn btn-sm btn-primary" id="pd-btn-nuevo">
              <i class="fa-solid fa-plus me-1"></i>Nueva partida
            </button>
          </div>
        </div>
        <div class="card shadow-sm">
          <div class="table-responsive">
            <table class="table table-sm table-hover mb-0 align-middle">
              <thead class="table-light">
                <tr>
                  <th class="text-center">No.</th>
                  <th>Fecha</th>
                  <th>Glosa</th>
                  <th class="text-end">Debe</th>
                  <th class="text-end">Haber</th>
                  <th class="text-center">Estado</th>
                  <th class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    this.bindList();
  },

  bindList() {
    const mes = this._container.querySelector('#pd-mes');
    const anio = this._container.querySelector('#pd-anio');
    mes?.addEventListener('change', () => {
      this._mes = Number(mes.value);
      this.reloadList();
    });
    anio?.addEventListener('change', () => {
      this._anio = Number(anio.value);
      this.reloadList();
    });
    this._container.querySelector('#pd-btn-refresh')?.addEventListener('click', () => this.reloadList());
    this._container.querySelector('#pd-btn-nuevo')?.addEventListener('click', () => this.openEditor(null));
    this._container.querySelectorAll('.pd-btn-edit').forEach((btn) => {
      btn.addEventListener('click', () => this.openEditor(Number(btn.dataset.id)));
    });
    this._container.querySelectorAll('.pd-btn-anular').forEach((btn) => {
      btn.addEventListener('click', () => this.anular(Number(btn.dataset.id)));
    });
    this._container.querySelectorAll('.pd-btn-del').forEach((btn) => {
      btn.addEventListener('click', () => this.eliminar(Number(btn.dataset.id)));
    });
  },

  cuentaOptions(selected) {
    const sel = String(selected || '').trim();
    const opts = [`<option value="">— Cuenta —</option>`];
    (this._cuentas || []).forEach((c) => {
      const cod = String(c.CODCUENTA || '').trim();
      const label = `${cod} — ${c.DESCRIPCION || ''}`.trim();
      opts.push(
        `<option value="${this.escapeHtml(cod)}"${cod === sel ? ' selected' : ''}>${this.escapeHtml(label)}</option>`
      );
    });
    if (sel && !(this._cuentas || []).some((c) => String(c.CODCUENTA).trim() === sel)) {
      opts.push(`<option value="${this.escapeHtml(sel)}" selected>${this.escapeHtml(sel)}</option>`);
    }
    return opts.join('');
  },

  lineRowHtml(line, idx) {
    return `<tr data-line-idx="${idx}">
      <td>
        <select class="form-select form-select-sm pd-line-cuenta">${this.cuentaOptions(line.CODCUENTA)}</select>
      </td>
      <td><input type="number" min="0" step="0.001" class="form-control form-control-sm text-end pd-line-debe" value="${this.escapeHtml(line.DEBE === 0 || line.DEBE === '0' ? '' : line.DEBE)}"></td>
      <td><input type="number" min="0" step="0.001" class="form-control form-control-sm text-end pd-line-haber" value="${this.escapeHtml(line.HABER === 0 || line.HABER === '0' ? '' : line.HABER)}"></td>
      <td><input type="text" class="form-control form-control-sm pd-line-cc" value="${this.escapeHtml(line.CENTRO_COSTO || '1')}"></td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-outline-danger pd-line-del" title="Quitar línea"><i class="fa-solid fa-xmark"></i></button>
      </td>
    </tr>`;
  },

  async openEditor(id) {
    let header = {
      FECHA: this.toIsoDate(new Date()),
      GLOSA: '',
      LINEAS: [this.emptyLine(), this.emptyLine()],
    };
    if (id) {
      try {
        const row = await F.fetchJson(this.apiUrl(`/${id}`, { _: Date.now() }), { cache: 'no-store' });
        header = {
          ID: row.ID,
          FECHA: this.toIsoDate(row.FECHA),
          GLOSA: row.GLOSA || '',
          LINEAS: (row.LINEAS || []).map((l) => ({
            CODCUENTA: l.CODCUENTA || '',
            DEBE: l.DEBE || '',
            HABER: l.HABER || '',
            CENTRO_COSTO: l.CENTRO_COSTO || '1',
          })),
        };
        if (header.LINEAS.length < 2) header.LINEAS.push(this.emptyLine());
      } catch (err) {
        F.toast(err.message || 'No se pudo abrir la partida', 'error');
        return;
      }
    }

    const isEdit = !!header.ID;
    const html = `
      <div class="pd-editor text-start">
        <div class="row g-2 mb-2">
          <div class="col-md-4">
            <label class="form-label small mb-0">Fecha</label>
            <input type="date" id="pd-ed-fecha" class="form-control form-control-sm" value="${this.escapeHtml(header.FECHA)}">
          </div>
          <div class="col-md-8">
            <label class="form-label small mb-0">Glosa</label>
            <input type="text" id="pd-ed-glosa" class="form-control form-control-sm" maxlength="500" value="${this.escapeHtml(header.GLOSA)}" placeholder="Descripción del asiento">
          </div>
        </div>
        <div class="table-responsive mb-2">
          <table class="table table-sm align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Cuenta</th>
                <th style="width:7rem">Debe</th>
                <th style="width:7rem">Haber</th>
                <th style="width:5rem">C.C.</th>
                <th style="width:2.5rem"></th>
              </tr>
            </thead>
            <tbody id="pd-ed-lines">
              ${header.LINEAS.map((l, i) => this.lineRowHtml(l, i)).join('')}
            </tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center mb-2">
          <button type="button" class="btn btn-sm btn-outline-secondary" id="pd-ed-add-line">
            <i class="fa-solid fa-plus me-1"></i>Línea
          </button>
          <div class="small" id="pd-ed-sum">Debe: 0.00 · Haber: 0.00</div>
        </div>
      </div>
    `;

    const result = await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: isEdit ? `Editar partida ASM-${header.ID}` : 'Nueva partida de diario',
      html,
      width: 820,
      showCancelButton: true,
      confirmButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.guardarButtonHtml('Guardar') : 'Guardar',
      cancelButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.cancelButtonHtml('Cancelar') : 'Cancelar',
      focusConfirm: false,
      didOpen: () => {
        const popup = Swal.getPopup();
        const refreshSum = () => {
          let debe = 0;
          let haber = 0;
          popup.querySelectorAll('#pd-ed-lines tr').forEach((tr) => {
            debe += Number(tr.querySelector('.pd-line-debe')?.value) || 0;
            haber += Number(tr.querySelector('.pd-line-haber')?.value) || 0;
          });
          const ok =
            typeof FpagoMatch !== 'undefined'
              ? FpagoMatch.fpagoAmountsMatch(debe, haber)
              : Math.abs(debe - haber) <= 0.01;
          const el = popup.querySelector('#pd-ed-sum');
          if (el) {
            el.innerHTML = `Debe: <strong>${this.formatMoney(debe)}</strong> · Haber: <strong>${this.formatMoney(haber)}</strong>${
              ok && debe > 0 ? ' <span class="text-success">✓</span>' : ' <span class="text-danger">no cuadra</span>'
            }`;
          }
        };
        const bindRow = (tr) => {
          tr.querySelector('.pd-line-debe')?.addEventListener('input', (e) => {
            if (Number(e.target.value) > 0) tr.querySelector('.pd-line-haber').value = '';
            refreshSum();
          });
          tr.querySelector('.pd-line-haber')?.addEventListener('input', (e) => {
            if (Number(e.target.value) > 0) tr.querySelector('.pd-line-debe').value = '';
            refreshSum();
          });
          tr.querySelector('.pd-line-del')?.addEventListener('click', () => {
            const tbody = popup.querySelector('#pd-ed-lines');
            if (tbody.querySelectorAll('tr').length <= 2) {
              F.toast('Mínimo dos líneas', 'warning');
              return;
            }
            tr.remove();
            refreshSum();
          });
        };
        popup.querySelectorAll('#pd-ed-lines tr').forEach(bindRow);
        popup.querySelector('#pd-ed-add-line')?.addEventListener('click', () => {
          const tbody = popup.querySelector('#pd-ed-lines');
          const idx = tbody.querySelectorAll('tr').length;
          tbody.insertAdjacentHTML('beforeend', this.lineRowHtml(this.emptyLine(), idx));
          bindRow(tbody.lastElementChild);
          refreshSum();
        });
        refreshSum();
      },
      preConfirm: () => {
        const popup = Swal.getPopup();
        const fecha = popup.querySelector('#pd-ed-fecha')?.value;
        const glosa = popup.querySelector('#pd-ed-glosa')?.value?.trim() || '';
        if (!fecha) {
          Swal.showValidationMessage('Indique la fecha');
          return false;
        }
        const lineas = [];
        popup.querySelectorAll('#pd-ed-lines tr').forEach((tr) => {
          const CODCUENTA = tr.querySelector('.pd-line-cuenta')?.value?.trim() || '';
          const DEBE = Number(tr.querySelector('.pd-line-debe')?.value) || 0;
          const HABER = Number(tr.querySelector('.pd-line-haber')?.value) || 0;
          const CENTRO_COSTO = tr.querySelector('.pd-line-cc')?.value?.trim() || '1';
          if (!CODCUENTA && DEBE === 0 && HABER === 0) return;
          lineas.push({ CODCUENTA, DEBE, HABER, CENTRO_COSTO });
        });
        if (lineas.length < 2) {
          Swal.showValidationMessage('Indique al menos dos líneas con cuenta y monto');
          return false;
        }
        const sumD = lineas.reduce((s, l) => s + (Number(l.DEBE) || 0), 0);
        const sumH = lineas.reduce((s, l) => s + (Number(l.HABER) || 0), 0);
        const ok =
          typeof FpagoMatch !== 'undefined'
            ? FpagoMatch.fpagoAmountsMatch(sumD, sumH)
            : Math.abs(sumD - sumH) <= 0.01;
        if (!ok || sumD <= 0) {
          Swal.showValidationMessage('La partida debe cuadrar (Debe = Haber)');
          return false;
        }
        return { FECHA: fecha, GLOSA: glosa, LINEAS: lineas };
      },
    });

    if (!result.isConfirmed || !result.value) return;
    try {
      if (isEdit) {
        await F.fetchJson(this.apiUrl(`/${header.ID}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value),
        });
        F.toast('Partida actualizada', 'success');
      } else {
        await F.fetchJson(this.apiUrl(''), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value),
        });
        F.toast('Partida creada', 'success');
      }
      const d = result.value.FECHA.slice(0, 10).split('-');
      this._mes = Number(d[1]);
      this._anio = Number(d[0]);
      await this.reloadList();
    } catch (err) {
      F.toast(err.message || 'No se pudo guardar', 'error');
    }
  },

  async anular(id) {
    const ok =
      typeof CatalogosUI !== 'undefined' && CatalogosUI.fireConfirm
        ? await CatalogosUI.fireConfirm({
            title: '¿Anular partida?',
            text: 'Seguirá visible en el diario con montos en cero.',
          })
        : window.confirm('¿Anular partida?');
    if (!ok) return;
    try {
      await F.fetchJson(this.apiUrl(`/${id}/anular`), { method: 'POST' });
      F.toast('Partida anulada', 'success');
      await this.reloadList();
    } catch (err) {
      F.toast(err.message || 'No se pudo anular', 'error');
    }
  },

  async eliminar(id) {
    const ok =
      typeof CatalogosUI !== 'undefined' && CatalogosUI.fireConfirm
        ? await CatalogosUI.fireConfirm({
            title: '¿Eliminar partida?',
            text: 'Se borrará definitivamente del sistema.',
          })
        : window.confirm('¿Eliminar partida?');
    if (!ok) return;
    try {
      await F.fetchJson(this.apiUrl(`/${id}`), { method: 'DELETE' });
      F.toast('Partida eliminada', 'success');
      await this.reloadList();
    } catch (err) {
      F.toast(err.message || 'No se pudo eliminar', 'error');
    }
  },
};
