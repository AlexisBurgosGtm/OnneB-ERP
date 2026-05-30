require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

async function main() {
  const pool = await sql.connect(getDbConfig());
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Config' ORDER BY ORDINAL_POSITION
  `);
  console.log('Columnas Config:', JSON.stringify(cols.recordset, null, 2));
  const row = await pool.request().query(`SELECT * FROM Config WHERE id = 2`);
  console.log('Config id=2:', JSON.stringify(row.recordset, null, 2));
  await pool.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
