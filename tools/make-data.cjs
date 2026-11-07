// 山のデータを作る：node tools/make-data.cjs
// 元は国土地理院「日本の主な山岳標高（1003山）」2026年3月31日版の CSV（tools/gsi-1003zan-20260331.csv。Shift_JIS を UTF-8 に直したもの。Shift_JIS に無く「?」になった4字（薬萊山・屛風岳・朳差岳・屛風山）は同じ版の PDF 一覧で確かめて直した）。
// https://www.gsi.go.jp/kihonjohochousa/kihonjohochousa41139.html
// 同じ索引番号の峰（14-1・14-2 など）は1つの山にまとめ、いちばん高い峰の高さと位置を使う。
// 出すのは data.js（window.CHIKEI_DATA）。手で直さない。山の並び（索引番号の順）を変えると過去の日の問題が変わる。
"use strict";
const fs = require("fs");
const P = require("./proj.cjs");
const rows = fs.readFileSync(__dirname + "/gsi-1003zan-20260331.csv", "utf8").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
// 「山名（別称）＜山頂名＞」をばらす。［］は地理院地図に出ない名前の印なので外す
function parse(nm) {
  nm = nm.replace(/[［］\[\]]/g, "");
  const peak = (nm.match(/＜(.+?)＞/) || [])[1] || "";
  const base = nm.replace(/＜.+?＞/, "");
  const alt = (base.match(/（(.+?)）/) || [])[1] || "";
  return { name: base.replace(/（.+?）/, "").trim(), alt, peak };
}
const groups = new Map();
for (const r of rows) {
  if (r.length !== 9) throw new Error("列の数がちがう: " + r.join(","));
  const [, idx, nm, yomi, elev, kind, prefs, lat, lon] = r;
  const id = +idx.split("-")[0];
  const n = parse(nm), y = parse(yomi);
  const pcs = prefs.trim().split(/\s+/).map((p) => { const c = P.PREFS.indexOf(p); if (c < 0) throw new Error("知らない都道府県: " + p); return c; });
  const e = +elev; if (!(e > 0 && e < 4000)) throw new Error("高さがおかしい: " + r.join(","));
  // Shift_JIS に無い字は「?」に、注記の括弧は名前に残りやすい。残っていたら止める（2026-11-07 CodeRabbit が見つけた）
  for (const t of [n.name, n.alt, n.peak, y.name, y.alt, y.peak]) if (/[?？\[\]［］]/.test(t)) throw new Error("名前に ? か括弧が残っている: " + r.join(","));
  const m = { id, name: n.name, yomi: y.name, alt: n.alt, altY: y.alt, peak: n.peak, peakY: y.peak, e, kind, p: pcs, lat: +lat, lon: +lon };
  const g = groups.get(id);
  if (!g) groups.set(id, { ...m, peaks: m.peak ? 1 : 0 });
  else { g.peaks++; if (m.e > g.e) Object.assign(g, { e: m.e, kind: m.kind, peak: m.peak, peakY: m.peakY, lat: m.lat, lon: m.lon, p: m.p }); for (const c of pcs) if (!g.p.includes(c)) g.p.push(c); }
}
const M = [...groups.values()].sort((a, b) => a.id - b.id);
if (M.length !== 1003) throw new Error("山の数が1003でない: " + M.length);
// 高さの順位（同じ高さは同じ順位）
const sorted = M.map((m) => m.e).sort((a, b) => b - a);
const KIND = ["三角点", "標高点", "測定点"];
const out = M.map((m) => {
  const [x, y] = P.xy(m.lat, m.lon), k = KIND.indexOf(m.kind);
  if (k < 0) throw new Error("知らない種別: " + m.kind);
  return [m.id, m.name, m.yomi, m.alt, m.altY, m.peaks > 1 ? m.peak : "", m.peaks > 1 ? m.peakY : "", m.e, k, m.p, Math.round(x * 10) / 10, Math.round(y * 10) / 10, sorted.indexOf(m.e) + 1];
});
fs.writeFileSync("data.js", `// tools/make-data.cjs で作る（手で直さない）。出典：国土地理院「日本の主な山岳標高（1003山）」2026年3月31日版を加工\n// [索引番号, 山名, よみ, 別称, 別称のよみ, 峰の名前, 峰のよみ, 標高m, 種別(0三角点・1標高点・2測定点), 都道府県の番号, x, y, 高さの順位]\n(typeof window !== "undefined" ? window : globalThis).CHIKEI_DATA=${JSON.stringify(out)};\n`);
console.log("data.js", fs.statSync("data.js").size, "bytes", out.length, "山");
