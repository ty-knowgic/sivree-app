/**
 * 情報源の名前（sourceName）と説明（label）のうち日本語を含むものが、すべて翻訳（public/locales/sources.json）にあることを確かめる。
 * 画面では t() を通して表示するため、翻訳がないと英語など他の言語の画面に日本語がそのまま出る。
 * 使い方: npm run check:source-names
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { officialFeeds } from '../src/newsPipeline.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/locales');
const sources = JSON.parse(await readFile(path.join(dir, 'sources.json'), 'utf8')) as Record<string, string>;
const en = JSON.parse(await readFile(path.join(dir, 'en.json'), 'utf8')) as Record<string, string>;
const CJK = /[぀-ヿ一-鿿]/;

const problems: string[] = [];
for (const feed of officialFeeds) {
  for (const [field, value] of [['sourceName', feed.sourceName], ['label', feed.label]] as const) {
    if (value && CJK.test(value) && !(value in sources) && !(value in en)) problems.push(`${feed.sourceName} の ${field}「${value}」に翻訳がありません`);
  }
}
const unique = [...new Set(problems)];
if (unique.length) {
  console.error(unique.join('\n'));
  console.error(`\n${unique.length} 件。public/locales/sources.json に追加してください`);
  process.exit(1);
}
console.log(`情報源の名前と説明: すべて翻訳があります（${officialFeeds.length} 件）`);
