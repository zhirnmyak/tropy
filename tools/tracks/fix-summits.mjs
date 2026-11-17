// Extends selected tracks to the true summit and recomputes the DEM profile.
import fs from 'node:fs';
const T = JSON.parse(fs.readFileSync(new URL('./tracks.json', import.meta.url), 'utf8'));
const hav = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b[0]-a[0])*r, dLo = (b[1]-a[1])*r;
  const h = Math.sin(dLa/2)**2 + Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
const ext = { 'konzhakovsky-kamen': [59.6319025, 59.1346754], 'pik-cherskogo': [51.5156826, 103.6259698] };
for (const [slug, top] of Object.entries(ext)) {
  const t = T[slug]; const last = t.pts[t.pts.length - 1]; const d = hav(last, top); const n = Math.max(1, Math.round(d / 0.1));
  for (let i = 1; i <= n; i++) t.pts.push([+(last[0] + (top[0]-last[0])*i/n).toFixed(5), +(last[1] + (top[1]-last[1])*i/n).toFixed(5)]);
  const cum = [0]; for (let i = 1; i < t.pts.length; i++) cum.push(cum[i-1] + hav(t.pts[i-1], t.pts[i]));
  const total = cum[cum.length-1], N = 100, samples = [];
  for (let k = 0; k < N; k++) { const s = total * k / (N-1); let i = cum.findIndex(c => c >= s); if (i <= 0) i = 1;
    const f = (s - cum[i-1]) / ((cum[i] - cum[i-1]) || 1); const a = t.pts[i-1], b = t.pts[i]; samples.push([s, a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f]); }
  const u = `https://api.open-meteo.com/v1/elevation?latitude=${samples.map(p=>p[1].toFixed(5)).join(',')}&longitude=${samples.map(p=>p[2].toFixed(5)).join(',')}`;
  const ele = (await (await fetch(u)).json()).elevation;
  const sm = ele.map((e, i) => i === 0 || i === ele.length-1 ? e : (ele[i-1] + e + ele[i+1]) / 3);
  sm[sm.length-1] = ele[ele.length-1];
  let up = 0, down = 0, ref = sm[0]; for (const e of sm) { if (e - ref > 3) { up += e - ref; ref = e; } else if (ref - e > 3) { down += ref - e; ref = e; } }
  t.prof = samples.map((s, i) => [+s[0].toFixed(2), Math.round(sm[i])]); t.dist = +total.toFixed(2); t.up = Math.round(up); t.down = Math.round(down);
  t.min = Math.round(Math.min(...sm)); t.max = Math.round(Math.max(...sm));
  console.log(slug, t.dist, t.up, t.min, t.max);
}
fs.writeFileSync(new URL('./tracks.json', import.meta.url), JSON.stringify(T));
