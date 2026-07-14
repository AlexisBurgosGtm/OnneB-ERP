const { roundMoney, toNumber } = require('./nomina-utils');

function calcularLineaNomina(line, config) {
  const diasMes = toNumber(config?.DIAS_MES, 30) || 30;
  const pctLab = toNumber(config?.PORC_IGSS_LABORAL, 4.83);
  const pctPat = toNumber(config?.PORC_IGSS_PATRONAL, 10.67);
  const pctIsr = toNumber(config?.PORC_ISR, 0);

  const salarioBase = roundMoney(line.SALARIO_BASE);
  const dias = Math.max(0, toNumber(line.DIAS_LABORADOS, diasMes));
  const factorDias = diasMes > 0 ? dias / diasMes : 1;
  const salarioPeriodo = roundMoney(salarioBase * factorDias);

  const bonificacion = roundMoney(line.BONIFICACION);
  const comision = roundMoney(line.COMISION);
  const otrosIngresos = roundMoney(line.OTROS_INGRESOS);
  const otrasDeducciones = roundMoney(line.OTRAS_DEDUCCIONES);

  const baseIgss = roundMoney(salarioPeriodo + bonificacion + comision);
  const igssLaboral = roundMoney(baseIgss * (pctLab / 100));
  const igssPatronal = roundMoney(baseIgss * (pctPat / 100));

  const totalIngresos = roundMoney(salarioPeriodo + bonificacion + comision + otrosIngresos);
  const baseIsr = Math.max(0, totalIngresos - igssLaboral);
  const isr = roundMoney(baseIsr * (pctIsr / 100));
  const totalDeducciones = roundMoney(igssLaboral + isr + otrasDeducciones);
  const neto = roundMoney(totalIngresos - totalDeducciones);

  return {
    ...line,
    SALARIO_BASE: salarioBase,
    DIAS_LABORADOS: dias,
    BONIFICACION: bonificacion,
    COMISION: comision,
    OTROS_INGRESOS: otrosIngresos,
    OTRAS_DEDUCCIONES: otrasDeducciones,
    IGSS_LABORAL: igssLaboral,
    IGSS_PATRONAL: igssPatronal,
    ISR: isr,
    TOTAL_INGRESOS: totalIngresos,
    TOTAL_DEDUCCIONES: totalDeducciones,
    NETO_PAGAR: neto,
  };
}

function totalesPlanilla(lines) {
  const incluidas = (lines || []).filter((l) => String(l.INCLUIDO || 'SI').toUpperCase() === 'SI');
  const sum = (key) => roundMoney(incluidas.reduce((acc, l) => acc + toNumber(l[key]), 0));
  return {
    TOTAL_INGRESOS: sum('TOTAL_INGRESOS'),
    TOTAL_DEDUCCIONES: sum('TOTAL_DEDUCCIONES'),
    TOTAL_NETO: sum('NETO_PAGAR'),
    TOTAL_IGSS_LAB: sum('IGSS_LABORAL'),
    TOTAL_IGSS_PAT: sum('IGSS_PATRONAL'),
    CANTIDAD_EMPLEADOS: incluidas.length,
  };
}

module.exports = { calcularLineaNomina, totalesPlanilla };
