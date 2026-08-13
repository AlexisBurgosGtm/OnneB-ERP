const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { getAppToken } = require('../lib/app-token');
const { isUpdateDbConfigured } = require('../config/update-database');
const { getUpdateDbPool } = require('../lib/update-db-pool');
const { checkTokenActivo, TOKEN_NO_NUBE_MSG } = require('../lib/community-token');
const { uploadCatalogToCommunity } = require('../lib/community-catalog-upload');
const {
  previewCatalogFromCommunity,
  downloadCatalogFromCommunity,
} = require('../lib/community-catalog-download');
const {
  listCommunityTrasladoLineas,
  loadCommunityTraslado,
  deleteCommunityTraslado,
} = require('../lib/community-traslado-download');
const { assertAdminPass } = require('../lib/config-auth');

const router = express.Router();

const TIPO_EMPRESA_PRINCIPAL = 1;
const TIPO_EMPRESA_SUCURSAL = 2;

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.headers['x-emp-nit'] || req.body?.empnit || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

async function getCodTipoEmpresa(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT TOP 1 CODTIPOEMPRESA
      FROM dbo.Empresas
      WHERE EMPNIT = @EMPNIT
    `);
  const raw = result.recordset?.[0]?.CODTIPOEMPRESA;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Runtime público (TOKEN de instalación, etc.). */
router.get('/runtime', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    token: getAppToken(),
    updateDbConfigured: isUpdateDbConfigured(),
  });
});

/**
 * Estado del TOKEN en el host (TOKENS.ACTIVO).
 */
router.get('/token-status', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const token = getAppToken();
  if (!token) {
    return res.status(503).json({ ok: false, activo: false, error: 'TOKEN no configurado en .env' });
  }
  if (!isUpdateDbConfigured()) {
    return res.status(503).json({
      ok: false,
      activo: false,
      error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
    });
  }
  try {
    const pool = await getUpdateDbPool();
    const tokenCheck = await checkTokenActivo(pool, token);
    if (!tokenCheck.ok) {
      const status = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
      return res.status(status).json({
        ok: false,
        activo: false,
        error: tokenCheck.error || TOKEN_NO_NUBE_MSG,
        code: tokenCheck.code,
      });
    }
    res.json({ ok: true, activo: true, token });
  } catch (err) {
    console.warn('[API GET /community/token-status]', err.message);
    res.status(500).json({ ok: false, activo: false, error: err.message || 'Error al verificar TOKEN' });
  }
});

/**
 * Empresas remotas del host de actualizaciones (COMMUNITY_EMPRESAS_SYNC).
 * Solo si TOKENS.ACTIVO = SI para el TOKEN de esta instalación.
 */
router.get('/empresas-sync', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const token = getAppToken();
  if (!token) {
    return res.status(503).json({ error: 'TOKEN no configurado en .env' });
  }
  if (!isUpdateDbConfigured()) {
    return res.status(503).json({
      error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
    });
  }
  const excludeEmpnit = String(req.query.excludeEmpnit || '').trim().toUpperCase();
  try {
    const pool = await getUpdateDbPool();
    const tokenCheck = await checkTokenActivo(pool, token);
    if (!tokenCheck.ok) {
      const status = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
      return res.status(status).json({
        error: tokenCheck.error || TOKEN_NO_NUBE_MSG,
        code: tokenCheck.code,
      });
    }
    const result = await pool
      .request()
      .input('TOKEN', sql.VarChar, token)
      .query(`
        SELECT
          LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) AS EMPNIT,
          LTRIM(RTRIM(ISNULL(EMPNOMBRE, ''))) AS EMPNOMBRE
        FROM dbo.COMMUNITY_EMPRESAS_SYNC
        WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
        ORDER BY EMPNOMBRE, EMPNIT
      `);
    let rows = result.recordset || [];
    if (excludeEmpnit) {
      rows = rows.filter((r) => String(r.EMPNIT || '').trim().toUpperCase() !== excludeEmpnit);
    }
    res.json({
      token,
      rows,
    });
  } catch (err) {
    console.warn('[API GET /community/empresas-sync]', err.message);
    res.status(500).json({ error: err.message || 'Error al consultar COMMUNITY_EMPRESAS_SYNC' });
  }
});

/**
 * Sube PRODUCTOS / PRECIOS / INVSALDO → COMMUNITY_* (EMPNIT=GENERAL, TOKEN app).
 * Usa bulk insert (SqlBulkCopy) por lotes.
 */
router.post('/catalogo/subir', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const token = getAppToken();
  if (!token) return res.status(503).json({ error: 'TOKEN no configurado en .env' });
  if (!isUpdateDbConfigured()) {
    return res.status(503).json({
      error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
    });
  }

  try {
    const localPool = await req.app.locals.getDbPool();
    const tip = await getCodTipoEmpresa(localPool, empnit);
    if (tip !== TIPO_EMPRESA_PRINCIPAL) {
      return res.status(403).json({
        error: 'Solo la empresa PRINCIPAL puede subir el catálogo a la nube',
        code: 'EMPRESA_NO_PRINCIPAL',
      });
    }

    const hostPool = await getUpdateDbPool();
    if (!hostPool) {
      return res.status(503).json({ error: 'No se pudo conectar a la base UPDATE_*' });
    }
    const tokenCheck = await checkTokenActivo(hostPool, token);
    if (!tokenCheck.ok) {
      const status = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
      return res.status(status).json({
        error: tokenCheck.error || TOKEN_NO_NUBE_MSG,
        code: tokenCheck.code,
      });
    }

    const result = await uploadCatalogToCommunity({
      localPool,
      hostPool,
      token,
      empnit,
    });
    res.json(result);
  } catch (err) {
    console.warn('[API POST /community/catalogo/subir]', err.message);
    res.status(500).json({ error: err.message || 'Error al subir catálogo' });
  }
});

/**
 * Preview del catálogo en la nube (COMMUNITY_PRODUCTOS / COMMUNITY_PRECIOS, EMPNIT=GENERAL).
 * Solo empresa SUCURSAL.
 */
router.get('/catalogo/preview', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const token = getAppToken();
  if (!token) return res.status(503).json({ error: 'TOKEN no configurado en .env' });
  if (!isUpdateDbConfigured()) {
    return res.status(503).json({
      error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
    });
  }

  try {
    const localPool = await req.app.locals.getDbPool();
    const tip = await getCodTipoEmpresa(localPool, empnit);
    if (tip !== TIPO_EMPRESA_SUCURSAL) {
      return res.status(403).json({
        error: 'Solo las empresas SUCURSAL pueden descargar el catálogo',
        code: 'EMPRESA_NO_SUCURSAL',
      });
    }

    const hostPool = await getUpdateDbPool();
    if (!hostPool) {
      return res.status(503).json({ error: 'No se pudo conectar a la base UPDATE_*' });
    }
    const tokenCheck = await checkTokenActivo(hostPool, token);
    if (!tokenCheck.ok) {
      const status = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
      return res.status(status).json({
        error: tokenCheck.error || TOKEN_NO_NUBE_MSG,
        code: tokenCheck.code,
      });
    }

    const result = await previewCatalogFromCommunity({ hostPool, token });
    res.json(result);
  } catch (err) {
    console.warn('[API GET /community/catalogo/preview]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Error al leer catálogo en la nube' });
  }
});

/**
 * Descarga catálogo: reemplaza PRODUCTOS/PRECIOS locales y sincroniza INVSALDO faltantes en 0.
 * Solo empresa SUCURSAL. Bulk insert (SqlBulkCopy).
 */
router.post('/catalogo/descargar', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const token = getAppToken();
  if (!token) return res.status(503).json({ error: 'TOKEN no configurado en .env' });
  if (!isUpdateDbConfigured()) {
    return res.status(503).json({
      error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
    });
  }

  try {
    const localPool = await req.app.locals.getDbPool();
    const tip = await getCodTipoEmpresa(localPool, empnit);
    if (tip !== TIPO_EMPRESA_SUCURSAL) {
      return res.status(403).json({
        error: 'Solo las empresas SUCURSAL pueden descargar el catálogo',
        code: 'EMPRESA_NO_SUCURSAL',
      });
    }

    const hostPool = await getUpdateDbPool();
    if (!hostPool) {
      return res.status(503).json({ error: 'No se pudo conectar a la base UPDATE_*' });
    }
    const tokenCheck = await checkTokenActivo(hostPool, token);
    if (!tokenCheck.ok) {
      const status = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
      return res.status(status).json({
        error: tokenCheck.error || TOKEN_NO_NUBE_MSG,
        code: tokenCheck.code,
      });
    }

    const result = await downloadCatalogFromCommunity({
      localPool,
      hostPool,
      token,
      empnit,
    });
    res.json(result);
  } catch (err) {
    console.warn('[API POST /community/catalogo/descargar]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message || 'Error al descargar catálogo' });
  }
});

/**
 * Traslados en la nube destinados a esta empresa (CODEMBARQUE = EMPNIT sesión).
 */
router.get('/traslados-destino', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const token = getAppToken();
  if (!token) return res.status(503).json({ error: 'TOKEN no configurado en .env' });
  if (!isUpdateDbConfigured()) {
    return res.status(503).json({
      error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
    });
  }

  try {
    const hostPool = await getUpdateDbPool();
    if (!hostPool) {
      return res.status(503).json({ error: 'No se pudo conectar a la base UPDATE_*' });
    }
    const tokenCheck = await checkTokenActivo(hostPool, token);
    if (!tokenCheck.ok) {
      const status = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
      return res.status(status).json({
        error: tokenCheck.error || TOKEN_NO_NUBE_MSG,
        code: tokenCheck.code,
      });
    }

    const result = await hostPool
      .request()
      .input('TOKEN', sql.VarChar, token)
      .input('CODEMBARQUE', sql.VarChar, empnit)
      .query(`
        SELECT TOP 200
          LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) AS EMPNIT,
          LTRIM(RTRIM(CAST(CODDOC AS VARCHAR(50)))) AS CODDOC,
          CORRELATIVO,
          FECHA,
          ANIO,
          MES,
          DIA,
          LTRIM(RTRIM(ISNULL(CAST(USUARIO AS VARCHAR(100)), ''))) AS USUARIO,
          LTRIM(RTRIM(ISNULL(CAST(OBS AS VARCHAR(500)), ''))) AS OBS,
          LTRIM(RTRIM(ISNULL(CAST(CODEMBARQUE AS VARCHAR(50)), ''))) AS CODEMBARQUE,
          LTRIM(RTRIM(ISNULL(CAST(OBSMARCA AS VARCHAR(200)), ''))) AS OBSMARCA,
          LTRIM(RTRIM(ISNULL(CAST(TIPOVENTA AS VARCHAR(20)), ''))) AS TIPOVENTA,
          LTRIM(RTRIM(ISNULL(CAST(STATUS AS VARCHAR(20)), ''))) AS STATUS
        FROM dbo.COMMUNITY_DOCUMENTOS
        WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
          AND LTRIM(RTRIM(CAST(CODEMBARQUE AS VARCHAR(50)))) = LTRIM(RTRIM(@CODEMBARQUE))
        ORDER BY FECHA DESC, CODDOC, CORRELATIVO DESC
      `);

    res.json({
      ok: true,
      empnit,
      rows: result.recordset || [],
    });
  } catch (err) {
    console.warn('[API GET /community/traslados-destino]', err.message);
    res.status(500).json({ error: err.message || 'Error al consultar traslados en la nube' });
  }
});

/**
 * Líneas de un traslado en la nube (detalle para sucursal destino).
 */
router.get('/traslados-destino/detalle', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const origenEmpnit = String(req.query.origenEmpnit || req.query.empnitOrigen || '').trim();
  const coddoc = String(req.query.coddoc || '').trim();
  const correlativo = Number(req.query.correlativo);
  if (!origenEmpnit || !coddoc || !Number.isFinite(correlativo)) {
    return res.status(400).json({ error: 'origenEmpnit, coddoc y correlativo son requeridos' });
  }

  const token = getAppToken();
  if (!token) return res.status(503).json({ error: 'TOKEN no configurado en .env' });
  if (!isUpdateDbConfigured()) {
    return res.status(503).json({
      error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
    });
  }

  try {
    const hostPool = await getUpdateDbPool();
    if (!hostPool) {
      return res.status(503).json({ error: 'No se pudo conectar a la base UPDATE_*' });
    }
    const tokenCheck = await checkTokenActivo(hostPool, token);
    if (!tokenCheck.ok) {
      const status = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
      return res.status(status).json({
        error: tokenCheck.error || TOKEN_NO_NUBE_MSG,
        code: tokenCheck.code,
      });
    }

    const headerCheck = await hostPool
      .request()
      .input('TOKEN', sql.VarChar, token)
      .input('EMPNIT', sql.VarChar, origenEmpnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .input('CODEMBARQUE', sql.VarChar, empnit)
      .query(`
        SELECT TOP 1 CODDOC
        FROM dbo.COMMUNITY_DOCUMENTOS
        WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
          AND LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) = LTRIM(RTRIM(@EMPNIT))
          AND LTRIM(RTRIM(CAST(CODDOC AS VARCHAR(50)))) = LTRIM(RTRIM(@CODDOC))
          AND CORRELATIVO = @CORRELATIVO
          AND LTRIM(RTRIM(CAST(CODEMBARQUE AS VARCHAR(50)))) = LTRIM(RTRIM(@CODEMBARQUE))
      `);
    if (!headerCheck.recordset?.length) {
      return res.status(404).json({ error: 'Traslado no encontrado en la nube para esta empresa' });
    }

    const lines = await listCommunityTrasladoLineas(
      hostPool,
      token,
      origenEmpnit,
      coddoc,
      correlativo
    );
    res.json({
      ok: true,
      origenEmpnit,
      CODDOC: coddoc,
      CORRELATIVO: correlativo,
      lines,
    });
  } catch (err) {
    console.warn('[API GET /community/traslados-destino/detalle]', err.message);
    res.status(500).json({ error: err.message || 'Error al consultar detalle del traslado' });
  }
});

/**
 * Lista general de traslados en la nube (TOKEN de instalación).
 */
router.get('/traslados-transito', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const token = getAppToken();
  if (!token) return res.status(503).json({ error: 'TOKEN no configurado en .env' });
  if (!isUpdateDbConfigured()) {
    return res.status(503).json({
      error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
    });
  }

  try {
    const hostPool = await getUpdateDbPool();
    if (!hostPool) {
      return res.status(503).json({ error: 'No se pudo conectar a la base UPDATE_*' });
    }
    const tokenCheck = await checkTokenActivo(hostPool, token);
    if (!tokenCheck.ok) {
      const status = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
      return res.status(status).json({
        error: tokenCheck.error || TOKEN_NO_NUBE_MSG,
        code: tokenCheck.code,
      });
    }

    const result = await hostPool
      .request()
      .input('TOKEN', sql.VarChar, token)
      .query(`
        SELECT TOP 500
          LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) AS EMPNIT,
          LTRIM(RTRIM(CAST(CODDOC AS VARCHAR(50)))) AS CODDOC,
          CORRELATIVO,
          FECHA,
          ANIO,
          MES,
          DIA,
          LTRIM(RTRIM(ISNULL(CAST(USUARIO AS VARCHAR(100)), ''))) AS USUARIO,
          LTRIM(RTRIM(ISNULL(CAST(OBS AS VARCHAR(500)), ''))) AS OBS,
          LTRIM(RTRIM(ISNULL(CAST(CODEMBARQUE AS VARCHAR(50)), ''))) AS CODEMBARQUE,
          LTRIM(RTRIM(ISNULL(CAST(OBSMARCA AS VARCHAR(200)), ''))) AS OBSMARCA,
          LTRIM(RTRIM(ISNULL(CAST(TIPOVENTA AS VARCHAR(20)), ''))) AS TIPOVENTA,
          LTRIM(RTRIM(ISNULL(CAST(STATUS AS VARCHAR(20)), ''))) AS STATUS,
          TOTALPRECIO,
          TOTALCOSTO
        FROM dbo.COMMUNITY_DOCUMENTOS
        WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
        ORDER BY FECHA DESC, CODDOC, CORRELATIVO DESC
      `);

    let canDelete = false;
    if (isDbConfigured()) {
      try {
        const localPool = await req.app.locals.getDbPool();
        const tip = await getCodTipoEmpresa(localPool, empnit);
        canDelete = tip === TIPO_EMPRESA_PRINCIPAL;
      } catch {
        canDelete = false;
      }
    }

    res.json({
      ok: true,
      empnit,
      canDelete,
      rows: result.recordset || [],
    });
  } catch (err) {
    console.warn('[API GET /community/traslados-transito]', err.message);
    res.status(500).json({ error: err.message || 'Error al consultar traslados en tránsito' });
  }
});

/**
 * Detalle de un traslado en tránsito (origen, destino, obs, líneas).
 */
router.get('/traslados-transito/detalle', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const origenEmpnit = String(req.query.origenEmpnit || req.query.empnitOrigen || '').trim();
  const coddoc = String(req.query.coddoc || '').trim();
  const correlativo = Number(req.query.correlativo);
  if (!origenEmpnit || !coddoc || !Number.isFinite(correlativo)) {
    return res.status(400).json({ error: 'origenEmpnit, coddoc y correlativo son requeridos' });
  }

  const token = getAppToken();
  if (!token) return res.status(503).json({ error: 'TOKEN no configurado en .env' });
  if (!isUpdateDbConfigured()) {
    return res.status(503).json({
      error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
    });
  }

  try {
    const hostPool = await getUpdateDbPool();
    if (!hostPool) {
      return res.status(503).json({ error: 'No se pudo conectar a la base UPDATE_*' });
    }
    const tokenCheck = await checkTokenActivo(hostPool, token);
    if (!tokenCheck.ok) {
      const status = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
      return res.status(status).json({
        error: tokenCheck.error || TOKEN_NO_NUBE_MSG,
        code: tokenCheck.code,
      });
    }

    const cloud = await loadCommunityTraslado(
      hostPool,
      token,
      origenEmpnit,
      coddoc,
      correlativo
    );
    if (!cloud) {
      return res.status(404).json({ error: 'Traslado no encontrado en la nube' });
    }

    const h = cloud.header;
    const origenVal = String(h.EMPNIT || origenEmpnit || '').trim();
    let origenNombre = '';
    if (origenVal) {
      const nombreRes = await hostPool
        .request()
        .input('TOKEN', sql.VarChar, token)
        .input('EMPNIT', sql.VarChar, origenVal)
        .query(`
          SELECT TOP 1 LTRIM(RTRIM(ISNULL(EMPNOMBRE, ''))) AS EMPNOMBRE
          FROM dbo.COMMUNITY_EMPRESAS_SYNC
          WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
            AND LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) = LTRIM(RTRIM(@EMPNIT))
        `);
      origenNombre = String(nombreRes.recordset?.[0]?.EMPNOMBRE || '').trim();
    }

    const lines = (cloud.lines || []).map((ln) => ({
      CODPROD: String(ln.CODPROD || '').trim(),
      DESPROD: String(ln.DESPROD || '').trim(),
      CODMEDIDA: String(ln.CODMEDIDA || '').trim(),
      CANTIDAD: ln.CANTIDAD,
    }));

    res.json({
      ok: true,
      header: {
        EMPNIT: origenVal,
        EMPNOMBRE: origenNombre,
        CODDOC: String(h.CODDOC || '').trim(),
        CORRELATIVO: h.CORRELATIVO,
        FECHA: h.FECHA,
        ANIO: h.ANIO,
        MES: h.MES,
        DIA: h.DIA,
        USUARIO: String(h.USUARIO || '').trim(),
        OBS: String(h.OBS || '').trim(),
        CODEMBARQUE: String(h.CODEMBARQUE || '').trim(),
        OBSMARCA: String(h.OBSMARCA || '').trim(),
      },
      lines,
    });
  } catch (err) {
    console.warn('[API GET /community/traslados-transito/detalle]', err.message);
    res.status(500).json({ error: err.message || 'Error al consultar detalle' });
  }
});

/**
 * Elimina un traslado en tránsito (solo empresa PRINCIPAL + clave admin).
 */
router.delete('/traslados-transito', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const origenEmpnit = String(req.body?.origenEmpnit || req.body?.EMPNIT || '').trim();
  const coddoc = String(req.body?.coddoc || req.body?.CODDOC || '').trim();
  const correlativo = Number(req.body?.correlativo ?? req.body?.CORRELATIVO);
  const pass = String(req.body?.pass ?? req.body?.adminPass ?? '').trim();

  if (!origenEmpnit || !coddoc || !Number.isFinite(correlativo)) {
    return res.status(400).json({ error: 'origenEmpnit, coddoc y correlativo son requeridos' });
  }
  if (!pass) return res.status(400).json({ error: 'Clave de administrador requerida' });

  const token = getAppToken();
  if (!token) return res.status(503).json({ error: 'TOKEN no configurado en .env' });
  if (!isUpdateDbConfigured()) {
    return res.status(503).json({
      error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
    });
  }

  try {
    const localPool = await req.app.locals.getDbPool();
    const tip = await getCodTipoEmpresa(localPool, empnit);
    if (tip !== TIPO_EMPRESA_PRINCIPAL) {
      return res.status(403).json({
        error: 'Solo la empresa PRINCIPAL puede eliminar traslados en tránsito',
      });
    }
    await assertAdminPass(localPool, pass);

    const hostPool = await getUpdateDbPool();
    if (!hostPool) {
      return res.status(503).json({ error: 'No se pudo conectar a la base UPDATE_*' });
    }
    const tokenCheck = await checkTokenActivo(hostPool, token);
    if (!tokenCheck.ok) {
      const status = tokenCheck.code === 'TOKEN_INACTIVE' ? 403 : 503;
      return res.status(status).json({
        error: tokenCheck.error || TOKEN_NO_NUBE_MSG,
        code: tokenCheck.code,
      });
    }

    const cloud = await loadCommunityTraslado(
      hostPool,
      token,
      origenEmpnit,
      coddoc,
      correlativo
    );
    if (!cloud) {
      return res.status(404).json({ error: 'Traslado no encontrado en la nube' });
    }

    await deleteCommunityTraslado(hostPool, token, origenEmpnit, coddoc, correlativo);
    res.json({ ok: true, deleted: { origenEmpnit, CODDOC: coddoc, CORRELATIVO: correlativo } });
  } catch (err) {
    const status = err.statusCode || 500;
    console.warn('[API DELETE /community/traslados-transito]', err.message);
    res.status(status).json({ error: err.message || 'Error al eliminar traslado en tránsito' });
  }
});

module.exports = router;
