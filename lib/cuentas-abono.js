const { nowParts } = require('./documento-fecha');
const { STATUS_OPERADO } = require('./documento-status');
const {
  SQL_TIPODOC_CUENTAS_COBRAR_IN,
  SQL_DOC_SALDO_PENDIENTE,
  SQL_TIPODOC_ABONO_CXC_IN,
  SQL_MATCH_FACTURA_REF,
} = require('./cuentas-docs');

const TIPODOC_RCC = 'RCC';

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseCorrelativo(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseFpagoAmount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundMoney(n);
}

async function resolveCodcajaAbierta(transaction, sql, empnit, body) {
  const raw = body?.CODCAJA ?? body?.codcaja;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    const err = new Error('Seleccione una caja abierta para el recibo');
    err.statusCode = 400;
    throw err;
  }
  const codcaja = parseInt(raw, 10);
  if (!Number.isFinite(codcaja) || codcaja <= 0) {
    const err = new Error('CODCAJA inválido');
    err.statusCode = 400;
    throw err;
  }
  const cajaRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .query(`
      SELECT CODCAJA, STATUS
      FROM dbo.Cajas
      WHERE EMPNIT = @EMPNIT AND CODCAJA = @CODCAJA
    `);
  const caja = cajaRes.recordset[0];
  if (!caja) {
    const err = new Error('Caja no encontrada');
    err.statusCode = 404;
    throw err;
  }
  if (Number(caja.STATUS) !== 1) {
    const err = new Error('La caja no está abierta');
    err.statusCode = 400;
    throw err;
  }
  return codcaja;
}

function resolveFormasPago(body, totalPrecio) {
  const fpago = {
    FPAGO_EFECTIVO: parseFpagoAmount(body?.FPAGO_EFECTIVO),
    FPAGO_TARJETA: parseFpagoAmount(body?.FPAGO_TARJETA),
    FPAGO_DEPOSITO: parseFpagoAmount(body?.FPAGO_DEPOSITO),
    FPAGO_CHEQUE: parseFpagoAmount(body?.FPAGO_CHEQUE),
    FPAGO_DESCRIPCION: String(body?.FPAGO_DESCRIPCION || '').trim(),
  };
  const sum = roundMoney(
    fpago.FPAGO_EFECTIVO + fpago.FPAGO_TARJETA + fpago.FPAGO_DEPOSITO + fpago.FPAGO_CHEQUE
  );
  const total = roundMoney(totalPrecio);
  if (sum <= 0) {
    const err = new Error('Indique la forma de pago por el monto del abono');
    err.statusCode = 400;
    throw err;
  }
  if (Math.abs(sum - total) > 0.001) {
    const err = new Error(
      `La suma de formas de pago (${sum}) debe ser igual al monto del abono (${total})`
    );
    err.statusCode = 400;
    throw err;
  }
  return fpago;
}

async function allocateCorrelativo(transaction, sql, empnit, coddoc) {
  const tipoRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT CORRELATIVO FROM dbo.TIPODOCUMENTOS WITH (UPDLOCK, ROWLOCK)
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const maxRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT ISNULL(MAX(CORRELATIVO), 0) AS maxCorr FROM dbo.DOCUMENTOS WITH (UPDLOCK, HOLDLOCK)
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const tipoCorr = Number(tipoRes.recordset[0]?.CORRELATIVO) || 0;
  const maxCorr = Number(maxRes.recordset[0]?.maxCorr) || 0;
  const next = Math.max(tipoCorr, maxCorr) + 1;
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORR', sql.Decimal(18, 0), next)
    .query(`
      UPDATE dbo.TIPODOCUMENTOS SET CORRELATIVO = @CORR
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  return next;
}

async function listTiposDocRcc(pool, sql, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('TIPODOC', sql.VarChar, TIPODOC_RCC)
    .query(`
      SELECT CODDOC, DESDOC, TIPODOC, ISNULL(CORRELATIVO, 0) AS CORRELATIVO
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND TIPODOC = @TIPODOC AND ACTIVO = 'SI'
      ORDER BY CODDOC
    `);
  return result.recordset.map((r) => ({
    CODDOC: r.CODDOC ?? null,
    DESDOC: r.DESDOC ?? null,
    TIPODOC: r.TIPODOC ?? TIPODOC_RCC,
    CORRELATIVO: Number(r.CORRELATIVO) || 0,
  }));
}

async function getTipoDocRcc(pool, sql, empnit) {
  const tipos = await listTiposDocRcc(pool, sql, empnit);
  return tipos[0] || null;
}

async function getTipoDocRccByCoddoc(pool, sql, empnit, coddoc) {
  const cod = String(coddoc || '').trim();
  if (!cod) return null;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, cod)
    .input('TIPODOC', sql.VarChar, TIPODOC_RCC)
    .query(`
      SELECT CODDOC, DESDOC, TIPODOC, ISNULL(CORRELATIVO, 0) AS CORRELATIVO
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND TIPODOC = @TIPODOC AND ACTIVO = 'SI'
    `);
  const row = result.recordset[0];
  if (!row) return null;
  return {
    CODDOC: row.CODDOC ?? null,
    DESDOC: row.DESDOC ?? null,
    TIPODOC: row.TIPODOC ?? TIPODOC_RCC,
    CORRELATIVO: Number(row.CORRELATIVO) || 0,
  };
}

async function previewSiguienteRcc(pool, sql, empnit, coddoc) {
  const cod = String(coddoc || '').trim();
  const tipoRcc = cod
    ? await getTipoDocRccByCoddoc(pool, sql, empnit, cod)
    : await getTipoDocRcc(pool, sql, empnit);
  if (!tipoRcc) return null;
  const coddocRcc = tipoRcc.CODDOC;
  const maxRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddocRcc)
    .query(`
      SELECT ISNULL(MAX(CORRELATIVO), 0) AS maxCorr
      FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const tipoCorr = Number(tipoRcc.CORRELATIVO) || 0;
  const maxCorr = Number(maxRes.recordset[0]?.maxCorr) || 0;
  const correlativo = Math.max(tipoCorr, maxCorr) + 1;
  return {
    CODDOC: coddocRcc,
    DESDOC: tipoRcc.DESDOC ?? null,
    TIPODOC: tipoRcc.TIPODOC ?? TIPODOC_RCC,
    CORRELATIVO: correlativo,
  };
}

async function loadFacturaCxc(pool, sql, empnit, coddoc, correlativo) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT
        d.*,
        t.DESDOC,
        t.TIPODOC,
        c.NEGOCIO,
        ISNULL(emp.NOMEMPLEADO, '') AS VENDEDOR
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      LEFT JOIN dbo.CLIENTES c ON d.EMPNIT = c.EMPNIT AND d.CODCLIENTE = c.CODCLIENTE
      LEFT OUTER JOIN dbo.Empleados emp ON emp.EMPNIT = d.EMPNIT AND emp.CODEMPLEADO = d.CODVEN
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
        AND t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN})
        AND d.STATUS = '${STATUS_OPERADO}'
        AND ISNULL(d.CONCRE, 'CON') = 'CRE'
    `);
  return result.recordset[0] || null;
}

async function fetchAbonosFactura(pool, sql, empnit, facCoddoc, facCorrelativo) {
  const correlativoFac = parseCorrelativo(facCorrelativo);
  if (!facCoddoc || correlativoFac === null) return [];

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('SERIEFAC', sql.VarChar, String(facCoddoc).trim())
    .input('NOFAC', sql.VarChar, String(correlativoFac))
    .input('FAC_CORRELATIVO', sql.Decimal(18, 0), correlativoFac)
    .query(`
      SELECT
        d.FECHA,
        d.CODDOC,
        d.CORRELATIVO,
        t.TIPODOC,
        t.DESDOC,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(d.FPAGO_EFECTIVO, 0) AS FPAGO_EFECTIVO,
        ISNULL(d.FPAGO_TARJETA, 0) AS FPAGO_TARJETA,
        ISNULL(d.FPAGO_DEPOSITO, 0) AS FPAGO_DEPOSITO,
        ISNULL(d.FPAGO_CHEQUE, 0) AS FPAGO_CHEQUE,
        ISNULL(d.FPAGO_DESCRIPCION, '') AS FPAGO_DESCRIPCION,
        d.SERIEFAC,
        d.NOFAC,
        d.USUARIO,
        d.OBS
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      WHERE d.EMPNIT = @EMPNIT
        AND t.TIPODOC IN (${SQL_TIPODOC_ABONO_CXC_IN})
        AND ${SQL_MATCH_FACTURA_REF}
        AND d.STATUS = '${STATUS_OPERADO}'
      ORDER BY d.FECHA DESC, d.HORA DESC, d.CORRELATIVO DESC
    `);
  return result.recordset.map((r) => ({
    FECHA: r.FECHA ?? null,
    CODDOC: r.CODDOC ?? null,
    CORRELATIVO: r.CORRELATIVO ?? null,
    TIPODOC: r.TIPODOC ?? null,
    DESDOC: r.DESDOC ?? null,
    TOTALPRECIO: toNumber(r.TOTALPRECIO),
    FPAGO_EFECTIVO: toNumber(r.FPAGO_EFECTIVO),
    FPAGO_TARJETA: toNumber(r.FPAGO_TARJETA),
    FPAGO_DEPOSITO: toNumber(r.FPAGO_DEPOSITO),
    FPAGO_CHEQUE: toNumber(r.FPAGO_CHEQUE),
    FPAGO_DESCRIPCION: String(r.FPAGO_DESCRIPCION ?? '').trim(),
    SERIEFAC: r.SERIEFAC ?? null,
    NOFAC: r.NOFAC ?? null,
    USUARIO: r.USUARIO ?? null,
    OBS: r.OBS ?? null,
  }));
}

async function crearAbonoRcc(pool, sql, empnit, facCoddoc, facCorrelativo, body) {
  const correlativoFac = parseCorrelativo(facCorrelativo);
  if (!facCoddoc || correlativoFac === null) {
    const err = new Error('Documento de factura inválido');
    err.statusCode = 400;
    throw err;
  }

  const abono = roundMoney(body?.MONTO ?? body?.TOTALPRECIO ?? body?.abono);
  if (abono <= 0) {
    const err = new Error('El monto del abono debe ser mayor a cero');
    err.statusCode = 400;
    throw err;
  }

  const usuario = String(body?.USUARIO || body?.usuario || 'CXC').trim();
  const obs = String(body?.OBS || '').trim();
  const fpago = resolveFormasPago(body, abono);

  const coddocRccReq = String(body?.CODDOC_RCC ?? body?.CODDOC ?? '').trim();
  const tipoRcc = coddocRccReq
    ? await getTipoDocRccByCoddoc(pool, sql, empnit, coddocRccReq)
    : await getTipoDocRcc(pool, sql, empnit);
  if (!tipoRcc) {
    const err = new Error(
      coddocRccReq
        ? `El documento ${coddocRccReq} no es un tipo RCC activo`
        : 'No hay tipo de documento RCC activo para la empresa'
    );
    err.statusCode = 400;
    throw err;
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const facRes = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, facCoddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativoFac)
      .query(`
        SELECT
          d.CODCLIENTE, d.DOC_NIT, d.DOC_NOMCLIE, d.DOC_DIRCLIE, d.CODVEN,
          ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
          ISNULL(d.DOC_SALDO, 0) AS DOC_SALDO,
          ISNULL(d.DOC_ABONO, 0) AS DOC_ABONO,
          d.STATUS,
          ISNULL(d.CONCRE, 'CON') AS CONCRE,
          t.TIPODOC
        FROM dbo.DOCUMENTOS d WITH (UPDLOCK, ROWLOCK)
        INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
        WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
          AND t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN})
          AND d.STATUS = '${STATUS_OPERADO}'
          AND ISNULL(d.CONCRE, 'CON') = 'CRE'
      `);
    if (!facRes.recordset.length) {
      const err = new Error('Factura al crédito no encontrada o no válida');
      err.statusCode = 404;
      throw err;
    }
    const fac = facRes.recordset[0];
    const docSaldo = toNumber(fac.DOC_SALDO);
    const docAbono = toNumber(fac.DOC_ABONO);
    if (abono > docSaldo + 0.001) {
      const err = new Error(`El abono no puede superar el saldo (${docSaldo})`);
      err.statusCode = 400;
      throw err;
    }

    const parts = nowParts();
    const coddocRcc = tipoRcc.CODDOC;
    const correlativoRcc = await allocateCorrelativo(transaction, sql, empnit, coddocRcc);
    const codcaja = await resolveCodcajaAbierta(transaction, sql, empnit, body);
    const obsRcc =
      obs ||
      `Abono a factura ${facCoddoc}-${correlativoFac}`;

    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ANIO', sql.Int, parts.anio)
      .input('MES', sql.Int, parts.mes)
      .input('DIA', sql.Int, parts.dia)
      .input('FECHA', sql.Date, parts.fecha)
      .input('HORA', sql.Int, parts.hora)
      .input('MINUTO', sql.Int, parts.minuto)
      .input('CODDOC', sql.VarChar, coddocRcc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativoRcc)
      .input('CODCLIENTE', sql.Int, fac.CODCLIENTE)
      .input('DOC_NIT', sql.VarChar, String(fac.DOC_NIT || 'CF'))
      .input('DOC_NOMCLIE', sql.VarChar, String(fac.DOC_NOMCLIE || ''))
      .input('DOC_DIRCLIE', sql.VarChar, String(fac.DOC_DIRCLIE || 'SN'))
      .input('CODVEN', sql.Int, fac.CODVEN != null ? Number(fac.CODVEN) : null)
      .input('TOTALPRECIO', sql.Decimal(18, 3), abono)
      .input('USUARIO', sql.VarChar, usuario)
      .input('OBS', sql.VarChar, obsRcc)
      .input('SERIEFAC', sql.VarChar, facCoddoc)
      .input('NOFAC', sql.VarChar, String(correlativoFac))
      .input('CODCAJA', sql.Int, codcaja)
      .input('FPAGO_EFECTIVO', sql.Decimal(18, 3), fpago.FPAGO_EFECTIVO)
      .input('FPAGO_TARJETA', sql.Decimal(18, 3), fpago.FPAGO_TARJETA)
      .input('FPAGO_DEPOSITO', sql.Decimal(18, 3), fpago.FPAGO_DEPOSITO)
      .input('FPAGO_CHEQUE', sql.Decimal(18, 3), fpago.FPAGO_CHEQUE)
      .input('FPAGO_DESCRIPCION', sql.VarChar, fpago.FPAGO_DESCRIPCION || '')
      .query(`
        INSERT INTO dbo.DOCUMENTOS (
          EMPNIT, ANIO, MES, DIA, FECHA, HORA, MINUTO, CODDOC, CORRELATIVO,
          CODCLIENTE, DOC_NIT, DOC_NOMCLIE, DOC_DIRCLIE, CODVEN,
          TOTALCOSTO, TOTALPRECIO, CODEMBARQUE, STATUS, USUARIO, CONCRE, CORTE,
          MARCA, OBS, DOC_SALDO, DOC_ABONO, OBSMARCA, TOTALDESCUENTO,
          DIRENTREGA, NOGUIA, VALORENTREGA, TOTALEXENTO, TIPOPAGO, NODOCPAGO,
          VENCIMIENTO, DIASCREDITO, TOTALIVA, TOTALSINIVA, PAGO, VUELTO,
          SERIEFAC, NOFAC, CODCAJA,
          FPAGO_EFECTIVO, FPAGO_TARJETA, FPAGO_DEPOSITO, FPAGO_CHEQUE, FPAGO_DESCRIPCION
        ) VALUES (
          @EMPNIT, @ANIO, @MES, @DIA, @FECHA, @HORA, @MINUTO, @CODDOC, @CORRELATIVO,
          @CODCLIENTE, @DOC_NIT, @DOC_NOMCLIE, @DOC_DIRCLIE, @CODVEN,
          0, @TOTALPRECIO, 'MOSTRADOR', '${STATUS_OPERADO}', @USUARIO, 'CON', 'NO',
          'SN', @OBS, 0, 0, 'SN', 0,
          'SN', 'SN', 0, 0, 'CONTADO', 'SN',
          @FECHA, 0, 0, 0, @TOTALPRECIO, 0,
          @SERIEFAC, @NOFAC, @CODCAJA,
          @FPAGO_EFECTIVO, @FPAGO_TARJETA, @FPAGO_DEPOSITO, @FPAGO_CHEQUE, @FPAGO_DESCRIPCION
        )
      `);

    const nuevoAbono = roundMoney(docAbono + abono);
    const nuevoSaldo = roundMoney(docSaldo - abono);
    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, facCoddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativoFac)
      .input('DOC_ABONO', sql.Decimal(18, 3), nuevoAbono)
      .input('DOC_SALDO', sql.Decimal(18, 3), nuevoSaldo)
      .query(`
        UPDATE dbo.DOCUMENTOS
        SET DOC_ABONO = @DOC_ABONO, DOC_SALDO = @DOC_SALDO
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      `);

    await transaction.commit();
    return {
      ok: true,
      abono: {
        CODDOC: coddocRcc,
        CORRELATIVO: correlativoRcc,
        TIPODOC: TIPODOC_RCC,
        TOTALPRECIO: abono,
        SERIEFAC: facCoddoc,
        NOFAC: String(correlativoFac),
        CODCAJA: codcaja,
      },
      factura: {
        CODDOC: facCoddoc,
        CORRELATIVO: correlativoFac,
        DOC_ABONO: nuevoAbono,
        DOC_SALDO: nuevoSaldo,
        SALDO_PENDIENTE: nuevoSaldo,
      },
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

/**
 * Recalcula DOC_ABONO y DOC_SALDO de todas las facturas al crédito operadas,
 * sumando RCC y notas de crédito (DEV/FNC) vinculadas por SERIEFAC/NOFAC,
 * más abonos de DOCUMENTOS_FACTURAS_ABONADAS solo cuando no exista ya un
 * documento de abono operado para esa misma factura (evita doble conteo si
 * CODDOC_REC quedó vacío o no coincide con el RCC).
 */
async function corregirSaldosCxc(pool, sql, empnit) {
  const countRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      WHERE d.EMPNIT = @EMPNIT
        AND t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN})
        AND d.STATUS = '${STATUS_OPERADO}'
        AND ISNULL(d.CONCRE, 'CON') = 'CRE'
    `);
  const totalFacturas = Number(countRes.recordset[0]?.cnt) || 0;

  const updRes = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
    ;WITH DocAbonos AS (
      SELECT
        a.EMPNIT,
        LTRIM(RTRIM(a.SERIEFAC)) AS FAC_CODDOC,
        TRY_CAST(LTRIM(RTRIM(a.NOFAC)) AS DECIMAL(18, 0)) AS FAC_CORRELATIVO,
        ISNULL(SUM(ISNULL(a.TOTALPRECIO, 0)), 0) AS TOTAL_ABONOS
      FROM dbo.DOCUMENTOS a
      INNER JOIN dbo.TIPODOCUMENTOS ta ON ta.EMPNIT = a.EMPNIT AND ta.CODDOC = a.CODDOC
      WHERE a.EMPNIT = @EMPNIT
        AND a.STATUS = '${STATUS_OPERADO}'
        AND ta.TIPODOC IN (${SQL_TIPODOC_ABONO_CXC_IN})
        AND LTRIM(RTRIM(ISNULL(a.SERIEFAC, ''))) <> ''
        AND TRY_CAST(LTRIM(RTRIM(a.NOFAC)) AS DECIMAL(18, 0)) IS NOT NULL
      GROUP BY
        a.EMPNIT,
        LTRIM(RTRIM(a.SERIEFAC)),
        TRY_CAST(LTRIM(RTRIM(a.NOFAC)) AS DECIMAL(18, 0))
    ),
    BancoAbonos AS (
      SELECT
        a.EMPNIT,
        LTRIM(RTRIM(a.CODDOC_FAC)) AS FAC_CODDOC,
        CAST(a.CORRELATIVO_FAC AS DECIMAL(18, 0)) AS FAC_CORRELATIVO,
        ISNULL(SUM(ISNULL(a.ABONO, 0)), 0) AS TOTAL_ABONOS
      FROM dbo.DOCUMENTOS_FACTURAS_ABONADAS a
      WHERE a.EMPNIT = @EMPNIT
        AND LTRIM(RTRIM(ISNULL(a.CODDOC_FAC, ''))) <> ''
        AND a.CORRELATIVO_FAC IS NOT NULL
        AND NOT EXISTS (
          /* Recibo bancario ya operado (enlace directo) */
          SELECT 1
          FROM dbo.DOCUMENTOS r
          WHERE r.EMPNIT = a.EMPNIT
            AND a.CODDOC_REC IS NOT NULL
            AND a.CORRELATIVO_REC IS NOT NULL
            AND r.CODDOC = a.CODDOC_REC
            AND r.CORRELATIVO = a.CORRELATIVO_REC
            AND r.STATUS = '${STATUS_OPERADO}'
        )
        AND NOT EXISTS (
          /* Cualquier RCC/DEV/FNC operado ya ligado a la misma factura */
          SELECT 1
          FROM dbo.DOCUMENTOS r
          INNER JOIN dbo.TIPODOCUMENTOS tr
            ON tr.EMPNIT = r.EMPNIT AND tr.CODDOC = r.CODDOC
          WHERE r.EMPNIT = a.EMPNIT
            AND r.STATUS = '${STATUS_OPERADO}'
            AND tr.TIPODOC IN (${SQL_TIPODOC_ABONO_CXC_IN})
            AND LTRIM(RTRIM(ISNULL(r.SERIEFAC, ''))) = LTRIM(RTRIM(a.CODDOC_FAC))
            AND TRY_CAST(LTRIM(RTRIM(r.NOFAC)) AS DECIMAL(18, 0)) = CAST(a.CORRELATIVO_FAC AS DECIMAL(18, 0))
        )
      GROUP BY
        a.EMPNIT,
        LTRIM(RTRIM(a.CODDOC_FAC)),
        CAST(a.CORRELATIVO_FAC AS DECIMAL(18, 0))
    ),
    AbonosFactura AS (
      SELECT
        EMPNIT,
        FAC_CODDOC,
        FAC_CORRELATIVO,
        ISNULL(SUM(TOTAL_ABONOS), 0) AS TOTAL_ABONOS
      FROM (
        SELECT EMPNIT, FAC_CODDOC, FAC_CORRELATIVO, TOTAL_ABONOS FROM DocAbonos
        UNION ALL
        SELECT EMPNIT, FAC_CODDOC, FAC_CORRELATIVO, TOTAL_ABONOS FROM BancoAbonos
      ) x
      GROUP BY EMPNIT, FAC_CODDOC, FAC_CORRELATIVO
    )
    UPDATE d
    SET
      d.DOC_ABONO = ISNULL(ab.TOTAL_ABONOS, 0),
      d.DOC_SALDO = CASE
        WHEN ISNULL(d.TOTALPRECIO, 0) - ISNULL(ab.TOTAL_ABONOS, 0) < 0 THEN 0
        ELSE ISNULL(d.TOTALPRECIO, 0) - ISNULL(ab.TOTAL_ABONOS, 0)
      END
    FROM dbo.DOCUMENTOS d
    INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
    LEFT JOIN AbonosFactura ab
      ON ab.EMPNIT = d.EMPNIT
      AND ab.FAC_CODDOC = LTRIM(RTRIM(d.CODDOC))
      AND ab.FAC_CORRELATIVO = d.CORRELATIVO
    WHERE d.EMPNIT = @EMPNIT
      AND t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN})
      AND d.STATUS = '${STATUS_OPERADO}'
      AND ISNULL(d.CONCRE, 'CON') = 'CRE'
  `);

  return {
    ok: true,
    totalFacturas,
    actualizadas: Number(updRes.rowsAffected?.[updRes.rowsAffected.length - 1]) || Number(updRes.rowsAffected[0]) || 0,
  };
}

module.exports = {
  TIPODOC_RCC,
  parseCorrelativo,
  listTiposDocRcc,
  getTipoDocRcc,
  getTipoDocRccByCoddoc,
  previewSiguienteRcc,
  loadFacturaCxc,
  fetchAbonosFactura,
  crearAbonoRcc,
  corregirSaldosCxc,
  SQL_DOC_SALDO_PENDIENTE,
};
