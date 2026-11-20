// Player-name rules: length, characters, word filter (incl. leetspeak, spacing, Singlish), reserved names,
// no false positives on normal words, and every random name the game makes must pass. Usage: node tests/name-tests.js
require('../public/engine.js'); const G = globalThis.G;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const why = n => { const r = G.checkName(n); return r.ok ? 'ok' : r.reason; };

// every random name (all word pairs, lowest and highest number) passes
let gen = 0;
for (const a of G.NAME_A) for (const b of G.NAME_B) for (const d of [100, 999]) { const n = a + ' ' + b + ' ' + d; gen++; if (!G.checkName(n).ok) ok(false, 'random name must pass: ' + n + ' (' + why(n) + ')'); }
ok(gen > 0, 'checked ' + gen + ' random names');
{ const rng = G.mulberry32(7); let bad = 0; for (let i = 0; i < 5000; i++) if (!G.checkName(G.makeName(rng)).ok) bad++; ok(bad === 0, '5000 makeName() results pass'); }

const expect = {
  ok: ['Kopi Kid 123', 'Bubble Tea Ninja', 'Passion Fruit', 'Classic Ace', 'Bamboo Bear', 'Grape Kaya', 'Peacock Hero', 'Bob 455', 'Shiitake Kid', 'Scrap Hunter', 'Assassin Cat', 'Hello Kitty 2026', 'Hellooo', 'Therapist', 'Butterfly', 'Cocktail', 'Dickson Tan', 'Essex Fan', 'Kim Akira', 'So Haikal', 'Bobby Tan', 'Ali', 'ABCDEFGHIJKLMNOPQRST', 'Night Owl 7', 'Sunny Side Up'],
  blocked: ['f u c k', 'FuUuCk', 'f4ck boy', 'Fuk U', 'Sh1t Lord', 'knn bird', 'CHIBAI', 'lan jiao', 'lanjiao', 'Lan Jiao Man', 'Chee Bye', 'Ka Nina', 'a55 man', 'Cb Lim', 'Nb Tan', 'Bitchy', 'kys now', 'Kanina', 'Sohai', 'Big Dick', 'Nazi Boy', 'Pukimak', 'B1tch Queen', 'Fuuuuuck', 'Cheebye Lah', 'Diu Lei', 'Dumb Cunt'],
  reserved: ['Admin Bob', 'MamaShop Staff', 'Skippy King', 'Officials', 'Mod Squad', 'Practice Bot', 'SKIPPIES', 'Admin123', 'NEA Officer', 'The Police'],
  length: ['ab', 'Bo', 'A very long name that is too long', 'x'.repeat(21), '  a  '],
  chars: ['x#y', 'Kopi_Kid', 'Kopi.Kid', 'Ali\u00e9', 'Name<script>', 'hi@there', 'Kopi\u{1F964}'],
  digits: ['12345 abc', 'S1234567A', 'Tan 91234567', 'Kid 2026 2027'],
  letters: ['91234567', '1234', 'A 123'],
  empty: ['', '   ', null, undefined]
};
for (const [want, list] of Object.entries(expect)) for (const n of list) ok(why(n) === want, JSON.stringify(n) + ' -> ' + want + ' (got ' + why(n) + ')');

// tidy-up and messages
ok(G.checkName('   spaced    out   ').name === 'spaced out', 'spaces trimmed and collapsed');
ok(G.cleanName('Kopi\u00a0Kid') === 'Kopi Kid', 'non-breaking space normalised');
ok(G.nameKey(' KOPI  kid ') === G.nameKey('kopi kid'), 'uniqueness ignores case and spacing');
ok(Object.values(expect).flat().every(n => { const r = G.checkName(n); return r.ok || (typeof r.message === 'string' && r.message.length > 10); }), 'every rejection has a friendly message');
ok(G.NAME_MIN === 3 && G.NAME_MAX === 20 && G.C.NAME_COOLDOWN_DAYS === 7, 'limits: 3-20 characters, 1 change per 7 days');
ok(G.checkName('x'.repeat(20) .replace(/^x{2}/, 'ab')).ok, '20 characters allowed');
// bots can never clash with a player name (they contain brackets, which players can't type)
ok(!G.checkName(G.makeBot(0, Date.now()).name).ok, 'practice bot names are not typeable by players');

console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
