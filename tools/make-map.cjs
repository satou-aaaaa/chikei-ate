// 地図（都道府県の形）を作る：node tools/make-map.cjs <ne_10m_admin_1_states_provinces.geojson>
// 元は Natural Earth（public domain）の 1:10m 都道府県界。
// https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
// 出すのは map.js（window.CHIKEI_MAP）。手で直さない。
"use strict";
const fs = require("fs");
const P = require("./proj.cjs");
const src = process.argv[2];
if (!src) { console.error("使い方: node tools/make-map.cjs <ne_10m_admin_1_states_provinces.geojson>"); process.exit(1); }
const d = JSON.parse(fs.readFileSync(src, "utf8"));
const TOL = 0.45, MINAREA = 0.02; // 単位は地図の1（緯度0.01度）。小さすぎる島は省く
// 閉じた輪は始まりと終わりが同じ点なので、いちばん遠い点で2つに分けてから縮める
function dpRing(r, tol) {
  const pts = r.slice(0, -1); let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) { const dd = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (dd > fd) { fd = dd; far = i; } }
  const a = dp(pts.slice(0, far + 1), tol), b = dp([...pts.slice(far), pts[0]], tol);
  return [...a, ...b.slice(1, -1)];
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let mx = -1, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const dd = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L; if (dd > mx) { mx = dd; mi = i; } }
    if (mx > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; s += x1 * y2 - x2 * y1; } return Math.abs(s / 2); };
const out = {};
for (const f of d.features) {
  const p = f.properties; if (p.adm0_a3 !== "JPN") continue;
  const name = p.name_ja, code = P.PREFS.indexOf(name);
  if (code < 0) throw new Error("知らない都道府県: " + name);
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  for (const poly of polys) {
    const outer = poly[0].map(([lon, lat]) => P.xy(lat, lon));
    if (area(outer) < MINAREA) continue;
    const r = dpRing(outer, TOL); if (r.length < 3) continue;
    rings.push(r.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]));
  }
  const [lx, ly] = P.xy(p.latitude, p.longitude);
  out[code] = { d: rings.map((r) => "M" + r.map(([x, y]) => `${x} ${y}`).join(" ") + "Z").join(""), l: [Math.round(lx * 10) / 10, Math.round(ly * 10) / 10] };
}
const arr = P.PREFS.map((n, i) => { if (!out[i]) throw new Error("形が無い: " + n); return out[i]; });
fs.writeFileSync("map.js", `// tools/make-map.cjs で作る（手で直さない）。都道府県の形：Natural Earth 1:10m（public domain）\n(typeof window !== "undefined" ? window : globalThis).CHIKEI_MAP=${JSON.stringify(arr)};\n`);
console.log("map.js", fs.statSync("map.js").size, "bytes");
