require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');
const { getDbConfig, isDbConfigured } = require('../config/database');
const { fetchSaldoMesesCxc } = require('../lib/cuentas-saldo-meses');

async function main() {
  if (!isDbConfigured()) {
    console.error('DB not configured');
    process.exit(1);
  }
  const pool = new sql.ConnectionPool(getDbConfig());
  await pool.connect();
  try {
    const empRes = await pool.request().query('SELECT TOP 1 EMPNIT FROM dbo.EMPRESAS');
    const empnit = String(empRes.recordset[0]?.EMPNIT || '').trim();
    console.log('EMPNIT:', empnit);
    const data = await fetchSaldoMesesCxc(pool, sql, empnit, { mes: 9, anio: 2026 });
    console.log('CXC OK rows:', data.rows.length, 'saldo:', data.totales.saldoActual);
  } catch (e) {
    console.error('ERROR:', e.message);
    if (e.precedingErrors) {
      e.precedingErrors.forEach((x, i) => console.error(` preceding[${i}]:`, x.message));
    }
    process.exit(1);
  } finally {
    await pool.close();
  }
}

main();
