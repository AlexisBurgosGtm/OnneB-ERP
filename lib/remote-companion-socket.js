const store = require('./remote-companion-store');
const { companionSessionSummary } = require('./companion-auth');

function registerRemoteCompanionHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('companion:host-bind', (payload = {}) => {
      const token = String(payload.token || '').trim();
      const pairingId = String(payload.pairingId || '').trim();
      const pairing = store.getByToken(token);
      if (!pairing || pairing.pairingId !== pairingId) {
        socket.emit('companion:error', { message: 'Emparejamiento inválido o expirado' });
        return;
      }
      store.setHostSocket(pairingId, socket.id);
      socket.data.companionRole = 'host';
      socket.data.companionPairingId = pairingId;
      socket.data.companionToken = token;
      socket.join(store.roomName(pairingId));
      socket.emit('companion:host-bound', { pairingId });
      if (pairing.session) {
        socket.emit('companion:qr-session-linked', {});
      }
      if (pairing.controllerSocketId) {
        socket.emit('companion:controller-present', {});
      }
    });

    socket.on('companion:controller-bind', (payload = {}) => {
      const token = String(payload.token || '').trim();
      const pairing = store.getByToken(token);
      if (!pairing) {
        socket.emit('companion:error', { message: 'Código inválido o expirado' });
        return;
      }
      store.setControllerSocket(pairing.pairingId, socket.id);
      socket.data.companionRole = 'controller';
      socket.data.companionPairingId = pairing.pairingId;
      socket.data.companionToken = token;
      socket.join(store.roomName(pairing.pairingId));
      socket.emit('companion:controller-bound', {
        pairingId: pairing.pairingId,
        hostConnected: Boolean(pairing.hostSocketId),
        session: companionSessionSummary(pairing.session),
        favorites: pairing.favorites || [],
      });
      io.to(store.roomName(pairing.pairingId)).emit('companion:controller-joined', {});
    });

    socket.on('companion:favorites-push', (payload = {}) => {
      if (socket.data.companionRole !== 'host') return;
      const pairingId = socket.data.companionPairingId;
      if (!pairingId) return;
      const items = Array.isArray(payload.items) ? payload.items : [];
      store.setFavorites(pairingId, items);
      io.to(store.roomName(pairingId)).emit('companion:favorites', { items });
    });

    socket.on('companion:navigate', (payload = {}) => {
      if (socket.data.companionRole !== 'controller') return;
      const pairingId = socket.data.companionPairingId;
      const menu = String(payload.menu || '').trim();
      if (!pairingId || !menu) return;
      io.to(store.roomName(pairingId)).emit('companion:navigate', { menu });
    });

    function forwardPointerToHost(socket, event, payload) {
      if (socket.data.companionRole !== 'controller') return;
      const pairing = store.getById(socket.data.companionPairingId);
      if (!pairing?.hostSocketId || !pairing.session) return;
      io.to(pairing.hostSocketId).emit(event, payload);
    }

    socket.on('companion:pointer-mode', (payload) => {
      forwardPointerToHost(socket, 'companion:pointer-mode', payload);
    });

    socket.on('companion:pointer-move', (payload) => {
      forwardPointerToHost(socket, 'companion:pointer-move', payload);
    });

    socket.on('companion:pointer-click', (payload) => {
      forwardPointerToHost(socket, 'companion:pointer-click', payload || {});
    });

    socket.on('disconnect', () => {
      store.clearSocket(socket.id);
    });
  });
}

function emitHostApplySession(io, pairingId, sessionPayload) {
  if (!io || !pairingId) return;
  io.to(store.roomName(pairingId)).emit('companion:host-apply-session', sessionPayload);
}

function emitSessionActive(io, pairingId, summary) {
  if (!io || !pairingId) return;
  io.to(store.roomName(pairingId)).emit('companion:session-active', summary);
  io.to(store.roomName(pairingId)).emit('companion:qr-session-linked', {});
}

module.exports = {
  registerRemoteCompanionHandlers,
  emitHostApplySession,
  emitSessionActive,
};
