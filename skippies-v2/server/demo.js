const crypto = require('crypto');
require('../public/engine.js');
const DevMode = require('../public/dev-mode.js');
const { createApi, createMemoryStore } = require('../public/api.js');

function isEnabled() { return true; }

function createDemoRuntime() {
  const store = createMemoryStore();
  const randomHex = n => crypto.randomBytes(n).toString('hex');
  const sha256 = async s => crypto.createHash('sha256').update(s).digest('hex');
  const rng = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;
  const api = createApi(store, { mode: 'demo', randomHex, sha256, rng, onError: e => console.error('[demo]', e) });
  const runtime = DevMode.createRuntime({ store, api, randomHex, sha256, rng, now: () => Date.now() });
  return { enabled: true, store, handle: runtime.handle };
}

module.exports = { isEnabled, createDemoRuntime };
