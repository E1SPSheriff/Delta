// End-to-end test of the REAL server process over HTTP (unix socket, so it runs in sandboxes without TCP ports).
// Starts `node server/server.js`, plays a full loop through HTTP, restarts the server and checks data persisted.
const { spawn } = require('child_process'), http = require('http'), zlib = require('zlib'), fs = require('fs'), path = require('path'), os = require('os');
require('../public/engine.js');
const ROOT = path.join(__dirname, '..');
const USE_SOCKET = process.platform !== 'win32';
const SOCK = path.join(os.tmpdir(), 'skippies-e2e-' + process.pid + '.sock');
const PORT = 30000 + (process.pid % 20000);
const DB = path.join(os.tmpdir(), 'skippies-e2e-' + process.pid + '.db');
let fails = 0, passes = 0; const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL:', m); } };

function start() {
  if (USE_SOCKET) try { fs.unlinkSync(SOCK); } catch (e) { }
  const listenEnv = USE_SOCKET ? { SOCKET: SOCK } : { PORT: String(PORT) };
  const p = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: ROOT, env: Object.assign({}, process.env, listenEnv, { DB_FILE: DB, FETCH_DATA: '0', VAPID_SUBJECT: 'mailto:test@example.com' }) });
  let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  return new Promise((res, rej) => { const t0 = Date.now(); (function wait() { if (/listening/.test(out)) return res({ p, log: () => out }); if (Date.now() - t0 > 8000) return rej(new Error('server did not start: ' + out)); setTimeout(wait, 50); })(); });
}
function req(method, p, body, headers) {
  return new Promise((res, rej) => {
    const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request(Object.assign(USE_SOCKET ? { socketPath: SOCK } : { host: '127.0.0.1', port: PORT }, { method, path: p, headers: Object.assign({ Host: 'localhost' }, data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}, headers || {}) }), rs => {
      const chunks = []; rs.on('data', c => chunks.push(c)); rs.on('end', () => {
        let buf = Buffer.concat(chunks); if (rs.headers['content-encoding'] === 'gzip') buf = zlib.gunzipSync(buf);
        let json = null; try { json = JSON.parse(buf.toString()); } catch (e) { }
        res({ status: rs.statusCode, headers: rs.headers, text: buf.toString(), json, raw: Buffer.concat(chunks) });
      });
    });
    r.on('error', rej); if (data) r.write(data); r.end();
  });
}
const auth = t => ({ Authorization: 'Bearer ' + t });
function grid(n) { const r = G.mulberry32(500 + n); return Array.from({ length: 72 }, () => Math.floor(r() * 255)); }

(async () => {
  let srv = await start();
  // ---- static + headers ----
  let r = await req('GET', '/', undefined, { 'Accept-Encoding': 'gzip' });
  ok(r.status === 200 && r.headers['content-encoding'] === 'gzip' && r.text.includes('<script src="icons.js">'), 'index served gzipped');
  ok(r.raw.length < Buffer.byteLength(r.text) / 2, 'gzip roughly halves the page or better (' + r.raw.length + ' vs ' + Buffer.byteLength(r.text) + ')');
  ok(/default-src 'self'/.test(r.headers['content-security-policy'] || '') && r.headers['x-content-type-options'] === 'nosniff' && r.headers['x-frame-options'] === 'DENY', 'security headers');
  ok(r.headers['cache-control'] === 'no-cache', 'html not long-cached');
  ok(/img-src[^;]*https:\/\/www\.onemap\.gov\.sg/.test(r.headers['content-security-policy']), 'CSP allows OneMap map images and logo');
  ok(r.headers['referrer-policy'] === 'strict-origin-when-cross-origin', 'referrer policy sends only the site origin to map servers');
  const etag = r.headers.etag; r = await req('GET', '/', undefined, { 'If-None-Match': etag });
  ok(r.status === 304, 'ETag gives 304');
  r = await req('GET', '/styles.css', undefined, { 'Accept-Encoding': 'gzip' }); ok(r.status === 200 && /text\/css/.test(r.headers['content-type']) && r.text.includes('--brand'), 'css served');
  for (const f of ['engine.js', 'api.js', 'art.js', 'icons.js', 'app-core.js', 'app-home.js', 'app-dex.js', 'app-battle.js', 'app-map.js', 'app-social.js', 'sw.js', 'manifest.webmanifest', 'icons/icon-192.png', 'data/recycling-points.json']) {
    r = await req('GET', '/' + f); ok(r.status === 200, 'served ' + f);
  }
  r = await req('GET', '/config.js'); ok(r.status === 200 && r.text.includes('SKIPPIES_SERVER = location.origin'), 'config.js points the app at this server');
  r = await req('GET', '/../server/server.js'); ok(r.status === 403 || r.status === 404, 'path traversal blocked (' + r.status + ')');
  r = await req('GET', '/%2e%2e/server/server.js'); ok(r.status === 403 || r.status === 404, 'encoded traversal blocked (' + r.status + ')');
  r = await req('GET', '/nope.js'); ok(r.status === 404, '404 for missing file');
  r = await req('GET', '/api/health'); ok(r.status === 200 && r.json.ok === true, 'health');
  r = await req('GET', '/api/push/key'); ok(r.status === 200 && /^[A-Za-z0-9_-]{80,}$/.test(r.json.publicKey || ''), 'VAPID public key generated');
  const vapidKey = r.json.publicKey;

  // ---- game loop over HTTP ----
  r = await req('POST', '/api/register', { age13: false }); ok(r.status === 403, 'under-13 refused online');
  r = await req('POST', '/api/register', { age13: true }); ok(r.status === 200 && r.json.token, 'register');
  const tok = r.json.token;
  r = await req('GET', '/api/state'); ok(r.status === 401, 'no token = 401');
  r = await req('POST', '/api/action', { item: 'cup', hash: G.dhash(grid(1)), detected: ['cup'] }, auth(tok));
  ok(r.status === 200 && r.json.result.hatched.length >= 1, 'hatch over HTTP: ' + (r.json && r.json.result && r.json.result.hatched[0].id));
  ok(r.json.state.lastCatch && r.json.state.lastCatch.id === r.json.result.hatched[0].id, 'latest catch recorded');
  r = await req('POST', '/api/action', { item: 'cup', hash: G.dhash(grid(1)), detected: ['cup'] }, auth(tok));
  ok(r.status === 400 && r.json.error === 'cooldown', 'cooldown over HTTP');
  // campaign tutorial: start, play with the same engine + seed, finish, server verifies
  r = await req('POST', '/api/campaign/start', { area: 0, fight: 0 }, auth(tok)); ok(r.status === 200 && r.json.ticket, 'campaign start');
  const bt = G.clone(r.json.battle), rng = G.mulberry32(bt.seed), acts = [];
  while (!bt.over && acts.length < 200) { const a = { kind: 'move', move: 'type' }; G.act(bt, a, rng); acts.push(a); }
  r = await req('POST', '/api/campaign/finish', { ticket: r.json.ticket, actions: acts }, auth(tok));
  ok(r.status === 200 && r.json.result.result === bt.result, 'server replay matches client result (' + bt.result + ')');
  r = await req('POST', '/api/campaign/finish', { ticket: 'x', actions: acts }, auth(tok)); ok(r.status === 400, 'bad ticket rejected');
  r = await req('GET', '/api/arena/opponents', undefined, auth(tok)); ok(r.status === 200 && r.json.list.length >= 2 && r.json.list.every(o => o.bot), 'practice bots offered');
  r = await req('GET', '/api/leaderboard?board=eco&scope=global', undefined, auth(tok)); ok(r.status === 200 && r.json.total === 1 && r.json.me.score === 1, 'leaderboard over HTTP');
  r = await req('POST', '/api/push', { subscription: { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'x', auth: 'y' } } }, auth(tok)); ok(r.status === 200 && r.json.push === true, 'push subscription saved');
  r = await req('POST', '/api/register', 'x'.repeat(20000)).catch(e => ({ status: 'reset' }));
  ok(r.status === 'reset' || r.status >= 400, 'oversized body refused');
  r = await req('GET', '/api/health'); ok(r.status === 200, 'server still healthy after oversized body');
  r = await req('POST', '/api/register', '{bad json'); ok(r.status === 400, 'bad JSON = 400');

  // ---- restart: data persists in SQLite ----
  srv.p.kill('SIGTERM'); await new Promise(res => srv.p.on('exit', res));
  srv = await start();
  r = await req('GET', '/api/state', undefined, auth(tok)); ok(r.status === 200 && Object.keys(r.json.state.dex).length >= 1 && r.json.state.tutorialDone === true, 'progress survived a restart');
  r = await req('GET', '/api/push/key'); ok(r.json.publicKey === vapidKey, 'VAPID key stable across restarts');
  // ---- delete ----
  r = await req('DELETE', '/api/me', undefined, auth(tok)); ok(r.status === 200, 'delete account');
  r = await req('GET', '/api/state', undefined, auth(tok)); ok(r.status === 401, 'token dead after delete');
  // ---- rate limit (last, it blocks this client for a minute) ----
  let got429 = false; for (let i = 0; i < 130 && !got429; i++) { r = await req('GET', '/api/health'); if (r.status === 429) got429 = true; }
  ok(got429, 'rate limit kicks in');
  r = await req('GET', '/'); ok(r.status === 200, 'static files not rate limited');

  srv.p.kill('SIGTERM'); await new Promise(res => srv.p.on('exit', res));
  for (const f of [SOCK, DB, DB + '-wal', DB + '-shm']) try { fs.unlinkSync(f); } catch (e) { }
  console.log(`http-e2e: ${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(2); });
