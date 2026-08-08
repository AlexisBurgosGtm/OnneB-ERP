-- Permite vales a empleados acreditados por BANCO (CODCAJA queda vacío).
-- CAJA también puede dejar CODCAJA null si se desea; el app usa GENERADO_*.
IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.NOMINA_VALES_EMPLEADOS')
    AND name = 'CODCAJA'
    AND is_nullable = 0
)
BEGIN
  ALTER TABLE dbo.NOMINA_VALES_EMPLEADOS ALTER COLUMN CODCAJA INT NULL;
END;
GO
