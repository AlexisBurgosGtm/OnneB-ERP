/**
 * Impresión de carné de empleado (frente + reverso con pliegue).
 * Uso: EmpleadoCarne.imprimir({ CODEMPLEADO, NOMEMPLEADO, DEPARTAMENTO })
 */
const EmpleadoCarne = {
  escapeHtml(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  fotoUrl(codempleado) {
    return `/api/empleados/${encodeURIComponent(codempleado)}/foto?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`;
  },

  qrApiUrl(payload, size = 200) {
    const params = new URLSearchParams({
      data: String(payload || ''),
      size: String(size),
      _: String(Date.now()),
    });
    return `/api/qr?${params}`;
  },

  async imageToDataUrl(url) {
    try {
      const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  },

  async buildQrDataUrl(payload) {
    const dataUrl = await this.imageToDataUrl(this.qrApiUrl(payload, 200));
    if (!dataUrl) throw new Error('No se pudo generar el código QR');
    return dataUrl;
  },

  async resolveDepartamento(row) {
    const existing = String(row?.DEPARTAMENTO || '').trim();
    if (existing) return existing;
    const cod = String(row?.CODEMPLEADO ?? '').trim();
    if (!cod) return '';
    try {
      const data = await F.fetchJson(
        `/api/nomina/empleados?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`,
        { cache: 'no-store' }
      );
      const hit = (data.rows || []).find((r) => String(r.CODEMPLEADO) === cod);
      return String(hit?.DEPARTAMENTO || '').trim();
    } catch {
      return '';
    }
  },

  async imprimir(row) {
    if (typeof PrintReport === 'undefined') {
      throw new Error('PrintReport no disponible');
    }
    const empnit = String(F.getEmpNit() || '').trim();
    const cod = String(row?.CODEMPLEADO ?? '').trim();
    if (!cod) throw new Error('Empleado inválido');
    const nombre = String(row?.NOMEMPLEADO || '').trim() || '—';
    const depto = (await this.resolveDepartamento(row)) || 'Sin departamento';
    const payload = `${empnit}-${cod}`;
    const [fotoData, qrSrc] = await Promise.all([
      this.imageToDataUrl(this.fotoUrl(cod)),
      this.buildQrDataUrl(payload),
    ]);
    const fotoSrc = fotoData || this.fotoUrl(cod);
    const logoSrc = (await PrintReport.ensureLogo()) || '';
    const empresa = PrintReport.escapeHtml(PrintReport.getEmpresaNombre());
    const logoHtml = logoSrc
      ? `<img class="carne-logo" src="${this.escapeHtml(logoSrc)}" alt="Logo">`
      : '';
    const bodyHtml = `
      <div class="carne-page">
        <div class="carne-card">
          <section class="carne-front">
            <div class="carne-front-head">
              <div class="carne-front-title">${empresa}</div>
              ${logoHtml}
            </div>
            <div class="carne-front-body">
              <div class="carne-foto-wrap">
                <img class="carne-foto" src="${this.escapeHtml(fotoSrc)}" alt="Foto"
                  onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="carne-foto-placeholder" style="display:none">Sin foto</div>
              </div>
              <div class="carne-info">
                <div class="carne-nombre">${this.escapeHtml(nombre)}</div>
                <div class="carne-depto">${this.escapeHtml(depto)}</div>
                <div class="carne-cod">Cód. ${this.escapeHtml(cod)}</div>
              </div>
            </div>
          </section>
          <div class="carne-fold" aria-hidden="true"></div>
          <section class="carne-back">
            <div class="carne-qr-wrap">
              <img class="carne-qr" src="${this.escapeHtml(qrSrc)}" alt="QR">
            </div>
          </section>
        </div>
      </div>`;
    const html = PrintReport.wrapDocument({
      title: `Carné — ${nombre}`,
      bodyHtml,
      extraStyles: `
        .carne-page{display:flex;justify-content:center;padding:1rem}
        .carne-card{
          width:340px;border:1px solid #222;border-radius:10px;overflow:hidden;
          font-family:Segoe UI,sans-serif;background:#fff;box-sizing:border-box
        }
        .carne-front{min-height:200px;padding:.65rem .75rem .55rem;box-sizing:border-box}
        .carne-front-head{
          display:flex;align-items:center;justify-content:space-between;gap:.5rem;
          margin-bottom:.55rem;padding-bottom:.4rem;border-bottom:1px solid #e5e7eb
        }
        .carne-front-title{
          flex:1;min-width:0;font-weight:700;font-size:12px;line-height:1.25;color:#111;
          letter-spacing:.01em
        }
        .carne-logo{
          flex:0 0 auto;max-height:28px;max-width:52px;width:auto;height:auto;
          object-fit:contain;display:block
        }
        .carne-front-body{display:grid;grid-template-columns:88px 1fr;gap:.65rem;align-items:start}
        .carne-foto,.carne-foto-placeholder{
          width:88px;height:110px;object-fit:cover;border:1px solid #ccc;border-radius:6px;background:#f3f4f6
        }
        .carne-foto-placeholder{display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:11px}
        .carne-info{min-width:0;padding-top:.15rem}
        .carne-nombre{font-size:14px;font-weight:700;line-height:1.25;margin-bottom:.3rem}
        .carne-depto{font-size:12px;color:#374151;margin-bottom:.2rem}
        .carne-cod{font-size:11px;color:#6b7280}
        .carne-fold{
          border:none;border-top:2px dashed #9ca3af;margin:0 .35rem;height:0
        }
        .carne-back{
          min-height:200px;display:flex;align-items:flex-end;justify-content:center;
          padding:.5rem .75rem 1.35rem;box-sizing:border-box
        }
        .carne-qr-wrap{display:flex;align-items:center;justify-content:center}
        .carne-qr{width:150px;height:150px;image-rendering:pixelated;display:block}
        @media print{.carne-page{padding:0}}
      `,
    });
    await PrintReport.openAndPrint(html);
  },
};
