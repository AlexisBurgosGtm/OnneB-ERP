const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const SEQ_PATH = path.join(__dirname, '..', 'developer-nocorte-seq.json');

function loadSeq() {
  try {
    if (fs.existsSync(SEQ_PATH)) {
      const data = JSON.parse(fs.readFileSync(SEQ_PATH, 'utf8'));
      return typeof data === 'object' && data !== null ? data : {};
    }
  } catch (err) {
    console.warn('[NOCORTE seq] lectura:', err.message);
  }
  return {};
}

function saveSeq(data) {
  fs.writeFileSync(SEQ_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function maxNocorteInDb(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT ISNULL(MAX(CAST(NOCORTE AS INT)), 0) AS mx
      FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND ISNULL(NOCORTE, 0) > 0
    `);
  return Number(result.recordset[0]?.mx) || 0;
}

/**
 * Siguiente correlativo interno para NOCORTE (por empresa).
 */
async function allocateNocorte(pool, empnit) {
  const data = loadSeq();
  const dbMax = await maxNocorteInDb(pool, empnit);
  const fileVal = Number(data[empnit]) || 0;
  const next = Math.max(fileVal, dbMax) + 1;
  data[empnit] = next;
  saveSeq(data);
  return next;
}

module.exports = { allocateNocorte, SEQ_PATH };
