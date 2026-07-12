const { listLibroDiario } = require('./libro-diario');
const { roundMoney, toNumber } = require('./libro-contable-utils');

async function fetchCuentasMap(pool, sql, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT CODCUENTA, DESCRIPCION, NIVEL, DA, PD, ESTFIN, TIPOEF
      FROM dbo.CONTA_CUENTAS
      WHERE EMPNIT = @EMPNIT
        AND ISNULL(ACTIVO, 'SI') = 'SI'
      ORDER BY CODCUENTA
    `);
  const map = new Map();
  (result.recordset || []).forEach((r) => {
    const key = String(r.CODCUENTA ?? '').trim().toUpperCase();
    if (key) map.set(key, r);
  });
  return map;
}

function cuentaMeta(cuentasMap, codcuenta) {
  const key = String(codcuenta ?? '').trim().toUpperCase();
  return (
    cuentasMap.get(key) || {
      CODCUENTA: codcuenta,
      DESCRIPCION: '',
      NIVEL: 1,
      DA: 'D',
      PD: 'D',
      ESTFIN: null,
      TIPOEF: null,
    }
  );
}

function saldoAfter(prev, debe, haber, da) {
  const d = toNumber(debe);
  const h = toNumber(haber);
  if (String(da ?? 'D').trim().toUpperCase() === 'A') {
    return roundMoney(prev + h - d);
  }
  return roundMoney(prev + d - h);
}

function buildMayorFromDiarioLines(lines, cuentasMap) {
  const byCuenta = new Map();

  lines.forEach((line) => {
    if (line.ANULADO) return;
    const key = String(line.CODCUENTA ?? '').trim().toUpperCase();
    if (!key) return;
    if (!byCuenta.has(key)) {
      const meta = cuentaMeta(cuentasMap, line.CODCUENTA);
      byCuenta.set(key, {
        CODCUENTA: line.CODCUENTA,
        DESCRIPCION: meta.DESCRIPCION || line.DESCRIPCION_CUENTA || '',
        DA: meta.DA || 'D',
        NIVEL: meta.NIVEL || 1,
        ESTFIN: meta.ESTFIN,
        TIPOEF: meta.TIPOEF,
        movimientos: [],
        TOTAL_DEBE: 0,
        TOTAL_HABER: 0,
        SALDO: 0,
      });
    }
    byCuenta.get(key).movimientos.push(line);
  });

  const cuentas = [...byCuenta.values()].sort((a, b) =>
    String(a.CODCUENTA).localeCompare(String(b.CODCUENTA), 'es')
  );

  const flatRows = [];
  let lineNo = 0;

  cuentas.forEach((cuenta) => {
    cuenta.movimientos.sort((a, b) => {
      const fa = String(a.FECHA_SORT || a.FECHA || '');
      const fb = String(b.FECHA_SORT || b.FECHA || '');
      if (fa !== fb) return fa.localeCompare(fb);
      return Number(a.LINEA || 0) - Number(b.LINEA || 0);
    });

    let saldo = 0;
    cuenta.TOTAL_DEBE = 0;
    cuenta.TOTAL_HABER = 0;

    lineNo += 1;
    flatRows.push({
      TIPO: 'CUENTA',
      LINEA: lineNo,
      CODCUENTA: cuenta.CODCUENTA,
      DESCRIPCION: cuenta.DESCRIPCION,
      DA: cuenta.DA,
      FECHA: null,
      DOC_REF: null,
      GLOSA: null,
      DEBE: null,
      HABER: null,
      SALDO: null,
    });

    cuenta.movimientos.forEach((mov) => {
      const debe = roundMoney(toNumber(mov.DEBE));
      const haber = roundMoney(toNumber(mov.HABER));
      saldo = saldoAfter(saldo, debe, haber, cuenta.DA);
      cuenta.TOTAL_DEBE = roundMoney(cuenta.TOTAL_DEBE + debe);
      cuenta.TOTAL_HABER = roundMoney(cuenta.TOTAL_HABER + haber);

      lineNo += 1;
      flatRows.push({
        TIPO: 'MOV',
        LINEA: lineNo,
        CODCUENTA: cuenta.CODCUENTA,
        DESCRIPCION: mov.DESCRIPCION_CUENTA || cuenta.DESCRIPCION,
        DA: cuenta.DA,
        FECHA: mov.FECHA,
        DOC_REF: mov.DOC_REF,
        GLOSA: `${mov.TIPODOC || ''} ${mov.DOC_NOMCLIE || ''}`.trim() || mov.DESDOC || '—',
        DEBE: debe,
        HABER: haber,
        SALDO: saldo,
        TIPODOC: mov.TIPODOC,
        CODFORMATO: mov.CODFORMATO,
      });
    });

    cuenta.SALDO = saldo;
    lineNo += 1;
    flatRows.push({
      TIPO: 'SUBTOTAL',
      LINEA: lineNo,
      CODCUENTA: cuenta.CODCUENTA,
      DESCRIPCION: `Subtotal ${cuenta.CODCUENTA}`,
      DA: cuenta.DA,
      FECHA: null,
      DOC_REF: null,
      GLOSA: 'Subtotal cuenta',
      DEBE: cuenta.TOTAL_DEBE,
      HABER: cuenta.TOTAL_HABER,
      SALDO: cuenta.SALDO,
    });
  });

  const totals = {
    cuentas: cuentas.length,
    movimientos: cuentas.reduce((n, c) => n + c.movimientos.length, 0),
    debe: roundMoney(cuentas.reduce((s, c) => s + toNumber(c.TOTAL_DEBE), 0)),
    haber: roundMoney(cuentas.reduce((s, c) => s + toNumber(c.TOTAL_HABER), 0)),
  };

  return { cuentas, rows: flatRows, totals };
}

async function listLibroMayor(pool, sql, empnit, mes, anio) {
  const cuentasMap = await fetchCuentasMap(pool, sql, empnit);
  const diario = await listLibroDiario(pool, sql, empnit, mes, anio);
  const mayor = buildMayorFromDiarioLines(diario.rows, cuentasMap);

  return {
    rows: mayor.rows,
    cuentas: mayor.cuentas,
    totals: {
      ...mayor.totals,
      documentos: diario.totals?.documentos ?? 0,
      lineasDiario: diario.totals?.lineas ?? 0,
      sinFormato: diario.totals?.sinFormato ?? 0,
      sinPartidas: diario.totals?.sinPartidas ?? 0,
    },
    warnings: diario.warnings,
    mes,
    anio,
  };
}

module.exports = {
  listLibroMayor,
  buildMayorFromDiarioLines,
  saldoAfter,
  fetchCuentasMap,
};
