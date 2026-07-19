/**
 * Actualización global de inventario — recalcula saldos desde DOCPRODUCTOS.
 */
const InventarioActualizacionView = {
  _container: null,
  _preview: null,
  _loading: false,

  escapeHtml(value) {
    if (value == null) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  },

  formatQty(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  },

  previewApiUrl() {
    const empNit = F.getEmpNit();
    const params = new URLSearchParams({ empnit: empNit || '', _: String(Date.now()) });
    return `/api/inventario/recalcular/preview?${params.toString()}`;
  },

  recalcApiUrl() {
    const empNit = F.getEmpNit();
    const params = new URLSearchParams({ empnit: empNit || '' });
    return `/api/inventario/recalcular?${params.toString()}`;
  },

  corregirTipomApiUrl() {
    const empNit = F.getEmpNit();
    const params = new URLSearchParams({ empnit: empNit || '' });
    return `/api/inventario/recalcular/corregir-tipom?${params.toString()}`;
  },

  renderStat(label, value, extraClass = '') {
    return `
      <div class="inventario-recalc-stat ${extraClass}">
        <span class="inventario-recalc-stat-label">${this.escapeHtml(label)}</span>
        <span class="inventario-recalc-stat-value">${this.escapeHtml(value)}</span>
      </div>`;
  },

  renderPreviewCard() {
    const p = this._preview;
    if (!p) {
      return `
        <div class="card inventario-recalc-card shadow-sm">
          <div class="card-body text-center text-muted py-4">
            <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando resumen…
          </div>
        </div>`;
    }

    const tipomNulos = Number(p.tipomNulos) || 0;
    const hayCambios =
      (Number(p.discrepancias) || 0) > 0 ||
      (Number(p.invsaldoSinMovimiento) || 0) > 0 ||
      (Number(p.registrosDuplicados) || 0) > 0 ||
      tipomNulos > 0;
    const alertClass = hayCambios ? 'alert-warning' : 'alert-success';
    let alertText = hayCambios
      ? `Se detectaron ${this.formatQty(p.discrepancias)} diferencia(s) de saldo`
      : 'Los saldos calculados coinciden con INVSALDO según los movimientos actuales.';
    if (tipomNulos > 0) {
      alertText += `; ${this.formatQty(tipomNulos)} línea(s) con TIPOM nulo (usar «Corregir TIPOM nulos»).`;
    }
    if ((Number(p.invsaldoSinMovimiento) || 0) > 0) {
      alertText += `; ${this.formatQty(p.invsaldoSinMovimiento)} producto(s) sin movimientos se pondrán en cero.`;
    }
    if ((Number(p.registrosDuplicados) || 0) > 0) {
      alertText += `; ${this.formatQty(p.registrosDuplicados)} registro(s) duplicado(s) en INVSALDO se eliminarán.`;
    }
    if ((Number(p.productosSinInvSaldo) || 0) > 0) {
      alertText += ` ${this.formatQty(p.productosSinInvSaldo)} producto(s) con movimientos no tienen fila en INVSALDO (no se crearán).`;
    }

    return `
      <div class="card inventario-recalc-card shadow-sm">
        <div class="card-body">
          <h6 class="card-title mb-2">
            <i class="fa-solid fa-chart-column me-1 text-primary"></i>Resumen del cálculo
          </h6>
          <p class="small text-muted mb-3">
            Se consideran líneas de <strong>DOCPRODUCTOS</strong> cuyo documento <strong>no</strong> está anulado (STATUS ≠ A).
            Movimiento = TOTALUNIDADES × <strong>DOCPRODUCTOS.TIPOM</strong>. Solo se actualiza el registro principal de <strong>INVSALDO</strong> por producto (no se crean filas nuevas).
          </p>
          <div class="inventario-recalc-stats">
            ${this.renderStat('Líneas consideradas', this.formatQty(p.lineas))}
            ${this.renderStat('Productos', this.formatQty(p.productos))}
            ${this.renderStat('TIPOM nulos', this.formatQty(tipomNulos), tipomNulos > 0 ? 'text-warning' : '')}
            ${this.renderStat('Duplicados INVSALDO', this.formatQty(p.registrosDuplicados), (Number(p.registrosDuplicados) || 0) > 0 ? 'text-warning' : '')}
            ${this.renderStat('Total entradas', this.formatQty(p.totalEntradas), 'text-success')}
            ${this.renderStat('Total salidas', this.formatQty(p.totalSalidas), 'text-danger')}
            ${this.renderStat('Saldo neto', this.formatQty(p.saldoNeto))}
            ${this.renderStat('Discrepancias', this.formatQty(p.discrepancias), hayCambios ? 'text-warning' : '')}
          </div>
          <div class="alert ${alertClass} small mb-0 mt-3 py-2" role="status">${this.escapeHtml(alertText)}</div>
        </div>
      </div>`;
  },

  renderHtml() {
    return `
      <div class="inventario-recalc-wrap w-100">
        <div class="card inventario-recalc-intro shadow-sm mb-3">
          <div class="card-body">
            <h5 class="card-title mb-2">
              <i class="fa-solid fa-arrows-rotate me-1 text-primary"></i>Actualización de inventario
            </h5>
            <p class="card-text mb-2">
              Recalcula <strong>INVSALDO.SALDO</strong> y <strong>PRODUCTOS.EXISTENCIA</strong> a partir de todos
              los movimientos registrados en documentos (excepto anulados). Actualiza el registro existente de cada producto; no crea filas nuevas.
            </p>
            <p class="small text-muted mb-0">
              Use esta herramienta para corregir inconsistencias cuando la lógica normal de inventario haya fallado.
              La operación puede tardar según el volumen de datos.
            </p>
          </div>
        </div>
        <div id="inventario-recalc-preview">${this.renderPreviewCard()}</div>
        <div class="inventario-recalc-actions mt-3 d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-primary" id="btn-inventario-recalc-ejecutar">
            <i class="fa-solid fa-play me-1"></i>Ejecutar actualización
          </button>
          <button type="button" class="btn btn-outline-warning" id="btn-inventario-recalc-tipom">
            <i class="fa-solid fa-wrench me-1"></i>Corregir TIPOM nulos
          </button>
          <button type="button" class="btn btn-outline-secondary" id="btn-inventario-recalc-refrescar">
            <i class="fa-solid fa-rotate-right me-1"></i>Refrescar resumen
          </button>
        </div>
      </div>`;
  },

  async loadPreview() {
    const empNit = F.getEmpNit();
    if (!empNit) {
      this._preview = null;
      F.toast('No hay empresa activa en la sesión', 'warning');
      return;
    }
    const previewEl = document.getElementById('inventario-recalc-preview');
    if (previewEl) previewEl.innerHTML = this.renderPreviewCard();

    try {
      this._preview = await F.fetchJson(this.previewApiUrl(), { cache: 'no-store' });
      if (previewEl) previewEl.innerHTML = this.renderPreviewCard();
    } catch (err) {
      if (previewEl) {
        previewEl.innerHTML = `
          <div class="alert alert-danger mb-0">
            <i class="fa-solid fa-circle-exclamation me-1"></i>${this.escapeHtml(err.message)}
          </div>`;
      }
    }
  },

  setBusy(busy) {
    this._loading = busy;
    const btnRun = document.getElementById('btn-inventario-recalc-ejecutar');
    const btnRefresh = document.getElementById('btn-inventario-recalc-refrescar');
    const btnTipom = document.getElementById('btn-inventario-recalc-tipom');
    if (btnRun) {
      btnRun.disabled = busy;
      btnRun.innerHTML = busy
        ? '<i class="fa-solid fa-spinner fa-spin me-1"></i>Procesando…'
        : '<i class="fa-solid fa-play me-1"></i>Ejecutar actualización';
    }
    if (btnRefresh) btnRefresh.disabled = busy;
    if (btnTipom) btnTipom.disabled = busy;
  },

  async onCorregirTipom() {
    if (this._loading) return;
    const empNit = F.getEmpNit();
    if (!empNit) {
      F.toast('No hay empresa activa en la sesión', 'warning');
      return;
    }

    if (!this._preview) {
      await this.loadPreview();
    }

    const nulos = Number(this._preview?.tipomNulos) || 0;
    if (nulos === 0) {
      F.toast('No hay líneas con TIPOM nulo', 'info');
      return;
    }

    const ok = await CatalogosUI.fireConfirm({
      title: '¿Corregir TIPOM nulos?',
      html: `
        <p class="mb-2">Se actualizarán <strong>${this.escapeHtml(this.formatQty(nulos))}</strong> línea(s)
        de DOCPRODUCTOS con TIPOM NULL, copiando el TIPOM actual de TIPODOCUMENTOS.</p>
      <p class="small text-muted mb-0">Esto no recalcula inventario; después puede ejecutar la actualización.</p>`,
      icon: 'warning',
      confirmText: 'Sí, corregir',
    });
    if (!ok) return;

    this.setBusy(true);
    try {
      const data = await F.fetchJson(this.corregirTipomApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      this._preview = data.resumen || null;
      const previewEl = document.getElementById('inventario-recalc-preview');
      if (previewEl) previewEl.innerHTML = this.renderPreviewCard();
      F.toast(`TIPOM corregido en ${data.actualizados ?? 0} línea(s)`, 'success');
    } catch (err) {
      F.alert('Error al corregir TIPOM', err.message, 'error');
    } finally {
      this.setBusy(false);
    }
  },

  async onEjecutar() {
    if (this._loading) return;
    const empNit = F.getEmpNit();
    if (!empNit) {
      F.toast('No hay empresa activa en la sesión', 'warning');
      return;
    }

    if (!this._preview) {
      await this.loadPreview();
    }

    const p = this._preview || {};
    const tipomNulos = Number(p.tipomNulos) || 0;
    if (tipomNulos > 0) {
      const okTipom = await CatalogosUI.fireConfirm({
        title: 'Hay TIPOM nulos',
        html: `
          <p class="mb-2">Hay <strong>${this.escapeHtml(this.formatQty(tipomNulos))}</strong> línea(s) con TIPOM nulo.
          Esas líneas no se incluirán en el cálculo.</p>
          <p class="small text-muted mb-0">Puede corregirlas antes con «Corregir TIPOM nulos», o continuar de todos modos.</p>`,
        icon: 'warning',
        confirmText: 'Continuar sin corregir',
      });
      if (!okTipom) return;
    }

    const lineas = Number(p.lineas) || 0;
    if (lineas === 0) {
      const okEmpty = await CatalogosUI.fireConfirm({
        title: '¿Continuar sin movimientos?',
        text: 'No se encontraron líneas de inventario. Los saldos en INVSALDO sin movimiento se pondrán en cero.',
        icon: 'warning',
        confirmText: 'Continuar',
      });
      if (!okEmpty) return;
    } else {
      const ok = await CatalogosUI.fireConfirm({
        title: '¿Actualizar inventario global?',
        html: `
          <p class="mb-2">Se recalcularán los saldos de <strong>${this.escapeHtml(this.formatQty(p.productos))}</strong> producto(s)
          a partir de <strong>${this.escapeHtml(this.formatQty(lineas))}</strong> línea(s).</p>
          <p class="small text-muted mb-0">Entradas: ${this.escapeHtml(this.formatQty(p.totalEntradas))} ·
          Salidas: ${this.escapeHtml(this.formatQty(p.totalSalidas))} ·
          Neto: ${this.escapeHtml(this.formatQty(p.saldoNeto))}</p>`,
        icon: 'warning',
        confirmText: 'Sí, actualizar',
      });
      if (!ok) return;
    }

    this.setBusy(true);
    try {
      const data = await F.fetchJson(this.recalcApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      this._preview = data.resumen || null;
      const previewEl = document.getElementById('inventario-recalc-preview');
      if (previewEl) previewEl.innerHTML = this.renderPreviewCard();

      F.toast(
        `Inventario actualizado: ${data.actualizados ?? 0} saldo(s), ${data.duplicadosEliminados ?? 0} duplicado(s) eliminado(s)`,
        'success',
      );
    } catch (err) {
      F.alert('Error al actualizar inventario', err.message, 'error');
    } finally {
      this.setBusy(false);
    }
  },

  bindEvents() {
    document.getElementById('btn-inventario-recalc-ejecutar')?.addEventListener('click', () => {
      this.onEjecutar();
    });
    document.getElementById('btn-inventario-recalc-tipom')?.addEventListener('click', () => {
      this.onCorregirTipom();
    });
    document.getElementById('btn-inventario-recalc-refrescar')?.addEventListener('click', () => {
      this.loadPreview();
    });
  },

  async load(container) {
    this._container = container;
    this._preview = null;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start');
    container.innerHTML = this.renderHtml();
    this.bindEvents();
    await this.loadPreview();
  },
};
