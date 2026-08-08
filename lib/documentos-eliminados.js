const sql = require('mssql');
const { fechaIsoFromRow, fechaIsoFromValue } = require('./documento-fecha');

const CREATE_TABLE_SQL = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'DOCUMENTOS_ELIMINADOS' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.DOCUMENTOS_ELIMINADOS (
    ID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    EMPNIT VARCHAR(20) NOT NULL,
    CODDOC VARCHAR(50) NOT NULL,
    CORRELATIVO DECIMAL(18, 0) NOT NULL,
    TIPODOC VARCHAR(10) NULL,
    FECHA_DOC DATE NULL,
    FECHA_ELIMINACION DATETIME NOT NULL CONSTRAINT DF_DOCUMENTOS_ELIMINADOS_FECHA DEFAULT (GETDATE()),
    USUARIO VARCHAR(50) NULL,
    MOTIVO NVARCHAR(255) NULL,
    PAYLOAD NVARCHAR(MAX) NOT NULL
  );

  CREATE INDEX IX_DOCUMENTOS_ELIMINADOS_EMP_FECHA
    ON dbo.DOCUMENTOS_ELIMINADOS (EMPNIT, FECHA_ELIMINACION DESC);

  CREATE INDEX IX_DOCUMENTOS_ELIMINADOS_EMP_DOC
    ON dbo.DOCUMENTOS_ELIMINADOS (EMPNIT, CODDOC, CORRELATIVO);
END;
`;

let tableEnsured = false;

function usuarioFromReq(req, fallback = 'SYSTEM') {
  const raw =
    req?.body?.USUARIO ??
    req?.body?.usuario ??
    req?.headers?.['x-user'] ??
    req?.query?.usuario ??
    '';
  const u = String(raw || '').trim().slice(0, 50);
  return u || fallback;
}

function serializeSqlValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }
  if (typeof value === 'object') {
    if (typeof value.toNumber === 'function') {
      try {
        return value.toNumber();
      } catch {
        return Number(value);
      }
    }
    if (Buffer.isBuffer(value)) return value.toString('base64');
  }
  return value;
}

function rowToPlain(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = serializeSqlValue(value);
  }
  return out;
}

async function ensureTable(pool) {
  if (tableEnsured) return;
  await pool.request().query(CREATE_TABLE_SQL);
  tableEnsured = true;
}

/**
 * Carga encabezado + líneas y los inserta en DOCUMENTOS_ELIMINADOS (misma transacción).
 */
async function archiveDocumentoSnapshot(transaction, { empnit, coddoc, correlativo, tipodoc, usuario, motivo }) {
  const headerRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT d.*, t.DESDOC, t.TIPODOC
      FROM dbo.DOCUMENTOS d
      LEFT JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);

  const headerRow = headerRes.recordset[0];
  if (!headerRow) return null;

  const linesRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT *
      FROM dbo.DOCPRODUCTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      ORDER BY Id
    `);

  const header = rowToPlain(headerRow);
  const lines = (linesRes.recordset || []).map(rowToPlain);
  const resolvedTipodoc = String(
    tipodoc || header.TIPODOC || ''
  )
    .trim()
    .toUpperCase()
    .slice(0, 10);
  const fechaDocIso = fechaIsoFromRow(headerRow) || null;
  const payload = JSON.stringify({
    header,
    lines,
    meta: {
      archivedAt: new Date().toISOString(),
      usuario: String(usuario || '').trim().slice(0, 50) || null,
      motivo: String(motivo || '').trim().slice(0, 255) || null,
      tipodoc: resolvedTipodoc || null,
      linesCount: lines.length,
    },
  });

  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('TIPODOC', sql.VarChar, resolvedTipodoc || null)
    .input('FECHA_DOC', sql.Date, fechaDocIso || null)
    .input('USUARIO', sql.VarChar, String(usuario || '').trim().slice(0, 50) || null)
    .input('MOTIVO', sql.NVarChar(255), String(motivo || '').trim().slice(0, 255) || null)
    .input('PAYLOAD', sql.NVarChar(sql.MAX), payload)
    .query(`
      INSERT INTO dbo.DOCUMENTOS_ELIMINADOS
        (EMPNIT, CODDOC, CORRELATIVO, TIPODOC, FECHA_DOC, FECHA_ELIMINACION, USUARIO, MOTIVO, PAYLOAD)
      VALUES
        (@EMPNIT, @CODDOC, @CORRELATIVO, @TIPODOC, @FECHA_DOC, GETDATE(), @USUARIO, @MOTIVO, @PAYLOAD)
    `);

  return { tipodoc: resolvedTipodoc, fechaDocIso, linesCount: lines.length };
}

function mapListRow(r) {
  if (!r) return null;
  return {
    ID: r.ID,
    EMPNIT: r.EMPNIT,
    CODDOC: r.CODDOC,
    CORRELATIVO: r.CORRELATIVO,
    TIPODOC: String(r.TIPODOC || '').trim().toUpperCase(),
    FECHA_DOC: fechaIsoFromValue(r.FECHA_DOC) || null,
    FECHA_ELIMINACION: r.FECHA_ELIMINACION || null,
    USUARIO: r.USUARIO || null,
    MOTIVO: r.MOTIVO || null,
    DOC_NOMCLIE: r.DOC_NOMCLIE || null,
    TOTALPRECIO: r.TOTALPRECIO != null ? Number(r.TOTALPRECIO) : null,
    DESDOC: r.DESDOC || null,
    LINEAS: r.LINEAS != null ? Number(r.LINEAS) : null,
  };
}

async function listDocumentosEliminados(pool, { empnit, mes, anio, q, limit = 500 }) {
  await ensureTable(pool);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 2000);
  const like = q ? `%${q}%` : null;

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .input('Q', sql.NVarChar(200), like)
    .input('LIMIT', sql.Int, lim)
    .query(`
      SELECT TOP (@LIMIT)
        e.ID,
        e.EMPNIT,
        e.CODDOC,
        e.CORRELATIVO,
        e.TIPODOC,
        e.FECHA_DOC,
        e.FECHA_ELIMINACION,
        e.USUARIO,
        e.MOTIVO,
        JSON_VALUE(e.PAYLOAD, '$.header.DOC_NOMCLIE') AS DOC_NOMCLIE,
        TRY_CAST(JSON_VALUE(e.PAYLOAD, '$.header.TOTALPRECIO') AS DECIMAL(18, 4)) AS TOTALPRECIO,
        JSON_VALUE(e.PAYLOAD, '$.header.DESDOC') AS DESDOC,
        (
          SELECT COUNT(1)
          FROM OPENJSON(e.PAYLOAD, '$.lines')
        ) AS LINEAS
      FROM dbo.DOCUMENTOS_ELIMINADOS e
      WHERE e.EMPNIT = @EMPNIT
        AND MONTH(e.FECHA_ELIMINACION) = @MES
        AND YEAR(e.FECHA_ELIMINACION) = @ANIO
        AND (
          @Q IS NULL
          OR e.CODDOC LIKE @Q
          OR CAST(e.CORRELATIVO AS VARCHAR(30)) LIKE @Q
          OR ISNULL(e.TIPODOC, '') LIKE @Q
          OR ISNULL(e.USUARIO, '') LIKE @Q
          OR ISNULL(e.MOTIVO, '') LIKE @Q
          OR ISNULL(JSON_VALUE(e.PAYLOAD, '$.header.DOC_NOMCLIE'), '') LIKE @Q
          OR ISNULL(JSON_VALUE(e.PAYLOAD, '$.header.DESDOC'), '') LIKE @Q
        )
      ORDER BY e.FECHA_ELIMINACION DESC, e.ID DESC
    `);

  return (result.recordset || []).map(mapListRow);
}

async function getDocumentoEliminadoById(pool, { empnit, id }) {
  await ensureTable(pool);
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, id)
    .query(`
      SELECT
        ID, EMPNIT, CODDOC, CORRELATIVO, TIPODOC, FECHA_DOC,
        FECHA_ELIMINACION, USUARIO, MOTIVO, PAYLOAD
      FROM dbo.DOCUMENTOS_ELIMINADOS
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  const row = result.recordset[0];
  if (!row) return null;

  let payload = null;
  try {
    payload = row.PAYLOAD ? JSON.parse(row.PAYLOAD) : null;
  } catch {
    payload = { raw: row.PAYLOAD };
  }

  return {
    ...mapListRow(row),
    PAYLOAD: payload,
  };
}

module.exports = {
  CREATE_TABLE_SQL,
  ensureTable,
  usuarioFromReq,
  archiveDocumentoSnapshot,
  listDocumentosEliminados,
  getDocumentoEliminadoById,
};
