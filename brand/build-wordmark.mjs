#!/usr/bin/env node
/**
 * SIVREE のロゴタイプ（文字を図形にしたもの）を作る。値は BRAND.md の「ロゴタイプの標準値」。
 * 書体ファイルと opentype.js はリポジトリに入れていないので、作業用のフォルダに取ってきて渡す（BRAND.md の手順）。
 * 使い方: node brand/build-wordmark.mjs <Urbanist 600 の .woff か .ttf> <opentype.js を入れたフォルダ>
 * 出力: brand/wordmark.svg, brand/wordmark-white.svg, brand/lockup.svg, brand/lockup-white.svg, brand/og-image.svg と、ヘッダー用の値
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [fontFile, opentypeDir] = process.argv.slice(2);
if (!fontFile || !opentypeDir) {
  console.error('使い方: node brand/build-wordmark.mjs <font> <opentype.js のフォルダ>');
  process.exit(1);
}
const opentype = createRequire(join(resolve(opentypeDir), 'x.js'))('opentype.js');

// 1em = 1000。字間は「全体の字間 + 組ごとの調整」で、最後の文字の後ろには付けない
const LETTERS = ['S', 'I', 'V', 'R', 'E', 'E'];
const TRACKING = 0.04;
const PAIRS = [0, 0, 0, 0, 0]; // S-I, I-V, V-R, R-E, E-E（調整が要る組があれば足す）
const CAP = 728; // 大文字の高さ（1em = 1000 のうち）。書体が替わっても、文字の大きさの基準をそろえる
const EM = 1000;
const INK = '#1d1d1f'; // 本文の色（styles.css の --text）と同じ

const font = opentype.loadSync(fontFile);
const eBox = font.charToGlyph('E').getBoundingBox();
const SIZE = CAP / ((eBox.y2 - eBox.y1) / font.unitsPerEm); // 大文字の高さが CAP になる文字サイズ
const scale = SIZE / font.unitsPerEm;

function layout(x0, baseline) {
  const path = new opentype.Path();
  let x = x0;
  LETTERS.forEach((letter, i) => {
    const glyph = font.charToGlyph(letter);
    path.extend(glyph.getPath(x, baseline, SIZE));
    x += glyph.advanceWidth * scale + (i < PAIRS.length ? (TRACKING + PAIRS[i]) * EM : 0);
  });
  return path;
}

const box = layout(0, 0).getBoundingBox();
const width = box.x2 - box.x1;
const height = box.y2 - box.y1;
const d = layout(-box.x1, -box.y1).toPathData(1);
const round = (n) => Math.round(n * 10) / 10;

const wordmark = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" role="img" aria-label="Sivree"><path fill="${fill}" d="${d}"/></svg>\n`;

// シンボル「3・2・1」: 逆三角に並べた6つの四角。上2段は文字色の薄い濃淡、最後の1つだけが緑青（BRAND.md）
const ACCENT = '#0f7b72'; // 明るい面。暗い面は #3cc4b2
const ACCENT_DARK = '#3cc4b2';
const CELL = 24, PITCH = 29, MW = 2 * PITCH + CELL; // 記号の幅と高さは 82
const markBody = (ink, accent) => {
  const c = (x, y, f, o) => `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="1.5" fill="${f}"${o ? ` fill-opacity="${o}"` : ''}/>`;
  return [0, PITCH, 2 * PITCH].map((x) => c(x, 0, ink, 0.32)).join('')
    + [PITCH / 2, PITCH * 1.5].map((x) => c(x, PITCH, ink, 0.62)).join('')
    + c(PITCH, 2 * PITCH, accent);
};

// 横組み: シンボルの高さ 0.8em、間 0.42em。文字の高さ 0.748em
const MARK = 0.8 * EM;
const GAP = 0.42 * EM;
const markScale = MARK / MW;
const textX = MARK + GAP;
const textY = (MARK - height) / 2;
const lockupWidth = textX + width;
const lockup = (ink, accent) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(lockupWidth)} ${round(MARK)}" role="img" aria-label="Sivree">
  <g transform="scale(${round(markScale * 1000) / 1000})">${markBody(ink, accent)}</g>
  <path transform="translate(${round(textX)} ${round(textY)})" fill="${ink}" d="${d}"/>
</svg>\n`;
const markOnly = (ink, accent) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MW} ${MW}" role="img" aria-label="Sivree">${markBody(ink, accent)}</svg>\n`;
// 地の色は黒にしない（利用者の画面の設定を尊重する）。PNG・OG は薄い灰（#f5f5f7）の地。ブラウザのタブ用 icon.svg は透明で、明暗に追従する
const PAPER = '#f5f5f7';
const iconSvg = (ratio) => {
  const k = (1024 * ratio) / MW, o = (1024 - MW * k) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${PAPER}"/>
  <g transform="translate(${round(o)} ${round(o)}) scale(${round(k * 1000) / 1000})">${markBody(INK, ACCENT)}</g>
</svg>
`;
};
const tabIconSvg = () => {
  const k = 1000 / MW, o = 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <style>.i{fill:${INK}}.a{fill:${ACCENT}}@media (prefers-color-scheme:dark){.i{fill:${PAPER}}.a{fill:${ACCENT_DARK}}}</style>
  <g transform="translate(${o} ${o}) scale(${round(k * 1000) / 1000})">${markBody(INK, ACCENT).replace(/fill="#1d1d1f"/g, 'class="i"').replace(/fill="#0f7b72"/g, 'class="a"')}</g>
</svg>
`;
};

// 共有画像 1200×630: 薄い灰の面の中央に横組み（幅 880）
const ogWidth = 880;
const ogHeight = round((ogWidth * MARK) / lockupWidth);
const lockupInner = lockup(INK, ACCENT).replace(/^<svg[^>]*>\n/, '').replace(/<\/svg>\n$/, '');
const ogImage = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPER}"/>
  <!-- 横組み（brand/lockup-white.svg と同じ図形）を中央に置く。brand/build-wordmark.mjs が作る -->
  <svg x="${(1200 - ogWidth) / 2}" y="${round((630 - ogHeight) / 2)}" width="${ogWidth}" height="${ogHeight}" viewBox="0 0 ${round(lockupWidth)} ${round(MARK)}">
${lockupInner}  </svg>
</svg>
`;

const out = new URL('.', import.meta.url).pathname;
writeFileSync(join(out, 'og-image.svg'), ogImage);
writeFileSync(join(out, 'wordmark.svg'), wordmark(INK));
writeFileSync(join(out, 'wordmark-white.svg'), wordmark('#fff'));
writeFileSync(join(out, 'lockup.svg'), lockup(INK, ACCENT));
writeFileSync(join(out, 'lockup-white.svg'), lockup('#f5f5f7', ACCENT_DARK));
writeFileSync(join(out, 'mark.svg'), markOnly(INK, ACCENT));
writeFileSync(join(out, 'icon-32.svg'), iconSvg(0.8));
writeFileSync(join(out, 'icon-app.svg'), iconSvg(0.6));
writeFileSync(join(out, '../public/icon.svg'), tabIconSvg());

console.log(`viewBox: 0 0 ${round(width)} ${round(height)}`);
console.log(`ヘッダーの高さ: ${(height / EM).toFixed(4)}em（文字の大きさに対して）`);
console.log(`path: ${d}`);
