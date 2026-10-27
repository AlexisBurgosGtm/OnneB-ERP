/**
 * Consulta externa — existencia de un producto (JSON).
 */
async function fetchProductoInventario(pool, sql, empnit, codprod) {
  const emp = String(empnit || '').trim();
  const cod = String(codprod || '').trim();
  if (!emp || !cod) {
    const err = new Error('EMPNIT y codprod son obligatorios');
    err.statusCode = 400;
    throw err;
  }

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, emp)
    .input('CODPROD', sql.VarChar, cod)
    .query(`
      SELECT TOP 1
        LTRIM(RTRIM(p.CODPROD)) AS CODPROD,
        LTRIM(RTRIM(ISNULL(p.DESPROD, ''))) AS DESPROD,
        LTRIM(RTRIM(ISNULL(m.DESMARCA, ''))) AS DESMARCA,
        ISNULL(p.EXISTENCIA, 0) AS EXISTENCIA,
        ISNULL(p.FISICO, 0) AS FISICO
      FROM dbo.PRODUCTOS p
      LEFT JOIN dbo.Marcas m
        ON p.EMPNIT = m.EMPNIT AND p.CODMARCA = m.CODMARCA
      WHERE LTRIM(RTRIM(p.EMPNIT)) = LTRIM(RTRIM(@EMPNIT))
        AND LTRIM(RTRIM(p.CODPROD)) = LTRIM(RTRIM(@CODPROD))
    `);

  const row = result.recordset?.[0];
  if (!row) {
    const err = new Error('Producto no encontrado');
    err.statusCode = 404;
    throw err;
  }

  return {
    CODPROD: String(row.CODPROD || '').trim(),
    DESPROD: String(row.DESPROD || '').trim(),
    DESMARCA: String(row.DESMARCA || '').trim(),
    EXISTENCIA: Number(row.EXISTENCIA) || 0,
    FISICO: Number(row.FISICO) || 0,
  };
}

module.exports = { fetchProductoInventario };
