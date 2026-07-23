/**
 * Funciones genéricas del proyecto OnneB POS
 * Uso: F.nombreFuncion(...)
 */
let F = {
  /**
   * Muestra alerta con SweetAlert2
   */
  alert(title, text = '', icon = 'info') {
    const onlyOk = typeof CatalogosUI !== 'undefined';
    if (onlyOk) {
      return Swal.fire({
        ...CatalogosUI.modalBase(),
        title,
        text,
        icon,
        showCancelButton: false,
        confirmButtonText: CatalogosUI.guardarButtonHtml('Aceptar'),
      });
    }
    return Swal.fire({
      title,
      text,
      icon,
      confirmButtonColor: '#2563eb',
    });
  },

  /**
   * Toast breve
   */
  toast(message, icon = 'success') {
    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2800,
      timerProgressBar: true,
    });
    return Toast.fire({ icon, title: message });
  },

  /**
   * Fecha en formato dd-mm-yyyy
   */
  formatDateDD(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  },

  /**
   * Formato de fecha local
   */
  formatDate(date = new Date(), locale = 'es-MX') {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  },

  /**
   * Formato de moneda
   */
  formatCurrency(amount, currency = 'MXN', locale = 'es-MX') {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  },

  /**
   * Debounce para eventos
   */
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), delay);
    };
  },

  /**
   * Query selector seguro
   */
  $(selector, parent = document) {
    return parent.querySelector(selector);
  },

  /**
   * Guardar / leer JSON en localStorage (sesión de trabajo; se limpia al recargar la página).
   * Migra datos previos de sessionStorage.
   */
  session(key, value) {
    try {
      if (value === undefined) {
        let raw = localStorage.getItem(key);
        if (!raw) {
          raw = sessionStorage.getItem(key);
          if (raw) {
            localStorage.setItem(key, raw);
            sessionStorage.removeItem(key);
          }
        }
        return raw ? JSON.parse(raw) : null;
      }
      const json = JSON.stringify(value);
      localStorage.setItem(key, json);
      sessionStorage.setItem(key, json);
      return value;
    } catch (err) {
      console.warn('[Session]', err);
      return value === undefined ? null : value;
    }
  },

  clearSession(key) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (err) {
      console.warn('[Session] clear:', err);
    }
  },

  isLoggedIn() {
    const user = this.session('user');
    return Boolean(user?.empNit);
  },

  /** EMPNIT de la empresa activa (sesión global) */
  getEmpNit() {
    const user = this.session('user');
    return user?.empNit ?? window.OnnebContext?.empNit ?? null;
  },

  getEmpNitNombre() {
    const user = this.session('user');
    return user?.empNombre ?? window.OnnebContext?.empNombre ?? '';
  },

  /** CODEMPLEADO de la sesión (null si superusuario o no definido). */
  sessionCodEmpleado() {
    const n = parseInt(this.session('user')?.codempleado, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  },

  /**
   * CODVEN por defecto: empleado de sesión si aparece en la lista de vendedores.
   * @param {Array<{CODEMPLEADO:number|string}>} vendedores
   */
  defaultCodvenFromSession(vendedores) {
    const cod = this.sessionCodEmpleado();
    if (cod == null) return null;
    const ok = (vendedores || []).some((v) => String(v.CODEMPLEADO) === String(cod));
    return ok ? cod : null;
  },

  setEmpresaGlobal(empNit, empNombre = '') {
    window.OnnebContext = {
      ...(window.OnnebContext || {}),
      empNit,
      empNombre,
    };
    const user = this.session('user') || {};
    this.session('user', { ...user, empNit, empNombre });
  },

  /** Socket.IO compartido (misma conexión / rooms de sesión). */
  _socket: null,

  setSocket(socket) {
    this._socket = socket || null;
    window.OnnebSocket = this._socket;
  },

  getSocket() {
    return this._socket || window.OnnebSocket || null;
  },

  /**
   * Bloqueo global durante POST/PUT/PATCH/DELETE (evita doble envío).
   */
  _mutationDepth: 0,

  beginMutation() {
    this._mutationDepth += 1;
    if (this._mutationDepth === 1) {
      document.body.classList.add('onneb-mutation-busy');
      document.body.setAttribute('aria-busy', 'true');
    }
  },

  endMutation() {
    if (this._mutationDepth <= 0) return;
    this._mutationDepth -= 1;
    if (this._mutationDepth === 0) {
      document.body.classList.remove('onneb-mutation-busy');
      document.body.removeAttribute('aria-busy');
    }
  },

  async runMutation(fn) {
    this.beginMutation();
    try {
      return await fn();
    } finally {
      this.endMutation();
    }
  },

  isMutationMethod(method) {
    return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method || 'GET').toUpperCase());
  },

  /**
   * Petición fetch con JSON
   */
  async fetchJson(url, options = {}) {
    const isMutation = this.isMutationMethod(options.method);
    if (isMutation) this.beginMutation();
    try {
      const res = await fetch(url, {
        cache: options.cache ?? 'no-store',
        headers: { Accept: 'application/json', ...options.headers },
        ...options,
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        let payload = null;
        try {
          const errBody = await res.json();
          payload = errBody;
          if (errBody.error) message = errBody.error;
        } catch {
          /* respuesta no JSON */
        }
        const err = new Error(message);
        if (payload) err.payload = payload;
        throw err;
      }
      if (res.status === 204) return null;
      return res.json();
    } finally {
      if (isMutation) this.endMutation();
    }
  },
};
