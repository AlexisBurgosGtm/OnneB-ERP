require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sql = require('mssql');
const { getDbConfig, isDbConfigured } = require('./config/database');
const { registerSocketHandlers } = require('./lib/socket-hub');

const PORT = process.env.PORT || 6500;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

let dbPool = null;

const empresasRouter = require('./routes/empresas');
const marcasRouter = require('./routes/marcas');
const medidasRouter = require('./routes/medidas');
const rutasRouter = require('./routes/rutas');
const fabricantesRouter = require('./routes/fabricantes');
const ubicacionesRouter = require('./routes/ubicaciones');
const clientesRouter = require('./routes/clientes');
const tipoNegociosRouter = require('./routes/tipo-negocios');
const proveedoresRouter = require('./routes/proveedores');
const municipiosRouter = require('./routes/municipios');
const departamentosRouter = require('./routes/departamentos');
const empleadosRouter = require('./routes/empleados');
const tipoDocumentosRouter = require('./routes/tipo-documentos');
const cajasRouter = require('./routes/cajas');
const vehiculosRouter = require('./routes/vehiculos');
const mantenimientoLlantasRouter = require('./routes/mantenimiento-llantas');
const kilometrajesRouter = require('./routes/kilometrajes');
const servicioMecanicaRouter = require('./routes/servicio-mecanica');
const plataformasRouter = require('./routes/plataformas');
const authRouter = require('./routes/auth');
const { router: configRouter } = require('./routes/config');
const developerRouter = require('./routes/developer');
const posRouter = require('./routes/pos');
const cotizacionesRouter = require('./routes/cotizaciones');
const facturacionRouter = require('./routes/facturacion');
const notasCreditoRouter = require('./routes/notas-credito');
const notasAbonoRouter = require('./routes/notas-abono');
const notasDebitoRouter = require('./routes/notas-debito');
const corteCajaRouter = require('./routes/corte-caja');
const comprasRouter = require('./routes/compras');
const { entradasRouter, salidasRouter } = require('./routes/inventario-docs');
const inventarioSaldoRouter = require('./routes/inventario-saldo');
const documentosRouter = require('./routes/documentos');
const productosRouter = require('./routes/productos');
const suscripcionesRouter = require('./routes/suscripciones');
const credencialesFelRouter = require('./routes/credenciales-fel');
const felRouter = require('./routes/fel');
const updaterRouter = require('./routes/updater');
const dashboardRouter = require('./routes/dashboard');
const tareasRouter = require('./routes/tareas');
const cuentasCobrarRouter = require('./routes/cuentas-cobrar');
const cuentasPagarRouter = require('./routes/cuentas-pagar');
const libroVentasRouter = require('./routes/libro-ventas');
const libroComprasRouter = require('./routes/libro-compras');
const libroDiarioRouter = require('./routes/libro-diario');
const libroMayorRouter = require('./routes/libro-mayor');
const libroBalanceRouter = require('./routes/libro-balance');
const nomenclaturaContableRouter = require('./routes/nomenclatura-contable');
const formatosContablesRouter = require('./routes/formatos-contables');
const retencionesIvaRouter = require('./routes/retenciones-iva');
const retencionesIsrRouter = require('./routes/retenciones-isr');
const configContabilidadRouter = require('./routes/config-contabilidad');
const nominaRouter = require('./routes/nomina');
const bancosRouter = require('./routes/bancos');
const cuentasBancariasRouter = require('./routes/cuentas-bancarias');

async function getDbPool() {
  const dbConfig = getDbConfig();
  if (!dbConfig) {
    return null;
  }
  if (dbPool && dbPool.connected) {
    return dbPool;
  }
  dbPool = await sql.connect(dbConfig);
  return dbPool;
}

/** Logo empresa: hasta ~512 KB binario → ~1 MB hex en JSON + demás campos del formulario. */
app.use(express.json({ limit: '3mb' }));
app.locals.getDbPool = getDbPool;
app.locals.io = io;

const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const buildMetaPath = path.join(publicDir, 'build-meta.json');

app.use(
  '/data',
  express.static(dataDir, {
    etag: false,
    lastModified: true,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  })
);

app.use(
  express.static(publicDir, {
    etag: false,
    lastModified: true,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  })
);

app.get('/api/build-meta', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  if (fs.existsSync(buildMetaPath)) {
    res.sendFile(buildMetaPath);
  } else {
    res.json({ buildCount: 0, buildDate: null });
  }
});

function watchBuildMetaBroadcast() {
  if (!fs.existsSync(publicDir)) return;

  let notifyTimer = null;
  const notify = () => {
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
      io.emit('build:updated');
    }, 80);
  };

  try {
    fs.watch(publicDir, { recursive: true }, (_event, filename) => {
      if (filename && String(filename).replace(/\\/g, '/').includes('build-meta.json')) {
        notify();
      }
    });
  } catch (err) {
    console.warn('[Watch] build-meta broadcast:', err.message);
  }
}

app.use('/api/empresas', empresasRouter);
app.use('/api/marcas', marcasRouter);
app.use('/api/medidas', medidasRouter);
app.use('/api/rutas', rutasRouter);
app.use('/api/fabricantes', fabricantesRouter);
app.use('/api/ubicaciones', ubicacionesRouter);
app.use('/api/clientes', clientesRouter);
app.use('/api/tipo-negocios', tipoNegociosRouter);
app.use('/api/proveedores', proveedoresRouter);
app.use('/api/municipios', municipiosRouter);
app.use('/api/departamentos', departamentosRouter);
app.use('/api/empleados', empleadosRouter);
app.use('/api/tipo-documentos', tipoDocumentosRouter);
app.use('/api/cajas', cajasRouter);
app.use('/api/vehiculos', vehiculosRouter);
app.use('/api/mantenimiento-llantas', mantenimientoLlantasRouter);
app.use('/api/kilometrajes', kilometrajesRouter);
app.use('/api/servicio-mecanica', servicioMecanicaRouter);
app.use('/api/plataformas', plataformasRouter);
app.use('/api/auth', authRouter);
app.use('/api/config', configRouter);
app.use('/api/developer', developerRouter);
app.use('/api/pos', posRouter);
app.use('/api/cotizaciones', cotizacionesRouter);
app.use('/api/facturacion', facturacionRouter);
app.use('/api/notas-credito', notasCreditoRouter);
app.use('/api/notas-abono', notasAbonoRouter);
app.use('/api/notas-debito', notasDebitoRouter);
app.use('/api/corte-caja', corteCajaRouter);
app.use('/api/compras', comprasRouter);
app.use('/api/inventario/ent', entradasRouter);
app.use('/api/inventario/sal', salidasRouter);
app.use('/api/inventario', inventarioSaldoRouter);
app.use('/api/documentos', documentosRouter);
app.use('/api/productos', productosRouter);
app.use('/api/suscripciones', suscripcionesRouter);
app.use('/api/credenciales-fel', credencialesFelRouter);
app.use('/api/fel', felRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/tareas', tareasRouter);
app.use('/api/cuentas-cobrar', cuentasCobrarRouter);
app.use('/api/cuentas-pagar', cuentasPagarRouter);
app.use('/api/libro-ventas', libroVentasRouter);
app.use('/api/libro-compras', libroComprasRouter);
app.use('/api/libro-diario', libroDiarioRouter);
app.use('/api/libro-mayor', libroMayorRouter);
app.use('/api/libro-balance', libroBalanceRouter);
app.use('/api/nomenclatura-contable', nomenclaturaContableRouter);
app.use('/api/formatos-contables', formatosContablesRouter);
app.use('/api/retenciones-iva', retencionesIvaRouter);
app.use('/api/retenciones-isr', retencionesIsrRouter);
app.use('/api/config-contabilidad', configContabilidadRouter);
app.use('/api/nomina', nominaRouter);
app.use('/api/bancos', bancosRouter);
app.use('/api/cuentas-bancarias', cuentasBancariasRouter);
app.use('/api/updater', updaterRouter);

app.get('/api/health', async (_req, res) => {
  let dbStatus = 'not_configured';
  if (isDbConfigured()) {
    try {
      const pool = await getDbPool();
      await pool.request().query('SELECT 1 AS ok');
      dbStatus = 'connected';
    } catch (err) {
      dbStatus = 'error';
      console.warn('[MSSQL]', err.message);
    }
  }
  res.json({ ok: true, db: dbStatus });
});

registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`OnneB_pos en http://localhost:${PORT}`);
  if (process.env.BUMP_WATCH !== 'false') {
    require('./scripts/watch-build').start();
    watchBuildMetaBroadcast();
  }
});

process.on('SIGINT', async () => {
  if (dbPool) {
    await dbPool.close();
  }
  process.exit(0);
});
