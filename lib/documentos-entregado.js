/**
 * DOCUMENTOS.ENTREGADO (cabecera) + tipodocs de entrega parcial +
 * inicialización de DOCPRODUCTOS.ENTREGADOS_* (líneas).
 *
 * ENTREGADO cabecera (INT): null|0 = no entregado, 1 = entregado.
 * Líneas: FAC/FEL con entrega parcial → ENTREGADOS inicia en 0;
 *         resto de tipodocs → ENTREGADOS = TOTAL* (físicos al guardar).
 */
const sql = require('mssql');

/** Tipodocs que usan entregas parciales (Pendientes Entrega). */
const TIPODOC_ENTREGA_PARCIAL = ['FAC', 'FEF', 'FEC', 'FES', 'FEL'];

const ENSURE_ENTREGADO_SQL = `
IF COL_LENGTH('dbo.DOCUMENTOS', 'ENTREGADO') IS NULL
BEGIN
  ALTER TABLE dbo.DOCUMENTOS ADD ENTREGADO INT NULL;
END
ELSE IF EXISTS (
  SELECT 1
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'dbo'
    AND TABLE_NAME = 'DOCUMENTOS'
    AND COLUMN_NAME = 'ENTREGADO'
    AND DATA_TYPE IN ('varchar', 'nvarchar', 'char', 'nchar', 'text')
)
BEGIN
  UPDATE dbo.DOCUMENTOS
  SET ENTREGADO = CASE
    WHEN ENTREGADO IS NULL OR LTRIM(RTRIM(ENTREGADO)) = '' THEN '0'
    WHEN UPPER(LTRIM(RTRIM(ENTREGADO))) IN ('SI', 'S', 'YES', '1') THEN '1'
    WHEN UPPER(LTRIM(RTRIM(ENTREGADO))) IN ('NO', 'N', '0') THEN '0'
    WHEN TRY_CAST(ENTREGADO AS INT) = 1 THEN '1'
    ELSE '0'
  END;
  ALTER TABLE dbo.DOCUMENTOS ALTER COLUMN ENTREGADO INT NULL;
END
`;

let schemaReady = false;

async function ensureDocumentosEntregadoColumn(pool) {
  if (schemaReady) return;
  await pool.request().query(ENSURE_ENTREGADO_SQL);
  schemaReady = true;
}

function esTipodocEntregaParcial(tipodoc) {
  return TIPODOC_ENTREGA_PARCIAL.includes(String(tipodoc || '').trim().toUpperCase());
}

/**
 * Valores iniciales de ENTREGADOS_* al insertar/actualizar línea.
 * Entrega parcial → 0; otros tipodocs → igual a totales de la línea.
 * Preferir TIPODOCUMENTOS.TIPODOC (no solo CODDOC de serie).
 */
function valoresEntregadosIniciales(tipodoc, totalUnidades, totalCosto = 0, totalPrecio = 0) {
  if (esTipodocEntregaParcial(tipodoc)) {
    return { unidades: 0, costo: 0, precio: 0 };
  }
  const u = Number(totalUnidades) || 0;
  const c = Number(totalCosto) || 0;
  const p = Number(totalPrecio) || 0;
  return { unidades: u, costo: c, precio: p };
}

/** Resuelve TIPODOC de la serie (CODDOC). Fallback: el propio CODDOC. */
async function resolveTipodocFromCoddoc(db, empnit, coddoc) {
  const emp = String(empnit || '').trim();
  const cod = String(coddoc || '').trim();
  if (!emp || !cod) return String(coddoc || '').trim().toUpperCase();
  const result = await db
    .request()
    .input('EMPNIT', sql.VarChar, emp)
    .input('CODDOC', sql.VarChar, cod)
    .query(`
      SELECT TOP 1 TIPODOC
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const tipodoc = String(result.recordset[0]?.TIPODOC || cod).trim().toUpperCase();
  return tipodoc || cod.toUpperCase();
}

async function valoresEntregadosParaDocumento(db, empnit, coddoc, totalUnidades, totalCosto = 0, totalPrecio = 0) {
  const tipodoc = await resolveTipodocFromCoddoc(db, empnit, coddoc);
  return valoresEntregadosIniciales(tipodoc, totalUnidades, totalCosto, totalPrecio);
}

/** Valor inicial al crear factura con movimiento (TIPOM <> 0). Neutro → null. */
function entregadoInicialFromTipom(tipom) {
  return Number(tipom) !== 0 ? 0 : null;
}

function normalizeEntregadoFilter(raw) {
  const v = String(raw || 'NO').trim().toUpperCase();
  return v === 'SI' ? 'SI' : 'NO';
}

function normalizeEntregadoValue(raw) {
  if (raw == null || raw === '') return 'NO';
  if (typeof raw === 'number') return raw === 1 ? 'SI' : 'NO';
  const s = String(raw).trim().toUpperCase();
  if (s === '1' || s === 'SI' || s === 'S' || s === 'YES') return 'SI';
  return 'NO';
}

const SQL_ENTREGADO_FILTER = `
  (
    (@ENTREGADO = 'NO' AND ISNULL(TRY_CAST(d.ENTREGADO AS INT), 0) = 0)
    OR
    (@ENTREGADO = 'SI' AND TRY_CAST(d.ENTREGADO AS INT) = 1)
  )
`;

module.exports = {
  TIPODOC_ENTREGA_PARCIAL,
  ENSURE_ENTREGADO_SQL,
  ensureDocumentosEntregadoColumn,
  esTipodocEntregaParcial,
  valoresEntregadosIniciales,
  resolveTipodocFromCoddoc,
  valoresEntregadosParaDocumento,
  entregadoInicialFromTipom,
  normalizeEntregadoFilter,
  normalizeEntregadoValue,
  SQL_ENTREGADO_FILTER,
  sql,
};
