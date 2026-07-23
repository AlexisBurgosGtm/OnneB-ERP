-- Passkey / WebAuthn (JSON) en Empleados
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Empleados' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  IF COL_LENGTH('dbo.Empleados', 'PASSKEY') IS NULL
    ALTER TABLE dbo.Empleados ADD PASSKEY NVARCHAR(MAX) NULL;
END;
GO
