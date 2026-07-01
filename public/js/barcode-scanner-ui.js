/**
 * Lector de códigos de barras con cámara (html5-qrcode).
 */
const BarcodeScannerUI = {
  _scanner: null,
  _scriptPromise: null,

  loadLibrary() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (this._scriptPromise) return this._scriptPromise;
    this._scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar el lector de códigos'));
      document.head.appendChild(s);
    });
    return this._scriptPromise;
  },

  barcodeFormats() {
    const F = window.Html5QrcodeSupportedFormats;
    if (!F) return undefined;
    return [
      F.EAN_13,
      F.EAN_8,
      F.CODE_128,
      F.CODE_39,
      F.UPC_A,
      F.UPC_E,
      F.ITF,
      F.CODABAR,
    ];
  },

  pickCameraId(cameras) {
    if (!cameras?.length) return null;
    const back = cameras.find((c) => /back|rear|environment|trasera/i.test(String(c.label || '')));
    return (back || cameras[0]).id;
  },

  async stop() {
    if (!this._scanner) return;
    const scanner = this._scanner;
    this._scanner = null;
    try {
      await scanner.stop();
    } catch (_) {
      /* cámara ya detenida */
    }
    try {
      scanner.clear();
    } catch (_) {
      /* ignore */
    }
  },

  async open({ onScan } = {}) {
    await this.loadLibrary();

    let lastCode = '';
    let lastAt = 0;

    await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: 'Escanear código de barras',
      html: `
        <p class="small text-muted mb-2">Apunte la cámara al código de barras del producto</p>
        <div class="barcode-scanner-region">
          <div id="barcode-scanner-reader"></div>
        </div>
        <p class="small text-muted mb-0 mt-2" id="barcode-scanner-status">Iniciando cámara…</p>
      `,
      width: 'min(100%, 480px)',
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText:
        typeof CatalogosUI !== 'undefined'
          ? CatalogosUI.cancelButtonHtml('Cerrar')
          : 'Cerrar',
      focusConfirm: false,
      didOpen: async () => {
        const statusEl = document.getElementById('barcode-scanner-status');
        try {
          const formats = this.barcodeFormats();
          const config = formats ? { formatsToSupport: formats, verbose: false } : { verbose: false };
          this._scanner = new Html5Qrcode('barcode-scanner-reader', config);

          const cameras = await Html5Qrcode.getCameras();
          const cameraId = this.pickCameraId(cameras);
          if (!cameraId) {
            if (statusEl) statusEl.textContent = 'No se encontró cámara en este dispositivo';
            return;
          }

          await this._scanner.start(
            cameraId,
            {
              fps: 12,
              qrbox: (viewfinderWidth, viewfinderHeight) => {
                const w = Math.min(viewfinderWidth * 0.92, 320);
                const h = Math.min(viewfinderHeight * 0.45, 140);
                return { width: Math.floor(w), height: Math.floor(h) };
              },
              aspectRatio: 1.777,
            },
            (decodedText) => {
              const code = String(decodedText ?? '').trim();
              if (!code) return;
              const now = Date.now();
              if (code === lastCode && now - lastAt < 1800) return;
              lastCode = code;
              lastAt = now;
              if (statusEl) statusEl.textContent = `Código leído: ${code}`;
              if (typeof onScan === 'function') onScan(code);
              Swal.close();
            },
            () => {}
          );
          if (statusEl) statusEl.textContent = 'Cámara activa — escanee un código';
        } catch (err) {
          if (statusEl) {
            statusEl.textContent = err.message || 'Error al iniciar la cámara';
          }
        }
      },
      willClose: async () => {
        await this.stop();
      },
    });
  },
};
