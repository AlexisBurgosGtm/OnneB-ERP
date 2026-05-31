require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

(async () => {
  const pool = await sql.connect(getDbConfig());
  const r = await pool.request().query(`
    SELECT TOP 1 * FROM dbo.DOCUMENTOS WHERE STATUS = 'D' ORDER BY ID DESC
  `);
  console.log(JSON.stringify(r.recordset[0], null, 2));
  await pool.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
