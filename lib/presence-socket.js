const { TIPO_ADMIN, roomEmpresa } = require('./socket-hub');

const SURVEY_WAIT_MS = 2800;
/** @type {Map<string, { requesterId: string, empnit: string, answers: object[], timer: NodeJS.Timeout }>} */
const pendingQueries = new Map();

function randomQueryId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isTruthySuper(value) {
  return value === true || String(value || '').trim() === '1';
}

function mayCollectPresence(socket, payload = {}) {
  if (isTruthySuper(payload.superUser) || isTruthySuper(socket.data.superUser)) return true;
  const codtipo = Number(payload.codtipoempleado ?? socket.data.codtipo);
  return Number.isFinite(codtipo) && codtipo === TIPO_ADMIN;
}

function mergeSessionIntoAnswer(socket, payload = {}) {
  const d = socket.data || {};
  return {
    socketId: socket.id,
    empnit: String(payload.empnit || d.empnit || '').trim(),
    empNombre: payload.empNombre ?? d.empNombre ?? '',
    codempleado: payload.codempleado ?? d.codempleado ?? null,
    codtipoempleado: payload.codtipoempleado ?? d.codtipo ?? null,
    usuario: payload.usuario ?? d.usuario ?? '',
    nomempleado: payload.nomempleado ?? d.nomempleado ?? '',
    email: payload.email ?? d.email ?? '',
    superUser: isTruthySuper(payload.superUser) || isTruthySuper(d.superUser),
    dbMode: payload.dbMode ?? d.dbMode ?? 'local',
    clientInstanceId: payload.clientInstanceId ?? d.clientInstanceId ?? '',
    menuKey: payload.menuKey ?? '',
    userAgent: payload.userAgent ?? '',
    platform: payload.platform ?? '',
    language: payload.language ?? '',
    screen: payload.screen ?? '',
    buildCount: payload.buildCount ?? null,
    buildDate: payload.buildDate ?? '',
    pageUrl: payload.pageUrl ?? '',
    clientReportedAt: payload.clientReportedAt ?? null,
    socketConnectedAt: d.socketConnectedAt ?? null,
    sessionRegisteredAt: d.sessionRegisteredAt ?? null,
    serverReceivedAt: Date.now(),
  };
}

function registerPresenceHandlers(io) {
  io.on('connection', (socket) => {
    socket.data.socketConnectedAt = Date.now();

    socket.on('presence:collect', (payload = {}) => {
      const empnit = String(payload.empnit || socket.data.empnit || '').trim();
      if (!empnit) {
        socket.emit('presence:error', { message: 'Empresa no indicada' });
        return;
      }
      if (!mayCollectPresence(socket, payload)) {
        socket.emit('presence:error', { message: 'No autorizado para consultar usuarios activos' });
        return;
      }

      const queryId = randomQueryId();
      const timer = setTimeout(() => {
        const pending = pendingQueries.get(queryId);
        if (!pending) return;
        pendingQueries.delete(queryId);
        io.to(pending.requesterId).emit('presence:results', {
          queryId,
          empnit: pending.empnit,
          collectedAt: Date.now(),
          waitMs: SURVEY_WAIT_MS,
          rows: pending.answers,
        });
      }, SURVEY_WAIT_MS);

      pendingQueries.set(queryId, {
        requesterId: socket.id,
        empnit,
        answers: [],
        timer,
      });

      io.to(roomEmpresa(empnit)).emit('presence:survey', {
        queryId,
        empnit,
        requestedAt: Date.now(),
      });
    });

    socket.on('presence:answer', (payload = {}) => {
      const queryId = String(payload.queryId || '').trim();
      if (!queryId) return;
      const pending = pendingQueries.get(queryId);
      if (!pending) return;

      const row = mergeSessionIntoAnswer(socket, payload);
      if (String(row.empnit).trim() !== pending.empnit) return;

      pending.answers.push(row);
    });

    socket.on('disconnect', () => {
      for (const [queryId, pending] of pendingQueries.entries()) {
        if (pending.requesterId === socket.id) {
          clearTimeout(pending.timer);
          pendingQueries.delete(queryId);
        }
      }
    });
  });
}

module.exports = {
  registerPresenceHandlers,
  mayCollectPresence,
};
