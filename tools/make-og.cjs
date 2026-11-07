// SNS で貼られたときの絵（og.png 1200×630）を作る。今日の問題（答え）は入れず、日本の地図と ▲1〜▲4 の見本だけ。
// 使い方: node tools/make-og.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
require(path.join(__dirname, "..", "map.js"));
const MAP = globalThis.CHIKEI_MAP;
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  const tri = (x, y, n) => `<path d="M${x} ${y - 34}L${x + 30} ${y + 20}L${x - 30} ${y + 20}Z" fill="#7a3f12" stroke="#fff" stroke-width="6" stroke-linejoin="round"/><text x="${x}" y="${y + 10}" font-size="34" font-weight="900" fill="#fff" text-anchor="middle">${n}</text>`;
  await p.setContent(`<body style="margin:0;font-family:'Noto Sans CJK JP','IPAPGothic',sans-serif">
  <div style="position:relative;width:1200px;height:630px;background:#f1ead8;color:#1f2a24;overflow:hidden">
    <svg style="position:absolute;right:0;top:0" width="580" height="630" preserveAspectRatio="xMidYMid slice" viewBox="540 20 1480 1620"><rect x="540" y="20" width="1480" height="1620" fill="#cfe2ea"/>${MAP.map((m) => `<path d="${m.d}" fill="#f7f1e1" stroke="#8d826a" stroke-width="3"/>`).join("")}
      ${tri(1353, 1063, 1)}${tri(899, 1223, 2)}${tri(1687, 233, 3)}${tri(688, 1566, 4)}</svg>
    <div style="position:absolute;left:80px;top:90px;width:520px">
      <div style="font-size:32px;color:#7a3f12;letter-spacing:.08em">国土地理院の1003山から</div>
      <div style="font-size:120px;font-weight:900;letter-spacing:.12em;margin-top:8px">地形<span style="color:#7a3f12">あて</span></div>
      <div style="font-size:40px;margin-top:14px;line-height:1.5">この山はどの▲？<br>名前と高さで当てる1日5問</div>
    </div>
  </div></body>`);
  await p.screenshot({ path: path.join(__dirname, "..", "og.png") });
  await b.close();
})();
