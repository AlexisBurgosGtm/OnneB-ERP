const sql = require('mssql');
const {
  STATUS_OPERADO,
  STATUS_ANULADO,
  normalizeStatus,
  isCorteCajaCerrado,
} = require('./documento-status');

const SQL_NOTA_DATOS_GENERALES = `STATUS = '${STATUS_OPERADO}'`;

function parseCorrelativo(raw) {
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

function pickDatosGeneralesBody(body) {
  const out = {};
  if (body?.OBS !== undefined) out.OBS = String(body.OBS ?? '').trim();
  if (body?.FEL_SERIE !== undefined) out.FEL_SERIE = String(body.FEL_SERIE ?? '').trim();
  if (body?.FEL_NUMERO !== undefined) out.FEL_NUMERO = String(body.FEL_NUMERO ?? '').trim();
  if (body?.FEL_FECHA !== undefined) {
    out.FEL_FECHA = String(body.FEL_FECHA ?? '').trim().slice(0, 10);
  }
  if (body?.FEL_UUDI !== undefined) {
    out.FEL_UUDI = String(body.FEL_UUDI ?? '').trim();
  }
  if (body?.CODCAJA !== undefined && body?.CODCAJA !== null && body?.CODCAJA !== '') {
    const parsed = parseInt(body.CODCAJA, 10);
    if (Number.isNaN(parsed)) {
      const err = new Error('CODCAJA inválido');
      err.statusCode = 400;
      throw err;
    }
    out.CODCAJA = parsed;
  } else if (body?.CODCAJA === null || body?.CODCAJA === '') {
    out.CODCAJA = null;
  }
  return out;
}

/**
 * Actualiza OBS / FEL / caja sin recalcular totales ni tocar saldo CxC/CxP.
 * Permite documento en corte (CORTE=SI) si sigue operado.
 */
async function actualizarNotaDatosGenerales(pool, empnit, coddoc, correlativo, body) {
  const fields = pickDatosGeneralesBody(body || {});
  if (!Object.keys(fields).length) {
    const err = new Error('Sin campos para actualizar (OBS, FEL o CODCAJA)');
    err.statusCode = 400;
    throw err;
  }
  if (fields.FEL_FECHA && fields.FEL_FECHA && !/^\d{4}-\d{2}-\d{2}$/.test(fields.FEL_FECHA)) {
    const err = new Error('Fecha FEL inválida');
    err.statusCode = 400;
    throw err;
  }

  const metaRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT STATUS, ISNULL(CORTE, 'NO') AS CORTE,
        ISNULL(TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(PAGO, 0) AS PAGO,
        ISNULL(DOC_ABONO, 0) AS DOC_ABONO
      FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
  const meta = metaRes.recordset[0];
  if (!meta) {
    const err = new Error('Documento no encontrado');
    err.statusCode = 404;
    throw err;
  }
  const status = normalizeStatus(meta.STATUS);
  if (status === STATUS_ANULADO) {
    const err = new Error('El documento está anulado');
    err.statusCode = 409;
    throw err;
  }
  if (status !== STATUS_OPERADO) {
    const err = new Error('Solo se pueden actualizar datos de notas operadas');
    err.statusCode = 400;
    throw err;
  }

  const lineRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT COUNT(*) AS cnt FROM dbo.DOCPRODUCTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
  const lineCount = Number(lineRes.recordset[0]?.cnt) || 0;
  const total = Number(meta.TOTALPRECIO) || 0;
  if (lineCount < 1 || total <= 0) {
    const err = new Error(
      'La nota debe estar finalizada (con líneas y total) para actualizar solo datos generales'
    );
    err.statusCode = 400;
    throw err;
  }

  const req = pool.request();
  req.input('EMPNIT', sql.VarChar, empnit);
  req.input('CODDOC', sql.VarChar, coddoc);
  req.input('CORRELATIVO', sql.Decimal(18, 0), correlativo);
  const sets = [];
  if (fields.OBS !== undefined) {
    req.input('OBS', sql.VarChar, fields.OBS);
    sets.push('OBS = @OBS');
  }
  if (fields.FEL_SERIE !== undefined) {
    req.input('FEL_SERIE', sql.VarChar, fields.FEL_SERIE);
    sets.push('FEL_SERIE = @FEL_SERIE');
  }
  if (fields.FEL_NUMERO !== undefined) {
    req.input('FEL_NUMERO', sql.VarChar, fields.FEL_NUMERO);
    sets.push('FEL_NUMERO = @FEL_NUMERO');
  }
  if (fields.FEL_FECHA !== undefined) {
    req.input('FEL_FECHA', sql.VarChar, fields.FEL_FECHA || null);
    sets.push('FEL_FECHA = @FEL_FECHA');
  }
  if (fields.FEL_UUDI !== undefined) {
    req.input('FEL_UUDI', sql.VarChar, fields.FEL_UUDI || null);
    sets.push('FEL_UUDI = @FEL_UUDI');
  }
  if (fields.CODCAJA !== undefined) {
    if (fields.CODCAJA === null) {
      sets.push('CODCAJA = NULL');
    } else {
      req.input('CODCAJA', sql.Int, fields.CODCAJA);
      sets.push('CODCAJA = @CODCAJA');
    }
  }

  const upd = await req.query(`
    UPDATE dbo.DOCUMENTOS
    SET ${sets.join(', ')}
    WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      AND ${SQL_NOTA_DATOS_GENERALES}
  `);
  if (!(upd.rowsAffected?.[0] > 0)) {
    const err = new Error('No se pudo actualizar el documento');
    err.statusCode = 409;
    throw err;
  }

  return {
    ok: true,
    soloDatos: true,
    enCorte: isCorteCajaCerrado(meta.CORTE),
  };
}

module.exports = {
  actualizarNotaDatosGenerales,
  pickDatosGeneralesBody,
  SQL_NOTA_DATOS_GENERALES,
  parseCorrelativo,
};
