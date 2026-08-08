/**
 * Repara DOCUMENTOS.NOCORTE / CORTE para cortes ya cerrados
 * cuando el cierre no marcó documentos (bug: marcar después del INSERT en CORTES).
 *
 * Empareja por caja + ventana de IDs entre cortes consecutivos
 * (ID > IDFINAL del corte anterior y ID <= IDFINAL del corte actual).
 *
 * Uso:
 *   node scripts/reparar-nocorte-documentos.js --empnit=NIT            # dry-run
 *   node scripts/reparar-nocorte-documentos.js --empnit=NIT --apply    # escribe
 *   node scripts/reparar-nocorte-documentos.js --empnit=NIT --caja=1 --apply
 *   node scripts/reparar-nocorte-documentos.js --all --apply           # todas las empresas
 */
require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');
const {
  SQL_TIPODOC_CORTE_IN,
  SQL_TIPODOC_FACTURA_IN,
  SQL_EXCLUIR_FACTURAS_TIPOM_NEUTRO,
  SQL_EXCLUIR_COMPRAS_Y_DVP_CORTE,
} = require('../lib/corte-caja-docs');

function parseArgs(argv) {
  const out = { empnit: null, all: false, apply: false, caja: null };
  for (const a of argv) {
    if (a === '--all') out.all = true;
    else if (a === '--apply') out.apply = true;
    else if (a.startsWith('--empnit=')) out.empnit = String(a.slice('--empnit='.length)).trim();
    else if (a.startsWith('--caja=')) {
      const n = parseInt(a.slice('--caja='.length), 10);
      out.caja = Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return out;
}

async function loadCortes(pool, { empnit, caja }) {
  const req = pool.request();
  let where = 'WHERE ISNULL(c.IDFINAL, 0) > 0';
  if (empnit) {
    req.input('EMPNIT', sql.VarChar, empnit);
    where += ' AND c.EMPNIT = @EMPNIT';
  }
  if (caja != null) {
    req.input('CODCAJA', sql.Int, caja);
    where += ' AND c.CODCAJA = @CODCAJA';
  }
  const result = await req.query(`
    SELECT c.ID, c.EMPNIT, c.CODCAJA, c.CORRELATIVO,
           ISNULL(c.IDINICIAL, 0) AS IDINICIAL,
           ISNULL(c.IDFINAL, 0) AS IDFINAL,
           c.FECHA
    FROM dbo.CORTES c
    ${where}
    ORDER BY c.EMPNIT, c.CODCAJA, c.ID
  `);
  return result.recordset || [];
}

/**
 * Doc operados de corte + facturas anuladas en la ventana de IDs,
 * sin NOCORTE (null o 0) y aún no asignados a otro correlativo.
 */
function previewSql() {
  return `
    SELECT COUNT(1) AS CNT
    FROM dbo.DOCUMENTOS d
    INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
    WHERE d.EMPNIT = @EMPNIT
      AND d.CODCAJA = @CODCAJA
      AND d.ID > @ID_PREV
      AND d.ID <= @ID_FINAL
      AND (d.NOCORTE IS NULL OR d.NOCORTE = 0)
      AND d.STATUS IN ('O', 'A')
      AND (
        (
          d.STATUS = 'O'
          AND t.TIPODOC IN (${SQL_TIPODOC_CORTE_IN})
          ${SQL_EXCLUIR_COMPRAS_Y_DVP_CORTE}
          ${SQL_EXCLUIR_FACTURAS_TIPOM_NEUTRO}
        )
        OR (
          d.STATUS = 'A'
          AND t.TIPODOC IN (${SQL_TIPODOC_FACTURA_IN})
          AND ISNULL(t.TIPOM, 0) <> 0
        )
      )
  `;
}

function updateSql() {
  return `
    UPDATE d
    SET d.CORTE = 'SI', d.NOCORTE = @NOCORTE
    FROM dbo.DOCUMENTOS d
    INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
    WHERE d.EMPNIT = @EMPNIT
      AND d.CODCAJA = @CODCAJA
      AND d.ID > @ID_PREV
      AND d.ID <= @ID_FINAL
      AND (d.NOCORTE IS NULL OR d.NOCORTE = 0)
      AND d.STATUS IN ('O', 'A')
      AND (
        (
          d.STATUS = 'O'
          AND t.TIPODOC IN (${SQL_TIPODOC_CORTE_IN})
          ${SQL_EXCLUIR_COMPRAS_Y_DVP_CORTE}
          ${SQL_EXCLUIR_FACTURAS_TIPOM_NEUTRO}
        )
        OR (
          d.STATUS = 'A'
          AND t.TIPODOC IN (${SQL_TIPODOC_FACTURA_IN})
          AND ISNULL(t.TIPOM, 0) <> 0
        )
      )
  `;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.all && !args.empnit) {
    console.error(
      'Indique --empnit=NIT o --all\nEjemplo: node scripts/reparar-nocorte-documentos.js --empnit=CF --apply'
    );
    process.exit(1);
  }

  const cfg = getDbConfig();
  if (!cfg) {
    console.error('Base de datos no configurada (.env DB_*)');
    process.exit(1);
  }

  const pool = await sql.connect(cfg);
  try {
    const cortes = await loadCortes(pool, { empnit: args.all ? null : args.empnit, caja: args.caja });
    if (!cortes.length) {
      console.log('No hay cortes con IDFINAL > 0 para el filtro indicado.');
      return;
    }

    console.log(
      `Modo: ${args.apply ? 'APPLY (escribe)' : 'DRY-RUN (solo cuenta)'} | cortes: ${cortes.length}`
    );

    let prevKey = '';
    let prevIdFinal = 0;
    let totalCandidates = 0;
    let totalUpdated = 0;

    const transaction = args.apply ? new sql.Transaction(pool) : null;
    if (transaction) await transaction.begin();

    try {
      for (const c of cortes) {
        const key = `${c.EMPNIT}::${c.CODCAJA}`;
        if (key !== prevKey) {
          prevKey = key;
          prevIdFinal = 0;
        }

        const idFinal = Number(c.IDFINAL) || 0;
        const correlativo = Number(c.CORRELATIVO);
        if (idFinal <= 0 || !Number.isFinite(correlativo) || correlativo < 1) {
          continue;
        }

        const runner = transaction || pool;
        const countRes = await runner
          .request()
          .input('EMPNIT', sql.VarChar, c.EMPNIT)
          .input('CODCAJA', sql.Int, c.CODCAJA)
          .input('ID_PREV', sql.Int, prevIdFinal)
          .input('ID_FINAL', sql.Int, idFinal)
          .query(previewSql());
        const cnt = Number(countRes.recordset[0]?.CNT) || 0;
        totalCandidates += cnt;

        let updated = 0;
        if (args.apply && cnt > 0) {
          const up = await runner
            .request()
            .input('EMPNIT', sql.VarChar, c.EMPNIT)
            .input('CODCAJA', sql.Int, c.CODCAJA)
            .input('ID_PREV', sql.Int, prevIdFinal)
            .input('ID_FINAL', sql.Int, idFinal)
            .input('NOCORTE', sql.Int, correlativo)
            .query(updateSql());
          updated = up.rowsAffected[0] || 0;
          totalUpdated += updated;
        }

        if (cnt > 0 || args.apply) {
          console.log(
            [
              `corte#${c.ID}`,
              `emp=${c.EMPNIT}`,
              `caja=${c.CODCAJA}`,
              `corr=${correlativo}`,
              `ids=(${prevIdFinal},${idFinal}]`,
              args.apply ? `updated=${updated}` : `pendientes=${cnt}`,
            ].join(' ')
          );
        }

        prevIdFinal = idFinal;
      }

      if (transaction) await transaction.commit();
    } catch (err) {
      if (transaction) {
        try {
          await transaction.rollback();
        } catch {
          /* ignore */
        }
      }
      throw err;
    }

    console.log('---');
    console.log(`Documentos candidatos (sin NOCORTE): ${totalCandidates}`);
    if (args.apply) console.log(`Documentos actualizados: ${totalUpdated}`);
    else console.log('Sin cambios. Reejecute con --apply para grabar.');
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
