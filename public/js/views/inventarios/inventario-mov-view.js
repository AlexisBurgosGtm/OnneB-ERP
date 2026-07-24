/**
 * Factory — movimientos de inventario (ENT / SAL), similar a POS sin cliente ni precios de venta.
 */
function createInventarioMovView(cfg) {
  const NS = cfg.slug || 'inv-mov';
  const apiBase = cfg.apiBase || '/api/inventario/ent';

  return {
    _container: null,
    _config: null,
    _documento: null,
    _productos: [],
    _docsList: [],
    _listFilter: '',
    _listMes: new Date().getMonth() + 1,
    _listAnio: new Date().getFullYear(),
    _selectedCoddoc: '',
    _screen: 'list',
    _loadingProducts: false,
    _searchTimer: null,
    _cartBusy: false,
    _batchCancel: false,

    escapeHtml(value) {
      if (value === null || value === undefined) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    apiUrl(path, extraParams = {}) {
      const emp = F.getEmpNit();
      if (!emp) throw new Error('No hay empresa activa');
      const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
      const params = new URLSearchParams({ empnit: emp, ...extraParams });
      return `${apiBase}${segment}?${params}`;
    },

    formatMoney(value) {
      const n = Number(value);
      if (Number.isNaN(n)) return 'Q 0.00';
      return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
    },

    formatQty(value) {
      const n = Number(value);
      if (Number.isNaN(n)) return '—';
      return n.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    },

    formatFecha(row) {
      return DocFecha.formatDisplay(row);
    },

    docKey() {
      if (!this._documento?.header) return null;
      const h = this._documento.header;
      return { coddoc: h.CODDOC, correlativo: Number(h.CORRELATIVO) };
    },

    docLabel() {
      const h = this._documento?.header;
      if (!h) return 'Sin documento';
      return `${h.CODDOC} #${h.CORRELATIVO}`;
    },

    lineId(ln) {
      return ln?.ID ?? ln?.Id ?? null;
    },

    findLineById(id) {
      const n = Number(id);
      if (Number.isNaN(n)) return null;
      return (this._documento?.lines || []).find((l) => Number(this.lineId(l)) === n) || null;
    },

    usuario() {
      const u = F.session('user');
      return u?.username || 'INV';
    },

    mesOptions() {
      const names = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
      ];
      return names.map((label, i) => ({
        value: i + 1,
        label,
      }));
    },

    anioOptions() {
      const y = new Date().getFullYear();
      return [y, y - 1, y - 2, y - 3].map((v) => ({ value: v, label: String(v) }));
    },

    async fetchConfig() {
      return F.fetchJson(this.apiUrl('/config', { _: Date.now() }));
    },

    async fetchProductos(q) {
      const params = new URLSearchParams({ empnit: F.getEmpNit(), limit: '40' });
      if (q) params.set('q', q);
      params.set('_', String(Date.now()));
      return F.fetchJson(`${apiBase}/productos?${params}`);
    },

    activeCoddoc() {
      return DocTipoSelect.active(this);
    },

    async fetchDocsList() {
      const params = {
        empnit: F.getEmpNit(),
        status: 'O',
        mes: String(this._listMes),
        anio: String(this._listAnio),
      };
      params._ = String(Date.now());
      const data = await F.fetchJson(this.apiUrl('/documentos', params));
      this._docsList = data.rows || [];
      return this._docsList;
    },

    formatMedidaLine(lnOrMedida, equivale) {
      if (lnOrMedida && typeof lnOrMedida === 'object') {
        const m = lnOrMedida.CODMEDIDA || '';
        const eq = lnOrMedida.EQUIVALE;
        if (eq != null && eq !== '') return `${m} · eq. ${eq}`;
        return m;
      }
      const m = String(lnOrMedida || '');
      if (equivale != null && equivale !== '') return `${m} · eq. ${equivale}`;
      return m;
    },

    formatProdLabel(desprod, desmarca) {
      const name = String(desprod ?? '').trim();
      const marca = String(desmarca ?? '').trim();
      if (!marca) return name;
      return `${name} · ${marca}`;
    },

    renderProdNameHtml(desprod, desmarca) {
      const name = this.escapeHtml(String(desprod ?? '').trim());
      const marca = String(desmarca ?? '').trim();
      if (!marca) return name;
      return `${name} · <strong class="pos-prod-marca">${this.escapeHtml(marca)}</strong>`;
    },

    docEditable(header) {
      return DocFecha.editableStatus(header?.STATUS);
    },

    async guardarFechaDocumento(fecha) {
      const key = this.docKey();
      if (!key || !this.docEditable(this._documento?.header)) return;
      const actual = DocFecha.inputValueFromHeader(this._documento.header);
      if (fecha === actual) return;
      const url = this.apiUrl(
        `/documentos/${encodeURIComponent(key.coddoc)}/${key.correlativo}`
      );
      this._documento = await F.fetchJson(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ FECHA: fecha }),
      });
      this.syncFechaInput();
      F.toast('Fecha actualizada', 'success');
    },

    syncFechaInput() {
      const inp = this._container?.querySelector(`#${NS}-doc-fecha`);
      const h = this._documento?.header;
      if (inp && h && !inp.matches(':focus')) {
        inp.value = DocFecha.inputValueFromHeader(h);
      }
    },

    filteredDocsList() {
      const q = this._listFilter.trim().toLowerCase();
      if (!q) return this._docsList;
      return this._docsList.filter((r) => {
        const hay = [r.CODDOC, r.CORRELATIVO, r.OBS, r.USUARIO]
          .map((v) => String(v ?? '').toLowerCase())
          .join(' ');
        return hay.includes(q);
      });
    },

    async loadDocumento(coddoc, correlativo, opts = {}) {
      const url = this.apiUrl(
        `/documentos/${encodeURIComponent(coddoc)}/${correlativo}`,
        { _: Date.now() }
      );
      this._documento = await F.fetchJson(url);
      if (this._screen === 'editor' && !opts.skipRender) this.renderAll();
      return this._documento;
    },

    async crearDocumento() {
      const body = {
        CODDOC: this.activeCoddoc(),
        USUARIO: this.usuario(),
      };
      this._documento = await F.fetchJson(this.apiUrl('/documentos'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      F.toast('Nuevo documento creado', 'success');
    },

    async finalizarDocumento() {
      const key = this.docKey();
      if (!key) return;
      const h = this._documento?.header;
      if (!this.docEditable(h)) {
        F.toast('El documento no está operado', 'warning');
        return;
      }
      if (!(this._documento?.lines || []).length) {
        F.toast('Agregue al menos un producto', 'warning');
        return;
      }

      const obsVal = this.escapeHtml(h.OBS || '');
      const { isConfirmed, value } = await Swal.fire({
        ...CatalogosUI.modalBase(),
        title: cfg.finalizarTitle || 'Finalizar documento',
        html: `
          <p class="small text-muted mb-3">${this.escapeHtml(this.docLabel())}</p>
          <div class="text-start">
            <label class="form-label small mb-0" for="${NS}-finalizar-obs">Observaciones</label>
            <textarea id="${NS}-finalizar-obs" class="form-control form-control-sm" rows="3"
              placeholder="Observaciones…">${obsVal}</textarea>
          </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: CatalogosUI.guardarButtonHtml('Finalizar'),
        cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
        focusConfirm: false,
        didOpen: () => document.getElementById(`${NS}-finalizar-obs`)?.focus(),
        preConfirm: () => document.getElementById(`${NS}-finalizar-obs`)?.value?.trim() || '',
      });

      if (!isConfirmed) return;

      const url = this.apiUrl(
        `/documentos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/finalizar`
      );
      await F.fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ OBS: value }),
      });
      F.toast('Documento finalizado', 'success');
      this._documento = null;
      await this.showList();
    },

    async bloquearDocumento(coddoc, correlativo) {
      const row = this._docsList.find(
        (r) => String(r.CODDOC) === String(coddoc) && Number(r.CORRELATIVO) === Number(correlativo)
      );
      const label = row ? `${coddoc} #${correlativo}` : `${coddoc} #${correlativo}`;
      const confirm = await CatalogosUI.fireConfirm({
        title: '¿Bloquear documento?',
        html: `<p class="mb-0">El documento <strong>${this.escapeHtml(label)}</strong> pasará a estado bloqueado (I). No se elimina; solo dejará de mostrarse en el listado de operados.</p>`,
        icon: 'warning',
        confirmText: 'BLOQUEAR',
        confirmClass: 'btn-catalogo-bloquear',
      });
      if (!confirm) return;
      const url = this.apiUrl(
        `/documentos/${encodeURIComponent(coddoc)}/${correlativo}/bloquear`
      );
      await F.fetchJson(url, { method: 'POST' });
      F.toast('Documento bloqueado', 'success');
      await this.fetchDocsList();
      this.refreshListDom();
    },

    async eliminarDocumento(coddoc, correlativo) {
      const label = `${coddoc} #${correlativo}`;
      const pass = await CatalogosUI.confirmEliminarDocumento({ label });
      if (!pass) return;
      await F.fetchJson(
        this.apiUrl(`/documentos/${encodeURIComponent(coddoc)}/${correlativo}`),
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pass: String(pass) }),
        }
      );
      F.toast('Documento eliminado', 'success');
      await this.fetchDocsList();
      this.refreshListDom();
    },

    async imprimirDocumento(coddoc, correlativo) {
      try {
        const doc = await this.loadDocumento(coddoc, correlativo);
        const h = doc.header;
        const lines = doc.lines || [];
        const rows = lines
          .map(
            (ln) => `<tr>
              <td>${this.escapeHtml(ln.CODPROD)}</td>
              <td>${this.escapeHtml(ln.DESPROD)}</td>
              <td>${this.escapeHtml(this.formatMedidaLine(ln))}</td>
              <td class="text-end">${Number(ln.CANTIDAD) || 0}</td>
              <td class="text-end">${Number(ln.TOTALUNIDADES) || 0}</td>
            </tr>`
          )
          .join('');
        await PrintReport.openAndPrint(
          () =>
            PrintReport.wrapDocument({
              title: cfg.printTitle || 'Inventario',
              bodyHtml: `
            ${PrintReport.reportHeaderHtml({
              title: cfg.printTitle || 'Movimiento inventario',
              subtitleHtml: `
                <p><strong>${this.escapeHtml(h.CODDOC)} #${h.CORRELATIVO}</strong> · ${this.formatFecha(h)} · ${PrintReport.escapeHtml(h.USUARIO || '')}</p>
                ${h.OBS ? `<p><em>${PrintReport.escapeHtml(h.OBS)}</em></p>` : ''}
              `,
            })}
            <table><thead><tr><th>Cód.</th><th>Producto</th><th>Medida</th><th class="text-end">Cant.</th><th class="text-end">Unidades</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5">Sin líneas</td></tr>'}</tbody></table>
          `,
            }),
          'width=800,height=600'
        );
      } catch (err) {
        F.toast(err.message || 'Error al imprimir', 'error');
      }
    },

    async agregarLinea(codprod, codmedida, cantidad = 1, opts = {}) {
      const key = this.docKey();
      if (!key) {
        F.toast('No hay documento activo', 'warning');
        return null;
      }
      if (!this.docEditable(this._documento?.header)) {
        F.toast('El documento no está en edición', 'warning');
        return null;
      }
      const url = this.apiUrl(
        `/documentos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas`
      );
      const body = {
        CODPROD: codprod,
        CODMEDIDA: opts.forceUnidad ? 'UNIDAD' : codmedida,
        CANTIDAD: cantidad,
      };
      if (opts.forceUnidad) {
        body.forceUnidad = true;
        body.ajusteCero = true;
      }
      const res = await F.fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      this._documento = res.documento;
      if (!opts.skipRender) {
        this.renderCart();
        this.renderOrderSummary();
      }
      if (!opts.silent) F.toast('Producto agregado', 'success');
      return res;
    },

    async eliminarLinea(lineId, opts = {}) {
      const key = this.docKey();
      if (!key) return null;
      const url = this.apiUrl(
        `/documentos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas/${lineId}`
      );
      const res = await F.fetchJson(url, { method: 'DELETE' });
      this._documento = res.documento;
      if (!opts.skipRender) {
        this.renderCart();
        this.renderOrderSummary();
      }
      return res;
    },

    /**
     * Modal de progreso con botón Cancelar que detiene el lote (tras la operación en curso).
     * onRun(ctx) recibe { setStatus, setProgress, appendLog, isCancelled, markCancelUi }.
     */
    async runBatchWithProgress({ title, countLabel, onRun }) {
      this._batchCancel = false;
      const progressId = `${NS}-batch-progress`;
      const cancelBtnId = `${progressId}-cancel`;

      Swal.fire({
        ...CatalogosUI.modalBase(),
        title,
        html: `
          <div class="text-start small" id="${progressId}">
            <div class="d-flex align-items-center gap-2 mb-2" id="${progressId}-status">
              <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
              <span>Preparando…</span>
            </div>
            <div class="progress mb-2" style="height: 8px;">
              <div class="progress-bar" id="${progressId}-bar" role="progressbar"
                style="width: 0%;" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
            <div class="text-muted mb-2" id="${progressId}-count">0 / 0 ${this.escapeHtml(countLabel || 'filas')}</div>
            <div class="border rounded p-2 bg-light overflow-auto" id="${progressId}-log"
              style="max-height: 220px; font-size: 0.8rem;"></div>
            <div class="mt-3 text-center">
              <button type="button" class="btn btn-sm btn-outline-danger" id="${cancelBtnId}">
                <i class="fa-solid fa-ban me-1"></i>Cancelar proceso
              </button>
            </div>
          </div>
        `,
        showConfirmButton: false,
        showCancelButton: false,
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
          const btn = document.getElementById(cancelBtnId);
          btn?.addEventListener('click', () => {
            this._batchCancel = true;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Cancelando…';
            const status = document.getElementById(`${progressId}-status`);
            if (status) {
              status.innerHTML =
                '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Cancelando… (se detiene tras la fila en curso)</span>';
            }
          });
        },
      });

      const statusEl = () => document.getElementById(`${progressId}-status`);
      const barEl = () => document.getElementById(`${progressId}-bar`);
      const countEl = () => document.getElementById(`${progressId}-count`);
      const logEl = () => document.getElementById(`${progressId}-log`);

      const setStatus = (msg, spinning = true) => {
        if (this._batchCancel && spinning) return;
        const el = statusEl();
        if (!el) return;
        el.innerHTML = spinning
          ? `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>${this.escapeHtml(msg)}</span>`
          : `<i class="fa-solid fa-circle-check text-success" aria-hidden="true"></i><span>${this.escapeHtml(msg)}</span>`;
      };
      const setProgress = (done, total) => {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const bar = barEl();
        if (bar) {
          bar.style.width = `${pct}%`;
          bar.setAttribute('aria-valuenow', String(pct));
        }
        const count = countEl();
        if (count) {
          count.textContent = `${done} / ${total} ${countLabel || 'filas'}`;
        }
      };
      const appendLog = (html) => {
        const log = logEl();
        if (!log) return;
        log.insertAdjacentHTML('beforeend', html);
        log.scrollTop = log.scrollHeight;
      };
      const isCancelled = () => Boolean(this._batchCancel);

      this.setCartBusy(true);
      try {
        const result = await onRun({ setStatus, setProgress, appendLog, isCancelled });
        return { ...(result || {}), cancelled: isCancelled() };
      } finally {
        this._batchCancel = false;
        this.setCartBusy(false);
        this.renderCart();
        this.renderOrderSummary();
      }
    },

    async dejarInventarioACero() {
      if (String(cfg.tipodoc || '').toUpperCase() !== 'ENT') return;
      const key = this.docKey();
      if (!key) {
        F.toast('No hay documento activo', 'warning');
        return;
      }
      if (!this.docEditable(this._documento?.header)) {
        F.toast('El documento no está en edición', 'warning');
        return;
      }

      const confirm = await Swal.fire({
        ...CatalogosUI.modalBase(),
        icon: 'warning',
        title: 'Dejar Inventario a Cero',
        html: `
          <p class="mb-2 text-start small">
            Se recorrerá el inventario y se agregará <strong>una línea por producto</strong> con medida
            <strong>UNIDAD</strong> (equivale 1) para anular el saldo actual:
          </p>
          <ul class="text-start small mb-0">
            <li>Existencia positiva → cantidad negativa</li>
            <li>Existencia negativa → cantidad positiva</li>
          </ul>
          <p class="mt-2 mb-0 text-start small text-muted">
            El documento quedará listo para que usted lo revise y finalice.
          </p>
        `,
        showCancelButton: true,
        confirmButtonText: CatalogosUI.guardarButtonHtml('Continuar'),
        cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      });
      if (!confirm.isConfirmed) return;

      let agregadas = 0;
      let omitidas = 0;
      let errores = 0;
      let totalRows = 0;
      let emptyStock = false;

      try {
        const batch = await this.runBatchWithProgress({
          title: 'Dejando inventario a cero',
          countLabel: 'filas agregadas',
          onRun: async ({ setStatus, setProgress, appendLog, isCancelled }) => {
            setStatus('Cargando saldos de inventario…');
            const emp = F.getEmpNit();
            const saldoUrl = `/api/inventario/saldo?${new URLSearchParams({
              empnit: emp,
              limit: '0',
              _: String(Date.now()),
            })}`;
            const data = await F.fetchJson(saldoUrl);
            if (isCancelled()) return { cancelledEarly: true };

            const rows = (data.rows || []).filter((row) => {
              const tipo = String(row.TIPOPROD || '').trim().toUpperCase();
              if (tipo === 'S') return false;
              const saldo = Number(row.SALDO ?? row.EXISTENCIA) || 0;
              return saldo !== 0;
            });
            totalRows = rows.length;

            if (!rows.length) {
              emptyStock = true;
              setStatus('No hay productos con saldo distinto de cero', false);
              setProgress(0, 0);
              return {};
            }

            setStatus(`Procesando ${rows.length} producto(s)…`);
            setProgress(0, rows.length);

            for (let i = 0; i < rows.length; i++) {
              if (isCancelled()) {
                appendLog(
                  `<div class="text-warning"><i class="fa-solid fa-ban me-1"></i>Proceso cancelado por el usuario</div>`
                );
                setStatus(`Cancelado · ${agregadas} fila(s) agregada(s)`, false);
                break;
              }

              const row = rows[i];
              const codprod = String(row.CODPROD || '').trim();
              const saldo = Number(row.SALDO ?? row.EXISTENCIA) || 0;
              const cantidad = -saldo;
              const desprod = String(row.DESPROD || codprod).trim();
              try {
                if (!codprod || cantidad === 0) {
                  omitidas += 1;
                  appendLog(
                    `<div class="text-muted"><i class="fa-solid fa-minus me-1"></i>${this.escapeHtml(codprod || '—')} omitido</div>`
                  );
                } else {
                  await this.agregarLinea(codprod, 'UNIDAD', cantidad, {
                    forceUnidad: true,
                    silent: true,
                    skipRender: true,
                  });
                  agregadas += 1;
                  appendLog(
                    `<div><i class="fa-solid fa-check text-success me-1"></i>` +
                      `<strong>${this.escapeHtml(codprod)}</strong> ${this.escapeHtml(desprod)}` +
                      ` · cant. ${this.escapeHtml(this.formatQty(cantidad))}` +
                      ` (saldo ${this.escapeHtml(this.formatQty(saldo))})</div>`
                  );
                }
              } catch (err) {
                errores += 1;
                appendLog(
                  `<div class="text-danger"><i class="fa-solid fa-xmark me-1"></i>` +
                    `<strong>${this.escapeHtml(codprod)}</strong>: ${this.escapeHtml(err.message || 'Error')}</div>`
                );
              }
              setProgress(i + 1, rows.length);
              if (!isCancelled()) setStatus(`Agregadas ${agregadas} de ${rows.length}…`);
              if (i % 5 === 0 || i === rows.length - 1) {
                this.renderCart();
                this.renderOrderSummary();
              }
            }

            if (!isCancelled()) {
              setStatus(`Listo: ${agregadas} fila(s) agregada(s)`, false);
            }
            return {};
          },
        });

        if (emptyStock) {
          await Swal.fire({
            ...CatalogosUI.modalBase(),
            icon: 'info',
            title: 'Inventario ya en cero',
            text: 'No se encontraron productos con existencias distintas de cero.',
            confirmButtonText: CatalogosUI.guardarButtonHtml('Entendido'),
          });
          return;
        }

        if (batch?.cancelled) {
          await Swal.fire({
            ...CatalogosUI.modalBase(),
            icon: 'warning',
            title: 'Proceso cancelado',
            html: `
              <p class="mb-1 small">Se detuvo el ajuste.</p>
              <p class="mb-0 small">Quedaron <strong>${agregadas}</strong> línea(s) agregada(s) de ${totalRows}.</p>
            `,
            confirmButtonText: CatalogosUI.guardarButtonHtml('Entendido'),
          });
          return;
        }

        await Swal.fire({
          ...CatalogosUI.modalBase(),
          icon: errores ? 'warning' : 'success',
          title: 'Ajuste generado',
          html: `
            <p class="mb-1 small">Se agregaron <strong>${agregadas}</strong> línea(s) al documento.</p>
            ${omitidas ? `<p class="mb-1 small text-muted">Omitidas: ${omitidas}</p>` : ''}
            ${errores ? `<p class="mb-1 small text-danger">Con error: ${errores}</p>` : ''}
            <p class="mb-0 small text-muted">Revise el documento y finalícelo cuando corresponda.</p>
          `,
          confirmButtonText: CatalogosUI.guardarButtonHtml('Entendido'),
        });
      } catch (err) {
        await Swal.fire({
          ...CatalogosUI.modalBase(),
          icon: 'error',
          title: 'No se pudo ajustar',
          text: err.message || 'Error al dejar inventario a cero',
          confirmButtonText: CatalogosUI.guardarButtonHtml('Cerrar'),
        });
      }
    },

    async vaciarDocumento() {
      if (String(cfg.tipodoc || '').toUpperCase() !== 'ENT') return;
      const key = this.docKey();
      if (!key) {
        F.toast('No hay documento activo', 'warning');
        return;
      }
      if (!this.docEditable(this._documento?.header)) {
        F.toast('El documento no está en edición', 'warning');
        return;
      }

      const linesSnap = [...(this._documento?.lines || [])];
      if (!linesSnap.length) {
        F.toast('El documento no tiene líneas', 'info');
        return;
      }

      const confirm = await Swal.fire({
        ...CatalogosUI.modalBase(),
        icon: 'warning',
        title: 'Vaciar documento',
        html: `
          <p class="mb-0 text-start small">
            Se eliminarán <strong>${linesSnap.length}</strong> línea(s) una por una.
            Cada eliminación revierte el movimiento de inventario (stock) de esa línea.
          </p>
        `,
        showCancelButton: true,
        confirmButtonText: CatalogosUI.guardarButtonHtml('Vaciar'),
        cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      });
      if (!confirm.isConfirmed) return;

      let eliminadas = 0;
      let errores = 0;
      const total = linesSnap.length;

      try {
        const batch = await this.runBatchWithProgress({
          title: 'Vaciando documento',
          countLabel: 'líneas eliminadas',
          onRun: async ({ setStatus, setProgress, appendLog, isCancelled }) => {
            setStatus(`Eliminando ${total} línea(s)…`);
            setProgress(0, total);

            for (let i = 0; i < linesSnap.length; i++) {
              if (isCancelled()) {
                appendLog(
                  `<div class="text-warning"><i class="fa-solid fa-ban me-1"></i>Proceso cancelado por el usuario</div>`
                );
                setStatus(`Cancelado · ${eliminadas} línea(s) eliminada(s)`, false);
                break;
              }

              const ln = linesSnap[i];
              const lineId = this.lineId(ln);
              const codprod = String(ln.CODPROD || '').trim();
              const desprod = String(ln.DESPROD || codprod).trim();
              const qty = Number(ln.CANTIDAD) || 0;

              try {
                if (!lineId) {
                  errores += 1;
                  appendLog(
                    `<div class="text-danger"><i class="fa-solid fa-xmark me-1"></i>${this.escapeHtml(codprod || '—')}: sin id de línea</div>`
                  );
                } else {
                  await this.eliminarLinea(lineId, { skipRender: true });
                  eliminadas += 1;
                  appendLog(
                    `<div><i class="fa-solid fa-trash text-danger me-1"></i>` +
                      `<strong>${this.escapeHtml(codprod)}</strong> ${this.escapeHtml(desprod)}` +
                      ` · cant. ${this.escapeHtml(this.formatQty(qty))}</div>`
                  );
                }
              } catch (err) {
                errores += 1;
                appendLog(
                  `<div class="text-danger"><i class="fa-solid fa-xmark me-1"></i>` +
                    `<strong>${this.escapeHtml(codprod)}</strong>: ${this.escapeHtml(err.message || 'Error')}</div>`
                );
              }

              setProgress(i + 1, total);
              if (!isCancelled()) setStatus(`Eliminadas ${eliminadas} de ${total}…`);
              if (i % 5 === 0 || i === linesSnap.length - 1) {
                this.renderCart();
                this.renderOrderSummary();
              }
            }

            if (!isCancelled()) {
              setStatus(`Listo: ${eliminadas} línea(s) eliminada(s)`, false);
            }
            return {};
          },
        });

        if (batch?.cancelled) {
          await Swal.fire({
            ...CatalogosUI.modalBase(),
            icon: 'warning',
            title: 'Proceso cancelado',
            html: `
              <p class="mb-1 small">Se detuvo el vaciado.</p>
              <p class="mb-0 small">Se eliminaron <strong>${eliminadas}</strong> de ${total} línea(s). El stock de esas líneas ya fue revertido.</p>
            `,
            confirmButtonText: CatalogosUI.guardarButtonHtml('Entendido'),
          });
          return;
        }

        await Swal.fire({
          ...CatalogosUI.modalBase(),
          icon: errores ? 'warning' : 'success',
          title: 'Documento vaciado',
          html: `
            <p class="mb-1 small">Se eliminaron <strong>${eliminadas}</strong> línea(s).</p>
            ${errores ? `<p class="mb-0 small text-danger">Con error: ${errores}</p>` : '<p class="mb-0 small text-muted">El inventario de cada línea fue revertido.</p>'}
          `,
          confirmButtonText: CatalogosUI.guardarButtonHtml('Entendido'),
        });
      } catch (err) {
        await Swal.fire({
          ...CatalogosUI.modalBase(),
          icon: 'error',
          title: 'No se pudo vaciar',
          text: err.message || 'Error al vaciar el documento',
          confirmButtonText: CatalogosUI.guardarButtonHtml('Cerrar'),
        });
      }
    },

    setCartBusy(busy) {
      this._cartBusy = busy;
      const tbody = this._container?.querySelector(`#${NS}-cart-tbody`);
      tbody?.classList.toggle('pos-cart-busy', busy);
      const fab = this._container?.querySelector(`#${NS}-btn-finalizar`);
      if (fab) fab.disabled = busy;
      const ceroBtn = this._container?.querySelector(`#${NS}-btn-cero`);
      if (ceroBtn) ceroBtn.disabled = busy;
      const vaciarBtn = this._container?.querySelector(`#${NS}-btn-vaciar`);
      if (vaciarBtn) vaciarBtn.disabled = busy;
    },

    async actualizarCantidad(lineId, cantidad) {
      const key = this.docKey();
      if (!key) return;
      const url = this.apiUrl(
        `/documentos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas/${lineId}`
      );
      const res = await F.fetchJson(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CANTIDAD: cantidad }),
      });
      this._documento = res.documento;
      this.renderCart();
      this.renderOrderSummary();
    },

    async onProductClick(row) {
      if (!row?.CODPROD) {
        F.toast('Producto no disponible', 'warning');
        return;
      }
      const precios = this._productos.filter((p) => String(p.CODPROD) === String(row.CODPROD));
      if (!precios.length) {
        F.toast('Sin medidas habilitadas', 'warning');
        return;
      }
      const defaultMedida = row.CODMEDIDA || precios[0].CODMEDIDA;
      const options = precios
        .map((p) => {
          const selected = String(p.CODMEDIDA) === String(defaultMedida) ? ' selected' : '';
          return `<option value="${this.escapeHtml(p.CODMEDIDA)}"${selected}>${this.escapeHtml(this.formatMedidaLine(p.CODMEDIDA, p.EQUIVALE))} — exist. ${this.escapeHtml(this.formatQty(p.EXISTENCIA))}</option>`;
        })
        .join('');
      const { value: picked } = await Swal.fire({
        ...CatalogosUI.modalBase(),
        title: row.DESPROD || row.CODPROD,
        html: `
          <label class="form-label small">Medida</label>
          <select id="${NS}-swal-medida" class="form-select form-select-sm">${options}</select>
          <label class="form-label small mt-2">Cantidad</label>
          <input type="number" id="${NS}-swal-cant" class="form-control form-control-sm" value="1" min="0.01" step="any">
        `,
        showCancelButton: true,
        confirmButtonText: CatalogosUI.guardarButtonHtml('Agregar'),
        cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
        focusConfirm: false,
        didOpen: (popup) => {
          const cantInp = document.getElementById(`${NS}-swal-cant`);
          PosProductKeyboardUI.focusInput(cantInp);
          PosProductKeyboardUI.wireModalQtyFlow({ cantInput: cantInp, popup });
        },
        preConfirm: () => {
          const cant = Number(document.getElementById(`${NS}-swal-cant`)?.value);
          if (!cant || cant <= 0) {
            Swal.showValidationMessage('Cantidad inválida');
            return false;
          }
          const medida = document.getElementById(`${NS}-swal-medida`)?.value;
          if (!medida) {
            Swal.showValidationMessage('Seleccione una medida');
            return false;
          }
          return { medida, cantidad: cant };
        },
      });
      if (picked?.medida) {
        await this.agregarLinea(row.CODPROD, picked.medida, picked.cantidad);
      }
    },

    renderProductList() {
      const targets = PosDocSearchUI.listTargets(this._container, NS);
      if (!targets.length) return;
      if (!this._productos.length) {
        const empty =
          '<p class="text-muted small text-center py-3 mb-0">Escriba código o descripción y presione Enter</p>';
        targets.forEach((el) => {
          el.innerHTML = empty;
        });
        return;
      }
      const html = this._productos
        .map(
          (p) => `
          <div class="pos-product-item" tabindex="0" role="button"
            data-codprod="${this.escapeHtml(p.CODPROD)}"
            data-codmedida="${this.escapeHtml(p.CODMEDIDA)}">
            <div>
              <div class="pos-prod-code">${this.escapeHtml(p.CODPROD)} · ${this.escapeHtml(this.formatMedidaLine(p.CODMEDIDA, p.EQUIVALE))}</div>
              <div>${this.renderProdNameHtml(p.DESPROD, p.DESMARCA)}</div>
            </div>
            <div class="pos-prod-meta text-end">
              <div class="pos-prod-stock small text-muted">Exist. ${this.escapeHtml(this.formatQty(p.EXISTENCIA))}</div>
            </div>
          </div>`
        )
        .join('');
      targets.forEach((el) => {
        el.innerHTML = html;
      });
    },

    renderCart() {
      const tbody = this._container?.querySelector(`#${NS}-cart-tbody`);
      if (!tbody) return;
      const lines = this._documento?.lines || [];
      const h = this._documento?.header;
      const editable = this.docEditable(h);
      if (!lines.length) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="text-center text-muted py-3">Sin productos</td></tr>';
        return;
      }
      tbody.innerHTML = lines
        .map((ln) => {
          const lineId = this.lineId(ln);
          const qty = Number(ln.CANTIDAD) || 0;
          const qtyEditable = editable && qty > 0;
          const qtyControls = qtyEditable
            ? `<div class="d-flex align-items-center gap-1 justify-content-center">
              <button type="button" class="btn btn-outline-secondary btn-sm pos-qty-btn" data-action="qty-minus" data-id="${lineId}"${this._cartBusy ? ' disabled' : ''}>−</button>
              <span class="px-1">${this.escapeHtml(this.formatQty(qty))}</span>
              <button type="button" class="btn btn-outline-secondary btn-sm pos-qty-btn" data-action="qty-plus" data-id="${lineId}"${this._cartBusy ? ' disabled' : ''}>+</button>
            </div>`
            : `<span class="${qty < 0 ? 'text-danger fw-semibold' : ''}">${this.escapeHtml(this.formatQty(qty))}</span>`;
          const delBtn = editable
            ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="line-del" data-id="${lineId}"${this._cartBusy ? ' disabled' : ''}><i class="fa-solid fa-trash"></i></button>`
            : '';
          return `<tr>
          <td class="small">${this.escapeHtml(ln.CODPROD)}</td>
          <td class="small">${this.escapeHtml(ln.DESPROD)}<br><span class="text-muted">${this.escapeHtml(this.formatMedidaLine(ln))}</span></td>
          <td class="text-end small pos-cart-exist">${this.escapeHtml(this.formatQty(ln.EXISTENCIA))}</td>
          <td class="text-center">${qtyControls}</td>
          <td class="text-end">${delBtn}</td>
        </tr>`;
        })
        .join('');
    },

    renderOrderSummary() {
      const totalEl = this._container?.querySelector(`#${NS}-header-total`);
      const itemsEl = this._container?.querySelector(`#${NS}-header-items`);
      const docEl = this._container?.querySelector(`#${NS}-header-doc`);
      const h = this._documento?.header;
      const lines = this._documento?.lines || [];
      const totalUnidades = lines.reduce((sum, ln) => sum + (Number(ln.TOTALUNIDADES) || 0), 0);
      const itemCount = lines.length;
      if (totalEl) {
        totalEl.textContent = totalUnidades === 1 ? '1 u.' : `${totalUnidades} u.`;
      }
      if (itemsEl) {
        itemsEl.textContent = itemCount === 1 ? '1 item' : `${itemCount} items`;
      }
      if (docEl && h) docEl.textContent = this.docLabel();
    },

    renderAll() {
      this.syncFechaInput();
      this.renderCart();
      this.renderOrderSummary();
      this.syncEditorControls();
    },

    syncEditorControls() {
      const editable = this.docEditable(this._documento?.header);
      PosDocSearchUI.syncControls(this._container, NS, editable);
      const fecha = this._container?.querySelector(`#${NS}-doc-fecha`);
      if (fecha) fecha.disabled = !editable;
      const fab = this._container?.querySelector(`#${NS}-btn-finalizar`);
      if (fab) fab.style.display = editable ? '' : 'none';
    },

    renderListCardsHtml() {
      const rows = this.filteredDocsList();
      if (!rows.length) {
        return `<div class="pos-list-empty text-muted text-center py-5">No hay documentos en ${this._listMes}/${this._listAnio}</div>`;
      }
      return rows
        .map((r) => {
          const label = `${r.CODDOC} #${r.CORRELATIVO}`;
          return `
          <div class="pos-pedido-card inv-doc-card" data-coddoc="${this.escapeHtml(r.CODDOC)}"
            data-correlativo="${r.CORRELATIVO}">
            <div class="pos-pedido-card-top">
              <span class="pos-pedido-card-doc">${this.escapeHtml(label)}</span>
            </div>
            <div class="pos-pedido-card-meta">${this.escapeHtml(r.USUARIO || '—')} · ${this.escapeHtml(this.formatFecha(r))}</div>
            <div class="pos-pedido-card-footer">
              <span><i class="fa-solid fa-box-open me-1"></i>${Number(r.LINEAS) || 0} líneas</span>
              ${r.OBS ? `<span class="text-truncate ms-2" title="${this.escapeHtml(r.OBS)}">${this.escapeHtml(r.OBS)}</span>` : ''}
            </div>
            <div class="inv-card-actions">
              <button type="button" class="btn btn-sm btn-outline-primary inv-card-btn" data-action="editar">
                <i class="fa-solid fa-pen me-1"></i>Editar
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary inv-card-btn" data-action="imprimir">
                <i class="fa-solid fa-print me-1"></i>Imprimir
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger inv-card-btn" data-action="bloquear">
                <i class="fa-solid fa-lock me-1"></i>Bloquear
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger inv-card-btn" data-action="eliminar">
                <i class="fa-solid fa-trash me-1"></i>Eliminar
              </button>
            </div>
          </div>`;
        })
        .join('');
    },

    renderListToolbar() {
      const mesOpts = this.mesOptions()
        .map(
          (o) =>
            `<option value="${o.value}"${this._listMes === o.value ? ' selected' : ''}>${o.label}</option>`
        )
        .join('');
      const anioOpts = this.anioOptions()
        .map(
          (o) =>
            `<option value="${o.value}"${this._listAnio === o.value ? ' selected' : ''}>${o.label}</option>`
        )
        .join('');
      return `
        <div class="inv-list-toolbar mb-3">
          <div class="inv-list-periods">
            <div class="inv-list-period">
              <label class="small text-muted mb-0" for="${NS}-list-mes">Mes</label>
              <select class="form-select form-select-sm" id="${NS}-list-mes">${mesOpts}</select>
            </div>
            <div class="inv-list-period">
              <label class="small text-muted mb-0" for="${NS}-list-anio">Año</label>
              <select class="form-select form-select-sm" id="${NS}-list-anio">${anioOpts}</select>
            </div>
            ${DocTipoSelect.renderSelectHtml({
              selectId: `${NS}-list-coddoc`,
              tipos: this._config?.tiposDocumento,
              selected: this.activeCoddoc(),
              label: 'Serie',
              className: 'doc-tipo-select-wrap inv-list-period',
            })}
          </div>
          <div class="input-group inv-list-search">
            <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control pos-search-glow" id="${NS}-list-search"
              placeholder="Buscar documento, usuario, observaciones…"
              value="${this.escapeHtml(this._listFilter)}" autocomplete="off">
          </div>
        </div>`;
    },

    renderListScreen() {
      const count = this.filteredDocsList().length;
      return `
      <div class="pos-list-wrap">
        <div class="pos-list-header">
          <h2 class="pos-list-title">${this.escapeHtml(cfg.listTitle || 'Movimientos de inventario')}</h2>
          <p class="pos-list-sub text-muted mb-0">${count} documento(s) operados · ${this._listMes}/${this._listAnio}</p>
        </div>
        ${this.renderListToolbar()}
        <div class="pos-pedido-cards" id="${NS}-doc-cards">${this.renderListCardsHtml()}</div>
        <button type="button" class="btn-onneb-nuevo-fab pos-list-fab-nuevo" id="${NS}-btn-nuevo"
          aria-label="Nuevo documento" title="Nuevo documento"${this.activeCoddoc() ? '' : ' disabled'}>
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>`;
    },

    renderEditorShell() {
      const tipoLabel = this._config?.tiposDocumento?.[0]?.DESDOC || cfg.listTitle || 'Inventario';
      const editable = this.docEditable(this._documento?.header);
      return `
      <div class="pos-vista-wrap">
        <div class="pos-header card shadow-sm">
          <div class="card-body pos-header-body">
            <div class="pos-header-top d-flex flex-wrap align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary pos-btn-atras" id="${NS}-btn-atras">
                <i class="fa-solid fa-arrow-left me-1"></i>Atrás
              </button>
              <div class="pos-header-brand">
                ${typeof EmpresaLogo !== 'undefined' ? EmpresaLogo.posHeaderLogoHtml() : '<img src="/icons/icon-72.png" width="40" height="40" alt="OnneB" class="pos-header-logo">'}
              </div>
              <div class="pos-header-doc-label small fw-semibold" id="${NS}-header-doc">${this.escapeHtml(this.docLabel())}</div>
              ${DocFecha.renderField(`${NS}-doc-fecha`, this._documento?.header)}
              <div class="pos-header-summary ms-auto text-end">
                <h3 class="pos-header-total mb-0" id="${NS}-header-total">0 u.</h3>
                <div class="pos-header-items" id="${NS}-header-items">0 items</div>
              </div>
            </div>
          </div>
        </div>
        <div class="pos-main">
          <div class="pos-panel pos-panel-search card shadow-sm">
            <div class="card-header py-2 d-flex align-items-center gap-2">
              <i class="fa-solid fa-box"></i>
              <span class="fw-semibold">Productos</span>
              <span class="small text-muted">(${this.escapeHtml(tipoLabel)})</span>
            </div>
            <div class="card-body">
              <div class="input-group input-group-sm mb-2 pos-search-group">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control pos-search-glow" id="${NS}-product-search"
                  placeholder="Código o descripción… (Enter)" autocomplete="off"${editable ? '' : ' disabled'}>
              </div>
              <div class="pos-product-list" id="${NS}-product-list"></div>
            </div>
          </div>
          <div class="pos-panel pos-panel-cart card shadow-sm">
            <div class="card-header py-2 d-flex align-items-center gap-2 flex-wrap">
              <div class="d-flex align-items-center gap-2">
                <i class="fa-solid fa-receipt"></i>
                <span class="fw-semibold">Documento actual</span>
              </div>
              ${
                editable && String(cfg.tipodoc || '').toUpperCase() === 'ENT'
                  ? `<div class="ms-auto d-flex flex-wrap gap-1">
                      <button type="button" class="btn btn-sm btn-outline-danger" id="${NS}-btn-vaciar"
                        title="Eliminar todas las líneas una por una (revierte stock)">
                        <i class="fa-solid fa-trash-can me-1"></i>Vaciar documento
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-warning" id="${NS}-btn-cero"
                        title="Agregar líneas para dejar existencias en cero">
                        <i class="fa-solid fa-scale-balanced me-1"></i>Dejar Inventario a Cero
                      </button>
                    </div>`
                  : ''
              }
            </div>
            <div class="card-body">
              <div class="pos-cart-table flex-grow-1 d-flex flex-column">
                <div class="table-responsive">
                  <table class="table table-sm table-hover mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Cód.</th>
                        <th>Producto</th>
                        <th class="text-end">Exist.</th>
                        <th class="text-center">Cant.</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody id="${NS}-cart-tbody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${editable ? PosDocSearchUI.fabBarHtml(NS, `${NS}-btn-finalizar`) : ''}
        ${PosDocSearchUI.productModalHtml(NS)}
      </div>`;
    },

    refreshListDom() {
      const grid = this._container?.querySelector(`#${NS}-doc-cards`);
      if (grid) grid.innerHTML = this.renderListCardsHtml();
      const sub = this._container?.querySelector('.pos-list-sub');
      if (sub) {
        sub.textContent = `${this.filteredDocsList().length} documento(s) operados · ${this._listMes}/${this._listAnio}`;
      }
    },

    bindListEvents() {
      const search = this._container?.querySelector(`#${NS}-list-search`);
      search?.addEventListener('input', () => {
        this._listFilter = search.value;
        this.refreshListDom();
      });

      const mesSel = this._container?.querySelector(`#${NS}-list-mes`);
      const anioSel = this._container?.querySelector(`#${NS}-list-anio`);
      const reloadPeriod = async () => {
        if (mesSel) this._listMes = parseInt(mesSel.value, 10) || this._listMes;
        if (anioSel) this._listAnio = parseInt(anioSel.value, 10) || this._listAnio;
        await this.fetchDocsList();
        this.refreshListDom();
      };
      mesSel?.addEventListener('change', () => {
        reloadPeriod().catch((err) => F.toast(err.message, 'error'));
      });
      anioSel?.addEventListener('change', () => {
        reloadPeriod().catch((err) => F.toast(err.message, 'error'));
      });

      DocTipoSelect.bind(this._container, `${NS}-list-coddoc`, this);

      this._container?.querySelector(`#${NS}-doc-cards`)?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.inv-card-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const card = btn.closest('.inv-doc-card');
        if (!card) return;
        const coddoc = card.getAttribute('data-coddoc');
        const correlativo = card.getAttribute('data-correlativo');
        const action = btn.getAttribute('data-action');
        try {
          if (action === 'editar') await this.showEditor(coddoc, correlativo);
          else if (action === 'imprimir') await this.imprimirDocumento(coddoc, correlativo);
          else if (action === 'bloquear') await this.bloquearDocumento(coddoc, correlativo);
          else if (action === 'eliminar') await this.eliminarDocumento(coddoc, correlativo);
        } catch (err) {
          F.toast(err.message || 'Error', 'error');
        }
      });

      this._container?.querySelector(`#${NS}-btn-nuevo`)?.addEventListener('click', () => this.onNuevo());

      PosDocSearchUI.bindDocKeyboard(this, {
        isDetail: () => false,
        onNuevo: () => this.onNuevo(),
      });
    },

    bindEditorEvents() {
      PosDocSearchUI.bind(this, NS, {
        getEditable: () => this.docEditable(this._documento?.header),
        buscarProductos: this.buscarProductos,
        onProductPick: (row) => this.onProductClick(row),
      });

      PosDocSearchUI.bindDocKeyboard(this, {
        isDetail: () => true,
        getEditable: () => this.docEditable(this._documento?.header),
        onNuevo: () => this.onNuevo(),
        onFinalizar: () => this.finalizarDocumento(),
      });

      this._container?.querySelector(`#${NS}-cart-tbody`)?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn || btn.disabled || this._cartBusy) return;
        e.preventDefault();
        const id = Number(btn.getAttribute('data-id'));
        const line = this.findLineById(id);
        if (!line) {
          F.toast('No se encontró la línea', 'warning');
          return;
        }
        const action = btn.getAttribute('data-action');
        this.setCartBusy(true);
        this.renderCart();
        try {
          if (action === 'line-del') {
            await this.eliminarLinea(id);
            return;
          }
          const qty = Number(line.CANTIDAD) || 1;
          if (action === 'qty-plus') await this.actualizarCantidad(id, qty + 1);
          else if (action === 'qty-minus') {
            if (qty <= 1) await this.eliminarLinea(id);
            else await this.actualizarCantidad(id, qty - 1);
          }
        } catch (err) {
          F.toast(err.message || 'Error al actualizar', 'error');
        } finally {
          this.setCartBusy(false);
          this.renderCart();
        }
      });

      this._container?.querySelector(`#${NS}-btn-atras`)?.addEventListener('click', () => this.showList());
      this._container?.querySelector(`#${NS}-btn-finalizar`)?.addEventListener('click', () => {
        this.finalizarDocumento().catch((err) => F.toast(err.message, 'error'));
      });
      this._container?.querySelector(`#${NS}-btn-cero`)?.addEventListener('click', () => {
        this.dejarInventarioACero().catch((err) => F.toast(err.message || 'Error', 'error'));
      });
      this._container?.querySelector(`#${NS}-btn-vaciar`)?.addEventListener('click', () => {
        this.vaciarDocumento().catch((err) => F.toast(err.message || 'Error', 'error'));
      });

      const fechaInp = this._container?.querySelector(`#${NS}-doc-fecha`);
      if (fechaInp) {
        fechaInp.addEventListener('change', () => {
          if (fechaInp.disabled) return;
          const val = fechaInp.value?.trim();
          if (!val) return;
          this.guardarFechaDocumento(val).catch((err) => F.toast(err.message, 'error'));
        });
      }
    },

    async buscarProductos(q) {
      const term = String(q ?? '').trim();
      if (!term) {
        PosDocSearchUI.resetProductSearch(this, NS);
        return;
      }
      if (this._loadingProducts) return;
      this._loadingProducts = true;
      const spinner = '<p class="text-muted small text-center py-3"><i class="fa-solid fa-spinner fa-spin"></i></p>';
      PosDocSearchUI.setListsHtml(this._container, NS, spinner);
      try {
        const data = await this.fetchProductos(term);
        this._productos = data.rows || [];
        if (!this._productos.length) {
          PosDocSearchUI.setListsHtml(
            this._container,
            NS,
            '<p class="text-muted small text-center py-3 mb-0">Sin resultados para la búsqueda</p>'
          );
          return;
        }
        this.renderProductList();
      } catch (err) {
        const errHtml = `<p class="text-danger small text-center py-3">${this.escapeHtml(err.message)}</p>`;
        PosDocSearchUI.setListsHtml(this._container, NS, errHtml);
      } finally {
        this._loadingProducts = false;
      }
    },

    async showList() {
      this._screen = 'list';
      this._documento = null;
      PosDocSearchUI.unbindDocKeyboard(this);
      PosDocSearchUI.teardown(NS);
      await this.fetchDocsList();
      this._container.innerHTML = this.renderListScreen();
      this.bindListEvents();
    },

    async showEditor(coddoc, correlativo, opts = {}) {
      this._screen = 'editor';
      PosDocSearchUI.unbindDocKeyboard(this);
      PosDocSearchUI.teardown(NS);
      if (coddoc && correlativo) {
        await this.loadDocumento(coddoc, correlativo, { skipRender: true });
      }
      this._container.innerHTML = this.renderEditorShell();
      this.bindEditorEvents();
      PosDocSearchUI.resetProductSearch(this, NS);
      this.renderAll();
      if (opts.focusProductSearch) {
        PosDocSearchUI.focusProductSearch(this._container, NS);
      }
    },

    async onNuevo() {
      try {
        if (this._container?.querySelector(`#${NS}-list-coddoc`)) {
          DocTipoSelect.syncFromDom(this._container, `${NS}-list-coddoc`, this);
        }
        await this.crearDocumento();
        const key = this.docKey();
        if (key) await this.showEditor(key.coddoc, key.correlativo, { focusProductSearch: true });
      } catch (err) {
        F.toast(err.message || 'Error al crear documento', 'error');
      }
    },

    async load(container) {
      PosDocSearchUI.clearActiveDocKeyboard();
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

      container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</div>`;

      try {
        this._config = await this.fetchConfig();
        DocTipoSelect.initView(this);
        if (!this._config.coddocDefault) {
          container.innerHTML = `
          <div class="alert alert-warning m-3 w-100">
            Configure un tipo de documento <strong>${this.escapeHtml(cfg.tipodoc || '')}</strong> activo para esta empresa.
          </div>`;
          return;
        }
        await this.showList();
      } catch (err) {
        container.innerHTML = `
        <div class="alert alert-danger m-3 w-100">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
      }
    },
  };
}

const EntradasInventarioView = createInventarioMovView({
  slug: 'inv-ent',
  apiBase: '/api/inventario/ent',
  tipodoc: 'ENT',
  listTitle: 'Entradas de inventario',
  finalizarTitle: 'Finalizar entrada de inventario',
  printTitle: 'Entrada de inventario',
});

const SalidasInventarioView = createInventarioMovView({
  slug: 'inv-sal',
  apiBase: '/api/inventario/sal',
  tipodoc: 'SAL',
  listTitle: 'Salidas de inventario',
  finalizarTitle: 'Finalizar salida de inventario',
  printTitle: 'Salida de inventario',
});
