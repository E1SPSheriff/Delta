// Web Push (RFC 8291 message encryption + RFC 8292 VAPID) with Node's built-in crypto. No npm dependencies.
const crypto = require('crypto');
const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function generateVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}
function hkdf(salt, ikm, info, len) { return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len)); }

// RFC 8291 aes128gcm encryption. opts.salt / opts.senderPrivate allow deterministic test vectors.
function encrypt(plaintext, uaPublicB64, authSecretB64, opts) {
  opts = opts || {};
  const uaPublic = unb64u(uaPublicB64), authSecret = unb64u(authSecretB64);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('bad subscription keys');
  const ecdh = crypto.createECDH('prime256v1');
  if (opts.senderPrivate) ecdh.setPrivateKey(unb64u(opts.senderPrivate)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(), shared = ecdh.computeSecret(uaPublic);
  const salt = opts.salt ? unb64u(opts.salt) : crypto.randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const rs = 4096;
  const data = Buffer.concat([Buffer.from(plaintext), Buffer.from([2])]); // single record, padding delimiter 0x02
  if (data.length + 16 > rs) throw new Error('payload too large');
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(rs, 16); header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}
// Receiver side (used only in tests to prove round-trips).
function decrypt(payload, uaPrivateB64, uaPublicB64, authSecretB64) {
  const salt = payload.subarray(0, 16), idlen = payload[20], asPublic = payload.subarray(21, 21 + idlen), body = payload.subarray(21 + idlen);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(unb64u(uaPrivateB64));
  const uaPublic = unb64u(uaPublicB64), shared = ecdh.computeSecret(asPublic);
  const ikm = hkdf(unb64u(authSecretB64), shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(body.subarray(body.length - 16));
  const out = Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]);
  return out.subarray(0, out.lastIndexOf(2)).toString();
}
function vapidJwt(audience, subject, vapid, expSeconds) {
  const pub = unb64u(vapid.publicKey);
  const jwk = { kty: 'EC', crv: 'P-256', d: vapid.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) };
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: audience, exp: expSeconds || Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + claims), { key, dsaEncoding: 'ieee-p1363' });
  return head + '.' + claims + '.' + b64u(sig);
}
// Build the HTTP request for a push service (separate from sending so it can be tested offline).
function buildRequest(subscription, payloadObj, vapid, subject, ttl) {
  const url = new URL(subscription.endpoint);
  const body = encrypt(JSON.stringify(payloadObj), subscription.keys.p256dh, subscription.keys.auth);
  return {
    url: subscription.endpoint, method: 'POST', body,
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', 'Content-Length': String(body.length), TTL: String(ttl || 3600), Urgency: 'normal',
      Authorization: 'vapid t=' + vapidJwt(url.origin, subject, vapid) + ', k=' + vapid.publicKey }
  };
}
async function send(subscription, payloadObj, vapid, subject) {
  const r = buildRequest(subscription, payloadObj, vapid, subject);
  const res = await fetch(r.url, { method: r.method, headers: r.headers, body: r.body });
  return { status: res.status, gone: res.status === 404 || res.status === 410 };
}
module.exports = { generateVapidKeys, encrypt, decrypt, vapidJwt, buildRequest, send, b64u, unb64u };
