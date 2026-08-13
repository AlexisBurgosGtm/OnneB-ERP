function roundMoney(n, decimals = 3) {
  const f = 10 ** decimals;
  return Math.round(Number(n) * f) / f;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function requireEmpNit(req, res) {
  const empnit = String(req.query.empnit || req.body?.empnit || '').trim();
  if (!empnit) {
    res.status(400).json({ error: 'empnit es obligatorio' });
    return null;
  }
  return empnit;
}

function parsePeriod(req, res) {
  const mes = parseInt(req.query.mes ?? req.body?.mes, 10);
  const anio = parseInt(req.query.anio ?? req.body?.anio, 10);
  if (!Number.isFinite(mes) || mes < 1 || mes > 12) {
    res.status(400).json({ error: 'mes inválido (1-12)' });
    return null;
  }
  if (!Number.isFinite(anio) || anio < 2000 || anio > 2100) {
    res.status(400).json({ error: 'anio inválido' });
    return null;
  }
  return { mes, anio };
}

function splitNombreCompleto(nombre) {
  const parts = String(nombre || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) {
    return { primerNombre: '', segundoNombre: '', primerApellido: '', segundoApellido: '', apellidoCasada: '' };
  }
  if (parts.length === 1) {
    return { primerNombre: parts[0], segundoNombre: '', primerApellido: '', segundoApellido: '', apellidoCasada: '' };
  }
  if (parts.length === 2) {
    return { primerNombre: parts[0], segundoNombre: '', primerApellido: parts[1], segundoApellido: '', apellidoCasada: '' };
  }
  if (parts.length === 3) {
    return { primerNombre: parts[0], segundoNombre: '', primerApellido: parts[1], segundoApellido: parts[2], apellidoCasada: '' };
  }
  return {
    primerNombre: parts[0],
    segundoNombre: parts[1],
    primerApellido: parts[2],
    segundoApellido: parts.slice(3).join(' '),
    apellidoCasada: '',
  };
}

function formatDateIgss(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function statusLabel(code) {
  const map = { B: 'Borrador', C: 'Calculada', F: 'Cerrada', A: 'Anulada' };
  return map[String(code || '').toUpperCase()] || code || '—';
}

/** Días a cargar en DIAS_LABORADOS según PERIODO_TIPO de la planilla. */
function diasLaboradosPorPeriodo(periodoTipo, diasMesConfig = 30) {
  const tipo = String(periodoTipo || 'MENSUAL').trim().toUpperCase();
  const diasMes = toNumber(diasMesConfig, 30) || 30;
  if (tipo === 'QUINCENAL') return 15;
  if (tipo === 'CATORCENAL') return 14;
  if (tipo === 'SEMANAL') return 7;
  return diasMes;
}

module.exports = {
  roundMoney,
  toNumber,
  requireEmpNit,
  parsePeriod,
  splitNombreCompleto,
  formatDateIgss,
  statusLabel,
  diasLaboradosPorPeriodo,
};
