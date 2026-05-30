# OnneB_pos

SPA con vanilla JavaScript para punto de venta. Incluye Bootstrap 5.3.8, Socket.IO, MSSQL (`mssql`), IndexedDB (JsStore), SweetAlert2 y PWA instalable.

## Requisitos

- Node.js 18+
- SQL Server (opcional; el servidor arranca sin conexión activa)

## Instalación

```bash
npm install
node scripts/generate-icons.js
```

## Configuración

Copia `.env.example` a `.env` y ajusta los parámetros `DB_*` para tu instancia MS SQL Server.

## Ejecución

```bash
npm start
```

Desarrollo con recarga automática:

```bash
npm test
```

Abre [http://localhost:6500](http://localhost:6500). Cada `npm start` incrementa el contador de compilaciones (esquina inferior izquierda del login).

## Colores del tema

Edita `public/css/theme.css`:

- `--onneb-base-black` / `--onneb-base-white`
- `--onneb-color-primary`, `--onneb-color-secondary`, `--onneb-color-accent`

## Estructura

- `server.js` — Express, Socket.IO, pool MSSQL
- `public/js/F.js` — Funciones genéricas (`let F = { ... }`)
- `public/js/db.js` — JsStore / IndexedDB
- `public/js/manifest.js` — Registro del service worker
- `public/manifest.json` — Manifiesto PWA
