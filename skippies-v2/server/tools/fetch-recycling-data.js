// Downloads NEA open datasets from data.gov.sg and writes a compact public/data/recycling-points.json
// CLI (needs internet): node server/tools/fetch-recycling-data.js     The server also runs this automatically on start-up.
// Datasets (publisher: National Environment Agency, via data.gov.sg, Open Data Licence):
//   Recycling Bins    d_4dde14826642f49eefff48b7832b90db  (GeoJSON; attributes are in an HTML table inside "Description")
//   E-waste Recycling d_db40d004afeb5a7f0f555fdcc34934cc  (GeoJSON; flat attributes. NEA notes this data may be outdated)
// Output format: { source, generated, counts, points: [[kind, lat, lng, name, address], ...] }
const fs = require('fs'), path = require('path');
const OUT_FILE = path.join(__dirname, '..', '..', 'public', 'data', 'recycling-points.json');
const SOURCE = 'NEA datasets via data.gov.sg: Recycling Bins (last updated 6 Jun 2024) and E-waste Recycling (data from Jun 2022, may be outdated)';
const SETS = [
  { id: 'd_4dde14826642f49eefff48b7832b90db', kind: 'bin', label: 'Recycling Bins' },
  { id: 'd_db40d004afeb5a7f0f555fdcc34934cc', kind: 'ewaste', label: 'E-waste Recycling' }
];
const strip = s => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
function fields(desc) { // KML-style HTML table: <th>KEY</th> <td>VALUE</td>
  const out = {}; const re = /<th>([^<]*)<\/th>\s*<td>([\s\S]*?)<\/td>/gi; let m;
  while ((m = re.exec(desc || ''))) out[m[1].trim().toUpperCase()] = strip(m[2]);
  return out;
}
function describe(props) {
  const f = Object.assign({}, fields(props.Description || props.description));
  Object.keys(props).forEach(k => { const v = props[k]; if ((typeof v === 'string' || typeof v === 'number') && !/^description$/i.test(k) && !/^name$/.test(k)) f[k.toUpperCase()] = strip(v); });
  if (typeof props.NAME === 'string') f.NAME = strip(props.NAME);
  const name = (f.NAME && !/^kml_\d+$/i.test(f.NAME) ? f.NAME : '') || f.ADDRESSBUILDINGNAME || '';
  const parts = [f.ADDRESSBLOCKHOUSENUMBER && f.ADDRESSBLOCKHOUSENUMBER !== '0' ? 'Blk ' + f.ADDRESSBLOCKHOUSENUMBER : '', f.ADDRESSSTREETNAME, f.ADDRESSPOSTALCODE && f.ADDRESSPOSTALCODE !== '0' ? 'S' + f.ADDRESSPOSTALCODE : ''].filter(Boolean);
  const titleCase = s => s.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
  return { name: name.slice(0, 80), addr: titleCase(parts.join(' ')).replace(/\bBlk\b/i, 'Blk').replace(/\bS(\d{6})\b/i, 'S$1').slice(0, 120) };
}
function parse(gj, kind) {
  const pts = [], seen = new Set();
  for (const ft of (gj && gj.features) || []) {
    const g = ft && ft.geometry; if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) continue;
    const lng = +g.coordinates[0], lat = +g.coordinates[1];
    if (!(lat > 1.1 && lat < 1.5 && lng > 103.5 && lng < 104.1)) continue; // Singapore bounds
    const key = lat.toFixed(5) + ',' + lng.toFixed(5) + kind; if (seen.has(key)) continue; seen.add(key);
    const d = describe(ft.properties || {});
    pts.push([kind, +lat.toFixed(6), +lng.toFixed(6), kind === 'bin' ? '' : d.name, d.addr]);
  }
  return pts;
}
async function getJson(fetchFn, url) { const r = await fetchFn(url); if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status); return r.json(); }
async function download(fetchFn, id) {
  const meta = await getJson(fetchFn, `https://api-open.data.gov.sg/v1/public/api/datasets/${id}/poll-download`);
  if (!meta || meta.code !== 0 || !meta.data || !meta.data.url) throw new Error('poll-download returned no url for ' + id + ': ' + JSON.stringify(meta).slice(0, 200));
  return getJson(fetchFn, meta.data.url);
}
// Returns the output object, or throws if nothing could be downloaded.
async function fetchAll(opts) {
  opts = opts || {}; const fetchFn = opts.fetch || globalThis.fetch, log = opts.log || console.log;
  const points = [], counts = {};
  for (const s of SETS) {
    try { const p = parse(await download(fetchFn, s.id), s.kind); counts[s.kind] = p.length; points.push(...p); log(`${s.label}: ${p.length} points`); }
    catch (e) { log(`Failed ${s.label}: ${e.message}`); }
  }
  if (!points.length) throw new Error('No points downloaded');
  return { source: SOURCE, generated: new Date().toISOString(), counts, points };
}
function readCurrent(file) { try { return JSON.parse(fs.readFileSync(file || OUT_FILE, 'utf8')); } catch (e) { return null; } }
function needsRefresh(cur, maxAgeDays) { if (!cur || !Array.isArray(cur.points) || !cur.points.length || !cur.generated) return true; return Date.now() - Date.parse(cur.generated) > (maxAgeDays || 30) * 86400000; }
async function update(opts) {
  opts = opts || {}; const file = opts.file || OUT_FILE;
  const out = await fetchAll(opts);
  const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(out)); fs.renameSync(tmp, file); // atomic replace
  return out;
}
module.exports = { parse, describe, fields, fetchAll, update, readCurrent, needsRefresh, OUT_FILE, SETS };
if (require.main === module) update().then(o => console.log('Wrote', o.points.length, 'points')).catch(e => { console.error(e.message + '. Existing file left unchanged.'); process.exit(1); });
