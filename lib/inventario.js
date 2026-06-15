const sql = require('mssql');
const { SETTING_OPCION, getSettingSino } = require('./settings');

const INVENTARIO_NEGATIVO_CONFIG_ID = 3;

class InventarioError extends Error {
  constructor(message, code = 'INVENTARIO_INSUFICIENTE') {
    super(message);
    this.name = 'InventarioError';
    this.statusCode = 400;
    this.code = code;
  }
}

function roundQty(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

/**
 * SETTINGS — INVENTARIO NEGATIVO (permite vender en negativo).
 * @param {import('mssql').ConnectionPool|import('mssql').Transaction} db
 */
async function getPermiteInventarioNegativo(db) {
  const sino = await getSettingSino(db, SETTING_OPCION.INVENTARIO_NEGATIVO);
  return sino === 'SI';
}

/**
 * TIPOM del tipo de documento: cantidad * TIPOM = movimiento (+ entrada, - salida).
 * @param {import('mssql').Transaction} transaction
 */
async function getTipomDocumento(transaction, empnit, coddoc) {
  const result = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT TIPOM
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const raw = result.recordset[0]?.TIPOM;
  if (raw === null || raw === undefined || raw === '') return 0;
  const tipom = Number(raw);
  return Number.isFinite(tipom) ? tipom : 0;
}

/**
 * Busca fila INVSALDO con bloqueo; prioriza bodega de la línea y luego bodega 0 (legacy).
 * @param {import('mssql').Transaction} transaction
 */
async function lockInvSaldoRow(transaction, empnit, codprod, codbodega) {
  const bodega = Number(codbodega);
  const bodegaLinea = Number.isFinite(bodega) ? bodega : 0;

  const exact = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .input('CODBODEGA', sql.Int, bodegaLinea)
    .query(`
      SELECT TOP 1 ID, SALDO, CODBODEGA
      FROM dbo.INVSALDO WITH (UPDLOCK, ROWLOCK)
      WHERE EMPNIT = @EMPNIT AND CODPROD = @CODPROD AND CODBODEGA = @CODBODEGA
      ORDER BY ID
    `);
  if (exact.recordset.length) return exact.recordset[0];

  if (bodegaLinea !== 0) {
    const legacy = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODPROD', sql.VarChar, codprod)
      .query(`
        SELECT TOP 1 ID, SALDO, CODBODEGA
        FROM dbo.INVSALDO WITH (UPDLOCK, ROWLOCK)
        WHERE EMPNIT = @EMPNIT AND CODPROD = @CODPROD AND CODBODEGA = 0
        ORDER BY ID
      `);
    if (legacy.recordset.length) return legacy.recordset[0];
  }

  const anyRow = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .query(`
      SELECT TOP 1 ID, SALDO, CODBODEGA
      FROM dbo.INVSALDO WITH (UPDLOCK, ROWLOCK)
      WHERE EMPNIT = @EMPNIT AND CODPROD = @CODPROD
      ORDER BY CASE WHEN CODBODEGA = 0 THEN 0 ELSE 1 END, ID
    `);
  return anyRow.recordset[0] || null;
}

async function insertInvSaldoRow(transaction, empnit, codprod, codbodega, saldo) {
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .input('CODBODEGA', sql.Int, Number(codbodega) || 0)
    .input('SALDO', sql.Float, saldo)
    .query(`
      INSERT INTO dbo.INVSALDO (EMPNIT, CODPROD, CODBODEGA, SALDO)
      VALUES (@EMPNIT, @CODPROD, @CODBODEGA, @SALDO)
    `);
}

async function updateInvSaldoSaldo(transaction, id, saldo) {
  await transaction
    .request()
    .input('ID', sql.Int, id)
    .input('SALDO', sql.Float, saldo)
    .query(`
      UPDATE dbo.INVSALDO
      SET SALDO = @SALDO
      WHERE ID = @ID
    `);
}

async function updateProductoExistencia(transaction, empnit, codprod, delta) {
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .input('DELTA', sql.Float, delta)
    .query(`
      UPDATE dbo.PRODUCTOS
      SET EXISTENCIA = ISNULL(EXISTENCIA, 0) + @DELTA
      WHERE EMPNIT = @EMPNIT AND CODPROD = @CODPROD
    `);
}

/**
 * Aplica movimiento de inventario para un documento (líneas DOCPRODUCTOS).
 * Movimiento por línea = TOTALUNIDADES * TIPOM.
 * Solo actualiza INVSALDO.SALDO y PRODUCTOS.EXISTENCIA.
 *
 * @param {import('mssql').Transaction} transaction
 * @param {{ empnit: string, coddoc: string, correlativo: number, tipom?: number, permiteNegativo?: boolean }} opts
 */
async function aplicarMovimientoInventarioDocumento(transaction, opts) {
  const empnit = String(opts.empnit || '').trim();
  const coddoc = String(opts.coddoc || '').trim();
  const correlativo = Number(opts.correlativo);
  if (!empnit || !coddoc || !Number.isFinite(correlativo)) {
    throw new InventarioError('Parámetros de inventario inválidos', 'INVENTARIO_PARAMS');
  }

  const tipom =
    opts.tipom !== undefined && opts.tipom !== null
      ? Number(opts.tipom)
      : await getTipomDocumento(transaction, empnit, coddoc);
  if (!tipom) {
    return { tipom: 0, lineas: 0, productos: 0 };
  }

  const permiteNegativo =
    opts.permiteNegativo !== undefined
      ? Boolean(opts.permiteNegativo)
      : await getPermiteInventarioNegativo(transaction);

  const docStatus = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT STATUS FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
  const st = String(docStatus.recordset[0]?.STATUS || '').trim().toUpperCase();
  if (st !== 'O') {
    throw new InventarioError('El documento no está operado', 'INVENTARIO_STATUS');
  }

  const linesRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT
        CODPROD,
        DESPROD,
        TOTALUNIDADES,
        TIPOPROD,
        CODBODEGAENTRADA,
        CODBODEGASALIDA
      FROM dbo.DOCPRODUCTOS
      WHERE EMPNIT = @EMPNIT
        AND CODDOC = @CODDOC
        AND CORRELATIVO = @CORRELATIVO
        AND ISNULL(TIPOPROD, 'P') <> 'S'
    `);

  let lineas = 0;
  let productos = 0;

  for (const line of linesRes.recordset) {
    const unidades = roundQty(line.TOTALUNIDADES);
    if (!unidades) continue;

    const delta = roundQty(unidades * tipom);
    if (!delta) continue;

    const codbodega =
      delta > 0
        ? Number(line.CODBODEGAENTRADA ?? 0)
        : Number(line.CODBODEGASALIDA ?? 0);

    const invRow = await lockInvSaldoRow(transaction, empnit, line.CODPROD, codbodega);
    const saldoActual = roundQty(invRow?.SALDO ?? 0);
    const nuevoSaldo = roundQty(saldoActual + delta);

    if (nuevoSaldo < 0 && !permiteNegativo) {
      const nombre = String(line.DESPROD || line.CODPROD || '').trim() || line.CODPROD;
      throw new InventarioError(
        `Stock insuficiente para "${nombre}". Disponible: ${saldoActual}, requerido: ${Math.abs(delta)}.`,
      );
    }

    if (invRow) {
      await updateInvSaldoSaldo(transaction, invRow.ID, nuevoSaldo);
    } else if (delta > 0) {
      await insertInvSaldoRow(transaction, empnit, line.CODPROD, codbodega, nuevoSaldo);
    } else {
      throw new InventarioError(
        `No hay registro de inventario para el producto ${line.CODPROD}.`,
        'INVENTARIO_SIN_REGISTRO',
      );
    }

    await updateProductoExistencia(transaction, empnit, line.CODPROD, delta);
    lineas += 1;
    productos += 1;
  }

  return { tipom, lineas, productos };
}

module.exports = {
  INVENTARIO_NEGATIVO_CONFIG_ID,
  InventarioError,
  getPermiteInventarioNegativo,
  getTipomDocumento,
  aplicarMovimientoInventarioDocumento,
};
