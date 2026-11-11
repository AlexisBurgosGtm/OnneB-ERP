const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { fechaIsoFromValue } = require('../documento-fecha');
const { escapeXml } = require('./utils');

const ADENDAS_PATH = require('../app-paths').felAdendasPath();
const SLOT_COUNT = 20;

const ADENDA_OPTIONS = [
  { value: '', label: '(Sin asignar)' },
  { value: 'DOCUMENTO_INTERNO', label: 'DOCUMENTO INTERNO' },
  { value: 'EMPLEADO', label: 'EMPLEADO' },
  { value: 'TELEFONO_EMPLEADO', label: 'TELEFONO EMPLEADO' },
  { value: 'FORMA_DE_PAGO', label: 'FORMA DE PAGO' },
  { value: 'EMBARQUE', label: 'EMBARQUE' },
  { value: 'VENCIMIENTO', label: 'VENCIMIENTO' },
  { value: 'TELEFONO_EMPRESA', label: 'TELEFONO EMPRESA' },
  { value: 'OBSERVACIONES', label: 'OBSERVACIONES' },
  { value: 'DIRECCION_ENTREGA', label: 'DIRECCION ENTREGA' },
  { value: 'TIPO_ENTREGA', label: 'TIPO ENTREGA' },
];

const OPTION_VALUES = new Set(ADENDA_OPTIONS.map((o) => o.value).filter(Boolean));

/** @type {Map<string, Record<string, string>>} empnit -> slots */
let cacheByEmp = new Map();
let legacyFileMigrated = false;

function defaultSlots() {
  const slots = {};
  for (let i = 1; i <= SLOT_COUNT; i++) slots[String(i)] = '';
  return slots;
}

function normalizeSlots(raw) {
  const slots = defaultSlots();
  const src = raw && typeof raw === 'object' ? raw : {};
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const key = String(i);
    const v = String(src[key] ?? src[i] ?? '')
      .trim()
      .toUpperCase();
    slots[key] = OPTION_VALUES.has(v) ? v : '';
  }
  return slots;
}

function slotsFromDbRows(rows) {
  const slots = defaultSlots();
  for (const r of rows || []) {
    const n = Number(r.SLOT_NUM);
    if (!Number.isFinite(n) || n < 1 || n > SLOT_COUNT) continue;
    const v = String(r.OPCION || '')
      .trim()
      .toUpperCase();
    slots[String(n)] = OPTION_VALUES.has(v) ? v : '';
  }
  return slots;
}

function invalidateAdendasCache(empnit) {
  if (empnit) cacheByEmp.delete(String(empnit).trim());
  else cacheByEmp = new Map();
}

async function tableExists(pool) {
  const r = await pool.request().query(`
    SELECT 1 AS ok
    FROM sys.tables
    WHERE name = 'FEL_ADENDAS_PERSO' AND schema_id = SCHEMA_ID('dbo')
  `);
  return r.recordset.length > 0;
}

/**
 * Copia una sola vez la configuración global legada (fel-adendas.json) a cada EMPNIT
 * que tenga credenciales FEL pero aún no tenga filas en FEL_ADENDAS_PERSO.
 */
async function migrateLegacyFileToDbIfNeeded(pool) {
  if (legacyFileMigrated || !pool) return;
  try {
    if (!(await tableExists(pool))) {
      legacyFileMigrated = true;
      return;
    }
    const fileCfg = loadAdendasConfigFromFile();
    const slots = fileCfg.slots || defaultSlots();
    const hasAny = Object.values(slots).some(Boolean);
    if (!hasAny) {
      legacyFileMigrated = true;
      return;
    }
    const empnits = await pool.request().query(`
      SELECT EMPNIT FROM dbo.FEL_CREDENCIALES
    `);
    for (const row of empnits.recordset || []) {
      const empnit = String(row.EMPNIT || '').trim();
      if (!empnit) continue;
      const chk = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .query(`SELECT COUNT(*) AS n FROM dbo.FEL_ADENDAS_PERSO WHERE EMPNIT = @EMPNIT`);
      const n = Number(chk.recordset[0]?.n) || 0;
      if (n > 0) continue;
      await saveAdendasSlotsForEmpnit(pool, empnit, slots);
    }
  } catch (_) {
    /* no bloquear lectura si migración falla */
  } finally {
    legacyFileMigrated = true;
  }
}

/**
 * Perso1–Perso20 por EMPNIT (tabla dbo.FEL_ADENDAS_PERSO).
 * Si la tabla no existe o falla la lectura: slots vacíos o fallback JSON legado.
 */
async function loadAdendasSlotsForEmpnit(pool, empnit) {
  const key = String(empnit || '').trim();
  if (!key) return defaultSlots();
  if (cacheByEmp.has(key)) return { ...cacheByEmp.get(key) };

  if (!pool) {
    const fb = loadAdendasConfigFromFile();
    cacheByEmp.set(key, fb.slots);
    return { ...fb.slots };
  }

  await migrateLegacyFileToDbIfNeeded(pool);

  try {
    if (await tableExists(pool)) {
      const result = await pool
        .request()
        .input('EMPNIT', sql.VarChar, key)
        .query(`
          SELECT SLOT_NUM, OPCION
          FROM dbo.FEL_ADENDAS_PERSO
          WHERE EMPNIT = @EMPNIT
        `);
      const slots = slotsFromDbRows(result.recordset);
      cacheByEmp.set(key, slots);
      return { ...slots };
    }
  } catch (_) {
    /* fall through */
  }

  const fb = loadAdendasConfigFromFile();
  cacheByEmp.set(key, fb.slots);
  return { ...fb.slots };
}

async function saveAdendasSlotsForEmpnit(pool, empnit, slotsInput) {
  const key = String(empnit || '').trim();
  if (!key) throw new Error('EMPNIT requerido');
  const slots = normalizeSlots(slotsInput);

  if (!pool) {
    saveAdendasConfigToFile(slots);
    invalidateAdendasCache(key);
    return { version: 1, slots };
  }

  const trx = new sql.Transaction(pool);
  await trx.begin();
  try {
    const reqDel = new sql.Request(trx);
    await reqDel.input('EMPNIT', sql.VarChar, key).query(`DELETE FROM dbo.FEL_ADENDAS_PERSO WHERE EMPNIT = @EMPNIT`);

    for (let i = 1; i <= SLOT_COUNT; i++) {
      const opt = slots[String(i)];
      if (!opt) continue;
      const reqIns = new sql.Request(trx);
      await reqIns
        .input('EMPNIT', sql.VarChar, key)
        .input('SLOT_NUM', sql.TinyInt, i)
        .input('OPCION', sql.VarChar(40), opt)
        .query(`
          INSERT INTO dbo.FEL_ADENDAS_PERSO (EMPNIT, SLOT_NUM, OPCION)
          VALUES (@EMPNIT, @SLOT_NUM, @OPCION)
        `);
    }

    await trx.commit();
  } catch (err) {
    await trx.rollback();
    throw err;
  }

  invalidateAdendasCache(key);
  cacheByEmp.set(key, slots);
  return { version: 1, slots };
}

/** Lectura de respaldo (solo repo / migración): data/fel-adendas.json */
function loadAdendasConfigFromFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(ADENDAS_PATH, 'utf8'));
    return {
      version: Number(raw.version) || 1,
      slots: normalizeSlots(raw.slots),
    };
  } catch (_) {
    return { version: 1, slots: defaultSlots() };
  }
}

function saveAdendasConfigToFile(slotsInput) {
  const slots = normalizeSlots(slotsInput);
  const payload = {
    version: 1,
    description: 'Mapeo global de adendas FEL Perso1–Perso20. Valores vacíos = sin asignar. (Legado; usar BD por EMPNIT)',
    slots,
  };
  fs.mkdirSync(path.dirname(ADENDAS_PATH), { recursive: true });
  fs.writeFileSync(ADENDAS_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { version: 1, slots };
}

/**
 * Compatibilidad: devuelve slots del JSON (sin empresa). Preferir loadAdendasSlotsForEmpnit.
 */
function loadAdendasConfig() {
  return loadAdendasConfigFromFile();
}

function saveAdendasConfig(slotsInput) {
  return saveAdendasConfigToFile(slotsInput);
}

function formatDdMmYyyy(value) {
  const iso = fechaIsoFromValue(value);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function formaPagoFromConcre(concre) {
  const c = String(concre || '')
    .trim()
    .toUpperCase();
  if (c === 'CRE' || c === 'CREDITO' || c === 'CRÉDITO') return 'CREDITO';
  if (c === 'CON' || c === 'CONTADO') return 'CONTADO';
  return c || '';
}

async function loadAdendaContext(pool, empnit, header) {
  const ctx = {
    telefonoEmpresa: '',
    nombreEmpleado: '',
    telefonoEmpleado: '',
  };

  try {
    const emp = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .query(`
        SELECT TOP 1 EMPTELEFONO
        FROM dbo.Empresas
        WHERE EMPNIT = @EMPNIT
      `);
    ctx.telefonoEmpresa = String(emp.recordset[0]?.EMPTELEFONO || '').trim();
  } catch (_) {
    /* ignore */
  }

  const codven = Number(header?.CODVEN);
  if (Number.isFinite(codven) && codven > 0) {
    try {
      const e = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODEMPLEADO', sql.Int, codven)
        .query(`
          SELECT TOP 1 NOMEMPLEADO, TELEFONOS
          FROM dbo.Empleados
          WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO
        `);
      const row = e.recordset[0];
      ctx.nombreEmpleado = String(row?.NOMEMPLEADO || '').trim();
      ctx.telefonoEmpleado = String(row?.TELEFONOS || '').trim();
    } catch (_) {
      /* ignore */
    }
  }

  return ctx;
}

function resolveAdendaValue(option, header, ctx = {}) {
  switch (option) {
    case 'DOCUMENTO_INTERNO': {
      const cod = String(header.CODDOC || '').trim();
      const corr = header.CORRELATIVO != null ? String(header.CORRELATIVO).trim() : '';
      return [cod, corr].filter(Boolean).join(' ');
    }
    case 'EMPLEADO':
      return String(ctx.nombreEmpleado || '').trim();
    case 'TELEFONO_EMPLEADO':
      return String(ctx.telefonoEmpleado || '').trim();
    case 'FORMA_DE_PAGO':
      return formaPagoFromConcre(header.CONCRE);
    case 'EMBARQUE':
      return String(header.CODEMBARQUE || '').trim();
    case 'VENCIMIENTO':
      return formatDdMmYyyy(header.VENCIMIENTO);
    case 'TELEFONO_EMPRESA':
      return String(ctx.telefonoEmpresa || '').trim();
    case 'OBSERVACIONES':
      return String(header.OBS || '').trim();
    case 'DIRECCION_ENTREGA': {
      const dir = String(header.DIRENTREGA || '').trim();
      if (!dir || dir.toUpperCase() === 'SN') return '';
      return dir;
    }
    case 'TIPO_ENTREGA':
      return String(header.F_ENTREGA || '').trim();
    default:
      return '';
  }
}

/**
 * Resuelve Perso1–Perso20 según slots y el documento.
 * Solo incluye slots con opción asignada y valor no vacío.
 */
function resolvePersoAdendas(header, ctx = {}, slots = defaultSlots()) {
  const perso = {};
  for (let i = 1; i <= SLOT_COUNT; i++) {
    const opt = slots[String(i)];
    if (!opt) continue;
    const value = resolveAdendaValue(opt, header, ctx);
    if (!value) continue;
    perso[`Perso${i}`] = value;
  }
  return perso;
}

function buildAdendaXml(header, ctx = {}, slots = defaultSlots()) {
  const perso = resolvePersoAdendas(header, ctx, slots);
  const keys = Object.keys(perso);
  if (!keys.length) return '';
  const inner = keys
    .map((k) => `<${k}>${escapeXml(perso[k])}</${k}>`)
    .join('');
  return `<dte:Adenda>${inner}</dte:Adenda>`;
}

module.exports = {
  SLOT_COUNT,
  ADENDA_OPTIONS,
  loadAdendasConfig,
  saveAdendasConfig,
  loadAdendasConfigFromFile,
  migrateLegacyFileToDbIfNeeded,
  loadAdendasSlotsForEmpnit,
  saveAdendasSlotsForEmpnit,
  invalidateAdendasCache,
  loadAdendaContext,
  resolvePersoAdendas,
  buildAdendaXml,
};
