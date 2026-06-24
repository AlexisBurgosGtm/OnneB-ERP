/** JOIN INVSALDO por EMPNIT + CODPROD (sin bodega). */
const SQL_INVSALDO_JOIN = `
  LEFT JOIN dbo.INVSALDO inv
    ON inv.EMPNIT = p.EMPNIT
   AND inv.CODPROD = p.CODPROD
`;

/** JOIN INVSALDO para líneas DOCPRODUCTOS (alias l). */
const SQL_INVSALDO_JOIN_LINEA = `
  LEFT JOIN dbo.INVSALDO inv
    ON inv.EMPNIT = l.EMPNIT
   AND inv.CODPROD = l.CODPROD
`;

const SQL_INVSALDO_UNICO_JOIN = SQL_INVSALDO_JOIN;
const SQL_INVSALDO_UNICO_JOIN_LINEA = SQL_INVSALDO_JOIN_LINEA;
const SQL_INVSALDO_SALDO_APPLY = SQL_INVSALDO_JOIN;
const SQL_INVSALDO_SALDO_APPLY_LINEA = SQL_INVSALDO_JOIN_LINEA;

function sqlExistenciaMedidaExpr(equivaleCol) {
  const eq = equivaleCol || 'pr.EQUIVALE';
  return `
    CASE
      WHEN ISNULL(${eq}, 0) = 0 THEN 0
      ELSE CAST(ISNULL(inv.SALDO, 0) AS FLOAT) / CAST(${eq} AS FLOAT)
    END AS EXISTENCIA
  `;
}

function roundExistencia(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function calcExistenciaMedida(saldo, equivale) {
  const eq = Number(equivale) || 0;
  if (eq === 0) return 0;
  const s = Number(saldo) || 0;
  return roundExistencia(s / eq);
}

module.exports = {
  SQL_INVSALDO_JOIN,
  SQL_INVSALDO_JOIN_LINEA,
  SQL_INVSALDO_UNICO_JOIN,
  SQL_INVSALDO_UNICO_JOIN_LINEA,
  SQL_INVSALDO_SALDO_APPLY,
  SQL_INVSALDO_SALDO_APPLY_LINEA,
  sqlExistenciaMedidaExpr,
  calcExistenciaMedida,
  roundExistencia,
};
