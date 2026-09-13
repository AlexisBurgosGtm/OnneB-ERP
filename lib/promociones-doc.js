const sql = require('mssql');
const { STATUS_OPERADO, STATUS_ANULADO } = require('./documento-status');

const PROMO_TIPOS = ['POR IMPORTE', 'POR DOCUMENTO', 'POR FABRICANTE'];
const TIPODOC_FACTURA_PROMO = ['FAC', 'FEF', 'FEC', 'FES'];

function normalizePromoTipo(raw) {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  return PROMO_TIPOS.includes(s) ? s : null;
}

function promoValorPunto(promo) {
  const v = Number(promo?.VALORPUNTO);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function dineroPorPuntos(puntos, valorPunto) {
  const p = Number(puntos) || 0;
  const v = Number(valorPunto) || 0;
  return p * v;
}

async function listPromocionesActivas(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT ID, NOMBRE, FECHA_INICIO, FECHA_FIN, STATUS, TIPO, FACTOR_PUNTOS, VALORPUNTO, CODCLAUNO
      FROM dbo.PROMOCIONES
      WHERE EMPNIT = @EMPNIT AND STATUS = 'ACTIVA'
      ORDER BY ID DESC
    `);
  return result.recordset || [];
}

async function findRegistroCodigoEnPromosActivas(pool, empnit, codigo) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODIGO', sql.Int, codigo)
    .query(`
      SELECT TOP 1 r.ID, r.IDPROMO, r.CODIGO, r.TIPO, r.VALOR, p.NOMBRE AS PROMO_NOMBRE
      FROM dbo.PROMOCIONES_REGISTROS r
      INNER JOIN dbo.PROMOCIONES p ON p.ID = r.IDPROMO AND p.EMPNIT = @EMPNIT
      WHERE p.STATUS = 'ACTIVA' AND r.CODIGO = @CODIGO
      ORDER BY r.ID DESC
    `);
  return result.recordset[0] || null;
}

function parsePromocionCodigo(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }
  const m = s.match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? n : null;
}

async function listClasificacionUno(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT CODCLAUNO, DESCLAUNO
      FROM dbo.CLASIFICACIONUNO
      WHERE EMPNIT = @EMPNIT
      ORDER BY DESCLAUNO
    `);
  return result.recordset || [];
}

function tipodocsSqlIn() {
  return TIPODOC_FACTURA_PROMO.map((t) => `'${t}'`).join(', ');
}

async function sumPuntosCobrados(pool, empnit, codigo, idPromo = null) {
  const req = pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODIGO', sql.Int, codigo);
  let promoFilter = '';
  if (idPromo != null) {
    req.input('IDPROMO', sql.Int, idPromo);
    promoFilter = ' AND IDPROMO = @IDPROMO';
  }
  const result = await req.query(`
    SELECT
      ISNULL(SUM(PUNTOS), 0) AS PUNTOS_COBRADOS,
      ISNULL(SUM(IMPORTE), 0) AS IMPORTE_COBRADO
    FROM dbo.PROMOCIONES_PAGOS
    WHERE EMPNIT = @EMPNIT AND CODIGO = @CODIGO${promoFilter}
  `);
  return {
    puntosCobrados: Number(result.recordset[0]?.PUNTOS_COBRADOS) || 0,
    importeCobrado: Number(result.recordset[0]?.IMPORTE_COBRADO) || 0,
  };
}

/**
 * Métrica + puntos generados por un carné (CODIGO) bajo una promoción.
 */
async function calcMetricaYPuntos(pool, empnit, promo, codigo) {
  const tipo = normalizePromoTipo(promo.TIPO) || 'POR DOCUMENTO';
  const factor = Number(promo.FACTOR_PUNTOS) || 0;
  const tipodocsSql = tipodocsSqlIn();
  let documentos = 0;
  let totalPrecio = 0;
  let metrica = 0;
  let warning = null;

  if (codigo == null) {
    return { documentos: 0, totalPrecio: 0, metrica: 0, puntos: 0, tipo, factor, warning: 'Sin código' };
  }

  if (tipo === 'POR FABRICANTE') {
    const codClauno = promo.CODCLAUNO != null ? Number(promo.CODCLAUNO) : null;
    if (codClauno == null || !Number.isFinite(codClauno)) {
      return {
        documentos: 0,
        totalPrecio: 0,
        metrica: 0,
        puntos: 0,
        tipo,
        factor,
        warning: 'Sin fabricante (CODCLAUNO) en la promoción',
      };
    }
    const fabRes = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODIGO', sql.Int, codigo)
      .input('CODCLAUNO', sql.Int, codClauno)
      .query(`
        SELECT
          COUNT(DISTINCT CONCAT(d.CODDOC, '|', CAST(d.CORRELATIVO AS VARCHAR(30)))) AS DOCUMENTOS,
          ISNULL(SUM(lp.TOTALPRECIO), 0) AS TOTALPRECIO
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t
          ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        INNER JOIN dbo.DOCPRODUCTOS lp
          ON lp.EMPNIT = d.EMPNIT AND lp.CODDOC = d.CODDOC AND lp.CORRELATIVO = d.CORRELATIVO
        INNER JOIN dbo.PRODUCTOS p
          ON p.EMPNIT = lp.EMPNIT AND p.CODPROD = lp.CODPROD
        WHERE d.EMPNIT = @EMPNIT
          AND d.PROMOCION_CODIGO = @CODIGO
          AND d.STATUS = '${STATUS_OPERADO}'
          AND d.STATUS <> '${STATUS_ANULADO}'
          AND t.TIPODOC IN (${tipodocsSql})
          AND p.CODCLAUNO = @CODCLAUNO
      `);
    documentos = Number(fabRes.recordset[0]?.DOCUMENTOS) || 0;
    totalPrecio = Number(fabRes.recordset[0]?.TOTALPRECIO) || 0;
    metrica = totalPrecio;
  } else {
    const docRes = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODIGO', sql.Int, codigo)
      .query(`
        SELECT
          COUNT(1) AS DOCUMENTOS,
          ISNULL(SUM(d.TOTALPRECIO), 0) AS TOTALPRECIO
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t
          ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT
          AND d.PROMOCION_CODIGO = @CODIGO
          AND d.STATUS = '${STATUS_OPERADO}'
          AND d.STATUS <> '${STATUS_ANULADO}'
          AND t.TIPODOC IN (${tipodocsSql})
      `);
    documentos = Number(docRes.recordset[0]?.DOCUMENTOS) || 0;
    totalPrecio = Number(docRes.recordset[0]?.TOTALPRECIO) || 0;
    metrica = tipo === 'POR DOCUMENTO' ? documentos : totalPrecio;
  }

  return {
    documentos,
    totalPrecio,
    metrica,
    puntos: metrica * factor,
    tipo,
    factor,
    warning,
  };
}

/**
 * Puntos del carné (CODIGO) para mostrar al finalizar factura.
 * Disponible = acumulados − cobrados (PROMOCIONES_PAGOS).
 */
async function getPuntosPorCodigo(pool, empnit, codigo) {
  const codigoNum = Number(codigo);
  if (!Number.isFinite(codigoNum)) {
    return { found: false, error: 'Código inválido' };
  }

  const regRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODIGO', sql.Int, codigoNum)
    .query(`
      SELECT TOP 1
        r.ID AS IDREGISTRO, r.IDPROMO, r.CODIGO, r.TIPO AS REG_TIPO, r.VALOR,
        p.ID, p.NOMBRE, p.TIPO, p.FACTOR_PUNTOS, p.VALORPUNTO, p.CODCLAUNO, p.STATUS,
        c1.DESCLAUNO
      FROM dbo.PROMOCIONES_REGISTROS r
      INNER JOIN dbo.PROMOCIONES p ON p.ID = r.IDPROMO AND p.EMPNIT = @EMPNIT
      LEFT JOIN dbo.CLASIFICACIONUNO c1
        ON c1.EMPNIT = p.EMPNIT AND c1.CODCLAUNO = p.CODCLAUNO
      WHERE r.CODIGO = @CODIGO
      ORDER BY CASE WHEN p.STATUS = 'ACTIVA' THEN 0 ELSE 1 END, r.ID DESC
    `);
  const row = regRes.recordset[0];
  if (!row) {
    return { found: false, codigo: codigoNum, error: 'Código no registrado en promociones' };
  }

  const promo = {
    ID: row.ID,
    NOMBRE: row.NOMBRE,
    TIPO: row.TIPO,
    FACTOR_PUNTOS: row.FACTOR_PUNTOS,
    VALORPUNTO: row.VALORPUNTO,
    CODCLAUNO: row.CODCLAUNO,
    DESCLAUNO: row.DESCLAUNO,
    STATUS: row.STATUS,
  };

  const calc = await calcMetricaYPuntos(pool, empnit, promo, codigoNum);
  const cobrados = await sumPuntosCobrados(pool, empnit, codigoNum, promo.ID);
  const puntosAcumulados = calc.puntos;
  const puntosCobrados = cobrados.puntosCobrados;
  const puntosDisponibles = Math.max(0, puntosAcumulados - puntosCobrados);
  const valorPunto = promoValorPunto(promo);

  return {
    found: true,
    codigo: codigoNum,
    promo,
    registro: {
      ID: row.IDREGISTRO,
      IDPROMO: row.IDPROMO,
      CODIGO: row.CODIGO,
      TIPO: row.REG_TIPO,
      VALOR: row.VALOR,
    },
    tipo: calc.tipo,
    factor: calc.factor,
    documentos: calc.documentos,
    totalPrecio: calc.totalPrecio,
    metrica: calc.metrica,
    puntosAcumulados,
    puntosCobrados,
    importeCobrado: cobrados.importeCobrado,
    puntosDisponibles,
    valorPunto,
    dineroDisponible: dineroPorPuntos(puntosDisponibles, valorPunto),
    warning: calc.warning,
  };
}

/**
 * Puntos acumulados por cada registro de la promoción,
 * cruzando facturas FAC/FEL válidas (STATUS operado, no anulado)
 * con DOCUMENTOS.PROMOCION_CODIGO = PROMOCIONES_REGISTROS.CODIGO.
 */
async function getPuntosAcumulados(pool, empnit, idPromo) {
  const promoRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, idPromo)
    .query(`
      SELECT p.ID, p.NOMBRE, p.FECHA_INICIO, p.FECHA_FIN, p.STATUS,
             p.TIPO, p.FACTOR_PUNTOS, p.VALORPUNTO, p.CODCLAUNO,
             c1.DESCLAUNO
      FROM dbo.PROMOCIONES p
      LEFT JOIN dbo.CLASIFICACIONUNO c1
        ON c1.EMPNIT = p.EMPNIT AND c1.CODCLAUNO = p.CODCLAUNO
      WHERE p.EMPNIT = @EMPNIT AND p.ID = @ID
    `);
  const promo = promoRes.recordset[0] || null;
  if (!promo) return null;

  const tipo = normalizePromoTipo(promo.TIPO) || 'POR DOCUMENTO';
  const factor = Number(promo.FACTOR_PUNTOS) || 0;
  const valorPunto = promoValorPunto(promo);

  const regsRes = await pool
    .request()
    .input('IDPROMO', sql.Int, idPromo)
    .query(`
      SELECT ID, IDPROMO, FECHA, CODIGO, TIPO, VALOR
      FROM dbo.PROMOCIONES_REGISTROS
      WHERE IDPROMO = @IDPROMO
      ORDER BY FECHA DESC, ID DESC
    `);
  const registros = regsRes.recordset || [];

  const rows = [];
  let totalDocumentos = 0;
  let totalImporte = 0;
  let totalPuntos = 0;
  let totalCobrados = 0;
  let totalDisponibles = 0;
  let totalDineroDisponible = 0;

  for (const reg of registros) {
    const calc = await calcMetricaYPuntos(pool, empnit, promo, reg.CODIGO);
    const cobrados =
      reg.CODIGO != null
        ? await sumPuntosCobrados(pool, empnit, reg.CODIGO, idPromo)
        : { puntosCobrados: 0, importeCobrado: 0 };
    const puntosDisponibles = Math.max(0, calc.puntos - cobrados.puntosCobrados);
    const dineroDisponible = dineroPorPuntos(puntosDisponibles, valorPunto);

    totalDocumentos += calc.documentos;
    totalImporte += calc.totalPrecio;
    totalPuntos += calc.puntos;
    totalCobrados += cobrados.puntosCobrados;
    totalDisponibles += puntosDisponibles;
    totalDineroDisponible += dineroDisponible;

    rows.push({
      ...reg,
      documentos: calc.documentos,
      totalPrecio: calc.totalPrecio,
      metrica: calc.metrica,
      puntos: calc.puntos,
      puntosCobrados: cobrados.puntosCobrados,
      puntosDisponibles,
      dineroDisponible,
      warning: calc.warning,
    });
  }

  return {
    promo,
    tipo,
    factor,
    valorPunto,
    rows,
    totales: {
      documentos: totalDocumentos,
      totalPrecio: totalImporte,
      puntos: totalPuntos,
      puntosCobrados: totalCobrados,
      puntosDisponibles: totalDisponibles,
      dineroDisponible: totalDineroDisponible,
    },
  };
}

module.exports = {
  PROMO_TIPOS,
  TIPODOC_FACTURA_PROMO,
  normalizePromoTipo,
  listPromocionesActivas,
  findRegistroCodigoEnPromosActivas,
  parsePromocionCodigo,
  listClasificacionUno,
  getPuntosAcumulados,
  getPuntosPorCodigo,
  sumPuntosCobrados,
};
