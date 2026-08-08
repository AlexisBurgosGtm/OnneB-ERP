-- Efectivo contado al cerrar corte (sugerencia de efectivo inicial en próxima apertura)
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Cajas' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  IF COL_LENGTH('dbo.Cajas', 'EFECTIVO_PROXIMA_CAJA') IS NULL
    ALTER TABLE dbo.Cajas ADD EFECTIVO_PROXIMA_CAJA NUMERIC(18, 3) NULL;
END;
GO
