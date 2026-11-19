// Tests the data.gov.sg recycling-points tool against fixtures copied from the real dataset previews (Nov 2026),
// using a mock fetch (no internet needed). Also checks atomic write + refresh logic.
const fs = require('fs'), os = require('os'), path = require('path');
const T = require('../server/tools/fetch-recycling-data.js');
let fails = 0, passes = 0; const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL:', m); } };
// Recycling Bins: attributes live in an HTML table in "Description" (3D coordinates)
const binDesc = (blk, street, postal) => `<center><table><tr><th colspan='2' align='center'><em>Attributes</em></th></tr><tr bgcolor="#E3E3F3"> <th>ADDRESSBLOCKHOUSENUMBER</th> <td>${blk}</td> </tr><tr bgcolor=""> <th>ADDRESSBUILDINGNAME</th> <td></td> </tr><tr bgcolor="#E3E3F3"> <th>ADDRESSFLOORNUMBER</th> <td></td> </tr><tr bgcolor=""> <th>ADDRESSPOSTALCODE</th> <td>${postal}</td> </tr><tr bgcolor="#E3E3F3"> <th>ADDRESSSTREETNAME</th> <td>${street}</td> </tr><tr bgcolor=""> <th>ADDRESSTYPE</th> <td>H</td> </tr><tr bgcolor="#E3E3F3"> <th>DESCRIPTION</th> <td>To deposit recyclables such as paper (e.g. carton boxes, newspaper, magazine), plastics (e.g. plastic bottle, container), glass (e.g. beverage glass bottle) and metals (e.g. drink cans, metal containe</td> </tr><tr bgcolor=""> <th>HYPERLINK</th> <td>www.nea.gov.sg/3R</td> </tr><tr bgcolor=""> <th>LANDYADDRESSPOINT</th> <td>0</td> </tr><tr bgcolor="#E3E3F3"> <th>NAME</th> <td>Recycling Bins in HDB Estates</td> </tr><tr bgcolor=""> <th>PHOTOURL</th> <td></td> </tr><tr bgcolor="#E3E3F3"> <th>INC_CRC</th> <td>A86545F66AF3A74E</td> </tr><tr bgcolor=""> <th>FMEL_UPD_D</th> </tr><tr bgcolor="#E3E3F3"> <th>ADDRESSUNITNUMBER</th> <td></td> </tr></table></center>`;
const BINS = { type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } }, features: [
  { type: 'Feature', properties: { Name: 'kml_1', Description: binDesc('407', 'YISHUN AVENUE 6', '790407') }, geometry: { type: 'Point', coordinates: [103.875052888184996, 1.38854074075156, 0.0] } },
  { type: 'Feature', properties: { Name: 'kml_2', Description: binDesc('76', 'REDHILL ROAD', '150076') }, geometry: { type: 'Point', coordinates: [103.894248964200997, 1.36545877349135, 0.0] } },
  { type: 'Feature', properties: { Name: 'kml_3', Description: binDesc('76', 'REDHILL ROAD', '150076') }, geometry: { type: 'Point', coordinates: [103.894248964200997, 1.36545877349135, 0.0] } }, // duplicate point
  { type: 'Feature', properties: { Name: 'kml_4', Description: binDesc('1', 'NOWHERE', '000000') }, geometry: { type: 'Point', coordinates: [0, 0, 0] } }, // outside Singapore
  { type: 'Feature', properties: { Name: 'kml_5' }, geometry: null }
] };
// E-waste: flat properties (2D coordinates)
const EWASTE = { type: 'FeatureCollection', name: 'EWASTE', features: [
  { type: 'Feature', geometry: { type: 'Point', coordinates: [103.80150080009246, 1.2743429471793757] }, properties: { OBJECTID: 19904, NAME: 'NEA Producer Responsibility Scheme - ALBA E-waste Recycling Programme', ADDRESSBLOCKHOUSENUMBER: null, ADDRESSBUILDINGNAME: 'ALEXANDRA RETAIL CENTRE (ARC)', ADDRESSFLOORNUMBER: null, ADDRESSPOSTALCODE: '119963', ADDRESSSTREETNAME: '460 ALEXANDRA ROAD, ALEXANDRA RETAIL CENTRE, LEVEL 1, BESIDE WATSON UNIT NEAR NURSING ROOM', ADDRESSUNITNUMBER: null, DESCRIPTION: 'Bin collection; E-waste accepted: ICT equipment, Batteries and Lamps only', HYPERLINK: 'https://alba-ewaste.sg; https://go.gov.sg/e-waste', PHOTOURL: null, ACCESSRESTRICTION: 'Public', LANDXADDRESSPOINT: 24458.931, LANDYADDRESSPOINT: 28535.911, INC_CRC: 'B4EBD69ED27CE8F3', FMEL_UPD_D: '20220602130953' } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [103.70646088413002, 1.339830152579402] }, properties: { OBJECTID: 19906, NAME: 'KGS E-waste Recycling Programme for Non-regulated E-waste', ADDRESSBUILDINGNAME: 'JURONG POINT ', ADDRESSPOSTALCODE: 648886, ADDRESSSTREETNAME: '1 JURONG WEST CENTRAL 2, JURONG POINT, BESIDE SKECHERS #01-16H/J', DESCRIPTION: 'Bin collection' } }
] };
const URLS = { 'd_4dde14826642f49eefff48b7832b90db': 'https://s3.example/bins.geojson', 'd_db40d004afeb5a7f0f555fdcc34934cc': 'https://s3.example/ewaste.geojson' };
const mockFetch = (fail) => async url => {
  const m = url.match(/datasets\/(d_[0-9a-f]+)\/poll-download/);
  if (m) return { ok: true, json: async () => ({ code: 0, data: { url: URLS[m[1]] }, errorMsg: null }) };
  if (fail && url.includes(fail)) return { ok: false, status: 503, json: async () => ({}) };
  if (url.endsWith('bins.geojson')) return { ok: true, json: async () => BINS };
  if (url.endsWith('ewaste.geojson')) return { ok: true, json: async () => EWASTE };
  return { ok: false, status: 404 };
};
(async () => {
  const bins = T.parse(BINS, 'bin');
  ok(bins.length === 2, 'bins: dedupes, drops out-of-bounds and null geometry (' + bins.length + ')');
  ok(bins[0][0] === 'bin' && bins[0][1] === 1.388541 && bins[0][2] === 103.875053, 'bins: [kind, lat, lng] from 3D coordinates');
  ok(bins[0][4] === 'Blk 407 Yishun Avenue 6 S790407', 'bins: address from HTML table: ' + bins[0][4]);
  const ew = T.parse(EWASTE, 'ewaste');
  ok(ew.length === 2 && ew[0][3].startsWith('NEA Producer Responsibility Scheme'), 'e-waste: flat NAME used');
  ok(/^460 Alexandra Road/.test(ew[0][4]) && ew[0][4].endsWith('S119963'), 'e-waste: address: ' + ew[0][4]);
  ok(ew[1][4].endsWith('S648886'), 'e-waste: numeric postal code handled: ' + ew[1][4]);
  const out = await T.fetchAll({ fetch: mockFetch(), log: () => { } });
  ok(out.points.length === 4 && out.counts.bin === 2 && out.counts.ewaste === 2 && /data\.gov\.sg/.test(out.source), 'fetchAll combines both datasets');
  const part = await T.fetchAll({ fetch: mockFetch('ewaste.geojson'), log: () => { } });
  ok(part.points.length === 2 && !part.counts.ewaste, 'one dataset failing still returns the other');
  let threw = false; try { await T.fetchAll({ fetch: async () => { throw new Error('offline'); }, log: () => { } }); } catch (e) { threw = true; }
  ok(threw, 'throws when nothing downloads (file left unchanged)');
  const tmp = path.join(os.tmpdir(), 'sk-points-' + process.pid + '.json');
  fs.writeFileSync(tmp, '{"points":[]}');
  try { await T.update({ fetch: async () => { throw new Error('offline'); }, file: tmp, log: () => { } }); } catch (e) { }
  ok(fs.readFileSync(tmp, 'utf8') === '{"points":[]}', 'failed update keeps the old file');
  await T.update({ fetch: mockFetch(), file: tmp, log: () => { } });
  const cur = T.readCurrent(tmp); ok(cur.points.length === 4, 'update writes the file atomically');
  ok(!T.needsRefresh(cur, 30), 'fresh file not refreshed'); ok(T.needsRefresh({ points: [] }), 'empty file refreshed');
  ok(T.needsRefresh(Object.assign({}, cur, { generated: new Date(Date.now() - 40 * 86400000).toISOString() }), 30), 'old file refreshed');
  fs.unlinkSync(tmp);
  // the client accepts the compact format
  const sz = JSON.stringify(bins).length / bins.length;
  ok(sz < 80, 'compact: about ' + Math.round(sz) + ' bytes per blue-bin point');
  console.log(`data-tool: ${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(2); });
