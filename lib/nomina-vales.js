const sql = require('mssql');

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function parseMesAnio(mesRaw, anioRaw) {
  const now = new Date();
  const mes = parseInt(mesRaw, 10);
  const anio = parseInt(anioRaw, 10);
  return {
    mes: Number.isFinite(mes) && mes >= 1 && mes <= 12 ? mes : now.getMonth() + 1,
    anio: Number.isFinite(anio) && anio >= 2000 && anio <= 2100 ? anio : now.getFullYear(),
  };
}

async function listVales(pool, empnit, mes, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT v.ID, v.EMPNIT, v.CODEMP, v.CODCAJA, v.FECHA, v.MES, v.ANIO, v.MONTO,
             ISNULL(v.ABONOS, 0) AS ABONOS,
             ISNULL(v.SALDO, v.MONTO - ISNULL(v.ABONOS, 0)) AS SALDO,
             v.DESCRIPCION, v.USUARIO, v.FECHA_CREACION, v.CORTE, v.NOCORTE,
             ISNULL(e.NOMEMPLEADO, '') AS NOMEMPLEADO,
             ISNULL(c.DESCAJA, '') AS DESCAJA
      FROM dbo.NOMINA_VALES_EMPLEADOS v
      LEFT JOIN dbo.Empleados e ON e.EMPNIT = v.EMPNIT AND e.CODEMPLEADO = v.CODEMP
      LEFT JOIN dbo.Cajas c ON c.EMPNIT = v.EMPNIT AND c.CODCAJA = v.CODCAJA
      WHERE v.EMPNIT = @EMPNIT AND v.MES = @MES AND v.ANIO = @ANIO
      ORDER BY v.FECHA DESC, v.ID DESC
    `);
  return result.recordset || [];
}

async function listEmpleadosActivosCombo(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT CODEMPLEADO, NOMEMPLEADO
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT AND ACTIVO = 'SI'
      ORDER BY NOMEMPLEADO ASC
    `);
  return result.recordset || [];
}

async function listCajasAbiertas(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT CODCAJA, DESCAJA
      FROM dbo.Cajas
      WHERE EMPNIT = @EMPNIT AND ISNULL(STATUS, 0) = 1
      ORDER BY DESCAJA ASC
    `);
  return result.recordset || [];
}

async function assertCajaAbierta(pool, empnit, codcaja) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .query(`
      SELECT CODCAJA, DESCAJA, ISNULL(STATUS, 0) AS STATUS
      FROM dbo.Cajas
      WHERE EMPNIT = @EMPNIT AND CODCAJA = @CODCAJA
    `);
  const row = result.recordset[0];
  if (!row) {
    const err = new Error('Caja no encontrada');
    err.statusCode = 404;
    throw err;
  }
  if (Number(row.STATUS) !== 1) {
    const err = new Error('La caja seleccionada no está abierta');
    err.statusCode = 400;
    throw err;
  }
  return row;
}

async function assertEmpleadoActivo(pool, empnit, codemp) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMP', sql.Int, codemp)
    .query(`
      SELECT CODEMPLEADO, NOMEMPLEADO
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMP AND ACTIVO = 'SI'
    `);
  const row = result.recordset[0];
  if (!row) {
    const err = new Error('Empleado no encontrado o inactivo');
    err.statusCode = 404;
    throw err;
  }
  return row;
}

async function createVale(pool, empnit, data) {
  const codemp = parseInt(data.CODEMP, 10);
  const codcaja = parseInt(data.CODCAJA, 10);
  const monto = roundMoney(data.MONTO);
  const fechaStr = String(data.FECHA || '').trim().slice(0, 10);
  const descripcion = String(data.DESCRIPCION || '').trim() || null;
  const usuario = String(data.USUARIO || '').trim() || null;

  if (!Number.isFinite(codemp) || codemp <= 0) {
    const err = new Error('Seleccione un empleado');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(codcaja) || codcaja <= 0) {
    const err = new Error('Seleccione una caja abierta');
    err.statusCode = 400;
    throw err;
  }
  if (!(monto > 0)) {
    const err = new Error('El monto debe ser mayor a cero');
    err.statusCode = 400;
    throw err;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    const err = new Error('Fecha inválida');
    err.statusCode = 400;
    throw err;
  }

  await assertEmpleadoActivo(pool, empnit, codemp);
  await assertCajaAbierta(pool, empnit, codcaja);

  const [anio, mes] = fechaStr.split('-').map((n) => parseInt(n, 10));

  const insert = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMP', sql.Int, codemp)
    .input('CODCAJA', sql.Int, codcaja)
    .input('FECHA', sql.Date, fechaStr)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .input('MONTO', sql.Decimal(18, 3), monto)
    .input('DESCRIPCION', sql.VarChar, descripcion)
    .input('USUARIO', sql.VarChar, usuario)
    .query(`
      INSERT INTO dbo.NOMINA_VALES_EMPLEADOS (
        EMPNIT, CODEMP, CODCAJA, FECHA, MES, ANIO, MONTO, ABONOS, SALDO, DESCRIPCION, USUARIO, CORTE
      )
      OUTPUT INSERTED.ID
      VALUES (
        @EMPNIT, @CODEMP, @CODCAJA, @FECHA, @MES, @ANIO, @MONTO, 0, @MONTO, @DESCRIPCION, @USUARIO, 'NO'
      )
    `);

  const id = insert.recordset[0]?.ID;
  const rows = await listVales(pool, empnit, mes, anio);
  return { id, rows, mes, anio };
}

async function getValeById(pool, empnit, id) {
  const existing = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, id)
    .query(`
      SELECT ID, EMPNIT, CODEMP, CODCAJA, FECHA, MES, ANIO, MONTO,
             ISNULL(ABONOS, 0) AS ABONOS,
             ISNULL(SALDO, MONTO - ISNULL(ABONOS, 0)) AS SALDO,
             DESCRIPCION, CORTE, NOCORTE
      FROM dbo.NOMINA_VALES_EMPLEADOS
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  return existing.recordset[0] || null;
}

async function updateVale(pool, empnit, id, data) {
  const row = await getValeById(pool, empnit, id);
  if (!row) {
    const err = new Error('Vale no encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (String(row.CORTE || 'NO').trim().toUpperCase() === 'SI') {
    const err = new Error('No se puede editar un vale ya incluido en un corte de caja');
    err.statusCode = 400;
    throw err;
  }

  const codemp = parseInt(data.CODEMP, 10);
  const codcaja = parseInt(data.CODCAJA, 10);
  const monto = roundMoney(data.MONTO);
  const fechaStr = String(data.FECHA || '').trim().slice(0, 10);
  const descripcion = String(data.DESCRIPCION || '').trim() || null;
  const usuario = String(data.USUARIO || '').trim() || null;

  if (!Number.isFinite(codemp) || codemp <= 0) {
    const err = new Error('Seleccione un empleado');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(codcaja) || codcaja <= 0) {
    const err = new Error('Seleccione una caja abierta');
    err.statusCode = 400;
    throw err;
  }
  if (!(monto > 0)) {
    const err = new Error('El monto debe ser mayor a cero');
    err.statusCode = 400;
    throw err;
  }
  const abonosActual = roundMoney(row.ABONOS);
  if (monto + 0.0005 < abonosActual) {
    const err = new Error(`El monto no puede ser menor a los abonos (${abonosActual})`);
    err.statusCode = 400;
    throw err;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    const err = new Error('Fecha inválida');
    err.statusCode = 400;
    throw err;
  }

  if (Number(row.CODEMP) !== codemp) {
    await assertEmpleadoActivo(pool, empnit, codemp);
  }
  if (Number(row.CODCAJA) !== codcaja) {
    await assertCajaAbierta(pool, empnit, codcaja);
  }

  const [anio, mes] = fechaStr.split('-').map((n) => parseInt(n, 10));
  const saldo = roundMoney(monto - abonosActual);

  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, id)
    .input('CODEMP', sql.Int, codemp)
    .input('CODCAJA', sql.Int, codcaja)
    .input('FECHA', sql.Date, fechaStr)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .input('MONTO', sql.Decimal(18, 3), monto)
    .input('SALDO', sql.Decimal(18, 3), saldo)
    .input('DESCRIPCION', sql.VarChar, descripcion)
    .input('USUARIO', sql.VarChar, usuario)
    .query(`
      UPDATE dbo.NOMINA_VALES_EMPLEADOS
      SET CODEMP = @CODEMP,
          CODCAJA = @CODCAJA,
          FECHA = @FECHA,
          MES = @MES,
          ANIO = @ANIO,
          MONTO = @MONTO,
          SALDO = @SALDO,
          DESCRIPCION = @DESCRIPCION,
          USUARIO = ISNULL(@USUARIO, USUARIO)
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);

  const listMes = Number(data.listMes) || mes;
  const listAnio = Number(data.listAnio) || anio;
  const rows = await listVales(pool, empnit, listMes, listAnio);
  return { id, rows, mes: listMes, anio: listAnio, valeMes: mes, valeAnio: anio };
}

async function deleteVale(pool, empnit, id) {
  const row = await getValeById(pool, empnit, id);
  if (!row) {
    const err = new Error('Vale no encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (String(row.CORTE || 'NO').trim().toUpperCase() === 'SI') {
    const err = new Error('No se puede eliminar un vale ya incluido en un corte de caja');
    err.statusCode = 400;
    throw err;
  }
  if (roundMoney(row.ABONOS) > 0) {
    const err = new Error('No se puede eliminar un vale con abonos. Elimine los pagos del historial primero.');
    err.statusCode = 400;
    throw err;
  }
  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, id)
    .query(`DELETE FROM dbo.NOMINA_VALES_EMPLEADOS WHERE EMPNIT = @EMPNIT AND ID = @ID`);
  return { mes: row.MES, anio: row.ANIO };
}

async function listPagosVale(pool, empnit, idVale) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('IDVALE', sql.Int, idVale)
    .query(`
      SELECT p.ID, p.IDVALE, p.EMPNIT, p.CODCAJA,
             p.FECHA_PAGO AS FECHA,
             p.ABONO AS MONTO,
             ISNULL(p.CORTE, 'NO') AS CORTE,
             p.NOCORTE,
             ISNULL(c.DESCAJA, '') AS DESCAJA
      FROM dbo.NOMINA_VALES_EMPLEADOS_PAGOS p
      INNER JOIN dbo.NOMINA_VALES_EMPLEADOS v ON v.ID = p.IDVALE AND v.EMPNIT = p.EMPNIT
      LEFT JOIN dbo.Cajas c ON c.EMPNIT = p.EMPNIT AND c.CODCAJA = p.CODCAJA
      WHERE p.EMPNIT = @EMPNIT AND p.IDVALE = @IDVALE
      ORDER BY p.FECHA_PAGO DESC, p.ID DESC
    `);
  return result.recordset || [];
}

async function crearPagoVale(pool, empnit, idVale, data) {
  const row = await getValeById(pool, empnit, idVale);
  if (!row) {
    const err = new Error('Vale no encontrado');
    err.statusCode = 404;
    throw err;
  }
  const saldo = roundMoney(row.SALDO);
  if (!(saldo > 0)) {
    const err = new Error('El vale no tiene saldo pendiente');
    err.statusCode = 400;
    throw err;
  }
  const monto = roundMoney(data.MONTO ?? data.IMPORTE ?? data.ABONO);
  const fechaStr = String(data.FECHA || data.FECHA_PAGO || '').trim().slice(0, 10);
  const codcaja = parseInt(data.CODCAJA ?? row.CODCAJA, 10);

  if (!(monto > 0)) {
    const err = new Error('El importe abonado debe ser mayor a cero');
    err.statusCode = 400;
    throw err;
  }
  if (monto > saldo + 0.0005) {
    const err = new Error(`El pago no puede superar el saldo pendiente (${saldo})`);
    err.statusCode = 400;
    throw err;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    const err = new Error('Fecha inválida');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(codcaja) || codcaja <= 0) {
    const err = new Error('Seleccione una caja abierta');
    err.statusCode = 400;
    throw err;
  }
  await assertCajaAbierta(pool, empnit, codcaja);

  const nuevoAbonos = roundMoney(Number(row.ABONOS) + monto);
  const nuevoSaldo = roundMoney(Number(row.MONTO) - nuevoAbonos);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const ins = await transaction
      .request()
      .input('IDVALE', sql.Int, idVale)
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCAJA', sql.Int, codcaja)
      .input('FECHA_PAGO', sql.Date, fechaStr)
      .input('ABONO', sql.Decimal(18, 3), monto)
      .query(`
        INSERT INTO dbo.NOMINA_VALES_EMPLEADOS_PAGOS (IDVALE, EMPNIT, CODCAJA, FECHA_PAGO, ABONO, CORTE)
        OUTPUT INSERTED.ID
        VALUES (@IDVALE, @EMPNIT, @CODCAJA, @FECHA_PAGO, @ABONO, 'NO')
      `);
    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, idVale)
      .input('ABONOS', sql.Decimal(18, 3), nuevoAbonos)
      .input('SALDO', sql.Decimal(18, 3), Math.max(0, nuevoSaldo))
      .query(`
        UPDATE dbo.NOMINA_VALES_EMPLEADOS
        SET ABONOS = @ABONOS, SALDO = @SALDO
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    await transaction.commit();
    const pagoId = ins.recordset[0]?.ID;
    const listMes = Number(data.listMes) || row.MES;
    const listAnio = Number(data.listAnio) || row.ANIO;
    const rows = await listVales(pool, empnit, listMes, listAnio);
    return { pagoId, rows, mes: listMes, anio: listAnio, abonos: nuevoAbonos, saldo: Math.max(0, nuevoSaldo) };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function eliminarPagoVale(pool, empnit, idVale, pagoId, listOpts = {}) {
  const row = await getValeById(pool, empnit, idVale);
  if (!row) {
    const err = new Error('Vale no encontrado');
    err.statusCode = 404;
    throw err;
  }

  const pagoRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('IDVALE', sql.Int, idVale)
    .input('ID', sql.Int, pagoId)
    .query(`
      SELECT ID, ABONO AS MONTO, ISNULL(CORTE, 'NO') AS CORTE
      FROM dbo.NOMINA_VALES_EMPLEADOS_PAGOS
      WHERE EMPNIT = @EMPNIT AND IDVALE = @IDVALE AND ID = @ID
    `);
  const pago = pagoRes.recordset[0];
  if (!pago) {
    const err = new Error('Pago no encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (String(pago.CORTE || 'NO').trim().toUpperCase() === 'SI') {
    const err = new Error('No se puede eliminar un pago ya incluido en un corte de caja');
    err.statusCode = 400;
    throw err;
  }

  const montoPago = roundMoney(pago.MONTO);
  const nuevoAbonos = roundMoney(Math.max(0, Number(row.ABONOS) - montoPago));
  const nuevoSaldo = roundMoney(Number(row.MONTO) - nuevoAbonos);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('IDVALE', sql.Int, idVale)
      .input('ID', sql.Int, pagoId)
      .query(`
        DELETE FROM dbo.NOMINA_VALES_EMPLEADOS_PAGOS
        WHERE EMPNIT = @EMPNIT AND IDVALE = @IDVALE AND ID = @ID
      `);
    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, idVale)
      .input('ABONOS', sql.Decimal(18, 3), nuevoAbonos)
      .input('SALDO', sql.Decimal(18, 3), Math.max(0, nuevoSaldo))
      .query(`
        UPDATE dbo.NOMINA_VALES_EMPLEADOS
        SET ABONOS = @ABONOS, SALDO = @SALDO
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    await transaction.commit();
    const listMes = Number(listOpts.listMes) || row.MES;
    const listAnio = Number(listOpts.listAnio) || row.ANIO;
    const [rows, pagos] = await Promise.all([
      listVales(pool, empnit, listMes, listAnio),
      listPagosVale(pool, empnit, idVale),
    ]);
    return { rows, pagos, mes: listMes, anio: listAnio, abonos: nuevoAbonos, saldo: Math.max(0, nuevoSaldo) };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Vales pendientes de la sesión abierta de una caja (descuenta efectivo en corte).
 */
async function sumValesSesionCaja(requestable, empnit, codcaja, apertura) {
  const result = await requestable
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .input('APERTURA', sql.DateTime, apertura)
    .query(`
      SELECT ISNULL(SUM(MONTO), 0) AS TOTAL,
             COUNT(1) AS CANTIDAD
      FROM dbo.NOMINA_VALES_EMPLEADOS
      WHERE EMPNIT = @EMPNIT
        AND CODCAJA = @CODCAJA
        AND ISNULL(CORTE, 'NO') = 'NO'
        AND FECHA_CREACION >= @APERTURA
    `);
  const row = result.recordset[0] || {};
  return {
    totalVales: roundMoney(row.TOTAL),
    cantidadVales: Number(row.CANTIDAD) || 0,
  };
}

/**
 * Abonos a vales pendientes de la sesión (suman efectivo en corte).
 */
async function sumPagosValesSesionCaja(requestable, empnit, codcaja, apertura) {
  const result = await requestable
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .input('APERTURA', sql.DateTime, apertura)
    .query(`
      SELECT ISNULL(SUM(ABONO), 0) AS TOTAL,
             COUNT(1) AS CANTIDAD
      FROM dbo.NOMINA_VALES_EMPLEADOS_PAGOS
      WHERE EMPNIT = @EMPNIT
        AND CODCAJA = @CODCAJA
        AND ISNULL(CORTE, 'NO') = 'NO'
        AND FECHA_PAGO >= CAST(@APERTURA AS date)
    `);
  const row = result.recordset[0] || {};
  return {
    totalPagos: roundMoney(row.TOTAL),
    cantidadPagos: Number(row.CANTIDAD) || 0,
  };
}

async function listValesSesionCaja(requestable, empnit, codcaja, apertura) {
  const result = await requestable
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .input('APERTURA', sql.DateTime, apertura)
    .query(`
      SELECT v.ID, v.FECHA, v.CODEMP, v.CODCAJA, v.MONTO, v.DESCRIPCION,
             ISNULL(v.ABONOS, 0) AS ABONOS,
             ISNULL(v.SALDO, v.MONTO - ISNULL(v.ABONOS, 0)) AS SALDO,
             ISNULL(e.NOMEMPLEADO, '') AS NOMEMPLEADO,
             ISNULL(c.DESCAJA, '') AS DESCAJA
      FROM dbo.NOMINA_VALES_EMPLEADOS v
      LEFT JOIN dbo.Empleados e ON e.EMPNIT = v.EMPNIT AND e.CODEMPLEADO = v.CODEMP
      LEFT JOIN dbo.Cajas c ON c.EMPNIT = v.EMPNIT AND c.CODCAJA = v.CODCAJA
      WHERE v.EMPNIT = @EMPNIT
        AND v.CODCAJA = @CODCAJA
        AND ISNULL(v.CORTE, 'NO') = 'NO'
        AND v.FECHA_CREACION >= @APERTURA
      ORDER BY v.FECHA DESC, v.ID DESC
    `);
  return result.recordset || [];
}

async function listPagosValesSesionCaja(requestable, empnit, codcaja, apertura) {
  const result = await requestable
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .input('APERTURA', sql.DateTime, apertura)
    .query(`
      SELECT p.ID, p.IDVALE, p.FECHA_PAGO AS FECHA, p.ABONO AS MONTO, p.CODCAJA,
             v.CODEMP, v.DESCRIPCION AS VALE_DESC,
             v.MONTO AS VALE_MONTO,
             ISNULL(v.ABONOS, 0) AS VALE_ABONOS,
             ISNULL(v.SALDO, v.MONTO - ISNULL(v.ABONOS, 0)) AS VALE_SALDO,
             ISNULL(e.NOMEMPLEADO, '') AS NOMEMPLEADO,
             ISNULL(c.DESCAJA, '') AS DESCAJA
      FROM dbo.NOMINA_VALES_EMPLEADOS_PAGOS p
      INNER JOIN dbo.NOMINA_VALES_EMPLEADOS v ON v.ID = p.IDVALE AND v.EMPNIT = p.EMPNIT
      LEFT JOIN dbo.Empleados e ON e.EMPNIT = v.EMPNIT AND e.CODEMPLEADO = v.CODEMP
      LEFT JOIN dbo.Cajas c ON c.EMPNIT = p.EMPNIT AND c.CODCAJA = p.CODCAJA
      WHERE p.EMPNIT = @EMPNIT
        AND p.CODCAJA = @CODCAJA
        AND ISNULL(p.CORTE, 'NO') = 'NO'
        AND p.FECHA_PAGO >= CAST(@APERTURA AS date)
      ORDER BY p.FECHA_PAGO DESC, p.ID DESC
    `);
  return result.recordset || [];
}

async function marcarValesCorte(transaction, empnit, codcaja, nocorte, apertura) {
  const result = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .input('NOCORTE', sql.Int, nocorte)
    .input('APERTURA', sql.DateTime, apertura)
    .query(`
      UPDATE dbo.NOMINA_VALES_EMPLEADOS
      SET CORTE = 'SI', NOCORTE = @NOCORTE
      WHERE EMPNIT = @EMPNIT
        AND CODCAJA = @CODCAJA
        AND ISNULL(CORTE, 'NO') = 'NO'
        AND FECHA_CREACION >= @APERTURA
    `);
  return result.rowsAffected[0] || 0;
}

async function marcarPagosValesCorte(transaction, empnit, codcaja, nocorte, apertura) {
  const result = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .input('NOCORTE', sql.Int, nocorte)
    .input('APERTURA', sql.DateTime, apertura)
    .query(`
      UPDATE dbo.NOMINA_VALES_EMPLEADOS_PAGOS
      SET CORTE = 'SI', NOCORTE = @NOCORTE
      WHERE EMPNIT = @EMPNIT
        AND CODCAJA = @CODCAJA
        AND ISNULL(CORTE, 'NO') = 'NO'
        AND FECHA_PAGO >= CAST(@APERTURA AS date)
    `);
  return result.rowsAffected[0] || 0;
}

module.exports = {
  parseMesAnio,
  listVales,
  listEmpleadosActivosCombo,
  listCajasAbiertas,
  createVale,
  updateVale,
  deleteVale,
  getValeById,
  listPagosVale,
  crearPagoVale,
  eliminarPagoVale,
  sumValesSesionCaja,
  sumPagosValesSesionCaja,
  listValesSesionCaja,
  listPagosValesSesionCaja,
  marcarValesCorte,
  marcarPagosValesCorte,
  roundMoney,
};
