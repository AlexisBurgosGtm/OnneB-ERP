/**
 * Vista compartida: registros manuales de Libro Ventas / Libro Compras.
 */
const LM_MESES = [
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

const LM_ANIOS = [];
for (let y = 2020; y <= new Date().getFullYear() + 1; y += 1) {
  LM_ANIOS.push({ value: y, label: String(y) });
}

function createLibrosManualesView(config) {
  const libro = config.libro; // 'V' | 'C'
  const title = config.title;
  const subtitle = config.subtitle;

  return {
    _container: null,
    _rows: [],
    _tipodocs: config.tipodocs || [],
    _mes: null,
    _anio: null,
    _loading: false,
    libro,
    title,

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
      const params = new URLSearchParams({ empnit: emp, libro: this.libro, ...extra });
      return `/api/conta-libros-manual${segment}?${params}`;
    },

    optionsHtml(list, selected) {
      return list
        .map(
          (o) =>
            `<option value="${o.value}"${Number(selected) === Number(o.value) || String(selected) === String(o.value) ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
        )
        .join('');
    },

    tipodocOptions(selected) {
      return this.optionsHtml(
        (this._tipodocs || []).map((t) => ({ value: t, label: t })),
        selected
      );
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
        const data = await F.fetchJson(
          this.apiUrl('', { mes: this._mes, anio: this._anio, _: Date.now() }),
          { cache: 'no-store' }
        );
        this._rows = data.rows || [];
        if (Array.isArray(data.tipodocs) && data.tipodocs.length) {
          this._tipodocs = data.tipodocs;
        }
      } catch (err) {
        this._rows = [];
        F.toast(err.message || 'Error al cargar', 'error');
      } finally {
        this._loading = false;
        this.render();
      }
    },

    render() {
      if (!this._container) return;
      const rowsHtml = this._loading
        ? `<tr><td colspan="9" class="text-center text-muted py-4">Cargando…</td></tr>`
        : this._rows.length
          ? this._rows
              .map((r) => {
                const anulado = !!r.ANULADO || String(r.STATUS).toUpperCase() === 'A';
                return `<tr class="${anulado ? 'table-secondary text-muted' : ''}">
                  <td class="text-center">${this.escapeHtml(r.CORRELATIVO)}</td>
                  <td>${this.escapeHtml(this.formatDate(r.FECHA))}</td>
                  <td>${this.escapeHtml(r.TIPODOC)}</td>
                  <td>${this.escapeHtml(r.SERIE || '—')} / ${this.escapeHtml(r.NUMERO || '—')}</td>
                  <td>${this.escapeHtml(r.NIT || '—')}</td>
                  <td>${this.escapeHtml(r.NOMBRE || '—')}</td>
                  <td class="text-end">${this.escapeHtml(this.formatMoney(Number(r.TOTAL_PRODUCTOS) + Number(r.TOTAL_SERVICIOS)))}</td>
                  <td class="text-center">${anulado ? '<span class="badge text-bg-secondary">Anulado</span>' : '<span class="badge text-bg-success">Activo</span>'}</td>
                  <td class="text-end text-nowrap">
                    <button type="button" class="btn btn-sm btn-outline-primary lm-btn-edit" data-id="${r.ID}" ${anulado ? 'disabled' : ''}><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="btn btn-sm btn-outline-warning lm-btn-anular" data-id="${r.ID}" ${anulado ? 'disabled' : ''}><i class="fa-solid fa-ban"></i></button>
                    <button type="button" class="btn btn-sm btn-outline-danger lm-btn-del" data-id="${r.ID}"><i class="fa-solid fa-trash"></i></button>
                  </td>
                </tr>`;
              })
              .join('')
          : `<tr><td colspan="9" class="text-center text-muted py-4">No hay registros manuales en el período</td></tr>`;

      this._container.innerHTML = `
        <div class="libros-manuales-wrap w-100">
          <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
            <div>
              <h5 class="mb-1"><i class="fa-solid fa-file-invoice me-2 text-primary"></i>${this.escapeHtml(title)}</h5>
              <p class="small text-muted mb-0">${this.escapeHtml(subtitle)}</p>
            </div>
            <div class="d-flex flex-wrap align-items-end gap-2">
              <div>
                <label class="form-label small mb-0" for="lm-mes">Mes</label>
                <select id="lm-mes" class="form-select form-select-sm">${this.optionsHtml(LM_MESES, this._mes)}</select>
              </div>
              <div>
                <label class="form-label small mb-0" for="lm-anio">Año</label>
                <select id="lm-anio" class="form-select form-select-sm">${this.optionsHtml(LM_ANIOS, this._anio)}</select>
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="lm-btn-refresh"><i class="fa-solid fa-rotate me-1"></i>Actualizar</button>
              <button type="button" class="btn btn-sm btn-primary" id="lm-btn-nuevo"><i class="fa-solid fa-plus me-1"></i>Nuevo</button>
            </div>
          </div>
          <div class="card shadow-sm">
            <div class="table-responsive">
              <table class="table table-sm table-hover mb-0 align-middle">
                <thead class="table-light">
                  <tr>
                    <th class="text-center">No.</th>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Serie / Número</th>
                    <th>NIT</th>
                    <th>Nombre</th>
                    <th class="text-end">Total</th>
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
      const mes = this._container.querySelector('#lm-mes');
      const anio = this._container.querySelector('#lm-anio');
      mes?.addEventListener('change', () => {
        this._mes = Number(mes.value);
        this.reloadList();
      });
      anio?.addEventListener('change', () => {
        this._anio = Number(anio.value);
        this.reloadList();
      });
      this._container.querySelector('#lm-btn-refresh')?.addEventListener('click', () => this.reloadList());
      this._container.querySelector('#lm-btn-nuevo')?.addEventListener('click', () => this.openEditor(null));
      this._container.querySelectorAll('.lm-btn-edit').forEach((btn) => {
        btn.addEventListener('click', () => this.openEditor(Number(btn.dataset.id)));
      });
      this._container.querySelectorAll('.lm-btn-anular').forEach((btn) => {
        btn.addEventListener('click', () => this.anular(Number(btn.dataset.id)));
      });
      this._container.querySelectorAll('.lm-btn-del').forEach((btn) => {
        btn.addEventListener('click', () => this.eliminar(Number(btn.dataset.id)));
      });
    },

    isRetencion(_tipodoc) {
      return false;
    },

    async openEditor(id) {
      let header = {
        FECHA: this.toIsoDate(new Date()),
        TIPODOC: this._tipodocs[0] || '',
        SERIE: '',
        NUMERO: '',
        NIT: '',
        NOMBRE: '',
        TOTAL_PRODUCTOS: '',
        TOTAL_SERVICIOS: '',
        TOTALEXENTO: '',
        TOTALSINIVA: '',
        TOTALIVA: '',
        GLOSA: '',
      };
      if (id) {
        try {
          const row = await F.fetchJson(this.apiUrl(`/${id}`, { _: Date.now() }), { cache: 'no-store' });
          header = {
            ID: row.ID,
            FECHA: this.toIsoDate(row.FECHA),
            TIPODOC: row.TIPODOC || '',
            SERIE: row.SERIE || '',
            NUMERO: row.NUMERO || '',
            NIT: row.NIT || '',
            NOMBRE: row.NOMBRE || '',
            TOTAL_PRODUCTOS: row.TOTAL_PRODUCTOS || '',
            TOTAL_SERVICIOS: row.TOTAL_SERVICIOS || '',
            TOTALEXENTO: row.TOTALEXENTO || '',
            TOTALSINIVA: row.TOTALSINIVA || '',
            TOTALIVA: row.TOTALIVA || '',
            GLOSA: row.GLOSA || '',
          };
        } catch (err) {
          F.toast(err.message || 'No se pudo abrir', 'error');
          return;
        }
      }

      const isEdit = !!header.ID;
      const html = `
        <div class="lm-editor text-start">
          <div class="row g-2 mb-2">
            <div class="col-md-3">
              <label class="form-label small mb-0">Fecha</label>
              <input type="date" id="lm-ed-fecha" class="form-control form-control-sm" value="${this.escapeHtml(header.FECHA)}">
            </div>
            <div class="col-md-3">
              <label class="form-label small mb-0">Tipo doc.</label>
              <select id="lm-ed-tipodoc" class="form-select form-select-sm">${this.tipodocOptions(header.TIPODOC)}</select>
            </div>
            <div class="col-md-3">
              <label class="form-label small mb-0">Serie</label>
              <input type="text" id="lm-ed-serie" class="form-control form-control-sm" value="${this.escapeHtml(header.SERIE)}">
            </div>
            <div class="col-md-3">
              <label class="form-label small mb-0">Número</label>
              <input type="text" id="lm-ed-numero" class="form-control form-control-sm" value="${this.escapeHtml(header.NUMERO)}">
            </div>
            <div class="col-md-4">
              <label class="form-label small mb-0">NIT</label>
              <input type="text" id="lm-ed-nit" class="form-control form-control-sm" value="${this.escapeHtml(header.NIT)}">
            </div>
            <div class="col-md-8">
              <label class="form-label small mb-0">Nombre</label>
              <input type="text" id="lm-ed-nombre" class="form-control form-control-sm" value="${this.escapeHtml(header.NOMBRE)}">
            </div>
            <div class="col-md-4">
              <label class="form-label small mb-0">Total productos (c/IVA)</label>
              <input type="number" min="0" step="0.001" id="lm-ed-prod" class="form-control form-control-sm text-end" value="${this.escapeHtml(header.TOTAL_PRODUCTOS)}">
            </div>
            <div class="col-md-4">
              <label class="form-label small mb-0">Total servicios (c/IVA)</label>
              <input type="number" min="0" step="0.001" id="lm-ed-serv" class="form-control form-control-sm text-end" value="${this.escapeHtml(header.TOTAL_SERVICIOS)}">
            </div>
            <div class="col-md-4">
              <label class="form-label small mb-0">Exento</label>
              <input type="number" min="0" step="0.001" id="lm-ed-exento" class="form-control form-control-sm text-end" value="${this.escapeHtml(header.TOTALEXENTO)}">
            </div>
            <div class="col-12">
              <label class="form-label small mb-0">Glosa / nota</label>
              <input type="text" id="lm-ed-glosa" class="form-control form-control-sm" maxlength="500" value="${this.escapeHtml(header.GLOSA)}">
            </div>
          </div>
          <p class="small text-muted mb-0">No crea documento operativo. Solo alimenta el libro contable/fiscal del período.</p>
        </div>
      `;

      const result = await Swal.fire({
        ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
        title: isEdit ? `Editar #${header.ID}` : `Nuevo — ${title}`,
        html,
        width: 720,
        showCancelButton: true,
        confirmButtonText:
          typeof CatalogosUI !== 'undefined' ? CatalogosUI.guardarButtonHtml('Guardar') : 'Guardar',
        cancelButtonText:
          typeof CatalogosUI !== 'undefined' ? CatalogosUI.cancelButtonHtml('Cancelar') : 'Cancelar',
        focusConfirm: false,
        didOpen: () => {},
        preConfirm: () => {
          const popup = Swal.getPopup();
          const FECHA = popup.querySelector('#lm-ed-fecha')?.value;
          const TIPODOC = popup.querySelector('#lm-ed-tipodoc')?.value;
          if (!FECHA) {
            Swal.showValidationMessage('Indique la fecha');
            return false;
          }
          if (!TIPODOC) {
            Swal.showValidationMessage('Indique el tipo de documento');
            return false;
          }
          const payload = {
            FECHA,
            TIPODOC,
            SERIE: popup.querySelector('#lm-ed-serie')?.value?.trim() || '',
            NUMERO: popup.querySelector('#lm-ed-numero')?.value?.trim() || '',
            NIT: popup.querySelector('#lm-ed-nit')?.value?.trim() || '',
            NOMBRE: popup.querySelector('#lm-ed-nombre')?.value?.trim() || '',
            TOTAL_PRODUCTOS: Number(popup.querySelector('#lm-ed-prod')?.value) || 0,
            TOTAL_SERVICIOS: Number(popup.querySelector('#lm-ed-serv')?.value) || 0,
            TOTALEXENTO: Number(popup.querySelector('#lm-ed-exento')?.value) || 0,
            TOTALSINIVA: 0,
            TOTALIVA: 0,
            GLOSA: popup.querySelector('#lm-ed-glosa')?.value?.trim() || '',
          };
          if (
            payload.TOTAL_PRODUCTOS <= 0 &&
            payload.TOTAL_SERVICIOS <= 0 &&
            payload.TOTALEXENTO <= 0
          ) {
            Swal.showValidationMessage('Indique al menos un monto');
            return false;
          }
          return payload;
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
          F.toast('Registro actualizado', 'success');
        } else {
          await F.fetchJson(this.apiUrl(''), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.value),
          });
          F.toast('Registro creado', 'success');
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
              title: '¿Anular registro?',
              text: 'Quedará en el libro con montos en cero.',
            })
          : window.confirm('¿Anular registro?');
      if (!ok) return;
      try {
        await F.fetchJson(this.apiUrl(`/${id}/anular`), { method: 'POST' });
        F.toast('Anulado', 'success');
        await this.reloadList();
      } catch (err) {
        F.toast(err.message || 'No se pudo anular', 'error');
      }
    },

    async eliminar(id) {
      const ok =
        typeof CatalogosUI !== 'undefined' && CatalogosUI.fireConfirm
          ? await CatalogosUI.fireConfirm({
              title: '¿Eliminar registro?',
              text: 'Se borrará definitivamente.',
            })
          : window.confirm('¿Eliminar registro?');
      if (!ok) return;
      try {
        await F.fetchJson(this.apiUrl(`/${id}`), { method: 'DELETE' });
        F.toast('Eliminado', 'success');
        await this.reloadList();
      } catch (err) {
        F.toast(err.message || 'No se pudo eliminar', 'error');
      }
    },
  };
}

const VentasManualesView = createLibrosManualesView({
  libro: 'V',
  title: 'Ventas manuales',
  subtitle: 'Ingreso manual al Libro de Ventas sin crear facturas en el sistema.',
  tipodocs: ['FEF', 'FEC', 'FES', 'FNC'],
});

const ComprasManualesView = createLibrosManualesView({
  libro: 'C',
  title: 'Compras manuales',
  subtitle: 'Ingreso manual al Libro de Compras sin crear documentos de compra.',
  tipodocs: ['COM', 'COP', 'DVP'],
});
