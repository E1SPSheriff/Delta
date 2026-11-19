// SKIPPIES v2 balance simulation: plays the campaign with smart and random players.
// Usage: node tests/balance-sim.js
require('../public/engine.js'); const G = globalThis.G;
function smart(b) {
  const A = b.allies[b.a], E = b.enemies[b.e];
  if (A.hp < A.maxHp * 0.35 && A.utilLeft > 0 && (A.util === 'refill' || A.util === 'rinse')) return { kind: 'move', move: 'util' };
  const tgt = E.curType;
  if (A.type !== tgt && b.turn % 4 === 0) { const i = b.allies.findIndex((x, k) => k !== b.a && x.hp > x.maxHp * 0.5 && x.type === tgt); if (i >= 0) return { kind: 'switch', to: i }; }
  if (A.util === 'cheer' && A.cheer === 0 && A.utilLeft > 0 && E.boss && E.hp > E.maxHp * 0.6) return { kind: 'move', move: 'util' };
  return { kind: 'move', move: 'type' };
}
function naive(b, rng) { const r = rng(); return r < 0.6 ? { kind: 'move', move: 'type' } : r < 0.9 ? { kind: 'move', move: 'bump' } : { kind: 'move', move: b.allies[b.a].utilLeft > 0 ? 'util' : 'type' }; }
const T0 = Date.UTC(2026, 11, 1, 4); // 12:00 SGT
function run(seed, policy, perDay) {
  const rng = G.mulberry32(seed); let now = T0; const p = G.newPlayer('p', now, rng);
  let battles = 0, losses = 0, day = 0; const LOSS = {}; const items = ['cup', 'bev', 'bottle', 'box', 'paper', 'bag', 'kit'];
  while (!p.finished && day < 40) {
    day++; if (day > 1) now += G.DAY;
    if (G.seasonDay(p, now) > 14) G.newSeason(p, now);
    G.claimDaily(p, now);
    for (let k = 0; k < perDay; k++) {
      const item = items[(day * perDay + k) % items.length];
      const r = G.doAction(p, now + k * 61000, { item, hash: (seed * 1000 + day * 10 + k).toString(16).padStart(16, '0'), detected: G.ITEMS[item].detect.slice(0, 1) }, rng);
      if (!r.ok) throw new Error('action failed ' + r.reason);
    }
    G.rinse(p, now + 5 * 61000);
    Object.keys(p.dex).forEach(id => { while (G.merge(p, id).ok); });
    const ids = Object.keys(p.dex).sort((a, b2) => G.power(p, b2) - G.power(p, a)); p.team = ids.slice(0, 3);
    while (p.scrap >= 10) { const id = p.team.reduce((m, x) => p.dex[x].level < p.dex[m].level ? x : m, p.team[0]); if (!G.train(p, id, 10).ok) break; }
    const fails = {};
    while (p.energy > 0 || !p.tutorialDone) {
      let ai = -1; for (let i = G.AREAS.length - 1; i >= 0; i--) if (G.areaUnlocked(p, i) && p.areas[i].progress < 4) { ai = i; break; }
      if (ai < 0) break;
      let fi = p.areas[ai].progress; const key = ai + ':' + fi; fails[key] = fails[key] || 0;
      if (fails[key] >= 2 && fails[key] % 2 === 0 && fi > 0) fi--;
      const bt = G.startCampaign(p, ai, fi, Math.floor(rng() * 1e9)); if (bt.error) break;
      const brng = G.mulberry32(bt.seed); let g = 0;
      while (!bt.over && g++ < 200) G.act(bt, policy === 'smart' ? smart(bt) : naive(bt, rng), brng);
      if (!bt.over) { bt.over = true; bt.result = 'lose'; }
      const r = G.finishCampaign(p, bt); battles++;
      const frontier = fi === p.areas[ai].progress || r.progressed;
      if (r.result !== 'win') { if (frontier) { losses++; LOSS[key] = (LOSS[key] || 0) + 1; } fails[key]++; } else fails[key] = 0;
    }
  }
  return { day: p.finished ? day : null, battles, losses, LOSS, team: p.team.map(id => G.nameOf(p, id) + ' L' + p.dex[id].level + ' ' + p.dex[id].stars + '★') };
}
for (const pol of ['smart', 'naive']) for (const perDay of [1, 2]) {
  const res = []; for (let s = 1; s <= 30; s++) res.push(run(s, pol, perDay));
  const fin = res.filter(r => r.day); const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
  const L = {}; res.forEach(r => Object.entries(r.LOSS).forEach(([k, v]) => L[k] = (L[k] || 0) + v));
  console.log(`${pol} ${perDay}/day: finished ${fin.length}/30, avg day ${avg(fin.map(r => r.day))}, battles ${avg(res.map(r => r.battles))}, loss ${avg(res.map(r => r.losses / Math.max(1, r.battles) * 100))}% | losses at ${JSON.stringify(L)} | e.g. ${res[0].team.join(', ')}`);
}
