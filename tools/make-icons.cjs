// アプリのアイコン（icon-192.png・icon-512.png と、切り抜かれても字が欠けない icon-maskable-512.png）を作る。生成りの紙に、等高線の山と ▲。
// maskable は中央の円（直径の80%）の中に全部が入るよう、絵を0.78倍に縮める（https://web.dev/articles/maskable-icon）
// 使い方: node tools/make-icons.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const [s, name, k] of [[192, "icon-192.png", 1], [512, "icon-512.png", 1], [512, "icon-maskable-512.png", 0.78]]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<body style="margin:0"><svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" fill="#cfe2ea"/>
      <path d="M0 ${k < 1 ? 72 : 78} Q25 ${k < 1 ? 64 : 70} 50 ${k < 1 ? 68 : 74} T100 ${k < 1 ? 64 : 70} V100 H0Z" fill="#f7f1e1"/><g transform="translate(50 50) scale(${k}) translate(-50 -50)">
      <g fill="none" stroke="#8d826a" stroke-width="1.6"><ellipse cx="50" cy="62" rx="40" ry="20"/><ellipse cx="50" cy="58" rx="28" ry="14"/><ellipse cx="50" cy="54" rx="16" ry="8"/></g>
      <path d="M50 22 L74 64 L26 64 Z" fill="#7a3f12" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
      <text x="50" y="56" font-size="18" text-anchor="middle" fill="#fff" font-family="sans-serif" font-weight="900">?</text>
      <text x="50" y="90" font-size="14" text-anchor="middle" fill="#1f2a24" font-family="'Noto Sans CJK JP',sans-serif" font-weight="900">地形</text></g></svg></body>`);
    await p.screenshot({ path: path.join(__dirname, "..", name), clip: { x: 0, y: 0, width: s, height: s } });
  }
  await b.close();
})();
