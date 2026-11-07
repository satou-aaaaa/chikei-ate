# AGENTS.md

地形あて：山の名前・高さ・都道府県を読んで、地図の4つの▲からその山を当てる1日5問の学習ゲーム。`index.html` と `data.js`（国土地理院の1003山）・`map.js`（都道府県の形）・`game.js`（問題の作り方）を GitHub Pages で公開する。

## 準備（最初に一度）

```bash
bash scripts/setup.sh   # Node.js（版は .nvmrc）を確かめ、検査の依存とブラウザを入れる。何度実行してもよい
```

## push する前の確認

```bash
node qa/run.mjs   # 山のデータ・問題の作り方（全部の山×3つの難しさ）・今日の5問と上級（3年分）・地図の名前・通しで遊ぶ・続きから・とことん・あとから・古いタブ・スマホ幅・PWA・引き継ぎ・見やすさ（CI の QA と同じ）
QA_SHIFT_DAYS=24 node qa/run.mjs   # 日付・カレンダーを変えたときは、「今日」をずらして月をまたぐ日でも通す（はじめは10日ずらす）
```

## このリポジトリの決まり

- 山のデータ `data.js` は `node tools/make-data.cjs` で作る（手で直さない）。元は国土地理院「日本の主な山岳標高（1003山）」の CSV（`tools/gsi-1003zan-20260331.csv`、2026-03-31 版）。同じ索引番号の峰はいちばん高い峰で1山にまとめる。元の CSV は Shift_JIS なので、無い字は「?」になる（2026-03-31 版は薬萊山・屛風岳・朳差岳・屛風山の4字。同じ版の PDF 一覧で確かめて直した）。差し替えたら同じように直す（`make-data.cjs` が名前の「?」・括弧で止まる）。新しい版が出たら、国土地理院の CSV（Shift_JIS）を UTF-8 に直してから（例 `iconv -f CP932 -t UTF-8`。`make-data.cjs` と QA は UTF-8 で読む）差し替えて作り直し、ファイル名の日付・`make-data.cjs`・`qa/run.mjs` の読むファイル名・出典の版の日付（`index.html` の「このゲームについて」と README）も同じ版にそろえ、変えた PR に一言書く（過去の日の問題も変わる）。出典「国土地理院…を加工して作成」を「このゲームについて」と README に残す（国土地理院コンテンツ利用規約）。
- 地図 `map.js` は `node tools/make-map.cjs <Natural Earth の ne_10m_admin_1_states_provinces の GeoJSON>` で作る（パブリックドメイン）。場所の数え方（緯度・経度 → 地図の点）は `tools/proj.cjs` に1つだけ置く。
- 問題（`game.js` の `make`）：4つの▲は必ずちがう都道府県・ちがう名前にし、都道府県の手がかりで1つに決まるようにする。▲どうしは地図の上で重ならない（`spread`）。やさしいはほかの3つを別の地方から、ふつう・むずかしいは近くの都道府県から。むずかしい・上級は都道府県の名前を地図に出さない。やさしい・ふつうは4つの山の都道府県の名前を必ず出し、重なるときは近くの空いた所へずらす。ボタンの読み上げにもその▲の都道府県を入れる（QA が見る）。
- 今日の5問（やさしい2・ふつう2・むずかしい1）・上級（むずかしい3、今日の5問と重ねない）は日本時間の日付から作る種で決まり、だれでも同じ。今日の5問は全部の山を種で並べた順に1日5山（1周するまで同じ山を出さない）。`Math.random()` は練習・とことんの並びと回の名札だけ（QA が数を見る）。乱数は `sort` の比較の中で引かない。`data.js` の並び・`game.js` の作り方を変えると過去の日の問題も変わるので、変えた PR に一言書く。
- ★はまちがい＋ヒントの数（0で★3・1で★2・2以上で★1）。まちがえた▲は、どの山かを教える（学べるように）。ヒントは2段（その山の都道府県をぬる → ちがう▲を消して2つにしぼる）。上級はヒントなし。時間制限は付けない。
- 好きなだけ遊べる：チケット・回数制限・🔒で開くモードを入れない（2026-11-06 satou さん。QA が見る）。とことん（`runs.e`）は全部の山を1回ずつ、やさしい5→ふつう10→むずかしいの順で出し、まちがえても終わらず「ここで降りる」まで続く。自己ベスト `ebest`。他の人との順位は出さない。練習は地方を選べ、まだ当てていない山を先に出す。
- 今日の5問・上級は1日1回で、途中で閉じても続きから。途中経過はモードごと（`runs.d`・`runs.h`・`runs.p`・`runs.e`・`runs["a:日付"]`）。答える前に、保存した進み具合が画面と同じ問題か確かめる（`same`）。ヒント・まちがいは別のタブの分を減らさない（`keep`）。保存の前に読み直し、`load` は合わせる前に両側を `fresh()` で補う。引き継ぎで入った記録は `tidy()` で形をそろえる（shared-workflows `incidents/2026-11-04-daily-game-save-gaps.md`）。
- 実績（`ACH`、14個）はいまの記録から毎回数える（新しく残すのは知らせ終えた印 `ach` だけ）。続けるは合計の日数（`playedDays`）、連続の日は1以上のときだけ出す。取りこぼした日（きのう〜7日前・`EPOCH` から）はカレンダーからあとから遊べ、`adays` に入れて連続・今日の記録・Ko-fi・シェアには数えない。
- 山の手帳：当てた山（`dex`）を8つの地方ごとに。地方を押すと一覧と、その地方の練習。
- 文字は少なめ・一画面一問。お笑いの言葉は入れない（QA が見る）。ほかの作品の名前・キャラ・見た目は使わない。
- 共有は遊ぶ人が押したときに開くリンク（X・LINE・Web Share・コピー）だけ。シェアの文に山の名前（答え）を出さない（🟢🔶🔺）。
- 感想は「感想を送る」から GitHub の Issue フォーム（`.github/ISSUE_TEMPLATE/feedback.yml`、shared-workflows `template/` の写し）を開くだけ。名前・メールは聞かない。
- 応援は Ko-fi（https://ko-fi.com/satouaaaaa）へのただのリンクだけ。今日の5問・上級を初めて全部まちがいなしで終えたときだけ、結果の画面の下に1行。遊ぶのは無料のまま、有料版は置かない。
- 外へ通信しない。外から読むのは Google Fonts の文字だけ（CSP の `connect-src 'self'` を広げない）。記録は遊ぶ人のブラウザ（localStorage）だけ。
- 見やすさ：`</head>` の前の見やすさの設定（`<!-- a11y:begin -->`〜`end`）は shared-workflows `template/a11y/a11y.html` の写し、`qa/a11y.mjs` も `template/qa/a11y.mjs` の写しで、ここでは直さない。色だけで分けない（まちがいは ✕・破線・「ちがう」、正解は ✓、ぬった都道府県は「色の見分けを助ける」で斜線も重ねる）。ボタン ▲1〜▲4 は地図のどこかを読み上げる名前を持つ（答えは言わない）。
- 引き継ぎ：`transfer.js` と `qa/transfer-check.mjs` は shared-workflows `template/` の写しで、ここでは直さない。`data-keys` は `chikei-v1`。記録の形を変えたら `fresh()` と QA の `sample` も合わせる。
- 押せる所は高さ44px以上（QA が見る）。一行の式の途中にコメント `//` を足さない。少し遅れて動く処理（setTimeout）は、画面が替わっていたら何もしない。機能を足す・直すたびに `qa/run.mjs` に検査を足す。乱数で組む部分は何年分も作って確かめる（shared-workflows `incidents/2026-10-31-roppo-empty-village.md`）。
- PWA（`manifest.webmanifest`・`sw.js`・`icon-*.png`）：画面のファイルを足したら `sw.js` の `SHELL` にも足し、中身を大きく変えたら `CACHE` の版を上げる。アイコンは `node tools/make-icons.cjs`（maskable は中を縮めた `icon-maskable-512.png`）、SNS 用の絵 `og.png` は `node tools/make-og.cjs`（今日の問題を入れない）。
- 公開リポジトリなので、個人情報・鍵を入れない。

## 公開

- GitHub Pages は `main` のルート（`/`）を公開する。PR の QA と Secret scan が ✅ になると `automerge.yml` が自動でマージする。止めたいときは下書きにするか、ラベル「自動マージしない」を付ける。
- `sw.js`・`manifest.webmanifest` を変える PR は自動ではマージされない（`hold_paths`）。CodeRabbit のレビューを待ち、手でマージする直前に今の head へのレビューを読み直す（shared-workflows `incidents/2026-11-01-roppo-merged-before-review.md`）。CodeRabbit は PR に `@coderabbitai review` とコメントして頼む。

## 共通のきまり

- PR の作り方・マージの仕方は satou-aaaaa/shared-workflows の `routines/pr.md`、全体のきまりは `routines/common.md` に従う。
- CI の部品は shared-workflows の共通部品を呼ぶ。リポジトリ側の .github/workflows には呼び出しと設定値だけを書く。
- Claude 以外の AI・人が作業するときは、shared-workflows の `routines/tool-map.md` と `routines/without-claude.md` を読む。
