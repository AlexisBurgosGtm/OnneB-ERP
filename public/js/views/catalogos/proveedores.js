const ProveedoresView = createCatalogoEmpresaView({
  slug: 'proveedores',
  apiPath: '/api/proveedores',
  icon: 'fa-truck',
  labelSingular: 'proveedor',
  labelPlural: 'proveedor(es)',
  idKey: 'CODPROV',
  dataAttr: 'codprov',
  formWidth: 560,
  searchPlaceholder: 'Buscar por código, empresa, NIT, contacto…',
  searchKeys: ['CODPROV', 'EMPRESA', 'RAZONSOCIAL', 'TELEMPRESA', 'NIT', 'CONTACTO', 'DIRECCION'],
  formFields: [
    { key: 'CODPROV', label: 'Código', type: 'number', readonlyOnEdit: true, hideOnNew: true },
    { key: 'NIT', label: 'NIT' },
    { key: 'EMPRESA', label: 'Empresa', required: true },
    { key: 'RAZONSOCIAL', label: 'Razón social' },
    { key: 'DIRECCION', label: 'Dirección' },
    { key: 'TELEMPRESA', label: 'Tel. empresa' },
    { key: 'CONTACTO', label: 'Contacto' },
    { key: 'TELCONTACTO', label: 'Tel. contacto' },
  ],
  docFormFields: [
    { key: 'NIT', label: 'NIT' },
    { key: 'EMPRESA', label: 'Empresa', required: true },
  ],
  docNameField: 'EMPRESA',
  docCreateKeys: ['NIT', 'EMPRESA'],
  createKeys: ['NIT', 'EMPRESA', 'RAZONSOCIAL', 'DIRECCION', 'TELEMPRESA', 'CONTACTO', 'TELCONTACTO'],
  updateKeys: ['NIT', 'EMPRESA', 'RAZONSOCIAL', 'DIRECCION', 'TELEMPRESA', 'CONTACTO', 'TELCONTACTO'],
  mapFormToApi(data) {
    return {
      NIT: data.NIT || null,
      EMPRESA: data.EMPRESA,
      RAZONSOCIAL: data.RAZONSOCIAL || null,
      DIRECCION: data.DIRECCION || null,
      TELEMPRESA: data.TELEMPRESA || null,
      CONTACTO: data.CONTACTO || null,
      TELCONTACTO: data.TELCONTACTO || null,
    };
  },
  tableColumns: [
    { key: 'CODPROV', label: 'Código', type: 'number' },
    { key: 'NIT', label: 'NIT' },
    { key: 'EMPRESA', label: 'Empresa' },
    { key: 'RAZONSOCIAL', label: 'Razón social' },
    { key: 'TELEMPRESA', label: 'Teléfono' },
    { key: 'CONTACTO', label: 'Contacto' },
  ],
  validateForm(data) {
    if (!data.EMPRESA) return 'El nombre de empresa es obligatorio';
    return null;
  },
  getRowLabel(row) {
    return row?.EMPRESA || '';
  },
  renderRowActions(id) {
    return CatalogosUI.accionesRowConHistorial(id, 'codprov');
  },
  bindExtraRowActions() {
    if (this._historialRowClickBound || !this._container) return;
    this._historialRowClickBound = true;
    this._container.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-catalogo-historial');
      if (btn?.dataset?.codprov) this.openHistorialCompras(btn.dataset.codprov);
    });
  },
});

ProveedoresView._histTab = 'documentos';
ProveedoresView._histCodprov = null;
ProveedoresView._histMes = null;
ProveedoresView._histAnio = null;
ProveedoresView._histData = null;
ProveedoresView._histModal = null;

ProveedoresView.defaultHistorialPeriod = function () {
  const d = new Date();
  return { mes: d.getMonth() + 1, anio: d.getFullYear() };
};

ProveedoresView.formatFechaHist = function (value) {
  if (!value) return '—';
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
};

ProveedoresView.formatHoraHist = function (hora, minuto) {
  const h = Number(hora);
  const mi = Number(minuto);
  if (!Number.isFinite(h)) return '—';
  return `${String(h).padStart(2, '0')}:${String(Number.isFinite(mi) ? mi : 0).padStart(2, '0')}`;
};

ProveedoresView.formatMoneyHist = function (value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
};

ProveedoresView.formatQtyHist = function (value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('es-GT', { maximumFractionDigits: 4 });
};

ProveedoresView.mesOptionsHtml = function (selected) {
  const labels = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  return labels
    .map((label, i) => {
      const v = i + 1;
      return `<option value="${v}"${v === selected ? ' selected' : ''}>${label}</option>`;
    })
    .join('');
};

ProveedoresView.anioOptionsHtml = function (selected) {
  const y = new Date().getFullYear();
  const opts = [];
  for (let a = y; a >= y - 8; a -= 1) {
    opts.push(`<option value="${a}"${a === selected ? ' selected' : ''}>${a}</option>`);
  }
  return opts.join('');
};

ProveedoresView.renderHistorialDocsTable = function () {
  const rows = this._histData?.documentos || [];
  if (!rows.length) {
    return `<tr><td colspan="7" class="text-center text-muted py-3">Sin compras en el período</td></tr>`;
  }
  return rows
    .map((r) => {
      return `
        <tr>
          <td>${this.escapeHtml(r.CODDOC || '')}</td>
          <td>${this.escapeHtml(r.CORRELATIVO ?? '')}</td>
          <td class="text-nowrap">${this.escapeHtml(this.formatFechaHist(r.FECHA))}</td>
          <td class="text-nowrap">${this.escapeHtml(this.formatHoraHist(r.HORA, r.MINUTO))}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoneyHist(r.TOTALCOSTO))}</td>
          <td class="text-center">${this.escapeHtml(r.STATUS || '—')}</td>
          <td class="text-center text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-secondary prov-hist-print"
              data-coddoc="${this.escapeHtml(r.CODDOC || '')}"
              data-corr="${this.escapeHtml(r.CORRELATIVO ?? '')}"
              title="Imprimir">
              <i class="fa-solid fa-print"></i>
            </button>
          </td>
        </tr>`;
    })
    .join('');
};

ProveedoresView.renderHistorialProdsTable = function () {
  const rows = this._histData?.productos || [];
  if (!rows.length) {
    return `<tr><td colspan="9" class="text-center text-muted py-3">Sin líneas en el período</td></tr>`;
  }
  return rows
    .map((r) => {
      return `
        <tr>
          <td>${this.escapeHtml(r.CODDOC || '')}</td>
          <td>${this.escapeHtml(r.CORRELATIVO ?? '')}</td>
          <td class="text-nowrap">${this.escapeHtml(this.formatFechaHist(r.FECHA))}</td>
          <td>${this.escapeHtml(r.CODPROD || '—')}</td>
          <td class="small">${this.escapeHtml(r.DESPROD || '—')}</td>
          <td>${this.escapeHtml(r.CODMEDIDA || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatQtyHist(r.CANTIDAD))}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoneyHist(r.COSTO))}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoneyHist(r.TOTALCOSTO))}</td>
        </tr>`;
    })
    .join('');
};

ProveedoresView.renderHistorialModalBody = function () {
  const tabDocs = this._histTab === 'documentos' ? 'active' : '';
  const tabProds = this._histTab === 'productos' ? 'active' : '';
  const paneDocs = this._histTab === 'documentos' ? 'show active' : '';
  const paneProds = this._histTab === 'productos' ? 'show active' : '';
  return `
    <div class="prov-hist-modal-inner text-start">
      <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
        <div>
          <label class="form-label small mb-0" for="prov-hist-mes">Mes</label>
          <select id="prov-hist-mes" class="form-select form-select-sm">${this.mesOptionsHtml(this._histMes)}</select>
        </div>
        <div>
          <label class="form-label small mb-0" for="prov-hist-anio">Año</label>
          <select id="prov-hist-anio" class="form-select form-select-sm">${this.anioOptionsHtml(this._histAnio)}</select>
        </div>
        <button type="button" class="btn btn-sm btn-primary" id="prov-hist-refresh">
          <i class="fa-solid fa-rotate me-1"></i>Actualizar
        </button>
      </div>
      <ul class="nav nav-tabs nav-tabs-sm mb-2" role="tablist">
        <li class="nav-item">
          <button type="button" class="nav-link ${tabDocs}" data-prov-hist-tab="documentos">Documentos</button>
        </li>
        <li class="nav-item">
          <button type="button" class="nav-link ${tabProds}" data-prov-hist-tab="productos">Productos</button>
        </li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade ${paneDocs}" id="prov-hist-pane-docs">
          <div class="table-responsive" style="max-height: 52vh;">
            <table class="table table-sm table-hover align-middle mb-0">
              <thead class="table-light sticky-top">
                <tr>
                  <th>Coddoc</th>
                  <th>Correlativo</th>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th class="text-end">Total costo</th>
                  <th class="text-center">Status</th>
                  <th class="text-center"></th>
                </tr>
              </thead>
              <tbody id="prov-hist-docs-tbody">${this.renderHistorialDocsTable()}</tbody>
            </table>
          </div>
        </div>
        <div class="tab-pane fade ${paneProds}" id="prov-hist-pane-prods">
          <div class="table-responsive" style="max-height: 52vh;">
            <table class="table table-sm table-hover align-middle mb-0">
              <thead class="table-light sticky-top">
                <tr>
                  <th>Coddoc</th>
                  <th>Correlativo</th>
                  <th>Fecha</th>
                  <th>Codprod</th>
                  <th>Producto</th>
                  <th>Med.</th>
                  <th class="text-end">Cant.</th>
                  <th class="text-end">Costo</th>
                  <th class="text-end">Total costo</th>
                </tr>
              </thead>
              <tbody id="prov-hist-prods-tbody">${this.renderHistorialProdsTable()}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
};

ProveedoresView.ensureHistorialModalHost = function () {
  let el = document.getElementById('prov-historial-compras-modal');
  if (!el) {
    el = document.createElement('div');
    el.className = 'modal fade';
    el.id = 'prov-historial-compras-modal';
    el.tabIndex = -1;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header py-2">
            <h5 class="modal-title" id="prov-historial-compras-title">Historial de compras</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body py-2" id="prov-historial-compras-body"></div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
  } else if (el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
  return el;
};

ProveedoresView.bindHistorialModalEvents = function () {
  const el = this.ensureHistorialModalHost();
  if (el.dataset.histBound === '1') return;
  el.dataset.histBound = '1';
  el.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-prov-hist-tab]');
    if (tabBtn) {
      this._histTab = tabBtn.getAttribute('data-prov-hist-tab') || 'documentos';
      this.refreshHistorialModalContent();
      return;
    }
    if (e.target.closest('#prov-hist-refresh')) {
      const mesSel = document.getElementById('prov-hist-mes');
      const anioSel = document.getElementById('prov-hist-anio');
      if (mesSel) this._histMes = parseInt(mesSel.value, 10) || this._histMes;
      if (anioSel) this._histAnio = parseInt(anioSel.value, 10) || this._histAnio;
      this.fetchHistorialCompras().catch((err) => F.toast(err.message, 'error'));
      return;
    }
    const printBtn = e.target.closest('.prov-hist-print');
    if (printBtn) {
      const coddoc = printBtn.getAttribute('data-coddoc');
      const corr = printBtn.getAttribute('data-corr');
      if (coddoc && corr && typeof DocOpciones !== 'undefined') {
        const row = (this._histData?.documentos || []).find(
          (d) => String(d.CODDOC) === coddoc && String(d.CORRELATIVO) === String(corr)
        );
        DocOpciones.imprimir(coddoc, corr, row || null).catch((err) =>
          F.toast(err.message || 'No se pudo imprimir', 'error')
        );
      }
    }
  });
};

ProveedoresView.refreshHistorialModalContent = function () {
  const title = document.getElementById('prov-historial-compras-title');
  const body = document.getElementById('prov-historial-compras-body');
  const row = this.findRow(this._histCodprov);
  if (title) {
    title.textContent = `Historial de compras — ${row?.EMPRESA || this._histCodprov || ''}`;
  }
  if (body) body.innerHTML = this.renderHistorialModalBody();
};

ProveedoresView.fetchHistorialCompras = async function () {
  if (!this._histCodprov) return;
  const params = new URLSearchParams({
    empnit: F.getEmpNit(),
    mes: String(this._histMes),
    anio: String(this._histAnio),
    _: String(Date.now()),
  });
  this._histData = await F.fetchJson(
    `/api/proveedores/${encodeURIComponent(this._histCodprov)}/historial-compras?${params}`,
    { cache: 'no-store' }
  );
  const docsTbody = document.getElementById('prov-hist-docs-tbody');
  const prodsTbody = document.getElementById('prov-hist-prods-tbody');
  if (docsTbody) docsTbody.innerHTML = this.renderHistorialDocsTable();
  if (prodsTbody) prodsTbody.innerHTML = this.renderHistorialProdsTable();
  if (!docsTbody && !prodsTbody) this.refreshHistorialModalContent();
};

ProveedoresView.openHistorialCompras = async function (codprov) {
  if (!codprov) return;
  const period = this.defaultHistorialPeriod();
  this._histCodprov = codprov;
  this._histTab = 'documentos';
  this._histMes = period.mes;
  this._histAnio = period.anio;
  this._histData = { documentos: [], productos: [] };

  const el = this.ensureHistorialModalHost();
  if (typeof bootstrap === 'undefined') {
    F.toast('No se pudo abrir el modal', 'error');
    return;
  }
  this.bindHistorialModalEvents();
  this.refreshHistorialModalContent();
  if (!this._histModal) {
    this._histModal = bootstrap.Modal.getOrCreateInstance(el);
  }
  this._histModal.show();
  try {
    await this.fetchHistorialCompras();
  } catch (err) {
    F.toast(err.message || 'No se pudo cargar el historial', 'error');
  }
};