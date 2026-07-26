const fs = require('fs');
const path = require('path');

const ACCESO_PATH = path.join(__dirname, '..', 'data', 'menu-acceso-tipos.json');
const TIPOS_PATH = path.join(__dirname, '..', 'public', 'data', 'tipos-empleado.json');

const ALL_MENUS = [
  'inicio',
  'pedidos-mostrador',
  'comandas-restaurante',
  'facturacion',
  'facturas-electronicas',
  'notas-credito',
  'notas-abono',
  'compras',
  'notas-debito',
  'gastos',
  'corte-caja',
  'cotizaciones',
  'fraccionamiento-fac',
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
  'movimientos-banco',
  'bancos',
  'cuentas-bancarias',
  'productos-precios',
  'inventario',
  'entradas-inventario',
  'salidas-inventario',
  'inventario-retroactivo',
  'actualizacion-inventario',
  'crear-traslado',
  'recibir-traslado',
  'documentos',
  'resumen-del-dia',
  'autorizaciones',
  'subir-catalogo',
  'descargar-catalogo',
  'empleados',
  'nomina-config',
  'nomina-conceptos',
  'nomina-empleados',
  'nomina-vales',
  'nomina-interna',
  'nomina-igss',
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
  'mesas-restaurante',
  'cajas',
  'servicio-mecanica',
  'mantenimiento-llantas',
  'registro-kilometrajes',
  'vehiculos',
  'plataformas',
  'empresas',
  'config-general',
  'roles-usuarios',
  'tipo-documentos',
  'formatos-impresion',
  'credenciales-fel',
  'updater',
  'licencia',
  'developer',
];

const MENU_LABELS = {
  inicio: 'Inicio',
  'pedidos-mostrador': 'Pedidos de Mostrador',
  'comandas-restaurante': 'Comandas Restaurante',
  facturacion: 'Facturas normales',
  'facturas-electronicas': 'Facturas Electrónicas',
  'notas-credito': 'Notas de Credito (clientes)',
  'notas-abono': 'Notas de Abono',
  compras: 'Compras',
  'notas-debito': 'Notas de credito (Proveedores)',
  gastos: 'Gastos',
  'corte-caja': 'Corte de Caja',
  cotizaciones: 'Cotizaciones',
  'fraccionamiento-fac': 'Fraccionamiento Facturas',
  tareas: 'Tareas',
  'cuentas-cobrar': 'Cuentas por Cobrar',
  'cuentas-pagar': 'Cuentas por Pagar',
  'retenciones-isr': 'Retenciones ISR',
  'retenciones-iva': 'Retenciones IVA',
  'libro-compras': 'Libro Compras',
  'libro-ventas': 'Libro Ventas',
  'libro-diario': 'Libro Diario',
  'libro-mayor': 'Libro Mayor',
  'libro-balance': 'Libro Balance',
  'nomenclatura-contable': 'Nomenclatura Contable',
  'formatos-contables': 'Formatos Contables',
  'configuraciones-contabilidad': 'Configuraciones Contabilidad',
  'movimientos-banco': 'Movimientos',
  bancos: 'Bancos',
  'cuentas-bancarias': 'Cuentas Bancarias',
  'productos-precios': 'Productos y precios',
  inventario: 'Inventario',
  'entradas-inventario': 'Entradas de inventario',
  'salidas-inventario': 'Salidas de inventario',
  'inventario-retroactivo': 'Inventario Retroactivo',
  'actualizacion-inventario': 'Actualización de inventario',
  'crear-traslado': 'Crear Traslado',
  'recibir-traslado': 'Recibir Traslado',
  documentos: 'Documentos',
  'resumen-del-dia': 'Resumen del día',
  autorizaciones: 'Autorizaciones',
  'subir-catalogo': 'Subir catálogo',
  'descargar-catalogo': 'Descargar Catálogo',
  empleados: 'Empleados',
  'nomina-config': 'Configuración nómina',
  'nomina-conceptos': 'Conceptos nómina',
  'nomina-empleados': 'Datos nómina empleados',
  'nomina-vales': 'Vales a Empleados',
  'nomina-interna': 'Nómina interna',
  'nomina-igss': 'Planilla IGSS',
  marcas: 'Marcas',
  medidas: 'Medidas',
  proveedores: 'Proveedores',
  clientes: 'Clientes',
  'tipo-negocios': 'Tipo de Negocios',
  municipios: 'Municipios',
  departamentos: 'Departamentos',
  rutas: 'Rutas',
  fabricantes: 'Fabricantes',
  ubicaciones: 'Ubicaciones',
  'mesas-restaurante': 'Mesas Restaurante',
  cajas: 'Cajas',
  'servicio-mecanica': 'Servicio Mecánica',
  'mantenimiento-llantas': 'Mantenimiento de llantas',
  'registro-kilometrajes': 'Registro de Kilometrajes',
  vehiculos: 'Vehículos',
  plataformas: 'Plataformas',
  empresas: 'Empresas',
  'config-general': 'Config general',
  'roles-usuarios': 'Roles de usuarios',
  'tipo-documentos': 'Tipo documentos',
  'formatos-impresion': 'Formatos de impresión',
  'credenciales-fel': 'Credenciales FEL',
  updater: 'Actualizador BD',
  licencia: 'Licencia',
  developer: 'Developer',
};

const MENU_GROUPS = [
  // También alimenta el generador de licencias (lib/license-modules.js).
  // Toda vista nueva debe ir aquí en el grupo/módulo comercial correcto.
  { id: 'general', title: 'General', menus: ['inicio'] },
  {
    id: 'operaciones',
    title: 'Operaciones',
    menus: [
      'pedidos-mostrador',
      'comandas-restaurante',
      'cotizaciones',
      'fraccionamiento-fac',
      'facturacion',
      'facturas-electronicas',
      'notas-credito',
      'notas-abono',
      'compras',
      'notas-debito',
      'gastos',
      'corte-caja',
      'tareas',
    ],
  },
  {
    id: 'cuentas',
    title: 'Cuentas por cobrar / pagar',
    menus: ['cuentas-cobrar', 'cuentas-pagar'],
  },
  {
    id: 'inventarios',
    title: 'Inventarios',
    menus: [
      'productos-precios',
      'inventario',
      'entradas-inventario',
      'salidas-inventario',
      'inventario-retroactivo',
      'actualizacion-inventario',
    ],
  },
  {
    id: 'traslados',
    title: 'Traslados de Mercadería',
    menus: ['crear-traslado', 'recibir-traslado'],
  },
  { id: 'archivo', title: 'Archivo', menus: ['documentos', 'resumen-del-dia', 'autorizaciones'] },
  {
    id: 'online-services',
    title: 'Online Services',
    menus: ['subir-catalogo', 'descargar-catalogo'],
  },
  {
    id: 'contabilidad',
    title: 'Contabilidad',
    menus: [
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
    ],
  },
  {
    id: 'bancos',
    title: 'Bancos',
    menus: ['movimientos-banco', 'bancos', 'cuentas-bancarias'],
  },
  {
    id: 'rh',
    title: 'Recursos Humanos',
    menus: [
      'empleados',
      'nomina-config',
      'nomina-conceptos',
      'nomina-empleados',
      'nomina-vales',
      'nomina-interna',
      'nomina-igss',
    ],
  },
  {
    id: 'catalogos',
    title: 'Catálogos',
    menus: [
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
      'mesas-restaurante',
      'cajas',
    ],
  },
  {
    id: 'transportes',
    title: 'Transportes',
    menus: [
      'servicio-mecanica',
      'mantenimiento-llantas',
      'registro-kilometrajes',
      'vehiculos',
      'plataformas',
    ],
  },
  {
    id: 'configuraciones',
    title: 'Configuraciones',
    menus: [
      'empresas',
      'config-general',
      'roles-usuarios',
      'tipo-documentos',
      'formatos-impresion',
      'credenciales-fel',
      'updater',
      'licencia',
      'developer',
    ],
  },
];

const ALL_MENUS_SET = new Set(ALL_MENUS);

function defaultAccesoMap() {
  return { 1: null };
}

function loadTiposEmpleado() {
  const raw = JSON.parse(fs.readFileSync(TIPOS_PATH, 'utf8'));
  return (Array.isArray(raw) ? raw : []).map((t) => ({
    value: Number(t.value),
    code: String(t.code || '').trim(),
    label: String(t.label || t.code || '').trim(),
  }));
}

function normalizeAccesoMap(raw) {
  const out = {};
  const src = raw && typeof raw === 'object' ? raw : {};
  for (const [key, val] of Object.entries(src)) {
    const cod = parseInt(key, 10);
    if (!Number.isFinite(cod) || cod <= 0) continue;
    if (val === null) {
      out[cod] = null;
      continue;
    }
    if (!Array.isArray(val)) continue;
    const menus = [...new Set(val.map((m) => String(m || '').trim()).filter((m) => ALL_MENUS_SET.has(m)))];
    if (!menus.includes('inicio')) menus.unshift('inicio');
    out[cod] = menus;
  }
  if (out[1] === undefined) out[1] = null;

  // Admin con lista casi completa (legado): promover a acceso total dinámico
  // para incluir opciones nuevas (p. ej. credenciales-fel) sin reconfigurar.
  if (Array.isArray(out[1])) {
    const meaningful = ALL_MENUS.filter((m) => m !== 'developer');
    const missing = meaningful.filter((m) => !out[1].includes(m));
    if (missing.length <= 5 && out[1].length >= meaningful.length - 5) {
      out[1] = null;
    }
  }

  return out;
}

function loadMenuAccesoMap() {
  try {
    if (!fs.existsSync(ACCESO_PATH)) {
      const fallback = defaultAccesoMap();
      saveMenuAccesoMap(fallback);
      return fallback;
    }
    const raw = JSON.parse(fs.readFileSync(ACCESO_PATH, 'utf8'));
    const normalized = normalizeAccesoMap(raw);
    // Persistir migraciones (p. ej. admin casi-completo → acceso total)
    try {
      const serializable = {};
      for (const [cod, val] of Object.entries(normalized)) {
        serializable[String(cod)] = val;
      }
      if (JSON.stringify(serializable) !== JSON.stringify(raw)) {
        saveMenuAccesoMap(normalized);
      }
    } catch {
      /* ignore persist errors */
    }
    return normalized;
  } catch (err) {
    console.warn('[roles-usuarios] loadMenuAccesoMap:', err.message);
    return { 1: null };
  }
}

function saveMenuAccesoMap(map) {
  const normalized = normalizeAccesoMap(map);
  const serializable = {};
  for (const [cod, val] of Object.entries(normalized)) {
    serializable[String(cod)] = val;
  }
  fs.mkdirSync(path.dirname(ACCESO_PATH), { recursive: true });
  fs.writeFileSync(ACCESO_PATH, `${JSON.stringify(serializable, null, 2)}\n`, 'utf8');
  return normalized;
}

function setAccesoForTipo(codtipo, menusOrNull) {
  const cod = parseInt(codtipo, 10);
  if (!Number.isFinite(cod) || cod <= 0) {
    const err = new Error('Tipo de empleado inválido');
    err.statusCode = 400;
    throw err;
  }
  const map = loadMenuAccesoMap();
  if (menusOrNull === null || menusOrNull === 'ALL' || menusOrNull === '*') {
    map[cod] = null;
  } else {
    const list = Array.isArray(menusOrNull) ? menusOrNull : [];
    const menus = [...new Set(list.map((m) => String(m || '').trim()).filter((m) => ALL_MENUS_SET.has(m)))];
    if (!menus.includes('inicio')) menus.unshift('inicio');
    map[cod] = menus;
  }
  return saveMenuAccesoMap(map);
}

function menuGroupsPayload() {
  return MENU_GROUPS.map((g) => ({
    id: g.id,
    title: g.title,
    menus: g.menus.map((key) => ({
      key,
      label: MENU_LABELS[key] || key,
    })),
  }));
}

module.exports = {
  ALL_MENUS,
  MENU_LABELS,
  MENU_GROUPS,
  loadTiposEmpleado,
  loadMenuAccesoMap,
  saveMenuAccesoMap,
  setAccesoForTipo,
  menuGroupsPayload,
  normalizeAccesoMap,
};
