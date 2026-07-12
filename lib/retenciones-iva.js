const sql = require('mssql');
const { nowParts, parseFechaInput, fechaIsoFromRow } = require('./documento-fecha');
const { STATUS_OPERADO, SQL_DOCUMENTO_EDITABLE } = require('./documento-status');
const { RTV_CODDOC, RTV_TIPODOC, ensureRetencionesIvaSetup } = require('./retenciones-iva-setup');

const CODEMBARQUE_RTV = 'RTV';

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseCorrelativo(raw) {
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

async function allocateCorrelativo(transaction, empnit, coddoc) {
  const tipoRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT CORRELATIVO FROM dbo.TIPODOCUMENTOS WITH (UPDLOCK, ROWLOCK)
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const maxRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT ISNULL(MAX(CORRELATIVO), 0) AS maxCorr FROM dbo.DOCUMENTOS WITH (UPDLOCK, HOLDLOCK)
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const next = Math.max(Number(tipoRes.recordset[0]?.CORRELATIVO) || 0, Number(maxRes.recordset[0]?.maxCorr) || 0) + 1;
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORR', sql.Decimal(18, 0), next)
    .query(`
      UPDATE dbo.TIPODOCUMENTOS SET CORRELATIVO = @CORR
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  return next;
}

async function getTipoDocRtv(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, RTV_CODDOC)
    .query(`
      SELECT CODDOC, DESDOC, TIPODOC, CORRELATIVO, CODFORMATOCON, CODFORMATOCRE, CONTABLE
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND TIPODOC = '${RTV_TIPODOC}' AND ACTIVO = 'SI'
    `);
  return result.recordset[0] || null;
}

async function getProveedorSnapshot(pool, empnit, codprov) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROV', sql.Int, codprov)
    .query(`
      SELECT CODPROV, NIT, EMPRESA, RAZONSOCIAL, DIRECCION
      FROM dbo.PROVEEDORES
      WHERE EMPNIT = @EMPNIT AND CODPROV = @CODPROV
    `);
  return result.recordset[0] || null;
}

function proveedorDisplayName(prov) {
  if (!prov) return '';
  return String(prov.EMPRESA || prov.RAZONSOCIAL || '').trim();
}

function mapDocumentoRow(row) {
  return {
    ID: row.ID ?? null,
    FECHA: fechaIsoFromRow(row),
    ANIO: row.ANIO ?? null,
    MES: row.MES ?? null,
    DIA: row.DIA ?? null,
    CODDOC: row.CODDOC ?? null,
    DESDOC: row.DESDOC ?? null,
    CORRELATIVO: row.CORRELATIVO ?? null,
    DOC_NIT: row.DOC_NIT ?? null,
    DOC_NOMCLIE: row.DOC_NOMCLIE ?? null,
    CODPROV: row.CODCLIENTE ?? null,
    SERIEFAC: row.SERIEFAC ?? null,
    NOFAC: row.NOFAC ?? null,
    TOTALSINIVA: roundMoney(row.TOTALSINIVA),
    TOTALIVA: roundMoney(row.TOTALIVA),
    TOTALPRECIO: roundMoney(row.TOTALPRECIO),
    CONCRE: row.CONCRE ?? 'CON',
    TIPOPAGO: row.TIPOPAGO ?? 'CONTADO',
    OBS: row.OBS ?? null,
    STATUS: row.STATUS ?? null,
    FEL_UUDI: row.FEL_UUDI ?? null,
    FINALIZADO: String(row.SERIEFAC ?? '').trim() !== '' && String(row.NOFAC ?? '').trim() !== '',
  };
}

async function loadDocumento(pool, empnit, coddoc, correlativo) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT d.*, t.DESDOC, t.TIPODOC
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);
  const row = result.recordset[0];
  if (!row) return null;
  return mapDocumentoRow(row);
}

async function listRetencionesIva(pool, empnit, mes, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT d.*, t.DESDOC, t.TIPODOC
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND d.MES = @MES
        AND d.ANIO = @ANIO
        AND t.TIPODOC = '${RTV_TIPODOC}'
      ORDER BY d.FECHA DESC, d.CORRELATIVO DESC
    `);
  return result.recordset.map(mapDocumentoRow);
}

async function createRetencionIva(pool, empnit, body) {
  await ensureRetencionesIvaSetup(pool, empnit);
  const tipo = await getTipoDocRtv(pool, empnit);
  if (!tipo) {
    const err = new Error('Tipo de documento RTV no configurado');
    err.statusCode = 400;
    throw err;
  }
  const codprov = parseInt(body?.CODPROV, 10);
  let proveedor = null;
  if (!Number.isNaN(codprov)) proveedor = await getProveedorSnapshot(pool, empnit, codprov);
  if (!proveedor) proveedor = await getProveedorSnapshot(pool, empnit, 1);
  if (!proveedor) {
    const err = new Error('No hay proveedor disponible');
    err.statusCode = 400;
    throw err;
  }

  const parts = nowParts();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const correlativo = await allocateCorrelativo(transaction, empnit, RTV_CODDOC);
    const nom = proveedorDisplayName(proveedor) || 'PROVEEDOR';
    const usuario = String(body?.USUARIO || 'SISTEMA').trim();
    const obs = String(body?.OBS || '').trim();
    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ANIO', sql.Int, parts.anio)
      .input('MES', sql.Int, parts.mes)
      .input('DIA', sql.Int, parts.dia)
      .input('FECHA', sql.Date, parts.fecha)
      .input('HORA', sql.Int, parts.hora)
      .input('MINUTO', sql.Int, parts.minuto)
      .input('CODDOC', sql.VarChar, RTV_CODDOC)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .input('CODCLIENTE', sql.Int, proveedor.CODPROV)
      .input('DOC_NIT', sql.VarChar, String(proveedor.NIT || 'CF'))
      .input('DOC_NOMCLIE', sql.VarChar, nom)
      .input('DOC_DIRCLIE', sql.VarChar, String(proveedor.DIRECCION || 'SN'))
      .input('USUARIO', sql.VarChar, usuario)
      .input('OBS', sql.VarChar, obs)
      .query(`
        INSERT INTO dbo.DOCUMENTOS (
          EMPNIT, ANIO, MES, DIA, FECHA, HORA, MINUTO, CODDOC, CORRELATIVO,
          CODCLIENTE, DOC_NIT, DOC_NOMCLIE, DOC_DIRCLIE,
          TOTALCOSTO, TOTALPRECIO, CODEMBARQUE, STATUS, USUARIO, CONCRE, CORTE,
          MARCA, OBS, DOC_SALDO, DOC_ABONO, OBSMARCA, TOTALDESCUENTO, CODCAJA,
          DIRENTREGA, NOGUIA, VALORENTREGA, TOTALEXENTO, TIPOPAGO, NODOCPAGO,
          VENCIMIENTO, DIASCREDITO, TOTALIVA, TOTALSINIVA, PAGO, VUELTO
        ) VALUES (
          @EMPNIT, @ANIO, @MES, @DIA, @FECHA, @HORA, @MINUTO, @CODDOC, @CORRELATIVO,
          @CODCLIENTE, @DOC_NIT, @DOC_NOMCLIE, @DOC_DIRCLIE,
          0, 0, '${CODEMBARQUE_RTV}', '${STATUS_OPERADO}', @USUARIO, 'CON', 'NO',
          'SN', @OBS, 0, 0, 'SN', 0, 1,
          'SN', 'SN', 0, 0, 'CONTADO', 'SN',
          @FECHA, 0, 0, 0, 0, 0
        )
      `);
    await transaction.commit();
    return loadDocumento(pool, empnit, RTV_CODDOC, correlativo);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function updateRetencionIva(pool, empnit, coddoc, correlativo, body) {
  const updates = [];
  const request = pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo);

  if (body?.CODPROV !== undefined) {
    const codprov = parseInt(body.CODPROV, 10);
    if (Number.isNaN(codprov)) {
      const err = new Error('CODPROV inválido');
      err.statusCode = 400;
      throw err;
    }
    const proveedor = await getProveedorSnapshot(pool, empnit, codprov);
    if (!proveedor) {
      const err = new Error('Proveedor no encontrado');
      err.statusCode = 404;
      throw err;
    }
    request.input('CODCLIENTE', sql.Int, proveedor.CODPROV);
    request.input('DOC_NIT', sql.VarChar, String(proveedor.NIT || 'CF'));
    request.input('DOC_NOMCLIE', sql.VarChar, proveedorDisplayName(proveedor));
    request.input('DOC_DIRCLIE', sql.VarChar, String(proveedor.DIRECCION || 'SN'));
    updates.push(
      'CODCLIENTE = @CODCLIENTE',
      'DOC_NIT = @DOC_NIT',
      'DOC_NOMCLIE = @DOC_NOMCLIE',
      'DOC_DIRCLIE = @DOC_DIRCLIE'
    );
  }

  if (body?.OBS !== undefined) {
    request.input('OBS', sql.VarChar, String(body.OBS || ''));
    updates.push('OBS = @OBS');
  }
  if (body?.SERIEFAC !== undefined) {
    request.input('SERIEFAC', sql.VarChar, String(body.SERIEFAC || '').trim());
    updates.push('SERIEFAC = @SERIEFAC');
  }
  if (body?.NOFAC !== undefined) {
    request.input('NOFAC', sql.VarChar, String(body.NOFAC || '').trim());
    updates.push('NOFAC = @NOFAC');
  }
  if (body?.CONCRE !== undefined) {
    const concre = String(body.CONCRE || 'CON').trim().toUpperCase();
    if (concre !== 'CON' && concre !== 'CRE') {
      const err = new Error('CONCRE debe ser CON o CRE');
      err.statusCode = 400;
      throw err;
    }
    request.input('CONCRE', sql.VarChar, concre);
    updates.push('CONCRE = @CONCRE', `TIPOPAGO = '${concre === 'CRE' ? 'CREDITO' : 'CONTADO'}'`);
  }
  if (body?.TOTALSINIVA !== undefined) {
    request.input('TOTALSINIVA', sql.Float, roundMoney(body.TOTALSINIVA));
    updates.push('TOTALSINIVA = @TOTALSINIVA');
  }
  if (body?.TOTALIVA !== undefined) {
    request.input('TOTALIVA', sql.Float, roundMoney(body.TOTALIVA));
    updates.push('TOTALIVA = @TOTALIVA');
  }
  if (body?.TOTALPRECIO !== undefined) {
    const total = roundMoney(body.TOTALPRECIO);
    request.input('TOTALPRECIO', sql.Decimal(18, 3), total);
    request.input('TOTALCOSTO', sql.Decimal(18, 3), total);
    request.input('PAGO', sql.Decimal(18, 3), total);
    updates.push('TOTALPRECIO = @TOTALPRECIO', 'TOTALCOSTO = @TOTALCOSTO', 'PAGO = @PAGO');
  }
  if (body?.FEL_UUDI !== undefined) {
    request.input('FEL_UUDI', sql.VarChar, String(body.FEL_UUDI || '').trim());
    updates.push('FEL_UUDI = @FEL_UUDI');
  }

  if (body?.FECHA !== undefined) {
    const parts = parseFechaInput(body.FECHA);
    if (parts) {
      request.input('FECHA', sql.Date, parts.fecha);
      request.input('ANIO', sql.Int, parts.anio);
      request.input('MES', sql.Int, parts.mes);
      request.input('DIA', sql.Int, parts.dia);
      updates.push('FECHA = @FECHA', 'ANIO = @ANIO', 'MES = @MES', 'DIA = @DIA');
    }
  }

  if (!updates.length) return loadDocumento(pool, empnit, coddoc, correlativo);

  const result = await request.query(`
    UPDATE dbo.DOCUMENTOS SET ${updates.join(', ')}
    WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      AND ${SQL_DOCUMENTO_EDITABLE}
  `);
  if (result.rowsAffected[0] === 0) {
    const err = new Error('Documento no encontrado o no editable');
    err.statusCode = 404;
    throw err;
  }
  return loadDocumento(pool, empnit, coddoc, correlativo);
}

async function finalizarRetencionIva(pool, empnit, coddoc, correlativo, body) {
  const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
  if (!doc) {
    const err = new Error('Documento no encontrado');
    err.statusCode = 404;
    throw err;
  }

  const seriefac = String(body?.SERIEFAC ?? doc.SERIEFAC ?? '').trim();
  const nofac = String(body?.NOFAC ?? doc.NOFAC ?? '').trim();
  if (!seriefac || !nofac) {
    const err = new Error('Serie y número de factura referencia son obligatorios');
    err.statusCode = 400;
    throw err;
  }

  const totalIva = roundMoney(body?.TOTALIVA ?? doc.TOTALIVA);
  const totalPrecio = roundMoney(body?.TOTALPRECIO ?? doc.TOTALPRECIO ?? totalIva);
  if (totalPrecio <= 0) {
    const err = new Error('El monto de retención debe ser mayor a cero');
    err.statusCode = 400;
    throw err;
  }

  const concre = String(body?.CONCRE ?? doc.CONCRE ?? 'CON').trim().toUpperCase();
  if (concre !== 'CON' && concre !== 'CRE') {
    const err = new Error('CONCRE debe ser CON o CRE');
    err.statusCode = 400;
    throw err;
  }

  const totalSinIva = roundMoney(body?.TOTALSINIVA ?? doc.TOTALSINIVA ?? 0);
  const obs = body?.OBS !== undefined ? String(body.OBS || '').trim() : doc.OBS;
  const felUudi = body?.FEL_UUDI !== undefined ? String(body.FEL_UUDI || '').trim() : doc.FEL_UUDI;

  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('SERIEFAC', sql.VarChar, seriefac)
    .input('NOFAC', sql.VarChar, nofac)
    .input('CONCRE', sql.VarChar, concre)
    .input('TIPOPAGO', sql.VarChar, concre === 'CRE' ? 'CREDITO' : 'CONTADO')
    .input('TOTALIVA', sql.Float, totalIva)
    .input('TOTALSINIVA', sql.Float, totalSinIva)
    .input('TOTALPRECIO', sql.Decimal(18, 3), totalPrecio)
    .input('TOTALCOSTO', sql.Decimal(18, 3), totalPrecio)
    .input('PAGO', sql.Decimal(18, 3), totalPrecio)
    .input('OBS', sql.VarChar, obs || '')
    .input('FEL_UUDI', sql.VarChar, felUudi || '')
    .query(`
      UPDATE dbo.DOCUMENTOS SET
        SERIEFAC = @SERIEFAC,
        NOFAC = @NOFAC,
        CONCRE = @CONCRE,
        TIPOPAGO = @TIPOPAGO,
        TOTALIVA = @TOTALIVA,
        TOTALSINIVA = @TOTALSINIVA,
        TOTALPRECIO = @TOTALPRECIO,
        TOTALCOSTO = @TOTALCOSTO,
        PAGO = @PAGO,
        OBS = @OBS,
        FEL_UUDI = @FEL_UUDI
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
        AND ${SQL_DOCUMENTO_EDITABLE}
    `);

  return loadDocumento(pool, empnit, coddoc, correlativo);
}

async function searchProveedores(pool, empnit, q, limit = 30) {
  const qLike = q ? `%${q}%` : null;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('q', sql.NVarChar, q || null)
    .input('qLike', sql.NVarChar, qLike)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT TOP (@limit) CODPROV, NIT, EMPRESA, RAZONSOCIAL, DIRECCION
      FROM dbo.PROVEEDORES
      WHERE EMPNIT = @EMPNIT
        AND (
          @q IS NULL OR @q = ''
          OR CAST(CODPROV AS VARCHAR(20)) LIKE @qLike
          OR NIT LIKE @qLike
          OR EMPRESA LIKE @qLike
          OR RAZONSOCIAL LIKE @qLike
        )
      ORDER BY EMPRESA, CODPROV
    `);
  return result.recordset;
}

module.exports = {
  RTV_CODDOC,
  RTV_TIPODOC,
  ensureRetencionesIvaSetup,
  getTipoDocRtv,
  listRetencionesIva,
  createRetencionIva,
  updateRetencionIva,
  finalizarRetencionIva,
  loadDocumento,
  searchProveedores,
  parseCorrelativo,
};
