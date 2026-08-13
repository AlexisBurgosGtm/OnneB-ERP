/**
 * Inserta CREATE TABLE NOMINA_DEPARTAMENTOS en UPDATE_QUERIES (hosting).
 * Uso: node scripts/seed-update-query-nomina-departamentos.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { getUpdateDbConfig } = require('../config/update-database');
const { getUpdateDbPool, closeUpdateDbPool } = require('../lib/update-db-pool');

async function main() {
  const cfg = getUpdateDbConfig();
  if (!cfg) {
    throw new Error('UPDATE_* no configurado en .env');
  }

  let qry = fs
    .readFileSync(path.join(__dirname, 'sql', 'dbo.NOMINA_DEPARTAMENTOS.sql'), 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim();
  qry = qry
    .split(/\nGO\s*\n/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('\n');

  const pool = await getUpdateDbPool();
  const check = await pool
    .request()
    .input('VERSION', sql.Int, 2026)
    .input('DB', sql.VarChar(1), 'P')
    .query(`
      SELECT ID FROM UPDATE_QUERIES
      WHERE VERSION = @VERSION AND DB = @DB
        AND QRY LIKE '%NOMINA_DEPARTAMENTOS%'
        AND QRY LIKE '%CREATE TABLE%'
    `);

  if (check.recordset.length) {
    console.log('Ya existe en UPDATE_QUERIES:', check.recordset.map((r) => r.ID).join(', '));
  } else {
    const ins = await pool
      .request()
      .input('QRY', sql.NVarChar(sql.MAX), qry)
      .input('VERSION', sql.Int, 2026)
      .input('DB', sql.VarChar(1), 'P')
      .query(`
        INSERT INTO UPDATE_QUERIES (QRY, FECHA, VERSION, DB)
        OUTPUT INSERTED.ID
        VALUES (@QRY, GETDATE(), @VERSION, @DB)
      `);
    console.log('Insertado UPDATE_QUERIES ID=', ins.recordset[0].ID);
  }

  await closeUpdateDbPool();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await closeUpdateDbPool();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
