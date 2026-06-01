require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

const TABLES = ['PRODUCTOS', 'PRECIOS', 'Marcas', 'CLASIFICACIONUNO', 'CLASIFICACIONTRES', 'PROVEEDORES', 'Medidas'];

(async () => {
  const pool = await sql.connect(getDbConfig());
  for (const table of TABLES) {
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${table}'
      ORDER BY ORDINAL_POSITION
    `);
    console.log('\n=== ' + table + ' ===');
    console.log(cols.recordset.map((x) => x.COLUMN_NAME).join(', '));
  }
  const sample = await pool.request().query(`
    SELECT TOP 1 p.*, m.DESMARCA
    FROM dbo.PRODUCTOS p
    LEFT JOIN dbo.Marcas m ON p.CODMARCA = m.CODMARCA AND p.EMPNIT = m.EMPNIT
  `);
  console.log('\nSample product keys:', Object.keys(sample.recordset[0] || {}));
  const precio = await pool.request().query(`SELECT TOP 2 * FROM dbo.PRECIOS`);
  console.log('Sample precio:', JSON.stringify(precio.recordset[0], null, 2));
  await pool.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
