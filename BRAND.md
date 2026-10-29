# Sivree のブランド

2026-10-20 に、ロゴの方向を決めて、ヘッダー・アイコン・共有画像を差し替えた。これが正で、変えるときはここを更新する。

## 名前
- **Sivree**（SIV-ree）。旧名 Sivry（2026-10-12 に sieve「ふるい」と voice のような響きから造語）を、読み方が綴りで決まるように改めた名前（BACKLOG の「名前を Sivree に変更」）。
- 意味の核は「ノイズをふるい落として、一次情報だけを残す」。

## ロゴ（2026-10-20 決定）
- **文字: SIVREE**（大文字。2026-10-29 から図形にしたロゴタイプ。下の「ロゴタイプの標準値」）。画面の中の文章・規約・UI の表記は「Sivree」のまま。ヘッダーは、ロゴタイプの SVG を `aria-hidden` で見せ、隣に見えない文字「Sivree」（`.visually-hidden`）を置いている（スクリーンリーダーは「Sivree」と読む）。
- **シンボル: 括弧と点**。出典の角括弧で、1つの一次情報（点）を囲む。S の文字は使わない。
- 検討して外した案: なめらかな S（無難だが、よくある形）、ドットの S（物語は強いが、電光掲示板のようで落ち着きに欠ける）、角ばった S（7セグメントの S は「5」と同じ形になる）。
- 作り方の原則: シンボルも文字も図形にする。端末の書体に左右されない。

### ロゴタイプの標準値（2026-10-29 決定）
- 書体: **Inter 700**（OFL。輪郭を図形にして配布してよい）。直立。I の斜体（右倒し・左倒し）は試したが、右倒しは V と並ぶと N に見え、どちらも読みにくいので外した。
- 字間（1em に対する値）: 全体 **−0.03em** に、文字の組ごとの調整を足す。最後の E の後ろには付けない。

  | 組 | S–I | I–V | V–R | R–E | E–E |
  |---|---|---|---|---|---|
  | 調整 | −0.01 | 0.00 | −0.01 | −0.02 | −0.02 |
  | 合計 | −0.04 | −0.03 | −0.04 | −0.05 | −0.05 |

  書体のカーニング表は使わない（この値は、文字を1つずつ並べて決めたもの）。
- 色: 本文と同じ黒 **#1d1d1f**（`--text`）。暗い背景では白。ヘッダーでは `currentColor` で明暗に追従。
- 横組み（シンボル＋文字）: ヘッダーと同じ比率。文字の大きさ 1em に対して、シンボル 1.05em、間 0.4em、文字の高さ 0.748em（S の上下のはみ出しを含む）。
- 作り直すときは `brand/build-wordmark.mjs` の値を変えて実行する（下の「作り直す手順」）。値を変えたら、この表と `public/index.html` の SVG を一緒に更新する。

## 製品の性格
- 対象は、一次情報の収集が仕事の正しさに直結する専門職（コンサルタント、士業、シンクタンクの調査担当者）。個人の私的な利用は無償（PRODUCT.md）。
- 求める印象: 静か、正確、信頼できる、落ち着いている。派手さより「見落とさない」「出典がはっきりしている」。
- 避けるもの: AI の火花・きらめき、ニュースアプリの定番（新聞、ラッパ、ベル、虫眼鏡、RSS のアイコン）、ふるいを写実的に描いた絵、小さくすると潰れる細密な図、グラデーション。

## 資産
| 物 | 場所 | 内容 |
|---|---|---|
| ヘッダー | `public/index.html`（`.brand-title`）、`public/styles.css` | インライン SVG のシンボル（`currentColor`、線 9）＋ロゴタイプの SVG（`.brand-wordmark`、`currentColor`）＋見えない文字「Sivree」。明暗に追従。詳細画面では非表示（戻るボタンに替わる） |
| ロゴタイプ | `brand/wordmark.svg`（黒）、`brand/wordmark-white.svg`（白） | SIVREE の文字だけ。透明の背景 |
| 横組み | `brand/lockup.svg`（黒）、`brand/lockup-white.svg`（白） | シンボル＋ロゴタイプ。単色。透明の背景 |
| ロゴタイプの作成 | `brand/build-wordmark.mjs` | 上の4つの SVG と `brand/og-image.svg` を作り、ヘッダー用の viewBox と高さを表示する |
| アプリアイコン | `public/icon.svg` | 1024 の全面塗り。藍（#5b5bd6）の面に白の括弧と点（線 12・点の半径 15）。図形は中央の約 70%（Android の maskable の安全域に収まる） |
| PNG | `public/icon-32/180/192/512.png` | `icon.svg` から作成。32px だけは、小さくても読めるよう図形を大きくした版（`brand/icon-32.svg`） |
| マニフェスト | `public/manifest.webmanifest` | `theme_color` #5b5bd6、アイコンは `any maskable` |
| 共有画像 | `public/og-image.png`（元は `brand/og-image.svg`）、`public/index.html` の og:* と twitter:card | 1200×630。藍の面の中央に白の横組み（幅 880、2026-10-29 にロゴタイプへ更新）。`og-image.svg` は `brand/build-wordmark.mjs` が作る。og:image は絶対 URL |
| シンボルの単体 | `brand/mark.svg` | 藍、透明の背景 |
| 法務ページ | `public/legal.html` | 見出しの「← Sivree」と、同じ `icon.svg` |

## 色
- ブランド色は、藍 **#5b5bd6**（暫定。アイコンの面、`theme_color`、共有画像）。
- UI のアクセントは青（#0a66ff、暗い画面は #4c94ff）のままで、ロゴの藍とは別。「マイニュース」タブは藍→ピンクのグラデーション（`--foryou`）。この3つを1つの体系にまとめるかは未決。
- ヘッダーのシンボルと文字は、色を付けずに本文の色（`currentColor`）にしてある。

## 作り直す手順（macOS）
SVG から PNG を作るには `qlmanage`（OS 付属）を使う。
```bash
qlmanage -t -s 512 -o <出力先> public/icon.svg        # 180 / 192 / 512。出力は <出力先>/icon.svg.png
qlmanage -t -s 32 -o <出力先> brand/icon-32.svg       # 32px 用（図形を大きくした版）
qlmanage -t -s 1200 -o <出力先> brand/og-image.svg    # 1200×1200 で出るので、中央を切り出す
sips --cropToHeightWidth 630 1200 --cropOffset 285 0 <og-image.png>
```

ロゴタイプ（Inter とツールはリポジトリに入れず、作業用のフォルダに取ってくる）:
```bash
curl -s -A "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30" "https://fonts.googleapis.com/css2?family=Inter:wght@700"   # 出力の /* latin */ の .woff の URL を取る
curl -s -o <作業用>/inter-700-latin.woff <その URL>
(cd <作業用> && npm install --ignore-scripts opentype.js@1.3.4)
node brand/build-wordmark.mjs <作業用>/inter-700-latin.woff <作業用>
```
表示された viewBox と path を `public/index.html` の `.brand-wordmark` に、高さを `public/styles.css` の `.brand-wordmark` に写す（幅 = 高さ × viewBox の幅 ÷ viewBox の高さ）。`brand/og-image.svg` も作り直されるので、上の qlmanage と sips で `public/og-image.png` を作り直す。

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
