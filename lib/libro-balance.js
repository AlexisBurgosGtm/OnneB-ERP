const { fetchCuentasMap, saldoAfter } = require('./libro-mayor');
const { listLibroDiario } = require('./libro-diario');
const { roundMoney, toNumber } = require('./libro-contable-utils');

const BG_SECTIONS = ['ACTIVO', 'PASIVO', 'CAPITAL'];
const ER_SECTIONS = ['INGRESOS', 'COSTOS', 'GASTOS'];

function aggregateSaldosByCuenta(lines, cuentasMap) {
  const agg = new Map();

  lines.forEach((line) => {
    if (line.ANULADO) return;
    const key = String(line.CODCUENTA ?? '').trim().toUpperCase();
    if (!key) return;
    if (!agg.has(key)) {
      const meta = cuentasMap.get(key) || {};
      agg.set(key, {
        CODCUENTA: line.CODCUENTA,
        DESCRIPCION: meta.DESCRIPCION || line.DESCRIPCION_CUENTA || '',
        NIVEL: meta.NIVEL || 1,
        DA: meta.DA || 'D',
        PD: meta.PD || 'D',
        ESTFIN: meta.ESTFIN || 'SIN_CLASIFICAR',
        TIPOEF: meta.TIPOEF || 'BG',
        TOTAL_DEBE: 0,
        TOTAL_HABER: 0,
        SALDO: 0,
        MOVIMIENTOS: 0,
      });
    }
    const row = agg.get(key);
    row.TOTAL_DEBE = roundMoney(row.TOTAL_DEBE + toNumber(line.DEBE));
    row.TOTAL_HABER = roundMoney(row.TOTAL_HABER + toNumber(line.HABER));
    row.MOVIMIENTOS += 1;
  });

  agg.forEach((row) => {
    row.SALDO = saldoAfter(0, row.TOTAL_DEBE, row.TOTAL_HABER, row.DA);
  });

  return [...agg.values()];
}

function buildBalanceSections(cuentasAgg) {
  const sections = [
    { TIPO: 'BG', TITULO: 'Balance General', ESTFIN: null, rows: [], total: 0 },
    ...BG_SECTIONS.map((estfin) => ({
      TIPO: 'BG',
      TITULO: estfin,
      ESTFIN: estfin,
      rows: [],
      total: 0,
    })),
    { TIPO: 'ER', TITULO: 'Estado de Resultados', ESTFIN: null, rows: [], total: 0 },
    ...ER_SECTIONS.map((estfin) => ({
      TIPO: 'ER',
      TITULO: estfin,
      ESTFIN: estfin,
      rows: [],
      total: 0,
    })),
  ];

  const sectionMap = new Map();
  sections.forEach((s) => {
    if (s.ESTFIN) sectionMap.set(`${s.TIPO}:${s.ESTFIN}`, s);
  });

  cuentasAgg
    .filter((c) => c.MOVIMIENTOS > 0)
    .sort((a, b) => String(a.CODCUENTA).localeCompare(String(b.CODCUENTA), 'es'))
    .forEach((cuenta) => {
      const tipoef = String(cuenta.TIPOEF || 'BG').trim().toUpperCase();
      const estfin = String(cuenta.ESTFIN || 'SIN_CLASIFICAR').trim().toUpperCase();
      const key = `${tipoef}:${estfin}`;
      const section = sectionMap.get(key);
      if (section) {
        section.rows.push(cuenta);
        section.total = roundMoney(section.total + toNumber(cuenta.SALDO));
      }
    });

  const flatRows = [];
  let lineNo = 0;

  const appendSectionBlock = (blockSections, parentTitle) => {
    const withData = blockSections.filter((s) => s.rows.length);
    if (!withData.length) return;

    lineNo += 1;
    flatRows.push({
      TIPO: 'TITULO',
      LINEA: lineNo,
      SECCION: parentTitle,
      ESTFIN: null,
      CODCUENTA: null,
      DESCRIPCION: parentTitle,
      SALDO: null,
    });

    withData.forEach((section) => {
      lineNo += 1;
      flatRows.push({
        TIPO: 'GRUPO',
        LINEA: lineNo,
        SECCION: parentTitle,
        ESTFIN: section.ESTFIN,
        CODCUENTA: null,
        DESCRIPCION: section.TITULO,
        SALDO: section.total,
      });

      section.rows.forEach((cuenta) => {
        lineNo += 1;
        flatRows.push({
          TIPO: 'CUENTA',
          LINEA: lineNo,
          SECCION: parentTitle,
          ESTFIN: section.ESTFIN,
          CODCUENTA: cuenta.CODCUENTA,
          DESCRIPCION: cuenta.DESCRIPCION,
          NIVEL: cuenta.NIVEL,
          DA: cuenta.DA,
          DEBE: cuenta.TOTAL_DEBE,
          HABER: cuenta.TOTAL_HABER,
          SALDO: cuenta.SALDO,
          MOVIMIENTOS: cuenta.MOVIMIENTOS,
        });
      });
    });
  };

  appendSectionBlock(
    sections.filter((s) => s.TIPO === 'BG' && s.ESTFIN),
    'Balance General'
  );
  appendSectionBlock(
    sections.filter((s) => s.TIPO === 'ER' && s.ESTFIN),
    'Estado de Resultados'
  );

  const bgTotal = roundMoney(
    BG_SECTIONS.reduce((sum, estfin) => {
      const s = sectionMap.get(`BG:${estfin}`);
      return sum + (s ? toNumber(s.total) : 0);
    }, 0)
  );

  const ingresos = toNumber(sectionMap.get('ER:INGRESOS')?.total);
  const costos = toNumber(sectionMap.get('ER:COSTOS')?.total);
  const gastos = toNumber(sectionMap.get('ER:GASTOS')?.total);
  const utilidad = roundMoney(ingresos - costos - gastos);

  const totals = {
    cuentas: cuentasAgg.filter((c) => c.MOVIMIENTOS > 0).length,
    movimientos: cuentasAgg.reduce((n, c) => n + c.MOVIMIENTOS, 0),
    balanceGeneral: bgTotal,
    ingresos,
    costos,
    gastos,
    utilidad,
  };

  return { sections, rows: flatRows, totals };
}

async function listLibroBalance(pool, sql, empnit, mes, anio) {
  const cuentasMap = await fetchCuentasMap(pool, sql, empnit);
  const diario = await listLibroDiario(pool, sql, empnit, mes, anio);
  const cuentasAgg = aggregateSaldosByCuenta(diario.rows, cuentasMap);
  const balance = buildBalanceSections(cuentasAgg);

  return {
    rows: balance.rows,
    sections: balance.sections,
    totals: {
      ...balance.totals,
      documentos: diario.totals?.documentos ?? 0,
    },
    warnings: diario.warnings,
    mes,
    anio,
    nota: 'Basado en documentos contables actuales. Se integrarán más tipos de documento posteriormente.',
  };
}

module.exports = {
  BG_SECTIONS,
  ER_SECTIONS,
  listLibroBalance,
  aggregateSaldosByCuenta,
};
