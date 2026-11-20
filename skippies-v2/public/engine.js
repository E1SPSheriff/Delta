/* SKIPPIES v2 game engine: pure, deterministic logic shared by the browser and the server. No DOM, no network. */
(function (root) {
  'use strict';
  const VERSION = '2.3.0', SAVE_V = 4, DAY = 86400000, HOUR = 3600000, MIN = 60000;
  const TZ = 8 * HOUR; // Singapore time (UTC+8, no DST) for day boundaries everywhere
  const C = {
    SEASON_DAYS: 14, STAR_DAYS: 5, MAX_ACTIONS_PER_DAY: 6, ACTION_COOLDOWN_MS: 60000,
    ENERGY_MAX: 10, DAILY_ENERGY: 2, ACTION_ENERGY: 3, RINSE_ENERGY: 1,
    TEAM_MAX: 3, UTIL_USES: 2, MAX_LEVEL: 30, MAX_STARS: 5,
    PITY_RARE: 10, BYO_SCRAP: 10, RECYCLE_SCRAP: 30, DAILY_SCRAP: 10, SCRAP_XP: 2, TRAIN_STEP: 10,
    MILEAGE_CAP: 25, ELO_K: 32, ARENA_START: 1000, HASH_DISTANCE: 6, HASH_WINDOW_DAYS: 30, OWN_HASH_DAYS: 90, NAME_COOLDOWN_DAYS: 7,
    WILD_PER_DAY: 10, WILD_SLOT_MS: 15 * 60000, WILD_CHANCE: 22, WILD_RANGE_M: 150, WILD_SCAN_M: 400, WILD_SCRAP: 8
  };

  // ---------- types & items ----------
  const TYPES = {
    drink: { name: 'Drink', e: '🥤', color: '#F6C945' }, water: { name: 'Water', e: '💧', color: '#9CCBE8' },
    food: { name: 'Food', e: '🍱', color: '#F4A259' }, carry: { name: 'Carry', e: '👜', color: '#A8D5A2' },
    cutlery: { name: 'Cutlery', e: '🥢', color: '#F3A6B8' }, recycle: { name: 'Recycle', e: '♻️', color: '#7FD1C1' },
    spark: { name: 'Spark', e: '✨', color: '#C9B6F2' }
  };
  const PVP_CYCLE = ['drink', 'water', 'food', 'carry', 'cutlery', 'recycle']; // each beats the next one
  const LITTER_CYCLE = ['drink', 'water', 'food', 'carry', 'cutlery'];
  const TYPE_MOVE = { drink: 'Refill Splash', water: 'Hydro Jet', food: 'Tapao Toss', carry: 'Tote Swing', cutlery: 'Chopstick Jab', recycle: 'Recycle Ray', spark: 'Kaki Spark' };
  const TYPE_POWER = [50, 62, 75], BUMP_POWER = 35, ENEMY_POWER = 44, BOSS_BIG_POWER = 64;
  const UTIL = { cheer: { name: 'Cheer', desc: 'Attack up' }, refill: { name: 'Refill', desc: 'Heal 35%' }, guard: { name: 'Guard', desc: 'Block most of the next hit' }, rinse: { name: 'Rinse', desc: 'Heal 50%' } };

  // What you photograph. detect = COCO-SSD classes the on-device scanner accepts for this item.
  const ITEMS = {
    cup: { kind: 'byo', label: 'Reusable cup', e: '🥤', type: 'drink', detect: ['cup', 'wine glass', 'bottle'], skip: 'a plastic cup' },
    bottle: { kind: 'byo', label: 'Water bottle', e: '💧', type: 'water', detect: ['bottle', 'cup'], skip: 'a plastic bottle' },
    box: { kind: 'byo', label: 'Food container', e: '🍱', type: 'food', detect: ['bowl', 'cup'], skip: 'a takeaway box' },
    bag: { kind: 'byo', label: 'Tote bag', e: '👜', type: 'carry', detect: ['handbag', 'backpack', 'suitcase'], skip: 'a plastic bag' },
    kit: { kind: 'byo', label: 'Own straw or cutlery', e: '🥢', type: 'cutlery', detect: ['fork', 'knife', 'spoon', 'cup', 'bottle'], skip: 'plastic straw or cutlery' },
    bev: { kind: 'recycle', label: 'Drink can or bottle', e: '🥫', type: 'recycle', detect: ['bottle', 'cup'], where: 'a Return Right machine (10¢ back) or a blue recycling bin' },
    paper: { kind: 'recycle', label: 'Paper, books, magazines', e: '📚', type: 'recycle', detect: ['book'], where: 'a blue recycling bin' },
    ewaste: { kind: 'recycle', label: 'E-waste (old phone, cable, gadget)', e: '🔌', type: 'recycle', detect: ['cell phone', 'laptop', 'keyboard', 'mouse', 'remote', 'tv'], where: 'an e-waste collection point' }
  };
  const BYO_ITEMS = ['cup', 'bottle', 'box', 'bag', 'kit'], RECYCLE_ITEMS = ['bev', 'paper', 'ewaste'];

  // ---------- rarity ----------
  const RARITY = {
    common: { name: 'Common', odds: 60, color: '#8A9A8F', rank: 0 },
    uncommon: { name: 'Uncommon', odds: 25, color: '#2F8F5B', rank: 1 },
    rare: { name: 'Rare', odds: 10, color: '#2E6FC2', rank: 2 },
    epic: { name: 'Epic', odds: 4, color: '#8A4FC9', rank: 3 },
    legendary: { name: 'Legendary', odds: 1, color: '#D4A017', rank: 4 }
  };
  const RARITY_KEYS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  // ---------- species (all original names & designs) ----------
  const b = (hp, atk, def, spd) => ({ hp, atk, def, spd });
  const SPECIES = [
    { id: 'sipsy', stages: ['Sipsy', 'Siplord', 'Sipreme'], type: 'drink', rarity: 'common', shape: 'cup', color: '#F6C945', base: b(46, 54, 40, 60), util: 'cheer', blurb: 'Lives in every reusable cup that skipped a plastic one.' },
    { id: 'drippet', stages: ['Drippet', 'Dripple', 'Torrentle'], type: 'water', rarity: 'common', shape: 'bottle', color: '#9CCBE8', base: b(60, 46, 50, 42), util: 'refill', blurb: 'Refills itself at every water cooler.' },
    { id: 'tapao', stages: ['Tapao Cub', 'Tapao Tiger', 'Tapao King'], type: 'food', rarity: 'common', shape: 'box', color: '#F4A259', base: b(56, 56, 48, 44), util: 'guard', blurb: 'Guards your container like it\u2019s treasure.' },
    { id: 'totelet', stages: ['Totelet', 'Totewing', 'Toteleon'], type: 'carry', rarity: 'common', shape: 'bag', color: '#A8D5A2', base: b(52, 46, 58, 46), util: 'guard', blurb: 'Folds itself up small. Always in your bag.' },
    { id: 'strawbit', stages: ['Strawbit', 'Strawbert', 'Sir Strawbert'], type: 'cutlery', rarity: 'common', shape: 'straw', color: '#F3A6B8', base: b(44, 56, 38, 66), util: 'cheer', blurb: 'Says no to plastic straws. Politely.' },
    { id: 'canny', stages: ['Canny', 'Canbot', 'Cantaur'], type: 'recycle', rarity: 'common', shape: 'can', color: '#B9C4CC', base: b(52, 50, 50, 50), util: 'guard', blurb: 'Born when a can goes back for its 10 cents.' },
    { id: 'kopicat', stages: ['Kopicat', 'Kopi Kaiser'], type: 'drink', rarity: 'uncommon', shape: 'cup', color: '#8B5E3C', acc: 'ears', base: b(50, 60, 42, 62), util: 'cheer', blurb: 'Morning kopi, own cup. Shiok.' },
    { id: 'flaskit', stages: ['Flaskit', 'Flaskadon'], type: 'water', rarity: 'uncommon', shape: 'bottle', color: '#5FA8D3', acc: 'cap', base: b(64, 48, 54, 44), util: 'refill', blurb: 'Keeps your water cold and your spirit cooler.' },
    { id: 'bentobot', stages: ['Bentobot', 'Bentitan'], type: 'food', rarity: 'uncommon', shape: 'box', color: '#E26D5C', acc: 'antenna', base: b(58, 60, 50, 44), util: 'guard', blurb: 'Computes the fastest tapao route.' },
    { id: 'bagabond', stages: ['Bagabond', 'Bagnificent'], type: 'carry', rarity: 'uncommon', shape: 'bag', color: '#5FA36A', acc: 'hat', base: b(56, 48, 62, 48), util: 'guard', blurb: 'Wanders from FairPrice to the wet market.' },
    { id: 'chopsticky', stages: ['Chopsticky', 'Chopsamurai'], type: 'cutlery', rarity: 'uncommon', shape: 'chop', color: '#D9A066', base: b(46, 62, 40, 68), util: 'cheer', blurb: 'Two sticks, one mission.' },
    { id: 'binbin', stages: ['Binbin', 'Binfinity'], type: 'recycle', rarity: 'uncommon', shape: 'bin', color: '#2F6FB3', base: b(60, 50, 56, 44), util: 'refill', blurb: 'Blue, round, and always hungry for recyclables.' },
    { id: 'bobalisk', stages: ['Bobalisk', 'Bobaragon'], type: 'drink', rarity: 'rare', shape: 'cup', color: '#C9A27E', acc: 'pearls', base: b(56, 64, 46, 60), util: 'cheer', blurb: 'Its pearls are chewy. Its glare is not.' },
    { id: 'refundo', stages: ['Refundo', 'Refundragon'], type: 'recycle', rarity: 'rare', shape: 'can', color: '#7FD1C1', acc: 'coin', base: b(58, 60, 52, 54), util: 'refill', blurb: 'Collects every 10-cent deposit it can find.' },
    { id: 'otterly', stages: ['Otterly'], type: 'water', rarity: 'epic', shape: 'otter', color: '#A0785A', base: b(66, 64, 56, 62), util: 'rinse', blurb: 'Swims the Kallang. Hates floating plastic.' },
    { id: 'durianosaur', stages: ['Durianosaur'], type: 'food', rarity: 'epic', shape: 'durian', color: '#C8D45A', base: b(72, 66, 60, 44), util: 'guard', blurb: 'Smells strong. Hits stronger.' },
    { id: 'semakoral', stages: ['Semakoral'], type: 'spark', rarity: 'legendary', shape: 'coral', color: '#F28C9B', base: b(72, 70, 62, 60), util: 'rinse', blurb: 'Guardian of the reef beside the landfill.' },
    { id: 'lumigrove', stages: ['Lumigrove'], type: 'spark', rarity: 'legendary', shape: 'tree', color: '#6B5BD2', base: b(70, 72, 60, 64), util: 'cheer', blurb: 'Glows at night. Powered by everything you didn\u2019t throw away.' },
    // recipe-only (deterministic bonuses for real habits, never random)
    { id: 'bubbles', stages: ['Bubbles', 'Bubblord'], type: 'water', rarity: 'uncommon', source: 'recipe', shape: 'blob', color: '#BFE3F5', acc: 'bubbles', base: b(58, 44, 52, 50), util: 'rinse', recipe: 'Rinse your real reusable after using it (once a day).', blurb: 'The cleaning step, done in 10 seconds.' },
    { id: 'weekend', stages: ['Weekend Wanderer', 'Weekend Warrior'], type: 'spark', rarity: 'uncommon', source: 'recipe', shape: 'blob', color: '#C9B6F2', acc: 'shades', base: b(52, 52, 46, 56), util: 'cheer', recipe: 'Do a BYO or recycle on a Saturday or Sunday.', blurb: 'BYO isn\u2019t just a school thing.' },
    { id: 'kaki', stages: ['Kaki Twins', 'Kaki Squad'], type: 'spark', rarity: 'rare', source: 'recipe', shape: 'twins', color: '#7FD1C1', base: b(56, 54, 50, 54), util: 'guard', recipe: 'BYO with a friend: both reusables in the photo (honour-based).', blurb: 'Two kakis, two cups, zero plastic.' },
    { id: 'mamabao', stages: ['Mama Bao', 'Grand Bao'], type: 'food', rarity: 'rare', source: 'recipe', shape: 'bao', color: '#FFF1DC', base: b(74, 46, 58, 36), util: 'refill', recipe: 'Get a family member to BYO (honour-based).', blurb: 'You taught them this time.' }
  ];
  const SP = Object.fromEntries(SPECIES.map(s => [s.id, s]));
  const EGG_POOL = RARITY_KEYS.map(r => SPECIES.filter(s => s.rarity === r && s.source !== 'recipe'));
  const STAR_COST = [0, 1, 2, 4, 8]; // copies needed to go from star s to s+1 (index = current stars)
  function evoStage(sp, stars) { const n = sp.stages.length; if (n === 3) return stars >= 5 ? 2 : stars >= 3 ? 1 : 0; if (n === 2) return stars >= 4 ? 1 : 0; return 0; }
  function nextEvoStars(sp, stars) { const n = sp.stages.length; if (n === 3) return stars < 3 ? 3 : stars < 5 ? 5 : null; if (n === 2) return stars < 4 ? 4 : null; return null; }

  // ---------- litterbugs & campaign ----------
  const LITTER = {
    cupkraken: { name: 'Cup Kraken', type: 'drink', shape: 'cup', base: b(40, 44, 38, 50), move: 'Sticky Spill' },
    bottlebrute: { name: 'Bottle Brute', type: 'water', shape: 'bottle', base: b(52, 46, 44, 34), move: 'Microplastic Mist' },
    styroslime: { name: 'Styro Slime', type: 'food', shape: 'box', base: b(48, 42, 40, 40), move: 'Squeaky Slam' },
    bagghost: { name: 'Bag Ghost', type: 'carry', shape: 'bag', base: b(42, 40, 44, 56), move: 'Tangle' },
    strawsnake: { name: 'Straw Snake', type: 'cutlery', shape: 'straw', base: b(38, 48, 36, 60), move: 'Poke' },
    kopikraken: { name: 'Kopi Kraken', type: 'drink', shape: 'cup', boss: true, base: b(44, 46, 40, 48), move: 'Sticky Spill', big: 'Sugar Rush' },
    boba: { name: 'Boba Behemoth', type: 'drink', shape: 'cup', boss: true, base: b(44, 45, 42, 46), move: 'Pearl Pelt', big: 'Boba Barrage' },
    styrotower: { name: 'Styro Tower', type: 'food', shape: 'box', boss: true, base: b(52, 50, 50, 38), move: 'Squeaky Slam', big: 'Stack Crash' },
    bagnado: { name: 'Bagnado', type: 'carry', shape: 'bag', boss: true, base: b(48, 52, 50, 54), move: 'Tangle', big: 'Plastic Twister' },
    landfilllord: { name: 'Landfill Lord', type: 'drink', shift: true, shape: 'blob', boss: true, base: b(58, 60, 54, 50), move: 'Junk Slam', big: 'Mountain of Waste' }
  };
  const AREAS = [
    { id: 'canteen', name: 'SP Canteen', e: '🍽️', need: 1, blurb: 'Cup Krakens are taking over the drinks stall.', fights: [[['cupkraken', 2]], [['strawsnake', 2]], [['cupkraken', 3], ['bottlebrute', 3]]], boss: [['kopikraken', 3]] },
    { id: 'bbt', name: 'Bubble Tea Street', e: '🧋', need: 2, blurb: 'Straws and cups everywhere after the queue.', fights: [[['cupkraken', 5]], [['strawsnake', 5], ['cupkraken', 5]], [['strawsnake', 6], ['bagghost', 6]]], boss: [['boba', 7]] },
    { id: 'hawker', name: 'Hawker Centre', e: '🍜', need: 4, blurb: 'The tapao rush left a mess.', fights: [[['styroslime', 9]], [['styroslime', 10], ['strawsnake', 10]], [['bagghost', 10], ['styroslime', 11]]], boss: [['styrotower', 13]] },
    { id: 'fairprice', name: 'Supermarket Run', e: '🛒', need: 6, blurb: 'Bags, bottles and more bags.', fights: [[['bagghost', 12]], [['bottlebrute', 13], ['bagghost', 13]], [['bottlebrute', 14], ['cupkraken', 14]]], boss: [['bagnado', 16]] },
    { id: 'semakau', name: 'Semakau Landfill', e: '🏝️', need: 8, blurb: 'Where Singapore\u2019s waste ends up. The Landfill Lord waits.', fights: [[['styroslime', 16], ['bagghost', 16]], [['bottlebrute', 17], ['strawsnake', 17]], [['cupkraken', 18], ['styroslime', 18], ['bagghost', 18]]], boss: [['landfilllord', 21]] }
  ];

  // ---------- helpers ----------
  const clamp = (v, a, c) => Math.max(a, Math.min(c, v));
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const adnOf = ms => Math.floor((ms + TZ) / DAY);               // Singapore calendar day number
  const sgHour = ms => Math.floor(((ms + TZ) % DAY) / HOUR);
  const sgDow = ms => (adnOf(ms) + 4) % 7;                        // 0 = Sunday (1 Jan 1970 was a Thursday)
  const weekStart = adn => adn - ((adn + 3) % 7);                 // Monday of that week
  function ymdOf(ms) { const d = new Date(ms + TZ); const z = n => String(n).padStart(2, '0'); return d.getUTCFullYear() + '-' + z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate()); }
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- perceptual hash (dHash, 64-bit) ----------
  // gray: array of 72 luminance values (9 wide x 8 tall, row-major). Returns 16-char hex.
  function dhash(gray) {
    if (!gray || gray.length !== 72) throw new Error('dhash needs 9x8 grayscale');
    let hex = '';
    for (let y = 0; y < 8; y++) {
      let byte = 0;
      for (let x = 0; x < 8; x++) byte = (byte << 1) | (gray[y * 9 + x] < gray[y * 9 + x + 1] ? 1 : 0);
      hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
  }
  function hamming(a, c) {
    if (typeof a !== 'string' || typeof c !== 'string' || a.length !== 16 || c.length !== 16) return 64;
    let d = 0; for (let i = 0; i < 16; i++) { let x = parseInt(a[i], 16) ^ parseInt(c[i], 16); while (x) { d += x & 1; x >>= 1; } } return d;
  }
  const validHash = h => typeof h === 'string' && /^[0-9a-f]{16}$/.test(h);
  // a nearly flat image (lens covered, black frame) gives a hash with almost no information
  function lowDetail(gray) { let mn = 255, mx = 0; for (const v of gray) { if (v < mn) mn = v; if (v > mx) mx = v; } return mx - mn < 12; }

  // ---------- geohash (approximate area only) ----------
  const GH = '0123456789bcdefghjkmnpqrstuvwxyz';
  function geohash(lat, lng, precision) {
    let latR = [-90, 90], lngR = [-180, 180], h = '', bit = 0, ch = 0, even = true;
    while (h.length < precision) {
      const r = even ? lngR : latR, v = even ? lng : lat, mid = (r[0] + r[1]) / 2;
      if (v >= mid) { ch = (ch << 1) | 1; r[0] = mid; } else { ch = ch << 1; r[1] = mid; }
      even = !even; if (++bit === 5) { h += GH[ch]; bit = 0; ch = 0; }
    }
    return h;
  }
  const validZone = z => typeof z === 'string' && /^w2[0-9bcdefghjkmnpqrstuvwxyz]{3}$/.test(z); // 5-char cells covering Singapore start with w2
  // the zone itself + its 8 neighbouring cells, so someone 200 m away across a cell edge still counts as nearby
  function zoneNeighbors(z) {
    if (!validZone(z)) return [];
    let latR = [-90, 90], lngR = [-180, 180], even = true;
    for (const ch of z) { const v = GH.indexOf(ch); for (let bit = 4; bit >= 0; bit--) { const r = even ? lngR : latR, mid = (r[0] + r[1]) / 2; if ((v >> bit) & 1) r[0] = mid; else r[1] = mid; even = !even; } }
    const lat = (latR[0] + latR[1]) / 2, lng = (lngR[0] + lngR[1]) / 2, dLat = latR[1] - latR[0], dLng = lngR[1] - lngR[0], out = new Set();
    for (const a of [-1, 0, 1]) for (const c of [-1, 0, 1]) out.add(geohash(lat + a * dLat, lng + c * dLng, z.length));
    return Array.from(out);
  }
  const nearZone = (a, c) => !!a && !!c && zoneNeighbors(a).includes(c);
  function cellBounds(h) { // geohash -> {s, w, n, e}
    let latR = [-90, 90], lngR = [-180, 180], even = true;
    for (const ch of h) { const v = GH.indexOf(ch); if (v < 0) return null; for (let bit = 4; bit >= 0; bit--) { const r = even ? lngR : latR, mid = (r[0] + r[1]) / 2; if ((v >> bit) & 1) r[0] = mid; else r[1] = mid; even = !even; } }
    return { s: latR[0], n: latR[1], w: lngR[0], e: lngR[1] };
  }

  // ---------- web mercator (map maths, 256 px tiles) ----------
  const MERC_MAX = 85.05112878;
  const lngToX = (lng, z) => (lng + 180) / 360 * 256 * Math.pow(2, z);
  const latToY = (lat, z) => { const l = Math.max(-MERC_MAX, Math.min(MERC_MAX, lat)) * Math.PI / 180; return (1 - Math.log(Math.tan(l) + 1 / Math.cos(l)) / Math.PI) / 2 * 256 * Math.pow(2, z); };
  const xToLng = (x, z) => x / (256 * Math.pow(2, z)) * 360 - 180;
  const yToLat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / (256 * Math.pow(2, z)); return 180 / Math.PI * Math.atan(Math.sinh(n)); };
  const metersPerPx = (lat, z) => 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);

  // ---------- wild Litterbugs on the map ----------
  // Deterministic: every ~150 m map cell (geohash 7) may hold one Litterbug per 15-minute slot, the same for every player.
  // Nothing about the player's location is ever sent to the server: the server only checks species, daily limit and energy.
  const WILD_POOL = ['cupkraken', 'bottlebrute', 'styroslime', 'bagghost', 'strawsnake'];
  function hash32(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
  const wildSlot = ms => Math.floor(ms / C.WILD_SLOT_MS);
  function cellSpawn(cell, slot) {
    if (hash32(cell + ':' + slot) % 100 >= C.WILD_CHANCE) return null;
    const b = cellBounds(cell); if (!b) return null;
    const h = hash32(cell + '#' + slot), h2 = hash32(slot + '@' + cell);
    const fy = 0.15 + 0.7 * ((h & 0xffff) / 65535), fx = 0.15 + 0.7 * ((h2 & 0xffff) / 65535);
    return { id: cell + ':' + slot, cell, slot, litter: WILD_POOL[(h >>> 16) % WILD_POOL.length], lat: b.s + (b.n - b.s) * fy, lng: b.w + (b.e - b.w) * fx, ends: (slot + 1) * C.WILD_SLOT_MS };
  }
  function wildNear(lat, lng, now, radiusM) {
    radiusM = radiusM || C.WILD_SCAN_M;
    const slot = wildSlot(now), here = { lat, lng }, out = [], seen = new Set();
    const b0 = cellBounds(geohash(lat, lng, 7)), dLat = b0.n - b0.s, dLng = b0.e - b0.w;
    const nLat = Math.ceil(radiusM / 111320 / dLat) + 1, nLng = Math.ceil(radiusM / (111320 * Math.cos(lat * Math.PI / 180)) / dLng) + 1;
    for (let i = -nLat; i <= nLat; i++) for (let j = -nLng; j <= nLng; j++) {
      const cell = geohash(lat + i * dLat, lng + j * dLng, 7); if (seen.has(cell)) continue; seen.add(cell);
      const sp = cellSpawn(cell, slot); if (!sp) continue;
      sp.dist = distanceM(here, sp); if (sp.dist <= radiusM) out.push(sp);
    }
    return out.sort((a, c) => a.dist - c.dist);
  }
  function wildLevel(p) { const ls = p.team.filter(id => p.dex[id]).map(id => p.dex[id].level); if (!ls.length) return 2; return Math.max(2, Math.min(C.MAX_LEVEL, Math.round(ls.reduce((a, c) => a + c, 0) / ls.length))); }
  function wildToday(p, now) { const t = adnOf(now); return p.wild && p.wild.adn === t ? p.wild.n : 0; }
  function startWild(p, litter, now, seed) {
    if (!WILD_POOL.includes(litter)) return { error: 'wild' };
    if (!p.team.length) return { error: 'team' };
    if (wildToday(p, now) >= C.WILD_PER_DAY) return { error: 'wildlimit' };
    if (p.energy < 1) return { error: 'energy' };
    p.energy--; const t = adnOf(now); p.wild = { adn: t, n: wildToday(p, now) + 1 };
    const bt = { mode: 'pve', wild: true, ai: null, fi: null, boss: false, tutorial: false, seed: seed >>> 0, allies: p.team.map(id => unitFromDex(p, id, 'ally')), enemies: [litterUnit(litter, wildLevel(p))], a: 0, e: 0, turn: 0, over: false, result: null, cleaned: 0 };
    bt.allies[0].used = true; return bt;
  }
  function finishWild(p, bt) {
    const out = { result: bt.result, xp: 0, scrap: 0, levelUps: [] };
    p.litterCleaned += bt.cleaned;
    out.xp = bt.enemies.filter(e => e.hp <= 0).reduce((s, e) => s + e.level * 6, 0);
    if (out.xp) p.team.forEach(id => out.levelUps.push(...addXP(p, id, out.xp)));
    if (bt.result === 'win') { p.battlesWon++; out.scrap = C.WILD_SCRAP; p.scrap += out.scrap; }
    return out;
  }
  function distanceM(a, c) { const R = 6371000, r = Math.PI / 180, dLat = (c.lat - a.lat) * r, dLng = (c.lng - a.lng) * r; const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(c.lat * r) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }
  function bearingDeg(a, c) { const r = Math.PI / 180, y = Math.sin((c.lng - a.lng) * r) * Math.cos(c.lat * r), x = Math.cos(a.lat * r) * Math.sin(c.lat * r) - Math.sin(a.lat * r) * Math.cos(c.lat * r) * Math.cos((c.lng - a.lng) * r); return (Math.atan2(y, x) / r + 360) % 360; }

  // ---------- random names (players can also type their own; see checkName below) ----------
  const NAME_A = ['Brave', 'Chill', 'Swift', 'Sunny', 'Lucky', 'Mighty', 'Clever', 'Jolly', 'Zippy', 'Calm', 'Bold', 'Witty', 'Shiok', 'Steady', 'Bright', 'Cosy'];
  const NAME_B = ['Sipsy', 'Drippet', 'Tapao', 'Totelet', 'Strawbit', 'Canny', 'Kopicat', 'Binbin', 'Otter', 'Durian', 'Kaya', 'Satay', 'Pandan', 'Prata', 'Chendol', 'Kueh'];
  function makeName(rng) { return NAME_A[Math.floor(rng() * NAME_A.length)] + ' ' + NAME_B[Math.floor(rng() * NAME_B.length)] + ' ' + (100 + Math.floor(rng() * 900)); }
  const validName = n => { if (typeof n !== 'string') return false; const m = n.match(/^(\w+) (\w+) (\d{3})$/); return !!m && NAME_A.includes(m[1]) && NAME_B.includes(m[2]); };
  // ---------- player-chosen names: limits + word filter (the server enforces the same rules) ----------
  const NAME_MIN = 3, NAME_MAX = 20, NAME_MAX_DIGITS = 4;
  const NAME_ERR = {
    empty: 'Type a name or pick one of the suggestions.',
    length: 'Use ' + NAME_MIN + ' to ' + NAME_MAX + ' characters.',
    chars: 'Use letters, numbers and single spaces only.',
    letters: 'Include at least 2 letters.',
    digits: 'Use at most ' + NAME_MAX_DIGITS + ' numbers, so nobody shares a phone number or ID.',
    blocked: 'That name isn\u2019t allowed. Try something else.',
    reserved: 'That name could be mistaken for staff or the game. Try something else.',
    taken: 'Someone already has that name. Try another, or add a number.',
    cooldown: 'You can change your name once every 7 days.'
  };
  // Words blocked anywhere inside a name (after removing spaces, repeated letters and look-alike numbers/symbols).
  // Only words that don't hide inside normal words go here (e.g. not "rape": grape; not "meth": something).
  const BLOCK_ANY = ['fuck', 'fck', 'phuck', 'shit', 'cunt', 'bitch', 'biatch', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'pussy', 'penis', 'vagina', 'boob', 'porn', 'hitler', 'bastard', 'motherf', 'asshole', 'arsehole', 'dildo', 'naked', 'kanina', 'kannina', 'chibai', 'cheebye', 'cheebai', 'lanjiao', 'lanjio', 'lancheow', 'pukimak', 'butoh', 'nabeh', 'kanineh', 'cibai', 'jibai', 'sohai', 'diulei', 'kimak', 'suicide', 'killyourself', 'terrorist', 'jihad', 'cocaine'];
  // Short or ambiguous words blocked only as a whole word (so "Grape Kaya", "Peacock" or "Passion Fruit" are fine).
  const BLOCK_WORD = ['ass', 'arse', 'cum', 'tit', 'tits', 'fag', 'fags', 'hoe', 'hoes', 'fuk', 'fak', 'fack', 'fcuk', 'fuq', 'niga', 'dick', 'cock', 'sex', 'sexy', 'rape', 'nazi', 'kkk', 'wank', 'horny', 'nude', 'nudes', 'puki', 'kys', 'isis', 'heroin', 'weed', 'meth', 'knn', 'ccb', 'cb', 'nb', 'lj', 'diu', 'babi', 'die', 'kill', 'drug', 'drugs', 'wtf', 'stfu', 'milf', 'xxx', 'damn', 'hell', 'crap', 'piss', 'prick', 'twat', 'jerk'];
  // Could be mistaken for staff, the game or bots.
  // Checked across two neighbouring words, e.g. "lan jiao", "chee bye", "ka ni na".
  const BLOCK_SPLIT = ['fuck', 'kanina', 'chibai', 'cheebye', 'cheebai', 'lanjiao', 'lanjio', 'lancheow', 'pukimak', 'cibai', 'jibai', 'diulei', 'nabeh', 'kanineh'];
  // Real words that happen to contain a blocked word.
  const ALLOW = ['shiitake', 'scunthorpe', 'cocktail', 'cockatoo', 'peacock', 'hancock', 'dickson', 'dickens'];
  const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'staff', 'official', 'support', 'mamashop', 'skippies', 'skippy', 'system', 'bot', 'practice', 'sp staff', 'nea', 'police', 'gov'];
  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i' };
  const cleanName = n => String(n == null ? '' : n).normalize('NFKC').replace(/\s+/g, ' ').trim();
  const nameKey = n => cleanName(n).toLowerCase(); // for "already taken" checks
  function nameProblem(raw) {
    const n = cleanName(raw);
    if (!n) return 'empty';
    if (n.length < NAME_MIN || n.length > NAME_MAX) return 'length';
    if (!/^[A-Za-z0-9 ]+$/.test(n)) return 'chars';
    if ((n.match(/[A-Za-z]/g) || []).length < 2) return 'letters';
    if ((n.match(/\d/g) || []).length > NAME_MAX_DIGITS) return 'digits';
    const lower = n.toLowerCase();
    const deleet = s => s.split('').map(c => LEET[c] || c).join('');
    const squash = s => s.replace(/(.)\1+/g, '$1');
    // Check word by word (so "Bamboo Bear" never matches across the space). Pure-number words are skipped
    // so "Bob 455" isn't read as "Bob ass". Spaced-out letters ("f u c k") are joined back together first.
    const toks = lower.split(' ');
    const units = [];
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].length === 1 && i + 1 < toks.length && toks[i + 1].length === 1) {
        let run = ''; while (i < toks.length && toks[i].length === 1) run += toks[i++]; i--; units.push(run);
      } else units.push(toks[i]);
    }
    const words = [];
    units.forEach(u => { if (/^\d+$/.test(u)) return; words.push(deleet(u)); const t = u.replace(/^\d+|\d+$/g, ''); if (t && t !== u) words.push(deleet(t)); });
    // "fuuuck" -> "fuck": also compare squashed letters, but only for block words that survive squashing
    // (squashing "boob" gives "bob", which would wrongly block names like "Bobby").
    // Local swear words are often split into two words ("lan jiao"), so also check each pair of neighbouring words.
    for (let i = 0; i + 1 < words.length; i++) { const pair = words[i] + words[i + 1]; if (BLOCK_SPLIT.some(k => squash(pair).includes(squash(k)))) return 'blocked'; }
    const hitAny = w => !ALLOW.includes(w) && BLOCK_ANY.some(k => w.includes(k) || ((squash(k) === k || squash(k).length >= 5) && squash(w).includes(squash(k))));
    if (words.some(w => hitAny(w) || BLOCK_WORD.includes(w) || BLOCK_WORD.includes(squash(w)))) return 'blocked';
    const joined = words.join('');
    const wordsSq = words.join(' ');
    if (RESERVED.some(r => r.includes(' ') ? wordsSq.includes(r) : words.includes(r) || words.includes(r + 's'))) return 'reserved';
    if (/^(skipp|mamashop|admin)/.test(joined)) return 'reserved';
    return null;
  }
  const checkName = raw => { const p = nameProblem(raw); return p ? { ok: false, reason: p, message: NAME_ERR[p] } : { ok: true, name: cleanName(raw) }; };
  function makeCode(rng) { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += A[Math.floor(rng() * A.length)]; return s; }

  // ---------- player state ----------
  function newPlayer(id, now, rng) {
    return {
      v: SAVE_V, id, name: makeName(rng), friendCode: makeCode(rng), created: now, bot: false, zone: null,
      season: 1, startAdn: adnOf(now), actions: [], dex: {}, team: [], buddy: null,
      energy: C.DAILY_ENERGY, dailyAdn: adnOf(now), scrap: C.DAILY_SCRAP, mileage: {}, pity: 0, rolls: 0,
      areas: AREAS.map(() => ({ progress: 0 })), wild: { adn: adnOf(now), n: 0 }, litterCleaned: 0, battlesWon: 0, tutorialDone: false, finished: false,
      arena: { rating: C.ARENA_START, wins: 0, losses: 0 }, rewardCode: null, rewardSeason: null, rinsed: {}, lastActionTs: 0,
      reminders: { byo: '07:15', recycleDow: 6, recycleTime: '10:00' }
    };
  }
  function seasonDay(p, now) { return adnOf(now) - p.startAdn + 1; }
  function claimDaily(p, now) {
    const t = adnOf(now); if (p.dailyAdn === t) return null;
    p.dailyAdn = t; const e0 = p.energy; p.energy = Math.min(C.ENERGY_MAX, p.energy + C.DAILY_ENERGY); p.scrap += C.DAILY_SCRAP;
    return { energy: p.energy - e0, scrap: C.DAILY_SCRAP };
  }
  const verifiedActions = p => p.actions.filter(a => a.verified);
  const actionsToday = (p, now) => p.actions.filter(a => a.adn === adnOf(now));
  const actionDaysAll = p => new Set(verifiedActions(p).map(a => a.adn)).size;
  const seasonActionDays = p => new Set(verifiedActions(p).filter(a => a.season === p.season && a.adn - p.startAdn < C.SEASON_DAYS).map(a => a.adn)).size;
  function ecoScore(p, sinceAdn) { return verifiedActions(p).filter(a => sinceAdn == null || a.adn >= sinceAdn).length; }

  // ---------- collection ----------
  function addCopy(p, id, adn) {
    const isNew = !p.dex[id];
    if (isNew) { p.dex[id] = { stars: 1, copies: 0, level: 1, xp: 0, stage: 0, first: adn }; if (p.team.length < C.TEAM_MAX) p.team.push(id); if (!p.buddy) p.buddy = id; }
    else p.dex[id].copies++;
    return isNew;
  }
  function mergeCost(p, id) { const d = p.dex[id]; if (!d || d.stars >= C.MAX_STARS) return null; return STAR_COST[d.stars]; }
  function merge(p, id) {
    const d = p.dex[id]; if (!d) return { ok: false, reason: 'missing' };
    if (d.stars >= C.MAX_STARS) return { ok: false, reason: 'max' };
    const cost = STAR_COST[d.stars]; if (d.copies < cost) return { ok: false, reason: 'copies', need: cost, have: d.copies };
    d.copies -= cost; d.stars++;
    const st = evoStage(SP[id], d.stars), evolved = st > d.stage ? { from: SP[id].stages[d.stage], to: SP[id].stages[st] } : null; d.stage = st;
    return { ok: true, stars: d.stars, evolved };
  }
  const xpNeed = L => 15 + L * 10;
  function addXP(p, id, amt) {
    const d = p.dex[id]; if (!d || amt <= 0) return [];
    const from = d.level; d.xp += amt;
    while (d.level < C.MAX_LEVEL && d.xp >= xpNeed(d.level)) { d.xp -= xpNeed(d.level); d.level++; }
    if (d.level >= C.MAX_LEVEL) d.xp = 0;
    return d.level > from ? [{ id, from, to: d.level }] : [];
  }
  function train(p, id, scrap) {
    const d = p.dex[id]; scrap = Math.floor(scrap || C.TRAIN_STEP);
    if (!d) return { ok: false, reason: 'missing' };
    if (!(scrap > 0) || scrap > 1000) return { ok: false, reason: 'amount' };
    if (d.level >= C.MAX_LEVEL) return { ok: false, reason: 'max' };
    if (p.scrap < scrap) return { ok: false, reason: 'scrap' };
    p.scrap -= scrap; return { ok: true, levelUps: addXP(p, id, scrap * C.SCRAP_XP) };
  }
  function mileageBonus(p, type) {
    if (type === 'spark') return Math.min(C.MILEAGE_CAP, Math.floor(verifiedActions(p).length / 2)) / 100;
    return Math.min(C.MILEAGE_CAP, p.mileage[type] || 0) / 100;
  }
  const STAGE_MULT = [1, 1.15, 1.3];
  function calcStats(base, L, stage, stars, bonus, boss) {
    const m = (1 + 0.08 * (L - 1)) * STAGE_MULT[stage || 0] * (1 + 0.08 * ((stars || 1) - 1)) * (1 + (bonus || 0)) * (boss ? 1.2 : 1);
    return { maxHp: Math.floor(base.hp * m * (boss ? 2 : 1)) + 10, atk: Math.round(base.atk * m), def: Math.round(base.def * m), spd: Math.round(base.spd * m) };
  }
  function statsOf(p, id) { const d = p.dex[id], sp = SP[id]; return calcStats(sp.base, d.level, d.stage, d.stars, mileageBonus(p, sp.type)); }
  function power(p, id) { const s = statsOf(p, id); return Math.round(s.maxHp / 2 + s.atk + s.def + s.spd); }
  const nameOf = (p, id) => SP[id].stages[p.dex[id] ? p.dex[id].stage : 0];

  // ---------- hatching ----------
  function rollRarity(p, rng) {
    let r;
    if (p.pity >= C.PITY_RARE - 1) { // guaranteed Rare or better, using the published rare/epic/legendary ratio
      const x = rng() * 15; r = x < 1 ? 'legendary' : x < 5 ? 'epic' : 'rare';
    } else {
      const x = rng() * 100; let acc = 0; r = 'common';
      for (const k of RARITY_KEYS) { acc += RARITY[k].odds; if (x < acc) { r = k; break; } }
    }
    p.pity = RARITY[r].rank >= 2 ? 0 : p.pity + 1; p.rolls++;
    return r;
  }
  // Exact long-run rates including pity (Markov chain over the pity counter). Published so players see the true odds.
  function effectiveOdds() {
    const n = C.PITY_RARE, base = RARITY_KEYS.map(k => RARITY[k].odds / 100), pRare = base[2] + base[3] + base[4];
    const w = []; for (let k = 0; k < n; k++) w.push(Math.pow(1 - pRare, k)); const Z = w.reduce((a, c) => a + c, 0);
    const pi = w.map(x => x / Z), last = pi[n - 1], normal = 1 - last, pityMix = [0, 0, 10 / 15, 4 / 15, 1 / 15];
    const out = {}; RARITY_KEYS.forEach((k, i) => { out[k] = Math.round((normal * base[i] + last * pityMix[i]) * 10000) / 100; });
    return out;
  }
  function rollSpecies(rarity, itemType, rng) {
    const pool = EGG_POOL[RARITY[rarity].rank];
    const match = pool.filter(s => s.type === itemType);
    const use = match.length && rng() < 0.7 ? match : pool;
    return use[Math.floor(rng() * use.length)].id;
  }
  function validateAction(p, now, a) {
    const it = ITEMS[a && a.item];
    if (!it) return 'item';
    if (seasonDay(p, now) > C.SEASON_DAYS) return 'season';
    if (actionsToday(p, now).filter(x => x.verified).length >= C.MAX_ACTIONS_PER_DAY) return 'limit';
    if (now - p.lastActionTs < C.ACTION_COOLDOWN_MS) return 'cooldown';
    if (!validHash(a.hash)) return 'hash';
    const det = Array.isArray(a.detected) ? a.detected.filter(x => typeof x === 'string') : [];
    if (!det.some(x => it.detect.includes(x))) return 'notdetected';
    return null;
  }
  // a = {item, hash, detected:[...], together, family}. Caller must check hash uniqueness first.
  function doAction(p, now, a, rng) {
    const err = validateAction(p, now, a); if (err) return { ok: false, reason: err };
    const it = ITEMS[a.item], adn = adnOf(now);
    p.actions.push({ adn, ts: now, season: p.season, kind: it.kind, item: a.item, verified: true, together: !!a.together, family: !!a.family });
    p.lastActionTs = now;
    if (it.kind === 'byo') p.mileage[it.type] = (p.mileage[it.type] || 0) + 1; else p.mileage.recycle = (p.mileage.recycle || 0) + 1;
    const rarity = rollRarity(p, rng), species = rollSpecies(rarity, it.type, rng);
    const hatched = [{ id: species, rarity, isNew: addCopy(p, species, adn), source: 'egg' }];
    p.lastCatch = { id: species, ts: now };
    const bonus = id => hatched.push({ id, rarity: SP[id].rarity, isNew: addCopy(p, id, adn), source: 'recipe' });
    const dow = sgDow(now);
    if (dow === 0 || dow === 6) { if (!actionsToday(p, now).slice(0, -1).some(x => x.verified)) bonus('weekend'); }
    const det = a.detected.filter(x => ITEMS[a.item].detect.includes(x));
    if (a.together && det.length >= 2 && !actionsToday(p, now).slice(0, -1).some(x => x.together)) bonus('kaki');
    if (a.family && !actionsToday(p, now).slice(0, -1).some(x => x.family)) bonus('mamabao');
    const e0 = p.energy; p.energy = Math.min(C.ENERGY_MAX, p.energy + C.ACTION_ENERGY);
    const scrap = it.kind === 'recycle' ? C.RECYCLE_SCRAP : C.BYO_SCRAP; p.scrap += scrap;
    let reward = null;
    if (!p.rewardCode && seasonActionDays(p) >= C.STAR_DAYS) { reward = 'SKIP-' + makeCode(rng).slice(0, 5); p.rewardCode = reward; p.rewardSeason = p.season; }
    return { ok: true, hatched, energy: p.energy - e0, scrap, reward, kind: it.kind };
  }
  function logSelfReport(p, now, item) { // no photo: counts for personal impact only. No egg, no leaderboard.
    if (!ITEMS[item]) return { ok: false, reason: 'item' };
    if (actionsToday(p, now).length >= 12) return { ok: false, reason: 'limit' };
    p.actions.push({ adn: adnOf(now), ts: now, season: p.season, kind: ITEMS[item].kind, item, verified: false }); return { ok: true };
  }
  function rinse(p, now) {
    const t = adnOf(now);
    if (!actionsToday(p, now).some(a => a.verified && a.kind === 'byo')) return { ok: false, reason: 'nobyo' };
    if (p.rinsed[t]) return { ok: false, reason: 'done' };
    p.rinsed[t] = true; const isNew = addCopy(p, 'bubbles', t); p.energy = Math.min(C.ENERGY_MAX, p.energy + C.RINSE_ENERGY);
    return { ok: true, isNew };
  }
  function newSeason(p, now) { if (seasonDay(p, now) <= C.SEASON_DAYS) return false; p.season++; p.startAdn = adnOf(now); p.rewardCode = null; p.rewardSeason = null; return true; }
  function setTeam(p, ids) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > C.TEAM_MAX || new Set(ids).size !== ids.length || !ids.every(id => p.dex[id])) return false;
    p.team = ids.slice(); return true;
  }

  // ---------- campaign ----------
  function areaUnlocked(p, i) { if (!AREAS[i]) return false; if (i === 0) return actionDaysAll(p) >= AREAS[0].need; return p.areas[i - 1].progress >= 4 && actionDaysAll(p) >= AREAS[i].need; }
  function lockReason(p, i) {
    if (areaUnlocked(p, i)) return null;
    if (i > 0 && p.areas[i - 1].progress < 4) return 'Beat the ' + AREAS[i - 1].name + ' boss first.';
    return 'Needs ' + AREAS[i].need + ' real BYO/recycling day' + (AREAS[i].need > 1 ? 's' : '') + ' (you have ' + actionDaysAll(p) + ').';
  }
  const fightList = i => AREAS[i].fights.concat([AREAS[i].boss]);

  // ---------- battle ----------
  function eff(atk, def, mode) {
    if (!atk || atk === 'none') return 1;
    if (mode === 'pve') { if (atk === def) return 2; if (atk === 'spark' || atk === 'recycle') return 1.25; return 1; }
    if (mode === 'litter') return atk === def ? 0.5 : 1;
    if (atk === 'spark' || def === 'spark') return 1; // pvp
    const i = PVP_CYCLE.indexOf(atk), j = PVP_CYCLE.indexOf(def);
    if (i < 0 || j < 0) return 1;
    if ((i + 1) % PVP_CYCLE.length === j) return 1.5;
    if ((j + 1) % PVP_CYCLE.length === i) return 0.67;
    return 1;
  }
  function unitFromDex(p, id, side) {
    const d = p.dex[id], sp = SP[id], s = statsOf(p, id);
    return { side, id, name: nameOf(p, id), level: d.level, stage: d.stage, stars: d.stars, type: sp.type, util: sp.util, hp: s.maxHp, maxHp: s.maxHp, atk: s.atk, def: s.def, spd: s.spd, cheer: 0, guard: false, utilLeft: C.UTIL_USES, used: false, turns: 0 };
  }
  function litterUnit(id, level) {
    const L = LITTER[id], s = calcStats(L.base, level, 0, 1, 0, !!L.boss);
    return { side: 'enemy', id, litter: true, name: L.name, level, type: L.type, curType: L.type, shift: !!L.shift, boss: !!L.boss, move: L.move, big: L.big, hp: s.maxHp, maxHp: s.maxHp, atk: s.atk, def: s.def, spd: s.spd, cheer: 0, guard: false, turns: 0 };
  }
  function startCampaign(p, ai, fi, seed) {
    if (!AREAS[ai] || !areaUnlocked(p, ai)) return { error: 'locked' };
    const list = fightList(ai); if (!Number.isInteger(fi) || !list[fi]) return { error: 'nofight' };
    if (fi > p.areas[ai].progress) return { error: 'order' };
    if (!p.team.length) return { error: 'team' };
    const tutorial = !p.tutorialDone && ai === 0 && fi === 0;
    if (!tutorial) { if (p.energy < 1) return { error: 'energy' }; p.energy--; }
    const bt = { mode: 'pve', ai, fi, boss: fi === 3, tutorial, seed: seed >>> 0, allies: p.team.map(id => unitFromDex(p, id, 'ally')), enemies: list[fi].map(([id, lv]) => litterUnit(id, lv)), a: 0, e: 0, turn: 0, over: false, result: null, cleaned: 0 };
    bt.allies[0].used = true; return bt;
  }
  function startArena(p, opp, seed) {
    if (!p.team.length || !opp || !opp.team || !opp.team.length) return { error: 'team' };
    if (p.energy < 1) return { error: 'energy' }; p.energy--;
    const ghost = opp.team.map(id => Object.assign(unitFromDex(opp, id, 'enemy'), { ghost: true }));
    const bt = { mode: 'pvp', seed: seed >>> 0, oppId: opp.id, oppName: opp.name, oppBot: !!opp.bot, allies: p.team.map(id => unitFromDex(p, id, 'ally')), enemies: ghost, a: 0, e: 0, turn: 0, over: false, result: null, cleaned: 0 };
    bt.allies[0].used = true; return bt;
  }
  function damage(att, def, pw, type, mode, rng) {
    const a = att.atk * (1 + 0.5 * att.cheer), e = eff(type, def.curType || def.type, mode);
    let d = pw * a / def.def * 0.5 * e * (0.85 + 0.15 * rng()), guarded = false;
    if (def.guard) { d *= 0.4; def.guard = false; guarded = true; }
    return { dmg: Math.max(1, Math.round(d)), eff: e, guarded };
  }
  function useUtil(bt, side, idx, ev) {
    const U = side === 'ally' ? bt.allies[idx] : bt.enemies[idx]; U.utilLeft--;
    if (U.util === 'cheer') { if (U.cheer < 2) U.cheer++; ev.push({ t: 'buff', side, idx, text: U.name + ' used Cheer! Attack up.' }); }
    else if (U.util === 'guard') { U.guard = true; ev.push({ t: 'buff', side, idx, text: U.name + ' is on Guard.' }); }
    else { const h = Math.min(U.maxHp - U.hp, Math.round(U.maxHp * (U.util === 'rinse' ? 0.5 : 0.35))); U.hp += h; ev.push({ t: 'heal', side, idx, amt: h, hp: U.hp, max: U.maxHp, text: U.name + ' used ' + UTIL[U.util].name + '! +' + h + ' HP' }); }
  }
  function knockout(bt, side, ev) {
    const list = side === 'enemy' ? bt.enemies : bt.allies, cur = side === 'enemy' ? bt.e : bt.a, U = list[cur];
    if (side === 'enemy') { bt.cleaned++; ev.push({ t: 'faint', side, idx: cur, text: U.litter ? U.name + ' got cleaned up!' : U.name + ' is out!' }); }
    else ev.push({ t: 'faint', side, idx: cur, text: U.name + ' is too tired to continue.' });
    const nx = list.findIndex(x => x.hp > 0);
    if (nx < 0) { bt.over = true; bt.result = side === 'enemy' ? 'win' : 'lose'; ev.push({ t: 'end', result: bt.result }); return; }
    if (side === 'enemy') bt.e = nx; else { bt.a = nx; bt.allies[nx].used = true; }
    ev.push({ t: 'send', side, idx: nx, text: side === 'enemy' ? list[nx].name + ' appears!' : 'Go, ' + list[nx].name + '!' });
  }
  function allyTurn(bt, mv, ev, rng) {
    const A = bt.allies[bt.a], E = bt.enemies[bt.e];
    if (mv === 'util') return useUtil(bt, 'ally', bt.a, ev);
    const pw = mv === 'type' ? TYPE_POWER[A.stage] : BUMP_POWER, type = mv === 'type' ? A.type : 'none';
    const r = damage(A, E, pw, type, bt.mode === 'pvp' ? 'pvp' : 'pve', rng); E.hp = Math.max(0, E.hp - r.dmg);
    ev.push({ t: 'hit', side: 'enemy', idx: bt.e, dmg: r.dmg, eff: r.eff, guarded: r.guarded, hp: E.hp, max: E.maxHp, text: A.name + ' used ' + (mv === 'type' ? TYPE_MOVE[A.type] : 'Bump') + '!' });
    if (E.hp <= 0) knockout(bt, 'enemy', ev);
  }
  function enemyTurn(bt, ev, rng) {
    const E = bt.enemies[bt.e], A = bt.allies[bt.a]; E.turns++;
    if (E.ghost) { // simple, predictable ghost AI
      if ((E.util === 'refill' || E.util === 'rinse') && E.utilLeft > 0 && E.hp < E.maxHp * 0.35) return useUtil(bt, 'enemy', bt.e, ev);
      const r = damage(E, A, TYPE_POWER[E.stage], E.type, 'pvp', rng); A.hp = Math.max(0, A.hp - r.dmg);
      ev.push({ t: 'hit', side: 'ally', idx: bt.a, dmg: r.dmg, eff: r.eff, guarded: r.guarded, hp: A.hp, max: A.maxHp, text: E.name + ' used ' + TYPE_MOVE[E.type] + '!' });
    } else {
      const big = E.boss && E.turns % 3 === 0;
      const r = damage(E, A, big ? BOSS_BIG_POWER : ENEMY_POWER, E.curType, 'litter', rng); A.hp = Math.max(0, A.hp - r.dmg);
      ev.push({ t: 'hit', side: 'ally', idx: bt.a, dmg: r.dmg, eff: r.eff, guarded: r.guarded, big, hp: A.hp, max: A.maxHp, text: E.name + ' used ' + (big ? E.big : E.move) + '!' });
    }
    if (A.hp <= 0) knockout(bt, 'ally', ev);
  }
  function act(bt, action, rng) {
    const ev = []; if (bt.over) return [{ t: 'msg', text: 'Battle is over.', invalid: true }];
    if (!action || typeof action !== 'object') return [{ t: 'msg', text: 'Bad action.', invalid: true }];
    if (action.kind === 'run') { bt.over = true; bt.result = 'fled'; return [{ t: 'msg', text: 'You walked away.' }, { t: 'end', result: 'fled' }]; }
    const A = bt.allies[bt.a], E = bt.enemies[bt.e];
    if (action.kind === 'switch') {
      const to = action.to;
      if (!Number.isInteger(to) || to === bt.a || !bt.allies[to] || bt.allies[to].hp <= 0) return [{ t: 'msg', text: 'Can\u2019t switch to that one.', invalid: true }];
      bt.a = to; bt.allies[to].used = true; ev.push({ t: 'send', side: 'ally', idx: to, text: 'Go, ' + bt.allies[to].name + '!' });
      enemyTurn(bt, ev, rng);
    } else if (action.kind === 'move') {
      const mv = action.move;
      if (!['type', 'bump', 'util'].includes(mv)) return [{ t: 'msg', text: 'Unknown move.', invalid: true }];
      if (mv === 'util' && A.utilLeft <= 0) return [{ t: 'msg', text: 'No ' + UTIL[A.util].name + ' left this battle.', invalid: true }];
      if (A.spd >= E.spd) { allyTurn(bt, mv, ev, rng); if (!bt.over && bt.enemies[bt.e] === E) enemyTurn(bt, ev, rng); }
      else { enemyTurn(bt, ev, rng); if (!bt.over && bt.allies[bt.a] === A) allyTurn(bt, mv, ev, rng); }
    } else return [{ t: 'msg', text: 'Bad action.', invalid: true }];
    bt.turn++;
    if (!bt.over) { const e = bt.enemies[bt.e]; if (e.shift) { const nt = LITTER_CYCLE[bt.turn % LITTER_CYCLE.length]; if (nt !== e.curType) { e.curType = nt; ev.push({ t: 'shift', idx: bt.e, type: nt, text: e.name + ' shifts into ' + TYPES[nt].name + ' litter!' }); } } }
    return ev;
  }
  // Server-side verification: replay the client's actions from the stored start state + seed.
  function replay(start, actions, maxActions) {
    if (!Array.isArray(actions) || actions.length > (maxActions || 300)) return { error: 'actions' };
    const bt = clone(start), rng = mulberry32(bt.seed);
    for (let i = 0; i < actions.length; i++) {
      if (bt.over) return { error: 'extra' };
      const ev = act(bt, actions[i], rng);
      if (ev.length && ev[0].invalid) return { error: 'invalid', at: i };
    }
    if (!bt.over) { bt.over = true; bt.result = 'fled'; }
    return { battle: bt };
  }
  function finishCampaign(p, bt) {
    const out = { result: bt.result, xp: 0, scrap: 0, levelUps: [], progressed: false, areaCleared: false, gameCleared: false };
    p.litterCleaned += bt.cleaned; if (bt.tutorial) p.tutorialDone = true;
    out.xp = bt.enemies.filter(e => e.hp <= 0).reduce((s, e) => s + e.level * 6 * (e.boss ? 3 : 1), 0);
    if (out.xp) p.team.forEach(id => out.levelUps.push(...addXP(p, id, out.xp)));
    if (bt.result === 'win') {
      p.battlesWon++; out.scrap = 5 * bt.enemies.length + (bt.boss ? 20 : 0); p.scrap += out.scrap;
      const ar = p.areas[bt.ai];
      if (bt.fi === ar.progress && ar.progress < 4) { ar.progress++; out.progressed = true; if (ar.progress === 4) { out.areaCleared = true; if (bt.ai === AREAS.length - 1) { p.finished = true; out.gameCleared = true; } } }
    }
    return out;
  }
  function elo(ra, rb, scoreA) { const ea = 1 / (1 + Math.pow(10, (rb - ra) / 400)); return Math.round(C.ELO_K * (scoreA - ea)); }
  function finishArena(p, opp, bt) {
    const win = bt.result === 'win', score = win ? 1 : 0;
    const delta = elo(p.arena.rating, opp.arena.rating, score);
    p.arena.rating = Math.max(100, p.arena.rating + delta); if (win) p.arena.wins++; else p.arena.losses++;
    let oppDelta = 0;
    // the defender wasn't online, so they get half the change: nobody loses much while away
    if (!opp.bot) { oppDelta = -Math.round(delta / 2); opp.arena.rating = Math.max(100, opp.arena.rating + oppDelta); if (win) opp.arena.losses++; else opp.arena.wins++; }
    const xp = win ? 40 : 10; const levelUps = []; p.team.forEach(id => levelUps.push(...addXP(p, id, xp)));
    const scrap = win ? 15 : 5; p.scrap += scrap;
    return { result: bt.result, delta, rating: p.arena.rating, xp, scrap, levelUps, oppDelta };
  }

  // ---------- bots (practice opponents, never on leaderboards) ----------
  function makeBot(i, now) {
    const rng = mulberry32(9000 + i), p = newPlayer('bot-' + i, now, rng); p.bot = true; p.name = makeName(rng) + ' (practice bot)';
    const pool = SPECIES.filter(s => s.source !== 'recipe' && s.rarity !== 'legendary');
    const lv = 3 + i * 3;
    for (let k = 0; k < 3; k++) { const sp = pool[(i * 5 + k * 7) % pool.length]; addCopy(p, sp.id, 0); p.dex[sp.id].level = Math.min(C.MAX_LEVEL, lv); p.dex[sp.id].stars = 1 + Math.min(4, Math.floor(i / 2)); p.dex[sp.id].stage = evoStage(sp, p.dex[sp.id].stars); }
    p.team = Object.keys(p.dex).slice(0, 3); p.arena.rating = 900 + i * 60; return p;
  }

  // ---------- reminders ----------
  function hhmm(s) { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; }
  function icsDaily(time, title, startMs) {
    const t = hhmm(time) == null ? 435 : hhmm(time); const d = ymdOf(startMs).replace(/-/g, ''); const z = n => String(n).padStart(2, '0');
    const end = Math.min(t + 5, 1439);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SKIPPIES//EN', 'BEGIN:VEVENT', 'UID:skippies-byo-' + d + '@skippies', 'DTSTAMP:' + d + 'T000000Z',
      'DTSTART;TZID=Asia/Singapore:' + d + 'T' + z(Math.floor(t / 60)) + z(t % 60) + '00', 'DTEND;TZID=Asia/Singapore:' + d + 'T' + z(Math.floor(end / 60)) + z(end % 60) + '00',
      'RRULE:FREQ=DAILY;COUNT=60', 'SUMMARY:' + title, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + title, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }
  function icsWeekly(dow, time, title, startMs) {
    const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    let s = icsDaily(time, title, startMs).replace('RRULE:FREQ=DAILY;COUNT=60', 'RRULE:FREQ=WEEKLY;BYDAY=' + days[dow] + ';COUNT=26').replace('skippies-byo-', 'skippies-recycle-');
    // DTSTART must fall on the BYDAY weekday: move forward to the next matching day
    const add = (dow - sgDow(startMs) + 7) % 7; const d2 = ymdOf(startMs + add * DAY).replace(/-/g, ''), d1 = ymdOf(startMs).replace(/-/g, '');
    return s.split(d1 + 'T').join(d2 + 'T');
  }

  root.G = {
    VERSION, SAVE_V, DAY, HOUR, MIN, C, TYPES, PVP_CYCLE, TYPE_MOVE, TYPE_POWER, UTIL, ITEMS, BYO_ITEMS, RECYCLE_ITEMS, RARITY, RARITY_KEYS, SPECIES, SP, EGG_POOL, STAR_COST,
    LITTER, AREAS, mulberry32, adnOf, sgHour, sgDow, weekStart, ymdOf, clone, dhash, hamming, validHash, lowDetail, geohash, validZone, zoneNeighbors, nearZone, cellBounds, lngToX, latToY, xToLng, yToLat, metersPerPx,
    WILD_POOL, hash32, wildSlot, cellSpawn, wildNear, wildLevel, wildToday, startWild, finishWild, distanceM, bearingDeg,
    makeName, validName, checkName, cleanName, nameKey, NAME_ERR, NAME_MIN, NAME_MAX, makeCode, NAME_A, NAME_B, newPlayer, seasonDay, claimDaily, verifiedActions, actionsToday, actionDaysAll, seasonActionDays, ecoScore,
    addCopy, mergeCost, merge, evoStage, nextEvoStars, xpNeed, addXP, train, mileageBonus, calcStats, statsOf, power, nameOf, rollRarity, rollSpecies, effectiveOdds,
    validateAction, doAction, logSelfReport, rinse, newSeason, setTeam, areaUnlocked, lockReason, fightList, eff, unitFromDex, startCampaign, startArena,
    act, replay, finishCampaign, elo, finishArena, makeBot, hhmm, icsDaily, icsWeekly
  };
})(typeof window !== 'undefined' ? window : globalThis);
