const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { assertAdminPass } = require('../lib/config-auth');
const { normalizeDocumentoRows, nowParts, parseFechaInput, fechaIsoFromRow } = require('../lib/documento-fecha');
const { STATUS_OPERADO, STATUS_ANULADO } = require('../lib/documento-status');
const { certificarDocumentoFel } = require('../lib/fel/certificar');
const { getTipomDocumento } = require('../lib/inventario');
const { getIvaFactor, splitIvaFromTotal } = require('../lib/impuestos');
const { getSettingValue, ensureSettingDefault, SETTING_OPCION } = require('../lib/settings');

const router = express.Router();

const TIPODOC_CERT_FAC = ['FEF', 'FEC'];
const DEFAULT_BODEGA = 0;
const DEFAULT_MAXIMO_LEGAL = 2500;

async function getMaximoFraccionamientoLegal(pool) {
  await ensureSettingDefault(pool, SETTING_OPCION.MAXIMO_FRACCIONAMIENTO_FACTURAS);
  const raw = await getSettingValue(pool, SETTING_OPCION.MAXIMO_FRACCIONAMIENTO_FACTURAS);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : DEFAULT_MAXIMO_LEGAL;
}

function tipodocSqlIn(tipodocs) {
  return tipodocs.map((t) => `'${String(t).replace(/'/g, "''")}'`).join(', ');
}

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.body?.empnit || req.headers['x-emp-nit'] || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseCorrelativo(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function roundQty(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

async function loadColaRow(pool, empnit, id) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, id)
    .query(`
      SELECT ID, EMPNIT, TIPO, CODDOC, CORRELATIVO,
        FECHA_INICIO, HORA_INICIO, FINALIZADO, FECHA_FIN, HORA_FIN
      FROM dbo.DOCUMENTOS_COLA_TRABAJO
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  return result.recordset[0] || null;
}

async function loadDocumentoFuente(pool, empnit, coddoc, correlativo) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT d.*, t.DESDOC, t.TIPODOC
      FROM dbo.DOCUMENTOS d
      JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);
  return result.recordset[0] || null;
}

async function listCoddocsFel(pool, empnit) {
  const tipodocIn = tipodocSqlIn(TIPODOC_CERT_FAC);
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT CODDOC, DESDOC, TIPODOC, CORRELATIVO, ISNULL(TIPOM, 0) AS TIPOM
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT
        AND TIPODOC IN (${tipodocIn})
        AND ISNULL(ACTIVO, 'SI') = 'SI'
        AND ISNULL(TIPOM, 0) = 0
      ORDER BY TIPODOC, CODDOC
    `);
  return result.recordset || [];
}

async function peekNextCorrelativo(poolOrTx, empnit, coddoc) {
  const tipoRes = await new sql.Request(poolOrTx)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT CORRELATIVO FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const maxRes = await new sql.Request(poolOrTx)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT ISNULL(MAX(CORRELATIVO), 0) AS maxCorr FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const tipoCorr = Number(tipoRes.recordset[0]?.CORRELATIVO) || 0;
  const maxCorr = Number(maxRes.recordset[0]?.maxCorr) || 0;
  return Math.max(tipoCorr, maxCorr) + 1;
}

async function allocateCorrelativo(transaction, empnit, coddoc) {
  const tipoRes = await new sql.Request(transaction)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT CORRELATIVO FROM dbo.TIPODOCUMENTOS WITH (UPDLOCK, ROWLOCK)
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const maxRes = await new sql.Request(transaction)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT ISNULL(MAX(CORRELATIVO), 0) AS maxCorr FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const tipoCorr = Number(tipoRes.recordset[0]?.CORRELATIVO) || 0;
  const maxCorr = Number(maxRes.recordset[0]?.maxCorr) || 0;
  const next = Math.max(tipoCorr, maxCorr) + 1;
  await new sql.Request(transaction)
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
  const sums = await new sql.Request(transaction)
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
  await new sql.Request(transaction)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('TOTALCOSTO', sql.Decimal(18, 4), roundMoney(row.TOTALCOSTO))
    .input('TOTALPRECIO', sql.Decimal(18, 4), roundMoney(row.TOTALPRECIO))
    .input('TOTALIVA', sql.Decimal(18, 4), roundMoney(row.TOTALIVA))
    .input('TOTALSINIVA', sql.Decimal(18, 4), roundMoney(row.TOTALSINIVA))
    .query(`
      UPDATE dbo.DOCUMENTOS
      SET TOTALCOSTO = @TOTALCOSTO,
          TOTALPRECIO = @TOTALPRECIO,
          TOTALIVA = @TOTALIVA,
          TOTALSINIVA = @TOTALSINIVA,
          DOC_SALDO = CASE WHEN ISNULL(CONCRE, 'CON') = 'CRE' THEN @TOTALPRECIO ELSE 0 END
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
}

async function copyDocProductos(transaction, empnit, srcCoddoc, srcCorrelativo, dstCoddoc, dstCorrelativo, parts) {
  const tipom = await getTipomDocumento(transaction, empnit, dstCoddoc);
  await new sql.Request(transaction)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ANIO', sql.Int, parts.anio)
    .input('MES', sql.Int, parts.mes)
    .input('DIA', sql.Int, parts.dia)
    .input('CODDOC_SRC', sql.VarChar, srcCoddoc)
    .input('CORR_SRC', sql.Decimal(18, 0), srcCorrelativo)
    .input('CODDOC_DST', sql.VarChar, dstCoddoc)
    .input('CORR_DST', sql.Decimal(18, 0), dstCorrelativo)
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
      )
      SELECT
        l.EMPNIT, @ANIO, @MES, @DIA, @CODDOC_DST, @CORR_DST,
        l.CODPROD, l.DESPROD, l.CODMEDIDA,
        l.CANTIDAD, ISNULL(l.CANTIDADBONIF, 0), l.EQUIVALE, l.TOTALUNIDADES, ISNULL(l.TOTALBONIF, 0),
        l.COSTO, l.PRECIO, l.TOTALCOSTO, l.TOTALPRECIO,
        l.TOTALUNIDADES, l.TOTALCOSTO, l.TOTALPRECIO,
        ISNULL(l.COSTOANTERIOR, 0), ISNULL(l.COSTOPROMEDIO, 0),
        ISNULL(l.CODBODEGAENTRADA, ${DEFAULT_BODEGA}), ISNULL(l.CODBODEGASALIDA, ${DEFAULT_BODEGA}),
        ISNULL(l.DESCUENTO, 0), ISNULL(l.PORCDESCUENTO, 0), ISNULL(l.NOSERIE, 'SN'), ISNULL(l.EXENTO, 0), ISNULL(l.OBS, 'SN'),
        ISNULL(l.TIPOPROD, 'P'), ISNULL(l.TIPOPRECIO, 'P'), ISNULL(l.PESO, 0), ISNULL(l.TOTALPESO, 0),
        @TIPOM, CAST(GETDATE() AS DATE)
      FROM dbo.DOCPRODUCTOS l
      WHERE l.EMPNIT = @EMPNIT AND l.CODDOC = @CODDOC_SRC AND l.CORRELATIVO = @CORR_SRC
    `);
}

/**
 * Pool de líneas fuente menos lo ya emitido en fiscales (SERIEFAC/NOFAC).
 * Conserva PRECIO/CODPROD/CODMEDIDA; solo reparte CANTIDAD.
 */
async function buildRemainingProductPool(txOrPool, empnit, srcCoddoc, srcCorrelativo) {
  const srcRes = await new sql.Request(txOrPool)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, srcCoddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), srcCorrelativo)
    .query(`
      SELECT *
      FROM dbo.DOCPRODUCTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      ORDER BY ID
    `);
  const pool = (srcRes.recordset || []).map((l) => ({
    src: l,
    restante: roundQty(l.CANTIDAD),
  }));
  if (!pool.length) {
    const err = new Error('El documento fuente no tiene líneas');
    err.statusCode = 400;
    throw err;
  }

  const issuedRes = await new sql.Request(txOrPool)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('SERIEFAC', sql.VarChar, srcCoddoc)
    .input('CORR_SRC', sql.Decimal(18, 0), srcCorrelativo)
    .query(`
      SELECT l.ID, l.CODPROD, l.CODMEDIDA, l.PRECIO, l.CANTIDAD, l.OBS
      FROM dbo.DOCPRODUCTOS l
      INNER JOIN dbo.DOCUMENTOS d
        ON d.EMPNIT = l.EMPNIT AND d.CODDOC = l.CODDOC AND d.CORRELATIVO = l.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND t.TIPODOC IN (${tipodocSqlIn(TIPODOC_CERT_FAC)})
        AND d.SERIEFAC = @SERIEFAC
        AND TRY_CAST(LTRIM(RTRIM(d.NOFAC)) AS DECIMAL(18, 0)) = @CORR_SRC
        AND d.STATUS <> '${STATUS_ANULADO}'
      ORDER BY d.ID, l.ID
    `);

  for (const iss of issuedRes.recordset || []) {
    const qty = roundQty(iss.CANTIDAD);
    if (!(qty > 0)) continue;
    const obs = String(iss.OBS || '');
    const m = /^FFACSRC:(\d+)/i.exec(obs);
    let item = null;
    if (m) {
      const srcId = Number(m[1]);
      item = pool.find((p) => Number(p.src.ID) === srcId && p.restante > 0);
    }
    if (!item) {
      const precio = roundMoney(iss.PRECIO);
      const codprod = String(iss.CODPROD || '').trim();
      const codmedida = String(iss.CODMEDIDA || '').trim();
      item = pool.find(
        (p) =>
          p.restante > 0 &&
          String(p.src.CODPROD || '').trim() === codprod &&
          String(p.src.CODMEDIDA || '').trim() === codmedida &&
          roundMoney(p.src.PRECIO) === precio
      );
    }
    if (!item) continue;
    item.restante = roundQty(Math.max(0, item.restante - qty));
  }

  return pool;
}

function poolRestanteTotal(pool) {
  return roundMoney(
    pool.reduce((s, p) => {
      const precio = Number(p.src.PRECIO) || 0;
      const qty = Number(p.restante) || 0;
      return s + precio * qty;
    }, 0)
  );
}

function isNearInteger(n) {
  return Math.abs(Number(n) - Math.round(Number(n))) < 0.0005;
}

/**
 * Elige cantidades del pool apuntando a un monto entre minimo y maximo.
 * Nunca altera PRECIO: TOTALPRECIO = CANTIDAD × PRECIO original.
 */
function allocateFromPool(pool, minimo, maximo) {
  const remTotal = poolRestanteTotal(pool);
  if (!(remTotal > 0.005)) {
    return { picks: [], total: 0, completed: true };
  }

  const min = roundMoney(minimo);
  const max = roundMoney(maximo);
  const takeAll = remTotal <= max + 0.005;

  let target = takeAll
    ? remTotal
    : roundMoney(min + Math.random() * Math.max(0, max - min));
  if (target > remTotal) target = remTotal;
  if (!takeAll && target < min) target = Math.min(min, remTotal);

  const picks = [];
  let total = 0;

  const takeFromItem = (item, qty) => {
    const q = roundQty(qty);
    if (!(q > 0) || q > item.restante + 0.0005) return false;
    const precio = Number(item.src.PRECIO) || 0;
    const lineTotal = roundMoney(q * precio);
    item.restante = roundQty(item.restante - q);
    picks.push({ src: item.src, cantidad: q, precio, totalPrecio: lineTotal });
    total = roundMoney(total + lineTotal);
    return true;
  };

  const active = () => pool.filter((p) => p.restante > 0.0005);

  if (takeAll) {
    for (const item of active()) {
      takeFromItem(item, item.restante);
    }
    return { picks, total, completed: true };
  }

  // Varias pasadas: ir llenando hasta acercarse al target sin pasar el máximo
  // (salvo que una sola unidad ya exceda el máximo).
  for (let pass = 0; pass < 40; pass += 1) {
    if (total >= target - 0.005) break;
    const items = active();
    if (!items.length) break;

    // Orden aleatorio cada pasada
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }

    let progressed = false;
    for (const item of items) {
      if (total >= target - 0.005) break;
      const precio = Number(item.src.PRECIO) || 0;
      if (!(precio > 0)) continue;

      const roomToMax = roundMoney(max - total);
      const roomToTarget = roundMoney(target - total);
      let room = Math.min(roomToMax, roomToTarget);
      if (room <= 0) {
        // Ya en/over target; si aún no llegamos a mínimo y cabe 1 u. dentro de max, forzar
        if (total + 0.005 < min && total + precio <= max + 0.005 && item.restante > 0) {
          const unit = isNearInteger(item.src.CANTIDAD) ? 1 : Math.min(item.restante, roundQty(0.001));
          if (unit > 0 && takeFromItem(item, Math.min(item.restante, unit))) progressed = true;
        }
        continue;
      }

      let maxQty = room / precio;
      if (isNearInteger(item.src.CANTIDAD) && isNearInteger(item.restante)) {
        maxQty = Math.floor(maxQty + 1e-9);
      } else {
        maxQty = roundQty(maxQty);
      }
      let qty = Math.min(item.restante, maxQty);

      if (!(qty > 0)) {
        // Unidad indivisible mayor al room restante pero dentro de max absoluto vacío
        if (total < 0.005 && precio > max && item.restante > 0) {
          const unit = isNearInteger(item.src.CANTIDAD) ? 1 : Math.min(item.restante, roundQty(1));
          if (takeFromItem(item, Math.min(item.restante, unit))) {
            progressed = true;
            break;
          }
        }
        continue;
      }

      if (takeFromItem(item, qty)) progressed = true;
    }
    if (!progressed) break;
  }

  // Si no se pudo armar nada, tomar la menor unidad posible
  if (!picks.length) {
    const items = active().sort(
      (a, b) => (Number(a.src.PRECIO) || 0) - (Number(b.src.PRECIO) || 0)
    );
    for (const item of items) {
      const unit = isNearInteger(item.src.CANTIDAD) ? 1 : Math.min(item.restante, roundQty(0.001));
      if (unit > 0 && takeFromItem(item, Math.min(item.restante, unit))) break;
    }
  }

  const completed = poolRestanteTotal(pool) <= 0.005;
  return { picks, total, completed };
}

async function insertAllocatedDocProductos(
  transaction,
  empnit,
  dstCoddoc,
  dstCorrelativo,
  parts,
  picks
) {
  if (!picks.length) {
    const err = new Error('No se pudieron asignar productos para esta fracción');
    err.statusCode = 400;
    throw err;
  }
  const tipom = await getTipomDocumento(transaction, empnit, dstCoddoc);
  const ivaFactor = await getIvaFactor(transaction);

  for (const pick of picks) {
    const l = pick.src;
    const cantidad = roundQty(pick.cantidad);
    const precio = Number(pick.precio); // precio original, sin ajuste
    const costo = Number(l.COSTO) || 0;
    const equivale = Number(l.EQUIVALE) || 1;
    const totalUnidades = roundQty(cantidad * equivale);
    const totalCosto = roundMoney(cantidad * costo);
    const totalPrecio = roundMoney(cantidad * precio);
    const peso = Number(l.PESO) || 0;
    const totalPeso = roundQty(cantidad * peso);
    const srcQty = Number(l.CANTIDAD) || 0;
    const factor = srcQty > 0 ? cantidad / srcQty : 0;
    const cantBonif = roundQty((Number(l.CANTIDADBONIF) || 0) * factor);
    const totalBonif = roundMoney((Number(l.TOTALBONIF) || 0) * factor);
    const descuento = roundMoney((Number(l.DESCUENTO) || 0) * factor);
    const exentoFlag = Number(l.EXENTO) > 0;
    const { gravable, iva } = splitIvaFromTotal(totalPrecio, !exentoFlag, ivaFactor);
    const obs = `FFACSRC:${l.ID}`;

    await new sql.Request(transaction)
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ANIO', sql.Int, parts.anio)
      .input('MES', sql.Int, parts.mes)
      .input('DIA', sql.Int, parts.dia)
      .input('CODDOC', sql.VarChar, dstCoddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), dstCorrelativo)
      .input('CODPROD', sql.VarChar, l.CODPROD)
      .input('DESPROD', sql.VarChar, l.DESPROD)
      .input('CODMEDIDA', sql.VarChar, l.CODMEDIDA)
      .input('CANTIDAD', sql.Float, cantidad)
      .input('CANTIDADBONIF', sql.Float, cantBonif)
      .input('EQUIVALE', sql.Float, equivale)
      .input('TOTALUNIDADES', sql.Float, totalUnidades)
      .input('TOTALBONIF', sql.Float, totalBonif)
      .input('COSTO', sql.Decimal(18, 4), costo)
      .input('PRECIO', sql.Decimal(18, 4), precio)
      .input('TOTALCOSTO', sql.Decimal(18, 4), totalCosto)
      .input('TOTALPRECIO', sql.Decimal(18, 4), totalPrecio)
      .input('TOTALIVA', sql.Decimal(18, 4), iva)
      .input('TOTALSINIVA', sql.Decimal(18, 4), gravable)
      .input('COSTOANTERIOR', sql.Decimal(18, 4), Number(l.COSTOANTERIOR) || 0)
      .input('COSTOPROMEDIO', sql.Decimal(18, 4), Number(l.COSTOPROMEDIO) || 0)
      .input('CODBODEGAENTRADA', sql.Int, l.CODBODEGAENTRADA ?? DEFAULT_BODEGA)
      .input('CODBODEGASALIDA', sql.Int, l.CODBODEGASALIDA ?? DEFAULT_BODEGA)
      .input('DESCUENTO', sql.Decimal(18, 4), descuento)
      .input('PORCDESCUENTO', sql.Float, Number(l.PORCDESCUENTO) || 0)
      .input('NOSERIE', sql.VarChar, l.NOSERIE || 'SN')
      .input('EXENTO', sql.Decimal(18, 3), Number(l.EXENTO) || 0)
      .input('OBS', sql.VarChar, obs)
      .input('TIPOPROD', sql.VarChar, l.TIPOPROD || 'P')
      .input('TIPOPRECIO', sql.VarChar, l.TIPOPRECIO || 'P')
      .input('PESO', sql.Decimal(18, 3), peso)
      .input('TOTALPESO', sql.Decimal(18, 3), totalPeso)
      .input('TIPOM', sql.Int, tipom)
      .query(`
        INSERT INTO dbo.DOCPRODUCTOS (
          EMPNIT, ANIO, MES, DIA, CODDOC, CORRELATIVO, CODPROD, DESPROD, CODMEDIDA,
          CANTIDAD, CANTIDADBONIF, EQUIVALE, TOTALUNIDADES, TOTALBONIF,
          COSTO, PRECIO, TOTALCOSTO, TOTALPRECIO, TOTALIVA, TOTALSINIVA,
          ENTREGADOS_TOTALUNIDADES, ENTREGADOS_TOTALCOSTO, ENTREGADOS_TOTALPRECIO,
          COSTOANTERIOR, COSTOPROMEDIO, CODBODEGAENTRADA, CODBODEGASALIDA,
          DESCUENTO, PORCDESCUENTO, NOSERIE, EXENTO, OBS,
          TIPOPROD, TIPOPRECIO, PESO, TOTALPESO, TIPOM, LASTUPDATE
        ) VALUES (
          @EMPNIT, @ANIO, @MES, @DIA, @CODDOC, @CORRELATIVO, @CODPROD, @DESPROD, @CODMEDIDA,
          @CANTIDAD, @CANTIDADBONIF, @EQUIVALE, @TOTALUNIDADES, @TOTALBONIF,
          @COSTO, @PRECIO, @TOTALCOSTO, @TOTALPRECIO, @TOTALIVA, @TOTALSINIVA,
          @TOTALUNIDADES, @TOTALCOSTO, @TOTALPRECIO,
          @COSTOANTERIOR, @COSTOPROMEDIO, @CODBODEGAENTRADA, @CODBODEGASALIDA,
          @DESCUENTO, @PORCDESCUENTO, @NOSERIE, @EXENTO, @OBS,
          @TIPOPROD, @TIPOPRECIO, @PESO, @TOTALPESO, @TIPOM, CAST(GETDATE() AS DATE)
        )
      `);
  }
}

const CODEMBARQUE_FRAC = 'FRAC';

async function insertDocumentoFiscalHeader(tx, opts) {
  const {
    empnit,
    fechaParts,
    coddoc,
    correlativo,
    fuente,
    docNit,
    docNom,
    docDir,
    usuario,
    codembarque = 'MOSTRADOR',
  } = opts;
  const concre = String(fuente.CONCRE || 'CON').trim().toUpperCase() || 'CON';
  await new sql.Request(tx)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ANIO', sql.Int, fechaParts.anio)
    .input('MES', sql.Int, fechaParts.mes)
    .input('DIA', sql.Int, fechaParts.dia)
    .input('FECHA', sql.Date, fechaParts.fecha)
    .input('HORA', sql.Int, fechaParts.hora)
    .input('MINUTO', sql.Int, fechaParts.minuto)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('CODCLIENTE', sql.Int, fuente.CODCLIENTE ?? null)
    .input('DOC_NIT', sql.VarChar, docNit)
    .input('DOC_NOMCLIE', sql.VarChar, docNom)
    .input('DOC_DIRCLIE', sql.VarChar, docDir)
    .input('CODVEN', sql.Int, fuente.CODVEN ?? null)
    .input('CONCRE', sql.VarChar, concre)
    .input('USUARIO', sql.VarChar, usuario)
    .input('OBS', sql.VarChar, String(fuente.OBS || ''))
    .input('SERIEFAC', sql.VarChar, fuente.CODDOC)
    .input('NOFAC', sql.VarChar, String(fuente.CORRELATIVO))
    .input('CODEMBARQUE', sql.VarChar, String(codembarque || 'MOSTRADOR').slice(0, 50))
    .input(
      'CODCAJA',
      sql.Int,
      fuente.CODCAJA != null && Number(fuente.CODCAJA) > 0 ? Number(fuente.CODCAJA) : null
    )
    .query(`
      INSERT INTO dbo.DOCUMENTOS (
        EMPNIT, ANIO, MES, DIA, FECHA, HORA, MINUTO, CODDOC, CORRELATIVO,
        CODCLIENTE, DOC_NIT, DOC_NOMCLIE, DOC_DIRCLIE, CODVEN,
        TOTALCOSTO, TOTALPRECIO, CODEMBARQUE, STATUS, USUARIO, CONCRE, CORTE,
        MARCA, OBS, DOC_SALDO, DOC_ABONO, OBSMARCA, TOTALDESCUENTO, CODCAJA,
        DIRENTREGA, NOGUIA, VALORENTREGA, TOTALEXENTO, TIPOPAGO, NODOCPAGO,
        VENCIMIENTO, DIASCREDITO, TOTALIVA, TOTALSINIVA, PAGO, VUELTO,
        SERIEFAC, NOFAC
      ) VALUES (
        @EMPNIT, @ANIO, @MES, @DIA, @FECHA, @HORA, @MINUTO, @CODDOC, @CORRELATIVO,
        @CODCLIENTE, @DOC_NIT, @DOC_NOMCLIE, @DOC_DIRCLIE, @CODVEN,
        0, 0, @CODEMBARQUE, '${STATUS_OPERADO}', @USUARIO, @CONCRE, 'NO',
        'SN', @OBS, 0, 0, 'SN', 0, @CODCAJA,
        'SN', 'SN', 0, 0,
        CASE WHEN @CONCRE = 'CRE' THEN 'CREDITO' ELSE 'CONTADO' END, 'SN',
        @FECHA, 0, 0, 0, 0, 0,
        @SERIEFAC, @NOFAC
      )
    `);
}

async function assertCoddocFelTipom0(pool, empnit, coddocDest) {
  const tipoDest = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddocDest)
    .query(`
      SELECT CODDOC, DESDOC, TIPODOC, ISNULL(TIPOM, 0) AS TIPOM
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND ISNULL(ACTIVO, 'SI') = 'SI'
    `);
  if (!tipoDest.recordset.length) {
    const err = new Error(`CODDOC ${coddocDest} no encontrado o inactivo`);
    err.statusCode = 400;
    throw err;
  }
  const tipodocDest = String(tipoDest.recordset[0].TIPODOC || '').trim().toUpperCase();
  if (!TIPODOC_CERT_FAC.includes(tipodocDest)) {
    const err = new Error('Solo se permiten tipos FEF o FEC');
    err.statusCode = 400;
    throw err;
  }
  if (Number(tipoDest.recordset[0].TIPOM) !== 0) {
    const err = new Error(
      'El CODDOC seleccionado debe tener TIPOM = 0 (sin movimiento de inventario)'
    );
    err.statusCode = 400;
    throw err;
  }
  return tipoDest.recordset[0];
}

async function finalizeCola(txOrPool, empnit, idCola) {
  const colaRes = await new sql.Request(txOrPool)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, idCola)
    .query(`
      SELECT ID, CODDOC, CORRELATIVO
      FROM dbo.DOCUMENTOS_COLA_TRABAJO
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  const row = colaRes.recordset[0];
  if (!row) return { ok: false };

  await new sql.Request(txOrPool)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, idCola)
    .query(`
      UPDATE dbo.DOCUMENTOS_COLA_TRABAJO
      SET FINALIZADO = 'SI',
          FECHA_FIN = CAST(GETDATE() AS date),
          HORA_FIN = FORMAT(GETDATE(), 'HH:mm')
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);

  await new sql.Request(txOrPool)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID_COLA', sql.Int, idCola)
    .input('CODDOC', sql.VarChar, row.CODDOC)
    .input('CORRELATIVO', sql.Decimal(18, 0), row.CORRELATIVO)
    .input('CODEMBARQUE', sql.VarChar, 'FRACCIONADA')
    .query(`
      UPDATE dbo.DOCUMENTOS
      SET ID_COLA_TRABAJO = NULL,
          CODEMBARQUE = @CODEMBARQUE
      WHERE EMPNIT = @EMPNIT
        AND CODDOC = @CODDOC
        AND CORRELATIVO = @CORRELATIVO
    `);

  /* Por si otra fila quedó apuntando a la misma cola. */
  await new sql.Request(txOrPool)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID_COLA', sql.Int, idCola)
    .query(`
      UPDATE dbo.DOCUMENTOS
      SET ID_COLA_TRABAJO = NULL
      WHERE EMPNIT = @EMPNIT AND ID_COLA_TRABAJO = @ID_COLA
    `);

  await new sql.Request(txOrPool)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, idCola)
    .query(`
      DELETE FROM dbo.DOCUMENTOS_COLA_TRABAJO
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);

  return { ok: true, ID: idCola };
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .query(`
        SELECT
          c.ID, c.EMPNIT, c.TIPO, c.CODDOC, c.CORRELATIVO,
          c.FECHA_INICIO, c.HORA_INICIO, c.FINALIZADO, c.FECHA_FIN, c.HORA_FIN,
          d.DOC_NIT, d.DOC_NOMCLIE, d.DOC_DIRCLIE, d.STATUS AS DOC_STATUS,
          d.TOTALPRECIO, ISNULL(d.CONCRE, 'CON') AS CONCRE, d.FEL_UUDI, t.TIPODOC, t.DESDOC,
          ISNULL((
            SELECT SUM(ISNULL(df.TOTALPRECIO, 0))
            FROM dbo.DOCUMENTOS df
            INNER JOIN dbo.TIPODOCUMENTOS tf
              ON tf.EMPNIT = df.EMPNIT AND tf.CODDOC = df.CODDOC
            WHERE df.EMPNIT = c.EMPNIT
              AND df.SERIEFAC = c.CODDOC
              AND TRY_CAST(LTRIM(RTRIM(df.NOFAC)) AS DECIMAL(18, 0)) = c.CORRELATIVO
              AND tf.TIPODOC IN (${tipodocSqlIn(TIPODOC_CERT_FAC)})
              AND ISNULL(df.STATUS, '') <> '${STATUS_ANULADO}'
          ), 0) AS TOTAL_EMITIDO,
          ISNULL((
            SELECT COUNT(*)
            FROM dbo.DOCUMENTOS df
            INNER JOIN dbo.TIPODOCUMENTOS tf
              ON tf.EMPNIT = df.EMPNIT AND tf.CODDOC = df.CODDOC
            WHERE df.EMPNIT = c.EMPNIT
              AND df.SERIEFAC = c.CODDOC
              AND TRY_CAST(LTRIM(RTRIM(df.NOFAC)) AS DECIMAL(18, 0)) = c.CORRELATIVO
              AND tf.TIPODOC IN (${tipodocSqlIn(TIPODOC_CERT_FAC)})
              AND ISNULL(df.STATUS, '') <> '${STATUS_ANULADO}'
              AND (
                LTRIM(RTRIM(ISNULL(df.CODEMBARQUE, ''))) = '${CODEMBARQUE_FRAC}'
                OR LTRIM(RTRIM(ISNULL(df.CODEMBARQUE, ''))) LIKE '${CODEMBARQUE_FRAC}-%'
              )
          ), 0) AS DOCS_FRAC
        FROM dbo.DOCUMENTOS_COLA_TRABAJO c
        LEFT JOIN dbo.DOCUMENTOS d
          ON d.EMPNIT = c.EMPNIT AND d.CODDOC = c.CODDOC AND d.CORRELATIVO = c.CORRELATIVO
        LEFT JOIN dbo.TIPODOCUMENTOS t
          ON t.EMPNIT = c.EMPNIT AND t.CODDOC = c.CODDOC
        WHERE c.EMPNIT = @EMPNIT
          AND ISNULL(c.FINALIZADO, 'NO') <> 'SI'
        ORDER BY c.ID DESC
      `);
    res.json({ rows: normalizeDocumentoRows(result.recordset) });
  } catch (err) {
    console.warn('[API GET /fraccionamiento-fac]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** CODDOCs FEF/FEC activos + correlativo siguiente (preview). */
router.get('/tipodocs-fel', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await listCoddocsFel(pool, empnit);
    const withNext = [];
    for (const r of rows) {
      const next = await peekNextCorrelativo(pool, empnit, r.CODDOC);
      withNext.push({
        CODDOC: r.CODDOC,
        DESDOC: r.DESDOC,
        TIPODOC: String(r.TIPODOC || '').trim().toUpperCase(),
        CORRELATIVO_SIGUIENTE: next,
      });
    }
    const maximoLegal = await getMaximoFraccionamientoLegal(pool);
    res.json({ rows: withNext, maximoLegal });
  } catch (err) {
    console.warn('[API GET /fraccionamiento-fac/tipodocs-fel]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Recarga correlativo siguiente para un CODDOC (evitar duplicados). */
router.get('/correlativo-siguiente', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const coddoc = String(req.query.coddoc || '').trim();
  if (!coddoc) return res.status(400).json({ error: 'CODDOC requerido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const next = await peekNextCorrelativo(pool, empnit, coddoc);
    res.json({ CODDOC: coddoc, CORRELATIVO_SIGUIENTE: next });
  } catch (err) {
    console.warn('[API GET /fraccionamiento-fac/correlativo-siguiente]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Datos para el modal Certificar toda. */
router.get('/:id/prep-certificar', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const cola = await loadColaRow(pool, empnit, id);
    if (!cola) return res.status(404).json({ error: 'Registro de cola no encontrado' });
    if (String(cola.FINALIZADO || '').trim().toUpperCase() === 'SI') {
      return res.status(409).json({ error: 'Este registro de cola ya está finalizado' });
    }
    const doc = await loadDocumentoFuente(pool, empnit, cola.CODDOC, cola.CORRELATIVO);
    if (!doc) return res.status(404).json({ error: 'Documento fuente no encontrado' });
    if (String(doc.STATUS || '').trim().toUpperCase() === STATUS_ANULADO) {
      return res.status(400).json({ error: 'El documento fuente está anulado' });
    }
    const tipodocs = await listCoddocsFel(pool, empnit);
    const tipodocsConCorr = [];
    for (const r of tipodocs) {
      tipodocsConCorr.push({
        CODDOC: r.CODDOC,
        DESDOC: r.DESDOC,
        TIPODOC: String(r.TIPODOC || '').trim().toUpperCase(),
        CORRELATIVO_SIGUIENTE: await peekNextCorrelativo(pool, empnit, r.CODDOC),
      });
    }
    const fechaDoc = fechaIsoFromRow(doc) || '';
    // Default del modal «certificar toda»: hoy (no la fecha del documento fuente).
    const fechaModalDefault = nowParts().fecha;
    res.json({
      cola: normalizeDocumentoRows([cola])[0],
      documento: {
        CODDOC: doc.CODDOC,
        CORRELATIVO: doc.CORRELATIVO,
        TIPODOC: String(doc.TIPODOC || '').trim().toUpperCase(),
        DESDOC: doc.DESDOC,
        DOC_NIT: doc.DOC_NIT || 'CF',
        DOC_NOMCLIE: doc.DOC_NOMCLIE || '',
        DOC_DIRCLIE: doc.DOC_DIRCLIE || '',
        CODCLIENTE: doc.CODCLIENTE,
        TOTALPRECIO: doc.TOTALPRECIO,
        FEL_UUDI: doc.FEL_UUDI || '',
        STATUS: doc.STATUS,
        FECHA: fechaDoc,
        ANIO: doc.ANIO,
        MES: doc.MES,
        DIA: doc.DIA,
        HORA: doc.HORA,
        MINUTO: doc.MINUTO,
      },
      tipodocs: tipodocsConCorr,
      fechaEmision: fechaModalDefault,
      fechaCertificacion: fechaModalDefault,
    });
  } catch (err) {
    console.warn('[API GET /fraccionamiento-fac/:id/prep-certificar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Genera FEF/FEC desde el documento de la cola (sin movimiento de inventario),
 * actualiza datos de cliente y certifica FEL.
 */
router.post('/:id/certificar-toda', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  const coddocDest = String(req.body?.CODDOC || '').trim();
  const docNit = String(req.body?.DOC_NIT || req.body?.NIT || 'CF').trim() || 'CF';
  const docNom = String(req.body?.DOC_NOMCLIE || req.body?.NOMBRE || '').trim();
  const docDir = String(req.body?.DOC_DIRCLIE || req.body?.DIRECCION || 'CIUDAD').trim() || 'CIUDAD';
  const usuario = String(req.body?.USUARIO || req.body?.usuario || req.headers['x-user'] || 'FAC').trim();
  const fechaRaw = req.body?.FECHA || req.body?.fechaEmision || req.body?.fechaCertificacion;
  // Certificar toda: emisión y certificación usan solo la fecha del modal (no la del documento).
  const parsedFecha = parseFechaInput(fechaRaw);
  if (!parsedFecha) {
    return res.status(400).json({ error: 'Fecha de emisión/certificación requerida (del modal)' });
  }
  const now = nowParts();
  const fechaParts = {
    ...now,
    anio: parsedFecha.anio,
    mes: parsedFecha.mes,
    dia: parsedFecha.dia,
    fecha: parsedFecha.fecha,
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const felFechaModal = `${fechaParts.fecha}T${pad2(fechaParts.hora)}:${pad2(fechaParts.minuto)}:00-06:00`;

  try {
    const pool = await req.app.locals.getDbPool();
    const cola = await loadColaRow(pool, empnit, id);
    if (!cola) return res.status(404).json({ error: 'Registro de cola no encontrado' });
    if (String(cola.FINALIZADO || '').trim().toUpperCase() === 'SI') {
      return res.status(409).json({ error: 'Este registro de cola ya está finalizado' });
    }

    const fuente = await loadDocumentoFuente(pool, empnit, cola.CODDOC, cola.CORRELATIVO);
    if (!fuente) return res.status(404).json({ error: 'Documento fuente no encontrado' });
    if (String(fuente.STATUS || '').trim().toUpperCase() !== STATUS_OPERADO) {
      return res.status(400).json({ error: 'El documento fuente debe estar operado' });
    }

    if (!coddocDest) return res.status(400).json({ error: 'Seleccione un CODDOC (FEF o FEC)' });
    if (!docNom) return res.status(400).json({ error: 'Nombre de cliente requerido' });

    await assertCoddocFelTipom0(pool, empnit, coddocDest);

    const tipodocFuente = String(fuente.TIPODOC || '').trim().toUpperCase();
    if (TIPODOC_CERT_FAC.includes(tipodocFuente) && String(fuente.FEL_UUDI || '').trim()) {
      return res.status(409).json({ error: 'El documento fuente ya está certificado ante SAT' });
    }

    // Enlace a la factura original de la cola (nunca se modifica su fecha).
    const serieFacOrigen = String(fuente.CODDOC || '').trim();

    const existentes = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('SERIEFAC', sql.VarChar, serieFacOrigen)
      .input('CORR_SRC', sql.Decimal(18, 0), Number(fuente.CORRELATIVO))
      .query(`
          SELECT TOP 1 d.CODDOC, d.CORRELATIVO, d.FEL_UUDI
          FROM dbo.DOCUMENTOS d
          JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
          WHERE d.EMPNIT = @EMPNIT
            AND t.TIPODOC IN (${tipodocSqlIn(TIPODOC_CERT_FAC)})
            AND d.SERIEFAC = @SERIEFAC
            AND TRY_CAST(LTRIM(RTRIM(d.NOFAC)) AS DECIMAL(18, 0)) = @CORR_SRC
            AND d.STATUS <> '${STATUS_ANULADO}'
          ORDER BY CASE WHEN ISNULL(LTRIM(RTRIM(d.FEL_UUDI)), '') <> '' THEN 0 ELSE 1 END,
                   d.CORRELATIVO DESC
        `);

    let coddocCert;
    let correlativoCert;
    const existente = existentes.recordset[0];

    if (existente && String(existente.FEL_UUDI || '').trim()) {
      return res.status(409).json({
        error: `Ya existe documento fiscal certificado ${existente.CODDOC} #${existente.CORRELATIVO} para esta factura`,
      });
    }

    if (existente) {
      // Reintento: actualizar solo la copia fiscal pendiente (no el documento original).
      coddocCert = existente.CODDOC;
      correlativoCert = Number(existente.CORRELATIVO);
      await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODDOC', sql.VarChar, coddocCert)
        .input('CORRELATIVO', sql.Decimal(18, 0), correlativoCert)
        .input('DOC_NIT', sql.VarChar, docNit)
        .input('DOC_NOMCLIE', sql.VarChar, docNom)
        .input('DOC_DIRCLIE', sql.VarChar, docDir)
        .input('ANIO', sql.Int, fechaParts.anio)
        .input('MES', sql.Int, fechaParts.mes)
        .input('DIA', sql.Int, fechaParts.dia)
        .input('FECHA', sql.Date, fechaParts.fecha)
        .input('HORA', sql.Int, fechaParts.hora)
        .input('MINUTO', sql.Int, fechaParts.minuto)
        .query(`
          UPDATE dbo.DOCUMENTOS
          SET DOC_NIT = @DOC_NIT,
              DOC_NOMCLIE = @DOC_NOMCLIE,
              DOC_DIRCLIE = @DOC_DIRCLIE,
              ANIO = @ANIO, MES = @MES, DIA = @DIA, FECHA = @FECHA,
              HORA = @HORA, MINUTO = @MINUTO
          WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
        `);
    } else {
      // Nueva copia FEF/FEC con la fecha del modal.
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        correlativoCert = await allocateCorrelativo(tx, empnit, coddocDest);
        coddocCert = coddocDest;
        await insertDocumentoFiscalHeader(tx, {
          empnit,
          fechaParts,
          coddoc: coddocCert,
          correlativo: correlativoCert,
          fuente,
          docNit,
          docNom,
          docDir,
          usuario,
        });
        await copyDocProductos(
          tx,
          empnit,
          fuente.CODDOC,
          fuente.CORRELATIVO,
          coddocCert,
          correlativoCert,
          fechaParts
        );
        await recalcDocumentTotals(tx, empnit, coddocCert, correlativoCert);
        await tx.commit();
      } catch (inner) {
        try {
          await tx.rollback();
        } catch (_) {
          /* ignore */
        }
        throw inner;
      }
    }

    let fel;
    try {
      fel = await certificarDocumentoFel(pool, empnit, coddocCert, correlativoCert, {
        fechaCertificacion: felFechaModal,
      });
    } catch (felErr) {
      // Documento fiscal pudo crearse; la cola sigue abierta para reintento
      throw felErr;
    }

    try {
      await finalizeCola(pool, empnit, id);
    } catch (finErr) {
      console.warn('[fraccionamiento-fac] cola no finalizada tras FEL:', finErr.message);
    }

    res.json({
      ok: true,
      colaId: id,
      documento: { CODDOC: coddocCert, CORRELATIVO: correlativoCert },
      fel: fel.fel,
      satTipo: fel.satTipo,
    });
  } catch (err) {
    console.warn('[API POST /fraccionamiento-fac/:id/certificar-toda]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * Genera una factura fiscal CF parcial repartiendo CANTIDAD de productos
 * sin alterar PRECIO/CODPROD/CODMEDIDA. body: { CODDOC, minimo, maximo, FECHA?, USUARIO? }
 */
router.post('/:id/fraccionar-cf', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  const coddocDest = String(req.body?.CODDOC || '').trim();
  const minimo = roundMoney(req.body?.minimo ?? req.body?.MINIMO);
  const maximo = roundMoney(req.body?.maximo ?? req.body?.MAXIMO);
  const usuario = String(req.body?.USUARIO || req.body?.usuario || req.headers['x-user'] || 'FAC').trim();
  const docNit = 'CF';
  const docNom = 'CONSUMIDOR FINAL';
  const docDir = 'CIUDAD';

  let fechaParts;
  const fechaRaw = req.body?.FECHA || req.body?.fechaCertificacion;
  if (fechaRaw) {
    const parsed = parseFechaInput(fechaRaw);
    if (!parsed) return res.status(400).json({ error: 'Fecha inválida' });
    const now = nowParts();
    fechaParts = {
      ...now,
      anio: parsed.anio,
      mes: parsed.mes,
      dia: parsed.dia,
      fecha: parsed.fecha,
    };
  } else {
    fechaParts = nowParts();
  }

  if (!coddocDest) return res.status(400).json({ error: 'Seleccione un CODDOC (FEF o FEC) en Parámetros' });
  if (!(minimo > 0)) return res.status(400).json({ error: 'Mínimo inválido' });
  if (!(maximo > 0)) return res.status(400).json({ error: 'Máximo inválido' });
  if (maximo < minimo) return res.status(400).json({ error: 'El máximo debe ser ≥ al mínimo' });

  try {
    const pool = await req.app.locals.getDbPool();
    const maximoLegal = await getMaximoFraccionamientoLegal(pool);
    if (maximo > maximoLegal) {
      return res.status(400).json({
        error: `El máximo no puede superar Q ${maximoLegal.toFixed(2)} (configuración legal)`,
      });
    }
    const cola = await loadColaRow(pool, empnit, id);
    if (!cola) return res.status(404).json({ error: 'Registro de cola no encontrado' });
    if (String(cola.FINALIZADO || '').trim().toUpperCase() === 'SI') {
      return res.status(409).json({ error: 'Este registro de cola ya está finalizado' });
    }

    const fuente = await loadDocumentoFuente(pool, empnit, cola.CODDOC, cola.CORRELATIVO);
    if (!fuente) return res.status(404).json({ error: 'Documento fuente no encontrado' });
    if (String(fuente.STATUS || '').trim().toUpperCase() !== STATUS_OPERADO) {
      return res.status(400).json({ error: 'El documento fuente debe estar operado' });
    }

    await assertCoddocFelTipom0(pool, empnit, coddocDest);

    const poolProducts = await buildRemainingProductPool(
      pool,
      empnit,
      fuente.CODDOC,
      fuente.CORRELATIVO
    );
    const restanteAntes = poolRestanteTotal(poolProducts);
    if (!(restanteAntes > 0.005)) {
      try {
        await finalizeCola(pool, empnit, id);
      } catch (_) {
        /* ignore */
      }
      return res.json({
        ok: true,
        colaId: id,
        alreadyDone: true,
        progreso: {
          totalFuente: roundMoney(fuente.TOTALPRECIO),
          emitido: roundMoney(fuente.TOTALPRECIO),
          restante: 0,
          completado: true,
        },
      });
    }

    const allocation = allocateFromPool(poolProducts, minimo, maximo);
    if (!allocation.picks.length) {
      return res.status(400).json({
        error:
          'No se pudo armar una fracción con los productos restantes (revise mínimo/máximo vs precios unitarios)',
      });
    }

    let coddocCert;
    let correlativoCert;
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      correlativoCert = await allocateCorrelativo(tx, empnit, coddocDest);
      coddocCert = coddocDest;
      await insertDocumentoFiscalHeader(tx, {
        empnit,
        fechaParts,
        coddoc: coddocCert,
        correlativo: correlativoCert,
        fuente,
        docNit,
        docNom,
        docDir,
        usuario,
        codembarque: `${CODEMBARQUE_FRAC}-${fuente.CODDOC}-${fuente.CORRELATIVO}`,
      });
      await insertAllocatedDocProductos(
        tx,
        empnit,
        coddocCert,
        correlativoCert,
        fechaParts,
        allocation.picks
      );
      await recalcDocumentTotals(tx, empnit, coddocCert, correlativoCert);
      await tx.commit();
    } catch (inner) {
      try {
        await tx.rollback();
      } catch (_) {
        /* ignore */
      }
      throw inner;
    }

    let fel = null;
    let felError = null;
    try {
      fel = await certificarDocumentoFel(pool, empnit, coddocCert, correlativoCert);
    } catch (felErr) {
      // El documento fiscal ya quedó creado; el fraccionamiento continúa sin FEL
      felError = felErr.message || 'No se pudo certificar FEL';
      console.warn(
        `[fraccionamiento-fac] FEL omitido ${coddocCert}#${correlativoCert}:`,
        felError
      );
    }

    const poolAfter = await buildRemainingProductPool(
      pool,
      empnit,
      fuente.CODDOC,
      fuente.CORRELATIVO
    );
    const restanteDespues = poolRestanteTotal(poolAfter);
    const completado = restanteDespues <= 0.005;

    if (completado) {
      try {
        await finalizeCola(pool, empnit, id);
      } catch (finErr) {
        console.warn('[fraccionamiento-fac] cola no finalizada tras fraccionar:', finErr.message);
      }
    }

    const sourceTotal = roundMoney(fuente.TOTALPRECIO);
    const emitidoDespues = roundMoney(sourceTotal - restanteDespues);

    res.json({
      ok: true,
      colaId: id,
      documento: {
        CODDOC: coddocCert,
        CORRELATIVO: correlativoCert,
        TOTALPRECIO: allocation.total,
        LINEAS: allocation.picks.length,
      },
      fel: fel?.fel || null,
      satTipo: fel?.satTipo || null,
      felError,
      progreso: {
        totalFuente: sourceTotal,
        emitido: emitidoDespues,
        restante: restanteDespues,
        completado,
      },
    });
  } catch (err) {
    console.warn('[API POST /fraccionamiento-fac/:id/fraccionar-cf]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    await assertAdminPass(pool, req.body?.pass ?? req.body?.clave);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const cola = await new sql.Request(tx)
        .input('EMPNIT', sql.VarChar, empnit)
        .input('ID', sql.Int, id)
        .query(`
          SELECT ID, CODDOC, CORRELATIVO
          FROM dbo.DOCUMENTOS_COLA_TRABAJO WITH (UPDLOCK, ROWLOCK)
          WHERE EMPNIT = @EMPNIT AND ID = @ID
        `);
      if (!cola.recordset.length) {
        await tx.rollback();
        return res.status(404).json({ error: 'Registro no encontrado' });
      }
      const row = cola.recordset[0];

      await new sql.Request(tx)
        .input('EMPNIT', sql.VarChar, empnit)
        .input('ID_COLA', sql.Int, id)
        .input('CODDOC', sql.VarChar, row.CODDOC)
        .input('CORRELATIVO', sql.Decimal(18, 0), row.CORRELATIVO)
        .query(`
          UPDATE dbo.DOCUMENTOS
          SET ID_COLA_TRABAJO = NULL
          WHERE EMPNIT = @EMPNIT
            AND (
              ID_COLA_TRABAJO = @ID_COLA
              OR (CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO AND ID_COLA_TRABAJO = @ID_COLA)
            )
        `);

      await new sql.Request(tx)
        .input('EMPNIT', sql.VarChar, empnit)
        .input('ID', sql.Int, id)
        .query(`
          DELETE FROM dbo.DOCUMENTOS_COLA_TRABAJO
          WHERE EMPNIT = @EMPNIT AND ID = @ID
        `);

      await tx.commit();
      res.json({ ok: true, ID: id });
    } catch (inner) {
      try {
        await tx.rollback();
      } catch (_) {
        /* ignore */
      }
      throw inner;
    }
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.warn('[API DELETE /fraccionamiento-fac/:id]', err.message);
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
