/**
 * Descarga un traslado de COMMUNITY_* hacia DOCUMENTOS/DOCPRODUCTOS locales
 * (suma inventario) y elimina la copia en la nube.
 */
const sql = require('mssql');
const {
  getTipomDocumento,
  aplicarMovimientoInventarioLineaInsert,
  InventarioError,
} = require('./inventario');
const { nowParts } = require('./documento-fecha');
const { STATUS_OPERADO, SQL_STATUS_EDITABLE } = require('./documento-status');
const { getAppToken } = require('./app-token');

const DEFAULT_BODEGA = 0;

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v, fallback = '') {
  const s = String(v ?? '').trim();
  return s || fallback;
}

async function loadCommunityTraslado(hostPool, token, origenEmpnit, coddoc, correlativo) {
  const headerRes = await hostPool
    .request()
    .input('TOKEN', sql.VarChar, token)
    .input('EMPNIT', sql.VarChar, origenEmpnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT TOP 1 *
      FROM dbo.COMMUNITY_DOCUMENTOS
      WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
        AND LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) = LTRIM(RTRIM(@EMPNIT))
        AND LTRIM(RTRIM(CAST(CODDOC AS VARCHAR(50)))) = LTRIM(RTRIM(@CODDOC))
        AND CORRELATIVO = @CORRELATIVO
    `);
  const header = headerRes.recordset?.[0];
  if (!header) return null;

  const linesRes = await hostPool
    .request()
    .input('TOKEN', sql.VarChar, token)
    .input('EMPNIT', sql.VarChar, origenEmpnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT *
      FROM dbo.COMMUNITY_DOCPRODUCTOS
      WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
        AND LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) = LTRIM(RTRIM(@EMPNIT))
        AND LTRIM(RTRIM(CAST(CODDOC AS VARCHAR(50)))) = LTRIM(RTRIM(@CODDOC))
        AND CORRELATIVO = @CORRELATIVO
      ORDER BY CODPROD
    `);

  return { header, lines: linesRes.recordset || [] };
}

async function deleteCommunityTraslado(hostPool, token, origenEmpnit, coddoc, correlativo) {
  await hostPool
    .request()
    .input('TOKEN', sql.VarChar, token)
    .input('EMPNIT', sql.VarChar, origenEmpnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      DELETE FROM dbo.COMMUNITY_DOCPRODUCTOS
      WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
        AND LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) = LTRIM(RTRIM(@EMPNIT))
        AND LTRIM(RTRIM(CAST(CODDOC AS VARCHAR(50)))) = LTRIM(RTRIM(@CODDOC))
        AND CORRELATIVO = @CORRELATIVO;

      DELETE FROM dbo.COMMUNITY_DOCUMENTOS
      WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
        AND LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) = LTRIM(RTRIM(@EMPNIT))
        AND LTRIM(RTRIM(CAST(CODDOC AS VARCHAR(50)))) = LTRIM(RTRIM(@CODDOC))
        AND CORRELATIVO = @CORRELATIVO;
    `);
}

function fechaPartsFromCommunityHeader(header) {
  const anio = Number(header.ANIO);
  const mes = Number(header.MES);
  const dia = Number(header.DIA);
  if (
    Number.isFinite(anio) &&
    Number.isFinite(mes) &&
    Number.isFinite(dia) &&
    mes >= 1 &&
    mes <= 12 &&
    dia >= 1
  ) {
    const fecha = new Date(anio, mes - 1, dia);
    return {
      anio,
      mes,
      dia,
      fecha,
      hora: Number(header.HORA) || 0,
      minuto: Number(header.MINUTO) || 0,
    };
  }
  if (header.FECHA) {
    const d = header.FECHA instanceof Date ? header.FECHA : new Date(header.FECHA);
    if (!Number.isNaN(d.getTime())) {
      return {
        anio: d.getFullYear(),
        mes: d.getMonth() + 1,
        dia: d.getDate(),
        fecha: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        hora: Number(header.HORA) || d.getHours() || 0,
        minuto: Number(header.MINUTO) || d.getMinutes() || 0,
      };
    }
  }
  return nowParts();
}

async function allocateCorrelativo(transaction, empnit, coddoc) {
  const locked = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT CORRELATIVO FROM dbo.TIPODOCUMENTOS WITH (UPDLOCK, ROWLOCK)
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  if (!locked.recordset.length) throw new Error('Serie de documento no encontrada');
  const maxRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT ISNULL(MAX(CORRELATIVO), 0) AS maxCorr FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const next = Math.max(Number(locked.recordset[0].CORRELATIVO) || 0, Number(maxRes.recordset[0].maxCorr) || 0) + 1;
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

async function recalcDocumentTotals(transaction, empnit, coddoc, correlativo) {
  const totalsRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT
        ISNULL(SUM(TOTALCOSTO), 0) AS TOTALCOSTO,
        ISNULL(SUM(TOTALPRECIO), 0) AS TOTALPRECIO
      FROM dbo.DOCPRODUCTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
  const totalCosto = roundMoney(totalsRes.recordset[0]?.TOTALCOSTO);
  const totalPrecio = roundMoney(totalsRes.recordset[0]?.TOTALPRECIO);
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('TOTALCOSTO', sql.Decimal(18, 3), totalCosto)
    .input('TOTALPRECIO', sql.Decimal(18, 3), totalPrecio)
    .query(`
      UPDATE dbo.DOCUMENTOS
      SET TOTALCOSTO = @TOTALCOSTO, TOTALPRECIO = @TOTALPRECIO,
          TOTALSINIVA = @TOTALPRECIO, TOTALIVA = 0
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
  return { totalCosto, totalPrecio };
}

/**
 * @param {object} opts
 */
async function downloadTrasladoFromCommunity(opts) {
  const {
    localPool,
    hostPool,
    empnitLocal,
    coddocLocal,
    usuario,
    origenEmpnit,
    origenCoddoc,
    origenCorrelativo,
  } = opts;

  const token = getAppToken();
  if (!token) throw new Error('TOKEN no configurado');
  if (!empnitLocal) throw new Error('EMPNIT local requerido');
  if (!coddocLocal) throw new Error('Serie local (CODDOC) requerida');
  if (!origenEmpnit || !origenCoddoc || origenCorrelativo == null) {
    throw new Error('Identificación del traslado en la nube incompleta');
  }

  const cloud = await loadCommunityTraslado(
    hostPool,
    token,
    origenEmpnit,
    origenCoddoc,
    origenCorrelativo
  );
  if (!cloud) throw new Error('Traslado no encontrado en la nube');
  if (!cloud.lines.length) throw new Error('El traslado en la nube no tiene líneas');

  const destinoCloud = str(cloud.header.CODEMBARQUE);
  if (destinoCloud.toUpperCase() !== String(empnitLocal).trim().toUpperCase()) {
    throw new Error('Este traslado no está destinado a la empresa de la sesión');
  }

  const parts = fechaPartsFromCommunityHeader(cloud.header);
  const origenRef = `${origenCoddoc} #${origenCorrelativo}`;
  const obsCloud = str(cloud.header.OBS);
  const obs = obsCloud
    ? `${obsCloud} | Origen ${origenRef}`
    : `Traslado recibido desde ${origenEmpnit} | Origen ${origenRef}`;
  const obmarca = str(cloud.header.OBSMARCA, origenEmpnit);

  const transaction = new sql.Transaction(localPool);
  await transaction.begin();
  let correlativoLocal;
  try {
    correlativoLocal = await allocateCorrelativo(transaction, empnitLocal, coddocLocal);
    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnitLocal)
      .input('ANIO', sql.Int, parts.anio)
      .input('MES', sql.Int, parts.mes)
      .input('DIA', sql.Int, parts.dia)
      .input('FECHA', sql.Date, parts.fecha)
      .input('HORA', sql.Int, parts.hora)
      .input('MINUTO', sql.Int, parts.minuto)
      .input('CODDOC', sql.VarChar, coddocLocal)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativoLocal)
      .input('USUARIO', sql.VarChar, str(usuario, 'SISTEMA'))
      .input('OBS', sql.VarChar, obs)
      .input('CODEMBARQUE', sql.VarChar, origenEmpnit)
      .input('OBSMARCA', sql.VarChar, obmarca)
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
          0, 'CF', 'INVENTARIO', 'SN',
          0, 0, @CODEMBARQUE, '${STATUS_OPERADO}', @USUARIO, 'CON', 'NO',
          'SN', @OBS, 0, 0, @OBSMARCA, 0, 1,
          'SN', 'SN', 0, 0, 'CONTADO', 'SN',
          @FECHA, 0, 0, 0, 0, 0
        )
      `);

    const tipom = await getTipomDocumento(transaction, empnitLocal, coddocLocal);

    for (const line of cloud.lines) {
      const codprod = str(line.CODPROD);
      if (!codprod) continue;
      const desprod = str(line.DESPROD, codprod);
      const codmedida = str(line.CODMEDIDA, 'UNIDAD');
      const cantidad = num(line.CANTIDAD);
      if (cantidad <= 0) continue;
      const equivale = Math.max(1, Math.round(num(line.EQUIVALE, 1)));
      const totalUnidades = roundMoney(num(line.TOTALUNIDADES, cantidad * equivale));
      const costo = roundMoney(num(line.COSTO));
      const precio = roundMoney(num(line.PRECIO));
      const totalCosto = roundMoney(num(line.TOTALCOSTO, cantidad * costo));
      const totalPrecio = roundMoney(num(line.TOTALPRECIO, cantidad * precio));
      const tipoprod = str(line.TIPOPROD, 'P');
      const tipoprecio = str(line.TIPOPRECIO, 'P');
      const peso = roundMoney(num(line.PESO));
      const totalPeso = roundMoney(num(line.TOTALPESO, cantidad * peso));
      const exento = roundMoney(num(line.EXENTO));

      await transaction
        .request()
        .input('EMPNIT', sql.VarChar, empnitLocal)
        .input('ANIO', sql.Int, parts.anio)
        .input('MES', sql.Int, parts.mes)
        .input('DIA', sql.Int, parts.dia)
        .input('CODDOC', sql.VarChar, coddocLocal)
        .input('CORRELATIVO', sql.Decimal(18, 0), correlativoLocal)
        .input('CODPROD', sql.VarChar, codprod)
        .input('DESPROD', sql.VarChar, desprod)
        .input('CODMEDIDA', sql.VarChar, codmedida)
        .input('CANTIDAD', sql.Float, cantidad)
        .input('EQUIVALE', sql.Int, equivale)
        .input('TOTALUNIDADES', sql.Float, totalUnidades)
        .input('COSTO', sql.Decimal(18, 3), costo)
        .input('PRECIO', sql.Decimal(18, 3), precio)
        .input('TOTALCOSTO', sql.Decimal(18, 3), totalCosto)
        .input('TOTALPRECIO', sql.Decimal(18, 3), totalPrecio)
        .input('EXENTO', sql.Decimal(18, 3), exento)
        .input('TIPOPROD', sql.VarChar, tipoprod)
        .input('TIPOPRECIO', sql.VarChar, tipoprecio)
        .input('PESO', sql.Decimal(18, 3), peso)
        .input('TOTALPESO', sql.Decimal(18, 3), totalPeso)
        .input('TIPOM', sql.Int, tipom)
        .query(`
          INSERT INTO dbo.DOCPRODUCTOS (
            EMPNIT, ANIO, MES, DIA, CODDOC, CORRELATIVO, CODPROD, DESPROD, CODMEDIDA,
            CANTIDAD, CANTIDADBONIF, EQUIVALE, TOTALUNIDADES, TOTALBONIF,
            COSTO, PRECIO, TOTALCOSTO, TOTALPRECIO,
            ENTREGADOS_TOTALUNIDADES, ENTREGADOS_TOTALCOSTO, ENTREGADOS_TOTALPRECIO,
            COSTOANTERIOR, COSTOPROMEDIO, CODBODEGAENTRADA, CODBODEGASALIDA,
            DESCUENTO, PORCDESCUENTO, NOSERIE, EXENTO, OBS,
            TIPOPROD, TIPOPRECIO, PESO, TOTALPESO, TIPOM, LASTUPDATE
          ) VALUES (
            @EMPNIT, @ANIO, @MES, @DIA, @CODDOC, @CORRELATIVO, @CODPROD, @DESPROD, @CODMEDIDA,
            @CANTIDAD, 0, @EQUIVALE, @TOTALUNIDADES, 0,
            @COSTO, @PRECIO, @TOTALCOSTO, @TOTALPRECIO,
            @TOTALUNIDADES, @TOTALCOSTO, @TOTALPRECIO,
            0, 0, ${DEFAULT_BODEGA}, ${DEFAULT_BODEGA},
            0, 0, 'SN', @EXENTO, 'SN',
            @TIPOPROD, @TIPOPRECIO, @PESO, @TOTALPESO, @TIPOM, CAST(GETDATE() AS DATE)
          )
        `);

      await aplicarMovimientoInventarioLineaInsert(transaction, {
        empnit: empnitLocal,
        coddoc: coddocLocal,
        correlativo: correlativoLocal,
        codprod,
        desprod,
        totalUnidades,
        tipoprod,
        tipom,
        codbodegaEntrada: DEFAULT_BODEGA,
        codbodegaSalida: DEFAULT_BODEGA,
      });
    }

    await recalcDocumentTotals(transaction, empnitLocal, coddocLocal, correlativoLocal);

    const lineCount = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnitLocal)
      .input('CODDOC', sql.VarChar, coddocLocal)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativoLocal)
      .query(`
        SELECT COUNT(*) AS cnt FROM dbo.DOCPRODUCTOS
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      `);
    if ((lineCount.recordset[0]?.cnt || 0) < 1) {
      throw new Error('No se insertaron líneas del traslado');
    }

    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnitLocal)
      .input('CODDOC', sql.VarChar, coddocLocal)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativoLocal)
      .query(`
        UPDATE dbo.DOCUMENTOS SET CORTE = 'SI'
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
          AND ${SQL_STATUS_EDITABLE}
      `);

    await transaction.commit();
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      /* ignore */
    }
    if (err instanceof InventarioError) throw err;
    throw err;
  }

  // Verificar documento local
  const verify = await localPool
    .request()
    .input('EMPNIT', sql.VarChar, empnitLocal)
    .input('CODDOC', sql.VarChar, coddocLocal)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativoLocal)
    .query(`
      SELECT d.CODDOC, d.CORRELATIVO, d.CODEMBARQUE, d.CORTE,
        (SELECT COUNT(*) FROM dbo.DOCPRODUCTOS l
         WHERE l.EMPNIT = d.EMPNIT AND l.CODDOC = d.CODDOC AND l.CORRELATIVO = d.CORRELATIVO) AS LINEAS
      FROM dbo.DOCUMENTOS d
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);
  const localDoc = verify.recordset?.[0];
  if (!localDoc || Number(localDoc.LINEAS) < 1) {
    throw new Error('La descarga no se verificó correctamente en el documento local');
  }

  await deleteCommunityTraslado(hostPool, token, origenEmpnit, origenCoddoc, origenCorrelativo);

  return {
    ok: true,
    documento: {
      CODDOC: coddocLocal,
      CORRELATIVO: correlativoLocal,
      CODEMBARQUE: origenEmpnit,
      LINEAS: Number(localDoc.LINEAS) || 0,
      CORTE: localDoc.CORTE,
    },
  };
}

async function listCommunityTrasladoLineas(hostPool, token, origenEmpnit, coddoc, correlativo) {
  const result = await hostPool
    .request()
    .input('TOKEN', sql.VarChar, token)
    .input('EMPNIT', sql.VarChar, origenEmpnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT
        LTRIM(RTRIM(CAST(CODPROD AS VARCHAR(50)))) AS CODPROD,
        LTRIM(RTRIM(ISNULL(CAST(DESPROD AS VARCHAR(200)), ''))) AS DESPROD,
        LTRIM(RTRIM(ISNULL(CAST(CODMEDIDA AS VARCHAR(50)), ''))) AS CODMEDIDA,
        CANTIDAD
      FROM dbo.COMMUNITY_DOCPRODUCTOS
      WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
        AND LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) = LTRIM(RTRIM(@EMPNIT))
        AND LTRIM(RTRIM(CAST(CODDOC AS VARCHAR(50)))) = LTRIM(RTRIM(@CODDOC))
        AND CORRELATIVO = @CORRELATIVO
      ORDER BY CODPROD
    `);
  return result.recordset || [];
}

module.exports = {
  downloadTrasladoFromCommunity,
  listCommunityTrasladoLineas,
  loadCommunityTraslado,
  deleteCommunityTraslado,
};
