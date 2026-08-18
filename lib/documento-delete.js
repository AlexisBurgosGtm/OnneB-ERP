const sql = require('mssql');
const { isStatusEditable, STATUS_OPERADO, STATUS_BLOQUEADO } = require('./documento-status');
const { InventarioError, revertirMovimientoInventarioDocumento } = require('./inventario');
const { ensureTable, archiveDocumentoSnapshot } = require('./documentos-eliminados');

/** Tipos que marcan CORTE=SI al finalizar o no entran en corte de caja real. */
const TIPOS_ELIMINABLES_IGNORA_CORTE = new Set([
  'ENV',
  'COT',
  'RCC',
  'CRS',
  'COM',
  'COP',
  'DVP',
  'ENT',
  'SAL',
  'RVR',
  'RIR',
  'RTV',
  'RTI',
  'RAR',
  'FNA',
  'RCP',
]);

const TIPOS_RECALC_PADRE_CXC = new Set(['RCC', 'RAR', 'DEV', 'FNC', 'FNA']);
const TIPOS_RECALC_PADRE_CXP = new Set(['RCP', 'DVP']);
const TIPOS_SALDO_CXC = new Set(['FAC', 'FEF', 'FEC', 'FES']);
const TIPOS_SALDO_CXP = new Set(['COM', 'COP']);

class DocumentoDeleteError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DocumentoDeleteError';
    this.statusCode = statusCode;
  }
}

function formatRelacionado(row) {
  const tipo = String(row.TIPODOC || '').trim().toUpperCase();
  const cod = String(row.CODDOC || '').trim();
  const corr = row.CORRELATIVO != null ? String(row.CORRELATIVO).trim() : '';
  const label = [tipo, `${cod} #${corr}`].filter(Boolean).join(' ');
  return label || `${cod} #${corr}`;
}

async function loadDocumentoDeleteMeta(transaction, empnit, coddoc, correlativo) {
  const check = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT
        d.STATUS,
        ISNULL(d.CORTE, 'NO') AS CORTE,
        ISNULL(d.FEL_UUDI, '') AS FEL_UUDI,
        LTRIM(RTRIM(ISNULL(d.SERIEFAC, ''))) AS SERIEFAC,
        LTRIM(RTRIM(ISNULL(d.NOFAC, ''))) AS NOFAC,
        UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) AS TIPODOC
      FROM dbo.DOCUMENTOS d
      LEFT JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);
  return check.recordset[0] || null;
}

function assertPuedeEliminarDocumento(meta) {
  if (!meta) {
    throw new DocumentoDeleteError('Documento no encontrado', 404);
  }
  const tipodoc = String(meta.TIPODOC || '').trim().toUpperCase();
  const status = String(meta.STATUS || '').trim().toUpperCase();
  const corte = String(meta.CORTE || 'NO').trim().toUpperCase();
  const fel = String(meta.FEL_UUDI || '').trim();

  if (fel) {
    throw new DocumentoDeleteError('El documento está certificado FEL y no se puede eliminar');
  }
  if (status === 'A') {
    throw new DocumentoDeleteError('El documento está anulado y no se puede eliminar');
  }

  const ignoraCorte = TIPOS_ELIMINABLES_IGNORA_CORTE.has(tipodoc);
  if (ignoraCorte) {
    if (status !== STATUS_OPERADO && status !== STATUS_BLOQUEADO) {
      throw new DocumentoDeleteError('El documento no se puede eliminar en su estado actual');
    }
    return { tipodoc, status, corte, ignoraCorte: true };
  }

  if (!isStatusEditable(status)) {
    throw new DocumentoDeleteError('El documento no está operado y no se puede eliminar');
  }
  if (corte === 'SI') {
    throw new DocumentoDeleteError('El documento está incluido en corte de caja; no se puede eliminar');
  }
  return { tipodoc, status, corte, ignoraCorte: false };
}

async function assertNoDocumentosRelacionados(transaction, empnit, coddoc, correlativo) {
  const correlativoStr = String(correlativo);
  const refs = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('CORRELATIVO_STR', sql.VarChar, correlativoStr)
    .query(`
      SELECT TOP 12
        UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) AS TIPODOC,
        d.CODDOC,
        d.CORRELATIVO
      FROM dbo.DOCUMENTOS d
      LEFT JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND NOT (d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO)
        AND UPPER(LTRIM(RTRIM(ISNULL(d.STATUS, '')))) <> 'A'
        AND LTRIM(RTRIM(ISNULL(d.SERIEFAC, ''))) = @CODDOC
        AND (
          TRY_CAST(LTRIM(RTRIM(d.NOFAC)) AS DECIMAL(18, 0)) = @CORRELATIVO
          OR LTRIM(RTRIM(ISNULL(d.NOFAC, ''))) = @CORRELATIVO_STR
        )
      ORDER BY d.FECHA DESC, d.CORRELATIVO DESC
    `);

  const abonos = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT TOP 12
        UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) AS TIPODOC,
        a.CODDOC,
        a.CORRELATIVO
      FROM dbo.DOCUMENTOS_FACTURAS_ABONADAS a
      INNER JOIN dbo.DOCUMENTOS p
        ON p.EMPNIT = a.EMPNIT AND p.CODDOC = a.CODDOC AND p.CORRELATIVO = a.CORRELATIVO
      LEFT JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = p.EMPNIT AND t.CODDOC = p.CODDOC
      WHERE a.EMPNIT = @EMPNIT
        AND LTRIM(RTRIM(ISNULL(a.CODDOC_FAC, ''))) = @CODDOC
        AND CAST(a.CORRELATIVO_FAC AS DECIMAL(18, 0)) = @CORRELATIVO
        AND NOT (a.CODDOC = @CODDOC AND a.CORRELATIVO = @CORRELATIVO)
        AND UPPER(LTRIM(RTRIM(ISNULL(p.STATUS, '')))) <> 'A'
      ORDER BY a.CORRELATIVO DESC
    `);

  const seen = new Set();
  const labels = [];
  for (const row of [...(refs.recordset || []), ...(abonos.recordset || [])]) {
    const key = `${String(row.CODDOC)}#${row.CORRELATIVO}`;
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(formatRelacionado(row));
  }
  if (!labels.length) return;

  throw new DocumentoDeleteError(
    `No se puede eliminar: tiene documentos relacionados (${labels.join(', ')}). Elimine primero esos documentos.`
  );
}

async function loadAbonosPropios(transaction, empnit, coddoc, correlativo) {
  const result = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT DISTINCT
        LTRIM(RTRIM(ISNULL(a.CODDOC_FAC, ''))) AS CODDOC_FAC,
        CAST(a.CORRELATIVO_FAC AS DECIMAL(18, 0)) AS CORRELATIVO_FAC
      FROM dbo.DOCUMENTOS_FACTURAS_ABONADAS a
      WHERE a.EMPNIT = @EMPNIT
        AND a.CODDOC = @CODDOC
        AND a.CORRELATIVO = @CORRELATIVO
        AND LTRIM(RTRIM(ISNULL(a.CODDOC_FAC, ''))) <> ''
        AND a.CORRELATIVO_FAC IS NOT NULL
    `);
  return result.recordset || [];
}

async function deleteAbonosPropios(transaction, empnit, coddoc, correlativo) {
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      DELETE FROM dbo.DOCUMENTOS_FACTURAS_ABONADAS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
}

async function recalcSaldoDocumento(transaction, empnit, coddocFac, correlativoFac) {
  const facCod = String(coddocFac || '').trim();
  const corr = Number(correlativoFac);
  if (!facCod || !Number.isFinite(corr)) return;

  const metaRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, facCod)
    .input('CORRELATIVO', sql.Decimal(18, 0), corr)
    .query(`
      SELECT
        UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) AS TIPODOC,
        LTRIM(RTRIM(ISNULL(d.SERIEFAC, ''))) AS SERIEFAC,
        LTRIM(RTRIM(ISNULL(d.NOFAC, ''))) AS NOFAC
      FROM dbo.DOCUMENTOS d
      LEFT JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);
  const meta = metaRes.recordset[0];
  if (!meta) return;

  const tipodoc = String(meta.TIPODOC || '').trim().toUpperCase();
  const { aplicarSaldoFacturaDesdeAbonos } = require('./cuentas-abono');
  const { aplicarSaldoCompraDesdeAbonos } = require('./cuentas-pago');

  if (TIPOS_SALDO_CXC.has(tipodoc)) {
    await aplicarSaldoFacturaDesdeAbonos(transaction, sql, empnit, facCod, corr);
  } else if (TIPOS_SALDO_CXP.has(tipodoc)) {
    await aplicarSaldoCompraDesdeAbonos(transaction, sql, empnit, facCod, corr);
  }

  if (TIPOS_SALDO_CXC.has(tipodoc) && tipodoc !== 'FAC') {
    const parentCod = String(meta.SERIEFAC || '').trim();
    const parentCorr = Number(String(meta.NOFAC || '').trim());
    if (parentCod && Number.isFinite(parentCorr)) {
      await aplicarSaldoFacturaDesdeAbonos(transaction, sql, empnit, parentCod, parentCorr);
    }
  }
}

async function recalcTrasBorrar(transaction, empnit, tipodoc, meta, abonosPropios) {
  const seen = new Set();
  const queue = [];

  const pushTarget = (cod, corr) => {
    const key = `${String(cod || '').trim()}#${corr}`;
    if (!String(cod || '').trim() || !Number.isFinite(Number(corr)) || seen.has(key)) return;
    seen.add(key);
    queue.push({ cod: String(cod).trim(), corr: Number(corr) });
  };

  for (const row of abonosPropios || []) {
    pushTarget(row.CODDOC_FAC, row.CORRELATIVO_FAC);
  }

  if (TIPOS_RECALC_PADRE_CXC.has(tipodoc) || TIPOS_RECALC_PADRE_CXP.has(tipodoc)) {
    pushTarget(meta?.SERIEFAC, Number(String(meta?.NOFAC || '').trim()));
  }

  for (const item of queue) {
    await recalcSaldoDocumento(transaction, empnit, item.cod, item.corr);
  }
}

/**
 * Elimina documento revirtiendo inventario de sus líneas (DOCPRODUCTOS + DOCUMENTOS).
 * Antes del DELETE guarda snapshot en DOCUMENTOS_ELIMINADOS.
 * Bloquea si hay documentos relacionados (SERIEFAC/NOFAC o abonos hacia este documento).
 * Retenciones, compras, inventario, etc. pueden eliminarse aunque CORTE=SI.
 *
 * @param {object} [opts]
 * @param {string} [opts.usuario]
 * @param {string} [opts.motivo]
 */
async function deleteDocumentoOperado(pool, empnit, coddoc, correlativo, opts = {}) {
  const usuario = String(opts.usuario || '').trim().slice(0, 50) || 'SYSTEM';
  const motivo = String(opts.motivo || '').trim().slice(0, 255) || null;

  await ensureTable(pool);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const meta = await loadDocumentoDeleteMeta(transaction, empnit, coddoc, correlativo);
    const info = assertPuedeEliminarDocumento(meta);
    await assertNoDocumentosRelacionados(transaction, empnit, coddoc, correlativo);
    const abonosPropios = await loadAbonosPropios(transaction, empnit, coddoc, correlativo);

    await archiveDocumentoSnapshot(transaction, {
      empnit,
      coddoc,
      correlativo,
      tipodoc: info.tipodoc,
      usuario,
      motivo,
    });

    await revertirMovimientoInventarioDocumento(transaction, { empnit, coddoc, correlativo });

    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .query(`
        DELETE FROM dbo.DOCPRODUCTOS
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      `);

    await deleteAbonosPropios(transaction, empnit, coddoc, correlativo);

    const del = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .query(`
        DELETE FROM dbo.DOCUMENTOS
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      `);

    if (del.rowsAffected[0] === 0) {
      throw new DocumentoDeleteError('Documento no encontrado', 404);
    }

    await recalcTrasBorrar(transaction, empnit, info.tipodoc, meta, abonosPropios);

    await transaction.commit();
    return { ok: true, CODDOC: coddoc, CORRELATIVO: correlativo, TIPODOC: info.tipodoc };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = {
  DocumentoDeleteError,
  deleteDocumentoOperado,
  TIPOS_ELIMINABLES_IGNORA_CORTE,
};
