require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

async function main() {
  const pool = await sql.connect(getDbConfig());
  const tipos = await pool.request().query(`
    SELECT CODDOC, DESDOC, TIPODOC, TIPOM, ACTIVO
    FROM dbo.TIPODOCUMENTOS
    WHERE TIPODOC IN ('ENT', 'SAL')
    ORDER BY TIPODOC, CODDOC
  `);
  console.log('TIPOS:', JSON.stringify(tipos.recordset, null, 2));
  const docs = await pool.request().query(`
    SELECT TOP 5 d.STATUS, d.CODDOC, d.CODCLIENTE, d.MES, d.ANIO, t.TIPODOC
    FROM dbo.DOCUMENTOS d
    JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
    WHERE t.TIPODOC IN ('ENT', 'SAL')
    ORDER BY d.ID DESC
  `);
  console.log('DOCS:', JSON.stringify(docs.recordset, null, 2));
  await pool.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
