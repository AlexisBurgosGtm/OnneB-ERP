const sql = require('mssql');

/** Comparación tolerante de EMPNIT / CODEMBARQUE. */
function sqlNormEmp(expr) {
  return `UPPER(LTRIM(RTRIM(CAST(${expr} AS VARCHAR(50)))))`;
}

function sqlNormToken(expr) {
  return `LTRIM(RTRIM(CAST(${expr} AS VARCHAR(100))))`;
}

/**
 * Traslados en nube para empresa destino (recibir):
 * EMPNIT = destino, CODEMBARQUE = emisor, TOKEN = instalación.
 */
const SQL_WHERE_TRASLADOS_PARA_DESTINO = `
  ${sqlNormToken('d.TOKEN')} = ${sqlNormToken('@TOKEN')}
  AND ${sqlNormEmp('d.EMPNIT')} = ${sqlNormEmp('@EMPNIT_DEST')}
`;

/**
 * @returns {Promise<object|null>} fila COMMUNITY_DOCUMENTOS
 */
async function findCommunityTrasladoForDestino(
  hostPool,
  localToken,
  destEmpnit,
  origenEmpnit,
  coddoc,
  correlativo
) {
  const result = await hostPool
    .request()
    .input('TOKEN', sql.VarChar, localToken)
    .input('EMPNIT_DEST', sql.VarChar, destEmpnit)
    .input('CODEMBARQUE', sql.VarChar, origenEmpnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT TOP 1 *
      FROM dbo.COMMUNITY_DOCUMENTOS d
      WHERE ${SQL_WHERE_TRASLADOS_PARA_DESTINO}
        AND ${sqlNormEmp('d.CODEMBARQUE')} = ${sqlNormEmp('@CODEMBARQUE')}
        AND LTRIM(RTRIM(CAST(d.CODDOC AS VARCHAR(50)))) = LTRIM(RTRIM(@CODDOC))
        AND d.CORRELATIVO = @CORRELATIVO
    `);
  return result.recordset?.[0] || null;
}

/** Por emisor + documento (traslados en tránsito). */
async function findCommunityTrasladoByOrigen(
  hostPool,
  localToken,
  origenEmpnit,
  coddoc,
  correlativo
) {
  const result = await hostPool
    .request()
    .input('TOKEN', sql.VarChar, localToken)
    .input('CODEMBARQUE', sql.VarChar, origenEmpnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT TOP 1 *
      FROM dbo.COMMUNITY_DOCUMENTOS d
      WHERE ${sqlNormToken('d.TOKEN')} = ${sqlNormToken('@TOKEN')}
        AND ${sqlNormEmp('d.CODEMBARQUE')} = ${sqlNormEmp('@CODEMBARQUE')}
        AND LTRIM(RTRIM(CAST(d.CODDOC AS VARCHAR(50)))) = LTRIM(RTRIM(@CODDOC))
        AND d.CORRELATIVO = @CORRELATIVO
    `);
  return result.recordset?.[0] || null;
}

module.exports = {
  sqlNormEmp,
  sqlNormToken,
  SQL_WHERE_TRASLADOS_PARA_DESTINO,
  findCommunityTrasladoForDestino,
  findCommunityTrasladoByOrigen,
};
