require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

async function main() {
  const pool = await sql.connect(getDbConfig());
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'INVSALDO'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('INVSALDO columns:', JSON.stringify(cols.recordset, null, 2));
  const sample = await pool.request().query('SELECT TOP 3 * FROM dbo.INVSALDO');
  console.log('INVSALDO sample:', JSON.stringify(sample.recordset, null, 2));
  const tipos = await pool.request().query(`
    SELECT TOP 15 CODDOC, DESDOC, TIPOM, TIPOMOV, TIPODOC, EMPNIT
    FROM dbo.TIPODOCUMENTOS
    ORDER BY TIPODOC, CODDOC
  `);
  console.log('TIPODOCUMENTOS:', JSON.stringify(tipos.recordset, null, 2));
  const tipom = await pool.request().query(`
    SELECT CODDOC, TIPOM, TIPOMOV, TIPODOC
    FROM dbo.TIPODOCUMENTOS
    WHERE TIPOM IS NOT NULL AND TIPOM <> 0
  `);
  console.log('TIPOM set:', JSON.stringify(tipom.recordset, null, 2));
  const bodegas = await pool.request().query(`
    SELECT CODBODEGA, COUNT(*) AS cnt FROM dbo.INVSALDO GROUP BY CODBODEGA ORDER BY cnt DESC
  `);
  console.log('INVSALDO bodegas:', JSON.stringify(bodegas.recordset, null, 2));
  const exist = await pool.request().query(`
    SELECT TOP 5 p.CODPROD, p.EXISTENCIA, i.SALDO, i.CODBODEGA
    FROM dbo.PRODUCTOS p
    LEFT JOIN dbo.INVSALDO i ON p.CODPROD = i.CODPROD AND p.EMPNIT = i.EMPNIT
    WHERE p.EMPNIT = 'ASYMEP005'
    ORDER BY p.CODPROD
  `);
  console.log('PROD vs INVSALDO:', JSON.stringify(exist.recordset, null, 2));
  await pool.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
