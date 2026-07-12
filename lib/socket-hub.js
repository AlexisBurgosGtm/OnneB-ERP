/** Tipos de empleado que reciben aviso de pedido de mostrador. */
const TIPO_CAJERO = 8;
const TIPO_BODEGA = 5;

function roomTipo(empnit, codtipo) {
  return `tipo:${String(empnit).trim()}:${Number(codtipo)}`;
}

function formatMoneyGtq(value) {
  const n = Number(value);
  const amount = Number.isFinite(n) ? n : 0;
  return amount.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
}

function buildPedidoMostradorMensaje(nombreCliente, monto) {
  const nombre = String(nombreCliente || 'Cliente').trim() || 'Cliente';
  return `Nuevo Pedido de ${nombre} de un monto de ${formatMoneyGtq(monto)}`;
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('[Socket.IO] Cliente conectado:', socket.id);
    socket.emit('welcome', { message: 'Conectado a OnneB POS', id: socket.id });

    socket.on('session:register', (payload = {}) => {
      const empnit = String(payload.empnit || payload.EMPNIT || '').trim();
      const codtipo = Number(payload.codtipoempleado ?? payload.codtipo);
      if (!empnit || !Number.isFinite(codtipo) || codtipo <= 0) return;

      if (socket.data.empnit && socket.data.codtipo) {
        socket.leave(roomTipo(socket.data.empnit, socket.data.codtipo));
      }

      socket.data.empnit = empnit;
      socket.data.codtipo = codtipo;
      socket.data.codempleado = payload.codempleado ?? null;
      socket.join(roomTipo(empnit, codtipo));
    });

    socket.on('ping', () => {
      socket.emit('pong', { ts: Date.now() });
    });

    socket.on('disconnect', () => {
      console.log('[Socket.IO] Cliente desconectado:', socket.id);
    });
  });
}

function emitNuevoPedidoMostrador(io, empnit, payload) {
  if (!io || !empnit) return;
  const data = {
    tipo: 'pedido-mostrador',
    empnit: String(empnit).trim(),
    ...payload,
  };
  io.to(roomTipo(empnit, TIPO_CAJERO)).emit('pedido:nuevo', data);
  io.to(roomTipo(empnit, TIPO_BODEGA)).emit('pedido:nuevo', data);
}

module.exports = {
  TIPO_CAJERO,
  TIPO_BODEGA,
  formatMoneyGtq,
  buildPedidoMostradorMensaje,
  registerSocketHandlers,
  emitNuevoPedidoMostrador,
};
