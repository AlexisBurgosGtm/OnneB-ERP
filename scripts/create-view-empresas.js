require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

const CREATE_SCHEMA_SQL = `
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'app')
  EXEC(N'CREATE SCHEMA app');
`;

const CREATE_VIEW_SQL = `
CREATE OR ALTER VIEW app.Empresas AS
SELECT
  EMPNIT,
  EMPNOMBRE,
  EMPRAZONSOCIAL,
  EMPDIRECCION,
  EMPTELEFONO,
  EMPEMAIL,
  EMPCONTACTO,
  EMPTELCONTACTO,
  EMPEMAILCONTACTO,
  EMPMESPROCESO,
  EMPANIOPROCESO,
  CODTIPOEMPRESA,
  OBJETIVO,
  PRESUPUESTO
FROM dbo.Empresas;
`;

async function main() {
  const pool = await sql.connect(getDbConfig());
  await pool.request().query(CREATE_SCHEMA_SQL);
  await pool.request().query(CREATE_VIEW_SQL);
  const check = await pool.request().query(`
    SELECT COUNT(*) AS total FROM app.Empresas
  `);
  console.log('[OK] Vista app.Empresas creada. Registros:', check.recordset[0].total);
  await pool.close();
}

main().catch((e) => {
  console.error('[Error]', e.message);
  process.exit(1);
});
