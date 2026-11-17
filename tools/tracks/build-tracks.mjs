// Data pipeline: builds schematic hiking tracks + elevation profiles.
// Geometry: OSRM foot routing (FOSSGIS, OpenStreetMap data) or OSM relation; elevation: Open-Meteo (Copernicus DEM).
const UA = { 'User-Agent': 'TropyBezBarierov/1.0 (education project)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = {
 'korolevsky-bor':      { mode:'relation', id:12010784, loop:true },
 'poozerie-bez-barierov':{ mode:'line', pts:[[55.491684,31.654269],[55.4912,31.65366],[55.49104,31.65237],[55.4906,31.6505],[55.4899,31.6489]] },
 'tiso-samshitovaya-roshcha':{ mode:'route', loop:true, pts:[[43.52457,39.87329],[43.5288,39.87487],[43.53017,39.87671],[43.53118,39.8747],[43.52904,39.87519]] },
 'ekocentr-laura':      { mode:'route', loop:true, pts:[[43.70166,40.26686],[43.69747,40.26623],[43.69656,40.26649],[43.69629,40.26634],[43.6972,40.26646]] },
 'zvenigorod-storozhevskaya-gora':{ mode:'route', loop:true, pts:[[55.7334,36.8508],[55.72818,36.81626],[55.7225,36.82],[55.7275,36.845]] },
 'pereslavl-siniy-kamen':{ mode:'route', pts:[[56.7368,38.8547],[56.7600,38.8450],[56.78224,38.84152],[56.78416,38.82474]] },
 'guamskoe-ushchelie':  { mode:'line', pts:[[44.2273,39.903],[44.2249,39.9044],[44.222,39.9067],[44.2141,39.9143],[44.2125,39.9105],[44.2106,39.907],[44.2085,39.9085],[44.2064,39.9171],[44.2079,39.9195],[44.2051,39.9323]] },
 'molodetsky-kurgan':   { mode:'route', pts:[[53.39452,49.30675],[53.40645,49.31131]] },
 'vottovaara':          { mode:'route', pts:[[63.0545,32.6052],[63.07344,32.62076]] },
 'taganay-otkliknoy-greben':{ mode:'route', pts:[[55.2187,59.7323],[55.2560,59.7750],[55.2966,59.81191]] },
 'zyuratkul-hrebet':    { mode:'route', pts:[[54.92579,59.23072],[54.9553,59.1793]] },
 'badukskie-ozera':     { mode:'route', pts:[[43.396,41.702],[43.37743,41.66555],[43.37692,41.66015],[43.37729,41.6565]] },
 'gamsutl':             { mode:'route', pts:[[42.32108,47.02773],[42.303,46.99672]] },
 'stolby-laletinsky':   { mode:'route', pts:[[55.951967,92.745867],[55.91703,92.74439]] },
 'bbt-listvyanka-bolshie-koty':{ mode:'route', pts:[[51.85693,104.86058],[51.90447,105.07404]] },
 'hibiny-vudyavrchorr': { mode:'route', pts:[[67.64781,33.65929],[67.64497,33.59722]] },
 'pidan':               { mode:'route', pts:[[43.112,132.735],[43.07102,132.69346]] },
 'iremel':              { mode:'route', pts:[[54.603,58.835],[54.52009,58.84266]] },
 'sofiyskie-ozera':     { mode:'route', pts:[[43.51662,41.22753],[43.44957,41.23039]] },
 'ergaki-visyachiy-kamen':{ mode:'route', pts:[[52.852,93.418],[52.83579,93.3452],[52.83443,93.35372]] },
 'pik-cherskogo':       { mode:'route', pts:[[51.65677,103.71929],[51.52952,103.58879],[51.51568,103.62597]] },
 'avachinsky-vulkan':   { mode:'route', pts:[[53.28,158.77139],[53.25559,158.83684]] },
 'konzhakovsky-kamen':  { mode:'route', pts:[[59.5765,59.298],[59.6319,59.13468]] },
 'kucherlinskoe-ozero': { mode:'route', loop:true, pts:[[50.164,86.307],[49.89574,86.41731],[50.03172,86.45069],[49.9053,86.54324]] },
 'manpupuner':          { mode:'line', pts:[[61.56464,60.00956],[61.8,59.8],[62.05,59.45],[62.25949,59.294]] },
};
const toRad = d => d * Math.PI / 180;
const hav = (a, b) => { const R = 6371, dLat = toRad(b[0]-a[0]), dLon = toRad(b[1]-a[1]);
  const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(s)); };
const lineLen = p => p.slice(1).reduce((s, q, i) => s + hav(p[i], q), 0);
function densify(p, stepKm = 0.2) { const out = [p[0]];
  for (let i = 1; i < p.length; i++) { const d = hav(p[i-1], p[i]), n = Math.max(1, Math.ceil(d / stepKm));
    for (let k = 1; k <= n; k++) out.push([p[i-1][0] + (p[i][0]-p[i-1][0])*k/n, p[i-1][1] + (p[i][1]-p[i-1][1])*k/n]); }
  return out; }
function dp(pts, eps) { // Douglas-Peucker in degrees (lat-scaled)
  if (pts.length < 3) return pts; const k = Math.cos(toRad(pts[0][0]));
  const dist = (p, a, b) => { const x=p[1]*k, y=p[0], x1=a[1]*k, y1=a[0], x2=b[1]*k, y2=b[0]; const dx=x2-x1, dy=y2-y1;
    const t = dx||dy ? Math.max(0, Math.min(1, ((x-x1)*dx+(y-y1)*dy)/(dx*dx+dy*dy))) : 0; return Math.hypot(x-(x1+t*dx), y-(y1+t*dy)); };
  let idx = -1, max = 0; for (let i = 1; i < pts.length-1; i++) { const d = dist(pts[i], pts[0], pts[pts.length-1]); if (d > max) { max = d; idx = i; } }
  if (max <= eps) return [pts[0], pts[pts.length-1]];
  return dp(pts.slice(0, idx+1), eps).slice(0, -1).concat(dp(pts.slice(idx), eps)); }
function resample(p, n) { const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i-1] + hav(p[i-1], p[i]));
  const L = cum[cum.length-1], out = []; let j = 0;
  for (let k = 0; k < n; k++) { const t = L * k / (n-1); while (j < cum.length-2 && cum[j+1] < t) j++;
    const seg = cum[j+1]-cum[j] || 1, f = (t-cum[j])/seg; out.push([p[j][0]+(p[j+1][0]-p[j][0])*f, p[j][1]+(p[j+1][1]-p[j][1])*f, t]); }
  return out; }
async function osrm(pts) { const c = pts.map(p => `${p[1]},${p[0]}`).join(';');
  const r = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${c}?overview=full&geometries=geojson`, { headers: UA });
  const j = await r.json(); if (j.code !== 'Ok') throw new Error(j.code); return j.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]); }
async function relation(id) {
  const q = `[out:json][timeout:30];relation(${id});way(r);out geom;`;
  const r = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', headers:{ ...UA, 'Content-Type':'application/x-www-form-urlencoded' }, body:'data='+encodeURIComponent(q) });
  const ways = (await r.json()).elements.map(w => w.geometry.map(g => [g.lat, g.lon]));
  let line = ways.shift(); // greedy stitching by nearest endpoint
  while (ways.length) { let best = 0, rev = false, flip = false, bd = 1e9; const end = line[line.length-1], start = line[0];
    ways.forEach((w, i) => { [[hav(end, w[0]), false, false], [hav(end, w[w.length-1]), true, false], [hav(start, w[w.length-1]), false, true], [hav(start, w[0]), true, true]]
      .forEach(([d, r2, f2]) => { if (d < bd) { bd = d; best = i; rev = r2; flip = f2; } }); });
    let w = ways.splice(best, 1)[0]; if (rev) w = w.slice().reverse(); line = flip ? w.concat(line) : line.concat(w); }
  return line; }
async function elevations(points) { const out = [];
  for (let i = 0; i < points.length; i += 100) { const ch = points.slice(i, i+100);
    const u = `https://api.open-meteo.com/v1/elevation?latitude=${ch.map(p=>p[0].toFixed(5)).join(',')}&longitude=${ch.map(p=>p[1].toFixed(5)).join(',')}`;
    let j; for (let t = 0; t < 6; t++) { try { j = await (await fetch(u, { headers: UA })).json(); if (Array.isArray(j.elevation)) break; } catch {} await sleep(2000 * 2 ** t); }
    if (!Array.isArray(j?.elevation)) throw new Error('elevation failed'); out.push(...j.elevation); await sleep(1200); }
  return out; }
const fs0 = await import('node:fs'); const result = fs0.existsSync('tracks.json') ? JSON.parse(fs0.readFileSync('tracks.json','utf8')) : {};
for (const [slug, def] of Object.entries(R)) {
  if (result[slug] && !process.argv.includes(slug)) continue;
  let line, src = def.mode;
  try {
    if (def.mode === 'relation') line = await relation(def.id);
    else if (def.mode === 'route') { const pts = def.loop ? [...def.pts, def.pts[0]] : def.pts; line = await osrm(pts);
      const direct = lineLen(pts); const got = lineLen(line);
      if (got > direct * 2.6 + 1.5) { console.log(`! ${slug}: routed ${got.toFixed(1)} km vs direct ${direct.toFixed(1)} km -> line`); line = densify(pts, 0.25); src = 'line'; } }
    else line = densify(def.pts, 0.25);
  } catch (e) { console.log(`! ${slug}: ${e.message} -> line`); line = densify(def.loop ? [...def.pts, def.pts[0]] : def.pts, 0.25); src = 'line'; }
  const dist = lineLen(line);
  let eps = 0.00004, simp = dp(line, eps); while (simp.length > 260) { eps *= 1.4; simp = dp(line, eps); }
  const n = Math.max(30, Math.min(100, Math.round(dist / 0.08)));
  const samp = resample(line, n); const raw = await elevations(samp);
  const ele = raw.map((_, i) => { const w = raw.slice(Math.max(0, i-2), i+3); return w.reduce((a, b) => a + b, 0) / w.length; });
  // smoothed ascent/descent with 3 m hysteresis
  let up = 0, down = 0, ref = ele[0]; for (const e of ele) { if (e - ref > 3) { up += e - ref; ref = e; } else if (ref - e > 3) { down += ref - e; ref = e; } }
  result[slug] = { src, dist: +dist.toFixed(2), up: Math.round(up), down: Math.round(down), min: Math.round(Math.min(...ele)), max: Math.round(Math.max(...ele)),
    pts: simp.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]), prof: samp.map((p, i) => [+p[2].toFixed(2), Math.round(ele[i])]) };
  console.log(`${slug.padEnd(32)} ${src.padEnd(8)} ${dist.toFixed(1).padStart(6)} km  pts ${String(simp.length).padStart(3)}  up ${Math.round(up)} down ${Math.round(down)}  ele ${Math.round(Math.min(...ele))}-${Math.round(Math.max(...ele))}`);
  fs0.writeFileSync('tracks.json', JSON.stringify(result)); await sleep(600);
}
const fs = await import('node:fs'); fs.writeFileSync('tracks.json', JSON.stringify(result));
console.log('bytes', JSON.stringify(result).length);
