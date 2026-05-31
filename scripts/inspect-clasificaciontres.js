require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

async function main() {
  const pool = await sql.connect(getDbConfig());
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CLASIFICACIONTRES'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('Cols:', cols.recordset);
  const sample = await pool.request().query('SELECT TOP 3 * FROM dbo.CLASIFICACIONTRES');
  console.log('Sample:', sample.recordset);
  await pool.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
