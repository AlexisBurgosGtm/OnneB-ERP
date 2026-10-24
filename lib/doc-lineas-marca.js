/** JOIN + columna DESMARCA para líneas de dbo.DOCPRODUCTOS (alias l). */
const SQL_JOIN_MARCA_DESDE_LINEA = `
  LEFT JOIN dbo.PRODUCTOS p_marca
    ON p_marca.EMPNIT = l.EMPNIT AND p_marca.CODPROD = l.CODPROD
  LEFT JOIN dbo.MARCAS m
    ON m.EMPNIT = p_marca.EMPNIT AND m.CODMARCA = p_marca.CODMARCA
`;

const SQL_COL_DESMARCA = `ISNULL(m.DESMARCA, '') AS DESMARCA`;

module.exports = {
  SQL_JOIN_MARCA_DESDE_LINEA,
  SQL_COL_DESMARCA,
};
