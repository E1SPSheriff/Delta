// SQLite document store using Node's built-in node:sqlite (Node 22.5+). No npm dependencies.
const { DatabaseSync } = require('node:sqlite');
const COLLECTIONS = ['players', 'tokens', 'hashes', 'tickets', 'claims', 'meta'];

function createSqliteStore(file) {
  const db = new DatabaseSync(file || ':memory:');
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  for (const c of COLLECTIONS) db.exec(`CREATE TABLE IF NOT EXISTS ${c} (id TEXT PRIMARY KEY, doc TEXT NOT NULL)`);
  const check = c => { if (!COLLECTIONS.includes(c)) throw new Error('unknown collection ' + c); return c; };
  const st = {};
  for (const c of COLLECTIONS) {
    st[c] = {
      get: db.prepare(`SELECT doc FROM ${c} WHERE id = ?`),
      put: db.prepare(`INSERT INTO ${c} (id, doc) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET doc = excluded.doc`),
      del: db.prepare(`DELETE FROM ${c} WHERE id = ?`),
      all: db.prepare(`SELECT id, doc FROM ${c}`)
    };
  }
  return {
    async get(c, id) { const r = st[check(c)].get.get(String(id)); return r ? JSON.parse(r.doc) : null; },
    async put(c, id, v) { st[check(c)].put.run(String(id), JSON.stringify(v)); },
    async del(c, id) { st[check(c)].del.run(String(id)); },
    async take(c, id, fn) {
      const name = check(c), key = String(id), row = st[name].get.get(key);
      const next = await fn(row ? JSON.parse(row.doc) : null);
      if (next === null || next === undefined) st[name].del.run(key);
      else st[name].put.run(key, JSON.stringify(next));
      return next;
    },
    async list(c) { return st[check(c)].all.all().map(r => JSON.parse(r.doc)); },
    async entries(c) { return st[check(c)].all.all().map(r => [r.id, JSON.parse(r.doc)]); },
    close() { db.close(); }
  };
}
module.exports = { createSqliteStore };
