/**
 * Partidas de diario manuales (CONTA_ASIENTOS / CONTA_ASIENTOS_LINEAS).
 * Se fusionan en listLibroDiario sin alterar la expansión documento→formato.
 */
const { fpagoAmountsMatch, roundFpago } = require('./fpago-match');

const TIPODOC_MANUAL = 'ASM';
const CODFORMATO_MANUAL = 'MANUAL';

const DDL_CONTA_ASIENTOS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'CONTA_ASIENTOS' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.CONTA_ASIENTOS (
    ID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    EMPNIT VARCHAR(20) NOT NULL,
    FECHA DATETIME NOT NULL,
    MES INT NOT NULL,
    ANIO INT NOT NULL,
    CORRELATIVO INT NOT NULL,
    GLOSA NVARCHAR(500) NULL,
    STATUS VARCHAR(1) NOT NULL CONSTRAINT DF_CONTA_ASIENTOS_STATUS DEFAULT ('O'),
    USUARIO VARCHAR(50) NULL,
    FECHA_CREACION DATETIME NOT NULL CONSTRAINT DF_CONTA_ASIENTOS_FCREA DEFAULT (GETDATE()),
    FECHA_MODIFICACION DATETIME NULL
  );

  CREATE UNIQUE INDEX UQ_CONTA_ASIENTOS_EMP_ANIO_CORR
    ON dbo.CONTA_ASIENTOS (EMPNIT, ANIO, CORRELATIVO);

  CREATE INDEX IX_CONTA_ASIENTOS_EMP_MES_ANIO
    ON dbo.CONTA_ASIENTOS (EMPNIT, MES, ANIO);
END;
`.trim();

const DDL_CONTA_ASIENTOS_LINEAS = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'CONTA_ASIENTOS_LINEAS' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.CONTA_ASIENTOS_LINEAS (
    ID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    ASIENTO_ID INT NOT NULL,
    EMPNIT VARCHAR(20) NOT NULL,
    ORDEN INT NOT NULL CONSTRAINT DF_CONTA_ASIENTOS_LINEAS_ORDEN DEFAULT (1),
    CODCUENTA VARCHAR(30) NOT NULL,
    DEBE DECIMAL(18, 3) NOT NULL CONSTRAINT DF_CONTA_ASIENTOS_LINEAS_DEBE DEFAULT (0),
    HABER DECIMAL(18, 3) NOT NULL CONSTRAINT DF_CONTA_ASIENTOS_LINEAS_HABER DEFAULT (0),
    CENTRO_COSTO VARCHAR(20) NULL,
    CONSTRAINT FK_CONTA_ASIENTOS_LINEAS_HDR
      FOREIGN KEY (ASIENTO_ID) REFERENCES dbo.CONTA_ASIENTOS (ID)
  );

  CREATE INDEX IX_CONTA_ASIENTOS_LINEAS_ASIENTO
    ON dbo.CONTA_ASIENTOS_LINEAS (ASIENTO_ID);
END;
`.trim();

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  return roundFpago(n);
}

function strVal(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseFechaAsiento(raw) {
  const s = String(raw ?? '').trim();
  if (!s) throw httpError('La fecha es obligatoria');
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    const dia = Number(m[3]);
    const d = new Date(anio, mes - 1, dia, 12, 0, 0);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== anio || d.getMonth() !== mes - 1) {
      throw httpError('Fecha inválida');
    }
    return { fecha: d, mes, anio, iso: `${m[1]}-${m[2]}-${m[3]}` };
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw httpError('Fecha inválida');
  return {
    fecha: d,
    mes: d.getMonth() + 1,
    anio: d.getFullYear(),
    iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  };
}

function normalizeLineas(rawLines) {
  if (!Array.isArray(rawLines) || !rawLines.length) {
    throw httpError('Indique al menos dos líneas en la partida');
  }
  const lineas = rawLines
    .map((l, idx) => {
      const codcuenta = String(l?.CODCUENTA ?? l?.codcuenta ?? '').trim();
      const debe = roundMoney(l?.DEBE ?? l?.debe ?? 0);
      const haber = roundMoney(l?.HABER ?? l?.haber ?? 0);
      const centro = String(l?.CENTRO_COSTO ?? l?.centro_costo ?? '1').trim() || '1';
      return {
        ORDEN: idx + 1,
        CODCUENTA: codcuenta,
        DEBE: debe < 0 ? 0 : debe,
        HABER: haber < 0 ? 0 : haber,
        CENTRO_COSTO: centro,
      };
    })
    .filter((l) => l.CODCUENTA && (l.DEBE > 0 || l.HABER > 0));

  if (lineas.length < 2) {
    throw httpError('La partida debe tener al menos dos líneas con monto');
  }
  for (const l of lineas) {
    if (l.DEBE > 0 && l.HABER > 0) {
      throw httpError(`La cuenta ${l.CODCUENTA} no puede llevar Debe y Haber a la vez`);
    }
  }
  const sumDebe = roundMoney(lineas.reduce((s, l) => s + l.DEBE, 0));
  const sumHaber = roundMoney(lineas.reduce((s, l) => s + l.HABER, 0));
  if (sumDebe <= 0 || sumHaber <= 0) {
    throw httpError('La partida debe tener Debe y Haber mayores a cero');
  }
  if (!fpagoAmountsMatch(sumDebe, sumHaber)) {
    throw httpError(
      `La partida no cuadra: Debe ${sumDebe} ≠ Haber ${sumHaber}`
    );
  }
  return { lineas, sumDebe, sumHaber };
}

async function ensureContaAsientosTables(pool) {
  await pool.request().query(DDL_CONTA_ASIENTOS);
  await pool.request().query(DDL_CONTA_ASIENTOS_LINEAS);
}

async function nextCorrelativo(pool, sql, empnit, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT ISNULL(MAX(CORRELATIVO), 0) + 1 AS NEXT
      FROM dbo.CONTA_ASIENTOS
      WHERE EMPNIT = @EMPNIT AND ANIO = @ANIO
    `);
  return Number(result.recordset[0]?.NEXT) || 1;
}

async function assertCuentasDetalle(pool, sql, empnit, codigos) {
  const codes = [...new Set(codigos.map((c) => String(c).trim()).filter(Boolean))];
  if (!codes.length) throw httpError('Indique cuentas contables');
  const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
  const ph = codes.map((cod, i) => {
    const key = `C${i}`;
    request.input(key, sql.VarChar, cod);
    return `@${key}`;
  });
  const result = await request.query(`
    SELECT CODCUENTA, PD, ACTIVO
    FROM dbo.CONTA_CUENTAS
    WHERE EMPNIT = @EMPNIT
      AND CODCUENTA IN (${ph.join(', ')})
  `);
  const map = new Map(
    (result.recordset || []).map((r) => [String(r.CODCUENTA).trim().toUpperCase(), r])
  );
  for (const cod of codes) {
    const row = map.get(cod.toUpperCase());
    if (!row) throw httpError(`Cuenta no encontrada: ${cod}`);
    if (String(row.ACTIVO ?? 'SI').trim().toUpperCase() === 'NO') {
      throw httpError(`Cuenta inactiva: ${cod}`);
    }
    if (String(row.PD ?? '').trim().toUpperCase() === 'P') {
      throw httpError(`La cuenta ${cod} es de agrupación (padre); use una cuenta de detalle`);
    }
  }
}

async function listAsientos(pool, sql, empnit, mes, anio) {
  await ensureContaAsientosTables(pool);
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        a.ID,
        a.EMPNIT,
        a.FECHA,
        a.MES,
        a.ANIO,
        a.CORRELATIVO,
        a.GLOSA,
        a.STATUS,
        a.USUARIO,
        a.FECHA_CREACION,
        a.FECHA_MODIFICACION,
        ISNULL(SUM(l.DEBE), 0) AS TOTAL_DEBE,
        ISNULL(SUM(l.HABER), 0) AS TOTAL_HABER,
        COUNT(l.ID) AS LINEAS
      FROM dbo.CONTA_ASIENTOS a
      LEFT JOIN dbo.CONTA_ASIENTOS_LINEAS l ON l.ASIENTO_ID = a.ID
      WHERE a.EMPNIT = @EMPNIT AND a.MES = @MES AND a.ANIO = @ANIO
      GROUP BY
        a.ID, a.EMPNIT, a.FECHA, a.MES, a.ANIO, a.CORRELATIVO, a.GLOSA,
        a.STATUS, a.USUARIO, a.FECHA_CREACION, a.FECHA_MODIFICACION
      ORDER BY a.FECHA, a.CORRELATIVO, a.ID
    `);
  return (result.recordset || []).map((r) => ({
    ...r,
    TOTAL_DEBE: roundMoney(r.TOTAL_DEBE),
    TOTAL_HABER: roundMoney(r.TOTAL_HABER),
    ANULADO: String(r.STATUS ?? '').trim().toUpperCase() === 'A',
    DOC_REF: `${TIPODOC_MANUAL}-${r.CORRELATIVO}`,
  }));
}

async function getAsiento(pool, sql, empnit, id) {
  await ensureContaAsientosTables(pool);
  const header = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, id)
    .query(`
      SELECT ID, EMPNIT, FECHA, MES, ANIO, CORRELATIVO, GLOSA, STATUS, USUARIO,
             FECHA_CREACION, FECHA_MODIFICACION
      FROM dbo.CONTA_ASIENTOS
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  const row = header.recordset[0];
  if (!row) return null;
  const lines = await pool
    .request()
    .input('ASIENTO_ID', sql.Int, id)
    .query(`
      SELECT
        l.ID, l.ASIENTO_ID, l.EMPNIT, l.ORDEN, l.CODCUENTA, l.DEBE, l.HABER, l.CENTRO_COSTO,
        c.DESCRIPCION AS DESCRIPCION_CUENTA
      FROM dbo.CONTA_ASIENTOS_LINEAS l
      LEFT JOIN dbo.CONTA_CUENTAS c
        ON c.EMPNIT = l.EMPNIT AND c.CODCUENTA = l.CODCUENTA
      WHERE l.ASIENTO_ID = @ASIENTO_ID
      ORDER BY l.ORDEN, l.ID
    `);
  return {
    ...row,
    ANULADO: String(row.STATUS ?? '').trim().toUpperCase() === 'A',
    DOC_REF: `${TIPODOC_MANUAL}-${row.CORRELATIVO}`,
    LINEAS: (lines.recordset || []).map((l) => ({
      ...l,
      DEBE: roundMoney(l.DEBE),
      HABER: roundMoney(l.HABER),
    })),
  };
}

async function insertLineas(transaction, sql, empnit, asientoId, lineas) {
  for (const l of lineas) {
    await transaction
      .request()
      .input('ASIENTO_ID', sql.Int, asientoId)
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ORDEN', sql.Int, l.ORDEN)
      .input('CODCUENTA', sql.VarChar, l.CODCUENTA)
      .input('DEBE', sql.Decimal(18, 3), l.DEBE)
      .input('HABER', sql.Decimal(18, 3), l.HABER)
      .input('CENTRO_COSTO', sql.VarChar, l.CENTRO_COSTO)
      .query(`
        INSERT INTO dbo.CONTA_ASIENTOS_LINEAS
          (ASIENTO_ID, EMPNIT, ORDEN, CODCUENTA, DEBE, HABER, CENTRO_COSTO)
        VALUES
          (@ASIENTO_ID, @EMPNIT, @ORDEN, @CODCUENTA, @DEBE, @HABER, @CENTRO_COSTO)
      `);
  }
}

async function createAsiento(pool, sql, empnit, body, usuario) {
  await ensureContaAsientosTables(pool);
  const { fecha, mes, anio, iso } = parseFechaAsiento(body?.FECHA ?? body?.fecha);
  const glosa = String(body?.GLOSA ?? body?.glosa ?? '').trim();
  const { lineas } = normalizeLineas(body?.LINEAS ?? body?.lineas);
  await assertCuentasDetalle(
    pool,
    sql,
    empnit,
    lineas.map((l) => l.CODCUENTA)
  );
  const correlativo = await nextCorrelativo(pool, sql, empnit, anio);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const ins = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('FECHA', sql.DateTime, fecha)
      .input('MES', sql.Int, mes)
      .input('ANIO', sql.Int, anio)
      .input('CORRELATIVO', sql.Int, correlativo)
      .input('GLOSA', sql.NVarChar(500), glosa || null)
      .input('STATUS', sql.VarChar(1), 'O')
      .input('USUARIO', sql.VarChar(50), strVal(usuario))
      .query(`
        INSERT INTO dbo.CONTA_ASIENTOS
          (EMPNIT, FECHA, MES, ANIO, CORRELATIVO, GLOSA, STATUS, USUARIO)
        OUTPUT INSERTED.ID
        VALUES
          (@EMPNIT, @FECHA, @MES, @ANIO, @CORRELATIVO, @GLOSA, @STATUS, @USUARIO)
      `);
    const id = Number(ins.recordset[0].ID);
    await insertLineas(transaction, sql, empnit, id, lineas);
    await transaction.commit();
    return getAsiento(pool, sql, empnit, id);
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

async function updateAsiento(pool, sql, empnit, id, body, usuario) {
  await ensureContaAsientosTables(pool);
  const current = await getAsiento(pool, sql, empnit, id);
  if (!current) throw httpError('Partida no encontrada', 404);
  if (String(current.STATUS).toUpperCase() === 'A') {
    throw httpError('No se puede editar una partida anulada');
  }

  const { fecha, mes, anio } = parseFechaAsiento(body?.FECHA ?? body?.fecha ?? current.FECHA);
  const glosa = String(body?.GLOSA ?? body?.glosa ?? current.GLOSA ?? '').trim();
  const { lineas } = normalizeLineas(body?.LINEAS ?? body?.lineas ?? current.LINEAS);
  await assertCuentasDetalle(
    pool,
    sql,
    empnit,
    lineas.map((l) => l.CODCUENTA)
  );

  let correlativo = Number(current.CORRELATIVO);
  if (anio !== Number(current.ANIO)) {
    correlativo = await nextCorrelativo(pool, sql, empnit, anio);
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await transaction
      .request()
      .input('ID', sql.Int, id)
      .input('EMPNIT', sql.VarChar, empnit)
      .input('FECHA', sql.DateTime, fecha)
      .input('MES', sql.Int, mes)
      .input('ANIO', sql.Int, anio)
      .input('CORRELATIVO', sql.Int, correlativo)
      .input('GLOSA', sql.NVarChar(500), glosa || null)
      .input('USUARIO', sql.VarChar(50), strVal(usuario))
      .query(`
        UPDATE dbo.CONTA_ASIENTOS
        SET FECHA = @FECHA,
            MES = @MES,
            ANIO = @ANIO,
            CORRELATIVO = @CORRELATIVO,
            GLOSA = @GLOSA,
            USUARIO = @USUARIO,
            FECHA_MODIFICACION = GETDATE()
        WHERE EMPNIT = @EMPNIT AND ID = @ID AND STATUS = 'O'
      `);
    await transaction
      .request()
      .input('ASIENTO_ID', sql.Int, id)
      .query(`DELETE FROM dbo.CONTA_ASIENTOS_LINEAS WHERE ASIENTO_ID = @ASIENTO_ID`);
    await insertLineas(transaction, sql, empnit, id, lineas);
    await transaction.commit();
    return getAsiento(pool, sql, empnit, id);
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

async function anularAsiento(pool, sql, empnit, id, usuario) {
  await ensureContaAsientosTables(pool);
  const current = await getAsiento(pool, sql, empnit, id);
  if (!current) throw httpError('Partida no encontrada', 404);
  if (String(current.STATUS).toUpperCase() === 'A') {
    return current;
  }
  await pool
    .request()
    .input('ID', sql.Int, id)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('USUARIO', sql.VarChar(50), strVal(usuario))
    .query(`
      UPDATE dbo.CONTA_ASIENTOS
      SET STATUS = 'A',
          USUARIO = @USUARIO,
          FECHA_MODIFICACION = GETDATE()
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  return getAsiento(pool, sql, empnit, id);
}

async function deleteAsiento(pool, sql, empnit, id) {
  await ensureContaAsientosTables(pool);
  const current = await getAsiento(pool, sql, empnit, id);
  if (!current) throw httpError('Partida no encontrada', 404);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await transaction
      .request()
      .input('ASIENTO_ID', sql.Int, id)
      .query(`DELETE FROM dbo.CONTA_ASIENTOS_LINEAS WHERE ASIENTO_ID = @ASIENTO_ID`);
    await transaction
      .request()
      .input('ID', sql.Int, id)
      .input('EMPNIT', sql.VarChar, empnit)
      .query(`DELETE FROM dbo.CONTA_ASIENTOS WHERE EMPNIT = @EMPNIT AND ID = @ID`);
    await transaction.commit();
    return { ok: true, id };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * Líneas listas para concatenar en Libro Diario / Mayor / Balance.
 */
async function fetchAsientosDiarioLines(pool, sql, empnit, mes, anio, lineStart = 0) {
  await ensureContaAsientosTables(pool);
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        a.ID AS ASIENTO_ID,
        a.FECHA,
        a.CORRELATIVO,
        a.GLOSA,
        a.STATUS,
        l.ORDEN,
        l.CODCUENTA,
        l.DEBE,
        l.HABER,
        l.CENTRO_COSTO,
        c.DESCRIPCION AS DESCRIPCION_CUENTA
      FROM dbo.CONTA_ASIENTOS a
      INNER JOIN dbo.CONTA_ASIENTOS_LINEAS l ON l.ASIENTO_ID = a.ID
      LEFT JOIN dbo.CONTA_CUENTAS c
        ON c.EMPNIT = a.EMPNIT AND c.CODCUENTA = l.CODCUENTA
      WHERE a.EMPNIT = @EMPNIT AND a.MES = @MES AND a.ANIO = @ANIO
      ORDER BY a.FECHA, a.CORRELATIVO, a.ID, l.ORDEN, l.ID
    `);

  const rows = result.recordset || [];
  const asientoIds = new Set();
  const anulados = new Set();
  const lines = [];
  let lineNo = lineStart;

  for (const r of rows) {
    asientoIds.add(r.ASIENTO_ID);
    const anulado = String(r.STATUS ?? '').trim().toUpperCase() === 'A';
    if (anulado) anulados.add(r.ASIENTO_ID);
    const sign = anulado ? 0 : 1;
    const debe = roundMoney(toNumber(r.DEBE) * sign);
    const haber = roundMoney(toNumber(r.HABER) * sign);
    const docRef = `${TIPODOC_MANUAL}-${r.CORRELATIVO}`;
    const fechaIso =
      r.FECHA instanceof Date
        ? r.FECHA.toISOString()
        : String(r.FECHA ?? '');
    lineNo += 1;
    lines.push({
      DOC_ID: `ASM-${r.ASIENTO_ID}`,
      CODDOC: TIPODOC_MANUAL,
      CORRELATIVO: r.CORRELATIVO,
      DOC_REF: docRef,
      FECHA: r.FECHA,
      FECHA_SORT: fechaIso,
      TIPODOC: TIPODOC_MANUAL,
      DESDOC: 'Partida de diario manual',
      DOC_NIT: null,
      DOC_NOMCLIE: strVal(r.GLOSA),
      CONCRE: 'CON',
      TIPOPAGO: 'MANUAL',
      CODFORMATO: CODFORMATO_MANUAL,
      DESFORMATO: 'Partida manual',
      STATUS: String(r.STATUS ?? 'O').trim().toUpperCase(),
      ANULADO: anulado,
      ES_NOTA_CREDITO: false,
      LINEA: lineNo,
      CODCUENTA: r.CODCUENTA ?? null,
      DESCRIPCION_CUENTA: r.DESCRIPCION_CUENTA ?? null,
      TOKEN_DEBE: null,
      TOKEN_HABER: null,
      DEBE: debe,
      HABER: haber,
      CENTRO_COSTO: r.CENTRO_COSTO ?? '1',
    });
  }

  return {
    lines,
    nextLine: lineNo,
    asientosCount: asientoIds.size,
    anuladosCount: anulados.size,
  };
}

module.exports = {
  TIPODOC_MANUAL,
  CODFORMATO_MANUAL,
  DDL_CONTA_ASIENTOS,
  DDL_CONTA_ASIENTOS_LINEAS,
  ensureContaAsientosTables,
  listAsientos,
  getAsiento,
  createAsiento,
  updateAsiento,
  anularAsiento,
  deleteAsiento,
  fetchAsientosDiarioLines,
};
