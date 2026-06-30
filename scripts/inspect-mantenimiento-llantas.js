require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

const TABLES = ['VEHICULOS_MANTENIMIENTO_LLANTAS', 'VEHICULOS_CONFIG_LLANTAS'];

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
    try {
      const sample = await pool.request().query(`SELECT TOP 3 * FROM dbo.[${table}]`);
      console.log('Muestra:', JSON.stringify(sample.recordset, null, 2));
    } catch (err) {
      console.log('Muestra error:', err.message);
    }
  }
  await pool.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
