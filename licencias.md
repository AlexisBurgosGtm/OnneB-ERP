
npm run licence

Abre http://localhost:6501 → eliges módulos y/o vistas individuales (ej. Operaciones sin Compras) → descargas el .json firmado.
Detener: npm run stop-licence   o   npm stop -- licence

Detener el POS: npm stop

La clave privada queda en GENERADOR LICENCIAS/keys/ (gitignored). La pública se sincroniza a config/license-public.pem.

En el POS (cliente)
Configuraciones → Licencia: ver estado y cargar el archivo.
Aplica a toda la instalación (no por EMPNIT).
Filtra menú + bloquea APIs por vista licenciada.
Sin archivo → modo abierto (todo habilitado).
Con LICENSE_ENFORCE=1 en .env → sin licencia solo inicio + licencia.
Flujo
Tú generas con el mini server.
Cliente activa en Licencia.
El archivo queda en data/license.json.
