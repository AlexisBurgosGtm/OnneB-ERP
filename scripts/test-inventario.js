/**
 * Prueba inventario en transacción (rollback) — no persiste cambios.
 * Uso: node scripts/test-inventario.js [CODDOC] [CORRELATIVO]
 */
require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');
const {
  getPermiteInventarioNegativo,
  getTipomDocumento,
  aplicarMovimientoInventarioDocumento,
  InventarioError,
} = require('../lib/inventario');

const EMPNIT = process.env.TEST_EMPNIT || 'ASYMEP005';

async function main() {
  const pool = await sql.connect(getDbConfig());
  const coddoc = process.argv[2] || 'ENVIOS01';
  const correlativo = Number(process.argv[3] || 0);

  const permite = await getPermiteInventarioNegativo(pool);
  console.log('Permite inventario negativo:', permite);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const tipom = await getTipomDocumento(transaction, EMPNIT, coddoc);
    console.log('TIPOM', coddoc, ':', tipom);

    if (!correlativo) {
      const draft = await transaction.request().input('EMPNIT', sql.VarChar, EMPNIT).query(`
        SELECT TOP 1 d.CODDOC, d.CORRELATIVO, d.STATUS,
          (SELECT COUNT(*) FROM dbo.DOCPRODUCTOS l
           WHERE l.EMPNIT = d.EMPNIT AND l.CODDOC = d.CODDOC AND l.CORRELATIVO = d.CORRELATIVO) AS lineas
        FROM dbo.DOCUMENTOS d
        JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
        WHERE d.EMPNIT = @EMPNIT AND d.STATUS = 'D' AND t.TIPODOC = 'ENV'
        ORDER BY d.ID DESC
      `);
      if (!draft.recordset.length) {
        console.log('Sin pedidos borrador para probar. Pase CODDOC y CORRELATIVO.');
        await transaction.rollback();
        await pool.close();
        return;
      }
      const row = draft.recordset[0];
      console.log('Pedido borrador:', row);
      const result = await aplicarMovimientoInventarioDocumento(transaction, {
        empnit: EMPNIT,
        coddoc: row.CODDOC,
        correlativo: row.CORRELATIVO,
        tipom: tipom || -1,
        permiteNegativo: permite,
      });
      console.log('Resultado simulado (TIPOM forzado si era 0):', result);
    } else {
      const result = await aplicarMovimientoInventarioDocumento(transaction, {
        empnit: EMPNIT,
        coddoc,
        correlativo,
        tipom: tipom || -1,
        permiteNegativo: permite,
      });
      console.log('Resultado simulado:', result);
    }
    await transaction.rollback();
    console.log('Rollback OK — sin cambios en BD');
  } catch (err) {
    await transaction.rollback();
    if (err instanceof InventarioError) {
      console.log('InventarioError esperado:', err.message);
    } else {
      throw err;
    }
  }
  await pool.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
