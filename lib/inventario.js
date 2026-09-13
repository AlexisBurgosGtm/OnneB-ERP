const sql = require('mssql');
const { SETTING_OPCION, getSettingSino } = require('./settings');
const {
  valoresEntregadosIniciales,
  resolveTipodocFromCoddoc,
} = require('./documentos-entregado');

const INVENTARIO_NEGATIVO_CONFIG_ID = 3;

const ENSURE_FISICO_SQL = `
IF COL_LENGTH('dbo.PRODUCTOS', 'FISICO') IS NULL
BEGIN
  ALTER TABLE dbo.PRODUCTOS ADD FISICO FLOAT NULL;
END
IF COL_LENGTH('dbo.INVSALDO', 'FISICO') IS NULL
BEGIN
  ALTER TABLE dbo.INVSALDO ADD FISICO FLOAT NULL;
END
`;

let fisicoSchemaReady = false;

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

/** Movimiento de inventario = unidades × TIPOM */
function calcMovimientoInventario(totalUnidades, tipom) {
  const unidades = roundQty(totalUnidades);
  const t = Number(tipom) || 0;
  if (!unidades || !t) return 0;
  return roundQty(unidades * t);
}

async function ensureInventarioFisicoColumns(db) {
  if (fisicoSchemaReady) return;
  await db.request().query(ENSURE_FISICO_SQL);
  fisicoSchemaReady = true;
}

async function resolveTipom(transaction, empnit, coddoc, tipomOpt) {
  if (tipomOpt !== undefined && tipomOpt !== null) return Number(tipomOpt) || 0;
  return getTipomDocumento(transaction, empnit, coddoc);
}

async function resolvePermiteNegativo(transaction, permiteNegativoOpt) {
  if (permiteNegativoOpt !== undefined) return Boolean(permiteNegativoOpt);
  return getPermiteInventarioNegativo(transaction);
}

async function resolveEntregadosUnidades(transaction, opts, totalUnidadesFallback) {
  if (opts.entregadosTotalUnidades !== undefined && opts.entregadosTotalUnidades !== null) {
    return roundQty(opts.entregadosTotalUnidades);
  }
  const tipodoc =
    opts.tipodoc != null && String(opts.tipodoc).trim() !== ''
      ? String(opts.tipodoc).trim().toUpperCase()
      : await resolveTipodocFromCoddoc(transaction, opts.empnit, opts.coddoc);
  return roundQty(valoresEntregadosIniciales(tipodoc, totalUnidadesFallback).unidades);
}

/**
 * Aplica deltas a EXISTENCIA/SALDO y/o FISICO.
 * @param {import('mssql').Transaction} transaction
 */
async function aplicarDeltaInventarioLinea(transaction, opts) {
  const tipoprod = String(opts.tipoprod ?? 'P').trim().toUpperCase();
  if (tipoprod === 'S') return { applied: false, delta: 0, deltaFisico: 0 };

  const delta = roundQty(opts.delta ?? 0);
  const deltaFisico = roundQty(opts.deltaFisico ?? 0);
  if (!delta && !deltaFisico) return { applied: false, delta: 0, deltaFisico: 0 };

  const empnit = String(opts.empnit || '').trim();
  const codprod = String(opts.codprod || '').trim();
  if (codprod.toUpperCase().startsWith('PSE')) {
    return { applied: false, delta: 0, deltaFisico: 0 };
  }
  if (!empnit || !codprod) {
    throw new InventarioError('Parámetros de inventario inválidos', 'INVENTARIO_PARAMS');
  }

  await ensureInventarioFisicoColumns(transaction);

  const permiteNegativo = await resolvePermiteNegativo(transaction, opts.permiteNegativo);
  const invRow = await lockInvSaldoRow(transaction, empnit, codprod);
  const saldoActual = roundQty(invRow?.SALDO ?? 0);
  const fisicoActual = roundQty(invRow?.FISICO ?? invRow?.SALDO ?? 0);
  const nuevoSaldo = roundQty(saldoActual + delta);
  const nuevoFisico = roundQty(fisicoActual + deltaFisico);

  if (delta && nuevoSaldo < 0 && !permiteNegativo) {
    const nombre = String(opts.desprod || codprod).trim() || codprod;
    throw new InventarioError(
      `Stock insuficiente para "${nombre}". Disponible: ${saldoActual}, requerido: ${Math.abs(delta)}.`,
    );
  }

  if (deltaFisico && nuevoFisico < 0 && !permiteNegativo) {
    const nombre = String(opts.desprod || codprod).trim() || codprod;
    throw new InventarioError(
      `Stock físico insuficiente para "${nombre}". Disponible: ${fisicoActual}, requerido: ${Math.abs(deltaFisico)}.`,
    );
  }

  if (invRow) {
    await updateInvSaldoSaldoFisico(transaction, invRow.ID, {
      saldo: delta ? nuevoSaldo : undefined,
      fisico: deltaFisico ? nuevoFisico : undefined,
      saldoFallback: saldoActual,
      fisicoFallback: fisicoActual,
    });
  } else if (nuevoSaldo > 0 || nuevoFisico > 0 || (delta === 0 && deltaFisico === 0)) {
    if (nuevoSaldo < 0 || nuevoFisico < 0) {
      throw new InventarioError(
        `No hay registro de inventario para el producto ${codprod}.`,
        'INVENTARIO_SIN_REGISTRO',
      );
    }
    await insertInvSaldoRow(transaction, empnit, codprod, nuevoSaldo, nuevoFisico);
  } else {
    throw new InventarioError(
      `No hay registro de inventario para el producto ${codprod}.`,
      'INVENTARIO_SIN_REGISTRO',
    );
  }

  if (delta) await updateProductoExistencia(transaction, empnit, codprod, delta);
  if (deltaFisico) await updateProductoFisico(transaction, empnit, codprod, deltaFisico);
  return { applied: true, delta, deltaFisico };
}

/**
 * Stock al insertar línea:
 * EXISTENCIA ← TOTALUNIDADES × TIPOM
 * FISICO ← ENTREGADOS_TOTALUNIDADES × TIPOM
 * (entrega parcial: entregados=0; resto: entregados=total)
 */
async function aplicarMovimientoInventarioLineaInsert(transaction, opts) {
  const tipom = await resolveTipom(transaction, opts.empnit, opts.coddoc, opts.tipom);
  if (!tipom) return { applied: false, tipom: 0, delta: 0, deltaFisico: 0 };

  const delta = calcMovimientoInventario(opts.totalUnidades, tipom);
  const entregadosU = await resolveEntregadosUnidades(transaction, opts, opts.totalUnidades);
  const deltaFisico = calcMovimientoInventario(entregadosU, tipom);
  const result = await aplicarDeltaInventarioLinea(transaction, { ...opts, delta, deltaFisico });
  return { ...result, tipom };
}

/**
 * Stock al editar línea: (nuevo − anterior) × TIPOM para existencia y físico.
 */
async function aplicarMovimientoInventarioLineaPatch(transaction, opts) {
  const tipom = await resolveTipom(transaction, opts.empnit, opts.coddoc, opts.tipom);
  if (!tipom) return { applied: false, tipom: 0, delta: 0, deltaFisico: 0 };

  const delta = roundQty(
    calcMovimientoInventario(opts.nuevoTotalUnidades, tipom) -
      calcMovimientoInventario(opts.anteriorTotalUnidades, tipom),
  );

  const antEnt =
    opts.anteriorEntregadosTotalUnidades !== undefined && opts.anteriorEntregadosTotalUnidades !== null
      ? roundQty(opts.anteriorEntregadosTotalUnidades)
      : await resolveEntregadosUnidades(
          transaction,
          { ...opts, entregadosTotalUnidades: undefined },
          opts.anteriorTotalUnidades,
        );
  const newEnt =
    opts.nuevoEntregadosTotalUnidades !== undefined && opts.nuevoEntregadosTotalUnidades !== null
      ? roundQty(opts.nuevoEntregadosTotalUnidades)
      : await resolveEntregadosUnidades(
          transaction,
          { ...opts, entregadosTotalUnidades: undefined },
          opts.nuevoTotalUnidades,
        );

  const deltaFisico = roundQty(
    calcMovimientoInventario(newEnt, tipom) - calcMovimientoInventario(antEnt, tipom),
  );

  const result = await aplicarDeltaInventarioLinea(transaction, { ...opts, delta, deltaFisico });
  return { ...result, tipom };
}

/**
 * Revierte el movimiento de una línea (eliminar línea o borrar documento).
 */
async function revertirMovimientoInventarioLinea(transaction, opts) {
  const tipom = await resolveTipom(transaction, opts.empnit, opts.coddoc, opts.tipom);
  if (!tipom) return { applied: false, tipom: 0, delta: 0, deltaFisico: 0 };

  const delta = -calcMovimientoInventario(opts.totalUnidades, tipom);
  const entregadosU = await resolveEntregadosUnidades(transaction, opts, opts.totalUnidades);
  const deltaFisico = -calcMovimientoInventario(entregadosU, tipom);
  const result = await aplicarDeltaInventarioLinea(transaction, { ...opts, delta, deltaFisico });
  return { ...result, tipom };
}

/**
 * Solo físico (entregas parciales): EXISTENCIA no cambia.
 */
async function aplicarDeltaFisicoEntrega(transaction, opts) {
  const tipom = await resolveTipom(transaction, opts.empnit, opts.coddoc, opts.tipom);
  if (!tipom) return { applied: false, tipom: 0, delta: 0, deltaFisico: 0 };
  const deltaFisico = calcMovimientoInventario(opts.totalUnidades, tipom);
  if (!deltaFisico) return { applied: false, tipom, delta: 0, deltaFisico: 0 };
  const result = await aplicarDeltaInventarioLinea(transaction, {
    ...opts,
    delta: 0,
    deltaFisico,
  });
  return { ...result, tipom };
}

function tipomFromLine(line, fallbackTipom = 0) {
  if (line && line.TIPOM !== null && line.TIPOM !== undefined && line.TIPOM !== '') {
    const n = Number(line.TIPOM);
    if (Number.isFinite(n)) return n;
  }
  return Number(fallbackTipom) || 0;
}

/**
 * Revierte inventario de todas las líneas de un documento (antes de DELETE masivo).
 */
async function revertirMovimientoInventarioDocumento(transaction, opts) {
  const empnit = String(opts.empnit || '').trim();
  const coddoc = String(opts.coddoc || '').trim();
  const correlativo = Number(opts.correlativo);
  if (!empnit || !coddoc || !Number.isFinite(correlativo)) {
    throw new InventarioError('Parámetros de inventario inválidos', 'INVENTARIO_PARAMS');
  }

  await ensureInventarioFisicoColumns(transaction);

  const fallbackTipom = await resolveTipom(transaction, empnit, coddoc, opts.tipom);
  const permiteNegativo = await resolvePermiteNegativo(transaction, opts.permiteNegativo);
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
        ISNULL(ENTREGADOS_TOTALUNIDADES, 0) AS ENTREGADOS_TOTALUNIDADES,
        TIPOPROD,
        TIPOM,
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
  let lastTipom = 0;
  for (const line of linesRes.recordset) {
    const tipom = tipomFromLine(line, fallbackTipom);
    if (!tipom) continue;
    lastTipom = tipom;
    const unidades = roundQty(line.TOTALUNIDADES);
    const entregadosU = roundQty(line.ENTREGADOS_TOTALUNIDADES);
    const delta = unidades ? -calcMovimientoInventario(unidades, tipom) : 0;
    const deltaFisico = entregadosU ? -calcMovimientoInventario(entregadosU, tipom) : 0;
    if (!delta && !deltaFisico) continue;
    await aplicarDeltaInventarioLinea(transaction, {
      empnit,
      codprod: line.CODPROD,
      desprod: line.DESPROD,
      delta,
      deltaFisico,
      codbodegaEntrada: line.CODBODEGAENTRADA,
      codbodegaSalida: line.CODBODEGASALIDA,
      tipoprod: line.TIPOPROD,
      permiteNegativo,
    });
    lineas += 1;
    productos += 1;
  }
  return { tipom: lastTipom, lineas, productos };
}

async function getPermiteInventarioNegativo(db) {
  const sino = await getSettingSino(db, SETTING_OPCION.INVENTARIO_NEGATIVO);
  return sino === 'SI';
}

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

async function lockInvSaldoRow(transaction, empnit, codprod) {
  const cod = String(codprod || '').trim();
  const anyRow = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, cod)
    .query(`
      SELECT TOP 1 ID, SALDO, FISICO, CODBODEGA
      FROM dbo.INVSALDO WITH (UPDLOCK, ROWLOCK)
      WHERE EMPNIT = @EMPNIT AND LTRIM(RTRIM(CODPROD)) = @CODPROD
      ORDER BY ID
    `);
  return anyRow.recordset[0] || null;
}

async function insertInvSaldoRow(transaction, empnit, codprod, saldo, fisico = 0) {
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, String(codprod || '').trim())
    .input('SALDO', sql.Float, saldo)
    .input('FISICO', sql.Float, fisico)
    .query(`
      INSERT INTO dbo.INVSALDO (EMPNIT, CODPROD, CODBODEGA, SALDO, FISICO)
      VALUES (@EMPNIT, @CODPROD, 0, @SALDO, @FISICO)
    `);
}

async function updateInvSaldoSaldoFisico(transaction, id, { saldo, fisico, saldoFallback, fisicoFallback }) {
  const nextSaldo = saldo !== undefined ? saldo : saldoFallback;
  const nextFisico = fisico !== undefined ? fisico : fisicoFallback;
  await transaction
    .request()
    .input('ID', sql.Int, id)
    .input('SALDO', sql.Float, nextSaldo)
    .input('FISICO', sql.Float, nextFisico)
    .query(`
      UPDATE dbo.INVSALDO
      SET SALDO = @SALDO, FISICO = @FISICO
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

async function updateProductoFisico(transaction, empnit, codprod, delta) {
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .input('DELTA', sql.Float, delta)
    .query(`
      UPDATE dbo.PRODUCTOS
      SET FISICO = ISNULL(FISICO, 0) + @DELTA
      WHERE EMPNIT = @EMPNIT AND CODPROD = @CODPROD
    `);
}

/**
 * Aplica movimiento de inventario para un documento (líneas DOCPRODUCTOS).
 */
async function aplicarMovimientoInventarioDocumento(transaction, opts) {
  const empnit = String(opts.empnit || '').trim();
  const coddoc = String(opts.coddoc || '').trim();
  const correlativo = Number(opts.correlativo);
  if (!empnit || !coddoc || !Number.isFinite(correlativo)) {
    throw new InventarioError('Parámetros de inventario inválidos', 'INVENTARIO_PARAMS');
  }

  await ensureInventarioFisicoColumns(transaction);

  const fallbackTipom = await resolveTipom(transaction, empnit, coddoc, opts.tipom);

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
        ISNULL(ENTREGADOS_TOTALUNIDADES, 0) AS ENTREGADOS_TOTALUNIDADES,
        TIPOPROD,
        TIPOM,
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
  let lastTipom = 0;

  for (const line of linesRes.recordset) {
    const tipom = tipomFromLine(line, fallbackTipom);
    if (!tipom) continue;
    lastTipom = tipom;

    const unidades = roundQty(line.TOTALUNIDADES);
    const entregadosU = roundQty(line.ENTREGADOS_TOTALUNIDADES);
    const delta = unidades ? calcMovimientoInventario(unidades, tipom) : 0;
    const deltaFisico = entregadosU ? calcMovimientoInventario(entregadosU, tipom) : 0;
    if (!delta && !deltaFisico) continue;

    await aplicarDeltaInventarioLinea(transaction, {
      empnit,
      codprod: line.CODPROD,
      desprod: line.DESPROD,
      delta,
      deltaFisico,
      codbodegaEntrada: line.CODBODEGAENTRADA,
      codbodegaSalida: line.CODBODEGASALIDA,
      tipoprod: line.TIPOPROD,
      permiteNegativo,
    });
    lineas += 1;
    productos += 1;
  }

  return { tipom: lastTipom, lineas, productos };
}

module.exports = {
  INVENTARIO_NEGATIVO_CONFIG_ID,
  InventarioError,
  ENSURE_FISICO_SQL,
  calcMovimientoInventario,
  ensureInventarioFisicoColumns,
  getPermiteInventarioNegativo,
  getTipomDocumento,
  aplicarDeltaInventarioLinea,
  aplicarDeltaFisicoEntrega,
  aplicarMovimientoInventarioLineaInsert,
  aplicarMovimientoInventarioLineaPatch,
  revertirMovimientoInventarioLinea,
  revertirMovimientoInventarioDocumento,
  aplicarMovimientoInventarioDocumento,
};
