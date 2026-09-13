/**
 * Registros manuales de Libro Ventas / Libro Compras (sin DOCUMENTOS).
 * Para agencias contables: alimentan los libros fiscales; la operatoria documental no cambia.
 */
const { roundFpago } = require('./fpago-match');

const LIBRO_VENTAS = 'V';
const LIBRO_COMPRAS = 'C';

const TIPODOCS_VENTAS = ['FEF', 'FEC', 'FES', 'FNC'];
const TIPODOCS_COMPRAS = ['COM', 'COP', 'DVP'];

const DESDOC_BY_TIPO = {
  FEF: 'Factura electrónica',
  FEC: 'Factura cambiaria electrónica',
  FES: 'Factura especial electrónica',
  FNC: 'Nota de crédito',
  COM: 'Compra',
  COP: 'Compra pequeño contribuyente',
  DVP: 'Nota de crédito proveedor',
};

const DDL_CONTA_LIBROS_MANUAL = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'CONTA_LIBROS_MANUAL' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.CONTA_LIBROS_MANUAL (
    ID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    EMPNIT VARCHAR(20) NOT NULL,
    LIBRO VARCHAR(1) NOT NULL,
    FECHA DATETIME NOT NULL,
    MES INT NOT NULL,
    ANIO INT NOT NULL,
    CORRELATIVO INT NOT NULL,
    TIPODOC VARCHAR(10) NOT NULL,
    SERIE VARCHAR(50) NULL,
    NUMERO VARCHAR(50) NULL,
    NIT VARCHAR(30) NULL,
    NOMBRE NVARCHAR(200) NULL,
    TOTAL_PRODUCTOS DECIMAL(18, 3) NOT NULL CONSTRAINT DF_CONTA_LIBROS_MANUAL_TP DEFAULT (0),
    TOTAL_SERVICIOS DECIMAL(18, 3) NOT NULL CONSTRAINT DF_CONTA_LIBROS_MANUAL_TS DEFAULT (0),
    TOTALEXENTO DECIMAL(18, 3) NOT NULL CONSTRAINT DF_CONTA_LIBROS_MANUAL_EX DEFAULT (0),
    TOTALSINIVA DECIMAL(18, 3) NOT NULL CONSTRAINT DF_CONTA_LIBROS_MANUAL_BI DEFAULT (0),
    TOTALIVA DECIMAL(18, 3) NOT NULL CONSTRAINT DF_CONTA_LIBROS_MANUAL_IV DEFAULT (0),
    GLOSA NVARCHAR(500) NULL,
    STATUS VARCHAR(1) NOT NULL CONSTRAINT DF_CONTA_LIBROS_MANUAL_ST DEFAULT ('O'),
    USUARIO VARCHAR(50) NULL,
    FECHA_CREACION DATETIME NOT NULL CONSTRAINT DF_CONTA_LIBROS_MANUAL_FC DEFAULT (GETDATE()),
    FECHA_MODIFICACION DATETIME NULL
  );

  CREATE UNIQUE INDEX UQ_CONTA_LIBROS_MANUAL_EMP_LIB_ANIO_CORR
    ON dbo.CONTA_LIBROS_MANUAL (EMPNIT, LIBRO, ANIO, CORRELATIVO);

  CREATE INDEX IX_CONTA_LIBROS_MANUAL_EMP_LIB_MES_ANIO
    ON dbo.CONTA_LIBROS_MANUAL (EMPNIT, LIBRO, MES, ANIO);
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

function normalizeLibro(raw) {
  const l = String(raw ?? '').trim().toUpperCase();
  if (l === 'V' || l === 'VENTAS') return LIBRO_VENTAS;
  if (l === 'C' || l === 'COMPRAS') return LIBRO_COMPRAS;
  throw httpError('LIBRO inválido (V o C)');
}

function tipodocsForLibro(libro) {
  return libro === LIBRO_VENTAS ? TIPODOCS_VENTAS : TIPODOCS_COMPRAS;
}

function normalizeTipodoc(libro, raw) {
  const t = String(raw ?? '').trim().toUpperCase();
  const allowed = tipodocsForLibro(libro);
  if (!allowed.includes(t)) {
    throw httpError(`TIPODOC inválido para este libro. Use: ${allowed.join(', ')}`);
  }
  return t;
}

function parseFecha(raw) {
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
    return {
      fecha: d,
      mes,
      anio,
      iso: `${m[1]}-${m[2]}-${m[3]}`,
    };
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

function normalizeMontos(_tipodoc, body) {
  const totalProductos = Math.max(0, roundMoney(body?.TOTAL_PRODUCTOS ?? body?.totalProductos ?? 0));
  const totalServicios = Math.max(0, roundMoney(body?.TOTAL_SERVICIOS ?? body?.totalServicios ?? 0));
  const totalExento = Math.max(0, roundMoney(body?.TOTALEXENTO ?? body?.totalExento ?? 0));

  if (totalProductos <= 0 && totalServicios <= 0 && totalExento <= 0) {
    throw httpError('Indique al menos un monto (productos, servicios o exento)');
  }

  return {
    TOTAL_PRODUCTOS: totalProductos,
    TOTAL_SERVICIOS: totalServicios,
    TOTALEXENTO: totalExento,
    TOTALSINIVA: 0,
    TOTALIVA: 0,
  };
}

async function ensureContaLibrosManualTable(pool) {
  await pool.request().query(DDL_CONTA_LIBROS_MANUAL);
}

async function nextCorrelativo(pool, sql, empnit, libro, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('LIBRO', sql.VarChar(1), libro)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT ISNULL(MAX(CORRELATIVO), 0) + 1 AS NEXT
      FROM dbo.CONTA_LIBROS_MANUAL
      WHERE EMPNIT = @EMPNIT AND LIBRO = @LIBRO AND ANIO = @ANIO
    `);
  return Number(result.recordset[0]?.NEXT) || 1;
}

function mapDbRow(r) {
  return {
    ...r,
    TOTAL_PRODUCTOS: roundMoney(r.TOTAL_PRODUCTOS),
    TOTAL_SERVICIOS: roundMoney(r.TOTAL_SERVICIOS),
    TOTALEXENTO: roundMoney(r.TOTALEXENTO),
    TOTALSINIVA: roundMoney(r.TOTALSINIVA),
    TOTALIVA: roundMoney(r.TOTALIVA),
    ANULADO: String(r.STATUS ?? '').trim().toUpperCase() === 'A',
    DESDOC: DESDOC_BY_TIPO[String(r.TIPODOC || '').toUpperCase()] || r.TIPODOC,
    DOC_REF: `${r.SERIE || 'MAN'}-${r.NUMERO || r.CORRELATIVO}`,
  };
}

async function listManual(pool, sql, empnit, libro, mes, anio) {
  await ensureContaLibrosManualTable(pool);
  const lib = normalizeLibro(libro);
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('LIBRO', sql.VarChar(1), lib)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT *
      FROM dbo.CONTA_LIBROS_MANUAL
      WHERE EMPNIT = @EMPNIT AND LIBRO = @LIBRO AND MES = @MES AND ANIO = @ANIO
      ORDER BY FECHA, CORRELATIVO, ID
    `);
  return (result.recordset || []).map(mapDbRow);
}

async function getManual(pool, sql, empnit, id) {
  await ensureContaLibrosManualTable(pool);
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, id)
    .query(`SELECT * FROM dbo.CONTA_LIBROS_MANUAL WHERE EMPNIT = @EMPNIT AND ID = @ID`);
  const row = result.recordset[0];
  return row ? mapDbRow(row) : null;
}

function payloadFromBody(libro, body) {
  const lib = normalizeLibro(libro);
  const tipodoc = normalizeTipodoc(lib, body?.TIPODOC ?? body?.tipodoc);
  const { fecha, mes, anio, iso } = parseFecha(body?.FECHA ?? body?.fecha);
  const montos = normalizeMontos(tipodoc, body);
  return {
    LIBRO: lib,
    tipodoc,
    fecha,
    mes,
    anio,
    iso,
    SERIE: strVal(body?.SERIE ?? body?.serie),
    NUMERO: strVal(body?.NUMERO ?? body?.numero),
    NIT: strVal(body?.NIT ?? body?.nit),
    NOMBRE: strVal(body?.NOMBRE ?? body?.nombre ?? body?.DOC_NOMCLIE),
    GLOSA: strVal(body?.GLOSA ?? body?.glosa),
    ...montos,
  };
}

async function createManual(pool, sql, empnit, libro, body, usuario) {
  await ensureContaLibrosManualTable(pool);
  const p = payloadFromBody(libro, body);
  const correlativo = await nextCorrelativo(pool, sql, empnit, p.LIBRO, p.anio);
  const ins = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('LIBRO', sql.VarChar(1), p.LIBRO)
    .input('FECHA', sql.DateTime, p.fecha)
    .input('MES', sql.Int, p.mes)
    .input('ANIO', sql.Int, p.anio)
    .input('CORRELATIVO', sql.Int, correlativo)
    .input('TIPODOC', sql.VarChar(10), p.tipodoc)
    .input('SERIE', sql.VarChar(50), p.SERIE)
    .input('NUMERO', sql.VarChar(50), p.NUMERO)
    .input('NIT', sql.VarChar(30), p.NIT)
    .input('NOMBRE', sql.NVarChar(200), p.NOMBRE)
    .input('TOTAL_PRODUCTOS', sql.Decimal(18, 3), p.TOTAL_PRODUCTOS)
    .input('TOTAL_SERVICIOS', sql.Decimal(18, 3), p.TOTAL_SERVICIOS)
    .input('TOTALEXENTO', sql.Decimal(18, 3), p.TOTALEXENTO)
    .input('TOTALSINIVA', sql.Decimal(18, 3), p.TOTALSINIVA)
    .input('TOTALIVA', sql.Decimal(18, 3), p.TOTALIVA)
    .input('GLOSA', sql.NVarChar(500), p.GLOSA)
    .input('STATUS', sql.VarChar(1), 'O')
    .input('USUARIO', sql.VarChar(50), strVal(usuario))
    .query(`
      INSERT INTO dbo.CONTA_LIBROS_MANUAL (
        EMPNIT, LIBRO, FECHA, MES, ANIO, CORRELATIVO, TIPODOC, SERIE, NUMERO, NIT, NOMBRE,
        TOTAL_PRODUCTOS, TOTAL_SERVICIOS, TOTALEXENTO, TOTALSINIVA, TOTALIVA, GLOSA, STATUS, USUARIO
      )
      OUTPUT INSERTED.ID
      VALUES (
        @EMPNIT, @LIBRO, @FECHA, @MES, @ANIO, @CORRELATIVO, @TIPODOC, @SERIE, @NUMERO, @NIT, @NOMBRE,
        @TOTAL_PRODUCTOS, @TOTAL_SERVICIOS, @TOTALEXENTO, @TOTALSINIVA, @TOTALIVA, @GLOSA, @STATUS, @USUARIO
      )
    `);
  return getManual(pool, sql, empnit, Number(ins.recordset[0].ID));
}

async function updateManual(pool, sql, empnit, id, body, usuario) {
  await ensureContaLibrosManualTable(pool);
  const current = await getManual(pool, sql, empnit, id);
  if (!current) throw httpError('Registro no encontrado', 404);
  if (String(current.STATUS).toUpperCase() === 'A') {
    throw httpError('No se puede editar un registro anulado');
  }
  const p = payloadFromBody(current.LIBRO, { ...current, ...body, TIPODOC: body?.TIPODOC ?? current.TIPODOC });
  let correlativo = Number(current.CORRELATIVO);
  if (p.anio !== Number(current.ANIO) || p.LIBRO !== current.LIBRO) {
    correlativo = await nextCorrelativo(pool, sql, empnit, p.LIBRO, p.anio);
  }
  await pool
    .request()
    .input('ID', sql.Int, id)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('FECHA', sql.DateTime, p.fecha)
    .input('MES', sql.Int, p.mes)
    .input('ANIO', sql.Int, p.anio)
    .input('CORRELATIVO', sql.Int, correlativo)
    .input('TIPODOC', sql.VarChar(10), p.tipodoc)
    .input('SERIE', sql.VarChar(50), p.SERIE)
    .input('NUMERO', sql.VarChar(50), p.NUMERO)
    .input('NIT', sql.VarChar(30), p.NIT)
    .input('NOMBRE', sql.NVarChar(200), p.NOMBRE)
    .input('TOTAL_PRODUCTOS', sql.Decimal(18, 3), p.TOTAL_PRODUCTOS)
    .input('TOTAL_SERVICIOS', sql.Decimal(18, 3), p.TOTAL_SERVICIOS)
    .input('TOTALEXENTO', sql.Decimal(18, 3), p.TOTALEXENTO)
    .input('TOTALSINIVA', sql.Decimal(18, 3), p.TOTALSINIVA)
    .input('TOTALIVA', sql.Decimal(18, 3), p.TOTALIVA)
    .input('GLOSA', sql.NVarChar(500), p.GLOSA)
    .input('USUARIO', sql.VarChar(50), strVal(usuario))
    .query(`
      UPDATE dbo.CONTA_LIBROS_MANUAL
      SET FECHA = @FECHA, MES = @MES, ANIO = @ANIO, CORRELATIVO = @CORRELATIVO,
          TIPODOC = @TIPODOC, SERIE = @SERIE, NUMERO = @NUMERO, NIT = @NIT, NOMBRE = @NOMBRE,
          TOTAL_PRODUCTOS = @TOTAL_PRODUCTOS, TOTAL_SERVICIOS = @TOTAL_SERVICIOS,
          TOTALEXENTO = @TOTALEXENTO, TOTALSINIVA = @TOTALSINIVA, TOTALIVA = @TOTALIVA,
          GLOSA = @GLOSA, USUARIO = @USUARIO, FECHA_MODIFICACION = GETDATE()
      WHERE EMPNIT = @EMPNIT AND ID = @ID AND STATUS = 'O'
    `);
  return getManual(pool, sql, empnit, id);
}

async function anularManual(pool, sql, empnit, id, usuario) {
  await ensureContaLibrosManualTable(pool);
  const current = await getManual(pool, sql, empnit, id);
  if (!current) throw httpError('Registro no encontrado', 404);
  if (String(current.STATUS).toUpperCase() === 'A') return current;
  await pool
    .request()
    .input('ID', sql.Int, id)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('USUARIO', sql.VarChar(50), strVal(usuario))
    .query(`
      UPDATE dbo.CONTA_LIBROS_MANUAL
      SET STATUS = 'A', USUARIO = @USUARIO, FECHA_MODIFICACION = GETDATE()
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  return getManual(pool, sql, empnit, id);
}

async function deleteManual(pool, sql, empnit, id) {
  await ensureContaLibrosManualTable(pool);
  const current = await getManual(pool, sql, empnit, id);
  if (!current) throw httpError('Registro no encontrado', 404);
  await pool
    .request()
    .input('ID', sql.Int, id)
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`DELETE FROM dbo.CONTA_LIBROS_MANUAL WHERE EMPNIT = @EMPNIT AND ID = @ID`);
  return { ok: true, id };
}

/**
 * Filas crudas compatibles con mapLibroVentasRow / mapLibroComprasRow.
 */
async function fetchManualAsLibroRaw(pool, sql, empnit, mes, anio, libro) {
  await ensureContaLibrosManualTable(pool);
  const lib = normalizeLibro(libro);
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('LIBRO', sql.VarChar(1), lib)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT *
      FROM dbo.CONTA_LIBROS_MANUAL
      WHERE EMPNIT = @EMPNIT AND LIBRO = @LIBRO AND MES = @MES AND ANIO = @ANIO
      ORDER BY FECHA, CORRELATIVO, ID
    `);

  return (result.recordset || []).map((r) => {
    const tipodoc = String(r.TIPODOC || '').trim().toUpperCase();
    const totalProd = toNumber(r.TOTAL_PRODUCTOS);
    const totalServ = toNumber(r.TOTAL_SERVICIOS);
    const fechaIso =
      r.FECHA instanceof Date
        ? `${r.FECHA.getFullYear()}-${String(r.FECHA.getMonth() + 1).padStart(2, '0')}-${String(r.FECHA.getDate()).padStart(2, '0')}`
        : String(r.FECHA || '').slice(0, 10);
    return {
      ID: `MAN-${r.ID}`,
      CODDOC: 'MAN',
      CORRELATIVO: r.CORRELATIVO,
      FEL_SERIE: r.SERIE,
      FEL_NUMERO: r.NUMERO,
      SERIEFAC: r.SERIE,
      NOFAC: r.NUMERO,
      FEL_FECHA: fechaIso,
      FECHA: r.FECHA,
      DOC_NIT: r.NIT,
      DOC_NOMCLIE: r.NOMBRE || r.GLOSA,
      TOTALEXENTO: toNumber(r.TOTALEXENTO),
      TOTALSINIVA: toNumber(r.TOTALSINIVA),
      TOTALIVA: toNumber(r.TOTALIVA),
      TOTALPRECIO: roundMoney(totalProd + totalServ),
      TOTALCOSTO: roundMoney(totalProd + totalServ),
      STATUS: String(r.STATUS || 'O').trim().toUpperCase(),
      TIPODOC: tipodoc,
      DESDOC: DESDOC_BY_TIPO[tipodoc] || tipodoc,
      LINEAS: 1,
      TOTAL_PRODUCTOS_RAW: totalProd,
      TOTAL_SERVICIOS_RAW: totalServ,
      MANUAL: true,
    };
  });
}

function sortKeyFecha(row) {
  const raw = row?.FEL_FECHA || row?.FECHA;
  if (raw == null || raw === '') return '';
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return s;
}

function sortKeyId(row) {
  const id = row?.ID;
  if (typeof id === 'number' && Number.isFinite(id)) return id;
  const s = String(id ?? '').trim();
  const m = s.match(/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function sortLibroRawRows(rows) {
  return [...rows].sort((a, b) => {
    const fa = sortKeyFecha(a);
    const fb = sortKeyFecha(b);
    if (fa !== fb) return fa < fb ? -1 : 1;
    const ia = sortKeyId(a);
    const ib = sortKeyId(b);
    if (ia !== ib) return ia - ib;
    return 0;
  });
}

module.exports = {
  LIBRO_VENTAS,
  LIBRO_COMPRAS,
  TIPODOCS_VENTAS,
  TIPODOCS_COMPRAS,
  DESDOC_BY_TIPO,
  DDL_CONTA_LIBROS_MANUAL,
  ensureContaLibrosManualTable,
  normalizeLibro,
  tipodocsForLibro,
  listManual,
  getManual,
  createManual,
  updateManual,
  anularManual,
  deleteManual,
  fetchManualAsLibroRaw,
  sortLibroRawRows,
};
