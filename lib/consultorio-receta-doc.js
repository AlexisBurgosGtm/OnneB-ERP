const sql = require('mssql');
const { InventarioError, getTipomDocumento, aplicarMovimientoInventarioLineaInsert } = require('./inventario');
const { nowParts } = require('./documento-fecha');
const { lineProductMeta, getPrecioFromPreciosRow, normalizePreciosField } = require('./doc-producto-linea');
const {
  fetchProductoPrecioForLinea,
  pesoFromPreciosRow,
  calcLinePeso,
} = require('./producto-precio-linea');
const { bonoFromPrecioRow, bindDocproductosBonoInput } = require('./docproductos-bono');
const { getDefaultConcreVentas } = require('./concre-ventas-policy');
const { STATUS_OPERADO } = require('./documento-status');
const { valoresEntregadosIniciales } = require('./documentos-entregado');
const { getTipoDocRec } = require('./consultorio-receta-setup');

const DEFAULT_BODEGA = 0;

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function calcLineTotals(cantidad, costo, precio, equivale) {
  const qty = Number(cantidad) || 0;
  const eq = Number(equivale) || 1;
  const cost = Number(costo) || 0;
  const price = Number(precio) || 0;
  const totalUnidades = roundMoney(qty * eq);
  const totalCosto = roundMoney(qty * cost);
  const totalPrecio = roundMoney(qty * price);
  return { totalUnidades, totalCosto, totalPrecio };
}

function parseRecetaLinesInput(body) {
  const raw = body?.recetaLines ?? body?.RECETA_LINES ?? [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((ln) => ({
      CODPROD: String(ln?.CODPROD || '').trim(),
      CODMEDIDA: String(ln?.CODMEDIDA || '').trim(),
      CANTIDAD: Number(ln?.CANTIDAD ?? 1),
      PRECIO: ln?.PRECIO != null && ln.PRECIO !== '' ? Number(ln.PRECIO) : null,
      CAMPO_PRECIO: ln?.CAMPO_PRECIO || ln?.campoPrecio || 'PRECIO',
      NOSERIE: String(ln?.NOSERIE ?? ln?.DOSIS ?? '').trim(),
      OBS: String(ln?.OBS ?? ln?.DURACION ?? '').trim(),
    }))
    .filter((ln) => ln.CODPROD && ln.CODMEDIDA && ln.CANTIDAD > 0);
}

async function recalcDocumentTotals(transaction, empnit, coddoc, correlativo) {
  const sums = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT
        ISNULL(SUM(TOTALCOSTO), 0) AS TOTALCOSTO,
        ISNULL(SUM(TOTALPRECIO), 0) AS TOTALPRECIO,
        ISNULL(SUM(TOTALIVA), 0) AS TOTALIVA,
        ISNULL(SUM(TOTALSINIVA), 0) AS TOTALSINIVA
      FROM dbo.DOCPRODUCTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
  const row = sums.recordset[0] || {};
  const totalCosto = roundMoney(row.TOTALCOSTO);
  const totalPrecio = roundMoney(row.TOTALPRECIO);
  const totalIva = roundMoney(row.TOTALIVA);
  const totalSinIva = roundMoney(row.TOTALSINIVA);
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('TOTALCOSTO', sql.Decimal(18, 3), totalCosto)
    .input('TOTALPRECIO', sql.Decimal(18, 3), totalPrecio)
    .input('TOTALIVA', sql.Float, totalIva)
    .input('TOTALSINIVA', sql.Float, totalSinIva)
    .input('PAGO', sql.Decimal(18, 3), totalPrecio)
    .input('DOC_ABONO', sql.Decimal(18, 3), totalPrecio)
    .query(`
      UPDATE dbo.DOCUMENTOS
      SET TOTALCOSTO = @TOTALCOSTO,
          TOTALPRECIO = @TOTALPRECIO,
          TOTALIVA = @TOTALIVA,
          TOTALSINIVA = @TOTALSINIVA,
          PAGO = @PAGO,
          DOC_ABONO = @DOC_ABONO
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
  return { totalCosto, totalPrecio };
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
      SELECT ISNULL(MAX(CORRELATIVO), 0) AS maxCorr FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const tipoCorr = Number(tipoRes.recordset[0]?.CORRELATIVO) || 0;
  const maxCorr = Number(maxRes.recordset[0]?.maxCorr) || 0;
  const next = Math.max(tipoCorr, maxCorr) + 1;
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

async function getConsumidorFinalCliente(pool, empnit) {
  const r = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
    SELECT TOP 1 CODCLIENTE, NIT, NOMBRECLIENTE, DIRCLIENTE, NEGOCIO, TIPONEGOCIO
    FROM dbo.CLIENTES
    WHERE EMPNIT = @EMPNIT
      AND (
        UPPER(LTRIM(RTRIM(ISNULL(NIT, '')))) IN ('CF', 'C/F')
        OR UPPER(ISNULL(NOMBRECLIENTE, '')) LIKE '%CONSUMIDOR%FINAL%'
        OR CODCLIENTE = 1
      )
    ORDER BY CASE WHEN CODCLIENTE = 1 THEN 0 ELSE 1 END, CODCLIENTE
  `);
  if (r.recordset[0]) return r.recordset[0];
  const fallback = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCLIENTE', sql.Int, 1)
    .query(`
      SELECT CODCLIENTE, NIT, NOMBRECLIENTE, DIRCLIENTE, NEGOCIO, TIPONEGOCIO
      FROM dbo.CLIENTES WHERE EMPNIT = @EMPNIT AND CODCLIENTE = @CODCLIENTE
    `);
  return fallback.recordset[0] || null;
}

async function getPacienteNombre(pool, empnit, codpaciente) {
  const r = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPACIENTE', sql.Int, codpaciente)
    .query(`
      SELECT LTRIM(RTRIM(ISNULL(NOMBRE, ''))) AS NOMBRE
      FROM dbo.CONSULTORIO_PACIENTES
      WHERE EMPNIT = @EMPNIT AND CODPACIENTE = @CODPACIENTE
    `);
  return String(r.recordset[0]?.NOMBRE || '').trim();
}

async function insertRecetaLine(transaction, pool, empnit, coddoc, correlativo, lineInput) {
  const found = await fetchProductoPrecioForLinea(pool, sql, {
    empnit,
    codprod: lineInput.CODPROD,
    codmedida: lineInput.CODMEDIDA,
  });
  if (!found) {
    throw new Error(`Producto no encontrado: ${lineInput.CODPROD}`);
  }
  const prod = found.row;
  const medidaLinea = found.codmedida;
  const campoPrecio = normalizePreciosField(lineInput.CAMPO_PRECIO);
  const { tipoprod, tipoprecio } = lineProductMeta(prod, campoPrecio);
  let costo = Number(prod.COSTO ?? prod.COSTO_PROD) || 0;
  let precio = getPrecioFromPreciosRow(prod, campoPrecio);
  if (lineInput.PRECIO != null && Number.isFinite(lineInput.PRECIO) && lineInput.PRECIO >= 0) {
    precio = roundMoney(lineInput.PRECIO);
  }
  const equivale = Number(prod.EQUIVALE) || 1;
  const cantidad = Number(lineInput.CANTIDAD) || 1;
  const desprod = prod.DESPROD;
  const exento = Number(prod.EXENTO) ? Number(prod.EXENTO) : 0;
  const peso = pesoFromPreciosRow(prod);
  const lineBono = bonoFromPrecioRow(prod, equivale);
  const noserie = String(lineInput.NOSERIE ?? lineInput.DOSIS ?? '').trim().slice(0, 80) || 'SN';
  const obs = String(lineInput.OBS ?? lineInput.DURACION ?? '').trim().slice(0, 250) || 'SN';
  const { totalUnidades, totalCosto, totalPrecio } = calcLineTotals(cantidad, costo, precio, equivale);
  const parts = nowParts();
  const totalPeso = calcLinePeso(cantidad, peso);
  const tipom = await getTipomDocumento(transaction, empnit, coddoc);
  const ent = valoresEntregadosIniciales(coddoc, totalUnidades, totalCosto, totalPrecio);

  const insReq = transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ANIO', sql.Int, parts.anio)
    .input('MES', sql.Int, parts.mes)
    .input('DIA', sql.Int, parts.dia)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('CODPROD', sql.VarChar, lineInput.CODPROD)
    .input('DESPROD', sql.VarChar, desprod)
    .input('CODMEDIDA', sql.VarChar, medidaLinea)
    .input('CANTIDAD', sql.Float, cantidad)
    .input('EQUIVALE', sql.Int, equivale)
    .input('TOTALUNIDADES', sql.Float, totalUnidades)
    .input('COSTO', sql.Decimal(18, 3), costo)
    .input('PRECIO', sql.Decimal(18, 3), precio)
    .input('TOTALCOSTO', sql.Decimal(18, 3), totalCosto)
    .input('TOTALPRECIO', sql.Decimal(18, 3), totalPrecio)
    .input('ENT_U', sql.Float, ent.unidades)
    .input('ENT_C', sql.Decimal(18, 3), ent.costo)
    .input('ENT_P', sql.Decimal(18, 3), ent.precio)
    .input('EXENTO', sql.Decimal(18, 3), exento)
    .input('TIPOPROD', sql.VarChar, tipoprod)
    .input('TIPOPRECIO', sql.VarChar, tipoprecio)
    .input('PESO', sql.Decimal(18, 3), peso)
    .input('TOTALPESO', sql.Decimal(18, 3), totalPeso)
    .input('TIPOM', sql.Int, tipom)
    .input('NOSERIE', sql.VarChar, noserie)
    .input('OBS', sql.VarChar, obs);
  bindDocproductosBonoInput(insReq, sql, lineBono);
  await insReq.query(`
    INSERT INTO dbo.DOCPRODUCTOS (
      EMPNIT, ANIO, MES, DIA, CODDOC, CORRELATIVO, CODPROD, DESPROD, CODMEDIDA,
      CANTIDAD, CANTIDADBONIF, EQUIVALE, TOTALUNIDADES, TOTALBONIF,
      COSTO, PRECIO, TOTALCOSTO, TOTALPRECIO,
      ENTREGADOS_TOTALUNIDADES, ENTREGADOS_TOTALCOSTO, ENTREGADOS_TOTALPRECIO,
      COSTOANTERIOR, COSTOPROMEDIO, CODBODEGAENTRADA, CODBODEGASALIDA,
      DESCUENTO, PORCDESCUENTO, NOSERIE, EXENTO, OBS,
      TIPOPROD, TIPOPRECIO, PESO, TOTALPESO, TIPOM, LASTUPDATE, BONO
    ) VALUES (
      @EMPNIT, @ANIO, @MES, @DIA, @CODDOC, @CORRELATIVO, @CODPROD, @DESPROD, @CODMEDIDA,
      @CANTIDAD, 0, @EQUIVALE, @TOTALUNIDADES, 0,
      @COSTO, @PRECIO, @TOTALCOSTO, @TOTALPRECIO,
      @ENT_U, @ENT_C, @ENT_P,
      0, 0, ${DEFAULT_BODEGA}, ${DEFAULT_BODEGA},
      0, 0, @NOSERIE, @EXENTO, @OBS,
      @TIPOPROD, @TIPOPRECIO, @PESO, @TOTALPESO, @TIPOM, CAST(GETDATE() AS DATE), @BONO
    )
  `);
  await aplicarMovimientoInventarioLineaInsert(transaction, {
    empnit,
    coddoc,
    correlativo,
    codprod: lineInput.CODPROD,
    desprod,
    totalUnidades,
    tipoprod,
    tipom,
    codbodegaEntrada: DEFAULT_BODEGA,
    codbodegaSalida: DEFAULT_BODEGA,
  });
}

/**
 * Crea documento REC (consumidor final + nombre paciente) con líneas dentro de una transacción abierta.
 */
async function createRecetaEnTransaccion(transaction, pool, empnit, opts) {
  const lines = opts.lines || [];
  if (!lines.length) return null;

  const tipo = await getTipoDocRec(pool, empnit);
  if (!tipo?.CODDOC) throw new Error('No hay tipo de documento REC activo');

  const cliente = await getConsumidorFinalCliente(pool, empnit);
  if (!cliente) throw new Error('No hay cliente consumidor final configurado');

  const pacienteNombre = String(opts.pacienteNombre || '').trim().slice(0, 120) || 'PACIENTE';
  const usuario = String(opts.usuario || 'CONS').trim().slice(0, 20) || 'CONS';
  const obs = String(opts.obs || `Receta consultorio #${opts.codconsulta || ''}`).trim().slice(0, 200);
  const parts = nowParts();
  const defaultConcre = await getDefaultConcreVentas(pool);
  const tipopagoDefault = defaultConcre === 'CRE' ? 'CREDITO' : 'CONTADO';
  const coddoc = tipo.CODDOC;
  const correlativo = await allocateCorrelativo(transaction, empnit, coddoc);

  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ANIO', sql.Int, parts.anio)
    .input('MES', sql.Int, parts.mes)
    .input('DIA', sql.Int, parts.dia)
    .input('FECHA', sql.Date, parts.fecha)
    .input('HORA', sql.Int, parts.hora)
    .input('MINUTO', sql.Int, parts.minuto)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('CODCLIENTE', sql.Int, cliente.CODCLIENTE)
    .input('DOC_NIT', sql.VarChar, String(cliente.NIT || 'CF'))
    .input('DOC_NOMCLIE', sql.VarChar, pacienteNombre)
    .input('DOC_DIRCLIE', sql.VarChar, String(cliente.DIRCLIENTE || 'SN'))
    .input('USUARIO', sql.VarChar, usuario)
    .input('OBS', sql.VarChar, obs)
    .input('CONCRE', sql.VarChar, defaultConcre)
    .input('TIPOPAGO', sql.VarChar, tipopagoDefault)
    .query(`
      INSERT INTO dbo.DOCUMENTOS (
        EMPNIT, ANIO, MES, DIA, FECHA, HORA, MINUTO, CODDOC, CORRELATIVO,
        CODCLIENTE, DOC_NIT, DOC_NOMCLIE, DOC_DIRCLIE, CODVEN,
        TOTALCOSTO, TOTALPRECIO, CODEMBARQUE, STATUS, USUARIO, CONCRE, CORTE,
        MARCA, OBS, DOC_SALDO, DOC_ABONO, OBSMARCA, TOTALDESCUENTO, CODCAJA,
        DIRENTREGA, NOGUIA, VALORENTREGA, TOTALEXENTO, TIPOPAGO, NODOCPAGO,
        VENCIMIENTO, DIASCREDITO, TOTALIVA, TOTALSINIVA, PAGO, VUELTO
      ) VALUES (
        @EMPNIT, @ANIO, @MES, @DIA, @FECHA, @HORA, @MINUTO, @CODDOC, @CORRELATIVO,
        @CODCLIENTE, @DOC_NIT, @DOC_NOMCLIE, @DOC_DIRCLIE, NULL,
        0, 0, 'MOSTRADOR', '${STATUS_OPERADO}', @USUARIO, @CONCRE, 'NO',
        'SN', @OBS, 0, 0, 'SN', 0, 1,
        'SN', 'SN', 0, 0, @TIPOPAGO, 'SN',
        @FECHA, 0, 0, 0, 0, 0
      )
    `);

  for (const ln of lines) {
    try {
      await insertRecetaLine(transaction, pool, empnit, coddoc, correlativo, ln);
    } catch (err) {
      if (err instanceof InventarioError) throw err;
      throw err;
    }
  }
  await recalcDocumentTotals(transaction, empnit, coddoc, correlativo);
  return { CODDOC: coddoc, CORRELATIVO: correlativo };
}

async function loadRecetaLinesForConsulta(pool, empnit, coddoc, correlativo) {
  if (!coddoc || correlativo == null) return [];
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT l.Id AS ID, l.CODPROD, l.DESPROD, l.CODMEDIDA, l.CANTIDAD, l.EQUIVALE,
        l.PRECIO, l.COSTO, l.TOTALPRECIO, l.TIPOPRECIO, l.NOSERIE, l.OBS
      FROM dbo.DOCPRODUCTOS l
      WHERE l.EMPNIT = @EMPNIT AND l.CODDOC = @CODDOC AND l.CORRELATIVO = @CORRELATIVO
      ORDER BY l.Id
    `);
  return result.recordset || [];
}

async function linkRecetaToConsulta(transaction, empnit, codconsulta, coddoc, correlativo) {
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCONSULTA', sql.Int, codconsulta)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      UPDATE dbo.CONSULTORIO_CONSULTAS SET
        CODDOC_RECETA = @CODDOC,
        CORRELATIVO_RECETA = @CORRELATIVO
      WHERE EMPNIT = @EMPNIT AND CODCONSULTA = @CODCONSULTA
    `);
}

module.exports = {
  parseRecetaLinesInput,
  createRecetaEnTransaccion,
  loadRecetaLinesForConsulta,
  linkRecetaToConsulta,
  getPacienteNombre,
  getConsumidorFinalCliente,
};