const sql = require('mssql');

const TIPODOC_RECETA = 'REC';
const REC_DEFAULT_CODDOC = 'REC';

async function ensureConfigTipodocRec(pool) {
  try {
    const exists = await pool.request().query(`
      SELECT COUNT(*) AS cnt FROM dbo.CONFIG_TIPODOCUMENTOS
      WHERE UPPER(LTRIM(RTRIM(TIPODOC))) = 'REC'
    `);
    if (Number(exists.recordset[0]?.cnt) > 0) return { created: false };
    await pool.request().query(`
      INSERT INTO dbo.CONFIG_TIPODOCUMENTOS (TIPODOC, DESCRIPCION)
      VALUES ('REC', 'RECETAS MEDICAS')
    `);
    return { created: true };
  } catch {
    return { created: false, skipped: true };
  }
}

async function modeloCotReferencia(pool, empnit) {
  const ref = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
    SELECT TOP 1 CODFORMATOCON, CODFORMATOCRE, FORMATO, TIPOM, CONTABLE
    FROM dbo.TIPODOCUMENTOS
    WHERE EMPNIT = @EMPNIT AND TIPODOC = 'COT' AND ACTIVO = 'SI'
    ORDER BY CODDOC
  `);
  const row = ref.recordset[0];
  return {
    codformatocon: row?.CODFORMATOCON || 'SN',
    codformatocre: row?.CODFORMATOCRE || 'SN',
    formato: row?.FORMATO || 'COT',
    tipom: row?.TIPOM != null ? row.TIPOM : 0,
    contable: row?.CONTABLE || 'NO',
  };
}

async function ensureRecetaTipoDocumento(pool, empnit, coddocPreferred) {
  await ensureConfigTipodocRec(pool);
  const coddoc = String(coddocPreferred || REC_DEFAULT_CODDOC).trim() || REC_DEFAULT_CODDOC;
  const exists = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT CODDOC, DESDOC, TIPODOC, CORRELATIVO
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const modelo = await modeloCotReferencia(pool, empnit);
  if (exists.recordset.length) {
    await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CODFORMATOCON', sql.VarChar, modelo.codformatocon)
      .input('CODFORMATOCRE', sql.VarChar, modelo.codformatocre)
      .query(`
        UPDATE dbo.TIPODOCUMENTOS SET
          DESDOC = 'RECETAS MEDICAS',
          TIPODOC = '${TIPODOC_RECETA}',
          ACTIVO = 'SI',
          FORMATO = '${modelo.formato}',
          TIPOM = ${modelo.tipom},
          CODFORMATOCON = @CODFORMATOCON,
          CODFORMATOCRE = @CODFORMATOCRE,
          CONTABLE = '${modelo.contable}'
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
      `);
    return { ...exists.recordset[0], TIPODOC: TIPODOC_RECETA, DESDOC: 'RECETAS MEDICAS' };
  }

  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('DESDOC', sql.VarChar, 'RECETAS MEDICAS')
    .input('CODFORMATOCON', sql.VarChar, modelo.codformatocon)
    .input('CODFORMATOCRE', sql.VarChar, modelo.codformatocre)
    .query(`
      INSERT INTO dbo.TIPODOCUMENTOS (
        EMPNIT, CODDOC, DESDOC, TIPODOC, CORRELATIVO, FORMATO, TIPOM,
        CODFORMATOCON, CODFORMATOCRE, CONTABLE, ACTIVO
      ) VALUES (
        @EMPNIT, @CODDOC, @DESDOC, '${TIPODOC_RECETA}', 1, '${modelo.formato}', ${modelo.tipom},
        @CODFORMATOCON, @CODFORMATOCRE, '${modelo.contable}', 'SI'
      )
    `);
  return { CODDOC: coddoc, DESDOC: 'RECETAS MEDICAS', TIPODOC: TIPODOC_RECETA, CORRELATIVO: 1 };
}

async function getTipoDocRec(pool, empnit) {
  const all = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
    SELECT CODDOC, DESDOC, TIPODOC, CORRELATIVO
    FROM dbo.TIPODOCUMENTOS
    WHERE EMPNIT = @EMPNIT AND TIPODOC = '${TIPODOC_RECETA}' AND ACTIVO = 'SI'
    ORDER BY CODDOC
  `);
  if (all.recordset.length) return all.recordset[0];
  return ensureRecetaTipoDocumento(pool, empnit, REC_DEFAULT_CODDOC);
}

module.exports = {
  TIPODOC_RECETA,
  REC_DEFAULT_CODDOC,
  ensureRecetaTipoDocumento,
  getTipoDocRec,
};