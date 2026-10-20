#!/usr/bin/env node
/**
 * 旧名「Sivry」の残りを検出する（2026-10-20 に「Sivree」へ変更）。
 * 次の2つ以外に旧名が残っていれば失敗する:
 *  1. 保存データの識別子（localStorage のキーなど）。変えると、利用者の保存済みの設定が消える、同期ファイルが孤立するため、旧名のまま残している。
 *  2. 「旧名」「formerly」と書いた説明の行（名前を変えた経緯の記録）。
 * 使い方: npm run check:brand
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const KEEP = ['sivry:lang', 'sivry:sync', 'sivry:images', 'sivry:visit', 'sivry.profile.v1', 'sivry.profile.updatedAt', 'sivry-settings.json'];
const HISTORY = /旧名|formerly/i;
const SELF = 'scripts/check-brand.mjs';

// 追跡中のファイルと、まだ追跡していない新しいファイル（.gitignore の対象は除く）
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const problems = [];
const kept = new Map();

for (const file of files) {
  if (file === SELF) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (text.includes('\0')) continue; // 画像などの2進ファイル
  text.split('\n').forEach((line, index) => {
    if (!/sivry/i.test(line)) return;
    let rest = line;
    for (const key of KEEP) {
      if (rest.includes(key)) kept.set(key, (kept.get(key) ?? 0) + 1);
      rest = rest.split(key).join('');
    }
    if (!/sivry/i.test(rest) || HISTORY.test(line)) return;
    problems.push(`${file}:${index + 1}: ${line.trim().slice(0, 120)}`);
  });
}

if (problems.length) {
  console.error(`旧名「Sivry」が残っています（${problems.length} 行）:\n${problems.join('\n')}`);
  console.error('\n意図して残す識別子なら KEEP に、経緯の説明なら行に「旧名」と書いてください。');
  process.exit(1);
}
console.log(`旧名の残り: なし（意図して残す識別子 ${kept.size} 種類・${[...kept.values()].reduce((a, b) => a + b, 0)} か所）`);
