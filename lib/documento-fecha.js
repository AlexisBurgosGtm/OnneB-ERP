/**
 * Actualiza FECHA, ANIO, MES, DIA en DOCUMENTOS y DOCPRODUCTOS.
 */
function parseFechaInput(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const anio = parseInt(m[1], 10);
  const mes = parseInt(m[2], 10);
  const dia = parseInt(m[3], 10);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || !Number.isFinite(dia)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return {
    anio,
    mes,
    dia,
    fecha: new Date(anio, mes - 1, dia),
  };
}

async function applyDocumentoFecha(transaction, sql, empnit, coddoc, correlativo, parts) {
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('FECHA', sql.Date, parts.fecha)
    .input('ANIO', sql.Int, parts.anio)
    .input('MES', sql.Int, parts.mes)
    .input('DIA', sql.Int, parts.dia)
    .query(`
      UPDATE dbo.DOCUMENTOS
      SET FECHA = @FECHA, ANIO = @ANIO, MES = @MES, DIA = @DIA
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
        AND STATUS = 'O'
    `);

  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('ANIO', sql.Int, parts.anio)
    .input('MES', sql.Int, parts.mes)
    .input('DIA', sql.Int, parts.dia)
    .query(`
      UPDATE dbo.DOCPRODUCTOS
      SET ANIO = @ANIO, MES = @MES, DIA = @DIA
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
}

module.exports = { parseFechaInput, applyDocumentoFecha };
