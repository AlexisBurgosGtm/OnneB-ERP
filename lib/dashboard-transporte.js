/**
 * Dashboard de inicio — Transporte (CODTIPOEMPLEADO = 6).
 */
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseMesAnio(mesRaw, anioRaw) {
  const mes = parseInt(mesRaw, 10);
  const anio = parseInt(anioRaw, 10);
  if (Number.isNaN(mes) || mes < 1 || mes > 12) return null;
  if (Number.isNaN(anio) || anio < 2020 || anio > 2035) return null;
  return { mes, anio };
}

async function fetchVehiculosResumen(pool, sql, empnit, mes, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        v.CODVEHICULO,
        v.PLACA,
        v.DESCRIPCION,
        v.MARCA,
        v.LINEA,
        ISNULL(agg.REGISTROS, 0) AS REGISTROS,
        ISNULL(agg.GALONES, 0) AS GALONES,
        ISNULL(agg.IMPORTE, 0) AS IMPORTE,
        ISNULL(mec.SERVICIOS_MECANICA, 0) AS SERVICIOS_MECANICA,
        ISNULL(mec.IMPORTE_MECANICA, 0) AS IMPORTE_MECANICA
      FROM dbo.VEHICULOS v
      LEFT JOIN (
        SELECT
          CODVEHICULO,
          COUNT(*) AS REGISTROS,
          SUM(ISNULL(GALONES_COMBUSTIBLE, 0)) AS GALONES,
          SUM(ISNULL(IMPORTE_COMBUSTIBLE, 0)) AS IMPORTE
        FROM dbo.VEHICULOS_KILOMETRAJES
        WHERE EMPNIT = @EMPNIT AND MES = @MES AND ANIO = @ANIO
        GROUP BY CODVEHICULO
      ) agg ON v.CODVEHICULO = agg.CODVEHICULO
      LEFT JOIN (
        SELECT
          CODVEHICULO,
          COUNT(*) AS SERVICIOS_MECANICA,
          SUM(ISNULL(IMPORTE, 0)) AS IMPORTE_MECANICA
        FROM dbo.VEHICULOS_MECANICA
        WHERE EMPNIT = @EMPNIT AND MES = @MES AND ANIO = @ANIO
        GROUP BY CODVEHICULO
      ) mec ON v.CODVEHICULO = mec.CODVEHICULO
      WHERE v.EMPNIT = @EMPNIT
      ORDER BY v.PLACA ASC, v.CODVEHICULO ASC
    `);
  return result.recordset.map((r) => ({
    CODVEHICULO: r.CODVEHICULO,
    PLACA: r.PLACA ?? null,
    DESCRIPCION: r.DESCRIPCION ?? null,
    MARCA: r.MARCA ?? null,
    LINEA: r.LINEA ?? null,
    registros: toNumber(r.REGISTROS),
    galones: toNumber(r.GALONES),
    importe: toNumber(r.IMPORTE),
    serviciosMecanica: toNumber(r.SERVICIOS_MECANICA),
    importeMecanica: toNumber(r.IMPORTE_MECANICA),
  }));
}

async function fetchGalonesPorVehiculo(pool, sql, empnit, mes, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        v.CODVEHICULO,
        ISNULL(NULLIF(LTRIM(RTRIM(v.PLACA)), ''), CONCAT('#', v.CODVEHICULO)) AS VEHICULO,
        SUM(ISNULL(k.GALONES_COMBUSTIBLE, 0)) AS GALONES
      FROM dbo.VEHICULOS_KILOMETRAJES k
      INNER JOIN dbo.VEHICULOS v
        ON k.EMPNIT = v.EMPNIT AND k.CODVEHICULO = v.CODVEHICULO
      WHERE k.EMPNIT = @EMPNIT AND k.MES = @MES AND k.ANIO = @ANIO
      GROUP BY v.CODVEHICULO, v.PLACA
      HAVING SUM(ISNULL(k.GALONES_COMBUSTIBLE, 0)) > 0
      ORDER BY SUM(ISNULL(k.GALONES_COMBUSTIBLE, 0)) DESC
    `);
  return result.recordset.map((r) => ({
    CODVEHICULO: r.CODVEHICULO,
    vehiculo: String(r.VEHICULO ?? '').trim(),
    galones: toNumber(r.GALONES),
  }));
}

async function fetchImportePorEmpleado(pool, sql, empnit, mes, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        ISNULL(e.CODEMPLEADO, k.CODEMP) AS CODEMP,
        ISNULL(
          NULLIF(LTRIM(RTRIM(e.NOMEMPLEADO)), ''),
          CONCAT('Empleado #', ISNULL(e.CODEMPLEADO, k.CODEMP))
        ) AS EMPLEADO,
        SUM(ISNULL(k.IMPORTE_COMBUSTIBLE, 0)) AS IMPORTE
      FROM dbo.VEHICULOS_KILOMETRAJES k
      LEFT JOIN dbo.Empleados e
        ON k.EMPNIT = e.EMPNIT AND k.CODEMP = e.CODEMPLEADO
      WHERE k.EMPNIT = @EMPNIT AND k.MES = @MES AND k.ANIO = @ANIO
      GROUP BY e.CODEMPLEADO, k.CODEMP, e.NOMEMPLEADO
      HAVING SUM(ISNULL(k.IMPORTE_COMBUSTIBLE, 0)) > 0
      ORDER BY SUM(ISNULL(k.IMPORTE_COMBUSTIBLE, 0)) DESC
    `);
  return result.recordset.map((r) => ({
    CODEMP: r.CODEMP,
    empleado: String(r.EMPLEADO ?? '').trim(),
    importe: toNumber(r.IMPORTE),
  }));
}

async function loadTransporteDashboard(pool, sql, empnit, mes, anio) {
  const [vehiculos, galonesPorVehiculo, importePorEmpleado] = await Promise.all([
    fetchVehiculosResumen(pool, sql, empnit, mes, anio),
    fetchGalonesPorVehiculo(pool, sql, empnit, mes, anio),
    fetchImportePorEmpleado(pool, sql, empnit, mes, anio),
  ]);

  const totales = vehiculos.reduce(
    (acc, v) => {
      acc.registros += v.registros;
      acc.galones += v.galones;
      acc.importe += v.importe;
      acc.serviciosMecanica += v.serviciosMecanica;
      acc.importeMecanica += v.importeMecanica;
      return acc;
    },
    { registros: 0, galones: 0, importe: 0, serviciosMecanica: 0, importeMecanica: 0 }
  );

  return {
    mes,
    anio,
    vehiculos,
    galonesPorVehiculo,
    importePorEmpleado,
    totales,
  };
}

module.exports = {
  parseMesAnio,
  loadTransporteDashboard,
};
