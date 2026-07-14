const { splitNombreCompleto, formatDateIgss, roundMoney } = require('./nomina-utils');

const IGSS_VERSION = '2.2.0';

function padField(value, maxLen = 50) {
  return String(value ?? '')
    .trim()
    .slice(0, maxLen);
}

function buildIgssPlanillaTxt({ config, planilla, lines }) {
  const patrono = padField(config?.IGSS_NUMERO_PATRONO || config?.NIT_PATRONO);
  const mes = String(planilla.MES).padStart(2, '0');
  const anio = String(planilla.ANIO);
  const razon = padField(config?.RAZON_SOCIAL, 120);
  const email = padField(config?.IGSS_EMAIL, 120);
  const centroDefault = padField(config?.IGSS_CENTRO_TRABAJO || '1', 10);
  const now = new Date();
  const fechaGen = formatDateIgss(now);

  const rows = [];
  rows.push(`[ENCABEZADO]`);
  rows.push(
    [
      IGSS_VERSION,
      fechaGen,
      patrono,
      mes,
      anio,
      razon,
      email,
    ].join('|')
  );

  rows.push(`[TIPOPLANILLA]`);
  rows.push(`01|Planilla ordinaria mensual|${mes}${anio}`);

  rows.push(`[CENTROTRABAJO]`);
  rows.push(`${centroDefault}|Centro principal|${razon}`);

  rows.push(`[LIQUIDACION]`);
  rows.push(`1|Liquidacion ${mes}/${anio}|${formatDateIgss(planilla.FECHA_PAGO || planilla.FECHA_FIN)}|01`);

  rows.push(`[EMPLEADOS]`);
  const activas = (lines || []).filter((l) => String(l.INCLUIDO || 'SI').toUpperCase() === 'SI');
  activas.forEach((line, idx) => {
    const n = splitNombreCompleto(line.NOMEMPLEADO);
    const sueldo = roundMoney(line.TOTAL_INGRESOS).toFixed(2);
    const deducciones = roundMoney(line.IGSS_LABORAL).toFixed(2);
    rows.push(
      [
        idx + 1,
        padField(line.IGSS, 20),
        padField(n.primerNombre, 30),
        padField(n.segundoNombre, 30),
        padField(n.primerApellido, 30),
        padField(n.segundoApellido, 30),
        padField(n.apellidoCasada, 30),
        sueldo,
        formatDateIgss(line.FECHA_ALTA),
        formatDateIgss(line.FECHA_BAJA),
        padField(line.COD_CENTRO_TRABAJO || centroDefault, 10),
        padField(line.DPI, 20),
        padField(line.COD_OCUPACION_IGSS, 10),
        padField(line.CONDICION_LABORAL || 'P', 1),
        deducciones,
        padField(line.TIPO_SALARIO_IGSS || '01', 2),
        String(line.HORAS_LABORADAS ?? ''),
        String(line.TIEMPO_COMPLETO || 'SI').toUpperCase() === 'SI' ? 'C' : 'P',
        String(line.DIAS_LABORADOS ?? ''),
      ].join('|')
    );
  });

  rows.push(`[FIN]`);

  const body = rows.join('\r\n');
  const fileName = `${patrono || 'patrono'}-${anio}${mes}-${fechaGen.replace(/\//g, '')}.txt`;
  return { body, fileName, mime: 'text/plain; charset=utf-8' };
}

module.exports = { buildIgssPlanillaTxt, IGSS_VERSION };
