-- Valor monetario de cada punto en campañas de promociones.
IF COL_LENGTH('dbo.PROMOCIONES', 'VALORPUNTO') IS NULL
BEGIN
  ALTER TABLE dbo.PROMOCIONES ADD VALORPUNTO NUMERIC(18, 4) NULL;
END;
GO
