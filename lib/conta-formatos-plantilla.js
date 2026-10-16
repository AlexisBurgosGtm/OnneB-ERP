const sql = require('mssql');

async function codformatoExists(pool, empnit, codformato) {
  const cod = String(codformato ?? '').trim();
  if (!cod) return false;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODFORMATO', sql.VarChar, cod)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM dbo.CONTA_FORMATOS
      WHERE EMPNIT = @EMPNIT
        AND UPPER(LTRIM(RTRIM(CODFORMATO))) = UPPER(LTRIM(RTRIM(@CODFORMATO)))
    `);
  return Number(result.recordset[0]?.cnt) > 0;
}

async function findCuenta(pool, empnit, { estfin, da } = {}) {
  const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
  let extra = '';
  if (estfin) {
    request.input('ESTFIN', sql.VarChar, estfin);
    extra += " AND UPPER(LTRIM(RTRIM(ISNULL(ESTFIN, '')))) = UPPER(LTRIM(RTRIM(@ESTFIN)))";
  }
  if (da) {
    request.input('DA', sql.VarChar, da);
    extra += " AND UPPER(LTRIM(RTRIM(ISNULL(DA, '')))) = UPPER(LTRIM(RTRIM(@DA)))";
  }
  const result = await request.query(`
    SELECT TOP 1 CODCUENTA, DESCRIPCION
    FROM dbo.CONTA_CUENTAS
    WHERE EMPNIT = @EMPNIT
      AND ISNULL(ACTIVO, 'SI') = 'SI'
      AND UPPER(LTRIM(RTRIM(ISNULL(PD, 'D')))) = 'D'
      ${extra}
    ORDER BY CODCUENTA
  `);
  return result.recordset[0] || null;
}

async function ensureFormato(pool, empnit, codformato, desformato) {
  if (await codformatoExists(pool, empnit, codformato)) {
    return { created: false, codformato };
  }
  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODFORMATO', sql.VarChar, codformato)
    .input('DESFORMATO', sql.VarChar, desformato)
    .query(`
      INSERT INTO dbo.CONTA_FORMATOS (EMPNIT, CODFORMATO, DESFORMATO)
      VALUES (@EMPNIT, @CODFORMATO, @DESFORMATO)
    `);
  return { created: true, codformato };
}

async function partidaCount(pool, empnit, codformato) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODFORMATO', sql.VarChar, codformato)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM dbo.CONTA_FORMATOS_PARTIDAS
      WHERE EMPNIT = @EMPNIT AND CODFORMATO = @CODFORMATO
    `);
  return Number(result.recordset[0]?.cnt) || 0;
}

async function insertPartidas(pool, empnit, codformato, partidas) {
  if ((await partidaCount(pool, empnit, codformato)) > 0) {
    return { created: 0, skipped: true };
  }
  let created = 0;
  for (const p of partidas) {
    const codcuenta = String(p.codcuenta || '').trim();
    if (!codcuenta) continue;
    await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODFORMATO', sql.VarChar, codformato)
      .input('CODCUENTA', sql.VarChar, codcuenta)
      .input('DEBE', sql.VarChar, p.debe || '')
      .input('HABER', sql.VarChar, p.haber || '')
      .input('CENTRO_COSTO', sql.VarChar, p.centroCosto || '1')
      .query(`
        INSERT INTO dbo.CONTA_FORMATOS_PARTIDAS
          (EMPNIT, CODFORMATO, CODCUENTA, DEBE, HABER, CENTRO_COSTO)
        VALUES (@EMPNIT, @CODFORMATO, @CODCUENTA, @DEBE, @HABER, @CENTRO_COSTO)
      `);
    created += 1;
  }
  return { created, skipped: false };
}

/**
 * Plantillas iniciales (solo inserta formatos/partidas que no existan; no sobrescribe partidas editadas).
 */
const PLANTILLAS_FORMATOS = [
  { codformato: 'FACCON', desformato: 'FACTURA VENTA CONTADO' },
  { codformato: 'FACCRE', desformato: 'FACTURA VENTA CREDITO' },
  { codformato: 'FNCCON', desformato: 'NOTA CREDITO CLIENTES' },
  { codformato: 'DEVCON', desformato: 'DEVOLUCION VENTA CONTADO' },
  { codformato: 'COMCON', desformato: 'COMPRA CONTADO' },
  { codformato: 'COMCRE', desformato: 'COMPRA CREDITO' },
  { codformato: 'NDPCON', desformato: 'NOTA DEBITO PROVEEDORES' },
  { codformato: 'RCCCON', desformato: 'RECIBO CAJA CLIENTES' },
  { codformato: 'PRCCON', desformato: 'PAGO PROVEEDORES' },
];

async function buildPartidasForFormato(pool, empnit, codformato, cuentas) {
  const c = cuentas;
  const mk = (cod, debe, haber) => ({ codcuenta: cod, debe, haber, centroCosto: '1' });
  switch (String(codformato).trim().toUpperCase()) {
    case 'FACCON':
      return [
        mk(c.caja, 'TOTAL', ''),
        mk(c.ventas, '', 'SUBTOTAL'),
        mk(c.ivaPasivo, '', 'IVA'),
      ].filter((p) => p.codcuenta);
    case 'FACCRE':
      return [
        mk(c.clientes, 'TOTAL', ''),
        mk(c.ventas, '', 'SUBTOTAL'),
        mk(c.ivaPasivo, '', 'IVA'),
      ].filter((p) => p.codcuenta);
    case 'FNCCON':
    case 'DEVCON':
      return [
        mk(c.ventas, 'SUBTOTAL', ''),
        mk(c.ivaPasivo, 'IVA', ''),
        mk(c.clientes, '', 'TOTAL'),
      ].filter((p) => p.codcuenta);
    case 'COMCON':
      return [
        mk(c.inventario, 'SUBTOTAL', ''),
        mk(c.ivaActivo, 'IVA', ''),
        mk(c.caja, '', 'TOTAL'),
      ].filter((p) => p.codcuenta);
    case 'COMCRE':
      return [
        mk(c.inventario, 'SUBTOTAL', ''),
        mk(c.ivaActivo, 'IVA', ''),
        mk(c.proveedores, '', 'TOTAL'),
      ].filter((p) => p.codcuenta);
    case 'NDPCON':
      return [
        mk(c.proveedores, 'TOTAL', ''),
        mk(c.inventario, '', 'SUBTOTAL'),
        mk(c.ivaActivo, '', 'IVA'),
      ].filter((p) => p.codcuenta);
    case 'RCCCON':
      return [
        mk(c.caja, 'TOTAL', ''),
        mk(c.clientes, '', 'TOTAL'),
      ].filter((p) => p.codcuenta);
    case 'PRCCON':
      return [
        mk(c.proveedores, 'TOTAL', ''),
        mk(c.caja, '', 'TOTAL'),
      ].filter((p) => p.codcuenta);
    default:
      return [];
  }
}

async function ensurePlantillasFormatosContables(pool, empnit) {
  const warnings = [];
  const cuentas = {
    caja: (await findCuenta(pool, empnit, { estfin: 'ACTIVO', da: 'D' }))?.CODCUENTA,
    clientes: (await findCuenta(pool, empnit, { estfin: 'ACTIVO', da: 'D' }))?.CODCUENTA,
    inventario: (await findCuenta(pool, empnit, { estfin: 'ACTIVO', da: 'D' }))?.CODCUENTA,
    ivaActivo: (await findCuenta(pool, empnit, { estfin: 'ACTIVO', da: 'D' }))?.CODCUENTA,
    ivaPasivo: (await findCuenta(pool, empnit, { estfin: 'PASIVO', da: 'A' }))?.CODCUENTA,
    ventas: (await findCuenta(pool, empnit, { estfin: 'INGRESOS', da: 'A' }))?.CODCUENTA,
    proveedores: (await findCuenta(pool, empnit, { estfin: 'PASIVO', da: 'A' }))?.CODCUENTA,
  };

  if (!cuentas.caja && !cuentas.proveedores) {
    warnings.push(
      'No se encontraron cuentas de detalle en Nomenclatura. Se crearán los códigos de formato; agregue partidas manualmente si hace falta.'
    );
  }

  const formatos = [];
  for (const tpl of PLANTILLAS_FORMATOS) {
    const fmt = await ensureFormato(pool, empnit, tpl.codformato, tpl.desformato);
    const partidasTpl = await buildPartidasForFormato(pool, empnit, tpl.codformato, cuentas);
    const part = partidasTpl.length
      ? await insertPartidas(pool, empnit, tpl.codformato, partidasTpl)
      : { created: 0, skipped: true };
    formatos.push({
      codformato: tpl.codformato,
      formato: fmt,
      partidas: part,
    });
  }

  return {
    ok: true,
    empnit,
    formatos,
    cuentasUsadas: cuentas,
    warnings,
  };
}

module.exports = {
  PLANTILLAS_FORMATOS,
  ensurePlantillasFormatosContables,
};
