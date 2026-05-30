require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sql = require('mssql');
const { getDbConfig, isDbConfigured } = require('./config/database');

const PORT = process.env.PORT || 6500;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

let dbPool = null;

const empresasRouter = require('./routes/empresas');
const { router: configRouter } = require('./routes/config');

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

app.use(express.json());
app.locals.getDbPool = getDbPool;

const publicDir = path.join(__dirname, 'public');
const buildMetaPath = path.join(publicDir, 'build-meta.json');

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
app.use('/api/config', configRouter);

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

io.on('connection', (socket) => {
  console.log('[Socket.IO] Cliente conectado:', socket.id);
  socket.emit('welcome', { message: 'Conectado a OnneB POS', id: socket.id });

  socket.on('ping', () => {
    socket.emit('pong', { ts: Date.now() });
  });

  socket.on('disconnect', () => {
    console.log('[Socket.IO] Cliente desconectado:', socket.id);
  });
});

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
