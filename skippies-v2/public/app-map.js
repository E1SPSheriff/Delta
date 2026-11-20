/* SKIPPIES: live map. Real street map (OneMap, Singapore Land Authority), your buddy at your position,
   recycling points from NEA open data, and wild Litterbugs that spawn around you every 15 minutes.
   Your exact location is only used on this phone: it is never sent to the Skippies server. */
(function (root) {
  'use strict';
  const SK = root.SK, doc = root.document, nav = root.navigator;
  const { C, LITTER, TYPES } = G;
  const esc = SK.esc, ic = SK.ic;
  const TILE_URL = 'https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png';
  const LOGO = 'https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png';
  const SG = { s: 1.144, w: 103.535, n: 1.494, e: 104.502 }; // OneMap coverage bounds
  const HOME = { lat: 1.3099, lng: 103.7775 };             // Singapore Polytechnic, Dover Road
  const TMIN = 11, TMAX = 19, ZMIN = 13, ZMAX = 19, TILT = 42, COS_T = Math.cos(TILT * Math.PI / 180);
  const K_DONE = 'skippies2.wildDone', K_PREF = 'skippies2.mapPrefs';
  const raf = root.requestAnimationFrame ? f => root.requestAnimationFrame(f) : f => setTimeout(f, 16);
  const inSG = p => p && p.lat > SG.s && p.lat < SG.n && p.lng > SG.w && p.lng < SG.e;
  const DEF = { tilt: true, tiles: null, zoom: 17, geoOk: false };
  const prefs = (() => { try { return Object.assign({}, DEF, JSON.parse(SK.LS.get(K_PREF) || '{}')); } catch (e) { return Object.assign({}, DEF); } })();
  const savePrefs = () => SK.LS.set(K_PREF, JSON.stringify({ tilt: prefs.tilt, tiles: prefs.tiles, zoom: Math.round(M.zoom * 2) / 2, geoOk: prefs.geoOk }));
  const M = { center: Object.assign({}, HOME), zoom: prefs.zoom, follow: true, me: null, acc: null, geo: 'idle', geoMsg: '', watch: null, spawns: [], outside: false, W: 390, H: 600, filt: 'all', justDragged: 0 };
  const showTiles = () => prefs.tiles == null ? SK.mode !== 'local' : !!prefs.tiles;

  // ---------- recycling-point data (NEA via data.gov.sg; compact or object format) ----------
  let data = null;
  const norm = p => Array.isArray(p) ? { k: p[0], lat: p[1], lng: p[2], n: p[3] || '', a: p[4] || '' } : p;
  async function loadData() {
    if (data) return data;
    try { const r = await root.fetch('data/recycling-points.json'); data = await r.json(); } catch (e) { data = { points: [], source: '' }; }
    data.points = Array.isArray(data.points) ? data.points.map(norm) : [];
    return data;
  }
  const KIND = { bin: { label: 'Blue recycling bin', color: '#1F5FA8', icon: 'recycle', takes: 'Paper, plastic, glass, metal' }, ewaste: { label: 'E-waste point', color: '#B23A3A', icon: 'ewaste', takes: 'Check what this point accepts' } };
  const kindOf = p => KIND[p.k] || KIND.bin;
  const title = p => (p.k === 'bin' || !p.n || /^Recycling Bins/i.test(p.n)) ? kindOf(p).label : p.n;
  const dist = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1) + ' km';
  const ref = () => M.me && !M.outside ? M.me : M.center;

  // ---------- wild spawns ----------
  function doneMap() { try { return JSON.parse(SK.LS.get(K_DONE) || '{}'); } catch (e) { return {}; } }
  SK.markWildDone = sp => { const d = doneMap(), t = SK.now(); for (const k of Object.keys(d)) if (d[k] < t) delete d[k]; d[sp.id] = sp.ends; SK.LS.set(K_DONE, JSON.stringify(d)); refreshSpawns(); };
  function refreshSpawns() {
    if (!M.me || M.outside) { M.spawns = []; return; }
    const d = doneMap();
    M.spawns = G.wildNear(M.me.lat, M.me.lng, SK.now(), C.WILD_SCAN_M).filter(s => !d[s.id]);
  }

  // ---------- projection ----------
  const tz = () => Math.max(TMIN, Math.min(TMAX, Math.round(M.zoom)));
  const scale = () => Math.pow(2, M.zoom - tz());
  const PH = () => prefs.tilt ? Math.round(M.H * 1.75) : M.H;
  const PW = () => prefs.tilt ? Math.round(M.W * 1.6) : M.W; // tilted plane is wider so the far edge still fills the screen
  function project(lat, lng) {
    const z = tz(), s = scale();
    return [(G.lngToX(lng, z) - G.lngToX(M.center.lng, z)) * s + PW() / 2, (G.latToY(lat, z) - G.latToY(M.center.lat, z)) * s + PH() / 2];
  }
  function clampCenter() {
    M.center.lat = Math.max(SG.s, Math.min(SG.n, M.center.lat));
    M.center.lng = Math.max(SG.w, Math.min(SG.e, M.center.lng));
  }

  // ---------- view ----------
  SK.views.radar = function () {
    const s = SK.st;
    return `<div class="map ${prefs.tilt ? 'tilted' : ''} ${showTiles() ? '' : 'no-tiles'}" id="map" role="region" aria-label="Map of recycling points and wild Litterbugs near you">
      <div class="map-plane" id="mplane"><div class="map-content" id="mcontent"><div class="mtiles" id="mtiles"></div><div class="mlayer" id="mlayer"></div></div></div>
      <div class="map-sky" aria-hidden="true"></div>
      <div class="map-hud" id="mhud" aria-live="polite"></div>
      <div class="map-ctrls">
        <button class="fab" id="mzin" aria-label="Zoom in">${ic('plus', 22)}</button>
        <button class="fab" id="mzout" aria-label="Zoom out"><svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button>
        <button class="fab txt" id="mtilt" aria-pressed="${prefs.tilt}" aria-label="3D view">${prefs.tilt ? '3D' : '2D'}</button>
      </div>
      <button class="fab big" id="locate" aria-label="${M.me ? 'Centre on me' : 'Show me on the map'}">${ic('location', 24)}</button>
      <button class="map-list" id="maplist">${ic('recycle', 20)}<span>Nearby</span></button>
      <div class="map-attr" id="mattr" ${showTiles() ? '' : 'hidden'}><img src="${LOGO}" alt="" width="16" height="16"><a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;\u00a9 contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a></div>
      <div class="map-overlay" id="mover" ${M.geo === 'on' ? 'hidden' : ''}></div>
      ${s.mode === 'local' ? `<span class="map-chip" style="left:12px;bottom:64px">${ic('offline', 14)}Offline mode</span>` : ''}
    </div>`;
  };
  function overlayHtml() {
    if (M.geo === 'on') return '';
    if (M.geo === 'asking') return `<div class="map-card"><p class="body2"><b>Finding you\u2026</b></p></div>`;
    const msg = M.geo === 'denied' ? 'Location is off for this site. Turn it on in your browser settings to see what\u2019s around you.' : M.geo === 'na' ? 'Location isn\u2019t available on this device.' : 'Turn on location to see recycling points and wild Litterbugs around you. Your exact location stays on this phone.';
    return `<div class="map-card"><div class="flex" style="gap:12px;align-items:flex-start">${Art.litter(LITTER.cupkraken, { size: 52 })}<p class="body2 grow">${esc(msg)}</p></div>${M.geo === 'na' ? '' : `<button class="btn btn-primary btn-block mt12" id="geoon">${ic('location', 20)}Show me on the map</button>`}</div>`;
  }
  function hud() {
    const el = doc.getElementById('mhud'); if (!el) return;
    const near = M.spawns.length, inR = M.spawns.filter(s => s.dist <= C.WILD_RANGE_M).length, done = G.wildToday(SK.st, SK.now());
    let h = '';
    if (M.outside) h += `<span class="map-chip warn">${ic('alert', 14)}Outside Singapore. Showing Singapore Polytechnic.</span>`;
    else if (M.me) h += `<span class="map-chip">${ic('battle', 14)}${near ? near + ' Litterbug' + (near === 1 ? '' : 's') + ' nearby' + (inR ? ' \u00b7 ' + inR + ' in range' : '') : 'No Litterbugs nearby right now'}</span>`;
    if (M.me && !M.outside) h += `<span class="map-chip tnum">${ic('energy', 14)}${SK.st.energy} \u00b7 wild ${done}/${C.WILD_PER_DAY}</span>`;
    el.innerHTML = h;
  }

  // ---------- drawing ----------
  const tileImgs = new Map();
  function measure() {
    const el = doc.getElementById('map'); const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    M.W = (r && r.width) || 390; M.H = (r && r.height) || 600;
  }
  function draw() {
    const plane = doc.getElementById('mplane'), tl = doc.getElementById('mtiles'), ml = doc.getElementById('mlayer');
    if (!plane || !tl || !ml) return;
    const ph = PH();
    const pw = PW();
    plane.style.height = ph + 'px'; plane.style.top = Math.round((M.H - ph) / 2) + 'px';
    plane.style.width = pw + 'px'; plane.style.left = Math.round((M.W - pw) / 2) + 'px';
    plane.style.transform = prefs.tilt ? `rotateX(${TILT}deg)` : 'none';
    const z = tz(), s = scale(), cx = G.lngToX(M.center.lng, z), cy = G.latToY(M.center.lat, z), T = 256 * s;
    // tiles
    const want = new Set();
    if (showTiles()) {
      const x0 = Math.floor((cx - PW() / 2 / s) / 256), x1 = Math.floor((cx + PW() / 2 / s) / 256);
      const y0 = Math.floor((cy - ph / 2 / s) / 256), y1 = Math.floor((cy + ph / 2 / s) / 256);
      const tx0 = Math.floor(G.lngToX(SG.w, z) / 256), tx1 = Math.floor(G.lngToX(SG.e, z) / 256), ty0 = Math.floor(G.latToY(SG.n, z) / 256), ty1 = Math.floor(G.latToY(SG.s, z) / 256);
      for (let x = Math.max(x0, tx0); x <= Math.min(x1, tx1); x++) for (let y = Math.max(y0, ty0); y <= Math.min(y1, ty1); y++) {
        const key = z + '/' + x + '/' + y; want.add(key);
        let img = tileImgs.get(key);
        if (!img) {
          img = doc.createElement('img'); img.setAttribute('alt', ''); img.setAttribute('draggable', 'false'); img.className = 'tile-img';
          img.onerror = () => { img.style.visibility = 'hidden'; };
          img.setAttribute('src', TILE_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y));
          tileImgs.set(key, img); tl.appendChild(img);
        }
        img.style.left = ((x * 256 - cx) * s + PW() / 2) + 'px'; img.style.top = ((y * 256 - cy) * s + ph / 2) + 'px';
        img.style.width = (T + 0.5) + 'px'; img.style.height = (T + 0.5) + 'px';
      }
    }
    for (const [k, img] of tileImgs) if (!want.has(k)) { img.remove(); tileImgs.delete(k); }
    // markers
    const inView = (x, y, m) => x > -m && x < PW() + m && y > -m && y < ph + m;
    let html = '';
    if (data && data.points.length) {
      const pts = [];
      for (let i = 0; i < data.points.length; i++) { const p = data.points[i]; if (M.filt !== 'all' && p.k !== M.filt) continue; const [x, y] = project(p.lat, p.lng); if (inView(x, y, 40)) pts.push([x, y, i]); }
      if (M.zoom < 16 && pts.length > 40) {
        const cell = 64, buckets = new Map();
        for (const q of pts) { const k = Math.floor(q[0] / cell) + ',' + Math.floor(q[1] / cell); const b = buckets.get(k) || { x: 0, y: 0, n: 0, i: q[2] }; b.x += q[0]; b.y += q[1]; b.n++; buckets.set(k, b); }
        for (const b of buckets.values()) html += b.n === 1 ? pinHtml(b.x, b.y, b.i) : `<button class="mk up cluster" data-mk="c:${(b.x / b.n).toFixed(0)},${(b.y / b.n).toFixed(0)}" style="left:${(b.x / b.n).toFixed(1)}px;top:${(b.y / b.n).toFixed(1)}px" aria-label="${b.n} recycling points. Zoom in"><span class="tnum">${b.n}</span></button>`;
      } else {
        pts.sort((a, b) => Math.hypot(a[0] - PW() / 2, a[1] - ph / 2) - Math.hypot(b[0] - PW() / 2, b[1] - ph / 2));
        for (const q of pts.slice(0, 250)) html += pinHtml(q[0], q[1], q[2]);
      }
    }
    for (const sp of M.spawns) {
      const [x, y] = project(sp.lat, sp.lng); if (!inView(x, y, 60)) continue;
      const L = LITTER[sp.litter], ok = sp.dist <= C.WILD_RANGE_M;
      html += `<button class="mk up wild ${ok ? 'inrange' : 'far'}" data-mk="w:${esc(sp.id)}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px" aria-label="Wild ${esc(L.name)}, ${dist(sp.dist)} away${ok ? ', in range' : ''}"><span class="shadow"></span>${Art.litter(L, { size: 58 })}</button>`;
    }
    if (M.me && !M.outside) {
      const [x, y] = project(M.me.lat, M.me.lng), mpp = G.metersPerPx(M.me.lat, M.zoom);
      const rr = C.WILD_RANGE_M / mpp, ar = Math.min(400, (M.acc || 0) / mpp);
      html = `<div class="mk range" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${(rr * 2).toFixed(0)}px;height:${(rr * 2).toFixed(0)}px" aria-hidden="true"></div>` +
        (ar > rr * 0.15 ? `<div class="mk acc" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${(ar * 2).toFixed(0)}px;height:${(ar * 2).toFixed(0)}px" aria-hidden="true"></div>` : '') + html +
        `<div class="mk up me" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px" aria-label="You are here" role="img"><span class="shadow"></span>${SK.st.buddy && SK.st.dex[SK.st.buddy] ? SK.art(SK.st.buddy, { size: 62 }) : Art.egg(44)}<span class="you">You</span></div>`;
    }
    ml.innerHTML = html;
    ml.querySelectorAll('[data-mk]').forEach(b => b.onclick = () => { if (Date.now() - M.justDragged < 250) return; tapMarker(b.dataset.mk); });
    hud();
  }
  function pinHtml(x, y, i) {
    const p = data.points[i], K = kindOf(p);
    return `<button class="mk up pin" data-mk="p:${i}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;--pc:${K.color}" aria-label="${esc(title(p))}"><span class="pinhead">${ic(K.icon, 16)}</span></button>`;
  }
  let pending = false;
  const redraw = () => { if (pending) return; pending = true; raf(() => { pending = false; draw(); }); };

  // ---------- marker taps ----------
  function tapMarker(k) {
    if (k.startsWith('c:')) { const [x, y] = k.slice(2).split(',').map(Number); zoomTo(M.zoom + 2, x, y); return; }
    if (k.startsWith('p:')) return pointSheet(data.points[+k.slice(2)]);
    if (k.startsWith('w:')) { const sp = M.spawns.find(s => s.id === k.slice(2)); if (sp) wildSheet(sp); }
  }
  function pointSheet(p) {
    const K = kindOf(p), d = G.distanceM(ref(), p);
    const { sh, close } = SK.sheet(title(p), `<div class="flex" style="gap:12px"><span class="lead" style="width:48px;height:48px;border-radius:12px;display:grid;place-items:center;background:var(--sunken);color:${K.color}">${ic(K.icon, 26)}</span>
      <span class="grow"><span class="body2"><b>${esc(K.label)}</b></span><br><span class="caption">${esc(p.a || '')}</span></span></div>
      <div class="group mt16"><div class="row"><span class="grow">Distance</span><span class="trail">${dist(d)}</span></div><div class="row"><span class="grow">Takes</span><span class="trail" style="max-width:60%;text-align:right">${esc(K.takes)}</span></div></div>`,
      { actions: `<a class="btn btn-primary btn-block" id="pdir" href="https://www.google.com/maps/dir/?api=1&amp;destination=${p.lat},${p.lng}&amp;travelmode=walking" target="_blank" rel="noopener">${ic('directions', 20)}Walking directions</a><button class="btn btn-secondary btn-block mt8" id="rechere">${ic('camera', 20)}I recycled here</button>` });
    sh.querySelector('#rechere').onclick = () => { close(); SK.catchFlow('recycle'); };
  }
  function wildSheet(sp) {
    const s = SK.st, L = LITTER[sp.litter], lv = G.wildLevel(s), done = G.wildToday(s, SK.now());
    const ok = sp.dist <= C.WILD_RANGE_M, mins = Math.max(1, Math.ceil((sp.ends - SK.now()) / 60000));
    const why = !s.team.length ? 'Hatch a Skippy first' : !ok ? `Walk closer: ${dist(sp.dist)} away (needs ${C.WILD_RANGE_M} m)` : done >= C.WILD_PER_DAY ? `You\u2019ve done ${C.WILD_PER_DAY} wild battles today` : s.energy < 1 ? 'No energy left. A real BYO gives +3' : '';
    const { sh, close } = SK.sheet('Wild ' + L.name, `<div class="hero-tile" style="height:170px;background:#E8EFE3;border-color:var(--line)">${Art.litter(L, { size: 130 })}</div>
      <div class="flex wrap mt12">${SK.typeChip(L.type)}<span class="badge soft tnum">Lv ${lv}</span><span class="badge soft tnum">${dist(sp.dist)} away</span></div>
      <p class="muted mt8">Leaves in about ${mins} min. ${esc(TYPES[L.type].name)} Skippies deal 2\u00d7 damage to it.</p>
      <div class="group mt12"><div class="row"><span class="grow">Win</span><span class="trail tnum">+${C.WILD_SCRAP} scrap and XP</span></div><div class="row"><span class="grow">Wild battles today</span><span class="trail tnum">${done} of ${C.WILD_PER_DAY}</span></div></div>`,
      { actions: `<button class="btn btn-primary btn-block" id="wildgo" ${why ? 'disabled' : ''}>${ic('energy', 20)}Battle \u00b7 1 energy</button>${why ? `<span class="why">${esc(why)}</span>` : ''}` });
    sh.querySelector('#wildgo').onclick = async () => { close(); stopGeo(); await SK.startWild(sp); };
  }

  // ---------- geolocation ----------
  function onPos(pos) {
    const first = !M.me;
    M.me = { lat: pos.coords.latitude, lng: pos.coords.longitude }; M.acc = pos.coords.accuracy || null;
    M.outside = !inSG(M.me); M.geo = 'on';
    if (!prefs.geoOk) { prefs.geoOk = true; savePrefs(); } // next time, start tracking straight away
    if (M.outside) { if (first) M.center = Object.assign({}, HOME); }
    else if (M.follow) M.center = Object.assign({}, M.me);
    const ov = doc.getElementById('mover'); if (ov) { ov.hidden = true; ov.innerHTML = ''; }
    const lb = doc.getElementById('locate'); if (lb) lb.setAttribute('aria-label', 'Centre on me');
    refreshSpawns(); redraw();
  }
  function onErr(e) {
    M.geo = e && e.code === 1 ? 'denied' : M.me ? 'on' : 'denied';
    if (M.geo !== 'on') { const ov = doc.getElementById('mover'); if (ov) { ov.hidden = false; ov.innerHTML = overlayHtml(); bindOverlay(); } }
  }
  function startGeo() {
    if (!nav.geolocation) { M.geo = 'na'; const ov = doc.getElementById('mover'); if (ov) { ov.hidden = false; ov.innerHTML = overlayHtml(); } return; }
    if (M.watch != null) return;
    if (M.geo !== 'on') { M.geo = 'asking'; const ov = doc.getElementById('mover'); if (ov) { ov.hidden = false; ov.innerHTML = overlayHtml(); } }
    const opts = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 };
    if (nav.geolocation.watchPosition) M.watch = nav.geolocation.watchPosition(onPos, onErr, opts);
    else nav.geolocation.getCurrentPosition(onPos, onErr, opts);
  }
  function stopGeo() { if (M.watch != null && nav.geolocation && nav.geolocation.clearWatch) nav.geolocation.clearWatch(M.watch); M.watch = null; }
  function bindOverlay() { const b = doc.getElementById('geoon'); if (b) b.onclick = startGeo; }

  // ---------- gestures ----------
  const ptrs = new Map(); let g = null;
  function gestureStart(e) {
    if (e.target && e.target.closest && e.target.closest('.fab,.map-list,.map-attr,.map-card,.map-hud')) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = doc.getElementById('mcontent');
    if (ptrs.size === 1) g = { type: 'pan', sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false, c };
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; g = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, f: 1, c, moved: true }; }
    root.addEventListener('pointermove', gestureMove); root.addEventListener('pointerup', gestureEnd); root.addEventListener('pointercancel', gestureEnd);
  }
  function gestureMove(e) {
    if (!g || !ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.type === 'pan') {
      g.dx = e.clientX - g.sx; g.dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(g.dx, g.dy) > 6) g.moved = true;
      if (g.moved && g.c) g.c.style.transform = `translate(${g.dx}px,${(prefs.tilt ? g.dy / COS_T : g.dy).toFixed(1)}px)`;
    } else if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()]; g.f = Math.max(0.25, Math.min(4, Math.hypot(a.x - b.x, a.y - b.y) / g.d0));
      if (g.c) g.c.style.transform = `scale(${g.f.toFixed(3)})`;
    }
  }
  function gestureEnd(e) {
    ptrs.delete(e.pointerId);
    if (!g) return;
    if (g.type === 'pan' && g.moved) { panBy(g.dx, prefs.tilt ? g.dy / COS_T : g.dy); M.justDragged = Date.now(); }
    if (g.type === 'pinch' && ptrs.size < 2) { zoomTo(M.zoom + Math.log2(g.f)); M.justDragged = Date.now(); }
    if (g.c) g.c.style.transform = '';
    if (!ptrs.size) { g = null; root.removeEventListener('pointermove', gestureMove); root.removeEventListener('pointerup', gestureEnd); root.removeEventListener('pointercancel', gestureEnd); }
    else if (g.type === 'pinch') { const p = [...ptrs.values()][0]; g = { type: 'pan', sx: p.x, sy: p.y, dx: 0, dy: 0, moved: false, c: g.c }; }
  }
  function panBy(dx, dy) {
    const z = tz(), s = scale();
    M.center = { lat: G.yToLat(G.latToY(M.center.lat, z) - dy / s, z), lng: G.xToLng(G.lngToX(M.center.lng, z) - dx / s, z) };
    clampCenter(); M.follow = false; redraw();
  }
  function zoomTo(z, px, py) {
    const nz = Math.max(ZMIN, Math.min(ZMAX, z));
    if (px != null) { // zooming into a tapped spot (e.g. a cluster): centre the map on it
      const zt = tz(), s = scale(), wx = G.lngToX(M.center.lng, zt) + (px - PW() / 2) / s, wy = G.latToY(M.center.lat, zt) + (py - PH() / 2) / s;
      M.center = { lat: G.yToLat(wy, zt), lng: G.xToLng(wx, zt) }; clampCenter(); M.follow = false;
    }
    M.zoom = nz; savePrefs(); redraw();
  }
  let wheelT = 0;
  function onWheel(e) { if (e.preventDefault) e.preventDefault(); const t = Date.now(); if (t - wheelT < 120) return; wheelT = t; zoomTo(M.zoom + (e.deltaY < 0 ? 0.5 : -0.5)); }

  // ---------- list sheet ----------
  function listSheet() {
    const s = SK.st, r = ref();
    let near = [];
    if (data) near = data.points.filter(p => M.filt === 'all' || p.k === M.filt).map(p => Object.assign({ d: G.distanceM(r, p) }, p)).sort((a, b) => a.d - b.d).slice(0, 15);
    const empty = data && !data.points.length;
    const { sh, close } = SK.sheet('Nearby', `
      ${M.me ? '' : `<p class="caption">${M.geo === 'on' ? '' : 'Showing distances from the map centre. Turn on location for distances from you.'}</p>`}
      ${M.spawns.length ? `<div class="section-head mt8"><span class="label">Wild Litterbugs</span></div><div class="group">${M.spawns.slice(0, 6).map(sp => `<button class="row" data-wild="${esc(sp.id)}"><span class="lead" style="background:none">${Art.litter(LITTER[sp.litter], { size: 40 })}</span><span class="grow"><span class="title">${esc(LITTER[sp.litter].name)}</span><br><span class="meta tnum">${dist(sp.dist)}${sp.dist <= C.WILD_RANGE_M ? ' \u00b7 in range' : ''}</span></span>${ic('next', 20)}</button>`).join('')}</div>` : ''}
      <div class="section-head mt16"><span class="label">Recycling points</span></div>
      <div class="chips" role="radiogroup" aria-label="Filter">${[['all', 'All'], ['bin', 'Blue bins'], ['ewaste', 'E-waste']].map(([k, l]) => `<button class="chip" role="radio" data-k="${k}" aria-checked="${M.filt === k}">${l}</button>`).join('')}</div>
      ${empty ? `<div class="banner warn mt12">${ic('info', 20)}<span>Recycling-point data hasn\u2019t loaded on this server yet. Use the official maps below.</span></div>` : ''}
      ${near.length ? `<div class="group mt12 plist">${near.map(p => `<div class="row"><span class="lead" style="color:${kindOf(p).color}">${ic(kindOf(p).icon, 20)}</span>
          <span class="grow"><span class="title">${esc(title(p))}</span><br><span class="meta">${esc(p.a || '')}</span><br><span class="meta tnum"><b style="color:var(--ink)">${dist(p.d)}</b> \u00b7 ${esc(kindOf(p).takes)}</span></span>
          <a class="btn btn-secondary btn-sm" href="https://www.google.com/maps/dir/?api=1&amp;destination=${p.lat},${p.lng}&amp;travelmode=walking" target="_blank" rel="noopener" aria-label="Directions to ${esc(title(p))}">${ic('directions', 18)}Go</a></div>`).join('')}</div>` : ''}
      <div class="section-head mt24"><span class="label">Drink cans and bottles</span></div>
      <div class="group"><a class="row" href="https://www.returnright.sg" target="_blank" rel="noopener"><span class="lead">${ic('bev', 20)}</span><span class="grow"><span class="title">Get 10\u00a2 back</span><br><span class="meta">Find a Return Right machine for containers with the deposit mark</span></span>${ic('next', 20)}</a>
      <a class="row" href="https://www.recycle.gov.sg/materials/beverage" target="_blank" rel="noopener"><span class="lead">${ic('info', 20)}</span><span class="grow"><span class="title">What\u2019s accepted</span><br><span class="meta">Freshly made drinks like bubble tea don\u2019t qualify</span></span>${ic('next', 20)}</a></div>
      <div class="section-head mt24"><span class="label">Map settings</span></div>
      <div class="group"><div class="row"><span class="lead">${ic('map', 20)}</span><span class="grow"><span class="title">Street map</span><br><span class="meta">Map images come from OneMap (Singapore Land Authority). Like any online map, it sees which area you load.</span></span><label class="toggle"><input type="checkbox" id="tilestog" aria-label="Street map" ${showTiles() ? 'checked' : ''}><i></i></label></div></div>
      <div class="section-head mt24"><span class="label">Your area (optional)</span></div>
      <p class="body2">${s.zone ? 'Your area is set (about 5 km). It\u2019s used for players near you and the Near me ranking, where nearby players can see your game name.' : 'Share a rough area, about 5 km and never your exact location, to battle and rank with players near you.'}</p>
      ${s.mode === 'local' ? '<p class="caption mt8">Available in the online version.</p>' : `<div class="flex mt12"><button class="btn btn-secondary grow" id="setzone">${ic('location', 18)}${s.zone ? 'Update area' : 'Set my area'}</button>${s.zone ? '<button class="btn btn-ghost" id="clearzone">Remove</button>' : ''}</div>`}
      <div id="zonemsg"></div>
      <p class="caption mt16">Map data: ${esc((data && data.source) || 'NEA datasets via data.gov.sg')}. Locations can change. Check signs on site.</p>`, { onClose: () => { if (doc.getElementById('map')) redraw(); } });
    sh.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { M.filt = b.dataset.k; close(); redraw(); listSheet(); });
    sh.querySelectorAll('[data-wild]').forEach(b => b.onclick = () => { const sp = M.spawns.find(x => x.id === b.dataset.wild); close(); if (sp) wildSheet(sp); });
    const tg = sh.querySelector('#tilestog'); if (tg) tg.onclick = () => { prefs.tiles = !!tg.checked; savePrefs(); const m = doc.getElementById('map'), a = doc.getElementById('mattr'); if (m) m.classList.toggle('no-tiles', !showTiles()); if (a) a.hidden = !showTiles(); };
    const zmsg = (t, bad) => { const el = sh.querySelector('#zonemsg'); if (el) el.innerHTML = `<div class="banner ${bad ? 'err' : 'info'} mt12">${ic(bad ? 'alert' : 'check', 20)}<span>${esc(t)}</span></div>`; };
    const sz = sh.querySelector('#setzone');
    if (sz) sz.onclick = () => {
      if (!nav.geolocation) return zmsg('Location isn\u2019t available on this device.', true);
      nav.geolocation.getCurrentPosition(async pos => {
        const z = G.geohash(pos.coords.latitude, pos.coords.longitude, 5);
        if (!G.validZone(z)) return zmsg('Areas are only available inside Singapore.', true);
        const r = await SK.call('PUT', '/api/zone', { zone: z }); zmsg(r.status === 200 ? 'Area saved.' : SK.errMsg(r), r.status !== 200);
      }, () => zmsg('Location is off for this site. Turn it on in your browser settings.', true), { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
    };
    const cz = sh.querySelector('#clearzone'); if (cz) cz.onclick = async () => { const r = await SK.call('DELETE', '/api/zone'); zmsg(r.status === 200 ? 'Area removed.' : SK.errMsg(r), r.status !== 200); };
  }

  // ---------- lifecycle ----------
  let tick = null;
  SK.stopMap = function () { stopGeo(); if (tick) { clearInterval(tick); tick = null; } tileImgs.clear(); const m = doc.getElementById('map'); if (m) { m.onpointerdown = null; m.onwheel = null; } };
  SK.binders.radar = function () {
    const m = doc.getElementById('map'); if (!m) return;
    measure();
    if (!data) loadData().then(() => { if (doc.getElementById('map')) redraw(); });
    const ov = doc.getElementById('mover'); if (ov && M.geo !== 'on') { ov.innerHTML = overlayHtml(); bindOverlay(); }
    m.onpointerdown = gestureStart;
    if (m.addEventListener) m.addEventListener('wheel', onWheel, { passive: false });
    SK.on('mzin', () => zoomTo(Math.round(M.zoom) + 1));
    SK.on('mzout', () => zoomTo(Math.round(M.zoom) - 1));
    SK.on('mtilt', () => { prefs.tilt = !prefs.tilt; savePrefs(); m.classList.toggle('tilted', prefs.tilt); const b = doc.getElementById('mtilt'); if (b) { b.setAttribute('aria-pressed', String(prefs.tilt)); b.textContent = prefs.tilt ? '3D' : '2D'; } redraw(); });
    SK.on('locate', () => { M.follow = true; if (M.me && !M.outside) { M.center = Object.assign({}, M.me); redraw(); } startGeo(); });
    SK.on('maplist', listSheet);
    if (M.geo === 'on' || prefs.geoOk) startGeo();
    tick = setInterval(() => { if (!doc.getElementById('map')) return; const before = M.spawns.map(s => s.id).join(); refreshSpawns(); if (M.spawns.map(s => s.id).join() !== before) redraw(); else hud(); }, 20000);
    if (root.addEventListener) root.addEventListener('resize', () => { if (doc.getElementById('map')) { measure(); redraw(); } }, { once: true });
    draw();
  };
  SK._mapTest = { M, prefs, project, panBy, zoomTo, refreshSpawns, draw, listSheet, tapMarker, setData: d => { data = d; data.points = data.points.map(norm); }, setHere: p => onPos({ coords: { latitude: p.lat, longitude: p.lng, accuracy: 10 } }) };
})(typeof window !== 'undefined' ? window : globalThis);
