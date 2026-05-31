require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

const TABLES = ['DOCUMENTOS', 'DOCPRODUCTOS', 'PRODUCTOS', 'PRECIOS'];

async function main() {
  const pool = await sql.connect(getDbConfig());
  for (const table of TABLES) {
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = '${table}'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('\n=== ' + table + ' ===');
    console.log(cols.recordset.map((x) => x.COLUMN_NAME + ':' + x.DATA_TYPE).join(', '));
  }
  const tipos = await pool.request().query(`
    SELECT CODDOC, DESDOC, TIPODOC, ACTIVO
    FROM dbo.TIPODOCUMENTOS
    ORDER BY TIPODOC, CODDOC
  `);
  console.log('\n=== TIPODOCUMENTOS (all) ===');
  console.log(JSON.stringify(tipos.recordset, null, 2));
  const sampleDoc = await pool.request().query(`
    SELECT TOP 1 d.* FROM dbo.DOCUMENTOS d
    ORDER BY d.Id DESC
  `).catch(() => ({ recordset: [] }));
  if (sampleDoc.recordset?.length) {
    console.log('\n=== SAMPLE DOCUMENTOS keys ===');
    console.log(Object.keys(sampleDoc.recordset[0]).join(', '));
  }
  const sampleLine = await pool.request().query(`
    SELECT TOP 1 * FROM dbo.DOCPRODUCTOS ORDER BY Id DESC
  `).catch(() => ({ recordset: [] }));
  if (sampleLine.recordset?.length) {
    console.log('\n=== SAMPLE DOCPRODUCTOS ===');
    console.log(JSON.stringify(sampleLine.recordset[0], null, 2));
  }
  const env = await pool.request().query(`
    SELECT TOP 5 d.STATUS, d.CODDOC, t.TIPODOC, d.CORRELATIVO, d.TOTALPRECIO, d.EMPNIT
    FROM dbo.DOCUMENTOS d
    JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
    WHERE t.TIPODOC = 'ENV'
    ORDER BY d.ID DESC
  `);
  console.log('\n=== Recent ENV docs ===');
  console.log(JSON.stringify(env.recordset, null, 2));

  const statusA = await pool.request().query(`
    SELECT TOP 8 d.STATUS, d.CODDOC, t.TIPODOC, d.CORRELATIVO
    FROM dbo.DOCUMENTOS d
    JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
    WHERE d.STATUS = 'A'
    ORDER BY d.ID DESC
  `);
  console.log('\n=== STATUS A docs ===');
  console.log(JSON.stringify(statusA.recordset, null, 2));

  const prod = await pool.request().query(`
    SELECT TOP 3 p.CODPROD, p.DESPROD, pr.CODMEDIDA, pr.PRECIO, pr.EQUIVALE
    FROM dbo.PRODUCTOS p
    JOIN dbo.PRECIOS pr ON p.CODPROD = pr.CODPROD AND p.EMPNIT = pr.EMPNIT
    WHERE p.HABILITADO = 'SI' AND pr.HABILITADO = 'SI'
    ORDER BY p.CODPROD
  `);
  console.log('\n=== Sample products with prices ===');
  console.log(JSON.stringify(prod.recordset, null, 2));

  await pool.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
