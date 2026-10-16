/**
 * Saldo por lote (INVSALDO_LOTE). Solo actúa si PRODUCTOS.USA_LOTES = 'SI' y hay NOLOTE.
 */
const sql = require('mssql');
const { InventarioError } = require('./inventario');
const { normalizeNolote, normalizeFvencLote } = require('./docproductos-lote');

function roundQty(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

async function productUsaLotes(transaction, empnit, codprod) {
  const res = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, String(empnit || '').trim())
    .input('CODPROD', sql.VarChar, String(codprod || '').trim())
    .query(`
      SELECT TOP 1 UPPER(LTRIM(RTRIM(ISNULL(USA_LOTES, 'NO')))) AS USA_LOTES
      FROM dbo.PRODUCTOS
      WHERE EMPNIT = @EMPNIT AND LTRIM(RTRIM(CODPROD)) = @CODPROD
    `);
  const row = res.recordset?.[0];
  if (!row) return false;
  return String(row.USA_LOTES || 'NO').toUpperCase() === 'SI';
}

async function lockLoteRow(transaction, empnit, codprod, codbodega, nolote) {
  const res = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .input('CODBODEGA', sql.Int, codbodega)
    .input('NOLOTE', sql.NVarChar(50), nolote)
    .query(`
      SELECT TOP 1 ID, SALDO, FISICO, FVENCLOTE
      FROM dbo.INVSALDO_LOTE WITH (UPDLOCK, ROWLOCK)
      WHERE EMPNIT = @EMPNIT
        AND LTRIM(RTRIM(CODPROD)) = @CODPROD
        AND CODBODEGA = @CODBODEGA
        AND NOLOTE = @NOLOTE
    `);
  return res.recordset?.[0] || null;
}

async function insertLoteRow(transaction, empnit, codprod, codbodega, nolote, fvencLote, saldo, fisico) {
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .input('CODBODEGA', sql.Int, codbodega)
    .input('NOLOTE', sql.NVarChar(50), nolote)
    .input('FVENCLOTE', sql.Date, fvencLote)
    .input('SALDO', sql.Float, saldo)
    .input('FISICO', sql.Float, fisico)
    .query(`
      INSERT INTO dbo.INVSALDO_LOTE (EMPNIT, CODPROD, CODBODEGA, NOLOTE, FVENCLOTE, SALDO, FISICO)
      VALUES (@EMPNIT, @CODPROD, @CODBODEGA, @NOLOTE, @FVENCLOTE, @SALDO, @FISICO)
    `);
}

/**
 * Espejo opcional del delta de inventario por lote. No-op si el producto no usa lotes o falta NOLOTE.
 */
async function aplicarDeltaInventarioLoteLinea(transaction, opts) {
  const empnit = String(opts.empnit || '').trim();
  const codprod = String(opts.codprod || '').trim();
  const nolote = normalizeNolote(opts.nolote);
  const fvencLote = normalizeFvencLote(opts.fvencLote);
  const delta = roundQty(opts.delta ?? 0);
  const deltaFisico = roundQty(opts.deltaFisico ?? 0);
  if (!empnit || !codprod || (!delta && !deltaFisico)) {
    return { applied: false };
  }
  if (!nolote) return { applied: false };

  let usaLotes = false;
  try {
    usaLotes = await productUsaLotes(transaction, empnit, codprod);
  } catch {
    return { applied: false };
  }
  if (!usaLotes) return { applied: false };

  const codbodega = Number(opts.codbodega ?? opts.codbodegaEntrada ?? opts.codbodegaSalida ?? 0) || 0;
  const permiteNegativo = Boolean(opts.permiteNegativo);
  const nombre = String(opts.desprod || codprod).trim() || codprod;

  const row = await lockLoteRow(transaction, empnit, codprod, codbodega, nolote);
  const saldoActual = roundQty(row?.SALDO ?? 0);
  const fisicoActual = roundQty(row?.FISICO ?? row?.SALDO ?? 0);
  const nuevoSaldo = roundQty(saldoActual + delta);
  const nuevoFisico = roundQty(fisicoActual + deltaFisico);

  if (delta && nuevoSaldo < 0 && !permiteNegativo) {
    throw new InventarioError(
      `Stock insuficiente en lote "${nolote}" para "${nombre}". Disponible: ${saldoActual}, requerido: ${Math.abs(delta)}.`,
    );
  }
  if (deltaFisico && nuevoFisico < 0 && !permiteNegativo) {
    throw new InventarioError(
      `Stock físico insuficiente en lote "${nolote}" para "${nombre}". Disponible: ${fisicoActual}, requerido: ${Math.abs(deltaFisico)}.`,
    );
  }

  if (row) {
    await transaction
      .request()
      .input('ID', sql.Int, row.ID)
      .input('SALDO', sql.Float, nuevoSaldo)
      .input('FISICO', sql.Float, nuevoFisico)
      .query(`
        UPDATE dbo.INVSALDO_LOTE
        SET SALDO = @SALDO, FISICO = @FISICO
        WHERE ID = @ID
      `);
  } else if (nuevoSaldo >= 0 && nuevoFisico >= 0 && (delta > 0 || deltaFisico > 0)) {
    await insertLoteRow(transaction, empnit, codprod, codbodega, nolote, fvencLote, nuevoSaldo, nuevoFisico);
  } else if (delta < 0 || deltaFisico < 0) {
    throw new InventarioError(
      `No hay saldo en lote "${nolote}" para el producto ${codprod}.`,
      'INVENTARIO_LOTE_SIN_REGISTRO',
    );
  }

  return { applied: true, nolote, fvencLote };
}

async function listLotesSaldo(pool, empnit, { codprod = null, q = null, limit = 200 } = {}) {
  const req = pool.request().input('EMPNIT', sql.VarChar, empnit);
  let where = 'l.EMPNIT = @EMPNIT AND ISNULL(l.SALDO, 0) <> 0';
  if (codprod) {
    req.input('CODPROD', sql.VarChar, String(codprod).trim());
    where += ' AND LTRIM(RTRIM(l.CODPROD)) = @CODPROD';
  }
  if (q) {
    req.input('Q', sql.NVarChar, `%${String(q).trim()}%`);
    where += ' AND (l.NOLOTE LIKE @Q OR l.CODPROD LIKE @Q)';
  }
  const top = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const res = await req.query(`
    SELECT TOP (${top})
      l.ID, l.CODPROD, p.DESPROD, l.CODBODEGA, l.NOLOTE, l.FVENCLOTE, l.SALDO, l.FISICO,
      UPPER(LTRIM(RTRIM(ISNULL(p.USA_LOTES, 'NO')))) AS USA_LOTES
    FROM dbo.INVSALDO_LOTE l
    LEFT JOIN dbo.PRODUCTOS p ON p.EMPNIT = l.EMPNIT AND p.CODPROD = l.CODPROD
    WHERE ${where}
    ORDER BY l.FVENCLOTE ASC, l.NOLOTE ASC
  `);
  return res.recordset || [];
}

module.exports = {
  productUsaLotes,
  aplicarDeltaInventarioLoteLinea,
  listLotesSaldo,
};
