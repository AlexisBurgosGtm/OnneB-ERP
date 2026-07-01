/**
 * Permisos de menú e inicio según CODTIPOEMPLEADO (Empleados).
 */
const TipoEmpleadoAccess = {
  TIPO_ADMIN: 1,
  TIPO_SUPERVISOR: 2,
  TIPO_VENDEDOR: 3,
  TIPO_VISITADOR: 4,
  TIPO_BODEGA: 5,
  TIPO_TRANSPORTE: 6,

  ALL_MENUS: [
    'inicio',
    'pedidos-mostrador',
    'facturacion',
    'notas-credito',
    'compras',
    'notas-debito',
    'gastos',
    'corte-caja',
    'cotizaciones',
    'tareas',
    'cuentas-cobrar',
    'cuentas-pagar',
    'retenciones-isr',
    'retenciones-iva',
    'libro-compras',
    'libro-ventas',
    'libro-diario',
    'libro-mayor',
    'libro-balance',
    'nomenclatura-contable',
    'formatos-contables',
    'configuraciones-contabilidad',
    'productos-precios',
    'inventario',
    'entradas-inventario',
    'salidas-inventario',
    'inventario-retroactivo',
    'actualizacion-inventario',
    'documentos',
    'empleados',
    'marcas',
    'medidas',
    'proveedores',
    'clientes',
    'tipo-negocios',
    'municipios',
    'departamentos',
    'rutas',
    'fabricantes',
    'ubicaciones',
    'cajas',
    'servicio-mecanica',
    'mantenimiento-llantas',
    'registro-kilometrajes',
    'vehiculos',
    'plataformas',
    'empresas',
    'config-general',
    'tipo-documentos',
    'credenciales-fel',
    'updater',
    'developer',
  ],

  MENU_BY_TIPO: {
    1: null,
    2: [
      'inicio',
      'pedidos-mostrador',
      'facturacion',
      'notas-credito',
      'compras',
      'notas-debito',
      'gastos',
      'corte-caja',
      'cotizaciones',
      'tareas',
      'cuentas-cobrar',
      'cuentas-pagar',
      'retenciones-isr',
      'retenciones-iva',
      'libro-compras',
      'libro-ventas',
      'libro-diario',
      'libro-mayor',
      'libro-balance',
      'nomenclatura-contable',
      'formatos-contables',
      'configuraciones-contabilidad',
      'productos-precios',
      'inventario',
      'entradas-inventario',
      'salidas-inventario',
      'inventario-retroactivo',
      'actualizacion-inventario',
      'documentos',
      'clientes',
      'proveedores',
      'rutas',
    ],
    3: [
      'inicio',
      'pedidos-mostrador',
      'facturacion',
      'notas-credito',
      'corte-caja',
      'cotizaciones',
      'tareas',
      'cuentas-cobrar',
      'documentos',
    ],
    4: ['inicio', 'clientes', 'rutas', 'documentos'],
    5: [
      'inicio',
      'productos-precios',
      'inventario',
      'entradas-inventario',
      'salidas-inventario',
      'actualizacion-inventario',
    ],
    6: [
      'inicio',
      'servicio-mecanica',
      'mantenimiento-llantas',
      'registro-kilometrajes',
      'vehiculos',
      'plataformas',
    ],
  },

  getSessionUser() {
    return F.session('user') || {};
  },

  getCodTipo(sessionUser) {
    const user = sessionUser || this.getSessionUser();
    if (user?.superUser) return this.TIPO_ADMIN;
    const n = Number(user?.codtipoempleado);
    return Number.isFinite(n) && n > 0 ? n : null;
  },

  allowedMenus(codtipo) {
    if (codtipo === this.TIPO_ADMIN || codtipo === null) {
      return new Set(this.ALL_MENUS);
    }
    const list = this.MENU_BY_TIPO[codtipo];
    return new Set(list && list.length ? list : ['inicio']);
  },

  canAccessMenu(menuKey, sessionUser) {
    const key = String(menuKey || '').trim();
    if (!key) return false;
    const allowed = this.allowedMenus(this.getCodTipo(sessionUser));
    return allowed.has(key);
  },

  tipoLabel(codtipo) {
    const cache = window._onnebTiposEmpleadoCache || [];
    const found = cache.find((t) => Number(t.value) === Number(codtipo));
    if (found) return String(found.label || found.code || '').trim();
    const fallback = {
      1: 'ADMINISTRADOR',
      2: 'SUPERVISOR',
      3: 'VENDEDOR',
      4: 'VISITADOR',
      5: 'BODEGA',
      6: 'TRANSPORTE',
    };
    return fallback[codtipo] || 'Empleado';
  },

  applySidebarVisibility() {
    const allowed = this.allowedMenus(this.getCodTipo());
    document.querySelectorAll('.sidebar-link[data-menu]').forEach((link) => {
      const key = link.dataset.menu;
      const li = link.closest('li');
      if (li) li.hidden = !allowed.has(key);
    });
    document.querySelectorAll('.sidebar-accordion .accordion-item').forEach((item) => {
      const links = item.querySelectorAll('.sidebar-link[data-menu]');
      const anyVisible = Array.from(links).some((link) => {
        const li = link.closest('li');
        return li && !li.hidden;
      });
      item.hidden = !anyVisible;
    });
  },

  resetSidebarVisibility() {
    document.querySelectorAll('.sidebar-link[data-menu]').forEach((link) => {
      const li = link.closest('li');
      if (li) li.hidden = false;
    });
    document.querySelectorAll('.sidebar-accordion .accordion-item').forEach((item) => {
      item.hidden = false;
    });
  },
};
