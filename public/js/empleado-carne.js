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

  /**
   * Code 128-B como SVG (empnit-codempleado y demás ASCII 32–126).
   */
  code128Svg(text, { height = 52, module = 1.35 } = {}) {
    const data = String(text || '');
    const patterns = [
      '11011001100','11001101100','11001100110','10010011000','10010001100',
      '10001001100','10011001000','10011000100','10001100100','11001001000',
      '11001000100','11000100100','10110011100','10011011100','10011001110',
      '10111001100','10011101100','10011100110','11001110010','11001011100',
      '11001001110','11011100100','11001110100','11101101110','11101001100',
      '11100101100','11100100110','11101100100','11100110100','11100110010',
      '11011011000','11011000110','11000110110','10100011000','10001011000',
      '10001000110','10110001000','10001101000','10001100010','11010001000',
      '11000101000','11000100010','10110111000','10110001110','10001101110',
      '10111011000','10111000110','10001110110','11101110110','11010001110',
      '11000101110','11011101000','11011100010','11011101110','11101011000',
      '11101000110','11100010110','11101101000','11101100010','11100011010',
      '11101111010','11001000010','11110001010','10100110000','10100001100',
      '10010110000','10010000110','10000101100','10000100110','10110010000',
      '10110000100','10011010000','10011000010','10000110100','10000110010',
      '11000010010','11001010000','11110111010','11000010100','10001111010',
      '10100111100','10010111100','10010011110','10111100100','10011110100',
      '10011110010','11110100100','11110010100','11110010010','11011011110',
      '11011110110','11110110110','10101111000','10100011110','10001011110',
      '10111101000','10111100010','11110101000','11110100010','10111011110',
      '10111101110','11101011110','11110101110','11010000100','11010010000',
      '11010011100','1100011101011',
    ];
    const codes = [104];
    for (const ch of data) {
      const v = ch.charCodeAt(0) - 32;
      if (v < 0 || v > 94) {
        throw new Error('El código del carné no se puede representar en Code 128');
      }
      codes.push(v);
    }
    let checksum = 104;
    for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
    codes.push(checksum % 103);
    codes.push(106);
    let bits = '';
    for (const c of codes) bits += patterns[c];
    const quiet = 8;
    const width = quiet * 2 + bits.length * module;
    const rects = [];
    let x = quiet;
    for (const bit of bits) {
      if (bit === '1') {
        rects.push(`<rect x="${x.toFixed(2)}" y="0" width="${module}" height="${height}"/>`);
      }
      x += module;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(2)}" height="${height}" viewBox="0 0 ${width.toFixed(2)} ${height}" preserveAspectRatio="xMidYMid meet">${rects.join('')}</svg>`;
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
    const barcodeSvg = this.code128Svg(payload, { height: 46, module: 1.2 });
    const bodyHtml = `
      <div class="carne-page">
        <div class="carne-card">
          <section class="carne-front">
            <div class="carne-front-title">${empresa}</div>
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
            ${logoHtml}
          </section>
          <div class="carne-fold" aria-hidden="true"></div>
          <section class="carne-back">
            <div class="carne-barcode-wrap">
              <div class="carne-barcode">${barcodeSvg}</div>
              <div class="carne-barcode-text">${this.escapeHtml(payload)}</div>
            </div>
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
        .carne-front{
          position:relative;min-height:200px;padding:.65rem .75rem 3.1rem;box-sizing:border-box
        }
        .carne-front-title{
          font-weight:700;font-size:12px;line-height:1.25;color:#111;letter-spacing:.01em;
          margin-bottom:.55rem;padding-bottom:.4rem;border-bottom:1px solid #e5e7eb
        }
        .carne-logo{
          position:absolute;right:.65rem;bottom:.45rem;
          max-height:48px;max-width:92px;width:auto;height:auto;
          object-fit:contain;display:block
        }
        .carne-front-body{display:grid;grid-template-columns:88px 1fr;gap:.65rem;align-items:start}
        .carne-foto,.carne-foto-placeholder{
          width:88px;height:110px;object-fit:cover;border:1px solid #ccc;border-radius:6px;background:#f3f4f6
        }
        .carne-foto-placeholder{display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:11px}
        .carne-info{min-width:0;padding-top:.15rem;padding-right:.15rem}
        .carne-nombre{font-size:14px;font-weight:700;line-height:1.25;margin-bottom:.3rem}
        .carne-depto{font-size:12px;color:#374151;margin-bottom:.2rem}
        .carne-cod{font-size:11px;color:#6b7280}
        .carne-fold{
          border:none;border-top:2px dashed #9ca3af;margin:0 .35rem;height:0
        }
        .carne-back{
          min-height:200px;display:flex;align-items:center;justify-content:space-between;
          gap:.55rem;padding:.7rem .7rem 1.1rem;box-sizing:border-box
        }
        .carne-barcode-wrap{
          flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center
        }
        .carne-barcode{width:100%;line-height:0}
        .carne-barcode svg{width:100%;height:48px;display:block}
        .carne-barcode-text{
          margin-top:.2rem;font-size:9px;letter-spacing:.02em;color:#111;text-align:center;
          word-break:break-all;font-family:Consolas,Menlo,monospace
        }
        .carne-qr-wrap{flex:0 0 auto;display:flex;align-items:center;justify-content:center}
        .carne-qr{width:118px;height:118px;image-rendering:pixelated;display:block}
        @media print{.carne-page{padding:0}}
      `,
    });
    await PrintReport.openAndPrint(html);
  },
};
