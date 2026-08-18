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
  if (field.type === 'numeric') return sql.Decimal(18, 0);
  if (field.type === 'varcharmax') return sql.VarChar(sql.MAX);
  if (field.type === 'date') return sql.Date;
  return sql.VarChar;
}

function parseValue(field, raw) {
  // JSON null no es lo mismo que el texto "null": String(null) === "null"
  if (raw === undefined || raw === null || raw === '') {
    if (field.type === 'int' || field.type === 'float' || field.type === 'numeric') return null;
    return null;
  }
  if (field.type === 'int') return Number(raw);
  if (field.type === 'float' || field.type === 'numeric') return Number(raw);
  if (field.type === 'date') {
    const s = String(raw).trim().slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const text = String(raw).trim();
  return text || null;
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
 * @param {boolean} [cfg.identityColumn] — ID generado por SQL Server (IDENTITY); no insertar idColumn
 * @param {string[]} cfg.listColumns
 * @param {Array<{name:string,type:'varchar'|'int'|'float',required?:boolean}>} cfg.fields
 * @param {string[]} cfg.insertFields - sin idColumn si autoId
 * @param {string[]} cfg.updateFields
 * @param {boolean} [cfg.scopedByEmpresa=true] — filtra por EMPNIT
 * @param {(pool: import('mssql').ConnectionPool, empnit: string|null, data: object, req: import('express').Request) => Promise<string|null|void>} [cfg.validateInsert]
 * @param {(pool: import('mssql').ConnectionPool, empnit: string|null, data: object, req: import('express').Request, idValue: string|number) => Promise<string|null|void>} [cfg.validateUpdate]
 * @param {(pool: import('mssql').ConnectionPool, empnit: string|null, idValue: string|number, req: import('express').Request) => Promise<string|null|void>} [cfg.validateDelete]
 * @param {boolean} [cfg.requireAdminPassOnDelete=true] — gate eliminación (clave admin o autorización según setting)
 * @param {(pool: import('mssql').ConnectionPool, empnit: string|null, idValue: string|number, req: import('express').Request) => Promise<object>} [cfg.customDelete] — si retorna, sustituye el DELETE por defecto
 */
function createCatalogoRouter(cfg) {
  const router = express.Router();
  const scoped = cfg.scopedByEmpresa !== false;
  const fieldMap = Object.fromEntries(cfg.fields.map((f) => [f.name, f]));

  async function nextAutoId(pool, empnit) {
    const request = pool.request();
    const whereEmp = scoped ? ' WHERE EMPNIT = @EMPNIT' : '';
    if (scoped) request.input('EMPNIT', sql.VarChar, empnit);
    const result = await request.query(
      `SELECT ISNULL(MAX(${cfg.idColumn}), 0) + 1 AS nextId FROM dbo.[${cfg.table}]${whereEmp}`
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
    const empnit = scoped ? requireEmpNit(req, res) : null;
    if (scoped && !empnit) return;
    const cols = cfg.listColumns.join(', ');
    const where = scoped ? ' WHERE EMPNIT = @EMPNIT' : '';
    try {
      const pool = await req.app.locals.getDbPool();
      const request = pool.request();
      if (scoped) request.input('EMPNIT', sql.VarChar, empnit);
      const result = await request.query(`
          SELECT ${cols}
          FROM dbo.[${cfg.table}]
          ${where}
          ORDER BY ${cfg.orderBy}
        `);
      res.json({ rows: result.recordset, total: result.recordset.length, ...(scoped ? { empnit } : {}) });
    } catch (err) {
      console.warn(`[API GET /${cfg.logName}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', async (req, res) => {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Base de datos no configurada' });
    }
    const empnit = scoped ? requireEmpNit(req, res) : null;
    if (scoped && !empnit) return;

    const postFields = cfg.insertFields;
    const data = readBody(req, postFields);
    // Si el PK varchar viene en el body con otro casing o solo en idColumn
    if (!cfg.autoId && !cfg.identityColumn && cfg.idType === 'varchar') {
      const rawId =
        req.body?.[cfg.idColumn] ??
        req.body?.[String(cfg.idColumn).toLowerCase()] ??
        req.body?.[String(cfg.idColumn).toUpperCase()];
      if ((data[cfg.idColumn] === null || data[cfg.idColumn] === '') && rawId != null && String(rawId).trim() !== '') {
        data[cfg.idColumn] = String(rawId).trim();
      }
    }
    const errReq = validateRequired(data, postFields.filter((n) => fieldMap[n]?.required));
    if (errReq) return res.status(400).json({ error: errReq });

    try {
      const pool = await req.app.locals.getDbPool();
      if (typeof cfg.validateInsert === 'function') {
        const validationErr = await cfg.validateInsert(pool, empnit, data, req);
        if (validationErr) return res.status(400).json({ error: validationErr });
      }

      if (cfg.identityColumn) {
        const insertCols = scoped
          ? ['EMPNIT', ...cfg.insertFields]
          : [...cfg.insertFields];
        const valueParts = insertCols.map((c) => `@${c}`);
        if (cfg.fechaOnInsert) {
          insertCols.push('FECHA');
          valueParts.push('CAST(GETDATE() AS DATE)');
        }
        const request = pool.request();
        if (scoped) request.input('EMPNIT', sql.VarChar, empnit);
        bindBody(request, data, cfg.insertFields);

        const result = await request.query(`
          INSERT INTO dbo.[${cfg.table}] (${insertCols.join(', ')})
          OUTPUT INSERTED.${cfg.idColumn}${cfg.fechaOnInsert ? ', INSERTED.FECHA' : ''}
          VALUES (${valueParts.join(', ')})
        `);
        const idValue = result.recordset[0]?.[cfg.idColumn];
        const response = { ok: true, [cfg.idColumn]: idValue, ...data };
        if (cfg.fechaOnInsert && result.recordset[0]?.FECHA) {
          response.FECHA = result.recordset[0].FECHA;
        }
        return res.status(201).json(response);
      }

      const idValue = cfg.autoId ? await nextAutoId(pool, empnit) : data[cfg.idColumn];
      if (idValue === null || idValue === '') {
        return res.status(400).json({ error: `${cfg.idColumn} es obligatorio` });
      }

      const insertCols = scoped
        ? cfg.autoId
          ? ['EMPNIT', cfg.idColumn, ...cfg.insertFields]
          : ['EMPNIT', ...cfg.insertFields]
        : cfg.autoId
          ? [cfg.idColumn, ...cfg.insertFields]
          : [...cfg.insertFields];
      const insertParams = insertCols.map((c) => `@${c}`);
      const request = pool.request();
      if (scoped) request.input('EMPNIT', sql.VarChar, empnit);
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
    const empnit = scoped ? requireEmpNit(req, res) : null;
    if (scoped && !empnit) return;
    const idValue = parseIdParam(req.params[cfg.idRouteParam]);
    if (idValue === null) {
      return res.status(400).json({ error: `${cfg.idColumn} inválido` });
    }

    const data = readBody(req, cfg.updateFields);
    const errReq = validateRequired(data, cfg.updateFields.filter((n) => fieldMap[n]?.required));
    if (errReq) return res.status(400).json({ error: errReq });

    try {
      const pool = await req.app.locals.getDbPool();
      if (typeof cfg.validateUpdate === 'function') {
        const validationErr = await cfg.validateUpdate(pool, empnit, data, req, idValue);
        if (validationErr) return res.status(400).json({ error: validationErr });
      }
      const setClause = cfg.updateFields.map((n) => `${n} = @${n}`).join(', ');
      const where = scoped
        ? `WHERE EMPNIT = @EMPNIT AND ${cfg.idColumn} = @ID_KEY`
        : `WHERE ${cfg.idColumn} = @ID_KEY`;
      const request = pool.request();
      if (scoped) request.input('EMPNIT', sql.VarChar, empnit);
      request.input('ID_KEY', sqlTypeFor({ type: cfg.idType }), idValue);
      bindBody(request, data, cfg.updateFields);

      const result = await request.query(`
        UPDATE dbo.[${cfg.table}] SET ${setClause}
        ${where}
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
    const empnit = scoped ? requireEmpNit(req, res) : null;
    if (scoped && !empnit) return;
    const idValue = parseIdParam(req.params[cfg.idRouteParam]);
    if (idValue === null) {
      return res.status(400).json({ error: `${cfg.idColumn} inválido` });
    }
    try {
      const pool = await req.app.locals.getDbPool();
      if (typeof cfg.validateDelete === 'function') {
        const validationErr = await cfg.validateDelete(pool, empnit, idValue, req);
        if (validationErr) return res.status(400).json({ error: validationErr });
      }
      if (cfg.requireAdminPassOnDelete !== false) {
        const { assertEliminacionRegistro } = require('../../lib/config-auth');
        await assertEliminacionRegistro(pool, String(req.body?.pass ?? req.body?.PASS ?? ''));
      }
      if (typeof cfg.customDelete === 'function') {
        const out = await cfg.customDelete(pool, empnit, idValue, req);
        if (out?.error) {
          return res.status(out.statusCode || 400).json({ error: out.error });
        }
        return res.json(out && typeof out === 'object' ? out : { ok: true });
      }
      const request = pool.request().input('ID_KEY', sqlTypeFor({ type: cfg.idType }), idValue);
      if (scoped) request.input('EMPNIT', sql.VarChar, empnit);
      const where = scoped
        ? `WHERE EMPNIT = @EMPNIT AND ${cfg.idColumn} = @ID_KEY`
        : `WHERE ${cfg.idColumn} = @ID_KEY`;
      const result = await request.query(`DELETE FROM dbo.[${cfg.table}] ${where}`);
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ error: `${cfg.entityLabel} no encontrado(a)` });
      }
      res.json({ ok: true });
    } catch (err) {
      if (err.statusCode === 401) {
        return res.status(401).json({ error: err.message });
      }
      console.warn(`[API DELETE /${cfg.logName}]`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = { createCatalogoRouter };
