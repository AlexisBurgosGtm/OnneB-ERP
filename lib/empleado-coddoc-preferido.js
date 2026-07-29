/**
 * Serie (CODDOC) preferida del empleado: EMPLEADOS.WHATSAPP.
 */
async function resolveEmpleadoCoddocPreferido(pool, sql, empnit, codempleado) {
  const cod = Number(codempleado);
  if (!Number.isFinite(cod) || cod <= 0) return null;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMPLEADO', sql.Int, cod)
    .query(`
      SELECT TOP 1 LTRIM(RTRIM(ISNULL(WHATSAPP, ''))) AS WHATSAPP
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO
    `);
  const preferred = String(result.recordset[0]?.WHATSAPP || '').trim();
  return preferred || null;
}

function pickCoddocDefault(tipos, preferred) {
  const list = Array.isArray(tipos) ? tipos : [];
  const want = String(preferred || '').trim();
  if (want) {
    const match = list.find((t) => String(t.CODDOC ?? '').trim() === want);
    if (match) return match.CODDOC;
  }
  return list[0]?.CODDOC || null;
}

module.exports = {
  resolveEmpleadoCoddocPreferido,
  pickCoddocDefault,
};
