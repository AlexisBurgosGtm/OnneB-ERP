/**
 * Consultorio — Consultas médicas (lista + editor consulta general).
 */
const ConsultorioConsultasView = {
  _container: null,
  _screen: 'list',
  _rows: [],
  _listFilter: '',
  _listMes: null,
  _listAnio: null,
  _editorTipo: 'GENERAL',
  _paciente: null,
  _editingCodconsulta: null,
  _editorConsulta: null,
  _saving: false,

  TIPO_LABELS: {
    GENERAL: 'Consulta general',
    GINECOLOGICA: 'Consulta ginecológica',
    DERMATOLOGIA: 'Consulta dermatología',
    PEDIATRIA: 'Consulta pediatría',
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiUrl(path, params = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const base = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    const qs = new URLSearchParams({ empnit: emp, ...params, _: String(Date.now()) });
    return `/api/consultorio${base}?${qs}`;
  },

  apiResource(path) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `/api/consultorio${p}?empnit=${encodeURIComponent(emp)}`;
  },

  findRow(codconsulta) {
    return this._rows.find((r) => String(r.CODCONSULTA) === String(codconsulta));
  },

  fechaInputValue(iso) {
    if (!iso) return '';
    return String(iso).slice(0, 10);
  },

  horaInputValue(hora) {
    const s = String(hora || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return s;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  },

  emptyEditorConsulta() {
    const { fecha, hora } = this.nowDefaults();
    return {
      FECHA: fecha,
      HORA: hora,
      MOTIVO: '',
      SINTOMAS: '',
      PA: '',
      FC: '',
      FR: '',
      TEMPERATURA: '',
      PESO: '',
      TALLA: '',
      IMPRESION_DIAGNOSTICA: '',
      TRATAMIENTO: '',
    };
  },

  editorFromRow(row) {
    if (!row) return this.emptyEditorConsulta();
    return {
      FECHA: this.fechaInputValue(row.FECHA),
      HORA: this.horaInputValue(row.HORA),
      MOTIVO: row.MOTIVO || '',
      SINTOMAS: row.SINTOMAS || '',
      PA: row.PA || '',
      FC: row.FC ?? '',
      FR: row.FR ?? '',
      TEMPERATURA: row.TEMPERATURA ?? '',
      PESO: row.PESO ?? '',
      TALLA: row.TALLA ?? '',
      IMPRESION_DIAGNOSTICA: row.IMPRESION_DIAGNOSTICA || '',
      TRATAMIENTO: row.TRATAMIENTO || '',
    };
  },

  formatTipo(tipo) {
    return this.TIPO_LABELS[String(tipo || '').toUpperCase()] || tipo || '—';
  },

  edadPacienteLabel(fechaNac, refFechaIso) {
    if (typeof ConsultorioEdad === 'undefined') return '—';
    return ConsultorioEdad.label(fechaNac, refFechaIso);
  },

  syncEdadPacienteEnEditor() {
    const el = this._container?.querySelector('#cons-cons-edad-valor');
    if (!el) return;
    const fn = this._paciente?.FECHA_NACIMIENTO;
    el.textContent = fn ? this.edadPacienteLabel(fn, null) : '—';
  },

  async fetchPacienteByCod(codpaciente) {
    try {
      const data = await this.buscarPacientes(String(codpaciente));
      return (data.rows || []).find((r) => String(r.CODPACIENTE) === String(codpaciente)) || null;
    } catch {
      return null;
    }
  },

  async openNuevoPacienteModal() {
    if (typeof ConsultorioPacientesView === 'undefined') {
      F.toast('Vista de pacientes no disponible', 'warning');
      return;
    }
    const payload = await ConsultorioPacientesView.showPacienteForm('Nuevo paciente', ConsultorioPacientesView.emptyRow(), false);
    if (!payload) return;
    try {
      const created = await ConsultorioPacientesView.createPaciente(payload);
      const cod = created?.CODPACIENTE ?? created?.row?.CODPACIENTE;
      const nom = payload.NOMBRE;
      this._paciente = {
        CODPACIENTE: cod,
        NOMBRE: nom,
        FECHA_NACIMIENTO: payload.FECHA_NACIMIENTO || null,
      };
      const codInp = this._container?.querySelector('#cons-cons-pac-cod');
      const nomEl = this._container?.querySelector('#cons-cons-pac-nombre');
      const inp = this._container?.querySelector('#cons-cons-pac-search');
      if (codInp) codInp.value = String(cod ?? '');
      if (nomEl) nomEl.textContent = nom;
      if (inp) inp.value = nom;
      this.syncEdadPacienteEnEditor();
      F.toast('Paciente creado', 'success');
    } catch (err) {
      F.toast(err.message || 'No se pudo crear el paciente', 'error');
    }
  },

  formatFecha(iso) {
    if (!iso) return '—';
    if (typeof DocFecha !== 'undefined' && DocFecha.formatDisplay) {
      return DocFecha.formatDisplay({ FECHA: iso });
    }
    const s = String(iso).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return s;
  },

  nowDefaults() {
    const d = new Date();
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return { fecha, hora };
  },

  initListPeriod() {
    const d = new Date();
    if (this._listMes == null) this._listMes = d.getMonth() + 1;
    if (this._listAnio == null) this._listAnio = d.getFullYear();
  },

  mesOptions() {
    const names = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return names.map((label, i) => ({ value: i + 1, label }));
  },

  anioOptions() {
    const current = new Date().getFullYear();
    const years = new Set([current, current - 1, current - 2, current - 3]);
    if (this._listAnio != null) years.add(this._listAnio);
    for (const r of this._rows) {
      const y = parseInt(String(r.FECHA || '').slice(0, 4), 10);
      if (Number.isFinite(y)) years.add(y);
    }
    return [...years]
      .sort((a, b) => b - a)
      .map((value) => ({ value, label: String(value) }));
  },

  rowMesAnio(row) {
    const s = String(row?.FECHA || '').trim().slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})/);
    if (!m) return { mes: null, anio: null };
    return { anio: parseInt(m[1], 10), mes: parseInt(m[2], 10) };
  },

  rowsForListPeriod() {
    this.initListPeriod();
    const mes = this._listMes;
    const anio = this._listAnio;
    return this._rows.filter((r) => {
      const { mes: rm, anio: ry } = this.rowMesAnio(r);
      if (rm == null || ry == null) return false;
      return rm === mes && ry === anio;
    });
  },

  filteredListRows() {
    const base = this.rowsForListPeriod();
    const q = this._listFilter.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) => {
      const blob = [r.FECHA, r.HORA, r.PACIENTE, r.TIPO, this.formatTipo(r.TIPO)]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ');
      return blob.includes(q);
    });
  },

  countByTipo(rows) {
    const counts = { TOTAL: rows.length };
    for (const key of Object.keys(this.TIPO_LABELS)) {
      counts[key] = 0;
    }
    for (const r of rows) {
      const t = String(r.TIPO || '').trim().toUpperCase();
      if (Object.prototype.hasOwnProperty.call(counts, t)) counts[t] += 1;
      else counts.OTROS = (counts.OTROS || 0) + 1;
    }
    return counts;
  },

  renderListTotalsHtml() {
    const rows = this.rowsForListPeriod();
    const c = this.countByTipo(rows);
    this.initListPeriod();
    const mesLabel = this.mesOptions().find((o) => o.value === this._listMes)?.label || this._listMes;
    const cards = [
      { key: 'TOTAL', label: 'Total', icon: 'fa-clipboard-list', variant: 'primary' },
      { key: 'GENERAL', label: 'General', icon: 'fa-user-doctor', variant: 'secondary' },
      { key: 'GINECOLOGICA', label: 'Ginecología', icon: 'fa-venus', variant: 'secondary' },
      { key: 'DERMATOLOGIA', label: 'Dermatología', icon: 'fa-hand-dots', variant: 'secondary' },
      { key: 'PEDIATRIA', label: 'Pediatría', icon: 'fa-baby', variant: 'secondary' },
    ];
    const items = cards
      .map(
        (card) => `
      <div class="col-6 col-md-4 col-lg-2 cons-cons-total-chip">
        <div class="cons-cons-total-card border rounded-3 px-2 py-2 h-100">
          <div class="d-flex align-items-center justify-content-between gap-1">
            <span class="small text-muted text-truncate">
              <i class="fa-solid ${card.icon} me-1 opacity-75" aria-hidden="true"></i>${this.escapeHtml(card.label)}
            </span>
            <span class="fw-bold fs-6 text-${card.variant === 'primary' ? 'primary' : 'body-emphasis'}">${c[card.key] ?? 0}</span>
          </div>
        </div>
      </div>`
      )
      .join('');
  return `
      <div class="cons-cons-list-totals px-1 mb-2" id="cons-cons-list-totals">
        <p class="small text-muted mb-1 cons-cons-list-period-label">
          Resumen <strong>${this.escapeHtml(mesLabel)} ${this._listAnio}</strong>
          ${this._listFilter.trim() ? `<span class="text-body-secondary"> · tabla filtrada: ${this.filteredListRows().length}</span>` : ''}
        </p>
        <div class="row g-2">${items}</div>
      </div>`;
  },

  renderListToolbarHtml() {
    this.initListPeriod();
    const mesOpts = this.mesOptions()
      .map(
        (o) =>
          `<option value="${o.value}"${this._listMes === o.value ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
      )
      .join('');
    const anioOpts = this.anioOptions()
      .map(
        (o) =>
          `<option value="${o.value}"${this._listAnio === o.value ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
      )
      .join('');
    return `
      <div class="cons-cons-list-toolbar px-1 mb-2">
        <div class="row g-2 align-items-end">
          <div class="col-6 col-sm-auto">
            <label class="form-label small mb-0" for="cons-cons-list-mes">Mes</label>
            <select class="form-select form-select-sm" id="cons-cons-list-mes">${mesOpts}</select>
          </div>
          <div class="col-6 col-sm-auto">
            <label class="form-label small mb-0" for="cons-cons-list-anio">Año</label>
            <select class="form-select form-select-sm" id="cons-cons-list-anio">${anioOpts}</select>
          </div>
          <div class="col-12 col-sm">
            <label class="form-label small mb-0" for="cons-cons-list-search">Buscar</label>
            <div class="input-group input-group-sm catalogo-empresa-search">
              <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input type="search" class="form-control" id="cons-cons-list-search"
                placeholder="Paciente, motivo, tipo…" value="${this.escapeHtml(this._listFilter)}"
                autocomplete="off">
              <button type="button" class="btn btn-outline-secondary" id="btn-cons-cons-list-clear" title="Limpiar texto">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
        </div>
      </div>`;
  },

  tieneReceta(row) {
    return !!(row?.CODDOC_RECETA && row.CORRELATIVO_RECETA != null && row.CORRELATIVO_RECETA !== '');
  },

  listAccionesHtml(r) {
    const id = r.CODCONSULTA;
    const hasReceta = this.tieneReceta(r);
    return `
      <div class="catalogo-acciones cons-cons-list-acciones d-flex flex-wrap gap-1 justify-content-end">
        <button type="button" class="btn btn-sm btn-outline-primary btn-cons-detalle" data-codconsulta="${this.escapeHtml(id)}">
          <i class="fa-solid fa-list" aria-hidden="true"></i> Detalles
        </button>
        ${
          hasReceta
            ? `<button type="button" class="btn btn-sm btn-outline-secondary btn-cons-imprimir-receta" data-codconsulta="${this.escapeHtml(id)}">
          <i class="fa-solid fa-print" aria-hidden="true"></i> Imprimir Receta
        </button>`
            : ''
        }
        ${CatalogosUI.btnEditar(id, 'codconsulta')}
        ${CatalogosUI.btnEliminar(id, 'codconsulta')}
      </div>`;
  },

  dosisLineaTxt(ln) {
    if (typeof ConsultorioRecetaPanel !== 'undefined') return ConsultorioRecetaPanel.labelDosis(ln);
    const v = String(ln?.NOSERIE ?? ln?.DOSIS ?? '').trim();
    return v && v.toUpperCase() !== 'SN' ? v : '—';
  },

  duracionLineaTxt(ln) {
    if (typeof ConsultorioRecetaPanel !== 'undefined') return ConsultorioRecetaPanel.labelDuracion(ln);
    const v = String(ln?.OBS ?? ln?.DURACION ?? '').trim();
    return v && v.toUpperCase() !== 'SN' ? v : '—';
  },

  detalleCampo(label, value) {
    if (value === null || value === undefined || String(value).trim() === '') return '';
    return `<div class="col-sm-6 mb-2">
      <div class="text-muted small">${this.escapeHtml(label)}</div>
      <div class="small">${this.escapeHtml(value)}</div>
    </div>`;
  },

  async fetchConsultaDetalle(codconsulta) {
    return F.fetchJson(this.apiResource(`/consultas/${encodeURIComponent(codconsulta)}/detalle`), {
      cache: 'no-store',
    });
  },

  buildDetalleModalHtml(data) {
    const c = data.consulta || {};
    const p = data.paciente || {};
    const vitals = [
      c.PA != null && c.PA !== '' ? `PA ${c.PA}` : null,
      c.FC != null ? `FC ${c.FC}` : null,
      c.FR != null ? `FR ${c.FR}` : null,
      c.TEMPERATURA != null ? `Temp ${c.TEMPERATURA}°C` : null,
      c.PESO != null ? `Peso ${c.PESO} kg` : null,
      c.TALLA != null ? `Talla ${c.TALLA} cm` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const receta = data.receta;
    const recetaHead = receta
      ? `<p class="small text-muted mb-1">Documento: <strong>${this.escapeHtml(receta.CODDOC)} #${this.escapeHtml(receta.CORRELATIVO)}</strong></p>`
      : '';
    const recetaBody =
      receta?.lines?.length
        ? `<div class="table-responsive">
          <table class="table table-sm table-striped mb-0">
            <thead><tr>
              <th>Medicamento</th><th>Medida</th><th>Dosis</th><th>Duración</th>
            </tr></thead>
            <tbody>
              ${receta.lines
                .map(
                  (ln) => `<tr>
                <td>${this.escapeHtml(ln.DESPROD || ln.CODPROD)}</td>
                <td>${this.escapeHtml(ln.CODMEDIDA || '—')}</td>
                <td>${this.escapeHtml(this.dosisLineaTxt(ln))}</td>
                <td>${this.escapeHtml(this.duracionLineaTxt(ln))}</td>
              </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`
        : '<p class="small text-muted mb-0">Sin receta vinculada</p>';
    return `
      <div class="text-start cons-cons-detalle-modal">
        <div class="row">
          ${this.detalleCampo('Paciente', p.NOMBRE || c.PACIENTE)}
          ${this.detalleCampo('Teléfonos', p.TELEFONOS)}
          ${this.detalleCampo('Fecha y hora', `${this.formatFecha(c.FECHA)} ${c.HORA || ''}`.trim())}
          ${this.detalleCampo('Tipo', this.formatTipo(c.TIPO))}
          ${this.detalleCampo('Motivo', c.MOTIVO)}
        </div>
        ${vitals ? `<p class="small mb-2"><span class="text-muted">Signos vitales:</span> ${this.escapeHtml(vitals)}</p>` : ''}
        ${c.SINTOMAS ? `<p class="small mb-2"><strong>Síntomas</strong><br>${this.escapeHtml(c.SINTOMAS)}</p>` : ''}
        ${c.IMPRESION_DIAGNOSTICA ? `<p class="small mb-2"><strong>Impresión diagnóstica</strong><br>${this.escapeHtml(c.IMPRESION_DIAGNOSTICA)}</p>` : ''}
        ${c.TRATAMIENTO ? `<p class="small mb-2"><strong>Tratamiento</strong><br>${this.escapeHtml(c.TRATAMIENTO)}</p>` : ''}
        <h6 class="small fw-semibold mt-2 mb-1">Receta médica</h6>
        ${recetaHead}
        ${recetaBody}
      </div>`;
  },

  async onDetalles(codconsulta) {
    try {
      const data = await this.fetchConsultaDetalle(codconsulta);
      const titulo = `Consulta #${codconsulta} — ${data.paciente?.NOMBRE || data.consulta?.PACIENTE || ''}`;
      await Swal.fire({
        ...CatalogosUI.modalBase({ customClass: { popup: 'modal-catalogo cons-cons-detalle-sw' } }),
        title: titulo,
        html: this.buildDetalleModalHtml(data),
        width: 'min(720px, 96vw)',
        confirmButtonText: 'Cerrar',
      });
    } catch (err) {
      F.toast(err.message || 'No se pudo cargar el detalle', 'error');
    }
  },

  async onImprimirReceta(codconsulta) {
    try {
      if (typeof ConsultorioRecetaPrint === 'undefined') {
        F.toast('Módulo de impresión no disponible', 'warning');
        return;
      }
      const data = await this.fetchConsultaDetalle(codconsulta);
      if (!data.receta?.lines?.length) {
        F.toast('La consulta no tiene receta con medicamentos', 'warning');
        return;
      }
      await ConsultorioRecetaPrint.imprimir(data);
    } catch (err) {
      F.toast(err.message || 'No se pudo imprimir', 'error');
    }
  },

  renderListTableBody(rows) {
    if (!rows.length) {
      this.initListPeriod();
      const period = `${this._listMes}/${this._listAnio}`;
      const msg = this._listFilter.trim()
        ? 'Sin coincidencias con el texto buscado'
        : `Sin consultas en ${period}`;
      return `<tr><td colspan="5" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map(
        (r) => `
        <tr>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
          <td class="text-nowrap">${this.escapeHtml(r.HORA || '—')}</td>
          <td>${this.escapeHtml(r.PACIENTE || '—')}</td>
          <td>${this.escapeHtml(this.formatTipo(r.TIPO))}</td>
          <td class="text-end cons-cons-acciones-cell">${this.listAccionesHtml(r)}</td>
        </tr>`
      )
      .join('');
  },

  renderListScreen() {
    this.initListPeriod();
    const rows = this.filteredListRows();
    return `
      <div class="catalogo-empresa-panel catalogo-vista-wrap consultorio-vista-wrap cons-cons-wrap position-relative">
        <h2 class="catalogo-vista-title h5 mb-2 px-1">Consultas</h2>
        ${this.renderListToolbarHtml()}
        ${this.renderListTotalsHtml()}
        <div class="table-responsive px-1">
          <table class="table table-sm table-hover table-striped">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Paciente</th>
                <th>Tipo</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="cons-cons-list-tbody">${this.renderListTableBody(rows)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-cons-cons-nuevo')}
      </div>`;
  },

  tipoModalHtml() {
    const cards = [
      { tipo: 'GENERAL', icon: 'fa-user-doctor', label: 'Consulta general', sub: 'Medicina general' },
      { tipo: 'GINECOLOGICA', icon: 'fa-venus', label: 'Consulta ginecológica', sub: 'Ginecología' },
      { tipo: 'DERMATOLOGIA', icon: 'fa-hand-dots', label: 'Consulta dermatología', sub: 'Dermatología' },
      { tipo: 'PEDIATRIA', icon: 'fa-baby', label: 'Consulta pediatría', sub: 'Pediatría' },
    ];
    return `
      <div class="row g-2 cons-cons-tipo-grid">
        ${cards
          .map(
            (c) => `
          <span class="col-12 col-sm-6">
            <button type="button" class="cons-cons-tipo-card w-100 text-start" data-cons-tipo="${c.tipo}">
              <i class="fa-solid ${c.icon} cons-cons-tipo-icon" aria-hidden="true"></i>
              <span class="cons-cons-tipo-label">${this.escapeHtml(c.label)}</span>
              <span class="cons-cons-tipo-sub small text-muted">${this.escapeHtml(c.sub)}</span>
            </button>
          </span>`
          )
          .join('')}
      </div>`;
  },

  async openTipoModal() {
    const tipoRef = { value: null };
    await Swal.fire({
      ...CatalogosUI.modalBase({ customClass: { popup: 'modal-catalogo cons-cons-tipo-modal' } }),
      title: 'Nueva consulta',
      html: this.tipoModalHtml(),
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      didOpen: (popup) => {
        popup?.querySelectorAll('[data-cons-tipo]').forEach((btn) => {
          btn.addEventListener('click', () => {
            tipoRef.value = btn.getAttribute('data-cons-tipo');
            Swal.close();
          });
        });
      },
    });
    return tipoRef.value;
  },

  renderEditorScreen() {
    const c = this._editorConsulta || this.emptyEditorConsulta();
    const pacNom = this._paciente?.NOMBRE || '';
    const pacCod = this._paciente?.CODPACIENTE ?? '';
    const editBadge =
      this._editingCodconsulta != null
        ? `<span class="badge text-bg-secondary ms-2">#${this.escapeHtml(this._editingCodconsulta)}</span>`
        : '';
    return `
      <div class="cons-consultas-editor consultorio-vista-wrap w-100">
        <div class="card shadow-sm mb-2 cons-cons-editor-toolbar flex-shrink-0">
          <div class="card-body py-2 d-flex flex-wrap align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-cons-cons-atras">
              <i class="fa-solid fa-arrow-left me-1"></i>Atrás
            </button>
            <span class="fw-semibold small">${this.escapeHtml(this.formatTipo(this._editorTipo))}${editBadge}</span>
          </div>
        </div>
        <div class="row g-2 cons-cons-editor-row align-items-stretch">
          <div class="col-lg-7 cons-cons-editor-left">
            <div class="card shadow-sm mb-2 cons-cons-compact">
              <div class="card-header py-2"><strong class="small">Paciente y motivo</strong></div>
              <div class="card-body">
                <div class="position-relative mb-2">
                  <label class="form-label small mb-0" for="cons-cons-pac-search">Paciente</label>
                  <div class="input-group input-group-sm">
                    <input type="search" class="form-control pos-search-glow" id="cons-cons-pac-search"
                      placeholder="Buscar paciente…" value="${this.escapeHtml(pacNom)}" autocomplete="off">
                    <button type="button" class="btn btn-outline-secondary" id="btn-cons-cons-historial" title="Historial clínico">
                      Historial
                    </button>
                    <button type="button" class="btn btn-success" id="btn-cons-cons-pac-nuevo" title="Nuevo paciente">
                      <i class="fa-solid fa-plus" aria-hidden="true"></i> Nuevo
                    </button>
                  </div>
                  <input type="hidden" id="cons-cons-pac-cod" value="${this.escapeHtml(pacCod)}">
                  <div id="cons-cons-pac-nombre" class="small text-muted mt-1">${pacCod ? this.escapeHtml(pacNom) : 'Seleccione un paciente'}</div>
                  <div id="cons-cons-pac-results" class="list-group position-absolute w-100 shadow-sm d-none cons-cons-pac-results"></div>
                </div>
                <div class="row g-2 mb-2 align-items-end">
                  <div class="col-6 col-md-4">
                    <label class="form-label small mb-0" for="cons-cons-fecha">Fecha</label>
                    <input type="date" class="form-control form-control-sm" id="cons-cons-fecha" value="${this.escapeHtml(c.FECHA)}">
                  </div>
                  <div class="col-6 col-md-3">
                    <label class="form-label small mb-0" for="cons-cons-hora">Hora</label>
                    <input type="time" class="form-control form-control-sm" id="cons-cons-hora" value="${this.escapeHtml(c.HORA)}">
                  </div>
                  <div class="col-12 col-md-5">
                    <label class="form-label small mb-0" for="cons-cons-edad-valor">Edad del paciente</label>
                    <div id="cons-cons-edad-valor" class="form-control form-control-sm cons-cons-edad-display border-0 px-0 text-danger fw-bold">
                      ${this.escapeHtml(this.edadPacienteLabel(this._paciente?.FECHA_NACIMIENTO, null))}
                    </div>
                  </div>
                </div>
                <label class="form-label small mb-0" for="cons-cons-motivo">Motivo de la consulta</label>
                <input type="text" class="form-control form-control-sm" id="cons-cons-motivo"
                  value="${this.escapeHtml(c.MOTIVO)}" autocomplete="off">
              </div>
            </div>
            <div class="card shadow-sm mb-2 cons-cons-compact">
              <div class="card-header py-1"><strong class="small">Signos vitales</strong></div>
              <div class="card-body py-2">
                <div class="row g-1">
                  <div class="col-6 col-md-4">
                    <label class="form-label small mb-0" for="cons-cons-pa">PA</label>
                    <input type="text" class="form-control form-control-sm" id="cons-cons-pa" placeholder="120/80"
                      value="${this.escapeHtml(c.PA)}">
                  </div>
                  <div class="col-6 col-md-4">
                    <label class="form-label small mb-0" for="cons-cons-fc">FC</label>
                    <input type="number" class="form-control form-control-sm" id="cons-cons-fc" min="0" step="1"
                      value="${this.escapeHtml(c.FC)}">
                  </div>
                  <div class="col-6 col-md-4">
                    <label class="form-label small mb-0" for="cons-cons-fr">FR</label>
                    <input type="number" class="form-control form-control-sm" id="cons-cons-fr" min="0" step="1"
                      value="${this.escapeHtml(c.FR)}">
                  </div>
                  <div class="col-6 col-md-4">
                    <label class="form-label small mb-0" for="cons-cons-temp">Temperatura °C</label>
                    <input type="number" class="form-control form-control-sm" id="cons-cons-temp" min="0" step="0.1"
                      value="${this.escapeHtml(c.TEMPERATURA)}">
                  </div>
                  <div class="col-6 col-md-4">
                    <label class="form-label small mb-0" for="cons-cons-peso">Peso (kg)</label>
                    <input type="number" class="form-control form-control-sm" id="cons-cons-peso" min="0" step="0.001"
                      value="${this.escapeHtml(c.PESO)}">
                  </div>
                  <div class="col-6 col-md-4">
                    <label class="form-label small mb-0" for="cons-cons-talla">Talla (cm)</label>
                    <input type="number" class="form-control form-control-sm" id="cons-cons-talla" min="0" step="1"
                      value="${this.escapeHtml(c.TALLA)}">
                  </div>
                </div>
              </div>
            </div>
            <div class="card shadow-sm cons-cons-compact">
              <div class="card-header py-1"><strong class="small">Evolución clínica</strong></div>
              <div class="card-body py-2">
                <div class="mb-1">
                  <label class="form-label small mb-0" for="cons-cons-sintomas">Síntomas</label>
                  <textarea class="form-control form-control-sm" id="cons-cons-sintomas" rows="2">${this.escapeHtml(c.SINTOMAS)}</textarea>
                </div>
                <div class="mb-1">
                  <label class="form-label small mb-0" for="cons-cons-impresion">Impresión diagnóstica</label>
                  <textarea class="form-control form-control-sm" id="cons-cons-impresion" rows="2">${this.escapeHtml(c.IMPRESION_DIAGNOSTICA)}</textarea>
                </div>
                <div>
                  <label class="form-label small mb-0" for="cons-cons-tratamiento">Tratamiento</label>
                  <textarea class="form-control form-control-sm" id="cons-cons-tratamiento" rows="2">${this.escapeHtml(c.TRATAMIENTO)}</textarea>
                </div>
              </div>
            </div>
          </div>
          <div class="col-lg-5 cons-cons-editor-right">
            <div class="card shadow-sm h-100 cons-cons-receta-card">
              <div class="card-header py-1">
                <i class="fa-solid fa-prescription-bottle-medical me-1 text-muted" aria-hidden="true"></i>
                <strong class="small">Receta médica</strong>
              </div>
              <div class="card-body py-2 d-flex flex-column" id="cons-cons-receta-host"></div>
            </div>
          </div>
        </div>
        <button type="button" class="btn-consulta-guardar-fab" id="btn-cons-cons-guardar"
          title="Guardar consulta" aria-label="Guardar consulta"${this._saving ? ' disabled' : ''}>
          <i class="fa-solid ${this._saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}" aria-hidden="true"></i>
        </button>
      </div>`;
  },

  renderAll() {
    if (!this._container) return;
    this._container.innerHTML =
      this._screen === 'list' ? this.renderListScreen() : this.renderEditorScreen();
    if (this._screen === 'list') this.bindListEvents();
    else {
      this.bindEditorEvents();
      this.mountRecetaPanel();
      this.syncEdadPacienteEnEditor();
    }
  },

  async mountRecetaPanel() {
    const host = this._container?.querySelector('#cons-cons-receta-host');
    if (!host || typeof ConsultorioRecetaPanel === 'undefined') return;
    ConsultorioRecetaPanel.reset();
    if (this._editingCodconsulta != null) {
      const row = this.findRow(this._editingCodconsulta);
      const coddoc = row?.CODDOC_RECETA;
      const corr = row?.CORRELATIVO_RECETA;
      if (coddoc && corr != null) {
        try {
          const data = await F.fetchJson(
            this.apiResource(`/consultas/${encodeURIComponent(this._editingCodconsulta)}/receta`),
            { cache: 'no-store' }
          );
          ConsultorioRecetaPanel.setLinesFromServer(data.lines || []);
          ConsultorioRecetaPanel._linkedDoc = `${coddoc} #${corr}`;
        } catch (err) {
          F.toast(err.message || 'No se cargó la receta', 'warning');
        }
      }
    }
    ConsultorioRecetaPanel.mount(host);
  },

  truncateHistorial(text, max = 120) {
    const s = String(text ?? '').trim();
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
  },

  async openHistorialPaciente() {
    const cod = parseInt(this._container?.querySelector('#cons-cons-pac-cod')?.value, 10);
    const nom = this._paciente?.NOMBRE || this._container?.querySelector('#cons-cons-pac-search')?.value || '';
    if (!Number.isFinite(cod) || cod <= 0) {
      F.toast('Seleccione un paciente', 'warning');
      return;
    }
    try {
      const params = { codpaciente: String(cod) };
      if (this._editingCodconsulta != null) params.excluirConsulta = String(this._editingCodconsulta);
      const data = await F.fetchJson(this.apiUrl('/consultas/historial-paciente', params), { cache: 'no-store' });
      const rows = data.rows || [];
      const tableRows = rows.length
        ? rows
            .map(
              (r) => `<tr>
            <td class="text-nowrap small">${this.escapeHtml(this.formatFecha(r.FECHA))} ${this.escapeHtml(r.HORA || '')}</td>
            <td class="small">${this.escapeHtml(this.truncateHistorial(r.MOTIVO))}</td>
            <td class="small">${this.escapeHtml(this.truncateHistorial(r.IMPRESION_DIAGNOSTICA))}</td>
            <td class="small">${this.escapeHtml(this.truncateHistorial(r.TRATAMIENTO))}</td>
          </tr>`
            )
            .join('')
        : `<tr><td colspan="4" class="text-center text-muted small py-3">Sin consultas anteriores</td></tr>`;
      await Swal.fire({
        ...CatalogosUI.modalBase({ customClass: { popup: 'modal-catalogo cons-cons-historial-modal' } }),
        title: `Historial — ${nom || 'Paciente'}`,
        width: 'min(920px, 96vw)',
        html: `
          <div class="table-responsive text-start">
            <table class="table table-sm table-striped table-hover mb-0">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Motivo</th>
                  <th>Impresión clínica</th>
                  <th>Tratamiento</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>`,
        confirmButtonText: 'Cerrar',
      });
    } catch (err) {
      F.toast(err.message || 'No se pudo cargar el historial', 'error');
    }
  },

  refreshListTable() {
    const tbody = this._container?.querySelector('#cons-cons-list-tbody');
    if (tbody) tbody.innerHTML = this.renderListTableBody(this.filteredListRows());
    const totals = this._container?.querySelector('#cons-cons-list-totals');
    if (totals) {
      const wrap = document.createElement('div');
      wrap.innerHTML = this.renderListTotalsHtml().trim();
      const fresh = wrap.firstElementChild;
      if (fresh) totals.replaceWith(fresh);
    }
  },

  async fetchConsultas() {
    const data = await F.fetchJson(this.apiUrl('/consultas'), { cache: 'no-store' });
    this._rows = data.rows || [];
  },

  async onNuevo() {
    const tipo = await this.openTipoModal();
    if (!tipo) return;
    if (tipo !== 'GENERAL') {
      F.toast('Opción aún no disponible', 'info');
      return;
    }
    this._editorTipo = tipo;
    this._editingCodconsulta = null;
    this._paciente = null;
    this._editorConsulta = this.emptyEditorConsulta();
    this.showEditor();
  },

  async onEditar(codconsulta) {
    const row = this.findRow(codconsulta);
    if (!row) return;
    if (String(row.TIPO || '').toUpperCase() !== 'GENERAL') {
      F.toast('Opción aún no disponible', 'info');
      return;
    }
    this._editingCodconsulta = row.CODCONSULTA;
    this._editorTipo = row.TIPO;
    this._paciente = { CODPACIENTE: row.CODPACIENTE, NOMBRE: row.PACIENTE || '', FECHA_NACIMIENTO: null };
    const pacRow = await this.fetchPacienteByCod(row.CODPACIENTE);
    if (pacRow) {
      this._paciente.FECHA_NACIMIENTO = pacRow.FECHA_NACIMIENTO ?? null;
    }
    this._editorConsulta = this.editorFromRow(row);
    this.showEditor();
  },

  async onEliminar(codconsulta) {
    const row = this.findRow(codconsulta);
    const label = row
      ? `${this.formatFecha(row.FECHA)} ${row.HORA || ''} — ${row.PACIENTE || ''}`
      : codconsulta;
    const auth = await CatalogosUI.authorizeEliminarRegistro({
      label,
      tipo: 'consulta',
      kind: 'registro',
      title: '¿Eliminar consulta?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(label)}</strong></p>`,
      confirmText: 'Eliminar',
    });
    if (!auth) return;
    try {
      await F.fetchJson(this.apiResource(`/consultas/${encodeURIComponent(codconsulta)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: auth.pass != null ? String(auth.pass) : '__AUTORIZADO__' }),
      });
      F.toast('Consulta eliminada', 'success');
      await this.fetchConsultas();
      this.refreshListTable();
    } catch (err) {
      F.toast(err.message || 'No se pudo eliminar', 'error');
    }
  },

  showEditor() {
    this._screen = 'editor';
    this.renderAll();
  },

  async showList() {
    this._screen = 'list';
    this._saving = false;
    try {
      await this.fetchConsultas();
    } catch (err) {
      F.toast(err.message, 'error');
    }
    this.renderAll();
  },

  readEditorPayload() {
    const cod = parseInt(this._container?.querySelector('#cons-cons-pac-cod')?.value, 10);
    const fecha = this._container?.querySelector('#cons-cons-fecha')?.value || '';
    let hora = this._container?.querySelector('#cons-cons-hora')?.value || '';
    if (hora.length >= 5) hora = hora.slice(0, 5);
    const numOrNull = (sel) => {
      const v = this._container?.querySelector(sel)?.value;
      if (v === '' || v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const intOrNull = (sel) => {
      const v = this._container?.querySelector(sel)?.value;
      if (v === '' || v == null) return null;
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : null;
    };
    const str = (sel) => String(this._container?.querySelector(sel)?.value ?? '').trim() || null;
    return {
      TIPO: this._editorTipo,
      CODPACIENTE: cod,
      FECHA: fecha,
      HORA: hora,
      MOTIVO: str('#cons-cons-motivo'),
      SINTOMAS: str('#cons-cons-sintomas'),
      PA: str('#cons-cons-pa'),
      FC: intOrNull('#cons-cons-fc'),
      FR: intOrNull('#cons-cons-fr'),
      TEMPERATURA: numOrNull('#cons-cons-temp'),
      PESO: numOrNull('#cons-cons-peso'),
      TALLA: intOrNull('#cons-cons-talla'),
      IMPRESION_DIAGNOSTICA: str('#cons-cons-impresion'),
      TRATAMIENTO: str('#cons-cons-tratamiento'),
      PACIENTE_NOMBRE: this._paciente?.NOMBRE || null,
      recetaLines:
        typeof ConsultorioRecetaPanel !== 'undefined' ? ConsultorioRecetaPanel.getLinesForSave() : [],
    };
  },

  async saveConsulta() {
    if (this._saving) return;
    const payload = this.readEditorPayload();
    if (!Number.isFinite(payload.CODPACIENTE) || payload.CODPACIENTE <= 0) {
      F.toast('Seleccione un paciente', 'warning');
      return;
    }
    if (!payload.FECHA) {
      F.toast('Indique la fecha', 'warning');
      return;
    }
    if (!payload.HORA) {
      F.toast('Indique la hora', 'warning');
      return;
    }
    this._saving = true;
    const btn = this._container?.querySelector('#btn-cons-cons-guardar');
    if (btn) {
      btn.disabled = true;
      btn.querySelector('i')?.classList.replace('fa-floppy-disk', 'fa-spinner');
      btn.querySelector('i')?.classList.add('fa-spin');
    }
    try {
      const isEdit = this._editingCodconsulta != null;
      const url = isEdit
        ? this.apiResource(`/consultas/${encodeURIComponent(this._editingCodconsulta)}`)
        : this.apiUrl('/consultas');
      await F.fetchJson(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      F.toast(isEdit ? 'Consulta actualizada' : 'Consulta guardada', 'success');
      await this.showList();
    } catch (err) {
      F.toast(err.message || 'No se pudo guardar', 'error');
      this._saving = false;
      if (btn) {
        btn.disabled = false;
        const ic = btn.querySelector('i');
        ic?.classList.remove('fa-spin', 'fa-spinner');
        ic?.classList.add('fa-floppy-disk');
      }
    }
  },

  async buscarPacientes(q) {
    return F.fetchJson(this.apiUrl('/pacientes/buscar', { q, limit: '15' }), { cache: 'no-store' });
  },

  bindListEvents() {
    if (this._container && !this._container.dataset.consListBound) {
      this._container.dataset.consListBound = '1';
      this._container.addEventListener('click', (e) => {
        if (this._screen !== 'list') return;
        const detBtn = e.target.closest('.btn-cons-detalle[data-codconsulta]');
        if (detBtn) {
          this.onDetalles(detBtn.dataset.codconsulta).catch((err) => F.toast(err.message, 'error'));
          return;
        }
        const printBtn = e.target.closest('.btn-cons-imprimir-receta[data-codconsulta]');
        if (printBtn) {
          this.onImprimirReceta(printBtn.dataset.codconsulta).catch((err) => F.toast(err.message, 'error'));
          return;
        }
        const editBtn = e.target.closest('.btn-catalogo-editar[data-codconsulta]');
        if (editBtn) {
          this.onEditar(editBtn.dataset.codconsulta).catch((err) => F.toast(err.message, 'error'));
          return;
        }
        const delBtn = e.target.closest('.btn-catalogo-eliminar[data-codconsulta]');
        if (delBtn) {
          this.onEliminar(delBtn.dataset.codconsulta).catch((err) => F.toast(err.message, 'error'));
        }
      });
    }
    this._container?.querySelector('#btn-cons-cons-nuevo')?.addEventListener('click', () => {
      this.onNuevo().catch((e) => F.toast(e.message, 'error'));
    });
    const mesSel = this._container?.querySelector('#cons-cons-list-mes');
    const anioSel = this._container?.querySelector('#cons-cons-list-anio');
    mesSel?.addEventListener('change', () => {
      this._listMes = parseInt(mesSel.value, 10) || this._listMes;
      this.refreshListTable();
    });
    anioSel?.addEventListener('change', () => {
      this._listAnio = parseInt(anioSel.value, 10) || this._listAnio;
      this.refreshListTable();
    });
    const search = this._container?.querySelector('#cons-cons-list-search');
    search?.addEventListener('input', F.debounce(() => {
      this._listFilter = search.value;
      this.refreshListTable();
    }, 200));
    this._container?.querySelector('#btn-cons-cons-list-clear')?.addEventListener('click', () => {
      if (search) search.value = '';
      this._listFilter = '';
      this.refreshListTable();
      search?.focus();
    });
  },

  bindEditorEvents() {
    this._container?.querySelector('#btn-cons-cons-atras')?.addEventListener('click', () => {
      this.showList();
    });
    this._container?.querySelector('#btn-cons-cons-guardar')?.addEventListener('click', () => {
      this.saveConsulta().catch((e) => F.toast(e.message, 'error'));
    });
    this._container?.querySelector('#btn-cons-cons-historial')?.addEventListener('click', () => {
      this.openHistorialPaciente().catch((e) => F.toast(e.message, 'error'));
    });
    this._container?.querySelector('#btn-cons-cons-pac-nuevo')?.addEventListener('click', () => {
      this.openNuevoPacienteModal().catch((e) => F.toast(e.message, 'error'));
    });

    const inp = this._container?.querySelector('#cons-cons-pac-search');
    const list = this._container?.querySelector('#cons-cons-pac-results');
    const codInp = this._container?.querySelector('#cons-cons-pac-cod');
    const nomEl = this._container?.querySelector('#cons-cons-pac-nombre');
    if (!inp || !list) return;

    const runSearch = F.debounce(async () => {
      const q = inp.value.trim();
      if (q.length < 1) {
        list.classList.add('d-none');
        return;
      }
      try {
        const data = await this.buscarPacientes(q);
        const rows = data.rows || [];
        if (!rows.length) {
          list.innerHTML = '<div class="list-group-item small text-muted">Sin resultados</div>';
        } else {
          list.innerHTML = rows
            .map(
              (p) => {
                const edad = this.edadPacienteLabel(p.FECHA_NACIMIENTO, null);
                return `<button type="button" class="list-group-item list-group-item-action small"
                  data-codpaciente="${p.CODPACIENTE}"
                  data-fechanac="${this.escapeHtml(p.FECHA_NACIMIENTO || '')}">
                  <strong>${this.escapeHtml(p.NOMBRE)}</strong>
                  <span class="text-muted d-block">
                    ${edad !== '—' ? `<span class="text-danger fw-semibold">${this.escapeHtml(edad)}</span> · ` : ''}
                    ${this.escapeHtml(p.TELEFONOS || '')} ${this.escapeHtml(p.EMAIL || '')}
                  </span>
                </button>`;
              }
            )
            .join('');
        }
        list.classList.remove('d-none');
      } catch (err) {
        list.innerHTML = `<div class="list-group-item text-danger small">${this.escapeHtml(err.message)}</div>`;
        list.classList.remove('d-none');
      }
    }, 300);

    inp.addEventListener('input', runSearch);
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-codpaciente]');
      if (!btn) return;
      const cod = parseInt(btn.getAttribute('data-codpaciente'), 10);
      const nom = btn.querySelector('strong')?.textContent || '';
      const fnac = btn.getAttribute('data-fechanac') || '';
      this._paciente = {
        CODPACIENTE: cod,
        NOMBRE: nom,
        FECHA_NACIMIENTO: fnac || null,
      };
      if (codInp) codInp.value = String(cod);
      if (nomEl) nomEl.textContent = nom;
      inp.value = nom;
      list.classList.add('d-none');
      this.syncEdadPacienteEnEditor();
    });

    this._container?.addEventListener('click', (e) => {
      if (!inp.contains(e.target) && !list.contains(e.target)) list.classList.add('d-none');
    });
  },

  async load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');
    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese de nuevo.
        </div>`;
      return;
    }
    this._screen = 'list';
    this._listFilter = '';
    this.initListPeriod();
    this._saving = false;
    container.innerHTML = `<p class="text-muted small p-3"><i class="fa-solid fa-spinner fa-spin"></i> Cargando…</p>`;
    try {
      await this.fetchConsultas();
      this.renderAll();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger m-3">${this.escapeHtml(err.message)}</div>`;
    }
  },
};