require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

(async () => {
  const pool = await sql.connect(getDbConfig());
  const emp = (await pool.request().query(`SELECT TOP 1 EMPNIT FROM dbo.TIPODOCUMENTOS WHERE TIPODOC='ENV'`))
    .recordset[0]?.EMPNIT;
  if (!emp) throw new Error('No ENV doc');
  console.log('EMPNIT', emp);
  const parts = { anio: 2026, mes: 5, dia: 30 };
  const tipo = await pool
    .request()
    .input('EMPNIT', sql.VarChar, emp)
    .query(`SELECT TOP 1 CODDOC FROM dbo.TIPODOCUMENTOS WHERE EMPNIT=@EMPNIT AND TIPODOC='ENV' AND ACTIVO='SI'`);
  const coddoc = tipo.recordset[0].CODDOC;
  const maxRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, emp)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`SELECT ISNULL(MAX(CORRELATIVO),0)+1 AS n FROM dbo.DOCUMENTOS WHERE EMPNIT=@EMPNIT AND CODDOC=@CODDOC`);
  const corr = maxRes.recordset[0].n;
  console.log('Would use', coddoc, corr);
  await pool.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
