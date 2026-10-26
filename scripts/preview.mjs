import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { projectRoot, snapshotDirectory, snapshotNames, readSnapshot, downloadSnapshot } from './preview-data.mjs';
import { createPreviewServer } from './preview-server.mjs';
import { watchPreviewFiles } from './preview-watch.mjs';
import { connectTailnetPreview } from './preview-tailnet.mjs';

const { values } = parseArgs({ options: {
  mode: { type: 'string', default: 'development' }, host: { type: 'string', default: '0.0.0.0' },
  port: { type: 'string' }, 'delay-ms': { type: 'string', default: '0' }, 'no-watch': { type: 'boolean', default: false },
  tailscale: { type: 'boolean', default: false }, 'https-port': { type: 'string' }
} });
if (!['development', 'production'].includes(values.mode)) throw Error('--mode must be development or production');
const mode = values.mode;
const port = Number(values.port ?? (mode === 'production' ? 4174 : 4173));
const delayMs = Number(values['delay-ms']);
const httpsPort = Number(values['https-port'] ?? (mode === 'production' ? 8444 : 8443));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid --port');
if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 60000) throw Error('--delay-ms must be between 0 and 60000');
if (values.tailscale && (!Number.isInteger(httpsPort) || httpsPort < 1 || httpsPort > 65535)) throw Error('Invalid --https-port');
const buildRoot = path.join(projectRoot, `data/preview/builds/${mode}`);
const versions = new Map();
let current, snapshotDate, shuttingDown = false, debounce, rebuilding = false, queued = false;
const watchers = [];

function runNode(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: projectRoot, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => output += chunk); child.stderr.on('data', chunk => output += chunk);
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(Error(output || `Build exited ${code}`)));
  });
}

async function hashSources(data) {
  const hash = createHash('sha256').update(mode).update(JSON.stringify(data.meta));
  async function walk(directory) {
    for (const item of (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (item.name.startsWith('.')) continue;
      const file = path.join(directory, item.name);
      if (item.isDirectory()) await walk(file);
      else if (item.isFile()) hash.update(path.relative(projectRoot, file)).update(await readFile(file));
    }
  }
  await walk(path.join(projectRoot, 'src')); await walk(path.join(projectRoot, 'public'));
  for (const file of ['scripts/build-static.mjs', 'scripts/prepare-preview-data.ts', 'package-lock.json']) hash.update(await readFile(path.join(projectRoot, file)));
  return hash.digest('hex').slice(0,10);
}

async function buildPreview() {
  const data = await readSnapshot();
  const version = await hashSources(data);
  const final = path.join(buildRoot, version);
  await mkdir(buildRoot, { recursive: true });
  let exists = false;
  try { exists = (await stat(path.join(final, 'index.html'))).isFile(); } catch {}
  if (!exists) {
    const staging = path.join(buildRoot, `.building-${randomUUID()}`);
    try {
      await mkdir(path.join(staging, 'data'), { recursive: true });
      await Promise.all(snapshotNames.map(name => writeFile(path.join(staging, `data/${name}.json`), JSON.stringify(data[name]))));
      await runNode(['--import', 'tsx', 'scripts/prepare-preview-data.ts', path.join(staging, 'data'), path.join(staging, 'data')]);
      await runNode(['scripts/build-static.mjs'], { SIVREE_SITE_DIR: staging, SIVREE_ASSET_VERSION: version, SIVREE_PREVIEW_MODE: mode });
      await rename(staging, final);
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  current = version; snapshotDate = data.meta.generatedAt;
  versions.delete(version); versions.set(version, final);
  // Keep one preceding complete build for already-issued versioned requests.
  const disk = await Promise.all((await readdir(buildRoot)).filter(name => /^[a-f0-9]{10}$/.test(name)).map(async name => ({ name, modified: (await stat(path.join(buildRoot,name))).mtimeMs })));
  const keep = new Set([version, ...disk.filter(entry => entry.name !== version).sort((a,b) => b.modified-a.modified).slice(0,1).map(entry=>entry.name)]);
  for (const entry of disk) {
    if (keep.has(entry.name)) versions.set(entry.name, path.join(buildRoot,entry.name));
    else { versions.delete(entry.name); await rm(path.join(buildRoot,entry.name), { recursive:true, force:true }); }
  }
  console.log(`[ready] ${version} / ${data.news.length}記事 / 公開データ ${snapshotDate}`);
}

async function rebuild() {
  if (shuttingDown) return;
  if (rebuilding) { queued = true; return; }
  rebuilding = true;
  try { do { queued = false; await buildPreview(); } while (queued && !shuttingDown); }
  catch (error) { console.error(`[build failed] ${error.message}\n直前の完成済み画面を維持しています。`); }
  finally { rebuilding = false; }
}
function schedule() { clearTimeout(debounce); debounce = setTimeout(() => { void rebuild(); }, 200); }

let server;
try {
  try { await readSnapshot(); }
  catch { console.log('公開データの写しを初回取得しています…'); await downloadSnapshot(); }
  await buildPreview();
  server = createPreviewServer({ delayMs, resolveDirectory: version => versions.get(version ?? current), status: () => ({ mode, version: current, snapshotGeneratedAt: snapshotDate, delayMs, rebuilding }) });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,values.host,resolve); });
  console.log(`\nSivree ${mode} preview: http://127.0.0.1:${port}`);
  if (values.host === '0.0.0.0') {
    for (const addresses of Object.values(networkInterfaces())) for (const address of addresses ?? []) {
      if (!address.internal && address.family === 'IPv4') {
        const [first, second] = address.address.split('.').map(Number);
        const label = first === 100 && second >= 64 && second <= 127 ? 'Tailscale接続の端末' : 'LAN内の端末';
        console.log(`${label}: http://${address.address}:${port}`);
      }
    }
  }
  console.log(mode === 'development' ? '画面用・記事用キャッシュは無効。変更後の [ready] 表示を待ち、ブラウザを再読み込みしてください。' : `本番と同じキャッシュ動作。HTTP応答の追加遅延: ${delayMs}ms`);
  console.log('設定はこのオリジンのブラウザ内に保存され、本番の設定とは独立しています。終了: Ctrl+C\n');
  if (values.tailscale) {
    try {
      const result = await connectTailnetPreview({ backendPort: port, httpsPort });
      if (result.url) console.log(`Tailscale内限定 HTTPS: ${result.url}\nGoogle同期の初回設定: Google Cloudの既存OAuthクライアントの「承認済みのJavaScript生成元」に ${result.url} を追加してください（パスなし・ポート番号を含む）。HTTPSだけではGoogleの origin_mismatch は解消しません。\n`);
      else console.log(`Tailscale Serveの初回有効化: ${result.enableUrl}\n有効化後、このコマンドを再起動してください。HTTPのLAN検証は使用できます。\n`);
    } catch (error) { console.error(`[Tailscale] ${error.message}\nHTTPのLAN検証は引き続き使用できます。`); }
  }
  if (mode === 'development' && !values['no-watch']) {
    watchers.push(await watchPreviewFiles({
      directories: ['public','src'].map(directory=>path.join(projectRoot,directory)),
      files: ['scripts/build-static.mjs','scripts/prepare-preview-data.ts','data/preview/snapshot/meta.json'].map(file=>path.join(projectRoot,file)),
      onChange: schedule, onError: error=>console.error(`[watch] ${error.message}`)
    }));
  }
} catch (error) {
  console.error(error.code === 'EADDRINUSE' ? `ポート ${port} は使用中です。--port 4175 などで別のポートを指定してください。` : error.message);
  process.exitCode = 1;
}

async function stop() {
  shuttingDown = true; clearTimeout(debounce); watchers.forEach(watcher=>watcher.close());
  if (server) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
}
process.once('SIGINT',()=>{void stop();}); process.once('SIGTERM',()=>{void stop();});
