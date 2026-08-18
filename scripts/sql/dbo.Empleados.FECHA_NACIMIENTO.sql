-- Fecha de nacimiento del empleado
IF COL_LENGTH('dbo.Empleados', 'FECHA_NACIMIENTO') IS NULL
  ALTER TABLE dbo.Empleados ADD FECHA_NACIMIENTO DATE NULL;
