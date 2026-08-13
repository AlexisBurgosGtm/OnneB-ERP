/**
 * Factory vista planillas de nómina (interna / IGSS) — listado + editor.
 */
function createNominaDocView(cfg) {
  const P = cfg.prefix;
  const id = (name) => `${P}-${name}`;

  return {
    _container: null,
    _screen: 'list',
    _rows: [],
    _doc: null,
    _mes: null,
    _anio: null,
    _listFilter: '',
    _loading: false,
    _saving: false,
    _lineFilter: '',

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
      if (Number.isNaN(n)) return 'Q 0.00';
      return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
    },

    statusLabel(code) {
      const map = { B: 'Borrador', C: 'Calculada', F: 'Cerrada', A: 'Anulada' };
      return map[String(code || '').toUpperCase()] || code || '—';
    },

    statusClass(code) {
      const map = { B: 'text-secondary', C: 'text-primary', F: 'text-success', A: 'text-danger' };
      return map[String(code || '').toUpperCase()] || '';
    },

    docEditable(doc) {
      return String(doc?.header?.STATUS || doc?.STATUS || 'B').toUpperCase() !== 'F';
    },

    apiBase(path = '') {
      const emp = F.getEmpNit();
      if (!emp) throw new Error('No hay empresa activa');
      const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
      const params = new URLSearchParams({ empnit: emp });
      return `${cfg.apiPath}${segment}?${params}`;
    },

    defaultPeriod() {
      return LibroContableCommon.defaultPeriod();
    },

    async fetchList() {
      const params = new URLSearchParams({
        empnit: F.getEmpNit(),
        mes: String(this._mes),
        anio: String(this._anio),
        _: String(Date.now()),
      });
      const data = await F.fetchJson(`${cfg.apiPath}?${params}`, { cache: 'no-store' });
      this._rows = data.rows || [];
      return data;
    },

    async fetchDoc(planillaId) {
      const data = await F.fetchJson(
        `${cfg.apiPath}/${planillaId}?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`,
        { cache: 'no-store' }
      );
      this._doc = data;
      return data;
    },

    filteredRows() {
      const q = this._listFilter.trim().toLowerCase();
      if (!q) return this._rows;
      return this._rows.filter((r) => {
        const hay = [r.ID, r.DESCRIPCION, r.STATUS, r.PERIODO_TIPO]
          .map((v) => String(v ?? '').toLowerCase())
          .join(' ');
        return hay.includes(q);
      });
    },

    filteredLines() {
      let lines = this._doc?.lines || [];
      if (cfg.requireSalarioBase) {
        lines = lines.filter((l) => Number(l.SALARIO_BASE) > 0);
      }
      const q = this._lineFilter.trim().toLowerCase();
      if (!q) return lines;
      return lines.filter((l) => {
        const hay = [l.CODEMPLEADO, l.NOMEMPLEADO, l.DPI, l.IGSS]
          .map((v) => String(v ?? '').toLowerCase())
          .join(' ');
        return hay.includes(q);
      });
    },

    includedLines() {
      let lines = this._doc?.lines || [];
      if (cfg.requireSalarioBase) {
        lines = lines.filter((l) => Number(l.SALARIO_BASE) > 0);
      }
      return lines.filter((l) => String(l.INCLUIDO || 'SI').toUpperCase() === 'SI');
    },

    renderListCardsHtml() {
      const rows = this.filteredRows();
      if (!rows.length) {
        return `<p class="text-center text-muted py-4 mb-0">Sin planillas en este período</p>`;
      }
      return rows
        .map(
          (r) => `
        <div class="pos-pedido-card nomina-doc-card" data-id="${this.escapeHtml(r.ID)}">
          <div class="pos-pedido-card-top">
            <span class="pos-pedido-card-doc">Planilla #${this.escapeHtml(r.ID)}</span>
            <span class="pos-pedido-card-total">${this.escapeHtml(this.formatMoney(r.TOTAL_NETO))}</span>
          </div>
          <div class="pos-pedido-card-meta small mb-1">
            <span class="${this.statusClass(r.STATUS)} fw-semibold">${this.escapeHtml(this.statusLabel(r.STATUS))}</span>
            · ${this.escapeHtml(r.PERIODO_TIPO || 'MENSUAL')}
          </div>
          <div class="pos-pedido-card-cliente">${this.escapeHtml(r.DESCRIPCION || '—')}</div>
          <div class="small text-muted mb-2">
            Ingresos: ${this.escapeHtml(this.formatMoney(r.TOTAL_INGRESOS))}
            · Deducciones: ${this.escapeHtml(this.formatMoney(r.TOTAL_DEDUCCIONES))}
          </div>
          <div class="inv-card-actions">
            <button type="button" class="btn btn-sm btn-outline-primary inv-card-btn" data-action="editar">
              <i class="fa-solid fa-pen me-1"></i>Abrir
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary inv-card-btn" data-action="imprimir">
              <i class="fa-solid fa-print me-1"></i>Imprimir
            </button>
            ${
              String(r.STATUS) !== 'F'
                ? `<button type="button" class="btn btn-sm btn-outline-danger inv-card-btn" data-action="eliminar">
              <i class="fa-solid fa-trash me-1"></i>Eliminar
            </button>`
                : ''
            }
          </div>
        </div>`
        )
        .join('');
    },

    renderListScreen() {
      const p = LibroContableCommon;
      return `
        <div class="pos-list-wrap nomina-doc-list-wrap w-100">
          <div class="pos-list-header">
            <h2 class="pos-list-title">${this.escapeHtml(cfg.title)}</h2>
            <p class="pos-list-sub text-muted mb-0">${this.filteredRows().length} planilla(s) · ${p.mesLabel(this._mes)} ${this._anio}</p>
          </div>
          <div class="pos-list-toolbar mb-3 d-flex flex-wrap align-items-end gap-2">
            ${p.periodSelectsHtml(P, this._mes, this._anio)}
            <button type="button" class="btn btn-sm btn-outline-primary" id="btn-${P}-recargar">
              <i class="fa-solid fa-rotate me-1"></i>Actualizar
            </button>
            <div class="pos-list-search flex-grow-1">
              <input type="search" class="form-control form-control-sm pos-search-glow" id="${id('list-search')}"
                placeholder="Buscar planilla…" value="${this.escapeHtml(this._listFilter)}">
            </div>
          </div>
          <p class="small text-muted mb-2">
            Solo se incluyen empleados con <code>ACTIVO = SI</code> en la empresa activa.
          </p>
          <div class="pos-pedido-cards" id="${id('list-cards')}">${this.renderListCardsHtml()}</div>
          <button type="button" class="btn-onneb-nuevo-fab pos-list-fab-nuevo" id="btn-${P}-list-nuevo"
            aria-label="Nueva planilla" title="Nueva planilla">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>`;
    },

    moneyInput(fieldId, value, { readonly = false, extraClass = '' } = {}) {
      const ro = readonly ? 'readonly' : '';
      const cls = extraClass ? ` ${extraClass}` : '';
      return `
        <div class="input-group input-group-sm nomina-money${cls}">
          <span class="input-group-text">Q</span>
          <input type="number" step="0.001" class="form-control form-control-sm" id="${fieldId}"
            value="${value !== '' && value !== null && value !== undefined ? Number(value) : ''}" ${ro}>
        </div>`;
    },

    renderLineRow(line) {
      const h = this._doc?.header || {};
      const editable = this.docEditable({ header: h });
      const incluido = String(line.INCLUIDO || 'SI').toUpperCase() === 'SI';
      const rowClass = incluido ? '' : 'nomina-line-excluded';
      const dis = editable ? '' : 'disabled';
      return `
        <tr class="nomina-line-row ${rowClass}" data-detalle-id="${this.escapeHtml(line.ID)}">
          <td>
            <input type="checkbox" class="form-check-input nomina-inc-check" ${incluido ? 'checked' : ''} ${dis}
              data-field="INCLUIDO" title="Incluir en planilla">
          </td>
          <td>${this.escapeHtml(line.CODEMPLEADO)}</td>
          <td>
            <div>${this.escapeHtml(line.NOMEMPLEADO)}</div>
            ${
              line.DEPARTAMENTO
                ? `<div class="small text-muted">${this.escapeHtml(line.DEPARTAMENTO)}</div>`
                : ''
            }
          </td>
          <td class="nomina-num">${editable ? this.moneyInput(`${id('sal')}-${line.ID}`, line.SALARIO_BASE) : this.escapeHtml(this.formatMoney(line.SALARIO_BASE))}</td>
          <td class="nomina-num">${editable ? `<input type="number" step="0.01" class="form-control form-control-sm" data-field="DIAS_LABORADOS" value="${Number(line.DIAS_LABORADOS ?? 30)}" ${dis}>` : this.escapeHtml(line.DIAS_LABORADOS)}</td>
          <td class="nomina-num">${editable ? this.moneyInput(`${id('bonley')}-${line.ID}`, line.BONO_LEY ?? line.BONIFICACION) : this.escapeHtml(this.formatMoney(line.BONO_LEY ?? line.BONIFICACION))}</td>
          <td class="nomina-num">${editable ? this.moneyInput(`${id('bonadi')}-${line.ID}`, line.BONO_ADICIONAL) : this.escapeHtml(this.formatMoney(line.BONO_ADICIONAL))}</td>
          <td class="nomina-num">${editable ? this.moneyInput(`${id('com')}-${line.ID}`, line.COMISION) : this.escapeHtml(this.formatMoney(line.COMISION))}</td>
          <td class="nomina-num">${editable ? this.moneyInput(`${id('oing')}-${line.ID}`, line.OTROS_INGRESOS) : this.escapeHtml(this.formatMoney(line.OTROS_INGRESOS))}</td>
          <td class="nomina-num text-end">${this.escapeHtml(this.formatMoney(line.IGSS_LABORAL))}</td>
          ${
            cfg.showPatronal
              ? `<td class="nomina-num text-end">${this.escapeHtml(this.formatMoney(line.IGSS_PATRONAL))}</td>`
              : ''
          }
          <td class="nomina-num text-end">${this.escapeHtml(this.formatMoney(line.TOTAL_DEDUCCIONES))}</td>
          <td class="nomina-num text-end fw-semibold">${this.escapeHtml(this.formatMoney(line.NETO_PAGAR))}</td>
          <td class="text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-secondary nomina-line-print" title="Recibo">
              <i class="fa-solid fa-receipt"></i>
            </button>
            ${
              editable
                ? `<button type="button" class="btn btn-sm btn-outline-primary nomina-line-save" title="Guardar línea">
              <i class="fa-solid fa-floppy-disk"></i>
            </button>`
                : ''
            }
          </td>
        </tr>`;
    },

    renderLinesTable() {
      const h = this._doc?.header || {};
      const lines = this.filteredLines();
      const editable = this.docEditable({ header: h });
      const rows = lines.map((l) => this.renderLineRow(l)).join('');
      return `
        <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
          <input type="search" class="form-control form-control-sm" style="max-width:280px" id="${id('line-search')}"
            placeholder="Buscar empleado…" value="${this.escapeHtml(this._lineFilter)}">
          ${
            editable
              ? `<button type="button" class="btn btn-sm btn-outline-primary" id="btn-${P}-recalcular">
            <i class="fa-solid fa-calculator me-1"></i>Recalcular todo
          </button>`
              : ''
          }
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-${P}-imprimir-resumen">
            <i class="fa-solid fa-print me-1"></i>Imprimir resumen
          </button>
          ${
            cfg.showIgssExport
              ? `<button type="button" class="btn btn-sm btn-outline-success" id="btn-${P}-export-igss">
            <i class="fa-solid fa-file-export me-1"></i>Exportar IGSS
          </button>`
              : ''
          }
        </div>
        <div class="table-responsive nomina-lines-table">
          <table class="table table-sm table-bordered align-middle mb-0">
            <thead>
              <tr>
                <th>Inc.</th><th>Cód.</th><th>Empleado</th><th>Salario</th><th>Días</th>
                <th>Bono ley</th><th>Bono adic.</th><th>Com.</th><th>Otros ing.</th><th>IGSS lab.</th>
                ${cfg.showPatronal ? '<th>IGSS pat.</th>' : ''}
                <th>Deducc.</th><th>Neto</th><th></th>
              </tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="${cfg.showPatronal ? 14 : 13}" class="text-center text-muted py-3">Sin líneas</td></tr>`}</tbody>
          </table>
        </div>`;
    },

    renderEditorShell() {
      const h = this._doc?.header || {};
      const editable = this.docEditable({ header: h });
      return `
        <div class="pos-vista-wrap nomina-doc-editor-wrap w-100">
          <div class="pos-header card shadow-sm mb-2">
            <div class="card-body py-2 d-flex flex-wrap align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary pos-btn-atras" id="btn-${P}-atras">
                <i class="fa-solid fa-arrow-left me-1"></i>Atrás
              </button>
              <span class="pos-header-doc-label fw-semibold">
                ${this.escapeHtml(cfg.title)} · #${this.escapeHtml(h.ID)} · ${LibroContableCommon.mesLabel(h.MES)} ${this.escapeHtml(h.ANIO)}
              </span>
              <span class="badge bg-light text-dark border ms-auto ${this.statusClass(h.STATUS)}">${this.escapeHtml(this.statusLabel(h.STATUS))}</span>
            </div>
          </div>
          <div class="card shadow-sm mx-2 mb-2">
            <div class="card-body py-2">
              <div class="row g-2 small">
                <div class="col-md-3"><strong>Descripción:</strong> ${this.escapeHtml(h.DESCRIPCION || '—')}</div>
                <div class="col-md-3"><strong>Total ingresos:</strong> ${this.escapeHtml(this.formatMoney(h.TOTAL_INGRESOS))}</div>
                <div class="col-md-3"><strong>Total deducciones:</strong> ${this.escapeHtml(this.formatMoney(h.TOTAL_DEDUCCIONES))}</div>
                <div class="col-md-3"><strong>Neto:</strong> ${this.escapeHtml(this.formatMoney(h.TOTAL_NETO))}</div>
                ${
                  cfg.showPatronal
                    ? `<div class="col-md-3"><strong>IGSS patronal:</strong> ${this.escapeHtml(this.formatMoney(h.TOTAL_IGSS_PAT))}</div>`
                    : ''
                }
              </div>
            </div>
          </div>
          <div class="card shadow-sm mx-2 mb-5">
            <div class="card-body" id="${id('editor-body')}">${this.renderLinesTable()}</div>
          </div>
          ${
            editable
              ? `<div class="pos-fab-bar" id="${id('fab-bar')}">
            <button type="button" class="pos-fab-finalizar" id="btn-${P}-cerrar">
              <i class="fa-solid fa-lock me-2"></i>Cerrar planilla
            </button>
          </div>`
              : ''
          }
        </div>`;
    },

    readLinePayload(rowEl) {
      const detalleId = rowEl.dataset.detalleId;
      const getNum = (sel) => {
        const el = rowEl.querySelector(sel);
        return el ? Number(el.value) || 0 : 0;
      };
      const inclCheck = rowEl.querySelector('.nomina-inc-check');
      return {
        detalleId,
        payload: {
          SALARIO_BASE: getNum(`#${id('sal')}-${detalleId}`),
          DIAS_LABORADOS: getNum('[data-field="DIAS_LABORADOS"]'),
          BONO_LEY: getNum(`#${id('bonley')}-${detalleId}`),
          BONO_ADICIONAL: getNum(`#${id('bonadi')}-${detalleId}`),
          BONIFICACION: getNum(`#${id('bonley')}-${detalleId}`),
          COMISION: getNum(`#${id('com')}-${detalleId}`),
          OTROS_INGRESOS: getNum(`#${id('oing')}-${detalleId}`),
          INCLUIDO: inclCheck?.checked ? 'SI' : 'NO',
        },
      };
    },

    async saveLine(detalleId, payload) {
      const planillaId = this._doc?.header?.ID;
      if (!planillaId) return;
      this._saving = true;
      try {
        const data = await F.fetchJson(
          `${cfg.apiPath}/${planillaId}/lineas/${detalleId}?empnit=${encodeURIComponent(F.getEmpNit())}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        this._doc = data;
        this.refreshEditorBody();
        F.toast('Línea actualizada', 'success');
      } catch (err) {
        F.alert('Error', err.message || 'No se pudo guardar', 'error');
      } finally {
        this._saving = false;
      }
    },

    refreshListCards() {
      const el = this._container?.querySelector(`#${id('list-cards')}`);
      if (el) el.innerHTML = this.renderListCardsHtml();
    },

    refreshEditorBody() {
      const el = this._container?.querySelector(`#${id('editor-body')}`);
      if (el) {
        el.innerHTML = this.renderLinesTable();
        this.bindEditorEvents();
      }
    },

    render() {
      if (this._screen === 'editor') {
        this._container.innerHTML = this.renderEditorShell();
        this.bindEditorEvents();
      } else {
        this._container.innerHTML = this.renderListScreen();
        this.bindListEvents();
      }
    },

    bindPeriodEvents() {
      const mesEl = document.getElementById(`${P}-mes`);
      const anioEl = document.getElementById(`${P}-anio`);
      const reload = async () => {
        this._mes = Number(mesEl?.value) || this._mes;
        this._anio = Number(anioEl?.value) || this._anio;
        await this.fetchList();
        this.refreshListCards();
        const sub = this._container?.querySelector('.pos-list-sub');
        if (sub) {
          sub.textContent = `${this.filteredRows().length} planilla(s) · ${LibroContableCommon.mesLabel(this._mes)} ${this._anio}`;
        }
      };
      mesEl?.addEventListener('change', reload);
      anioEl?.addEventListener('change', reload);
    },

    bindListEvents() {
      this.bindPeriodEvents();
      this._container.querySelector(`#btn-${P}-recargar`)?.addEventListener('click', async () => {
        await this.fetchList();
        this.refreshListCards();
      });
      this._container.querySelector(`#${id('list-search')}`)?.addEventListener('input', (e) => {
        this._listFilter = e.target.value;
        this.refreshListCards();
      });
      this._container.querySelector(`#btn-${P}-list-nuevo`)?.addEventListener('click', () => this.promptNuevaPlanilla());
      this._container.querySelector(`#${id('list-cards')}`)?.addEventListener('click', (e) => {
        const card = e.target.closest('.nomina-doc-card');
        if (!card) return;
        const planillaId = card.dataset.id;
        const btn = e.target.closest('[data-action]');
        const action = btn?.dataset.action;
        if (action === 'editar') this.openEditor(planillaId);
        else if (action === 'imprimir') this.printPlanilla(planillaId);
        else if (action === 'eliminar') this.deletePlanilla(planillaId);
      });
    },

    bindEditorEvents() {
      this._container.querySelector(`#btn-${P}-atras`)?.addEventListener('click', () => {
        this._screen = 'list';
        this._doc = null;
        this.render();
      });
      this._container.querySelector(`#${id('line-search')}`)?.addEventListener('input', (e) => {
        this._lineFilter = e.target.value;
        this.refreshEditorBody();
      });
      this._container.querySelector(`#btn-${P}-recalcular`)?.addEventListener('click', () => this.recalcularPlanilla());
      this._container.querySelector(`#btn-${P}-imprimir-resumen`)?.addEventListener('click', () => this.printPlanilla());
      this._container.querySelector(`#btn-${P}-export-igss`)?.addEventListener('click', () => this.exportIgss());
      this._container.querySelector(`#btn-${P}-cerrar`)?.addEventListener('click', () => this.cerrarPlanilla());
      this._container.querySelector(`#${id('editor-body')}`)?.addEventListener('click', async (e) => {
        const row = e.target.closest('.nomina-line-row');
        if (!row) return;
        if (e.target.closest('.nomina-line-print')) {
          const detalleId = row.dataset.detalleId;
          const line = (this._doc?.lines || []).find((l) => String(l.ID) === String(detalleId));
          if (line) {
            await NominaPrint.printReciboEmpleado({
              header: this._doc.header,
              line,
              titulo: cfg.reciboTitle || 'Recibo de nómina',
            });
          }
          return;
        }
        if (e.target.closest('.nomina-line-save')) {
          const { detalleId, payload } = this.readLinePayload(row);
          await this.saveLine(detalleId, payload);
        }
      });
      this._container.querySelector(`#${id('editor-body')}`)?.addEventListener('change', async (e) => {
        if (!e.target.classList.contains('nomina-inc-check')) return;
        const row = e.target.closest('.nomina-line-row');
        if (!row) return;
        const { detalleId, payload } = this.readLinePayload(row);
        await this.saveLine(detalleId, payload);
      });
    },

    async promptNuevaPlanilla() {
      const desc = `${cfg.title} ${LibroContableCommon.mesLabel(this._mes)} ${this._anio}`;
      const periodoOptions =
        cfg.periodoOptions ||
        [
          { value: 'MENSUAL', label: 'MENSUAL (mes)' },
          { value: 'QUINCENAL', label: 'QUINCENAL (15 dias)' },
          { value: 'CATORCENAL', label: 'CATORCENAL (14 dias)' },
          { value: 'SEMANAL', label: 'SEMANAL (7 dias)' },
        ];
      const periodoHtml = periodoOptions
        .map(
          (o, i) =>
            `<option value="${this.escapeHtml(o.value)}"${i === 0 ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
        )
        .join('');
      const result = await Swal.fire({
        ...CatalogosUI.modalBase(),
        title: 'Nueva planilla',
        html: `
          <label class="form-label small">Descripción</label>
          <input type="text" id="swal-nomina-desc" class="form-control form-control-sm mb-2" value="${this.escapeHtml(desc)}">
          <label class="form-label small">Tipo período</label>
          <select id="swal-nomina-periodo" class="form-select form-select-sm">
            ${periodoHtml}
          </select>`,
        showCancelButton: true,
        confirmButtonText: CatalogosUI.guardarButtonHtml('Crear'),
        cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
        preConfirm: () => ({
          DESCRIPCION: document.getElementById('swal-nomina-desc')?.value?.trim() || desc,
          PERIODO_TIPO: document.getElementById('swal-nomina-periodo')?.value || 'MENSUAL',
          MES: this._mes,
          ANIO: this._anio,
          USUARIO: F.session('user')?.usuario || 'SISTEMA',
        }),
      });
      if (!result.isConfirmed) return;
      try {
        const data = await F.fetchJson(`${cfg.apiPath}?empnit=${encodeURIComponent(F.getEmpNit())}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.value),
        });
        this._doc = data;
        this._screen = 'editor';
        this.render();
        F.toast('Planilla creada', 'success');
      } catch (err) {
        F.alert('Error', err.message || 'No se pudo crear la planilla', 'error');
      }
    },

    async openEditor(planillaId) {
      try {
        await this.fetchDoc(planillaId);
        this._screen = 'editor';
        this._lineFilter = '';
        this.render();
      } catch (err) {
        F.alert('Error', err.message || 'No se pudo abrir la planilla', 'error');
      }
    },

    async recalcularPlanilla() {
      const planillaId = this._doc?.header?.ID;
      if (!planillaId) return;
      try {
        const data = await F.fetchJson(
          `${cfg.apiPath}/${planillaId}/recalcular?empnit=${encodeURIComponent(F.getEmpNit())}`,
          { method: 'POST' }
        );
        this._doc = data;
        this.refreshEditorBody();
        F.toast('Planilla recalculada', 'success');
      } catch (err) {
        F.alert('Error', err.message || 'No se pudo recalcular', 'error');
      }
    },

    async cerrarPlanilla() {
      const planillaId = this._doc?.header?.ID;
      if (!planillaId) return;
      const ok = await CatalogosUI.confirmSalir({
        title: '¿Cerrar planilla?',
        text: 'No podrá editar las líneas después de cerrar.',
      });
      if (!ok) return;
      try {
        const data = await F.fetchJson(
          `${cfg.apiPath}/${planillaId}/cerrar?empnit=${encodeURIComponent(F.getEmpNit())}`,
          { method: 'POST' }
        );
        this._doc = data;
        this.render();
        F.toast('Planilla cerrada', 'success');
      } catch (err) {
        F.alert('Error', err.message || 'No se pudo cerrar', 'error');
      }
    },

    async deletePlanilla(planillaId) {
      const ok = await CatalogosUI.confirmSalir({
        title: '¿Eliminar planilla?',
        text: 'Esta acción no se puede deshacer.',
      });
      if (!ok) return;
      try {
        await F.fetchJson(
          `${cfg.apiPath}/${planillaId}?empnit=${encodeURIComponent(F.getEmpNit())}`,
          { method: 'DELETE' }
        );
        await this.fetchList();
        this.refreshListCards();
        F.toast('Planilla eliminada', 'success');
      } catch (err) {
        F.alert('Error', err.message || 'No se pudo eliminar', 'error');
      }
    },

    async printPlanilla(planillaId) {
      try {
        if (planillaId) await this.fetchDoc(planillaId);
        if (!this._doc?.header) return;
        await NominaPrint.printPlanillaResumen({
          header: this._doc.header,
          lines: this._doc.lines,
          titulo: cfg.printTitle || cfg.title,
          showPatronal: !!cfg.showPatronal,
        });
      } catch (err) {
        F.alert('Error', err.message || 'No se pudo imprimir', 'error');
      }
    },

    exportIgss() {
      const planillaId = this._doc?.header?.ID;
      if (!planillaId) return;
      const url = `${cfg.apiPath}/${planillaId}/export-igss?empnit=${encodeURIComponent(F.getEmpNit())}`;
      window.open(url, '_blank');
    },

    async load(container) {
      this._container = container;
      container.className = 'main-content flex-grow-1 d-flex p-3 align-items-stretch justify-content-start';
      const period = this.defaultPeriod();
      this._mes = period.mes;
      this._anio = period.anio;
      this._screen = 'list';
      this._listFilter = '';
      container.innerHTML = '<p class="text-muted">Cargando planillas…</p>';
      try {
        await this.fetchList();
        this.render();
      } catch (err) {
        container.innerHTML = `<p class="text-danger">${this.escapeHtml(err.message || 'Error al cargar')}</p>`;
      }
    },
  };
}
