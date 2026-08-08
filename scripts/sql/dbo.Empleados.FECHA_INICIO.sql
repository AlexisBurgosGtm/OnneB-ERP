-- Fecha de inicio laboral del empleado (nómina)
IF COL_LENGTH('dbo.Empleados', 'FECHA_INICIO') IS NULL
  ALTER TABLE dbo.Empleados ADD FECHA_INICIO DATE NULL;
