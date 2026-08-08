const sql = require('mssql');

const RIR_CODDOC = 'RIR';
const RIR_TIPODOC = 'RIR';
const RIR_FORMATO_CON = 'RIRCON';
const RIR_FORMATO_CRE = 'RIRCRE';

async function codformatoExists(pool, empnit, codformato) {
  const cod = String(codformato ?? '').trim();
  if (!cod) return false;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODFORMATO', sql.VarChar, cod)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM dbo.CONTA_FORMATOS
      WHERE EMPNIT = @EMPNIT
        AND UPPER(LTRIM(RTRIM(CODFORMATO))) = UPPER(LTRIM(RTRIM(@CODFORMATO)))
    `);
  return Number(result.recordset[0]?.cnt) > 0;
}

async function findCuenta(pool, empnit, { estfin, da } = {}) {
  const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
  let extra = '';
  if (estfin) {
    request.input('ESTFIN', sql.VarChar, estfin);
    extra += " AND UPPER(LTRIM(RTRIM(ISNULL(ESTFIN, '')))) = UPPER(LTRIM(RTRIM(@ESTFIN)))";
  }
  if (da) {
    request.input('DA', sql.VarChar, da);
    extra += " AND UPPER(LTRIM(RTRIM(ISNULL(DA, '')))) = UPPER(LTRIM(RTRIM(@DA)))";
  }
  const result = await request.query(`
    SELECT TOP 1 CODCUENTA, DESCRIPCION
    FROM dbo.CONTA_CUENTAS
    WHERE EMPNIT = @EMPNIT
      AND ISNULL(ACTIVO, 'SI') = 'SI'
      AND UPPER(LTRIM(RTRIM(ISNULL(PD, 'D')))) = 'D'
      ${extra}
    ORDER BY CODCUENTA
  `);
  return result.recordset[0] || null;
}

async function ensureFormato(pool, empnit, codformato, desformato) {
  if (await codformatoExists(pool, empnit, codformato)) {
    return { created: false, codformato };
  }
  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODFORMATO', sql.VarChar, codformato)
    .input('DESFORMATO', sql.VarChar, desformato)
    .query(`
      INSERT INTO dbo.CONTA_FORMATOS (EMPNIT, CODFORMATO, DESFORMATO)
      VALUES (@EMPNIT, @CODFORMATO, @DESFORMATO)
    `);
  return { created: true, codformato };
}

async function partidaCount(pool, empnit, codformato) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODFORMATO', sql.VarChar, codformato)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM dbo.CONTA_FORMATOS_PARTIDAS
      WHERE EMPNIT = @EMPNIT AND CODFORMATO = @CODFORMATO
    `);
  return Number(result.recordset[0]?.cnt) || 0;
}

async function ensurePartidasFormato(pool, empnit, codformato, cuentaDebe, cuentaHaber) {
  if (!cuentaDebe?.CODCUENTA || !cuentaHaber?.CODCUENTA) {
    return { created: 0, skipped: true };
  }
  if ((await partidaCount(pool, empnit, codformato)) > 0) {
    return { created: 0, skipped: false };
  }
  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODFORMATO', sql.VarChar, codformato)
    .input('DEBE_CUENTA', sql.VarChar, cuentaDebe.CODCUENTA)
    .input('HABER_CUENTA', sql.VarChar, cuentaHaber.CODCUENTA)
    .query(`
      INSERT INTO dbo.CONTA_FORMATOS_PARTIDAS
        (EMPNIT, CODFORMATO, CODCUENTA, DEBE, HABER, CENTRO_COSTO)
      VALUES
        (@EMPNIT, @CODFORMATO, @DEBE_CUENTA, 'TOTAL', '', '1'),
        (@EMPNIT, @CODFORMATO, @HABER_CUENTA, '', 'TOTAL', '1')
    `);
  return { created: 2, skipped: false };
}

async function ensureConfigTipodoc(pool) {
  try {
    const exists = await pool.request().input('TIPODOC', sql.VarChar, RIR_TIPODOC).query(`
      SELECT COUNT(*) AS cnt FROM dbo.CONFIG_TIPODOCUMENTOS
      WHERE UPPER(LTRIM(RTRIM(TIPODOC))) = UPPER(LTRIM(RTRIM(@TIPODOC)))
    `);
    if (Number(exists.recordset[0]?.cnt) > 0) return { created: false };
    await pool
      .request()
      .input('TIPODOC', sql.VarChar, RIR_TIPODOC)
      .input('DESCRIPCION', sql.VarChar, 'RETENCIONES ISR RECIBIDAS')
      .query(`
        INSERT INTO dbo.CONFIG_TIPODOCUMENTOS (TIPODOC, DESCRIPCION)
        VALUES (@TIPODOC, @DESCRIPCION)
      `);
    return { created: true };
  } catch {
    return { created: false, skipped: true };
  }
}

async function ensureTipoDocumentoRir(pool, empnit) {
  const exists = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, RIR_CODDOC)
    .query(`
      SELECT CODDOC FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  if (exists.recordset.length) {
    await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, RIR_CODDOC)
      .input('CODFORMATOCON', sql.VarChar, RIR_FORMATO_CON)
      .input('CODFORMATOCRE', sql.VarChar, RIR_FORMATO_CRE)
      .query(`
        UPDATE dbo.TIPODOCUMENTOS SET
          CODFORMATOCON = @CODFORMATOCON,
          CODFORMATOCRE = @CODFORMATOCRE,
          CONTABLE = 'SI',
          TIPODOC = '${RIR_TIPODOC}',
          ACTIVO = 'SI'
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
      `);
    return { created: false, updated: true };
  }
  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, RIR_CODDOC)
    .input('DESDOC', sql.VarChar, 'RETENCIONES ISR RECIBIDAS')
    .input('CODFORMATOCON', sql.VarChar, RIR_FORMATO_CON)
    .input('CODFORMATOCRE', sql.VarChar, RIR_FORMATO_CRE)
    .query(`
      INSERT INTO dbo.TIPODOCUMENTOS (
        EMPNIT, CODDOC, DESDOC, TIPODOC, CORRELATIVO, FORMATO, TIPOM,
        CODFORMATOCON, CODFORMATOCRE, CONTABLE, ACTIVO
      ) VALUES (
        @EMPNIT, @CODDOC, @DESDOC, '${RIR_TIPODOC}', 1, 'RIR', 0,
        @CODFORMATOCON, @CODFORMATOCRE, 'SI', 'SI'
      )
    `);
  return { created: true, updated: false };
}

async function ensureRetencionesIsrRecibidasSetup(pool, empnit) {
  const warnings = [];
  const configTipodoc = await ensureConfigTipodoc(pool);

  const cuentaDebe = await findCuenta(pool, empnit, { estfin: 'ACTIVO', da: 'D' });
  const cuentaHaber = await findCuenta(pool, empnit, { estfin: 'PASIVO', da: 'A' });
  if (!cuentaDebe || !cuentaHaber) {
    warnings.push(
      'No se encontraron cuentas contables de detalle (ACTIVO/PASIVO). Cree cuentas en Nomenclatura o agregue partidas manualmente en Formatos contables.'
    );
  }

  const fmtCon = await ensureFormato(
    pool,
    empnit,
    RIR_FORMATO_CON,
    'RETENCION ISR RECIBIDA AL CONTADO'
  );
  const fmtCre = await ensureFormato(
    pool,
    empnit,
    RIR_FORMATO_CRE,
    'RETENCION ISR RECIBIDA AL CREDITO'
  );

  const partCon = await ensurePartidasFormato(pool, empnit, RIR_FORMATO_CON, cuentaDebe, cuentaHaber);
  const partCre = await ensurePartidasFormato(pool, empnit, RIR_FORMATO_CRE, cuentaDebe, cuentaHaber);

  const tipoDoc = await ensureTipoDocumentoRir(pool, empnit);

  return {
    ok: true,
    coddoc: RIR_CODDOC,
    formatos: {
      contado: RIR_FORMATO_CON,
      credito: RIR_FORMATO_CRE,
      fmtCon,
      fmtCre,
      partCon,
      partCre,
      cuentas: {
        debe: cuentaDebe?.CODCUENTA || null,
        haber: cuentaHaber?.CODCUENTA || null,
      },
    },
    tipoDocumento: tipoDoc,
    configTipodoc,
    warnings,
  };
}

module.exports = {
  RIR_CODDOC,
  RIR_TIPODOC,
  RIR_FORMATO_CON,
  RIR_FORMATO_CRE,
  ensureRetencionesIsrRecibidasSetup,
};
