/**
 * Dispara los reportes de WhatsApp programados, sin navegador.
 * Hora y día se comparan con el reloj de esta PC.
 */
const sql = require('mssql');
const { getStatus, sendDocument, tryAutoConnect, hasSavedAuth } = require('./whatsapp-baileys');
const { ensureWhatsappProgramacionSchema, reporteByCodigo } = require('./whatsapp-programacion');
const { buildReportePdf } = require('./whatsapp-reportes');
const { isDbConfigured } = require('../config/database');

const TICK_MS = 30000;
const RETRY_MS = 3 * 60 * 1000;
const failAt = new Map();

let timer = null;
let running = false;

function schedDebug() {
  return (
    String(process.env.DEBUG_WHATSAPP || '').trim() === '1' ||
    String(process.env.WHATSAPP_SCHEDULER || '').trim() === '1'
  );
}

function logProg(message, err) {
  if (err && schedDebug()) {
    console.warn('[WhatsApp prog]', message, err?.message || err);
    if (err?.stack) console.warn(err.stack);
    return;
  }
  if (err) {
    console.warn('[WhatsApp prog]', message, err?.message || String(err));
    return;
  }
  if (schedDebug()) console.warn('[WhatsApp prog]', message);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function localNow(date = new Date()) {
  const jsDay = date.getDay();
  return {
    ymd: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    hm: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    dia: jsDay === 0 ? '7' : String(jsDay),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureWhatsappReady() {
  if (getStatus().state === 'ready') return true;
  if (!hasSavedAuth()) return false;
  try {
    await tryAutoConnect();
  } catch (err) {
    logProg('auto-conexión falló', err);
  }
  return getStatus().state === 'ready';
}

async function listDue(pool, now) {
  const result = await pool
    .request()
    .input('HOY', sql.VarChar(10), now.ymd)
    .input('HM', sql.VarChar(5), now.hm)
    .input('DIA', sql.VarChar(1), now.dia)
    .query(`
      SELECT p.ID, p.EMPNIT, p.REPORTE, RTRIM(p.HORA) AS HORA
      FROM dbo.whatsapp_programacion p
      WHERE p.ACTIVO = 'SI'
        AND (',' + REPLACE(ISNULL(p.DIAS, ''), ' ', '') + ',') LIKE '%,' + @DIA + ',%'
        AND RTRIM(p.HORA) <= @HM
        AND (
          p.ULTIMO_ENVIO IS NULL
          OR CAST(p.ULTIMO_ENVIO AS date) < CAST(@HOY AS date)
        )
        AND p.FECHA_CREACION < CAST(@HOY + ' ' + RTRIM(p.HORA) + ':00' AS datetime)
    `);
  return result.recordset || [];
}

async function claim(pool, row, hoy) {
  const result = await pool
    .request()
    .input('ID', sql.Int, row.ID)
    .input('EMPNIT', sql.VarChar(20), row.EMPNIT)
    .input('HOY', sql.VarChar(10), hoy)
    .query(`
      UPDATE dbo.whatsapp_programacion
      SET ULTIMO_ENVIO = GETDATE()
      WHERE ID = @ID AND EMPNIT = @EMPNIT
        AND ACTIVO = 'SI'
        AND (
          ULTIMO_ENVIO IS NULL
          OR CAST(ULTIMO_ENVIO AS date) < CAST(@HOY AS date)
        )
    `);
  return Number(result.rowsAffected?.[0] || 0) === 1;
}

async function release(pool, row) {
  await pool
    .request()
    .input('ID', sql.Int, row.ID)
    .input('EMPNIT', sql.VarChar(20), row.EMPNIT)
    .query(`
      UPDATE dbo.whatsapp_programacion
      SET ULTIMO_ENVIO = NULL
      WHERE ID = @ID AND EMPNIT = @EMPNIT
    `);
}

async function listContactos(pool, row) {
  const result = await pool
    .request()
    .input('ID', sql.Int, row.ID)
    .input('EMPNIT', sql.VarChar(20), row.EMPNIT)
    .query(`
      SELECT c.NOMBRE, c.TELEFONO
      FROM dbo.whatsapp_programacion_contactos pc
      INNER JOIN dbo.whatsapp_contactos c
        ON c.EMPNIT = pc.EMPNIT AND c.ID = pc.CONTACTO_ID
      WHERE pc.EMPNIT = @EMPNIT
        AND pc.PROGRAMACION_ID = @ID
        AND c.ACTIVO = 'SI'
        AND LTRIM(RTRIM(ISNULL(c.TELEFONO, ''))) <> ''
    `);
  return result.recordset || [];
}

async function sendOne(row, pool, hoy) {
  const key = `${row.EMPNIT}:${row.ID}:${hoy}`;
  const lastFail = failAt.get(key) || 0;
  if (Date.now() - lastFail < RETRY_MS) return;

  const ready = await ensureWhatsappReady();
  if (!ready) {
    if (!lastFail) {
      logProg(
        `envío pospuesto (ID ${row.ID}): WhatsApp ${getStatus().state || 'idle'} — vincule sesión en Configuraciones`
      );
    }
    failAt.set(key, Date.now());
    return;
  }

  const claimed = await claim(pool, row, hoy);
  if (!claimed) return;

  const meta = reporteByCodigo(row.REPORTE);
  try {
    const contactos = await listContactos(pool, row);
    if (!contactos.length) {
      logProg(`ID ${row.ID}: sin contactos activos, se omite`);
      await release(pool, row).catch(() => {});
      return;
    }
    const pdf = await buildReportePdf(pool, row.EMPNIT, row.REPORTE, hoy);
    const caption = `${meta?.nombre || 'Reporte'} · ${hoy.split('-').reverse().join('/')}`;
    let enviados = 0;
    for (const contacto of contactos) {
      try {
        await sendDocument(contacto.TELEFONO, {
          filePath: pdf.filePath,
          fileName: pdf.fileName,
          caption,
        });
        enviados += 1;
        await sleep(1200);
      } catch (err) {
        logProg(`ID ${row.ID}: fallo envío a ${contacto.TELEFONO}`, err);
      }
    }
    if (!enviados) {
      await release(pool, row);
      failAt.set(key, Date.now());
      logProg(`ID ${row.ID}: ningún contacto recibió el PDF (${row.REPORTE})`);
      return;
    }
    failAt.delete(key);
    logProg(`ID ${row.ID}: enviado ${row.REPORTE} a ${enviados} contacto(s)`);
  } catch (err) {
    await release(pool, row).catch(() => {});
    failAt.set(key, Date.now());
    logProg(`ID ${row.ID}: error generando/enviando ${row.REPORTE}`, err);
  }
}

async function tick(getPool) {
  if (running) return;
  running = true;
  try {
    if (!isDbConfigured()) {
      logProg('sin DB_* en .env junto al .exe — programación inactiva');
      return;
    }
    const pool = await getPool();
    if (!pool) {
      logProg('no hay pool SQL (revise .env / SQL Server)');
      return;
    }
    await ensureWhatsappProgramacionSchema(pool);
    if (hasSavedAuth() && getStatus().state !== 'ready') {
      await ensureWhatsappReady();
    }
    const now = localNow();
    const due = await listDue(pool, now);
    if (due.length && schedDebug()) {
      logProg(`${due.length} programación(es) pendiente(s) a las ${now.hm}`);
    }
    for (const row of due) {
      await sendOne(row, pool, now.ymd);
    }
  } catch (err) {
    logProg('error en ciclo programado', err);
  } finally {
    running = false;
  }
}

function startWhatsappScheduler(getPool) {
  if (timer || typeof getPool !== 'function') return;
  const run = () => {
    tick(getPool).catch((err) => logProg('tick no controlado', err));
  };
  setTimeout(run, 8000);
  timer = setInterval(run, TICK_MS);
}

module.exports = {
  startWhatsappScheduler,
  localNow,
};
