require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

(async () => {
  const pool = await sql.connect(getDbConfig());
  for (const st of ['D', 'O']) {
    const r = await pool.request().query(`
      SELECT TOP 2 d.STATUS, d.CODDOC, t.TIPODOC, d.CORRELATIVO, d.TOTALPRECIO,
        (SELECT COUNT(*) FROM dbo.DOCPRODUCTOS l
         WHERE l.EMPNIT=d.EMPNIT AND l.CODDOC=d.CODDOC AND l.CORRELATIVO=d.CORRELATIVO) AS lineas
      FROM dbo.DOCUMENTOS d
      JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC=t.CODDOC AND d.EMPNIT=t.EMPNIT
      WHERE d.STATUS='${st}' AND t.TIPODOC IN ('ENV','COT','FAC')
      ORDER BY d.ID DESC
    `);
    console.log('STATUS', st, r.recordset);
  }
  const clientes = await pool.request().query(`
    SELECT TOP 3 CODCLIENTE, NOMBRECLIENTE, NEGOCIO, NIT, HABILITADO
    FROM dbo.CLIENTES WHERE HABILITADO='SI' ORDER BY CODCLIENTE
  `);
  console.log('clientes', clientes.recordset);
  await pool.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
