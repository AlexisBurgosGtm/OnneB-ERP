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
    WHERE TABLE_NAME = 'Marcas'
    ORDER BY ORDINAL_POSITION
  `);
  console.log('COLUMNAS Marcas:', JSON.stringify(cols.recordset, null, 2));

  const views = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'Marcas'
  `);
  console.log('Vistas Marcas:', views.recordset);

  const sample = await pool.request().query('SELECT TOP 3 * FROM dbo.Marcas');
  console.log('Muestra:', JSON.stringify(sample.recordset, null, 2));

  const meta = await pool.request().query(`
    SELECT c.name, c.is_identity
    FROM sys.columns c
    JOIN sys.tables t ON c.object_id = t.object_id
    WHERE t.name = 'Marcas'
  `);
  console.log('Column meta:', meta.recordset);

  const pk = await pool.request().query(`
    SELECT kcu.COLUMN_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    WHERE tc.TABLE_NAME = 'Marcas' AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
  `);
  console.log('PK:', pk.recordset);

  await pool.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
