require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

async function main() {
  const config = getDbConfig();
  if (!config) {
    console.error('DB no configurada en .env');
    process.exit(1);
  }
  const pool = await sql.connect(config);
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Empresas'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('COLUMNAS Empresas:', JSON.stringify(cols.recordset, null, 2));

  const views = await pool.request().query(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'Empresas'
  `);
  console.log('Vista Empresas existe:', views.recordset.length > 0);

  await pool.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
