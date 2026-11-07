// 地形あての検査。山のデータ（1003山・国土地理院の値）・問題の作り方（全部の山×3つの難しさ・ほかの3つは別の都道府県・重ならない）・
// 今日の5問と上級の組み方（3年分）・地図（手がかりの都道府県の名前が出る）・通しで遊ぶ・まちがい・ヒント・続きから・上級・練習・
// とことん・山の手帳・実績・カレンダー・あとから・古いタブ・スマホ幅・PWA・引き継ぎコード・見やすさを確かめる。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkTransfer } from "./transfer-check.mjs";
import { checkSwStall } from "./sw-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) });
const req = createRequire(import.meta.url);
const G = req(path.join(root, "game.js"));
req(path.join(root, "map.js"));
const MAP = globalThis.CHIKEI_MAP;

// ---- 1. 山のデータ・問題の作り方（ブラウザを使わない）----
{
  const csv = readFileSync(path.join(root, "tools", "gsi-1003zan-20260331.csv"), "utf8");
  const csvIds = [...new Set(csv.trim().split(/\r?\n/).slice(1).map((l) => +l.split(",")[1].split("-")[0]))].sort((a, b) => a - b);
  check("山は国土地理院の1003山（同じ索引番号の峰は1つにまとめる）が全部ある：索引番号が元の表と1つずつ同じ", csvIds.length === 1003 && JSON.stringify([...G.IDS].sort((a, b) => a - b)) === JSON.stringify(csvIds), `${G.M.length}山`);
  const dirty = G.M.filter((m) => [m.name, m.yomi, m.alt, m.altY, m.peak, m.peakY].some((t) => /[?？\[\]［］]/.test(t || "")));
  check("山の名前に「?」（Shift_JIS に無かった字）や注記の括弧が残っていない（2026-11-07 CodeRabbit）", dirty.length === 0 && !/\?/.test(csv), dirty.slice(0, 5).map((m) => m.id + m.name).join(","));
  const fuji = G.M.find((m) => m.name === "富士山");
  check("富士山：3776m・山梨県と静岡県・高さ1番目（元の表の値と同じ）", fuji && fuji.e === 3776 && fuji.p.join() === "18,21" && fuji.rank === 1 && /富士山.*3776/.test(csv.replace(/[,"\s]+/g, " ")));
  const bad = G.M.filter((m) => !m.name || !m.yomi || !(m.e > 0 && m.e < 3800) || !m.p.length || m.p.some((c) => !(c >= 0 && c < 47)) || !Number.isFinite(m.x) || !Number.isFinite(m.y) || !(m.kind >= 0 && m.kind <= 2));
  check("どの山にも名前・よみ・高さ・都道府県・場所・高さの種類がある", bad.length === 0, bad.slice(0, 5).map((m) => m.id).join(","));
  const rbad = G.M.filter((a) => a.rank !== 1 + G.M.filter((b) => b.e > a.e).length);
  check("高さの順位は「自分より高い山の数＋1」（同じ高さは同じ順位）", rbad.length === 0, rbad.slice(0, 5).map((m) => m.id).join(","));
  {
    // 元の表を新しい版に替えたとき、出典の版の日付（このゲームについて・README）も同じ版にそろえる（2026-11-07 CodeRabbit）
    const files = readdirSync(path.join(root, "tools")).filter((f) => /^gsi-1003zan-\d{8}\.csv$/.test(f));
    const d = files.length === 1 && files[0].match(/(\d{4})(\d{2})(\d{2})/);
    const ver = d ? `${+d[1]}年${+d[2]}月${+d[3]}日版` : "";
    const html = readFileSync(path.join(root, "index.html"), "utf8"), readme = readFileSync(path.join(root, "README.md"), "utf8");
    const mk = readFileSync(path.join(root, "tools", "make-data.cjs"), "utf8");
    check("元の表は1つだけで、出典の版（このゲームについて・README）と make-data.cjs の読むファイルが同じ版", ver && html.includes(ver) && readme.includes(ver) && mk.includes(files[0]) && !/\d{4}年\d{1,2}月\d{1,2}日版/.test(html.replaceAll(ver, "")), files.join(",") + " " + ver);
  }
  check("都道府県の地図は47（どれにも形と名前の位置がある）", MAP.length === 47 && MAP.every((p) => /^M[\d.\s\-MZ]+Z$/.test(p.d) && p.l.length === 2));
}
{
  const bad = [], seen = new Set(); let n = 0;
  const t0 = Date.now();
  for (const lv of [0, 1, 2]) for (const id of G.IDS) for (const salt of ["qa1", "qa2"]) {
    const tag = `${lv}:${id}|${salt}`; let P;
    try { P = G.make(tag); } catch (e) { bad.push(tag + " " + e.message); continue; }
    n++; const ms = P.opts.map((x) => G.BY[x]), why = [];
    if (P.opts.length !== 4 || new Set(P.opts).size !== 4 || !P.opts.includes(id)) why.push("4つ・答えを含む");
    const prefs = ms.flatMap((m) => m.p);
    if (new Set(prefs).size !== prefs.length) why.push("都道府県が重なる");
    if (new Set(ms.map((m) => m.name)).size !== 4) why.push("同じ名前");
    if (!G.spread(ms)) why.push("▲が近すぎる");
    if (lv === 0 && new Set(ms.map((m) => m.r)).size !== 4) why.push("やさしいなのに地方が重なる");
    if (P.labels !== lv < 2) why.push("名前の出し方");
    if (JSON.stringify(G.make(tag)) !== JSON.stringify(P)) why.push("同じ種で同じにならない");
    if (why.length) bad.push(tag + " " + why.join("・"));
    seen.add(P.opts.slice().sort().join());
  }
  check(`問題：全部の山×3つの難しさ×2（${n}問）で、▲4つ・ほかの3つは別の都道府県・別の名前・地図の上で重ならない・同じ種で同じ問題`, bad.length === 0 && n === G.IDS.length * 6, bad.slice(0, 5).join(" / "));
  check("問題を作るのは速い（6000問で5秒以内）", Date.now() - t0 < 5000, `${Date.now() - t0}ms`);
  // ふつう：となりの都道府県の山（近いところどうし）。やさしいより近い
  let near = 0, far = 0;
  for (const id of G.IDS.slice(0, 300)) {
    const d = (lv) => { const P = G.make(`${lv}:${id}|dist`), a = G.BY[id]; return Math.max(...P.opts.map((x) => G.km(a, G.BY[x]))); };
    near += d(1); far += d(0);
  }
  check("ふつうは近くの山どうし（ほかの3つまでの距離がやさしいより短い）", near < far * 0.6, `ふつう平均${Math.round(near / 300)}km・やさしい平均${Math.round(far / 300)}km`);
}
{
  // 今日の5問・上級の組み方（3年分）
  const bad = [], used = new Set(); let gap = Infinity; const last = {};
  for (let i = 0; i < 365 * 3; i++) {
    const d = new Date(Date.parse(G.EPOCH) + i * 864e5).toISOString().slice(0, 10), dl = G.dailyTags(d), hl = G.hardTags(d);
    const di = dl.map((t) => +t.split("|")[0].split(":")[1]), hi = hl.map((t) => +t.split("|")[0].split(":")[1]);
    if (dl.length !== 5 || new Set(di).size !== 5 || dl.map((t) => t[0]).join() !== "0,0,1,1,2") bad.push(d + " 今日");
    if (hl.length !== 3 || new Set(hi).size !== 3 || hl.some((t) => t[0] !== "2") || hi.some((x) => di.includes(x))) bad.push(d + " 上級");
    if (JSON.stringify(dl) !== JSON.stringify(G.dailyTags(d))) bad.push(d + " 同じにならない");
    for (const t of [...dl, ...hl]) G.make(t);
    for (const x of di) { if (last[x] != null) gap = Math.min(gap, i - last[x]); last[x] = i; used.add(x); }
  }
  check("今日の5問（やさしい2・ふつう2・むずかしい1、同じ山は出さない）と上級（むずかしい3・今日の5問と別）を3年分作れる", bad.length === 0, bad.slice(0, 5).join(","));
  check("3年のうちにほとんどの山が出る・同じ山が今日の5問にすぐ戻らない（30日以上あく）", used.size > G.M.length * 0.9 && gap >= 30, `${used.size}山・いちばん短い間 ${gap}日`);
}
{
  const long = G.IDS.filter((id) => G.facts(id).some((f) => [...f].length > 45));
  check("正解のあとの説明は1行45字以内（やさしい日本語。一文を短く）", long.length === 0, long.slice(0, 5).join(","));
}

// ---- 2. ファイルの中身 ----
const html = readFileSync(path.join(root, "index.html"), "utf8"), game = readFileSync(path.join(root, "game.js"), "utf8");
const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https:\/\/fonts\.googleapis\.com(\/|$)|^https:\/\/ko-fi\.com\/satouaaaaa$|^https:\/\/(www\.gsi\.go\.jp|www\.naturalearthdata\.com)\//.test(u));
check("外から読むのは文字（Google Fonts）だけ。スクリプト・広告・解析を入れない（出典のリンクは押したときに開くだけ）", ext.length === 0 && ![...html.matchAll(/<script[^>]+src="([^"]+)"/g)].some((m) => /^https?:/.test(m[1])), ext.join(","));
check("CSP で通信先を自分だけにしている", /connect-src 'self'/.test(html) && !/connect-src[^;"]*https/.test(html));
check("Math.random は練習・とことんの並びと回の名札だけ（今日の5問・上級は日付の乱数。game.js には無い）", (html.match(/Math\.random/g) || []).length === 2 && !/Math\.random/.test(game.replace(/^\s*\/\/.*$/gm, "")));
check("乱数は sort の比較の中で引かない（ブラウザで引く回数が変わる）", !/\.sort\(\s*\([^)]*\)\s*=>[^\n;]*\b(R|rng|rand|Math\.random)\s*\(/.test(html + game));
check("一行の式の途中にコメント // を足さない（行の残りが消える。rosen-hitofude 2026-11-04）", !/;\s*\/\/[^\n]*;\s*\w/.test(game.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")));
check("画面にお笑いの言葉を入れない（本物っぽく）", !/お笑い|ギャグ|ツッコミ|なんでやねん|（うそ）/.test(html));
check("チケット・回数制限・🔒で開くモードを入れない", !/🎫|🔒|チケット|あと\d+回|すると開く/.test(html));
check("このゲームについて：国土地理院の出典と加工したこと・地図の出どころを書く", /国土地理院「日本の主な山岳標高（1003山）」/.test(html) && /加工して作成/.test(html) && /Natural Earth/.test(html));
check("引き継ぎ：transfer.js をゲームの script より前に、このゲームの記録のキーだけで読む", /<script src="transfer\.js" data-game="chikei-ate" data-keys="chikei-v1"><\/script>\s*<\/head>/.test(html) && html.indexOf('src="transfer.js"') < html.indexOf('src="game.js"') && /data-hk/.test(html) && existsSync(path.join(root, "transfer.js")));
{ const og = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]+)"`)) || [])[1] || "";
  const png = readFileSync(path.join(root, "og.png"));
  check("SNS で貼ると絵と題が出る（OGP・1200×630・絶対URL）", og("og:title") && og("og:description") && og("og:image") === "https://satou-aaaaa.github.io/chikei-ate/og.png" && og("twitter:card") === "summary_large_image" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630); }
{ const fy = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/feedback.yml"), "utf8");
  check("感想フォームの name が3字以上（2字だとフォームが出ない。shared-workflows incidents/2026-11-05-feedback-form-not-shown.md）", [...((fy.match(/^name:\s*(.+)$/m) || [])[1] || "").trim()].length >= 3);
  check("感想フォームは名前・メールを聞かない", /id: fun/.test(fy) && !/id: (name|email|mail)/.test(fy) && /labels: \["感想"\]/.test(fy)); }
check("README の URL のすぐ後ろに全角の字を続けない（Link check が URL の一部と読む）", !/https?:\/\/[\x21-\x7e]*[^\x00-\x7f]/.test(readFileSync(path.join(root, "README.md"), "utf8").replace(/\]\(https?:\/\/[^)\s]+\)/g, "").replace(/<https?:\/\/[^>\s]+>/g, "")));
{ const sw = readFileSync(path.join(root, "sw.js"), "utf8"), mf = JSON.parse(readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  const shell = JSON.parse(sw.match(/SHELL = (\[[^\]]+\])/)[1]);
  check("PWA：sw.js は画面のファイルを全部保存し（引き継ぎの transfer.js も）、外へ何も送らない", ["./index.html", "./data.js", "./map.js", "./game.js", "./transfer.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"].every((f) => shell.includes(f)) && !/https?:\/\//.test(sw.replace(/^\/\/.*$/gm, "")));
  check("PWA：manifest にアイコン2つと名前がある", mf.name === "地形あて" && mf.icons.length >= 2 && mf.start_url === "./");
  check("PWA：maskable は字が切れないよう専用の絵（icon-maskable-512.png、中を縮めた絵）を使う", mf.icons.filter((i) => /maskable/.test(i.purpose || "")).every((i) => i.src === "icon-maskable-512.png") && existsSync(path.join(root, "icon-maskable-512.png"))); }
{ const st = await checkSwStall(readFileSync(path.join(root, "sw.js"), "utf8"));
  check("PWA：通信が途中で止まっても、4秒ほどで保存した画面に切りかえる（ふつうの通信はネットの返事のまま。shared-workflows template/qa/sw-check.mjs）", st.ok, `${st.stalled}/${st.normal}`); }

// ---- 3. ブラウザで遊ぶ ----
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((rq, res) => {
  const p = decodeURIComponent(new URL(rq.url, "http://x").pathname), f = path.join(root, p === "/" ? "index.html" : p);
  if ((f !== root && !f.startsWith(root + path.sep)) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
// 「今日」をずらして遊ぶ（第1回の日から日がたっていなくても、あとから・カレンダーを確かめる）。QA_SHIFT_DAYS で変えられる
const SHIFT = +(process.env.QA_SHIFT_DAYS || 10);
const TODAY = new Date(Date.now() + SHIFT * 864e5 + 9 * 3600e3).toISOString().slice(0, 10);
const dayBefore = (n) => new Date(Date.parse(TODAY) - n * 864e5).toISOString().slice(0, 10);
async function newPage(w = 390, ctx) {
  const c = ctx || await browser.newContext({ viewport: { width: w, height: 800 } });
  if (!ctx) await shift(c);
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  await p.goto(url); await p.waitForTimeout(200);
  return p;
}
const shift = (c) => c.addInitScript((ms) => { const n = Date.now; Date.now = () => n() + ms; }, SHIFT * 864e5);
const closeHow = async (p) => { if (await p.locator("#howto[open]").count()) await p.click("#howto-ok"); };
const ansIdx = (p) => p.evaluate(() => { const c = __ca.cur(); return c.P.opts.indexOf(c.P.ans); });
const wrongIdx = (p) => p.evaluate(() => { const c = __ca.cur(); return c.P.opts.findIndex((o) => o !== c.P.ans && !c.wrong.includes(o) && !document.querySelector(`.ch[data-j="${c.P.opts.indexOf(o)}"]`).disabled); });
const mem = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("chikei-v1") || "{}"));
async function solve(p, { wrong = 0 } = {}) {
  for (let i = 0; i < wrong; i++) await p.click(`.ch[data-j="${await wrongIdx(p)}"]`);
  await p.click(`.ch[data-j="${await ansIdx(p)}"]`);
  await p.waitForSelector(".verdict");
}

try {
  const p = await newPage();
  check("はじめて開くと遊び方が出る", await p.locator("#howto[open]").count() === 1);
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  await p.reload(); await p.waitForTimeout(200);
  check("遊び方を Esc で閉じたあと、開き直しても遊び方が出ない（shared-workflows #186）", await p.locator("#howto[open]").count() === 0 && (await mem(p)).tut === true);
  {
    // Esc のその場（cancel）で残す：Esc の直後に読み直しても出ない（10回）。「わかった」も押したその場で残る（shared-workflows routines/game-dev.md「遊び方」）
    let miss = 0, okNow = 0;
    for (let t = 0; t < 10; t++) {
      const q = await newPage();
      if (t % 2 === 0) { await q.keyboard.press("Escape"); } else { await q.click("#howto-ok"); }
      const tut = await q.evaluate(() => (JSON.parse(localStorage.getItem("chikei-v1") || "{}")).tut === true);
      if (tut) okNow++; else miss++;
      await q.context().close();
    }
    check("遊び方は Esc・「わかった」のその場で「見た」が残る（10回すぐ読み直す）", miss === 0, `${okNow}/10`);
  }
  check("ホームに日本の地図と、今日の5問・とことん・上級・練習・山の手帳のボタン", await p.locator(".hero svg path").count() >= 47 && (await Promise.all(["#go-d", "#go-e", "#go-h", "#go-p", "#go-dex", "#go-cal", "#go-ach"].map(async (q) => (await p.locator(q).count()) === 1 && (await p.locator(q).isVisible()) && (await p.locator(q).isEnabled())))).every(Boolean) && (await p.textContent("#go-d")).includes("今日の5問"));
  {
    await p.setViewportSize({ width: 390, height: 2400 }); // 縦長の画面（PC の縦置きなど）でも見る
    const b = await p.evaluate(() => [...document.querySelectorAll("#app > *")].map((e) => [e.className, Math.round(e.getBoundingClientRect().height)]));
    check("ホームの題は自分の高さだけ（縦長の画面で伸びて大きなすき間を作らない）", b[0][0] === "title" && b[0][1] < 90, JSON.stringify(b[0]));
    await p.setViewportSize({ width: 390, height: 800 });
  }

  // 地図：手がかりの都道府県の名前が出る（やさしい・ふつう）・むずかしいは出ない・▲は地図の中
  {
    const r = await p.evaluate(() => {
      const G = __ca.G, out = { bad: [], n: 0 };
      for (let i = 0; i < 1500; i++) {
        const id = G.IDS[(i * 7) % G.IDS.length], lv = i % 3, P = i === 0 ? { tag: "fuji-wide", lv: 0, ans: 1, opts: [368, 1, 707, 998], labels: true } : G.make(`${lv}:${id}|map${i}`);
        const d = document.createElement("div"); d.style.width = "340px"; d.innerHTML = __ca.mapSvg(P, {}); document.body.appendChild(d);
        const names = [...d.querySelectorAll("text.lb")].map((t) => t.textContent), vb = d.querySelector("svg").getAttribute("viewBox").split(" ").map(Number);
        const want = P.opts.flatMap((x) => G.BY[x].p).map((c) => G.PREFS[c].replace(/[都府県]$/, ""));
        if (lv < 2 && !want.every((w) => names.includes(w))) out.bad.push(P.tag + " 名前が足りない");
        if (lv === 2 && names.length) out.bad.push(P.tag + " むずかしいのに名前");
        if (P.opts.some((x) => { const m = G.BY[x]; return m.x < vb[0] || m.x > vb[0] + vb[2] || m.y < vb[1] || m.y > vb[1] + vb[3]; })) out.bad.push(P.tag + " ▲が地図の外");
        if (d.querySelectorAll(".mk").length !== 4) out.bad.push(P.tag + " ▲の数");
        // 手がかりの名前どうしが重ならない（字の形の高さ＝行の高さの7割で見る。2026-11-07 CodeRabbit：山梨と静岡が重なった）
        const bx = [...d.querySelectorAll("text.lb")].filter((t) => want.includes(t.textContent)).map((t) => { const r = t.getBBox(); return [t.textContent, r.x, r.y + r.height * 0.15, r.x + r.width, r.y + r.height * 0.85]; });
        for (let a = 0; a < bx.length; a++) for (let c = a + 1; c < bx.length; c++) if (bx[a][1] < bx[c][3] && bx[c][1] < bx[a][3] && bx[a][2] < bx[c][4] && bx[c][2] < bx[a][4]) out.bad.push(P.tag + ` ${bx[a][0]}と${bx[c][0]}が重なる`);
        d.remove();
        out.n++;
      }
      return out;
    });
    check(`地図（${r.n}問）：やさしい・ふつうは4つの山の都道府県の名前が必ず出て重ならない・むずかしいは名前なし・▲4つは地図の中`, r.bad.length === 0, r.bad.slice(0, 5).join(" / "));
  }

  // 今日の5問：1問目はまちがえる、2問目はヒント2回、ほかはそのまま
  await p.click("#go-d");
  const tags = await p.evaluate(() => __ca.load().runs.d.list);
  check("今日の5問は日付から決まる（game.js の dailyTags と同じ）", JSON.stringify(tags) === JSON.stringify(G.dailyTags(TODAY)));
  check("問題の画面：山の名前・高さ・都道府県と、地図の▲4つ・大きなボタン4つ", await p.locator(".qcard .nm").count() === 1 && (await p.textContent(".qcard .chips")).includes("m") && await p.locator("#map .mk").count() === 4 && await p.locator(".ch").count() === 4 && (await p.$$eval(".ch", (b) => b.map((x) => x.getBoundingClientRect().height))).every((h) => h >= 56));
  {
    const lab = await p.$$eval(".ch", (b) => b.map((x) => x.getAttribute("aria-label"))), P0 = await p.evaluate(() => __ca.cur().P);
    check("ボタンには地図のどこかを言う名前がある（山の名前＝答えは言わない。名前を出す難しさでは都道府県も言う）", lab.every((t, j) => { const m = G.BY[P0.opts[j]]; return /^▲\d（地図の/.test(t) && !t.includes(m.name) && t.includes(G.prefStr(m)) === !!P0.labels; }), lab.join(" / "));
    const say = await p.$$eval("[data-a11y-say]", (e) => e.map((x) => x.getAttribute("aria-label") || x.textContent).join(" "));
    check("「読む」で山の名前・高さ・都道府県を読む", say.includes(P0 && G.BY[P0.ans].name) && /高さ [\d,]+メートル/.test(say) && say.includes(G.prefStr(G.BY[P0.ans])));
  }
  const wj = await wrongIdx(p);
  await p.click(`.ch[data-j="${wj}"]`);
  const wname = await p.evaluate((j) => __ca.G.BY[__ca.cur().P.opts[j]].name, wj);
  check("まちがえると ✕ と「ちがう」の文字・その▲がどの山かを教える・知らせは role=status", await p.locator(".ch.ng").count() === 1 && (await p.textContent(".ch.ng")).includes("ちがう") && (await p.textContent("#msg")).includes(wname) && await p.getAttribute("#msg", "role") === "status" && (await p.textContent("#map")).includes("✕ " + wname));
  await p.reload(); await p.waitForTimeout(150); await p.click("#go-d");
  check("途中で閉じても続きから（同じ問題・まちがえた印のまま）", await p.locator(".ch.ng").count() === 1 && await p.evaluate(() => __ca.cur().i) === 0);
  // 地図の▲を押しても答えられる
  const aj = await ansIdx(p);
  await p.click(`#map .mk[data-j="${aj}"] .tri`, { force: true });
  await p.waitForSelector(".verdict");
  check("地図の▲を押しても答えられる。正解は ✓・説明・★2（まちがい1回）", await p.locator(".ch.ok").count() === 1 && (await p.textContent(".verdict")).includes("1003山のうち") && (await p.getAttribute(".verdict .stars", "aria-label")) === "星2つ");
  check("正解したらヒントのボタンは隠れる", await p.locator("#hint").isHidden());
  check("正解の知らせは .verdict（role=status）に「✓ 正解」と山の名前", (await p.getAttribute(".verdict", "role")) === "status" && /✓ 正解/.test(await p.textContent(".verdict .hd")) && (await p.textContent(".verdict .mn")).length > 0);
  await p.click("#next");
  await p.click("#hint");
  const hp = await p.evaluate(() => __ca.G.BY[__ca.cur().P.ans].p.length);
  check("ヒント1はその山の都道府県をぬる（▲は消さない）", await p.locator("#map .pf.hl").count() === hp && await p.locator(".ch.gone").count() === 0 && (await p.textContent("#hintbox")).includes("ぬりました"));
  await p.click("#hint");
  check("ヒント2はちがう▲を消して2つにしぼる・ヒントは2回まで", await p.locator(".ch.gone").count() === 2 && await p.locator("#hint:disabled").count() === 1);
  await solve(p);
  check("ヒント2回は★1", (await p.getAttribute(".verdict .stars", "aria-label")) === "星1つ");
  await p.click("#next");
  for (let i = 2; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  const s1 = await mem(p);
  check("5問で結果：今日の記録に1問ごとのまちがい＋ヒント（1・2・0・0・0）", JSON.stringify(s1.days[TODAY]?.m) === "[1,2,0,0,0]");
  const share = await p.textContent(".share");
  const names = G.dailyTags(TODAY).map((t) => G.BY[G.make(t).ans].name);
  check("シェアの文に山の名前（答え）を出さない（印だけ）", /第\d+回/.test(share) && /🟢/.test(share) && names.every((n) => !share.includes(n)), share);
  check("まちがいのある日は Ko-fi の一言を出さない", await p.locator(".kofi").count() === 0);
  check("結果に「あと少しの実績」と、続けて遊ぶ・上級のボタン・山ごとの名前と高さ", await p.locator("#achnext").count() === 1 && await p.locator("#go-e").count() === 1 && await p.locator("#go-h").count() === 1 && await p.locator(".rlist > div").count() === 5);
  check("山の手帳に当てた山が載る", Object.keys(s1.dex).length === 5);
  await p.click("#back");
  check("今日を終えたら、ホームは「今日の結果を見る」・地図に当てた山の▲", (await p.textContent("#go-d")).includes("結果") && await p.locator(".hero svg > path").count() >= 1);
  // 上級：ヒントなし・3問・名前なし
  await p.click("#go-h");
  check("上級はヒントのボタンが無い・3問・都道府県の名前が出ない", await p.locator("#hint").count() === 0 && (await p.evaluate(() => __ca.load().runs.h.list.length)) === 3 && await p.locator("#map text.lb").count() === 0);
  for (let i = 0; i < 3; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  check("上級の記録は hdays に入る", (await mem(p)).hdays[TODAY]?.m.length === 3);
  // 練習：記録を増やさない
  await p.click("#back"); await p.click("#go-p"); await p.click('[data-t="1"]');
  const before = await mem(p);
  for (let i = 0; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  const after = await mem(p);
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  check("練習は今日の記録を増やさない（山の手帳の数はふえる）・まだ当てていない山が先に出る", JSON.stringify(after.days) === JSON.stringify(before.days) && sum(after.dex) === sum(before.dex) + 5 && Object.keys(after.dex).length === Object.keys(before.dex).length + 5);
  // 山の手帳から地方を選んで練習
  await p.click("#back"); await p.click("#go-dex");
  check("山の手帳は8つの地方ごと", await p.locator(".regs button").count() === 8);
  await p.click('.regs button[data-r="3"]');
  check("地方を押すと当てた山の一覧", await p.locator("#go-rp").count() === 1);
  await p.click("#go-rp"); await p.click('[data-t="0"]');
  check("地方の練習はその地方の山だけ", (await p.evaluate(() => __ca.load().runs.p.list)).every((t) => G.BY[+t.split("|")[0].split(":")[1]].r === 3));
  // とことん：まちがえても終わらない・「ここで降りる」で終わる
  await p.click("#back"); await p.click("#go-e");
  const el = await p.evaluate(() => __ca.load().runs.e.list);
  check("とことんは全部の山を1回ずつ、やさしい5→ふつう10→むずかしいの順", el.length === G.M.length && new Set(el.map((t) => t.split("|")[0].split(":")[1])).size === G.M.length && el.slice(0, 5).every((t) => t[0] === "0") && el.slice(5, 15).every((t) => t[0] === "1") && el.slice(15).every((t) => t[0] === "2"));
  await solve(p); await p.click("#next");
  await solve(p, { wrong: 3 }); await p.click("#next");
  check("とことんはまちがえても終わらない（いのちの数は無い）", await p.locator(".ch").count() === 4 && await p.evaluate(() => __ca.load().runs.e.res.length) === 2);
  await solve(p); await p.click("#next");
  await p.reload(); await p.waitForTimeout(150);
  check("とことんは開き直すと続きから", (await p.textContent("#go-e")).includes("続きから"));
  await p.click("#go-e"); await p.click("#quit"); await p.waitForTimeout(150);
  check("「ここで降りる」で終わり、自己ベスト（3山）とまちがい・ヒントの数が出る", (await mem(p)).ebest === 3 && (await p.textContent("#eres")).includes("3山") && (await p.textContent("#ebest")).includes("3回"));
  {
    // 引き継ぎコードなどで数の所に文字が入っても、画面に HTML として出さない
    const q = await newPage(); await closeHow(q);
    await q.evaluate(() => { const s = JSON.parse(localStorage.getItem("chikei-v1")) || { v: 1 }; s.ebest = '<img id="xss" src=x>'; s.dex = { 368: '"><b id="xss2">', bad: 3 }; s.runs = { e: { mode: "e", id: "x", date: "2026-11-08", list: ["0:368|e1:0"], res: [], miss: '"><i id="xss3">' }, h: { list: "bad", res: [] }, p: { mode: "p", id: "y", date: "2026-11-08", list: ["0:99999|p"], res: [] }, d: { mode: "d", id: "z", date: "x", list: ["0:368|d"], res: [] }, a1: { mode: "a", id: "a1", date: "2026-11-08", list: ["0:368|d"], res: [null] }, x: { mode: "x", id: "x1", date: "2026-11-08", list: ["0:368|d"], res: [{ m: 0 }] }, h2: { mode: "d", id: "h2", date: "2026-11-08", list: ["0:368|d"], res: [] }, "a:2026-11-08": { mode: "a", id: "a3", date: "2026-11-08", list: ["0:368|d", "1:368|d"], res: [{ m: 0 }], cur: { i: 1, tag: "1:368|d", wrong: "x", hints: 0 } } }; s.days = { "2026-11-08": { m: "x" }, bad: { m: [0] }, "2026-02-30": { m: [0] }, "2026-11-09": { m: [] }, "2026-11-10": { m: [0, 0, 0] } }; s.hdays = { "2026-11-09": { m: [0, 1, 0] }, "2026-11-10": { m: [0, 0, 0, 0, 0] } }; localStorage.setItem("chikei-v1", JSON.stringify(s)); });
    await q.reload(); await q.waitForTimeout(250);
    const st = await q.evaluate(() => __ca.load());
    check("記録の形を直す：数の所の文字は0に・知らない山と形のちがう途中経過・置き場とモードの合わない途中経過・問題の数と合わない日ごとの記録は捨てる", st.ebest === 0 && st.dex[368] === 0 && !("bad" in st.dex) && !("h" in st.runs) && !("p" in st.runs) && !("d" in st.runs) && !("a1" in st.runs) && !("x" in st.runs) && !("h2" in st.runs) && st.runs["a:2026-11-08"] && st.runs["a:2026-11-08"].cur === null && Object.keys(st.days).length === 0 && JSON.stringify(Object.keys(st.hdays)) === '["2026-11-09"]');
    await q.click("#go-e").catch(() => {}); await q.waitForTimeout(150); await q.click("#quit").catch(() => {}); await q.waitForTimeout(150);
    check("記録の文字を HTML として出さない", await q.locator("#xss, #xss2, #xss3").count() === 0);
    await q.context().close();
  }
  {
    // 練習で50山目を当て、結果を見ずに戻って練習をやり直しても、次の結果で「50山」を知らせる（2026-11-07 CodeRabbit）
    const q = await newPage(); await closeHow(q);
    await q.evaluate((ids) => { const s = JSON.parse(localStorage.getItem("chikei-v1")) || { v: 1 }; s.dex = {}; for (const id of ids) s.dex[id] = 1; s.ach = {}; localStorage.setItem("chikei-v1", JSON.stringify(s)); }, G.IDS.slice(0, 50));
    await q.reload(); await q.waitForTimeout(150); await closeHow(q);
    await q.click("#go-p"); await q.click('[data-t="0"]');
    for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
    await q.waitForTimeout(150);
    check("前の回で取って知らせていない実績も、次の結果で知らせる（知らせたら二度は出さない）", (await q.textContent("#achnew").catch(() => "")).includes("50山") && (await mem(q)).ach.f50 === 1);
    await q.click("#back").catch(() => {}); await q.click("#go-p"); await q.click('[data-t="0"]');
    for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
    await q.waitForTimeout(150);
    check("知らせ終えた実績は次の結果に出さない", !(await q.textContent("#achnew").catch(() => "")).includes("50山"));
    await q.context().close();
  }
  // 実績・このゲームについて
  await p.click("#back"); await p.click("#go-ach");
  check("実績は14個で、腕前・集める・続けるの3つの組", await p.locator(".ach").count() === 14 && await p.locator(".agrp").count() === 3 && await p.locator(".ach.got").count() >= 2);
  check("達成した実績は ✓ の文字も付く（色だけで分けない）", (await p.textContent(".ach.got b")).startsWith("✓"));
  await p.click("#back"); await p.click("#f-about");
  check("このゲームについて：データの出典（国土地理院・Natural Earth）", (await p.textContent("#about")).includes("国土地理院") && await p.locator("#about a").count() >= 2);
  await p.context().close();

  // まちがいなしの日は Ko-fi を1回だけ
  {
    const q = await newPage(); await closeHow(q); await q.click("#go-d");
    for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
    await q.waitForTimeout(150);
    check("全部まちがいなしで初めて終えたときだけ Ko-fi の一言", await q.locator(".kofi").count() === 1 && (await q.textContent(".big")).includes("まちがいなし"));
    await q.click("#back"); await q.click("#go-d");
    check("結果をもう一度見ても Ko-fi は出さない", await q.locator(".kofi").count() === 0);
    await q.context().close();
  }

  // カレンダー・あとから：過去の日の記録を置いて見る
  {
    const q = await newPage();
    await q.evaluate(([d2, d3]) => { localStorage.setItem("chikei-v1", JSON.stringify({ v: 1, tut: true, days: { [d2]: { m: [0, 0, 0, 0, 0] }, [d3]: { m: [1, 0, 0, 2, 0] } }, hdays: {}, adays: {}, dex: {}, runs: {}, kofi: {}, ach: {}, ebest: 0 })); }, [dayBefore(2), dayBefore(3)]);
    await q.reload(); await q.waitForTimeout(150);
    check("ホームの「続けて」は、きのうを休んだら — （休んだ日を責めない）", (await q.textContent(".stats")).includes("—"));
    await q.click("#go-cal");
    const lateList = await q.evaluate(() => __ca.lateDays(__ca.load()));
    const exp = [1, 4, 5, 6, 7].map(dayBefore).filter((d) => d >= G.EPOCH);
    check("カレンダー：取りこぼした過去7日（第1回から）を押せる", JSON.stringify(lateList) === JSON.stringify(exp) && lateList.length > 0, lateList.join(","));
    if (lateList.length) {
      const d = lateList[0];
      if (!(await q.locator(`.cal .miss[data-k="${d}"]`).count())) await q.click("#prev");
      await q.click(`.cal .miss[data-k="${d}"]`);
      check("あとから：その日の今日の5問と同じ問題", JSON.stringify(await q.evaluate((d) => __ca.load().runs["a:" + d].list, d)) === JSON.stringify(G.dailyTags(d)));
      for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
      await q.waitForTimeout(150);
      const s = await mem(q);
      check("あとからは adays に入り、今日の記録・続けた日・シェア・Ko-fi には数えない", s.adays[d] && !s.days[d] && (await q.locator(".share").count()) === 0 && (await q.locator(".kofi").count()) === 0);
      await q.click("#go-cal");
      check("カレンダーに ↺ で残る", await q.locator(`.cal .c.late[data-k="${d}"]`).count() === 1);
    }
    await q.context().close();
  }

  // 古いタブ：同じ問題を2つのタブで開き、片方で答えたら、もう片方は二重に入れない
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }); await shift(ctx);
    const a = await newPage(390, ctx); await closeHow(a); await a.click("#go-d");
    const b = await ctx.newPage(); b.on("pageerror", (e) => errors.push(e.message)); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    await solve(a);
    await b.click(`.ch[data-j="${await ansIdx(b)}"]`);
    await b.waitForTimeout(200);
    const s = await mem(a);
    check("古いタブで同じ問題に答えても二重に数えない", s.runs.d.res.length === 1 && Object.values(s.dex).reduce((x, y) => x + y) === 1);
    await a.click("#next"); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    await a.click("#hint"); await a.click("#hint");
    await b.click("#hint");
    check("別のタブで使ったヒントの数を減らさない", (await mem(a)).runs.d.cur.hints === 2);
    // 別のタブでヒントを使ったあと、こちらのタブですぐ正解しても、そのヒントを数える（2026-11-07 CodeRabbit）
    await b.click(`.ch[data-j="${await ansIdx(b)}"]`); await b.waitForTimeout(150);
    check("別のタブで使ったヒントは、こちらで正解しても★に数える", (await mem(a)).runs.d.res[1]?.m === 2 && (await b.getAttribute(".verdict .stars", "aria-label")) === "星1つ");
    await ctx.close();
  }

  // スマホ幅でもはみ出さない・押す所は44px以上
  {
    const bad = [], small = [];
    for (const w of [320, 390]) {
      const q = await newPage(w); await closeHow(q);
      for (const go of [null, "#go-d", "wrong", "solve", "#go-cal", "#go-dex", "#go-ach", "#go-e", "#go-p"]) {
        if (go === "solve") await solve(q);
        else if (go === "wrong") { await q.click(`.ch[data-j="${await wrongIdx(q)}"]`); await q.click("#hint"); }
        else if (go) { await q.goto(url); await q.waitForTimeout(100); await q.click(go); }
        await q.waitForTimeout(100);
        const ov = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (ov > 0) bad.push(`${w}px ${go || "ホーム"} ${ov}px`);
        small.push(...(await q.$$eval("button:not([disabled]), a[href]", (bs) => bs.filter((b) => b.checkVisibility() && !b.closest(".cal")).filter((b) => b.getBoundingClientRect().height < 44).map((b) => (b.id || b.className || b.textContent).slice(0, 20)))).map((x) => `${w}/${go}:${x}`));
      }
      await q.context().close();
    }
    check("幅320pxでも横にはみ出さない", bad.length === 0, bad.join(" / "));
    check("押せる所は高さ44px以上", small.length === 0, [...new Set(small)].slice(0, 8).join(","));
  }
  // 見やすさの設定を全部入れても、ページの一番下まで動ける
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } }); await shift(ctx);
    await ctx.addInitScript(() => localStorage.setItem("a11y-v1", JSON.stringify({ read: true, cvd: true, calm: true, say: true, ruby: true })));
    const q = await newPage(390, ctx); await closeHow(q);
    const r = await q.evaluate(() => { window.scrollTo(0, 1e5); const f = document.querySelector("footer").getBoundingClientRect(); return [scrollY, Math.round(f.bottom), innerHeight, getComputedStyle(document.documentElement).position]; });
    check("見やすさの設定を全部入れても、いちばん下まで動ける（html が固定されない）", r[0] > 0 && r[1] <= r[2] && r[3] === "static", r.join(","));
    await q.click("#go-d"); await q.click("#hint");
    check("色の見分けを助ける設定では、ぬった都道府県に斜線も重ねる", await q.evaluate(() => getComputedStyle(document.querySelector("#map .pf.hl")).fill.includes("url")));
    await ctx.close();
  }
  // キーボードだけで遊べる（Tab と Enter）
  {
    const q = await newPage(); await closeHow(q);
    await q.focus("#go-d"); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    const j = await ansIdx(q), seen = [];
    for (let t = 0; t < 40 && !seen.includes(String(j)); t++) { await q.keyboard.press("Tab"); const d = await q.evaluate(() => document.activeElement && document.activeElement.classList.contains("ch") ? document.activeElement.dataset.j : null); if (d != null && !seen.includes(d)) seen.push(d); }
    for (let t = 0; t < 40 && seen.length < 4; t++) { await q.keyboard.press("Tab"); const d = await q.evaluate(() => document.activeElement && document.activeElement.classList.contains("ch") ? document.activeElement.dataset.j : null); if (d != null && !seen.includes(d)) seen.push(d); }
    check("Tab で4つのボタン全部に届く", seen.length === 4, seen.join(","));
    for (let t = 0; t < 40 && (await q.evaluate(() => document.activeElement && document.activeElement.dataset.j)) !== String(j); t++) await q.keyboard.press("Tab");
    await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    check("キーボードだけ（Tab と Enter）で選んで答えられる", await q.locator(".verdict").count() === 1);
    await q.context().close();
  }
} catch (e) { check("ブラウザでの検査が最後まで動く", false, e.stack.split("\n").slice(0, 3).join(" ")); }

// 引き継ぎコード（shared-workflows template/qa/transfer-check.mjs）
try {
  const sample = { "chikei-v1": JSON.stringify({ v: 1, tut: true, days: { "2026-11-07": { m: [0, 1, 0, 0, 2] } }, hdays: {}, adays: {}, dex: { 368: 1, 1: 1 }, runs: {}, kofi: {}, ach: {}, ebest: 7, t: 1 }) };
  await checkTransfer({ browser, url, game: "chikei-ate", sample, check, open: async (pg) => { if (await pg.locator("#howto[open]").count()) await pg.click("#howto-ok"); } });
} catch (e) { check("引き継ぎの検査が最後まで動く", false, e.message.split("\n")[0]); }
await browser.close();
server.close();
check("画面のエラーが無い", errors.length === 0, errors.slice(0, 3).join(" | "));

{ // 見やすさ・読みやすさ・偏り（shared-workflows template/qa/a11y.mjs の写し）
  const { spawnSync } = await import("node:child_process");
  const a = spawnSync(process.execPath, [path.join(root, "qa", "a11y.mjs")], { encoding: "utf8", env: process.env });
  check("見やすさ・読みやすさの検査（qa/a11y.mjs。中身は qa-report/a11y.md）", a.status === 0, (a.stdout.match(/^- ❌.*$/gm) || []).join(" / ") || (a.status ? a.stderr.slice(-300) : ""));
}

const ng = results.filter((r) => !r.ok);
const md = `# 地形あて QA\n\n${results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`).join("\n")}\n\n${ng.length ? `❌ ${ng.length}件` : `✅ ${results.length}項目すべて通過`}\n`;
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report/report.md"), md);
console.log(md);
process.exit(ng.length ? 1 : 0);
