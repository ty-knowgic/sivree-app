#!/usr/bin/env node
/**
 * コードの中の日本語の文言（＝翻訳のキー）が、すべて英語の辞書（en.json・sources.json）にあることを確かめる。
 * check-locales.mjs は「辞書どうしの食い違い」を見るが、コードに書いた新しい文言が辞書にないことは検出できない。
 * ここでは public/app.js・sync.js の日本語の文字列リテラルと、index.html の data-i18n* を調べる。
 * 日本語の文字列でも翻訳の対象にしないもの（正規表現など）は ALLOW に書く。
 * 使い方: npm run check:i18n-keys
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '../public');
const read = async file => readFile(path.join(root, file), 'utf8');
const dictionary = new Set([...Object.keys(JSON.parse(await read('locales/en.json'))), ...Object.keys(JSON.parse(await read('locales/sources.json')))]);
const CJK = /[぀-ヿ一-鿿]/;
// 翻訳の対象にしない日本語（言語の判定用の正規表現、区切り文字など）
const ALLOW = new Set(['・', '、', '。']);

/** 日本語を含む文字列リテラルと、テンプレート文字列の固定部分を、構文木から取り出す（コメントは含まれない） */
function literals(code, file) {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (CJK.test(node.text)) found.push(node.text);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (CJK.test(node.text)) found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const problems = [];
for (const file of ['app.js', 'sync.js']) {
  for (const value of new Set(literals(await read(file), file))) {
    if (ALLOW.has(value) || dictionary.has(value)) continue;
    // 正規表現の範囲（ぁ-んなど）や、日本語の判定用のものは対象外
    if (/^\[.*\]/.test(value) || /[ぁ-んァ-ヶ]-/.test(value)) continue;
    problems.push(`${file}: 辞書にない文言「${value.slice(0, 60)}」`);
  }
}
const html = await read('index.html');
for (const match of html.matchAll(/data-i18n(?:-aria|-placeholder)?="([^"]+)"/g)) {
  if (!dictionary.has(match[1])) problems.push(`index.html: 辞書にない文言「${match[1].slice(0, 60)}」`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} 件。コードの文言を en.json（と各言語）に追加してください`);
  process.exit(1);
}
console.log(`コードの文言: すべて辞書にあります（辞書 ${dictionary.size} 件）`);
