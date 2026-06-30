require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

async function main() {
  const pool = await sql.connect(getDbConfig());
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMNPROPERTY(OBJECT_ID(TABLE_SCHEMA + '.' + TABLE_NAME), COLUMN_NAME, 'IsIdentity') AS IS_IDENTITY
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'VEHICULOS_PLATAFORMAS'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('VEHICULOS_PLATAFORMAS');
  console.log(JSON.stringify(cols.recordset, null, 2));
  try {
    const sample = await pool.request().query('SELECT TOP 3 * FROM dbo.VEHICULOS_PLATAFORMAS');
    console.log('SAMPLE', JSON.stringify(sample.recordset, null, 2));
  } catch (e) {
    console.log('NO_SAMPLE', e.message);
  }
  await pool.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
