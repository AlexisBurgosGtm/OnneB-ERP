require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

const TABLES = ['Cajas'];

async function main() {
  const pool = await sql.connect(getDbConfig());
  for (const table of TABLES) {
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = '${table}'
      ORDER BY ORDINAL_POSITION
    `);
    console.log(`\n=== ${table} ===`);
    console.log(JSON.stringify(cols.recordset, null, 2));
    const sample = await pool.request().query(`SELECT TOP 2 * FROM dbo.[${table}]`);
    console.log('Muestra:', JSON.stringify(sample.recordset, null, 2));
  }
  await pool.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
