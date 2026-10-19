// 記事の下のハッシュタグが、表示言語に合わせて訳されること（検索に使う元のタグは変わらないこと）を確かめる。
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const src = (await readFile(path.join(root, 'i18n.js'), 'utf8')) + '\n' + (await readFile(path.join(root, 'app.js'), 'utf8'));
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failures++; };

async function open(lang) {
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = async (url) => {
    const m = String(url).match(/^locales\/([\w-]+)\.json/);
    const body = m ? JSON.parse(await readFile(path.join(root, 'locales', `${m[1]}.json`), 'utf8')) : {};
    return { ok: true, json: async () => body, headers: new Map() };
  };
  w.IntersectionObserver = class { observe() {} };
  w.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.Element.prototype.scrollIntoView = () => {};
  w.scrollTo = () => {};
  w.localStorage.setItem('sivry:lang', lang);
  // const はスクリプトの外から見えないので、読み込みの完了だけ window に出す
  w.eval(`${src}\nwindow.__ready = i18nReady;`);
  await w.__ready;
  return w;
}
const label = (w, tag, item) => w.eval('(tag, item) => hashtagLabel(tag, item)')(tag, item);
const boj = { sourceName: '日本銀行' };
const wire = { sourceName: 'PR TIMES' };

let w = await open('en');
check('英語: 発信元の名前を英語にする（空白は詰める）', label(w, '#日本銀行', boj) === '#BankofJapan', label(w, '#日本銀行', boj));
check('英語: 分野を英語にする', /^#[A-Za-z]+$/.test(label(w, '#経済', boj)) && label(w, '#経済', boj) !== '#経済', label(w, '#経済', boj));
check('英語: 地域を英語にする', label(w, '#日本', boj) === '#Japan', label(w, '#日本', boj));
check('英語: 元から英語の名前はそのまま', label(w, '#PRTIMES', wire) === '#PRTIMES', label(w, '#PRTIMES', wire));
check('英語: テクノロジー・米国も英語', !/[぀-ヿ一-鿿]/.test(label(w, '#テクノロジー', boj) + label(w, '#米国', boj)), label(w, '#テクノロジー', boj) + label(w, '#米国', boj));

w = await open('ja');
check('日本語: そのまま', label(w, '#日本銀行', boj) === '#日本銀行' && label(w, '#経済', boj) === '#経済' && label(w, '#日本', boj) === '#日本');

w = await open('fr');
check('フランス語: 日本語が残らない', !/[぀-ヿ一-鿿]/.test(label(w, '#経済', boj) + label(w, '#日本', boj) + label(w, '#日本銀行', boj)), label(w, '#経済', boj) + label(w, '#日本', boj));

console.log(failures ? `失敗: ${failures}` : 'すべて成功');
process.exit(failures ? 1 : 0);
