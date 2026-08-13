/**
 * Lector de códigos de barras / QR con cámara (html5-qrcode).
 */
const BarcodeScannerUI = {
  _scanner: null,
  _scriptPromise: null,

  loadLibrary() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (this._scriptPromise) return this._scriptPromise;
    this._scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/html5-qrcode/html5-qrcode.min.js';
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

  qrFormats() {
    const F = window.Html5QrcodeSupportedFormats;
    if (!F || F.QR_CODE == null) return undefined;
    return [F.QR_CODE];
  },

  pickCameraId(cameras) {
    if (!cameras?.length) return null;
    const back = cameras.find((c) => /back|rear|environment|trasera/i.test(String(c.label || '')));
    return (back || cameras[0]).id;
  },

  cameraErrorMessage(err) {
    const name = String(err?.name || '');
    const msg = String(err?.message || err || '');
    if (/NotAllowedError|Permission|Denied|denied/i.test(name + msg)) {
      return 'Permiso de cámara denegado. Habilítela en el navegador e intente de nuevo.';
    }
    if (/NotFoundError|DevicesNotFound|no.*camera/i.test(name + msg)) {
      return 'No se encontró cámara en este dispositivo.';
    }
    if (/NotReadableError|TrackStartError|Could not start video/i.test(name + msg)) {
      return 'La cámara está en uso por otra aplicación. Ciérrela e intente de nuevo.';
    }
    if (/secure|https|getUserMedia/i.test(msg)) {
      return 'La cámara requiere HTTPS o localhost.';
    }
    if (/qrbox|box size|larger than/i.test(msg)) {
      return 'No se pudo ajustar el visor de la cámara. Reintente.';
    }
    return msg || 'Error al iniciar la cámara';
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

  barcodeScanConfig() {
    return {
      fps: 12,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const w = Math.min(viewfinderWidth * 0.92, 320);
        const h = Math.min(viewfinderHeight * 0.4, 140);
        return {
          width: Math.max(120, Math.floor(w)),
          height: Math.max(60, Math.floor(h)),
        };
      },
      aspectRatio: 1.777,
    };
  },

  /** Visor cuadrado: evita error de qrbox en QR / webcams desktop. */
  qrScanConfig() {
    return {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const edge = Math.min(viewfinderWidth, viewfinderHeight);
        const size = Math.max(140, Math.floor(edge * 0.7));
        const clamped = Math.min(size, Math.floor(edge) - 8);
        return { width: clamped, height: clamped };
      },
    };
  },

  /**
   * Intenta varias formas de abrir la cámara (id → environment → user).
   */
  async startWithFallback(scanner, cameras, scanConfig, onSuccess, onFailure) {
    const attempts = [];
    const cameraId = this.pickCameraId(cameras);
    if (cameraId) attempts.push(cameraId);
    attempts.push({ facingMode: 'environment' });
    attempts.push({ facingMode: 'user' });

    let lastErr = null;
    for (const cameraConfig of attempts) {
      try {
        await scanner.start(cameraConfig, scanConfig, onSuccess, onFailure || (() => {}));
        return true;
      } catch (err) {
        lastErr = err;
        try {
          await scanner.stop();
        } catch (_) {
          /* ignore */
        }
      }
    }
    throw lastErr || new Error('No se pudo iniciar la cámara');
  },

  async open({ onScan, title, hint, formatsToSupport, mode = 'barcode' } = {}) {
    await this.loadLibrary();
    await this.stop();

    let lastCode = '';
    let lastAt = 0;
    const formats =
      formatsToSupport !== undefined
        ? formatsToSupport
        : mode === 'qr'
          ? this.qrFormats()
          : this.barcodeFormats();
    const scanConfig = mode === 'qr' ? this.qrScanConfig() : this.barcodeScanConfig();

    await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: title || (mode === 'qr' ? 'Escanear código QR' : 'Escanear código de barras'),
      html: `
        <p class="small text-muted mb-2">${
          hint ||
          (mode === 'qr'
            ? 'Apunte la cámara al código QR del carné'
            : 'Apunte la cámara al código de barras del producto')
        }</p>
        <div class="barcode-scanner-region barcode-scanner-region--${mode === 'qr' ? 'qr' : 'barcode'}">
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
        const readerEl = document.getElementById('barcode-scanner-reader');
        try {
          if (!readerEl) throw new Error('No se pudo preparar el visor de cámara');
          readerEl.innerHTML = '';

          // Esperar a que el modal pinte el contenedor (evita qrbox > video).
          await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)));

          const config = formats ? { formatsToSupport: formats, verbose: false } : { verbose: false };
          this._scanner = new Html5Qrcode('barcode-scanner-reader', config);

          let cameras = [];
          try {
            cameras = await Html5Qrcode.getCameras();
          } catch (camErr) {
            // En algunos navegadores getCameras falla; startWithFallback usa facingMode.
            cameras = [];
            console.warn('[BarcodeScannerUI] getCameras', camErr?.message || camErr);
          }

          if (!cameras.length && !navigator?.mediaDevices?.getUserMedia) {
            if (statusEl) {
              statusEl.textContent = 'Este navegador no permite acceso a la cámara.';
            }
            return;
          }

          await this.startWithFallback(
            this._scanner,
            cameras,
            scanConfig,
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
            }
          );
          if (statusEl) {
            statusEl.textContent =
              mode === 'qr' ? 'Cámara activa — escanee el QR' : 'Cámara activa — escanee un código';
          }
        } catch (err) {
          console.warn('[BarcodeScannerUI] start', err);
          if (statusEl) statusEl.textContent = this.cameraErrorMessage(err);
        }
      },
      willClose: async () => {
        await this.stop();
      },
    });
  },

  /** Escáner orientado a QR (asistencia, carné, etc.). */
  async openQr({ onScan } = {}) {
    return this.open({
      onScan,
      title: 'Escanear código QR',
      hint: 'Apunte la cámara al código QR del carné',
      mode: 'qr',
      formatsToSupport: this.qrFormats(),
    });
  },
};
