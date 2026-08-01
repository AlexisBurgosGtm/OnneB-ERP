-- Roles de usuarios: menús permitidos por tipo de empleado.
-- Ejecutar vía Actualizador BD (UPDATE_QUERIES) o directamente en SQL Server.
-- ACCESO_TOTAL = 1  → acceso a todas las vistas del catálogo actual (MENUS = NULL).
-- ACCESO_TOTAL = 0  → MENUS = JSON array de keys (ej. ["inicio","facturacion"]).

IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'MENU_ACCESO_TIPOS' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.MENU_ACCESO_TIPOS (
    CODTIPOEMPLEADO INT NOT NULL,
    ACCESO_TOTAL BIT NOT NULL CONSTRAINT DF_MENU_ACCESO_TIPOS_TOTAL DEFAULT (0),
    MENUS NVARCHAR(MAX) NULL,
    FECHA_MOD DATETIME NULL,
    CONSTRAINT PK_MENU_ACCESO_TIPOS PRIMARY KEY (CODTIPOEMPLEADO)
  );
END
