/**
 * IndexedDB con JsStore — OnneB POS
 */
const OnnebDb = (function () {
  const DB_NAME = 'OnneB_pos_db';
  const TABLE_SETTINGS = 'settings';

  const schema = {
    name: DB_NAME,
    tables: [
      {
        name: TABLE_SETTINGS,
        columns: {
          id: { primaryKey: true, autoIncrement: true },
          key: { notNull: true, unique: true },
          value: { notNull: false },
          updatedAt: { notNull: false },
        },
      },
    ],
  };

  let connection = null;

  async function init() {
    if (typeof JsStore === 'undefined') {
      console.warn('[DB] JsStore no cargado');
      return null;
    }
    connection = new JsStore.Connection(new Worker('/vendor/jsstore/jsstore.worker.min.js'));
    const isCreated = await connection.initDb(schema);
    if (isCreated) {
      console.log('[DB] Base IndexedDB creada:', DB_NAME);
    }
    return connection;
  }

  async function getSetting(key) {
    if (!connection) await init();
    const rows = await connection.select({
      from: TABLE_SETTINGS,
      where: { key },
    });
    return rows[0] || null;
  }

  async function setSetting(key, value) {
    if (!connection) await init();
    const existing = await getSetting(key);
    const row = {
      key,
      value: JSON.stringify(value),
      updatedAt: new Date().toISOString(),
    };
    if (existing) {
      await connection.update({
        in: TABLE_SETTINGS,
        set: row,
        where: { key },
      });
    } else {
      await connection.insert({ into: TABLE_SETTINGS, values: [row] });
    }
    return row;
  }

  return { init, getSetting, setSetting, TABLE_SETTINGS };
})();
