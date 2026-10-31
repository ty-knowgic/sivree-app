#!/usr/bin/env node
/**
 * SIVREE のロゴタイプ（文字を図形にしたもの）を作る。値は BRAND.md の「ロゴタイプの標準値」。
 * 書体ファイルと opentype.js はリポジトリに入れていないので、作業用のフォルダに取ってきて渡す（BRAND.md の手順）。
 * 使い方: node brand/build-wordmark.mjs <Inter 700 の .woff か .ttf> <opentype.js を入れたフォルダ>
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
const TRACKING = -0.03;
const PAIRS = [-0.01, 0, -0.01, -0.02, -0.02]; // S-I, I-V, V-R, R-E, E-E
const EM = 1000;
const INK = '#1d1d1f'; // 本文の色（styles.css の --text）と同じ

const font = opentype.loadSync(fontFile);
const scale = EM / font.unitsPerEm;

function layout(x0, baseline) {
  const path = new opentype.Path();
  let x = x0;
  LETTERS.forEach((letter, i) => {
    const glyph = font.charToGlyph(letter);
    path.extend(glyph.getPath(x, baseline, EM));
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

// 横組み: ヘッダーと同じ比率（シンボル 1.05em、間 0.4em）。シンボルは線の外側で切り詰める
const MARK = 1.05 * EM;
const GAP = 0.4 * EM;
const markScale = MARK / 100;
const markLeft = (19 - 4.5) * markScale;
const markTop = (16 - 4.5) * markScale;
const markHeight = (84 - 16 + 9) * markScale;
const textX = MARK + GAP;
const textY = (MARK - height) / 2;
const lockupWidth = textX + width - markLeft;
const lockup = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round(markLeft)} ${round(markTop)} ${round(lockupWidth)} ${round(markHeight)}" role="img" aria-label="Sivree">
  <g transform="scale(${markScale})"><path d="M36 16H19V84H36M64 16H81V84H64" fill="none" stroke="${fill}" stroke-width="9" stroke-linejoin="miter"/><circle cx="50" cy="50" r="12" fill="${fill}"/></g>
  <path transform="translate(${round(textX)} ${round(textY)})" fill="${fill}" d="${d}"/>
</svg>\n`;

// 共有画像 1200×630: 藍の面の中央に白の横組み（幅 880）
const ogWidth = 880;
const ogHeight = round((ogWidth * markHeight) / lockupWidth);
const lockupInner = lockup('#fff').replace(/^<svg[^>]*>\n/, '').replace(/<\/svg>\n$/, '');
const ogImage = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#5b5bd6"/>
  <!-- 横組み（brand/lockup-white.svg と同じ図形）を中央に置く。brand/build-wordmark.mjs が作る -->
  <svg x="${(1200 - ogWidth) / 2}" y="${round((630 - ogHeight) / 2)}" width="${ogWidth}" height="${ogHeight}" viewBox="${round(markLeft)} ${round(markTop)} ${round(lockupWidth)} ${round(markHeight)}">
${lockupInner}  </svg>
</svg>
`;

const out = new URL('.', import.meta.url).pathname;
writeFileSync(join(out, 'og-image.svg'), ogImage);
writeFileSync(join(out, 'wordmark.svg'), wordmark(INK));
writeFileSync(join(out, 'wordmark-white.svg'), wordmark('#fff'));
writeFileSync(join(out, 'lockup.svg'), lockup(INK));
writeFileSync(join(out, 'lockup-white.svg'), lockup('#fff'));

console.log(`viewBox: 0 0 ${round(width)} ${round(height)}`);
console.log(`ヘッダーの高さ: ${(height / EM).toFixed(4)}em（文字の大きさに対して）`);
console.log(`path: ${d}`);
