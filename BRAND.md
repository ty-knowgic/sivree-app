# Sivree のブランド

2026-10-20 に、ロゴの方向を決めて、ヘッダー・アイコン・共有画像を差し替えた。**2026-11-20 にシンボルを「3・2・1」に替え、色を緑青にした**（旧: 括弧と点、藍）。これが正で、変えるときはここを更新する。

## 名前
- **Sivree**（SIV-ree）。旧名 Sivry（2026-10-12 に sieve「ふるい」と voice のような響きから造語）を、読み方が綴りで決まるように改めた名前（BACKLOG の「名前を Sivree に変更」）。
- 意味の核は「ノイズをふるい落として、一次情報だけを残す」。

## ロゴ（2026-10-20 決定、シンボルは 2026-11-20 に変更）
- **文字: SIVREE**（大文字。2026-10-29 から図形にしたロゴタイプ。下の「ロゴタイプの標準値」）。画面の中の文章・規約・UI の表記は「Sivree」のまま。ヘッダーは、ロゴタイプの SVG を `aria-hidden` で見せ、隣に見えない文字「Sivree」（`.visually-hidden`）を置いている（スクリーンリーダーは「Sivree」と読む）。
- **シンボル: 3・2・1**（2026-11-20）。逆三角に並べた6つの四角（3・2・1）。上2段は文字色の薄い濃淡（32%、62%）、最後の1つだけが緑青。「大量の情報を一次情報の1件に絞る」動作の図で、逆三角は V（ふるいの断面）でもある。四角は 24、間 5、角丸 1.5（全体 82×82）。
- 変えた理由: 旧シンボル（括弧と点）は、藍の面の中央に白い丸という構図が国旗に似て見える、と指摘があったため。縮小して確かめた限り丸だけには潰れなかったが、構図の類似は残る。新しいシンボルは、中央の丸・赤を使わず、図形を文字の太さに近づけた。比較した4案と色の検討は `brand/proposals/index.html`（案1「3・2・1」、案2「V の先」、案3「引用の括弧」、案4「交わり」）。
- 外した案: 旧括弧と点、なめらかな S、ドットの S、角ばった S（「5」と同じ形）、案2〜4、「ふるい板」（小さいサイズで見づらい）。
- 作り方の原則: シンボルも文字も図形にする。端末の書体に左右されない。

### ロゴタイプの標準値（2026-10-29 決定、書体は 2026-11-20 に Urbanist 600 へ変更）
- 書体: **Urbanist 600**（OFL。輪郭を図形にして配布してよい）。直立。旧 Inter 700 は、曲線が角張り、S・R の端が平らで、字を詰めていたため硬く「ギザギザ」に見えると指摘があり外した。比較した候補（Outfit 500/600、Urbanist 600、Plus Jakarta Sans 600、Manrope 600、Figtree 600）は `brand/proposals/typeface.html`。
- 字間（1em に対する値）: 全体 **+0.04em**。組ごとの調整はなし（`PAIRS` はすべて 0）。最後の E の後ろには付けない。書体のカーニング表は使わない。
- 大文字の高さは 1em の 0.728（`CAP`）にそろえる。書体を替えても、文字の大きさの基準が変わらない。
- 色: 本文と同じ黒 **#1d1d1f**（`--text`）。暗い背景では白（#f5f5f7）。ヘッダーでは `currentColor` で明暗に追従。
- 横組み（シンボル＋文字）: ヘッダーと同じ比率。文字の大きさ 1em に対して、シンボル 0.8em、間 0.42em、文字の高さ 0.7535em（S の上下のはみ出しを含む）。
- 作り直すときは `brand/build-wordmark.mjs` の値を変えて実行する（下の「作り直す手順」）。値を変えたら、この表と `public/index.html` の SVG を一緒に更新する。

## 製品の性格
- 対象は、一次情報の収集が仕事の正しさに直結する専門職（コンサルタント、士業、シンクタンクの調査担当者）。個人の私的な利用は無償（PRODUCT.md）。
- 求める印象: 静か、正確、信頼できる、落ち着いている。派手さより「見落とさない」「出典がはっきりしている」。
- 避けるもの: AI の火花・きらめき、ニュースアプリの定番（新聞、ラッパ、ベル、虫眼鏡、RSS のアイコン）、ふるいを写実的に描いた絵、小さくすると潰れる細密な図、グラデーション。

## 資産
| 物 | 場所 | 内容 |
|---|---|---|
| ヘッダー | `public/index.html`（`.brand-title`）、`public/styles.css` | インライン SVG のシンボル（6つの `rect`。上2段は `currentColor` の薄い濃淡、最後の1つは `var(--brand-accent)`）＋ロゴタイプの SVG（`.brand-wordmark`、`currentColor`）＋見えない文字「Sivree」（`.visually-hidden`）。明暗に追従。詳細画面では非表示（戻るボタンに替わる） |
| ロゴタイプ | `brand/wordmark.svg`（黒）、`brand/wordmark-white.svg`（白） | SIVREE の文字だけ。透明の背景 |
| 横組み | `brand/lockup.svg`（黒）、`brand/lockup-white.svg`（白） | シンボル＋ロゴタイプ。単色。透明の背景 |
| ロゴタイプとアイコンの作成 | `brand/build-wordmark.mjs` | wordmark・lockup・mark・`icon-32.svg`・`og-image.svg`・`public/icon.svg` を作り、ヘッダー用の viewBox と高さを表示する |
| アプリアイコン | `brand/icon-app.svg`（元）、`public/icon-180/192/512.png` | 1024 の全面塗り。薄い灰（#f5f5f7）の地に、黒と緑青の「3・2・1」。図形は中央の約 60%（Android の maskable の安全域に収まる）。地を黒にしないのは、利用者の画面の設定を尊重するため |
| ブラウザのタブ | `public/icon.svg`、`public/icon-32.png` | `icon.svg` は透明の地で、明るい画面では黒、暗い画面では白（緑青は #3cc4b2）に変わる。32px の PNG（`brand/icon-32.svg`、薄い灰の地、図形 80%）は予備 |
| マニフェスト | `public/manifest.webmanifest` | `theme_color` #f5f5f7（`background_color` と同じ）、アイコンは `any maskable` |
| 共有画像 | `public/og-image.png`（元は `brand/og-image.svg`）、`public/index.html` の og:* と twitter:card | 1200×630。薄い灰の面の中央に黒と緑青の横組み（幅 880）。`og-image.svg` は `brand/build-wordmark.mjs` が作る。og:image は絶対 URL |
| シンボルの単体 | `brand/mark.svg` | 黒と緑青、透明の背景 |
| 法務ページ | `public/legal.html` | 見出しの「← Sivree」と、同じ `icon.svg` |

## 色
- ブランド色は、**緑青 #0f7b72**（明るい面。暗い面は #3cc4b2）。シンボルの最後の1つの四角だけに使う。CSS 変数 `--brand-accent`。**地の色は黒にしない**（アプリ内は利用者の明暗の設定に従う。画像は薄い灰 #f5f5f7）。赤・朱は使わない（国旗の連想を避ける）。
- 旧ブランド色の藍 #5b5bd6 は、ロゴからは外した。「マイニュース」タブのグラデーション（`--foryou`）と、一部のチップの色にだけ残っている。
- UI のアクセントは青（#0a66ff、暗い画面は #4c94ff）のままで、ロゴの緑青とは別。この体系をまとめるかは未決。
- ヘッダーのシンボルの上2段と文字は、色を付けずに本文の色（`currentColor`）にしてある。

## 作り直す手順（macOS）
SVG から PNG を作るには `qlmanage`（OS 付属）を使う。
```bash
qlmanage -t -s 512 -o <出力先> brand/icon-app.svg      # 180 / 192 / 512。出力は <出力先>/icon-app.svg.png
qlmanage -t -s 32 -o <出力先> brand/icon-32.svg       # 32px 用（図形を大きくした版）
qlmanage -t -s 1200 -o <出力先> brand/og-image.svg    # 1200×1200 で出るので、中央を切り出す
sips --cropToHeightWidth 630 1200 --cropOffset 285 0 <og-image.png>
```

ロゴタイプ（Urbanist とツールはリポジトリに入れず、作業用のフォルダに取ってくる）:
```bash
curl -s -A "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30" "https://fonts.googleapis.com/css2?family=Urbanist:wght@600"   # 出力の /* latin */ の .woff の URL を取る
curl -s -o <作業用>/urbanist-600-latin.woff <その URL>
(cd <作業用> && npm install --ignore-scripts opentype.js@1.3.4)
node brand/build-wordmark.mjs <作業用>/urbanist-600-latin.woff <作業用>
```
`icon.svg`・`icon-app.svg`・`icon-32.svg`・`og-image.svg`・lockup・mark も同時に作り直される（シンボルの値は `build-wordmark.mjs` の先頭近く）。ヘッダーの文字の大きさは `.brand-title` の `font-size`（2026-11-20 に 1.45rem から 1.62rem へ約12%拡大。行の高さ `min-height` は 60px から 68px）。表示された viewBox と path を `public/index.html` の `.brand-wordmark` に、高さを `public/styles.css` の `.brand-wordmark` に写す（幅 = 高さ × viewBox の幅 ÷ viewBox の高さ）。`brand/og-image.svg` も作り直されるので、上の qlmanage と sips で `public/og-image.png` を作り直す。

## コード側の制約
- 画像は `public/` に置く。CSP の `img-src 'self' data: https:` の範囲で足りるので、新しい外部ホストは要らない。
- ヘッダーには見えない文字「Sivree」を残す（スクリーンリーダー用。`npm run check:brand` は文字列を見る。画面の名前も同じ綴り）。
- 色は CSS 変数と `currentColor` で、明るい画面・暗い画面の両方に追従させる。
- 日付との縦の並び（`.brand-date` の下に `.brand-title`）と、行の高さ（`.appbar-row` の `min-height: 60px`）を保つ。
- 12言語の画面で同じロゴを使う。ロゴは左右反転しない。

## 商標との関係（法的な助言ではありません）
- 出願は、一般に文字そのもの（標準文字）で出すほうが、書体や大文字・小文字の違いを含めて「Sivree」を守りやすい。ロゴは確定してから別に出せる。出願する国と区分は未決（BACKLOG）。
- 「SIVREE」はロゴの上での見せ方。文章・規約・画面の文字は「Sivree」のままにする。

## まだ（未決・未了）
- GitHub のソーシャルプレビュー（1280×640）。リポジトリの設定で手動で入れる。
- 実機での確認: iPhone のホーム画面アイコン、Android の maskable（丸・角丸）、16px のタブのファビコン。
- ブランド色の整理（上の「色」）。
