// Updates are adopted only by an explicit tap, never by app resume.
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
let failNews = false;
const item = { id: 'aaaaaaaaaaaaaaaa', title: 'Keep this article', summary: 'Description', sourceName: 'Source', sourceType: 'official', subgroup: '日本', category: '社会', categories: ['社会'], hashtags: [], keywords: [], matches: [], publishedAt: new Date().toISOString(), url: 'https://example.test/article', feedUrl: 'feed' };
const profile = { onboarded: true, regions: ['日本'], categories: [], hiddenItems: [], excludedSources: [], topics: [] };
const respond = (body, extra = {}) => ({ ok: true, status: 200, json: async () => body, headers: new Map(), ...extra });
w.fetch = async (url) => {
  calls.push(String(url));
  if (url === '/api/profile') return respond(profile);
  if (url === '/api/filters') return respond({ categories: [], subgroups: {}, sourceTypes: [] });
  if (url === '/api/config') return respond({ generatedAt: new Date().toISOString() });
  if (String(url).startsWith('/api/news')) { if (failNews) throw new Error('offline'); return respond([item], { headers: new Map([['X-Total-Count', '1']]) }); }
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
check('記事を表示する', w.document.getElementById('newsList').textContent.includes(item.title));
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

// Returning checks for updates without replacing cards.
const realNow = w.Date.now;
w.Date.now = () => realNow() + 11 * 60 * 1000;
w.document.dispatchEvent(new w.Event('visibilitychange'));
check('復帰時は更新確認だけを行う', await until(() => count('/api/updates') >= 2));
check('復帰時に一覧を更新しない', reloadEvents === 1 && count('/api/news') === news1);
const before = w.document.getElementById('newsList').innerHTML;
w.dispatchEvent(new w.Event('sivree:update-available'));
check('新着通知で一覧を変更しない', w.document.getElementById('newsList').innerHTML === before && reloadEvents === 1);
const button = w.document.querySelector('.news-update-button');
check('新着ボタンを表示する', !button.hidden);
button.click();
check('新着ボタンを押した時だけ更新する', await until(() => reloadEvents === 2 && count('/api/news') > news1));
await until(() => button.hidden);
check('更新後に新着ボタンを隠す', button.hidden);
w.Date.now = realNow;

// Failed explicit refresh must not erase readable cards.
failNews = true;
w.dispatchEvent(new w.Event('sivree:update-available'));
const savedHTML = w.document.getElementById('newsList').innerHTML;
const newsBeforeFailure = count('/api/news');
button.click();
await until(() => count('/api/news') > newsBeforeFailure && !button.disabled);
check('通信失敗でも記事と更新ボタンを維持する', w.document.getElementById('newsList').innerHTML === savedHTML && !button.hidden);
failNews = false;

// 非表示のとき（バックグラウンド）は何もしない
Object.defineProperty(w.document, 'visibilityState', { value: 'hidden', configurable: true });
const news2 = count('/api/news');
w.document.dispatchEvent(new w.Event('visibilitychange'));
await new Promise(r => setTimeout(r, 300));
check('見えていないときは読み直さない', count('/api/news') === news2);

console.log(failures ? `失敗: ${failures}` : 'すべて成功');
process.exit(failures ? 1 : 0);
