const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithDbContext(ctx, fn) {
  return storage.run(
    {
      mode: String(ctx?.mode || 'local').toLowerCase() === 'remote' ? 'remote' : 'local',
      empnit: String(ctx?.empnit || '').trim(),
    },
    fn
  );
}

function getDbContext() {
  return storage.getStore() || { mode: 'local', empnit: '' };
}

function isRemoteDbContext(ctx = getDbContext()) {
  return ctx.mode === 'remote' && Boolean(ctx.empnit);
}

module.exports = {
  runWithDbContext,
  getDbContext,
  isRemoteDbContext,
};
