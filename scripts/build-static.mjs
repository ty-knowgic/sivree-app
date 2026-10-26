// 静的サイト版（GitHub Pages など）を site/ に作る。画面（public/）と、ブラウザで API を代わりに答えるスクリプトをまとめる。
// 記事のデータ（site/data/*.json）は scripts/export-data.ts が書き出す。
import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = process.env.SIVREE_SITE_DIR ? path.resolve(process.env.SIVREE_SITE_DIR) : path.join(root, 'site');
const developmentPreview = process.env.SIVREE_PREVIEW_MODE === 'development';

// data/ は残して、画面とスクリプトだけ作り直す
await mkdir(path.join(site, 'data'), { recursive: true });
await cp(path.join(root, 'public'), site, { recursive: true });
await build({
  entryPoints: [path.join(root, 'src/browser/main.ts')],
  outfile: path.join(site, 'static-api.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  minify: true,
  define: { __SIVREE_PREVIEW__: JSON.stringify(developmentPreview) },
  logLevel: 'info'
});

const indexPath = path.join(site, 'index.html');
const html = await readFile(indexPath, 'utf8');
if (!html.includes('<script src="app.js">')) throw new Error('index.html に app.js の読み込みが見つかりません');
// ブラウザが古い app.js と新しい static-api.js のように混ぜて使わないよう、配信ごとに変わる版をファイルの URL に付ける
const version = (process.env.SIVREE_ASSET_VERSION ?? process.env.GITHUB_SHA)?.slice(0, 10) ?? Date.now().toString(36);
const versioned = html
  .replace('<script src="app.js">', '<script src="static-api.js"></script>\n    <script src="app.js">')
  .replace(/(<script src="(?:i18n|saved|sync|static-api|app)\.js)"/g, `$1?v=${version}"`)
  .replace('href="styles.css"', `href="styles.css?v=${version}"`);
await writeFile(indexPath, versioned);
const shellFiles = ['index.html', 'i18n.js', 'saved.js', 'sync.js', 'static-api.js', 'app.js', 'styles.css'].map(name => `${name}?v=${version}`).concat(
  (await readdir(path.join(root, 'public/locales'))).filter(name => name.endsWith('.json')).map(name => `locales/${name}?v=${version}`));
const worker = (await readFile(path.join(root, 'public/sw.js'), 'utf8'))
  .replace('__SIVREE_SHELL_VERSION__', version)
  .replace('const SHELL_FILES = [];', `const SHELL_FILES = ${JSON.stringify(shellFiles)};`);
await writeFile(path.join(site, 'sw.js'), worker);
console.log(`静的サイトを作成しました: ${site}`);
