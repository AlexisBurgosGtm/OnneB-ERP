# Generador de licencias OnneB

Herramienta **interna** para emitir archivos de licencia firmados.

## Fuente de módulos

El checklist del generador **no se edita aquí**. Sale de:

`lib/roles-usuarios.js` → `MENU_GROUPS` → `lib/license-modules.js`

Al crear una vista/`data-menu` nuevo, agréguelo a `MENU_GROUPS` (y `API_PREFIX_TO_MODULE` si hay API).  
Regla del repo: `.cursor/rules/licencias-nuevas-vistas.mdc`

Verificar alineación:

```bash
npm run license:check
```

## Importante

- **No copie** esta carpeta a instalaciones de clientes.
- La clave privada queda en `keys/private.pem` (no versionar).
- Al arrancar, sincroniza la clave pública a `../config/license-public.pem` (sí va en el POS del cliente).

## Uso

Desde la raíz del proyecto:

```bash
npm run licence
```

Abra http://localhost:6501, marque módulos, genere y descargue el `.json`.

Detener el servicio:

```bash
npm run stop-licence
# o
npm stop -- licence
```

En el POS del cliente: **Configuraciones → Licencia → Cargar archivo**.

## Modo estricto (opcional)

En el POS, si define `LICENSE_ENFORCE=1` en `.env`, sin archivo de licencia solo quedarán menús núcleo (`inicio`, `licencia`).
