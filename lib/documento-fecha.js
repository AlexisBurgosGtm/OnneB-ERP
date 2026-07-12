/**
 * Fechas de documento (solo calendario, sin desfase por zona horaria).
 */
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Guatemala';

function dateOnlyString(anio, mes, dia) {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** @deprecated Use dateOnlyString — valor para sql.Date (YYYY-MM-DD). */
function localDateOnly(anio, mes, dia) {
  return dateOnlyString(anio, mes, dia);
}

function calendarPartsInTimeZone(date = new Date(), timeZone = APP_TIMEZONE) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const pick = (type) => Number(parts.find((p) => p.type === type)?.value);
  const anio = pick('year');
  const mes = pick('month');
  const dia = pick('day');
  const hora = pick('hour');
  const minuto = pick('minute');
  return {
    anio,
    mes,
    dia,
    hora,
    minuto,
    fecha: dateOnlyString(anio, mes, dia),
  };
}

function nowParts() {
  return calendarPartsInTimeZone(new Date());
}

function parseFechaInput(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const anio = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  const dia = parseInt(m[3], 10);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(dia)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return {
    anio,
    mes,
    dia,
    fecha: dateOnlyString(anio, mes, dia),
  };
}

function fechaIsoFromRow(row) {
  if (!row) return '';
  const anio = Number(row.ANIO);
  const mes = Number(row.MES);
  const dia = Number(row.DIA);
  if (Number.isFinite(anio) && Number.isFinite(mes) && Number.isFinite(dia) && mes >= 1 && mes <= 12 && dia >= 1) {
    return dateOnlyString(anio, mes, dia);
  }
  const s = String(row.FECHA ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  if (/T00:00:00(\.000)?Z$/i.test(s)) {
    return dateOnlyString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return dateOnlyString(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function normalizeDocumentoRow(row) {
  if (!row || typeof row !== 'object') return row;
  const iso = fechaIsoFromRow(row);
  if (iso) row.FECHA = iso;
  return row;
}

function normalizePedidoResponse(pedido) {
  if (!pedido || typeof pedido !== 'object') return pedido;
  if (pedido.header) normalizeDocumentoRow(pedido.header);
  return pedido;
}

function normalizeDocumentoRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => normalizeDocumentoRow(row));
}

function bindDocumentoFechaDiaParams(request, sql, fechaParts) {
  return request
    .input('ANIO', sql.Int, fechaParts.anio)
    .input('MES', sql.Int, fechaParts.mes)
    .input('DIA', sql.Int, fechaParts.dia)
    .input('FECHA', sql.Date, fechaParts.fecha);
}

/** Filtro por día calendario del documento (ANIO/MES/DIA, con respaldo en FECHA). */
function sqlDocumentoFechaDiaWhere(alias = 'd') {
  const a = alias;
  return `(
    (${a}.ANIO = @ANIO AND ${a}.MES = @MES AND ${a}.DIA = @DIA)
    OR (
      (ISNULL(${a}.ANIO, 0) = 0 OR ISNULL(${a}.MES, 0) = 0 OR ISNULL(${a}.DIA, 0) = 0)
      AND CAST(${a}.FECHA AS DATE) = CAST(@FECHA AS DATE)
    )
  )`;
}

async function applyDocumentoFecha(transaction, sql, empnit, coddoc, correlativo, parts) {
  const fecha =
    typeof parts.fecha === 'string'
      ? parts.fecha
      : dateOnlyString(parts.anio, parts.mes, parts.dia);
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('FECHA', sql.Date, fecha)
    .input('ANIO', sql.Int, parts.anio)
    .input('MES', sql.Int, parts.mes)
    .input('DIA', sql.Int, parts.dia)
    .query(`
      UPDATE dbo.DOCUMENTOS
      SET FECHA = @FECHA, ANIO = @ANIO, MES = @MES, DIA = @DIA
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
        AND STATUS = 'O'
    `);

  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('ANIO', sql.Int, parts.anio)
    .input('MES', sql.Int, parts.mes)
    .input('DIA', sql.Int, parts.dia)
    .query(`
      UPDATE dbo.DOCPRODUCTOS
      SET ANIO = @ANIO, MES = @MES, DIA = @DIA
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
}

module.exports = {
  APP_TIMEZONE,
  parseFechaInput,
  applyDocumentoFecha,
  nowParts,
  localDateOnly,
  dateOnlyString,
  fechaIsoFromRow,
  normalizeDocumentoRow,
  normalizeDocumentoRows,
  normalizePedidoResponse,
  bindDocumentoFechaDiaParams,
  sqlDocumentoFechaDiaWhere,
};
