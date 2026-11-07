// 地形あて：山のデータと問題の作り方（ブラウザと qa/run.mjs の両方で使う）
// 問題は「名前と特徴を読んで、地図の4つの ▲ から当てる」。4つは必ずちがう都道府県にし、都道府県の手がかりで1つに決まるようにする。
// 今日の5問・上級は日本時間の日付の種から作り、だれでも同じ。Math.random はここでは使わない（練習・とことんの種は index.html）。
// data.js の並び・ここの作り方を変えると過去の日の問題も変わる。変えた PR に一言書く。
(function (root) {
  "use strict";
  const RAW = root.CHIKEI_DATA || (typeof require === "function" ? (require("./data.js"), root.CHIKEI_DATA) : null);
  const PREFS = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"];
  const REGIONS = ["北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州・沖縄"];
  const regionOf = (pc) => (pc === 0 ? 0 : pc <= 6 ? 1 : pc <= 13 ? 2 : pc <= 22 ? 3 : pc <= 29 ? 4 : pc <= 34 ? 5 : pc <= 38 ? 6 : 7);
  const LV = ["やさしい", "ふつう", "むずかしい"];
  const KIND = ["三角点", "標高点", "測定点"];
  const KIND_SAY = ["三角点（測量の目じるしに置いた石）", "標高点（地形図に高さを書いた点）", "測定点（山頂を測った点）"];
  const M = RAW.map((a) => ({ id: a[0], name: a[1], yomi: a[2], alt: a[3], altY: a[4], peak: a[5], peakY: a[6], e: a[7], kind: a[8], p: a[9], x: a[10], y: a[11], rank: a[12], r: regionOf(a[9][0]) }));
  const BY = {};
  for (const m of M) BY[m.id] = m;
  const IDS = M.map((m) => m.id);

  function seedOf(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffled(arr, R) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // 地図の1は緯度0.01度。km にするとおよそ1.11倍
  const km = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * 1.11;
  const prefStr = (m) => m.p.map((c) => PREFS[c]).join("・");
  const share = (a, b) => a.p.some((c) => b.p.includes(c));

  // 4つの ▲ が地図の上で重ならないか：いちばん近い2つの間が、4つを囲む大きさの12%以上
  function spread(ms) {
    const xs = ms.map((m) => m.x), ys = ms.map((m) => m.y);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 90);
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) if (Math.hypot(ms[i].x - ms[j].x, ms[i].y - ms[j].y) < size * 0.12) return false;
    return true;
  }
  // 問題：tag は「難しさ:索引番号|種」。種が同じなら同じ問題
  function make(tag) {
    const [head] = tag.split("|"), [lvS, idS] = head.split(":"), lv = +lvS, ans = BY[+idS];
    if (!ans || !(lv >= 0 && lv <= 2)) throw new Error("知らない問題: " + tag);
    const R = rng(seedOf(tag));
    const ok = (m, picked) => m.id !== ans.id && m.name !== ans.name && !share(m, ans) && picked.every((q) => !share(q, m) && q.name !== m.name);
    let pick = null;
    if (lv === 0) {
      // やさしい：ほかの3つは別の地方から（地方も都道府県も重ねない）
      const pool = shuffled(M.filter((m) => m.r !== ans.r && km(m, ans) >= 250), R);
      for (let t = 0; t < 40 && !pick; t++) {
        const got = [];
        for (const m of pool.slice(t * 7)) { if (got.length === 3) break; if (ok(m, got) && got.every((q) => q.r !== m.r) && spread([ans, ...got, m])) got.push(m); }
        if (got.length === 3) pick = got;
      }
    } else {
      // ふつう・むずかしい：となりの都道府県の山（近いものから広げる）
      for (const rad of [160, 250, 400, 650, 1000, 3000]) {
        const pool = shuffled(M.filter((m) => { const d = km(m, ans); return d >= 15 && d <= rad; }), R);
        const got = [];
        for (const m of pool) { if (got.length === 3) break; if (ok(m, got) && spread([ans, ...got, m])) got.push(m); }
        if (got.length === 3) { pick = got; break; }
      }
    }
    if (!pick) throw new Error("ほかの3つを選べない: " + tag);
    const opts = shuffled([ans, ...pick].map((m) => m.id), R);
    return { tag, lv, ans: ans.id, opts, labels: lv < 2 };
  }

  // 今日の5問（やさしい2・ふつう2・むずかしい1）は、全部の山を種で並べた順に1日5山ずつ出す（1周するまで同じ山は出さない）。
  // 次の周は、前の周の終わり200山を後ろへ回して、周の変わり目でも同じ山がすぐ戻らないようにする。上級（むずかしい3）は別の並びから、今日の5問と重ねない
  const EPOCH = "2026-11-07";
  const dayIdx = (k) => Math.max(0, Math.round((Date.parse(k) - Date.parse(EPOCH)) / 864e5));
  const CYC = {};
  function cycle(name, c) {
    const key = name + c; if (CYC[key]) return CYC[key];
    let a = shuffled(IDS, rng(seedOf(name + ":" + c)));
    if (c > 0) { const tail = new Set(cycle(name, c - 1).slice(-200)); a = [...a.filter((id) => !tail.has(id)), ...a.filter((id) => tail.has(id))]; }
    return (CYC[key] = a);
  }
  const nth = (name, idx) => cycle(name, Math.floor(idx / IDS.length))[idx % IDS.length];
  const LVS = [0, 0, 1, 1, 2];
  function dayIds(k) { const i = dayIdx(k); return LVS.map((lv, j) => [lv, nth("day", i * 5 + j)]); }
  const dailyTags = (k) => dayIds(k).map(([lv, id]) => `${lv}:${id}|d${k}`);
  function hardTags(k) {
    const used = dayIds(k).map((o) => o[1]), i = dayIdx(k), out = [];
    for (let j = 0; out.length < 3; j++) { const id = nth("hard", i * 3 + j); if (!used.includes(id) && !out.includes(id)) out.push(id); }
    return out.map((id) => `2:${id}|h${k}`);
  }

  // 正解のあとに出す説明（やさしい日本語。一文を短く）
  function facts(id) {
    const m = BY[id], out = [];
    out.push(`${m.e.toLocaleString("ja-JP")}m・${prefStr(m)}（${REGIONS[m.r]}）`);
    if (m.alt) out.push(`別の名前は「${m.alt}」。`);
    if (m.peak) out.push(`いちばん高い峰は${m.peak}（${m.peakY}）。`);
    out.push(`国土地理院の1003山のうち、高さ${m.rank}番目。`);
    out.push(`高さは${KIND_SAY[m.kind]}の値。`);
    return out;
  }
  const API = { M, BY, IDS, PREFS, REGIONS, LV, KIND, KIND_SAY, regionOf, seedOf, rng, shuffled, km, prefStr, make, dailyTags, hardTags, dayIdx, EPOCH, facts, spread };
  if (typeof module === "object" && module.exports) module.exports = API;
  root.CHIKEI = API;
})(typeof window !== "undefined" ? window : globalThis);
