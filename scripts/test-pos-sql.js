require('dotenv').config();
const sql = require('mssql');
const { getDbConfig } = require('../config/database');

(async () => {
  const pool = await sql.connect(getDbConfig());
  const emp = 'ME-PETEN';
  const coddoc = 'ENVIOS01';
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const parts = { anio: 2026, mes: 5, dia: 30, fecha: new Date(), hora: 12, minuto: 0 };
  const correlativo = 1;
  try {
    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, emp)
      .input('ANIO', sql.Int, parts.anio)
      .input('MES', sql.Int, parts.mes)
      .input('DIA', sql.Int, parts.dia)
      .input('FECHA', sql.Date, parts.fecha)
      .input('HORA', sql.Int, parts.hora)
      .input('MINUTO', sql.Int, parts.minuto)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .input('CODCLIENTE', sql.Int, 1)
      .input('DOC_NIT', sql.VarChar, 'CF')
      .input('DOC_NOMCLIE', sql.VarChar, 'TEST POS')
      .input('DOC_DIRCLIE', sql.VarChar, 'SN')
      .input('USUARIO', sql.VarChar, 'TEST')
      .input('OBS', sql.VarChar, '')
      .query(`
        INSERT INTO dbo.DOCUMENTOS (
          EMPNIT, ANIO, MES, DIA, FECHA, HORA, MINUTO, CODDOC, CORRELATIVO,
          CODCLIENTE, DOC_NIT, DOC_NOMCLIE, DOC_DIRCLIE,
          TOTALCOSTO, TOTALPRECIO, CODEMBARQUE, STATUS, USUARIO, CONCRE, CORTE,
          MARCA, OBS, DOC_SALDO, DOC_ABONO, OBSMARCA, TOTALDESCUENTO, CODCAJA,
          DIRENTREGA, NOGUIA, VALORENTREGA, TOTALEXENTO, TIPOPAGO, NODOCPAGO,
          VENCIMIENTO, DIASCREDITO, TOTALIVA, TOTALSINIVA, PAGO, VUELTO
        ) VALUES (
          @EMPNIT, @ANIO, @MES, @DIA, @FECHA, @HORA, @MINUTO, @CODDOC, @CORRELATIVO,
          @CODCLIENTE, @DOC_NIT, @DOC_NOMCLIE, @DOC_DIRCLIE,
          0, 0, 'MOSTRADOR', 'D', @USUARIO, 'CON', 'NO',
          'SN', @OBS, 0, 0, 'SN', 0, 1,
          'SN', 'SN', 0, 0, 'CONTADO', 'SN',
          @FECHA, 0, 0, 0, 0, 0
        )
      `);
    await transaction.rollback();
    console.log('INSERT OK (rolled back)');
  } catch (e) {
    await transaction.rollback();
    console.error('INSERT FAIL', e.message);
    process.exit(1);
  }
  await pool.close();
})();
