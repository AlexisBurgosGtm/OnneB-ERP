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
   * Guardar / leer JSON en sessionStorage
   */
  session(key, value) {
    if (value === undefined) {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }
    sessionStorage.setItem(key, JSON.stringify(value));
    return value;
  },

  /**
   * Petición fetch con JSON
   */
  async fetchJson(url, options = {}) {
    const res = await fetch(url, {
      cache: options.cache ?? 'no-store',
      headers: { Accept: 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        if (errBody.error) message = errBody.error;
      } catch {
        /* respuesta no JSON */
      }
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
  },
};
