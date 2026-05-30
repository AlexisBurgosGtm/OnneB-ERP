const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../../config/database');

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.headers['x-emp-nit'] || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

function sqlTypeFor(field) {
  if (field.type === 'int') return sql.Int;
  if (field.type === 'float') return sql.Float;
  return sql.VarChar;
}

function parseValue(field, raw) {
  if (raw === undefined || raw === '') {
    if (field.type === 'int' || field.type === 'float') return null;
    return null;
  }
  if (field.type === 'int') return Number(raw);
  if (field.type === 'float') return Number(raw);
  return String(raw).trim();
}

/**
 * @param {object} cfg
 * @param {string} cfg.logName
 * @param {string} cfg.table
 * @param {string} cfg.orderBy
 * @param {string} cfg.idColumn
 * @param {'int'|'varchar'} cfg.idType
 * @param {string} cfg.idRouteParam
 * @param {boolean} [cfg.autoId]
 * @param {string[]} cfg.listColumns
 * @param {Array<{name:string,type:'varchar'|'int'|'float',required?:boolean}>} cfg.fields
 * @param {string[]} cfg.insertFields - sin idColumn si autoId
 * @param {string[]} cfg.updateFields
 */
function createCatalogoRouter(cfg) {
  const router = express.Router();
  const fieldMap = Object.fromEntries(cfg.fields.map((f) => [f.name, f]));

  async function nextAutoId(pool, empnit) {
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .query(
        `SELECT ISNULL(MAX(${cfg.idColumn}), 0) + 1 AS nextId FROM dbo.[${cfg.table}] WHERE EMPNIT = @EMPNIT`
      );
    return result.recordset[0].nextId;
  }

  function parseIdParam(raw) {
    if (cfg.idType === 'int') {
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? null : n;
    }
    const s = String(raw ?? '').trim();
    return s || null;
  }

  function bindBody(request, data, fields) {
    for (const name of fields) {
      const field = fieldMap[name];
      if (!field) continue;
      request.input(name, sqlTypeFor(field), data[name]);
    }
  }

  function readBody(req, fieldNames) {
    const data = {};
    for (const name of fieldNames) {
      const field = fieldMap[name];
      data[name] = parseValue(field, req.body[name]);
    }
    return data;
  }

  function validateRequired(data, names) {
    for (const name of names) {
      const field = fieldMap[name];
      if (field?.required && (data[name] === null || data[name] === '')) {
        return `${name} es obligatorio`;
      }
    }
    return null;
  }

  router.get('/', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Base de datos no configurada' });
    }
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const cols = cfg.listColumns.join(', ');
    try {
      const pool = await req.app.locals.getDbPool();
      const result = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .query(`
          SELECT ${cols}
          FROM dbo.[${cfg.table}]
          WHERE EMPNIT = @EMPNIT
          ORDER BY ${cfg.orderBy}
        `);
      res.json({ rows: result.recordset, total: result.recordset.length, empnit });
    } catch (err) {
      console.warn(`[API GET /${cfg.logName}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', async (req, res) => {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Base de datos no configurada' });
    }
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;

    const postFields = cfg.insertFields;
    const data = readBody(req, postFields);
    const errReq = validateRequired(data, postFields.filter((n) => fieldMap[n]?.required));
    if (errReq) return res.status(400).json({ error: errReq });

    try {
      const pool = await req.app.locals.getDbPool();
      const idValue = cfg.autoId ? await nextAutoId(pool, empnit) : data[cfg.idColumn];
      if (idValue === null || idValue === '') {
        return res.status(400).json({ error: `${cfg.idColumn} es obligatorio` });
      }

      const insertCols = cfg.autoId
        ? ['EMPNIT', cfg.idColumn, ...cfg.insertFields]
        : ['EMPNIT', ...cfg.insertFields];
      const insertParams = insertCols.map((c) => `@${c}`);
      const request = pool.request();
      request.input('EMPNIT', sql.VarChar, empnit);
      if (cfg.autoId) {
        request.input(cfg.idColumn, sqlTypeFor({ type: cfg.idType }), idValue);
        bindBody(request, data, cfg.insertFields);
      } else {
        bindBody(request, { ...data, [cfg.idColumn]: idValue }, cfg.insertFields);
      }

      await request.query(`
        INSERT INTO dbo.[${cfg.table}] (${insertCols.join(', ')})
        VALUES (${insertParams.join(', ')})
      `);
      res.status(201).json({ ok: true, [cfg.idColumn]: idValue, ...data });
    } catch (err) {
      console.warn(`[API POST /${cfg.logName}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.put(`/:${cfg.idRouteParam}`, async (req, res) => {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Base de datos no configurada' });
    }
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const idValue = parseIdParam(req.params[cfg.idRouteParam]);
    if (idValue === null) {
      return res.status(400).json({ error: `${cfg.idColumn} inválido` });
    }

    const data = readBody(req, cfg.updateFields);
    const errReq = validateRequired(data, cfg.updateFields.filter((n) => fieldMap[n]?.required));
    if (errReq) return res.status(400).json({ error: errReq });

    try {
      const pool = await req.app.locals.getDbPool();
      const setClause = cfg.updateFields.map((n) => `${n} = @${n}`).join(', ');
      const request = pool.request();
      request.input('EMPNIT', sql.VarChar, empnit);
      request.input('ID_KEY', sqlTypeFor({ type: cfg.idType }), idValue);
      bindBody(request, data, cfg.updateFields);

      const result = await request.query(`
        UPDATE dbo.[${cfg.table}] SET ${setClause}
        WHERE EMPNIT = @EMPNIT AND ${cfg.idColumn} = @ID_KEY
      `);
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ error: `${cfg.entityLabel} no encontrado(a)` });
      }
      res.json({ ok: true, [cfg.idColumn]: idValue, ...data });
    } catch (err) {
      console.warn(`[API PUT /${cfg.logName}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete(`/:${cfg.idRouteParam}`, async (req, res) => {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Base de datos no configurada' });
    }
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const idValue = parseIdParam(req.params[cfg.idRouteParam]);
    if (idValue === null) {
      return res.status(400).json({ error: `${cfg.idColumn} inválido` });
    }
    try {
      const pool = await req.app.locals.getDbPool();
      const result = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('ID_KEY', sqlTypeFor({ type: cfg.idType }), idValue)
        .query(`
          DELETE FROM dbo.[${cfg.table}]
          WHERE EMPNIT = @EMPNIT AND ${cfg.idColumn} = @ID_KEY
        `);
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ error: `${cfg.entityLabel} no encontrado(a)` });
      }
      res.json({ ok: true });
    } catch (err) {
      console.warn(`[API DELETE /${cfg.logName}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createCatalogoRouter };
