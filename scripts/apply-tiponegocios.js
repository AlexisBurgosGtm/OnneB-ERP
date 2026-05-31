require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

(async () => {
  const cfg = getDbConfig();
  if (!cfg) {
    console.error('Base de datos no configurada');
    process.exit(1);
  }
  const sqlPath = path.join(__dirname, 'sql', 'dbo.TIPONEGOCIOS.sql');
  const raw = fs.readFileSync(sqlPath, 'utf8');
  const batches = raw.split(/\r?\nGO\r?\n/i).map((b) => b.trim()).filter(Boolean);
  const pool = await sql.connect(cfg);
  for (const batch of batches) {
    await pool.request().query(batch);
  }
  const check = await pool.request().query('SELECT COUNT(*) AS n FROM dbo.TIPONEGOCIOS');
  console.log('TIPONEGOCIOS OK, filas:', check.recordset[0].n);
  await pool.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
