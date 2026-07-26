const sql = require('mssql');
const { getUpdateDbConfig } = require('../config/update-database');

let updatePool = null;

async function getUpdateDbPool() {
  const cfg = getUpdateDbConfig();
  if (!cfg) return null;
  if (updatePool && updatePool.connected) return updatePool;
  const pool = new sql.ConnectionPool(cfg);
  pool.on('error', (err) => {
    console.warn('[UPDATE_DB] pool error:', err?.message || err);
    if (updatePool === pool) updatePool = null;
  });
  await pool.connect();
  updatePool = pool;
  return updatePool;
}

async function closeUpdateDbPool() {
  if (!updatePool) return;
  try {
    await updatePool.close();
  } catch {
    /* ignore */
  }
  updatePool = null;
}

module.exports = { getUpdateDbPool, closeUpdateDbPool };
