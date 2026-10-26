import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const snapshotDirectory = path.join(projectRoot, 'data/preview/snapshot');
export const snapshotNames = ['meta', 'news', 'sources', 'summaries', 'analysis'];

export function validateSnapshot(data) {
  if (data.meta?.schema !== 2 || !Number.isFinite(Date.parse(data.meta.generatedAt))) throw Error('公開データの形式・更新日時が不正です');
  if (!Array.isArray(data.news) || !data.news.length || data.news.some(item => typeof item.id !== 'string' || typeof item.title !== 'string')) throw Error('記事データが不正です');
  if (!Array.isArray(data.sources) || data.sources.some(source => typeof source.feedUrl !== 'string')) throw Error('情報源データが不正です');
  for (const value of [data.summaries, data.analysis?.pairs, data.analysis?.topicScores]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('要約・分析データが不正です');
  }
  return data;
}

export async function readSnapshot(directory = snapshotDirectory) {
  const meta = JSON.parse(await readFile(path.join(directory, 'meta.json'), 'utf8'));
  const values = await Promise.all(snapshotNames.filter(name => name !== 'meta').map(async name => [name, JSON.parse(await readFile(path.join(directory, `${name}.json`), 'utf8'))]));
  const after = JSON.parse(await readFile(path.join(directory, 'meta.json'), 'utf8'));
  if (meta.generatedAt !== after.generatedAt) throw Error('ローカルの写しが更新中です。再実行してください。');
  return validateSnapshot({ meta, ...Object.fromEntries(values) });
}

async function remoteJson(name) {
  const url = `https://sivree.com/data/${name}.json?preview=${Date.now()}`;
  let text;
  // curl respects configured system proxies on both Node 22 and newer Node versions.
  if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy) {
    text = await new Promise((resolve, reject) => {
      const child = spawn('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '45', url], { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks = []; let bytes = 0, error = '';
      child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 64 * 1024 * 1024) child.kill(); else chunks.push(chunk); });
      child.stderr.on('data', chunk => { error += chunk; });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve(Buffer.concat(chunks).toString('utf8')) : reject(Error(`${name}: ${error || 'ダウンロード失敗'}`)));
    });
  } else {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw Error(`${name}: HTTP ${response.status}`);
    text = await response.text();
  }
  return JSON.parse(text);
}

export async function downloadSnapshot({ directory = snapshotDirectory, fetchJson = remoteJson, attempts = 3 } = {}) {
  let data;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const before = await fetchJson('meta');
    const values = await Promise.all(snapshotNames.filter(name => name !== 'meta').map(async name => [name, await fetchJson(name)]));
    const after = await fetchJson('meta');
    if (before.generatedAt !== after.generatedAt) continue;
    data = validateSnapshot({ meta: before, ...Object.fromEntries(values) });
    break;
  }
  if (!data) throw Error('取得中に公開データが更新されました。再実行してください。既存の写しは維持しています。');
  const staging = `${directory}.incoming-${randomUUID()}`, backup = `${directory}.previous-${randomUUID()}`;
  await mkdir(staging, { recursive: true });
  let moved = false;
  try {
    await Promise.all(snapshotNames.map(name => writeFile(path.join(staging, `${name}.json`), JSON.stringify(data[name]))));
    try { await rename(directory, backup); moved = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(staging, directory); } catch (error) { if (moved) await rename(backup, directory); throw error; }
    if (moved) await rm(backup, { recursive: true, force: true });
  } finally { await rm(staging, { recursive: true, force: true }); }
  return data;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const data = await downloadSnapshot();
    console.log(`公開データの写しを更新しました: ${data.news.length}記事 / ${data.meta.generatedAt}`);
    console.log('アカウント設定やブラウザのプロフィールは取得・変更していません。');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
