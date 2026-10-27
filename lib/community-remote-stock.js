const sql = require('mssql');
const { getAppToken } = require('./app-token');
const { getUpdateDbPool } = require('./update-db-pool');
const { checkTokenActivo } = require('./community-token');
const FETCH_TIMEOUT_MS = 15000;

function normalizeBaseLink(link) {
  return String(link || '').trim().replace(/\/+$/, '');
}

async function listSedesWithLinkForToken(pool, token) {
  const col = await pool.request().query(`
    SELECT COL_LENGTH('dbo.COMMUNITY_EMPRESAS_SYNC', 'LINK') AS linkLen
  `);
  const hasLink = col.recordset?.[0]?.linkLen != null;
  if (!hasLink) return [];

  const result = await pool
    .request()
    .input('TOKEN', sql.VarChar, token)
    .query(`
      SELECT
        LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) AS EMPNIT,
        LTRIM(RTRIM(ISNULL(EMPNOMBRE, ''))) AS EMPNOMBRE,
        NULLIF(LTRIM(RTRIM(CAST(LINK AS NVARCHAR(500)))), '') AS LINK
      FROM dbo.COMMUNITY_EMPRESAS_SYNC
      WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
        AND NULLIF(LTRIM(RTRIM(CAST(LINK AS NVARCHAR(500)))), '') IS NOT NULL
      ORDER BY EMPNOMBRE, EMPNIT
    `);
  return result.recordset || [];
}

async function fetchProductoFromSedeLink(link, empnit, codprod) {
  const base = normalizeBaseLink(link);
  if (!base) {
    const err = new Error('Enlace de sede no configurado');
    err.statusCode = 400;
    throw err;
  }
  const params = new URLSearchParams({
    empnit: String(empnit || '').trim(),
    codprod: String(codprod || '').trim(),
  });
  const url = `${base}/api/consultas-externas/producto?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      const msg = body?.error || text?.slice(0, 200) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.statusCode = res.status >= 400 && res.status < 600 ? res.status : 502;
      throw err;
    }
    if (!body || typeof body !== 'object') {
      const err = new Error('Respuesta inválida de la sede remota');
      err.statusCode = 502;
      throw err;
    }
    return {
      CODPROD: String(body.CODPROD ?? '').trim(),
      DESPROD: String(body.DESPROD ?? '').trim(),
      DESMARCA: String(body.DESMARCA ?? '').trim(),
      EXISTENCIA: Number(body.EXISTENCIA) || 0,
      FISICO: Number(body.FISICO) || 0,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Tiempo de espera agotado al consultar la sede');
      timeoutErr.statusCode = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchStockAcrossSedes(codprod) {
  const token = getAppToken();
  if (!token) {
    const err = new Error('TOKEN no configurado en .env');
    err.statusCode = 503;
    throw err;
  }
  const pool = await getUpdateDbPool();
  const tokenCheck = await checkTokenActivo(pool, token);
  if (!tokenCheck.ok) {
    const err = new Error(tokenCheck.error || 'TOKEN inactivo');
    err.statusCode = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
    throw err;
  }

  const sedes = await listSedesWithLinkForToken(pool, token);
  const cod = String(codprod || '').trim();
  const rows = await Promise.all(
    sedes.map(async (sede) => {
      const empnombre = String(sede.EMPNOMBRE || sede.EMPNIT || '').trim() || sede.EMPNIT;
      try {
        const producto = await fetchProductoFromSedeLink(sede.LINK, sede.EMPNIT, cod);
        return {
          empnit: sede.EMPNIT,
          empnombre,
          ok: true,
          producto,
        };
      } catch (err) {
        return {
          empnit: sede.EMPNIT,
          empnombre,
          ok: false,
          error: err.message || 'Error al consultar',
        };
      }
    })
  );

  return { codprod: cod, rows };
}

module.exports = {
  fetchProductoFromSedeLink,
  fetchStockAcrossSedes,
  listSedesWithLinkForToken,
};
