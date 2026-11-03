// 読んだ記事の記録と既読の表示、見出しだけの記事の扱い、右スワイプで戻る操作、未操作の一覧への新着の反映を確かめる。
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const src = (await readFile(path.join(root, 'i18n.js'), 'utf8')) + '\n' + (await readFile(path.join(root, 'app.js'), 'utf8'));
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failures++; };

function open(storage = {}, { standalone = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = async () => ({ ok: true, json: async () => ({}), headers: new Map() });
  w.IntersectionObserver = class { observe() {} };
  w.matchMedia = query => ({ matches: standalone && query.includes('standalone'), addEventListener() {}, addListener() {} });
  w.Element.prototype.scrollIntoView = () => {};
  w.scrollTo = () => {};
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  // const/let はスクリプトの外から見えないので、確かめたいものだけ window に出す
  w.eval(`${src}\nwindow.__t = { state, markRead, renderCard, renderExcerpt, renderHistory, untouchedList, history: () => readHistory, setUntouched: v => { untouchedSince = v; } };`);
  return w;
}
const item = (id, extra = {}) => ({ id: id.padEnd(16, '0'), title: `title ${id}`, summary: '', sourceName: 's', sourceType: 'official', subgroup: 'x', category: 'x', categories: ['x'], hashtags: [], keywords: [], publishedAt: new Date().toISOString(), sourceUrl: 'https://example.test/a', feedUrl: 'f', matches: [], ...extra });
const card = (w, it) => { const box = w.document.createElement('div'); box.innerHTML = w.__t.renderCard(it); return box.querySelector('.card'); };

// 既読の記録
let w = open();
const a = item('a', { summary: '配信文' });
check('開く前は既読にならない', !card(w, a).classList.contains('is-read'));
w.__t.markRead(a);
check('開いた記事は一覧で既読になる', card(w, a).classList.contains('is-read'));
check('履歴は端末に保存される', JSON.parse(w.localStorage.getItem('sivree:read'))[0].id === a.id);
w.__t.markRead(item('b')); w.__t.markRead(a);
check('同じ記事を開き直すと先頭に移り、重複しない', w.__t.history().map(e => e.id).join() === [a.id, item('b').id].join());
for (let i = 0; i < 320; i++) w.__t.markRead(item(`n${i}-`));
check('履歴は300件までに抑える', w.__t.history().length === 300);
check('サンプル記事は記録しない', (() => { const n = w.__t.history().length; w.__t.markRead(item('z', { isSample: true })); return w.__t.history()[0].id !== item('z').id && w.__t.history().length === n; })());

w = open({ 'sivree:read': '{broken' });
check('壊れた履歴でも落ちない', w.__t.history().length === 0);
w = open({ 'sivree:read': JSON.stringify([{ id: item('a').id, title: 't', source: 's', url: 'https://example.test/', readAt: new Date().toISOString() }]) });
check('前回までの履歴で既読を表示する', card(w, item('a')).classList.contains('is-read'));

// 読んだ記事の画面
w.location.hash = '#/history';
w.__t.renderHistory();
const view = w.document.getElementById('savedView');
check('読んだ記事の一覧に履歴が出る', view.querySelectorAll('.history-item').length === 1);
check('一覧から Sivree の記事と元記事の両方を開ける', Boolean(view.querySelector('.history-item a[href^="#/article/"]') && view.querySelector('.history-original[href="https://example.test/"]')));
w.confirm = () => true;
view.querySelector('[data-action="clear-history"]').click();
check('「履歴を消去」で全部消える', w.__t.history().length === 0 && JSON.parse(w.localStorage.getItem('sivree:read')).length === 0);

// 見出しだけの記事
w = open();
check('本文の代わりになる文が無い記事には「見出しのみ」を付ける', Boolean(card(w, item('c')).querySelector('.headline-only-badge')));
check('配信文がある記事には付けない', !card(w, item('d', { summary: '配信文' })).querySelector('.headline-only-badge'));
check('要約がある記事には付けない', !card(w, item('e', { ai: { summary: '要約' } })).querySelector('.headline-only-badge'));
const unavailable = { status: 'unavailable', paragraphs: [], truncated: false };
const excerpt = (it, summaryState = 'idle', summary = null) => w.__t.renderExcerpt({ item: it, content: unavailable, summary, summaryState });
check('利用条件で見出しだけの記事は、その理由を先に示す', excerpt(item('f', { titleOnly: true })).includes('利用条件により'));
check('本文を取り出せなかった記事も、空欄でなく理由を示す', excerpt(item('g')).includes('本文を取り出せなかった'));
check('配信文がある記事は、要約が無くても冒頭を開いて見せる', /<details class="excerpt" open/.test(excerpt(item('h', { summary: '配信文' }))));
check('要約がある記事では冒頭は閉じたまま', !/<details class="excerpt" open/.test(excerpt(item('i', { summary: '配信文' }), 'done', { summary: '要約' })));

// 右スワイプで戻る
function swipe(win, from, to) {
  const back = win.document.getElementById('backButton');
  let clicked = 0;
  back.hidden = false;
  back.click = () => { clicked++; };
  const touch = (type, [x, y], list) => {
    const event = new win.Event(type, { bubbles: true });
    Object.defineProperty(event, list, { value: [{ clientX: x, clientY: y }] });
    win.document.body.dispatchEvent(event);
  };
  touch('touchstart', from, 'touches');
  const steps = 5;
  for (let i = 1; i <= steps; i++) touch('touchmove', [from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps], 'touches');
  touch('touchend', to, 'changedTouches');
  return clicked;
}
w = open();
check('画面の中ほどから右へスワイプすると戻る', swipe(w, [150, 300], [260, 310]) === 1);
check('縦のスクロールでは戻らない', swipe(w, [150, 300], [170, 500]) === 0);
check('左へのスワイプでは戻らない', swipe(w, [250, 300], [100, 300]) === 0);
check('短い動きでは戻らない', swipe(w, [150, 300], [190, 300]) === 0);
check('ブラウザでは左端の帯をブラウザ自身の「戻る」に任せる', swipe(w, [10, 300], [200, 300]) === 0);
w = open({}, { standalone: true });
check('ホーム画面から開いたときは左端からでも戻る', swipe(w, [10, 300], [200, 300]) === 1);

// 未操作の一覧への新着の反映
w = open();
w.__t.state.needsOnboarding = false;
w.__t.setUntouched(Date.now());
check('開いた直後で未操作なら、新着にそのまま切り替える', w.__t.untouchedList() === true);
w.dispatchEvent(new w.Event('pointerdown'));
check('一度でも操作したら、ボタンを押すまで切り替えない', w.__t.untouchedList() === false);
w.__t.setUntouched(Date.now() - 60_000);
check('開いてから時間が経っていれば切り替えない', w.__t.untouchedList() === false);

console.log(failures ? `失敗: ${failures}` : 'すべて成功');
process.exit(failures ? 1 : 0);
