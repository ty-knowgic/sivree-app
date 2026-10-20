// 記事の保存と引用の書き出しを確かめる。
//  1. public/saved.js の書式・統合（日付の時間帯、エスケープ、CSV の式の無効化、競合時の統合）
//  2. 実際の public/app.js を jsdom で動かし、詳細画面の保存・引用 → 保存した記事の一覧 → メモ・解除・元に戻す・書き出し
//  3. 敵意のある見出し・URL でも、実行できるものが残らないこと
// プロフィールの保存先はサーバーと同じ ProfileSchema で検証するため、画面が作る記録が実際に保存できる形かも確かめられる。
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultProfile, ProfileSchema } from '../src/profile.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const script = async (name: string) => readFile(path.join(root, name), 'utf8');
const src = `${await script('i18n.js')}\n${await script('saved.js')}\n${await script('app.js')}`;
let failures = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failures++;
};

// ---------- 1. saved.js ----------

const lib = new JSDOM('', { runScripts: 'outside-only' }).window as any;
lib.eval(await script('saved.js'));
const S = lib.SivreeSaved;

const base = {
  id: '0123456789abcdef', title: 'Policy update', sourceName: '日本銀行', sourceType: 'official', subgroup: '日本',
  sourceUrl: 'https://example.test/a(b)?x=1&y=2', publishedAt: '2026-10-14T16:30:00.000Z'
};
const ctx = {
  locale: 'en', accessed: new Date(2026, 9, 20), sourceName: () => 'Bank of Japan',
  plain: (f: any) => `${f.source}|${f.title}|${f.date}|${f.url}|${f.accessed}`
};
const record = (patch: object = {}) => ({ ...S.toSavedItem({ ...base, ...patch }, new Date(2026, 9, 20, 12)), ...patch });

check('発表日は発信元の地域の暦: 日本の朝の発表は、UTC では前日でも 15 日', S.formatCitations([record()], 'apa', ctx).includes('(2026, October 15)'));
check('発表日: カナダ・米国は 14 日のまま', ['カナダ', '米国'].every((region) => S.formatCitations([record({ subgroup: region })], 'apa', ctx).includes('(2026, October 14)')));
check('出典表記は、渡された翻訳関数の結果を使う', S.formatCitations([record()], 'plain', ctx) === 'Bank of Japan|Policy update|October 15, 2026|https://example.test/a(b)?x=1&y=2|October 20, 2026');
check('APA: 見出しの末尾に句点を重ねない', S.formatCitations([record({ title: 'What now?' })], 'apa', ctx).includes('What now? https://'));

const md = S.formatCitations([record({ title: 'A [b] *c* <d> _e_' })], 'markdown', ctx);
check('Markdown: 見出しの記号をエスケープし、URL の ( ) を変換する', md.startsWith('[A \\[b\\] \\*c\\* \\<d\\> \\_e\\_](https://example.test/a%28b%29?x=1&y=2) — Bank of Japan, 2026-10-15'), md);
check('Markdown: 複数なら箇条書き、1件なら箇条書きにしない', S.formatCitations([record(), record()], 'markdown', ctx).startsWith('- ') && !S.formatCitations([record()], 'markdown', ctx).startsWith('- '));

const bib = S.formatCitations([record({ title: 'R&D {2} 100% #1 a_b' })], 'bibtex', ctx);
check('BibTeX: 特殊文字をエスケープし、月は略号', bib.includes('R\\&D \\{2\\} 100\\% \\#1 a\\_b') && bib.includes('month = oct') && bib.includes('urldate = {2026-10-20}'), bib);
check('BibTeX: 引用キーは ASCII', /^@misc\{src2026-012345,/.test(bib), bib);

const withNote = record({ note: 'private note' });
const ris = S.formatCitations([withNote], 'ris', ctx);
check('RIS: 閲覧日（Y2）とメモ（N1）を含む', ris.includes('DA  - 2026/10/15') && ris.includes('Y2  - 2026/10/20') && ris.includes('N1  - private note') && ris.endsWith('ER  - '), ris);
check('メモは RIS・CSV 以外の引用に含めない', ['plain', 'apa', 'markdown', 'bibtex'].every((format) => !S.formatCitations([withNote], format, ctx).includes('private note')));

const csv = S.formatCitations([record({ title: '=HYPERLINK("http://evil")', note: 'line1\nline "2"' })], 'csv', ctx);
check('CSV: 先頭の BOM、式になる値の無効化、引用符と改行のエスケープ', csv.startsWith('\uFEFF"published"') && csv.includes('"\'=HYPERLINK(""http://evil"")"') && csv.includes('"line1\nline ""2"""'), csv);

check('保存の記録: 不正な URL・id・空の見出しは作らない', ['javascript:alert(1)', 'not a url', ''].every((url) => S.toSavedItem({ ...base, sourceUrl: url }) === null)
  && S.toSavedItem({ ...base, id: 'xyz' }) === null && S.toSavedItem({ ...base, title: '   ' }) === null);
check('保存の記録: 長すぎる見出しは切り詰める', S.toSavedItem({ ...base, title: 'x'.repeat(900) }).title.length === 500);
check('保存の記録: 画面が作る記録はサーバーと同じ ProfileSchema を通る', ProfileSchema.safeParse({ ...defaultProfile(), savedItems: [S.toSavedItem(base)] }).success);

const older = { ...record({ id: 'aaaaaaaaaaaaaaaa' }), savedAt: '2026-10-01T00:00:00.000Z', note: '' };
const newer = { ...record({ id: 'bbbbbbbbbbbbbbbb' }), savedAt: '2026-10-05T00:00:00.000Z' };
const merged = S.mergeSavedItems([older], [newer, { ...older, note: 'remote note' }]);
check('統合: 両方の記事を残し、新しい順に並べる', merged.map((entry: any) => entry.id).join() === 'bbbbbbbbbbbbbbbb,aaaaaaaaaaaaaaaa', merged.map((entry: any) => entry.id));
check('統合: 同じ記事は1つにし、メモは空でないほうを残す', merged.length === 2 && merged[1].note === 'remote note');

// ---------- 2. 画面 ----------

const state = { profile: { ...defaultProfile(), onboarded: true } as any, writes: 0 };
const item = { ...base, category: '経済', categories: ['経済'], hashtags: [], keywords: [], summary: '' };
const copied: string[] = [];
const downloads: { name: string; blob: any }[] = [];

async function openApp(profile: any) {
  state.profile = structuredClone(profile);
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window as any;
  const respond = (body: unknown, status = 200, extra: object = {}) => ({ ok: status < 400, status, json: async () => body, headers: new Map(), ...extra });
  w.fetch = async (url: string, init: any = {}) => {
    url = String(url);
    const dictionary = url.match(/^locales\/([\w-]+)\.json/);
    if (dictionary) return respond(JSON.parse(await readFile(path.join(root, 'locales', `${dictionary[1]}.json`), 'utf8')));
    if (url === '/api/profile') {
      if (init.method === 'PUT') {
        const parsed = ProfileSchema.safeParse(JSON.parse(init.body));
        if (!parsed.success) return respond({ error: 'invalid' }, 400);
        state.profile = parsed.data;
        state.writes++;
        return respond(state.profile);
      }
      return respond(state.profile);
    }
    if (url === '/api/options') return respond({ regions: [{ value: '日本', sources: 3 }], categories: [{ value: '経済', articles: 5 }], topics: [] });
    if (url === '/api/filters') return respond({ categories: [], regions: [], sourceTypes: [] });
    if (url === '/api/sources') return respond([]);
    if (url === '/api/briefing') return respond({ stories: [], storyCount: 0 });
    if (url.startsWith('/api/news?')) return respond([], 200, { headers: new Map([['X-Total-Count', '0']]) });
    if (url.endsWith('/summary')) return respond({ error: 'none' }, 502);
    if (url.startsWith('/api/news/')) return respond({ item, content: { status: 'unavailable', paragraphs: [], truncated: false }, related: [], summary: null });
    return respond({});
  };
  w.IntersectionObserver = class { observe() {} };
  w.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.Element.prototype.scrollIntoView = () => {};
  w.scrollTo = () => {};
  w.confirm = () => true;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (text: string) => { copied.push(text); } }, configurable: true });
  // Blob の中身を読めるよう、渡された文字列を控える
  const NativeBlob = w.Blob;
  w.Blob = class extends NativeBlob { text_: string; constructor(parts: string[], options: object) { super(parts, options); this.text_ = parts.join(''); } };
  w.URL.createObjectURL = (blob: any) => { downloads.push({ name: '', blob }); return 'blob:test'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads[downloads.length - 1].name = this.download; };
  w.localStorage.setItem('sivry:lang', 'en');
  w.eval(`${src}\nwindow.__t = { renderCard, setSaved, renderSaved, renderCitePanel, get saved() { return savedItems; } };\nwindow.__ready = i18nReady;`);
  await w.__ready;
  return w;
}

const until = async (condition: () => unknown, ms = 3000) => {
  const start = Date.now();
  while (!condition() && Date.now() - start < ms) await new Promise((r) => setTimeout(r, 20));
  return Boolean(condition());
};
const click = (w: any, el: Element | null) => el?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const $ = (w: any, selector: string) => w.document.querySelector(selector) as HTMLElement | null;
const go = async (w: any, hash: string) => { w.location.hash = hash; await new Promise((r) => setTimeout(r, 60)); };

let w = await openApp({ ...defaultProfile(), onboarded: true });
await go(w, `#/article/${item.id}`);
check('詳細画面に「保存」「引用」が出る', await until(() => $(w, '[data-action="toggle-save"]') && $(w, '[data-action="toggle-cite"]')));
check('保存前は押されていない表示', $(w, '[data-action="toggle-save"]')!.getAttribute('aria-pressed') === 'false');

click(w, $(w, '[data-action="toggle-save"]'));
check('「保存」を押すとプロフィールに記録される', await until(() => state.profile.savedItems.length === 1));
const stored = state.profile.savedItems[0];
check('記録は引用に必要な情報だけ（原題・発信元・URL・日付）', stored.title === item.title && stored.sourceName === '日本銀行' && stored.url === item.sourceUrl && stored.publishedAt === item.publishedAt && stored.note === '' && !('summary' in stored), stored);
check('ボタンが「保存済み」になり、アプリバーの件数が 1', await until(() => $(w, '[data-action="toggle-save"]')?.getAttribute('aria-pressed') === 'true' && $(w, '#savedCount')?.textContent === '1' && !$(w, '#savedCount')!.hidden));
check('保存の通知に「保存した記事」への導線', $(w, '.toast')?.textContent?.includes('Article saved') === true && $(w, '.toast-action') !== null);

click(w, $(w, '[data-action="toggle-cite"]'));
check('「引用」で出典表記の欄が開く', await until(() => $(w, '.cite-text')));
const plain = $(w, '.cite-text')!.textContent!;
check('出典表記: 発信元名は表示言語、原題、地域の発表日、URL、閲覧日', plain.startsWith(`Bank of Japan, “Policy update” (published October 15, 2026), ${item.sourceUrl} (accessed `) && /accessed [A-Z][a-z]+ \d+, \d{4}\)$/.test(plain), plain);

click(w, $(w, '[data-cite-format="apa"]'));
await until(() => $(w, '.cite-text')?.textContent?.startsWith('Bank of Japan. (2026, October 15).'));
check('書式を APA に切り替えられる', $(w, '.cite-text')!.textContent!.startsWith('Bank of Japan. (2026, October 15). Policy update'), $(w, '.cite-text')!.textContent!);
click(w, $(w, '[data-action="copy-cite"]'));
check('「引用をコピー」でクリップボードへ（APA）', await until(() => copied.length === 1) && copied[0].startsWith('Bank of Japan. (2026, October 15).'), copied);
check('選んだ書式は覚えておく', w.localStorage.getItem('sivree:citeFormat') === 'apa');

// 保存した記事の一覧
await go(w, '#/saved');
check('保存した記事の一覧が開く（戻る以外のアプリバーの操作は隠れる）', await until(() => $(w, '.saved-item')) && !$(w, '#savedView')!.hidden && w.document.body.classList.contains('is-detail'));
check('一覧に原題へのリンク（発信元のページ、新しいタブ、noopener）', ($(w, '.saved-title a') as HTMLAnchorElement).href === item.sourceUrl && $(w, '.saved-title a')!.getAttribute('rel')!.includes('noopener') && $(w, '.saved-item')!.textContent!.includes('Bank of Japan'));
check('保存した記事の件数ボタン（{n} 件の引用をコピー）', $(w, '[data-action="copy-saved"]')!.textContent === 'Copy 1 citation', $(w, '[data-action="copy-saved"]')!.textContent!);

const area = $(w, 'textarea[data-note-for]') as HTMLTextAreaElement;
area.value = 'Check the footnote';
area.dispatchEvent(new w.Event('change', { bubbles: true }));
check('メモを書くと保存される', await until(() => state.profile.savedItems[0].note === 'Check the footnote'), state.profile.savedItems[0]);

const search = $(w, '[data-saved-search]') as HTMLInputElement;
search.value = 'zzz-nothing';
search.dispatchEvent(new w.Event('input', { bubbles: true }));
check('検索: 一致しなければ空の表示と 0 件', await until(() => $(w, '#savedList .empty-state')) && $(w, '[data-action="copy-saved"]')!.textContent === 'Copy 0 citations');
search.value = 'footnote';
search.dispatchEvent(new w.Event('input', { bubbles: true }));
check('検索: メモの内容でも探せる', await until(() => $(w, '.saved-item')));

const formatSelect = $(w, '.saved-format') as HTMLSelectElement;
formatSelect.value = 'csv';
formatSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
copied.length = 0;
click(w, $(w, '[data-action="copy-saved"]'));
check('CSV をコピーすると、Excel 用の BOM は付けず、メモを含む', await until(() => copied.length === 1) && copied[0].startsWith('"published"') && copied[0].includes('Check the footnote'), copied);
click(w, $(w, '[data-action="download-saved"]'));
check('ファイルに保存: ファイル名と種類（CSV）', await until(() => downloads.length === 1 && downloads[0].name !== '') && /^sivree-saved-\d{4}-\d{2}-\d{2}\.csv$/.test(downloads[0].name) && downloads[0].blob.type.startsWith('text/csv'), downloads.map((d) => d.name));
check('ファイルの先頭は BOM（Excel が UTF-8 と判断する）で、メモを含む', downloads[0].blob.text_.startsWith('\uFEFF"published"') && downloads[0].blob.text_.includes('Check the footnote'));

click(w, $(w, '[data-action="unsave"]'));
check('「保存を解除」で記録が消え、空の表示になる', await until(() => state.profile.savedItems.length === 0) && await until(() => $(w, '#savedList .empty-state')));
click(w, $(w, '.toast-action'));
check('「元に戻す」で、メモも保存した日時も元のまま戻る', await until(() => state.profile.savedItems.length === 1) && state.profile.savedItems[0].note === 'Check the footnote' && state.profile.savedItems[0].savedAt === stored.savedAt, state.profile.savedItems);

// 設定の貼り付けは、この端末の保存した記事を消さない
await go(w, '#/settings');
await until(() => $(w, '[data-action="paste-settings"]'));
click(w, $(w, '[data-action="paste-settings"]'));
($(w, '.paste-box textarea') as HTMLTextAreaElement).value = JSON.stringify({ ...defaultProfile(), onboarded: true, savedItems: [{ ...S.toSavedItem({ ...base, id: 'cccccccccccccccc', title: 'From another device' }) }] });
click(w, $(w, '[data-action="import-settings"]'));
check('設定の貼り付け: 貼り付けた記事とこの端末の記事の両方が残る', await until(() => state.profile.savedItems.length === 2) && state.profile.savedItems.some((entry: any) => entry.title === 'From another device') && state.profile.savedItems.some((entry: any) => entry.note === 'Check the footnote'), state.profile.savedItems.map((e: any) => e.title));
check('貼り付けた設定に保存した記事がなくても（古いコピー）消さない', await (async () => {
  await go(w, '#/settings');
  await until(() => $(w, '[data-action="paste-settings"]'));
  click(w, $(w, '[data-action="paste-settings"]'));
  const { savedItems: _omit, ...legacy } = { ...defaultProfile(), onboarded: true } as any;
  ($(w, '.paste-box textarea') as HTMLTextAreaElement).value = JSON.stringify(legacy);
  click(w, $(w, '[data-action="import-settings"]'));
  await new Promise((r) => setTimeout(r, 200));
  return state.profile.savedItems.length === 2;
})());

// 一覧のカードに「保存済み」の印
const card = w.document.createElement('div');
w.__t.setSaved([stored]);
card.innerHTML = w.__t.renderCard({ ...item, matches: [], related: [], ai: undefined });
check('一覧のカードに保存済みの印', card.querySelector('.saved-mark') !== null);
w.__t.setSaved([]);
card.innerHTML = w.__t.renderCard({ ...item, matches: [], related: [], ai: undefined });
check('保存していない記事には印がない', card.querySelector('.saved-mark') === null);

// 上限
w = await openApp({ ...defaultProfile(), onboarded: true, savedItems: Array.from({ length: S.LIMIT }, (_, i) => ({ ...S.toSavedItem({ ...base, id: i.toString(16).padStart(16, '0') }) })) });
await go(w, `#/article/${item.id}`);
await until(() => $(w, '[data-action="toggle-save"]'));
click(w, $(w, '[data-action="toggle-save"]'));
check(`上限（${S.LIMIT} 件）では保存せず、理由を伝える`, await until(() => $(w, '.toast')?.textContent?.includes('limit')) && state.profile.savedItems.length === S.LIMIT, $(w, '.toast')?.textContent ?? '');

// ---------- 3. 敵意のある内容 ----------

const P = ['<img src=x onerror="window.__pwned++">', '"><script>window.__pwned++</script>', '<svg onload="window.__pwned++">', "' onmouseover='window.__pwned++' x='"];
w = await openApp({ ...defaultProfile(), onboarded: true });
w.__pwned = 0;
const hostile = P.map((payload, i) => ({
  id: `${i}`.padStart(16, 'd'), title: payload, sourceName: payload, sourceType: 'official', subgroup: payload,
  url: `https://example.test/a"onmouseover="window.__pwned++&q=${encodeURIComponent(payload)}`, publishedAt: payload, savedAt: new Date().toISOString(), note: payload
}));
w.__t.setSaved(hostile);
w.__t.renderSaved();
const holder = w.document.createElement('div');
holder.append(w.document.getElementById('savedView').cloneNode(true));
holder.insertAdjacentHTML('beforeend', hostile.map((entry) => w.__t.renderCitePanel(entry)).join(''));
// 検査が空振りしていないこと: 敵意のある文字列は、タグとしてではなく、文字として表示されている
check('（確認）一覧と引用の欄に、敵意のある文字列が文字として描画されている', holder.querySelectorAll('.saved-item').length === hostile.length && holder.querySelectorAll('.cite-text').length === hostile.length && holder.textContent!.includes(P[0]));
const bad: string[] = [];
for (const el of holder.querySelectorAll('*')) {
  const tag = el.tagName.toLowerCase();
  if (['script', 'iframe', 'object', 'embed', 'style'].includes(tag)) bad.push(`<${tag}>`);
  if (tag === 'svg' && !el.hasAttribute('aria-hidden')) bad.push('<svg>（アイコン以外）');
  for (const attr of Array.from(el.attributes) as Attr[]) {
    if (/^on/i.test(attr.name)) bad.push(`${tag}[${attr.name}]`);
    if (['href', 'src'].includes(attr.name) && /^\s*javascript:/i.test(attr.value)) bad.push(`${tag}[${attr.name}=javascript:]`);
  }
}
check('保存した記事の一覧と引用の表示: 敵意のある内容でも実行できるものが残らない', bad.length === 0 && w.__pwned === 0, [...new Set(bad)].join(', ') || `実行された: ${w.__pwned}`);

console.log(failures ? `失敗: ${failures}` : 'すべて成功');
process.exit(failures ? 1 : 0);
