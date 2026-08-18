/**
 * Vista Documentos — listado por mes, año y tipo (TIPODOC).
 */
const DOCUMENTOS_MESES = [
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

const DOCUMENTOS_ANIOS = [];
for (let y = 2020; y <= 2027; y += 1) {
  DOCUMENTOS_ANIOS.push({ value: y, label: String(y) });
}

function documentosFormatDateDdMmYyyy(value) {
  if (value === null || value === undefined || value === '') return '—';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return '—';
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
}

const DocumentosView = {
  _container: null,
  _rows: [],
  _totalCount: 0,
  _listTruncated: false,
  _filterQuery: '',
  _mes: null,
  _anio: null,
  _tipodoc: '',
  _tipos: [],
  _loading: false,
  _urlFel: '',

  FEL_TIPOS_ANULABLES: ['FEF', 'FEC', 'FNC'],

  tableColumns: [
    { key: 'FECHA', label: 'Fecha doc.', type: 'date' },
    { key: 'CORRELATIVO', label: 'Correlativo' },
    { key: 'CODDOC', label: 'Cod. doc.' },
    { key: 'DESDOC', label: 'Descripción', cellClass: 'documentos-col-desc' },
    { key: 'DOC_NOMCLIE', label: 'Cliente' },
    { key: 'NEGOCIO', label: 'Negocio' },
    { key: 'VENDEDOR', label: 'Vendedor', cellClass: 'documentos-col-vendedor' },
    { key: 'TOTALPRECIO', label: 'Total', type: 'money' },
    { key: 'STATUS', label: 'Estado', type: 'status' },
    { key: 'CONCRE', label: 'Pago' },
    { key: 'ID_COLA_TRABAJO', label: 'ColaTrabajo' },
  ],

  defaultPeriod() {
    const now = new Date();
    let anio = now.getFullYear();
    if (anio < 2020) anio = 2020;
    if (anio > 2027) anio = 2027;
    return { mes: now.getMonth() + 1, anio };
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  buildListParams() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      mes: String(this._mes),
      anio: String(this._anio),
      tipodoc: this._tipodoc,
    });
    const q = this._filterQuery.trim();
    if (q) params.set('q', q);
    return params;
  },

  apiUrlLista() {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const params = this.buildListParams();
    params.set('limit', '500');
    params.set('_', String(Date.now()));
    return `/api/documentos/lista?${params.toString()}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  cellValue(row, key) {
    if (!row) return null;
    const k = String(key);
    let val = row[k];
    if (val === undefined) val = row[k.toUpperCase()];
    if (val === undefined) val = row[k.toLowerCase()];
    return val;
  },

  formatCell(value, col) {
    if (col?.type === 'date') {
      return this.escapeHtml(documentosFormatDateDdMmYyyy(value));
    }
    if (col?.type === 'status') {
      const s = String(value ?? '').trim().toUpperCase() || '—';
      const cls =
        s === 'A'
          ? 'documentos-status badge documentos-status-anulado'
          : 'documentos-status badge text-bg-light border';
      return `<span class="${cls}">${this.escapeHtml(s)}</span>`;
    }
    if (value === null || value === undefined || value === '') return '—';
    if (col?.type === 'money') {
      return `<span class="documentos-money">${this.escapeHtml(this.formatMoney(value))}</span>`;
    }
    return this.escapeHtml(value);
  },

  felUudiValue(row) {
    return String(row?.FEL_UUDI ?? row?.FEL ?? '').trim();
  },

  puedeAnularFel(row) {
    if (!row) return false;
    const status = String(row.STATUS ?? '').trim().toUpperCase();
    if (status === 'A') return false;
    if (!this.felUudiValue(row)) return false;
    const tipodoc = String(row.TIPODOC ?? '').trim().toUpperCase();
    return this.FEL_TIPOS_ANULABLES.includes(tipodoc);
  },

  isAnulado(row) {
    return String(row?.STATUS ?? '').trim().toUpperCase() === 'A';
  },

  rowClass(row) {
    const classes = ['documentos-row-clickable'];
    if (this.isAnulado(row)) classes.push('documentos-row-anulado');
    return classes.join(' ');
  },

  buildMenuOpciones(row) {
    const items = [];
    if (DocOpciones.puedeEditar(row)) {
      items.push({
        id: 'editar',
        label: 'Editar',
        icon: 'fa-pen',
        className: 'documentos-menu-item-primary',
      });
    }
    items.push({
      id: 'imprimir',
      label: 'Imprimir',
      icon: 'fa-print',
      className: 'documentos-menu-item-secondary',
    });
    items.push({
      id: 'trazabilidad',
      label: 'Trazabilidad',
      icon: 'fa-diagram-project',
      className: 'documentos-menu-item-secondary',
    });
    if (DocOpciones.puedeCambiarFecha(row)) {
      items.push({
        id: 'cambiar-fecha',
        label: 'Cambiar Fecha',
        icon: 'fa-calendar-day',
        className: 'documentos-menu-item-secondary',
      });
    }
    if (DocOpciones.puedeCambiarCaja(row)) {
      items.push({
        id: 'cambiar-caja',
        label: 'Cambiar caja',
        icon: 'fa-cash-register',
        className: 'documentos-menu-item-secondary',
      });
    }
    if (DocOpciones.puedeCambiarSerieInterna(row)) {
      items.push({
        id: 'cambiar-serie',
        label: 'Cambiar serie interna',
        icon: 'fa-right-left',
        className: 'documentos-menu-item-secondary',
      });
    }
    if (DocOpciones.puedeCambiarStatus(row)) {
      items.push({
        id: 'cambiar-status',
        label: 'Cambiar Status',
        icon: 'fa-toggle-on',
        className: 'documentos-menu-item-secondary',
      });
    }
    if (DocOpciones.puedeCertificarFel(row)) {
      items.push({
        id: 'certificar',
        label: 'Certificar',
        icon: 'fa-certificate',
        className: 'documentos-menu-item-success',
      });
    }
    if (DocOpciones.puedeVerFelOnline(row)) {
      items.push({
        id: 'ver-fel',
        label: 'Ver formato FEL online',
        icon: 'fa-file-invoice',
        className: 'documentos-menu-item-secondary',
      });
    }
    if (this.puedeAnularFel(row)) {
      items.push({
        id: 'anular',
        label: 'Anular',
        icon: 'fa-ban',
        className: 'documentos-menu-item-danger',
      });
    }
    items.push({
      id: 'whatsapp',
      label: 'Enviar por WhatsApp',
      icon: 'fa-brands fa-whatsapp',
      className: 'documentos-menu-item-whatsapp',
    });
    if (DocOpciones.puedeEliminar(row)) {
      items.push({
        id: 'eliminar',
        label: 'Eliminar',
        icon: 'fa-trash',
        className: 'documentos-menu-item-danger',
      });
    }
    return items;
  },

  renderMenuOpcionesHtml(row) {
    const items = this.buildMenuOpciones(row);
    if (!items.length) {
      return '<p class="text-muted small mb-0">No hay acciones disponibles.</p>';
    }
    return `<div class="documentos-menu-opciones">${items
      .map(
        (item) => `<button type="button" class="documentos-menu-item ${item.className}"
          data-doc-action="${this.escapeHtml(item.id)}">
          <i class="fa-solid ${item.icon} documentos-menu-item-icon" aria-hidden="true"></i>
          <span>${this.escapeHtml(item.label)}</span>
        </button>`
      )
      .join('')}</div>`;
  },

  findRow(coddoc, correlativo) {
    return this._rows.find(
      (r) =>
        String(r.CODDOC) === String(coddoc) &&
        String(r.CORRELATIVO) === String(correlativo)
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
        <p class="small text-muted text-start mb-2">${this.escapeHtml(label)}</p>
        ${this.renderMenuOpcionesHtml(row)}
      `,
      width: 360,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
      didOpen: () => {
        const popup = Swal.getPopup();
        popup?.querySelectorAll('[data-doc-action]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const action = btn.getAttribute('data-doc-action');
            Swal.close();
            await this.handleDocMenuAction(action, row);
          });
        });
      },
    });
  },

  async handleDocMenuAction(action, row) {
    const coddoc = row.CODDOC;
    const correlativo = row.CORRELATIVO;
    const label = this.docLabel(row);
    try {
      if (action === 'imprimir') {
        await DocOpciones.imprimir(coddoc, correlativo, row);
        return;
      }
      if (action === 'editar') {
        const ok = await CatalogosUI.fireConfirm({
          title: '¿Editar documento?',
          html: `<p class="mb-0">Se abrirá el editor del documento <strong>${this.escapeHtml(label)}</strong>.</p>`,
          icon: 'question',
          confirmText: 'Editar',
        });
        if (!ok) return;
        await DocOpciones.abrirEditor(row.TIPODOC, coddoc, correlativo);
        return;
      }
      if (action === 'eliminar') {
        const deleted = await DocOpciones.eliminar(coddoc, correlativo, label, row);
        if (deleted) await this.reload();
        return;
      }
      if (action === 'anular') {
        await this.anularDocumentoFel(coddoc, correlativo);
        return;
      }
      if (action === 'cambiar-fecha') {
        await this.cambiarFechaDocumento(row);
        return;
      }
      if (action === 'cambiar-caja') {
        await this.cambiarCajaDocumento(row);
        return;
      }
      if (action === 'cambiar-serie') {
        await this.cambiarSerieInternaDocumento(row);
        return;
      }
      if (action === 'cambiar-status') {
        await this.cambiarStatusDocumento(row);
        return;
      }
      if (action === 'certificar') {
        await this.certificarDocumento(coddoc, correlativo, label);
        return;
      }
      if (action === 'ver-fel') {
        await this.abrirFelDocumento(this.felUudiValue(row));
        return;
      }
      if (action === 'whatsapp') {
        await DocOpciones.enviarWhatsapp(coddoc, correlativo, row);
        return;
      }
      if (action === 'trazabilidad') {
        await this.showTrazabilidadDocumento(row);
      }
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo completar la acción', 'error');
    }
  },

  async showTrazabilidadDocumento(row) {
    const coddoc = String(row?.CODDOC ?? '').trim();
    const correlativo = row?.CORRELATIVO;
    if (!coddoc || correlativo == null) {
      F.toast('Documento inválido', 'warning');
      return;
    }
    const label = this.docLabel(row);
    const url =
      `/api/documentos/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/trazabilidad` +
      `?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`;
    const data = await F.fetchJson(url);
    const rows = data?.rows || [];
    const bodyHtml = rows.length
      ? `<div class="table-responsive text-start">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light">
              <tr>
                <th>Fecha</th>
                <th>Doc.</th>
                <th>Tipo</th>
                <th>Correlativo</th>
                <th>Cliente</th>
                <th class="text-end">Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (r) => `<tr>
                    <td>${this.escapeHtml(documentosFormatDateDdMmYyyy(r.FECHA))}</td>
                    <td>${this.escapeHtml(r.CODDOC || '—')}</td>
                    <td>${this.escapeHtml(r.TIPODOC || r.DESDOC || '—')}</td>
                    <td>${this.escapeHtml(r.CORRELATIVO ?? '—')}</td>
                    <td>${this.escapeHtml(r.DOC_NOMCLIE || '—')}</td>
                    <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
                    <td>${this.escapeHtml(r.STATUS || '—')}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`
      : '<p class="text-muted small mb-0 text-start">No hay documentos asociados (SERIEFAC / NOFAC).</p>';

    await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Trazabilidad',
      html: `
        <p class="small text-muted text-start mb-2">${this.escapeHtml(label)}</p>
        ${bodyHtml}
      `,
      width: Math.min(760, window.innerWidth - 32),
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
    });
  },

  docLabel(row) {
    const coddoc = String(row?.CODDOC ?? '').trim();
    const corr = String(row?.CORRELATIVO ?? '').trim();
    const cliente = String(row?.DOC_NOMCLIE ?? '').trim();
    const parts = [`${coddoc} · ${corr}`];
    if (cliente) parts.push(cliente);
    return parts.join(' — ');
  },

  async abrirFelDocumento(felValue) {
    const fel = String(felValue ?? '').trim();
    if (!fel) return;
    if (!this._urlFel) {
      try {
        this._urlFel = await DocOpciones.fetchUrlFel();
      } catch (err) {
        F.toast(err.message || 'No se pudo leer la URL FEL', 'error');
        return;
      }
    }
    if (!this._urlFel) {
      F.toast('Configure la URL FEL en Config general', 'warning');
      return;
    }
    const url = DocOpciones.joinFelUrl(this._urlFel, fel);
    if (!url) {
      F.toast('No se pudo construir la URL del documento FEL', 'warning');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  async certificarDocumento(coddoc, correlativo, label) {
    const ok = await CatalogosUI.fireConfirm({
      title: 'Certificar documento',
      html: `<p class="mb-0">¿Certificar el documento <strong>${this.escapeHtml(label)}</strong> ante SAT (Infile)?</p>`,
      icon: 'question',
      confirmText: 'CERTIFICAR',
      confirmClass: 'btn-catalogo-guardar',
    });
    if (!ok) return;
    try {
      await DocOpciones.certificarYMostrarFormatos(coddoc, correlativo, {
        onImprimirSistema: () => DocOpciones.imprimir(coddoc, correlativo),
      });
      await this.reload();
    } catch (err) {
      F.alert('Error FEL', err.message || 'No se pudo certificar', 'error');
    }
  },

  async cambiarFechaDocumento(row) {
    const coddoc = row.CODDOC;
    const correlativo = row.CORRELATIVO;
    const fechaActual = DocOpciones.fechaInputFromRow(row);
    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Cambiar fecha',
      html: `
        <form class="catalogo-form text-start" autocomplete="off" novalidate onsubmit="return false">
          <label for="documentos-fecha-actual" class="form-label small mb-0">Fecha actual</label>
          <input type="date" class="form-control form-control-sm mb-3" id="documentos-fecha-actual"
            value="${this.escapeHtml(fechaActual)}" disabled>
          <label for="documentos-fecha-nueva" class="form-label small mb-0">Nueva fecha</label>
          <input type="date" class="form-control form-control-sm" id="documentos-fecha-nueva"
            value="${this.escapeHtml(fechaActual)}">
        </form>
      `,
      width: 400,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Aceptar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        document.getElementById('documentos-fecha-nueva')?.focus();
      },
      preConfirm: () => {
        const nueva = String(document.getElementById('documentos-fecha-nueva')?.value ?? '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(nueva)) {
          Swal.showValidationMessage('Seleccione una fecha válida');
          return false;
        }
        if (nueva === fechaActual) {
          Swal.showValidationMessage('La nueva fecha debe ser distinta a la actual');
          return false;
        }
        return nueva;
      },
    });
    if (!result.isConfirmed) return;
    await DocOpciones.cambiarFecha(coddoc, correlativo, result.value);
    await this.reload();
  },

  async cambiarCajaDocumento(row) {
    const coddoc = row.CODDOC;
    const correlativo = row.CORRELATIVO;
    const codcajaActual = Number(row.CODCAJA) || 0;
    let cajas = [];
    try {
      cajas = await DocOpciones.fetchCajas();
    } catch (err) {
      F.alert('Error', err.message || 'No se pudo cargar el listado de cajas', 'error');
      return;
    }
    if (!cajas.length) {
      F.toast('No hay cajas registradas', 'warning');
      return;
    }
    const opts = cajas
      .map((c) => {
        const id = Number(c.CODCAJA);
        const desc = String(c.DESCAJA || '').trim() || `Caja ${id}`;
        const sel = id === codcajaActual ? ' selected' : '';
        return `<option value="${id}"${sel}>${this.escapeHtml(desc)}</option>`;
      })
      .join('');
    const descActual = String(row.DESCAJA || '').trim() || (codcajaActual ? `Caja ${codcajaActual}` : '—');
    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Cambiar caja',
      html: `
        <form class="catalogo-form text-start" autocomplete="off" novalidate onsubmit="return false">
          <p class="small text-muted mb-2">Caja actual: <strong>${this.escapeHtml(descActual)}</strong></p>
          <label for="documentos-caja-nueva" class="form-label small mb-0">Nueva caja</label>
          <select class="form-select form-select-sm" id="documentos-caja-nueva">${opts}</select>
        </form>
      `,
      width: 400,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Aceptar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      preConfirm: () => {
        const val = parseInt(document.getElementById('documentos-caja-nueva')?.value, 10);
        if (Number.isNaN(val) || val <= 0) {
          Swal.showValidationMessage('Seleccione una caja válida');
          return false;
        }
        if (val === codcajaActual) {
          Swal.showValidationMessage('Seleccione una caja distinta a la actual');
          return false;
        }
        return val;
      },
    });
    if (!result.isConfirmed) return;
    await DocOpciones.cambiarCaja(coddoc, correlativo, result.value);
    await this.reload();
  },

  async cambiarSerieInternaDocumento(row) {
    const coddoc = String(row.CODDOC || '').trim();
    const correlativo = row.CORRELATIVO;
    let data;
    try {
      data = await DocOpciones.fetchSeriesAlternas(coddoc, correlativo);
    } catch (err) {
      F.alert('Error', err.message || 'No se pudieron cargar las series', 'error');
      return;
    }
    const series = data?.rows || [];
    if (!series.length) {
      F.toast('No hay otras series habilitadas del mismo tipo de documento', 'warning');
      return;
    }
    const tipodoc = String(data?.origen?.TIPODOC || row.TIPODOC || '').trim().toUpperCase();
    const opts = series
      .map((s, i) => {
        const cod = String(s.CODDOC || '').trim();
        const des = String(s.DESDOC || '').trim() || cod;
        const next = s.SIGUIENTE_CORRELATIVO ?? '';
        const sel = i === 0 ? ' selected' : '';
        return `<option value="${this.escapeHtml(cod)}" data-next="${this.escapeHtml(String(next))}"${sel}>${this.escapeHtml(cod)} — ${this.escapeHtml(des)}</option>`;
      })
      .join('');
    const firstNext = series[0]?.SIGUIENTE_CORRELATIVO ?? '—';

    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Cambiar serie interna',
      html: `
        <form class="catalogo-form text-start" autocomplete="off" novalidate onsubmit="return false">
          <p class="small text-muted mb-2">Tipo: <strong>${this.escapeHtml(tipodoc || '—')}</strong></p>
          <label class="form-label small mb-0">Serie actual (CODDOC)</label>
          <input type="text" class="form-control form-control-sm mb-2" value="${this.escapeHtml(coddoc)}" disabled>
          <label class="form-label small mb-0">Correlativo actual</label>
          <input type="text" class="form-control form-control-sm mb-3" value="${this.escapeHtml(String(correlativo ?? ''))}" disabled>
          <label for="documentos-serie-nueva" class="form-label small mb-0">Nueva serie</label>
          <select class="form-select form-select-sm mb-2" id="documentos-serie-nueva">${opts}</select>
          <p class="small text-muted mb-0">Nuevo correlativo: <strong id="documentos-serie-next">${this.escapeHtml(String(firstNext))}</strong></p>
          <p class="small text-muted mt-2 mb-0">También se actualizarán documentos asociados (SERIEFAC / NOFAC) y abonos vinculados.</p>
        </form>
      `,
      width: 440,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Cambiar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        const sel = document.getElementById('documentos-serie-nueva');
        const nextEl = document.getElementById('documentos-serie-next');
        const syncNext = () => {
          const opt = sel?.selectedOptions?.[0];
          if (nextEl) nextEl.textContent = opt?.getAttribute('data-next') || '—';
        };
        sel?.addEventListener('change', syncNext);
        sel?.focus();
      },
      preConfirm: () => {
        const val = String(document.getElementById('documentos-serie-nueva')?.value ?? '').trim();
        if (!val) {
          Swal.showValidationMessage('Seleccione una serie destino');
          return false;
        }
        if (val.toUpperCase() === coddoc.toUpperCase()) {
          Swal.showValidationMessage('Seleccione una serie distinta a la actual');
          return false;
        }
        return val;
      },
    });
    if (!result.isConfirmed) return;

    const ok = await CatalogosUI.fireConfirm({
      title: '¿Cambiar serie interna?',
      html: `<p class="mb-0">El documento <strong>${this.escapeHtml(coddoc)} · ${this.escapeHtml(String(correlativo ?? ''))}</strong>
        pasará a la serie <strong>${this.escapeHtml(result.value)}</strong> con el siguiente correlativo disponible.
        Los documentos asociados también se actualizarán.</p>`,
      icon: 'warning',
      confirmText: 'Cambiar',
    });
    if (!ok) return;

    await DocOpciones.cambiarSerieInterna(coddoc, correlativo, result.value);
    await this.reload();
  },

  async cambiarStatusDocumento(row) {
    const coddoc = row.CODDOC;
    const correlativo = row.CORRELATIVO;
    const actual = String(row.STATUS || '').trim().toUpperCase();
    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Cambiar Status',
      html: `
        <form class="catalogo-form text-start" autocomplete="off" novalidate onsubmit="return false">
          <p class="small text-muted mb-2">Status actual: <strong>${this.escapeHtml(actual || '—')}</strong></p>
          <label for="documentos-status-nuevo" class="form-label small mb-0">Nuevo status</label>
          <select class="form-select form-select-sm" id="documentos-status-nuevo">
            <option value="O"${actual === 'O' ? ' selected' : ''}>O — Operado</option>
            <option value="I"${actual === 'I' ? ' selected' : ''}>I — Bloqueado</option>
          </select>
          <p class="small text-muted mt-2 mb-0">La anulación (A) es un proceso aparte.</p>
        </form>
      `,
      width: 400,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Aceptar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      preConfirm: () => {
        const val = String(document.getElementById('documentos-status-nuevo')?.value || '')
          .trim()
          .toUpperCase();
        if (val !== 'O' && val !== 'I') {
          Swal.showValidationMessage('Seleccione O o I');
          return false;
        }
        if (val === actual) {
          Swal.showValidationMessage('Seleccione un status distinto al actual');
          return false;
        }
        return val;
      },
    });
    if (!result.isConfirmed) return;
    await DocOpciones.cambiarStatus(coddoc, correlativo, result.value);
    await this.reload();
  },

  async solicitarMotivoAnulacion() {
    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Motivo de anulación',
      html: `
        <form class="catalogo-form text-start" autocomplete="off" novalidate onsubmit="return false">
          <p class="small text-muted mb-2">Indique el motivo que se enviará a SAT (máx. 255 caracteres).</p>
          <label for="documentos-motivo-anulacion" class="form-label small mb-0">Motivo</label>
          <textarea id="documentos-motivo-anulacion" class="form-control form-control-sm" rows="3"
            maxlength="255" placeholder="Ej. Error en datos del cliente"></textarea>
        </form>
      `,
      width: 460,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Continuar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        document.getElementById('documentos-motivo-anulacion')?.focus();
      },
      preConfirm: () => {
        const motivo = String(document.getElementById('documentos-motivo-anulacion')?.value ?? '').trim();
        if (!motivo) {
          Swal.showValidationMessage('Ingrese el motivo de anulación');
          return false;
        }
        return motivo;
      },
    });
    return result.isConfirmed ? result.value : null;
  },

  async confirmAnularFel(row) {
    const label = this.escapeHtml(this.docLabel(row));
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Anular documento FEL?',
      html: `<p class="mb-2">Se anulará ante SAT el documento:</p>
        <p class="mb-0"><strong>${label}</strong></p>
        <p class="small text-muted mt-2 mb-0">UUID: ${this.escapeHtml(this.felUudiValue(row))}</p>`,
      icon: 'warning',
      confirmText: 'Continuar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!ok) return null;

    const motivo = await this.solicitarMotivoAnulacion();
    if (!motivo) return null;

    const adminPass = await F.solicitarClaveAdmin({
      title: 'Autorizar anulación',
      text: 'Ingrese la clave de administrador para anular el documento ante SAT.',
      confirmText: 'Anular',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!adminPass) return null;

    return { motivo, adminPass };
  },

  async anularDocumentoFel(coddoc, correlativo) {
    const row = this._rows.find(
      (r) =>
        String(r.CODDOC) === String(coddoc) &&
        String(r.CORRELATIVO) === String(correlativo)
    );
    if (!row || !this.puedeAnularFel(row)) {
      F.toast('Este documento no se puede anular', 'warning');
      return;
    }

    if (typeof AutorizacionesUI !== 'undefined') {
      const allowed = await AutorizacionesUI.gateAccionDocumento({
        accion: 'anular',
        coddoc,
        correlativo,
        tipodoc: row.TIPODOC,
        label: this.docLabel(row),
      });
      if (!allowed) return;
    }

    const auth = await this.confirmAnularFel(row);
    if (!auth) return;

    try {
      const url = `/api/fel/anular/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}?empnit=${encodeURIComponent(F.getEmpNit())}`;
      const data = await F.fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo: auth.motivo,
          adminPass: auth.adminPass,
        }),
      });
      F.toast(
        `Documento anulado — UUID ${data.fel?.uuid || this.felUudiValue(row)}`,
        'success'
      );
      await this.reload();
    } catch (err) {
      F.alert('Error FEL', err.message || 'No se pudo anular el documento', 'error');
    }
  },

  tableColSpan() {
    return this.tableColumns.length;
  },

  renderTableBodyHtml(rows) {
    const colSpan = this.tableColSpan();
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún documento coincide con la búsqueda'
        : 'Sin documentos para el periodo y tipo seleccionados';
      return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const coddoc = this.escapeHtml(row.CODDOC);
        const corr = this.escapeHtml(row.CORRELATIVO);
        const cells = this.tableColumns
          .map((c) => {
            const align = c.type === 'money' ? ' text-end' : '';
            const extra = c.cellClass ? ` ${c.cellClass}` : '';
            const val = this.cellValue(row, c.key);
            return `<td class="${`${align}${extra}`.trim()}">${this.formatCell(val, c)}</td>`;
          })
          .join('');
        return `<tr class="${this.rowClass(row)}" data-doc-row data-coddoc="${coddoc}" data-correlativo="${corr}"
          role="button" tabindex="0" title="Opciones del documento" aria-label="Opciones del documento ${coddoc} ${corr}">${cells}</tr>`;
      })
      .join('');
  },

  mesLabel(mes) {
    const found = DOCUMENTOS_MESES.find((m) => m.value === Number(mes));
    return found ? found.label : String(mes ?? '');
  },

  tipodocLabel() {
    const found = this._tipos.find((t) => String(t.TIPODOC).toUpperCase() === String(this._tipodoc).toUpperCase());
    if (found) {
      const code = String(found.TIPODOC || '').toUpperCase();
      const desc = found.DESCRIPCION || '';
      return desc ? `${code} — ${desc}` : code;
    }
    return this._tipodoc || '—';
  },

  badgeText() {
    const empNombre = F.getEmpNitNombre();
    const extra = empNombre ? ` · ${empNombre}` : '';
    const shown = this._rows.length;
    const total = this._totalCount;
    let countLabel;
    if (this._listTruncated && shown < total) {
      countLabel = `Mostrando ${shown} de ${total}`;
    } else {
      countLabel = `${total}`;
    }
    return `<i class="fa-solid fa-file-lines me-1"></i>${countLabel} documento(s) — ${this.mesLabel(this._mes)} ${this._anio} · ${this.escapeHtml(this.tipodocLabel())}${this.escapeHtml(extra)}`;
  },

  renderFiltersCard() {
    const mesOpts = DOCUMENTOS_MESES.map(
      (m) =>
        `<option value="${m.value}"${Number(this._mes) === m.value ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const anioOpts = DOCUMENTOS_ANIOS.map(
      (a) =>
        `<option value="${a.value}"${Number(this._anio) === a.value ? ' selected' : ''}>${a.label}</option>`
    ).join('');
    const tipoOpts = this._tipos
      .map((t) => {
        const code = String(t.TIPODOC || '').toUpperCase();
        const desc = String(t.DESCRIPCION || '').trim();
        const label = desc ? `${code} — ${desc}` : code;
        return `<option value="${this.escapeHtml(code)}"${this._tipodoc === code ? ' selected' : ''}>${this.escapeHtml(label)}</option>`;
      })
      .join('');

    return `
      <div class="card documentos-filters-card shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-end gap-2 documentos-filters-row">
            <div class="documentos-filter-mes">
              <label for="documentos-mes" class="form-label small mb-1">Mes</label>
              <select class="form-select form-select-sm" id="documentos-mes">
                ${mesOpts}
              </select>
            </div>
            <div class="documentos-filter-anio">
              <label for="documentos-anio" class="form-label small mb-1">Año</label>
              <select class="form-select form-select-sm" id="documentos-anio">
                ${anioOpts}
              </select>
            </div>
            <div class="documentos-filter-tipodoc">
              <label for="documentos-tipodoc" class="form-label small mb-1">Tipo documento</label>
              <select class="form-select form-select-sm" id="documentos-tipodoc">
                ${tipoOpts || '<option value="">Sin tipos</option>'}
              </select>
            </div>
            <div class="documentos-filter-search flex-grow-1">
              <label for="documentos-search" class="form-label small mb-1">Buscar</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control" id="documentos-search"
                  placeholder="Correlativo, cliente, negocio, vendedor, estado…"
                  value="${this.escapeHtml(this._filterQuery)}" autocomplete="off" spellcheck="false">
                <button type="button" class="btn btn-outline-secondary" id="btn-documentos-search-clear"
                  title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
                  <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
          <div class="documentos-badge small text-muted mt-2" id="documentos-count">${this.badgeText()}</div>
        </div>
      </div>
    `;
  },

  renderTableCard() {
    const headers = this.tableColumns
      .map((c) => {
        const align = c.type === 'money' ? ' text-end' : '';
        const extra = c.cellClass ? ` ${c.cellClass}` : '';
        return `<th scope="col" class="${`${align}${extra}`.trim()}">${this.escapeHtml(c.label)}</th>`;
      })
      .join('');
    return `
      <div class="card documentos-table-card shadow-sm">
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped mb-0">
            <thead class="table-light sticky-top">
              <tr>${headers}</tr>
            </thead>
            <tbody id="documentos-tbody">${this.renderTableBodyHtml(this._rows)}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  render() {
    return `
      <div class="documentos-vista-wrap">
        ${this.renderFiltersCard()}
        ${this.renderTableCard()}
      </div>
    `;
  },

  syncFiltersFromUi() {
    const mesEl = document.getElementById('documentos-mes');
    const anioEl = document.getElementById('documentos-anio');
    const searchEl = document.getElementById('documentos-search');
    const tipodocEl = document.getElementById('documentos-tipodoc');
    if (mesEl) this._mes = parseInt(mesEl.value, 10);
    if (anioEl) this._anio = parseInt(anioEl.value, 10);
    if (searchEl) this._filterQuery = searchEl.value;
    if (tipodocEl) this._tipodoc = String(tipodocEl.value || '').trim().toUpperCase();
  },

  updateTableView() {
    const tbody = this._container?.querySelector('#documentos-tbody');
    const badge = this._container?.querySelector('#documentos-count');
    if (tbody) tbody.innerHTML = this.renderTableBodyHtml(this._rows);
    if (badge) badge.innerHTML = this.badgeText();
  },

  async fetchTipos() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/documentos/tipos?${params}`);
    this._tipos = data.rows || [];
    if (!this._tipodoc && this._tipos.length) {
      const fac = this._tipos.find((t) => String(t.TIPODOC).toUpperCase() === 'FAC');
      this._tipodoc = String((fac || this._tipos[0]).TIPODOC).toUpperCase();
    }
  },

  async fetchData() {
    if (!this._tipodoc) {
      this._rows = [];
      this._totalCount = 0;
      this._listTruncated = false;
      return null;
    }
    const data = await F.fetchJson(this.apiUrlLista(), { cache: 'no-store' });
    this._rows = data.rows || [];
    this._totalCount = data.total ?? this._rows.length;
    this._listTruncated = Boolean(data.truncated);
    this._mes = data.mes ?? this._mes;
    this._anio = data.anio ?? this._anio;
    this._tipodoc = data.tipodoc ?? this._tipodoc;
    return data;
  },

  bindSearch() {
    const search = document.getElementById('documentos-search');
    const clearBtn = document.getElementById('btn-documentos-search-clear');
    if (!search) return;
    const applySearch = F.debounce(() => {
      this._filterQuery = search.value;
      this.reload();
    }, 350);
    search.addEventListener('input', applySearch);
    search.addEventListener('search', applySearch);
    clearBtn?.addEventListener('click', () => {
      search.value = '';
      this._filterQuery = '';
      this.reload();
      search.focus();
    });
  },

  bindEvents() {
    const refresh = () => {
      this.syncFiltersFromUi();
      this.reload();
    };
    document.getElementById('documentos-mes')?.addEventListener('change', refresh);
    document.getElementById('documentos-anio')?.addEventListener('change', refresh);
    document.getElementById('documentos-tipodoc')?.addEventListener('change', refresh);
    this.bindSearch();
    this._container?.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr[data-doc-row]');
      if (!tr || !this._container.contains(tr)) return;
      const coddoc = tr.getAttribute('data-coddoc');
      const correlativo = tr.getAttribute('data-correlativo');
      if (!coddoc || correlativo == null) return;
      await this.showMenuDocumento(coddoc, correlativo);
    });
    this._container?.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest('tr[data-doc-row]');
      if (!tr || !this._container.contains(tr)) return;
      e.preventDefault();
      const coddoc = tr.getAttribute('data-coddoc');
      const correlativo = tr.getAttribute('data-correlativo');
      if (!coddoc || correlativo == null) return;
      await this.showMenuDocumento(coddoc, correlativo);
    });
  },

  async reload() {
    if (!this._container || this._loading) return;
    this.syncFiltersFromUi();
    if (!this._tipodoc) {
      this.updateTableView();
      return;
    }
    this._loading = true;
    const tbody = this._container.querySelector('#documentos-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${this.tableColSpan()}" class="text-center text-muted py-4">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</td></tr>`;
    }
    try {
      await this.fetchData();
      this.updateTableView();
    } catch (err) {
      this._rows = [];
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${this.tableColSpan()}" class="text-center text-danger py-4">${this.escapeHtml(err.message)}</td></tr>`;
      }
      F.toast('Error al cargar documentos', 'error');
    } finally {
      this._loading = false;
    }
  },

  async load(container) {
    this._container = container;
    this._filterQuery = '';
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');

    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100" role="alert">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese seleccionando una empresa.
        </div>
      `;
      return;
    }

    const period = this.defaultPeriod();
    this._mes = period.mes;
    this._anio = period.anio;

    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando documentos…
      </div>
    `;

    try {
      await this.fetchTipos();
      this._urlFel = await DocOpciones.fetchUrlFel().catch(() => '');
      container.innerHTML = this.render();
      this.bindEvents();
      await this.fetchData();
      this.updateTableView();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          ${this.escapeHtml(err.message)}
        </div>
      `;
    }
  },
};
