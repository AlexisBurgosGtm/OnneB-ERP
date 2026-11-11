const sql = require('mssql');
const {
  REGIMEN_FEL_GEN,
  REGIMEN_FEL_PEQ,
  normalizeRegimenFel,
  isTipodocFelPequenoCertificable,
  isTipodocFpc,
} = require('./tipodoc-fpc');
const { isCertificableTipodoc } = require('./fel/tipo-documento');
const { getSettingValue, setSettingValue } = require('./settings');

/** SETTINGS por EMPNIT: «REGIMEN FEL EMPRESA <NIT>» = GEN | PEQ */
const REGIMEN_FEL_SETTING_PREFIX = 'REGIMEN FEL EMPRESA';

function regimenFelSettingOpcion(empnit) {
  const nit = String(empnit || '').trim().toUpperCase();
  return nit ? `${REGIMEN_FEL_SETTING_PREFIX} ${nit}` : REGIMEN_FEL_SETTING_PREFIX;
}

let columnCache;

async function empresasTieneRegimenFel(pool) {
  if (columnCache !== undefined) return columnCache;
  try {
    const r = await pool.request().query(`
      SELECT COL_LENGTH('dbo.Empresas', 'EMPREGIMENFEL') AS len
    `);
    const len = r.recordset?.[0]?.len;
    columnCache = len !== null && Number(len) > 0;
  } catch {
    columnCache = false;
  }
  return columnCache;
}

function resetEmpresaRegimenFelColumnCache() {
  columnCache = undefined;
}

async function loadRegimenFromSettings(pool, empnit) {
  const key = regimenFelSettingOpcion(empnit);
  const raw = await getSettingValue(pool, key);
  if (raw != null && String(raw).trim() !== '') {
    return normalizeRegimenFel(raw);
  }
  const legacy = await getSettingValue(pool, REGIMEN_FEL_SETTING_PREFIX);
  if (legacy != null && String(legacy).trim() !== '') {
    return normalizeRegimenFel(legacy);
  }
  return null;
}

async function loadEmpresaRegimenFel(pool, empnit) {
  const key = String(empnit || '').trim();
  if (!key) return REGIMEN_FEL_GEN;

  if (await empresasTieneRegimenFel(pool)) {
    try {
      const r = await pool
        .request()
        .input('EMPNIT', sql.VarChar, key)
        .query(`
          SELECT EMPREGIMENFEL
          FROM dbo.Empresas
          WHERE UPPER(LTRIM(RTRIM(ISNULL(EMPNIT, '')))) = UPPER(LTRIM(RTRIM(@EMPNIT)))
        `);
      if (r.recordset.length) {
        const fromCol = normalizeRegimenFel(r.recordset[0].EMPREGIMENFEL);
        const fromSettings = await loadRegimenFromSettings(pool, key);
        const effective =
          fromCol === REGIMEN_FEL_PEQ || fromSettings === REGIMEN_FEL_PEQ
            ? REGIMEN_FEL_PEQ
            : fromCol;
        if (effective === REGIMEN_FEL_PEQ) {
          persistEmpresaRegimenFel(pool, key, REGIMEN_FEL_PEQ).catch(() => {});
        }
        return effective;
      }
    } catch (err) {
      if (/EMPREGIMENFEL|Invalid column/i.test(String(err.message || ''))) {
        columnCache = false;
      } else {
        throw err;
      }
    }
  }

  const fromSettings = await loadRegimenFromSettings(pool, key);
  if (fromSettings) return fromSettings;

  return REGIMEN_FEL_GEN;
}

/** Persiste régimen (columna Empresas si existe + SETTINGS por NIT). */
async function persistEmpresaRegimenFel(pool, empnit, regimen) {
  const nit = String(empnit || '').trim();
  if (!nit) return;
  const val = normalizeRegimenFel(regimen);
  await setSettingValue(pool, regimenFelSettingOpcion(nit), val);

  if (!(await empresasTieneRegimenFel(pool))) return;

  await pool
    .request()
    .input('EMPNIT', sql.VarChar, nit)
    .input('REGIMEN', sql.VarChar, val)
    .query(`
      UPDATE dbo.Empresas
      SET EMPREGIMENFEL = @REGIMEN
      WHERE UPPER(LTRIM(RTRIM(ISNULL(EMPNIT, '')))) = UPPER(LTRIM(RTRIM(@EMPNIT)))
    `);
}

/**
 * Valida coherencia régimen empresa ↔ TIPODOC a certificar.
 */
function assertCertificacionRegimenFel(regimen, tipodoc, empnit = '') {
  const t = String(tipodoc || '').trim().toUpperCase();
  if (!isCertificableTipodoc(t)) return;
  const peq = isTipodocFelPequenoCertificable(t);
  const gen = !peq;
  const empresaPeq = normalizeRegimenFel(regimen) === REGIMEN_FEL_PEQ;

  if (peq && !empresaPeq) {
    const nit = String(empnit || '').trim();
    const err = new Error(
      nit
        ? `FPC requiere régimen PEQ en Empresas para el NIT ${nit} (régimen leído: ${normalizeRegimenFel(regimen)}). ` +
          'Vuelva a guardar Empresas con «Pequeño contribuyente», ejecute Actualizador BD (EMPREGIMENFEL) o use el mismo NIT de la sesión.'
        : 'FPC (pequeño contribuyente) solo puede certificarse si la empresa tiene régimen FEL PEQ en Empresas'
    );
    err.statusCode = 400;
    throw err;
  }
  if (gen && empresaPeq && !isTipodocFpc(t)) {
    const err = new Error(
      'Empresa régimen PEQ: use facturas FPC. FEF/FEC/FNC (IVA general) no aplican en este régimen'
    );
    err.statusCode = 400;
    throw err;
  }
}

module.exports = {
  loadEmpresaRegimenFel,
  persistEmpresaRegimenFel,
  assertCertificacionRegimenFel,
  empresasTieneRegimenFel,
  resetEmpresaRegimenFelColumnCache,
  regimenFelSettingOpcion,
};
