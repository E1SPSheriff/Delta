// SKIPPIES v2 server: static files + JSON API + reminder scheduler. Zero npm dependencies (Node >= 22.5).
// Env: PORT (default 8080), DB_FILE (default ./skippies.db), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//      VAPID_SUBJECT (e.g. mailto:team@example.com), ALLOW_ORIGIN (optional, for a separate frontend host)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const recyclingData = require('./tools/fetch-recycling-data.js');
require('../public/engine.js');
const { createApi } = require('../public/api.js');
const { createSqliteStore } = require('./store-sqlite.js');
const webpush = require('./webpush.js');

const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-eval'; connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com https://tfhub.dev https://www.kaggle.com; img-src 'self' data: blob: https://www.onemap.gov.sg; style-src 'self' 'unsafe-inline'; media-src 'self' blob: mediastream:; worker-src 'self' blob:; frame-ancestors 'none'"
};

function makeHandler({ api, vapid, allowOrigin, rateLimit }) {
  const hits = new Map(); const limit = rateLimit || 120;
  function limited(ip) {
    const t = Math.floor(Date.now() / 60000), k = ip + ':' + t, n = (hits.get(k) || 0) + 1; hits.set(k, n);
    if (hits.size > 5000) for (const key of hits.keys()) if (!key.endsWith(':' + t)) hits.delete(key);
    return n > limit;
  }
  function send(res, status, body, headers) {
    const isBuf = Buffer.isBuffer(body), data = isBuf ? body : JSON.stringify(body);
    res.writeHead(status, Object.assign({}, SECURITY, isBuf ? {} : { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}));
    res.end(data);
  }
  return function (req, res) {
    const url = req.url || '/', p = url.split('?')[0];
    const cors = allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', Vary: 'Origin' } : {};
    if (req.method === 'OPTIONS') return send(res, 204, Buffer.alloc(0), cors);
    if (p.startsWith('/api/')) {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'x';
      if (limited(ip)) return send(res, 429, { error: 'rate', message: 'Too many requests. Try again in a minute.' }, cors);
      if (p === '/api/push/key' && req.method === 'GET') return send(res, 200, { publicKey: vapid ? vapid.publicKey : null }, cors);
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > 16384) { req.destroy(); } else chunks.push(c); });
      req.on('end', async () => {
        if (size > 16384) return;
        const r = await api.handle({ method: req.method, path: url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
        send(res, r.status, r.body, cors);
      });
      req.on('error', () => { });
      return;
    }
    if (p === '/config.js') return send(res, 200, Buffer.from('window.SKIPPIES_SERVER = location.origin;\n'), { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    // static files (no directory traversal)
    let rel = decodeURIComponent(p); if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: 'forbidden' });
    fs.stat(file, (se, st) => {
      if (se || !st.isFile()) return send(res, 404, Buffer.from('Not found'), { 'Content-Type': 'text/plain' });
      const ext = path.extname(file), type = TYPES[ext] || 'application/octet-stream';
      const fresh = ext === '.html' || file.endsWith('sw.js') || file.includes(path.sep + 'data' + path.sep);
      const etag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
      const base = { 'Content-Type': type, 'Cache-Control': fresh ? 'no-cache' : 'public, max-age=3600', ETag: etag, Vary: 'Accept-Encoding' };
      if (req.headers['if-none-match'] === etag) return send(res, 304, Buffer.alloc(0), base);
      const gzipOk = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && /text|json|javascript|svg|manifest/.test(type);
      const key = file + etag + (gzipOk ? ':gz' : '');
      const hit = cache.get(key);
      if (hit) return send(res, 200, req.method === 'HEAD' ? Buffer.alloc(0) : hit, Object.assign({}, base, gzipOk ? { 'Content-Encoding': 'gzip' } : {}));
      fs.readFile(file, (e, data) => {
        if (e) return send(res, 404, Buffer.from('Not found'), { 'Content-Type': 'text/plain' });
        const body = gzipOk ? zlib.gzipSync(data, { level: 9 }) : data;
        if (cache.size > 200) cache.clear(); cache.set(key, body);
        send(res, 200, req.method === 'HEAD' ? Buffer.alloc(0) : body, Object.assign({}, base, gzipOk ? { 'Content-Encoding': 'gzip' } : {}));
      });
    });
  };
}
const cache = new Map();

async function loadVapid(store) {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  let v = await store.get('meta', 'vapid'); if (!v) { v = webpush.generateVapidKeys(); await store.put('meta', 'vapid', v); }
  return v;
}

async function main() {
  const store = createSqliteStore(process.env.DB_FILE || path.join(__dirname, '..', 'skippies.db'));
  const api = createApi(store, {
    mode: 'server', randomHex: n => crypto.randomBytes(n).toString('hex'),
    sha256: async s => crypto.createHash('sha256').update(s).digest('hex'), rng: () => crypto.randomInt(0, 2 ** 32) / 2 ** 32,
    onError: e => console.error('[api]', e)
  });
  const vapid = await loadVapid(store), subject = process.env.VAPID_SUBJECT || 'mailto:skippies@example.com';
  if (!process.env.VAPID_SUBJECT) console.warn('[push] Set VAPID_SUBJECT=mailto:your-team@email so push services (especially Apple) accept reminders.');
  const server = http.createServer(makeHandler({ api, vapid, allowOrigin: process.env.ALLOW_ORIGIN }));
  const where = process.env.SOCKET || (+process.env.PORT || 8080);
  server.listen(where, () => console.log(`SKIPPIES v${G.VERSION} listening on ${typeof where === 'string' ? where : 'http://localhost:' + where}`));
  // Recycling map data: download automatically if missing or older than 30 days (needs internet on the server).
  const refreshData = () => { if (process.env.FETCH_DATA === '0' || !recyclingData.needsRefresh(recyclingData.readCurrent(), 30)) return; recyclingData.update({ log: m => console.log('[data]', m) }).then(o => console.log('[data] recycling points ready:', o.points.length)).catch(e => console.error('[data]', e.message, '- the Radar will show official links until this works.')); };
  refreshData(); setInterval(refreshData, 24 * 3600000);
  setInterval(async () => {
    try {
      for (const r of await api.dueReminders()) {
        try { const s = await webpush.send(r.push, r.payload, vapid, subject); if (s.gone) await api.dropPush(r.playerId); }
        catch (e) { console.error('[push]', e.message); }
      }
      await api.cleanup();
    } catch (e) { console.error('[scheduler]', e); }
  }, 60000);
}
if (require.main === module) main();
module.exports = { makeHandler, loadVapid };
