// ロゴを押したとき、およびしばらく離れた後に戻ったときに、最新のデータを読み直すことを確かめる。
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const src = (await readFile(path.join(root, 'i18n.js'), 'utf8')) + '\n' + (await readFile(path.join(root, 'app.js'), 'utf8'));
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failures++; };

const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
const calls = [];
const profile = { onboarded: true, regions: ['日本'], categories: [], hiddenItems: [], excludedSources: [], topics: [] };
const respond = (body, extra = {}) => ({ ok: true, status: 200, json: async () => body, headers: new Map(), ...extra });
w.fetch = async (url) => {
  calls.push(String(url));
  if (url === '/api/profile') return respond(profile);
  if (url === '/api/filters') return respond({ categories: [], subgroups: {}, sourceTypes: [] });
  if (url === '/api/config') return respond({ generatedAt: new Date().toISOString() });
  if (String(url).startsWith('/api/news')) return respond([], { headers: new Map([['X-Total-Count', '0']]) });
  if (url === '/api/briefing') return respond({ stories: [], storyCount: 0 });
  return respond({});
};
w.IntersectionObserver = class { observe() {} };
w.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
w.Element.prototype.scrollIntoView = () => {};
w.scrollTo = () => {};
let reloadEvents = 0;
w.addEventListener('sivree:reload-data', () => { reloadEvents++; });
w.eval(src);
const until = async (cond, ms = 3000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 20)); return cond(); };
const count = (prefix) => calls.filter(c => c.startsWith(prefix)).length;

check('起動時に一覧を読み込む', await until(() => count('/api/news') >= 1));
await new Promise(r => setTimeout(r, 200));
const news0 = count('/api/news');
const config0 = count('/api/config');

w.document.getElementById('brand').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
check('ロゴを押すと、データを読み直す通知を出す', await until(() => reloadEvents === 1));
check('ロゴを押すと、更新時刻（設定）を取り直す', await until(() => count('/api/config') > config0));
check('ロゴを押すと、一覧を取り直す', await until(() => count('/api/news') > news0));

// すぐ戻ったときは読み直さない
const news1 = count('/api/news');
Object.defineProperty(w.document, 'visibilityState', { value: 'visible', configurable: true });
w.document.dispatchEvent(new w.Event('visibilitychange'));
await new Promise(r => setTimeout(r, 300));
check('離れていた時間が短いときは読み直さない', count('/api/news') === news1 && reloadEvents === 1);

// 10分以上離れた後に戻ったとき
const realNow = w.Date.now;
w.Date.now = () => realNow() + 11 * 60 * 1000;
w.document.dispatchEvent(new w.Event('visibilitychange'));
check('10分以上離れた後に戻ると読み直す', await until(() => reloadEvents === 2 && count('/api/news') > news1));
w.Date.now = realNow;

// 非表示のとき（バックグラウンド）は何もしない
Object.defineProperty(w.document, 'visibilityState', { value: 'hidden', configurable: true });
const news2 = count('/api/news');
w.document.dispatchEvent(new w.Event('visibilitychange'));
await new Promise(r => setTimeout(r, 300));
check('見えていないときは読み直さない', count('/api/news') === news2);

console.log(failures ? `失敗: ${failures}` : 'すべて成功');
process.exit(failures ? 1 : 0);
