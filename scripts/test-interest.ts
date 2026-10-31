// 記事の「関心がない…」（優先度を下げる・除外キーワードを足す・発信元をオフ・今回だけ隠す）を確かめる。
//  1. public/interest.js の処理（優先度の段階、除外キーワードの検証、記録の取り消し、見出しからの候補）
//  2. 除外キーワードが一致判定と並び順に効くこと（src/profile.ts）
//  3. 実際の public/app.js を jsdom で動かし、一覧・詳細のメニュー → 保存 → 元に戻す → 設定の「関心の調整」
//  4. 悪意のあるトピック名・見出しでも、実行できるものが残らないこと
// 設定の保存先はサーバーと同じ ProfileSchema で検証し、一覧はサーバーと同じ rankForYou で作る。
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADJUSTMENTS_LIMIT, defaultProfile, EXCLUDE_KEYWORDS_LIMIT, matchTopics, ProfileSchema, rankForYou } from '../src/profile.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const script = async (name: string) => readFile(path.join(root, name), 'utf8');
const src = `${await script('i18n.js')}\n${await script('saved.js')}\n${await script('interest.js')}\n${await script('app.js')}`;
let failures = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failures++;
};

const topic = (id: string, label: string, keywords: string[], weight: number, extra: object = {}) => ({
  id, label, enabled: true, keywords, alsoRequires: [], alsoRequiresRegions: [], regions: [], sourceTypes: [], sources: [], boostOnly: false, weight, ...extra
});
const ID = (digit: string) => digit.repeat(16);
const article = (digit: string, title: string, sourceName: string, extra: object = {}) => ({
  id: ID(digit), title, summary: '', sourceName, sourceType: 'official', subgroup: '日本', category: '経済', categories: ['経済'], hashtags: [], keywords: [],
  publishedAt: new Date(Date.now() - Number(digit) * 60_000).toISOString(), sourceUrl: `https://example.test/${digit}`, feedUrl: `https://example.test/feed-${digit}`, ...extra
});
const profileOf = (over: object = {}) => ({ ...defaultProfile(), onboarded: true, regions: ['日本'], categories: ['経済'], ...over }) as any;

// ---------- 1. interest.js ----------

const lib = new JSDOM('', { runScripts: 'outside-only' }).window as any;
lib.eval(await script('interest.js'));
const I = lib.SivreeInterest;
const base = () => profileOf({ topics: [topic('genai', 'トピックA', ['AI'], 1.6), topic('edu', 'トピックB', ['classrooms'], 1), topic('mini', 'トピックC', ['ZZZ'], 0.6)] });
const now = new Date('2026-10-27T01:00:00.000Z');

check('優先度の段階を1つ下げる: 最優先 → 高 → 中 → 低、低はこれ以上下げない', I.lowerStep(2.2) === 1.6 && I.lowerStep(1.6) === 1 && I.lowerStep(1) === 0.6 && I.lowerStep(0.6) === null);
check('段階の間の値（初期設定の 1.2 など）は、近い段階の1つ下', I.lowerStep(1.2) === 0.6 && I.lowerStep(1.9) === 1);

{
  const before = base();
  const frozen = JSON.stringify(before);
  const result = I.lowerWeight(before, 'genai', 'AI tutors enter classrooms', now);
  check('優先度を下げる: 対象のトピックだけが1段階下がる', result.profile.topics.map((t: any) => t.weight).join() === '1,1,0.6');
  check('優先度を下げる: 記録（元の値・新しい値・トピック名・見出し・日時）が先頭に付く', JSON.stringify([result.entry.kind, result.entry.from, result.entry.to, result.entry.topicId, result.entry.topicLabel, result.entry.title, result.entry.at]) === JSON.stringify(['weight', 1.6, 1, 'genai', 'トピックA', 'AI tutors enter classrooms', now.toISOString()]) && result.profile.adjustments[0] === result.entry);
  check('元のプロフィールは書き換えない', JSON.stringify(before) === frozen);
  check('記録は保存できる形（ProfileSchema を通る）', ProfileSchema.safeParse(result.profile).success, ProfileSchema.safeParse(result.profile));
  check('すでに最低なら下げない（lowest）、トピックがなければ no-topic', I.lowerWeight(before, 'mini', 't').error === 'lowest' && I.lowerWeight(before, 'nope', 't').error === 'no-topic');
  check('見出しは 120 文字までにする', I.lowerWeight(before, 'genai', 'x'.repeat(300)).entry.title.length === 120);
}

{
  const p = base();
  const added = I.addExclude(p, 'genai', '  tutors   and  more ', 'AI tutors', now);
  check('除外キーワード: 前後と途中の空白を整えて足す', added.profile.topics[0].excludeKeywords.join() === 'tutors and more' && added.entry.keyword === 'tutors and more' && added.entry.kind === 'exclude');
  check('除外キーワード: ほかのトピックには足さない', added.profile.topics[1].excludeKeywords === undefined);
  check('除外キーワード: 空は empty、大文字小文字だけが違う語は duplicate、トピックがなければ no-topic',
    I.addExclude(p, 'genai', '   ').error === 'empty' && I.addExclude(added.profile, 'genai', 'TUTORS AND MORE').error === 'duplicate' && I.addExclude(p, 'nope', 'x').error === 'no-topic');
  check('除外キーワード: 60 文字までにする', I.addExclude(p, 'genai', 'y'.repeat(100)).entry.keyword.length === 60);
  let full = p;
  for (let i = 0; i < EXCLUDE_KEYWORDS_LIMIT; i++) full = I.addExclude(full, 'genai', `word${i}`).profile;
  check(`除外キーワード: ${EXCLUDE_KEYWORDS_LIMIT} 件で上限（limit）`, full.topics[0].excludeKeywords.length === EXCLUDE_KEYWORDS_LIMIT && I.addExclude(full, 'genai', 'one-more').error === 'limit' && ProfileSchema.safeParse(full).success);
}

{
  // 記録は新しい順に、上限まで
  let p = base();
  for (let i = 0; i < ADJUSTMENTS_LIMIT + 10; i++) p = I.addExclude(p, ['genai', 'edu', 'mini'][i % 3], `w${i}`, '', new Date(now.getTime() + i * 1000)).profile;
  check(`調整の記録は新しい順に ${ADJUSTMENTS_LIMIT} 件まで（古いものから外れる）`, p.adjustments.length === ADJUSTMENTS_LIMIT && p.adjustments[0].keyword === `w${ADJUSTMENTS_LIMIT + 9}` && ProfileSchema.safeParse(p).success);
}

{
  const p0 = base();
  const w1 = I.lowerWeight(p0, 'genai', 'a', new Date(now.getTime() + 1000));
  const w2 = I.lowerWeight(w1.profile, 'genai', 'b', new Date(now.getTime() + 2000));
  check('優先度を続けて下げると、1.6 → 1 → 0.6', w2.profile.topics[0].weight === 0.6 && w2.profile.adjustments.length === 2);
  check('状態: 新しい記録は active、古い記録は changed（優先度がもう違う）', I.stateOf(w2.profile, w2.entry) === 'active' && I.stateOf(w2.profile, w1.entry) === 'changed');
  const newerFirst = I.undo(I.undo(w2.profile, w2.entry.id), w1.entry.id);
  check('新しい調整から順に取り消すと、元の 1.6 まで戻る', newerFirst.topics[0].weight === 1.6 && newerFirst.adjustments.length === 0);
  const olderFirst = I.undo(w2.profile, w1.entry.id);
  check('古い調整を先に取り消しても、いまの優先度は変えず、記録だけを消す', olderFirst.topics[0].weight === 0.6 && olderFirst.adjustments.length === 1 && olderFirst.adjustments[0].id === w2.entry.id);

  const odd = profileOf({ topics: [topic('genai', 'トピックA', ['AI'], 1.2)] });
  const lowered = I.lowerWeight(odd, 'genai', 't');
  check('段階の間の値は、取り消すと元の値（1.2）そのままに戻る', I.undo(lowered.profile, lowered.entry.id).topics[0].weight === 1.2);

  const ex = I.addExclude(p0, 'edu', 'Desks', 't');
  check('状態: 除外キーワードが残っていれば active、取り消すと外れる', I.stateOf(ex.profile, ex.entry) === 'active' && I.undo(ex.profile, ex.entry.id).topics[1].excludeKeywords.length === 0);
  const edited = { ...ex.profile, topics: ex.profile.topics.map((t: any) => (t.id === 'edu' ? { ...t, excludeKeywords: [] } : t)) };
  check('状態: 設定で語を消していれば changed。取り消しは記録だけを消す', I.stateOf(edited, ex.entry) === 'changed' && I.undo(edited, ex.entry.id).adjustments.length === 0);
  const deleted = { ...ex.profile, topics: ex.profile.topics.filter((t: any) => t.id !== 'edu') };
  check('状態: トピックを削除していれば missing。取り消しは記録だけを消す', I.stateOf(deleted, ex.entry) === 'missing' && I.undo(deleted, ex.entry.id).adjustments.length === 0 && I.undo(deleted, ex.entry.id).topics.length === 2);
  check('知らない記録の取り消しは何も変えない', JSON.stringify(I.undo(ex.profile, 'nothing1')) === JSON.stringify(ex.profile));
  const caseless = I.addExclude(p0, 'edu', 'Desks', 't');
  const lowercase = { ...caseless.profile, topics: caseless.profile.topics.map((t: any) => (t.id === 'edu' ? { ...t, excludeKeywords: ['desks'] } : t)) };
  check('除外キーワードの照合は大文字小文字を区別しない', I.stateOf(lowercase, caseless.entry) === 'active' && I.undo(lowercase, caseless.entry.id).topics[1].excludeKeywords.length === 0);
}

{
  const words = I.suggestWords(['AI tutors enter the classrooms in 2026', '']);
  check('見出しの語: 英語は 3 字以上の語だけを順に拾い、短い語・ストップワード・数字は除く', words.join() === 'tutors,enter,classrooms', words);
  check('見出しの語: 重複（大文字小文字の違い）は1つにまとめ、10 語まで', I.suggestWords(['Policy policy POLICY', 'a b c']).join() === 'Policy' && I.suggestWords([Array.from({ length: 30 }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}${i}`).join(' ')]).length === 10);
  const ja = I.suggestWords(['AIの家庭教師が学校で使われる', '']);
  check('見出しの語: 日本語も拾う（助詞の短いひらがなは除く）', ja.length > 0 && ja.every((word: string) => !/^[ぁ-ん]{1,2}$/.test(word) && word.length >= 2), ja);
  const bare = new JSDOM('', { runScripts: 'outside-only' }).window as any;
  bare.eval('Intl.Segmenter = undefined;');
  bare.eval(await script('interest.js'));
  check('見出しの語: Intl.Segmenter がなければ空（入力欄だけで使える）', bare.SivreeInterest.suggestWords(['AI tutors enter classrooms']).length === 0);
}

// ---------- 2. 一致判定と並び順 ----------

{
  const item = (title: string, extra: object = {}) => ({ ...article('1', title, '文部科学省'), ...extra }) as any;
  const withExclude = (words: string[], extra: object = {}) => profileOf({ topics: [topic('genai', 'トピックA', ['AI'], 1.6, { excludeKeywords: words, ...extra })] });
  const ids = (profile: any, entry: any) => matchTopics(entry, profile).map(match => match.id).join();

  check('除外なし: キーワードに一致する', ids(withExclude([]), item('AI tutors enter classrooms')) === 'genai');
  check('除外キーワードを含む見出しは、そのトピックに一致しない', ids(withExclude(['tutors']), item('AI tutors enter classrooms')) === '');
  check('大文字小文字は区別しない', ids(withExclude(['TUTORS']), item('AI tutors enter classrooms')) === '');
  check('英字は単語単位（tutor は tutors に当たらない）', ids(withExclude(['tutor']), item('AI tutors enter classrooms')) === 'genai');
  check('日本語は部分一致', ids(withExclude(['家庭教師']), item('AI家庭教師の普及')) === '' && ids(withExclude(['家庭']), item('AI家庭教師の普及')) === '');
  check('説明文（summary）だけに含まれる語でも除く', ids(withExclude(['Spring']), item('AI roadmap', { summary: 'Spring session' })) === '');
  check('除外キーワードが空の配列・未設定でも同じ', ids(withExclude([]), item('AI x')) === 'genai' && ids(profileOf({ topics: [topic('genai', 'トピックA', ['AI'], 1.6)] }), item('AI x')) === 'genai');
  check('ほかのトピックには影響しない（同じ記事は別のトピックに一致する）',
    matchTopics(item('AI tutors enter classrooms'), profileOf({ topics: [topic('genai', 'トピックA', ['AI'], 1.6, { excludeKeywords: ['tutors'] }), topic('edu', 'トピックB', ['classrooms'], 1)] })).map(match => match.id).join() === 'edu');
  check('発信元で一致するトピックでも、除外キーワードを含む記事は一致しない',
    ids(profileOf({ topics: [topic('boj', '日銀', [], 1, { sources: ['文部科学省'], excludeKeywords: ['ETF'] })] }), item('ETF の買入れ')) === ''
    && ids(profileOf({ topics: [topic('boj', '日銀', [], 1, { sources: ['文部科学省'], excludeKeywords: ['ETF'] })] }), item('政策決定会合')) === 'boj');
  check('補助だけのトピックに残った記事は、これまでどおり対象外',
    ids(profileOf({ topics: [topic('genai', 'トピックA', ['AI'], 1.6, { excludeKeywords: ['tutors'] }), topic('bizdev', '提携', ['classrooms'], 1, { boostOnly: true })] }), item('AI tutors enter classrooms')) === '');
  check('語を外すと、また一致する（元に戻せる）', ids(withExclude([]), item('AI tutors enter classrooms')) === 'genai');

  // 優先度を下げると並び順が変わる
  const articles = [article('1', 'AI roadmap', '経済産業省'), article('2', 'Classrooms get desks', '文部科学省')] as any[];
  const topicsOrder = profileOf({ topics: [topic('genai', 'トピックA', ['AI'], 1.6), topic('edu', 'トピックB', ['classrooms'], 1.2)] });
  const order = (profile: any) => rankForYou(articles, profile).map(entry => entry.id[0]).join('');
  const lowered = I.lowerWeight(topicsOrder, 'genai', 't');
  const restored = I.undo(lowered.profile, lowered.entry.id);
  check('優先度を下げると並びが下がり、取り消すと元の並びに戻る', order(topicsOrder) === '12' && order(lowered.profile) === '21' && order(restored) === '12', [order(topicsOrder), order(lowered.profile), order(restored)]);
}

// ---------- 3. 画面（本物の app.js） ----------

const state = { profile: profileOf() as any, newsFetches: 0, sources: [] as any[] };
const articles = [
  article('1', 'AI tutors enter classrooms', '文部科学省'),
  article('2', 'AI chips roadmap', '経済産業省'),
  article('3', 'Classrooms get new desks', '文部科学省'),
  article('4', 'ZZZ report', '総務省')
];
const sourceIdOf = (entry: any) => `00000000${entry.id[0]}0`;

async function openApp(profile: object, news: any[] = articles) {
  state.profile = ProfileSchema.parse(structuredClone(profile));
  state.newsFetches = 0;
  state.sources = news.map(entry => ({ id: sourceIdOf(entry), sourceName: entry.sourceName, label: entry.sourceName, feedUrl: entry.feedUrl, candidate: false, subgroup: '日本', sourceType: 'official', categories: ['経済'], enabled: true }));
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window as any;
  const respond = (body: unknown, status = 200, extra: object = {}) => ({ ok: status < 400, status, json: async () => body, headers: new Map(), ...extra });
  const visible = () => news.filter(entry => !state.profile.hiddenItems.includes(entry.id) && !state.profile.excludedSources.includes(sourceIdOf(entry)));
  const withMatches = (entry: any) => ({ ...entry, matches: matchTopics(entry, state.profile) });
  w.fetch = async (url: string, init: any = {}) => {
    url = String(url);
    const dictionary = url.match(/^locales\/([\w-]+)\.json/);
    if (dictionary) return respond(JSON.parse(await readFile(path.join(root, 'locales', `${dictionary[1]}.json`), 'utf8')));
    if (url === '/api/profile') {
      if (init.method === 'PUT') {
        const parsed = ProfileSchema.safeParse(JSON.parse(init.body));
        if (!parsed.success) return respond({ error: 'invalid' }, 400);
        state.profile = parsed.data;
        return respond(state.profile);
      }
      return respond(state.profile);
    }
    if (url === '/api/options') return respond({ regions: [{ value: '日本', sources: 3 }], categories: [{ value: '経済', articles: 5 }], topics: [] });
    if (url === '/api/filters') return respond({ categories: [], regions: [], sourceTypes: [] });
    if (url === '/api/sources') return respond(state.sources.map(source => ({ ...source, enabled: !state.profile.excludedSources.includes(source.id) })));
    if (url === '/api/briefing') return respond({ stories: [], storyCount: 0 });
    if (url === '/api/config') return respond({ semantic: null });
    if (url.startsWith('/api/news?')) {
      state.newsFetches++;
      const params = new URL(url, 'https://example.test').searchParams;
      const list = params.get('forYou') === '1' ? rankForYou(visible() as any, state.profile) : visible().map(withMatches);
      return respond(list, 200, { headers: new Map([['X-Total-Count', String(list.length)]]) });
    }
    if (url.endsWith('/summary')) return respond({ error: 'none' }, 502);
    const detail = url.match(/^\/api\/news\/(\w+)$/);
    if (detail) {
      const entry = news.find(candidate => candidate.id === detail[1]);
      return entry ? respond({ item: withMatches(entry), content: { status: 'unavailable', paragraphs: [], truncated: false }, related: [], summary: null }) : respond({}, 404);
    }
    return respond({});
  };
  w.IntersectionObserver = class { observe() {} };
  w.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.Element.prototype.scrollIntoView = () => {};
  w.scrollTo = () => {};
  w.confirm = () => true;
  w.localStorage.setItem('sivry:lang', 'en');
  w.eval(`${src}\nwindow.__t = { renderHero, renderCard, openInterestSheet, get sheet() { return interestSheet; } };\nwindow.__ready = i18nReady;`);
  await w.__ready;
  return w;
}

const until = async (condition: () => unknown, ms = 3000) => {
  const start = Date.now();
  while (!condition() && Date.now() - start < ms) await new Promise(resolve => setTimeout(resolve, 20));
  return Boolean(condition());
};
const settle = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms));
const click = (w: any, el: Element | null) => el?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const $ = (w: any, selector: string) => w.document.querySelector(selector) as HTMLElement | null;
const $$ = (w: any, selector: string) => [...w.document.querySelectorAll(selector)] as HTMLElement[];
/** 保存の後始末（画面の取り直しなど）が終わってから窓を閉じる */
const finish = async (...windows: any[]) => {
  await settle(250);
  windows.forEach(entry => entry.close());
};
const go = async (w: any, hash: string) => { w.location.hash = hash; await settle(80); };
const cardButton = (w: any, digit: string) => $(w, `.interest-button[data-id="${ID(digit)}"]`)!;
const options = (w: any) => $$(w, '#interestSheet .sheet-option');
const openMenu = async (w: any, digit: string) => {
  click(w, cardButton(w, digit));
  return until(() => $(w, '#interestSheet .sheet-option'));
};
const clickOption = (w: any, action: string, topicId = '') => click(w, options(w).find(option => option.dataset.sheet === action && (!topicId || option.dataset.topic === topicId)) ?? null);
const weights = () => Object.fromEntries(state.profile.topics.map((entry: any) => [entry.id, entry.weight]));
const listTitles = (w: any) => $$(w, '.card-title').map(el => el.textContent);

const profile1 = profileOf({ topics: [topic('genai', 'トピックA', ['AI'], 1.6), topic('edu', 'トピックB', ['classrooms'], 1), topic('mini', 'トピックC', ['ZZZ'], 0.6)] });

{
  const w = await openApp(profile1);
  check('一覧に4件のカードが出る', await until(() => $$(w, '.card-wrap').length === 4), $$(w, '.card-wrap').length);
  check('各カードに「関心がない…」のボタンがあり、リンクの外にある', $$(w, '.card-wrap').every(el => el.querySelector(':scope > a.card') && el.querySelector(':scope > button.interest-button')) && $$(w, 'a.card button').length === 0);
  const button = cardButton(w, '2');
  check('ボタンには名前があり、画面（ダイアログ）を開くことが伝わる', button.getAttribute('aria-label') === 'Not interested…' && button.getAttribute('aria-haspopup') === 'dialog' && button.getAttribute('type') === 'button');
  const hero = w.__t.renderHero({ ...articles[0], matches: [] });
  check('先頭の大きなカードにも同じボタンが付く（画像の上に重ねる）', hero.includes('class="hero-wrap"') && hero.includes('interest-button is-on-image') && hero.indexOf('</a>') < hero.indexOf('interest-button'));
  check('サンプル記事にはボタンを出さない', !w.__t.renderCard({ ...articles[0], isSample: true, matches: [] }).includes('interest-button'));

  // ---- 一致するトピックが1つの記事: 優先度を下げる ----
  const hashBefore = w.location.hash;
  check('ボタンを押すと画面が開く（記事は開かない）', await openMenu(w, '2') && w.location.hash === hashBefore);
  const sheet = $(w, '#interestSheet .sheet')!;
  check('画面はダイアログとして読み上げられ、最初の選択肢に移る', sheet.getAttribute('role') === 'dialog' && sheet.getAttribute('aria-modal') === 'true' && sheet.getAttribute('aria-labelledby') === 'interestSheetTitle' && w.document.activeElement === options(w)[0] && w.document.body.classList.contains('has-sheet'));
  check('4つの選択肢: 優先度を下げる・除外キーワード・発信元をオフ・今回だけ隠す', options(w).map(option => option.dataset.sheet).join() === 'lower,exclude,mute,hide', options(w).map(option => option.dataset.sheet));
  check('優先度の選択肢には、変わる内容（高 → 中）が出る', options(w)[0].textContent!.includes('High → Medium'), options(w)[0].textContent!);
  check('見出しが画面に出る', $(w, '#interestSheet .sheet-article')!.textContent === 'AI chips roadmap');

  const fetchesBefore = state.newsFetches;
  clickOption(w, 'lower');
  check('「優先度を下げる」: 優先度が1段階下がり、記録が残る', await until(() => weights().genai === 1) && state.profile.adjustments.length === 1 && state.profile.adjustments[0].kind === 'weight' && state.profile.adjustments[0].from === 1.6 && state.profile.adjustments[0].to === 1 && state.profile.adjustments[0].title === 'AI chips roadmap', state.profile.adjustments);
  check('画面は閉じ、一覧を取り直し、通知で元に戻せる', await until(() => !$(w, '#interestSheet') && state.newsFetches > fetchesBefore && !w.document.body.classList.contains('has-sheet')) && $(w, '.toast')!.textContent!.includes('Lowered the priority of “トピックA” from High to Medium') && $(w, '.toast-action')!.textContent === 'Undo', $(w, '.toast')?.textContent);
  click(w, $(w, '.toast-action'));
  check('通知の「元に戻す」: 優先度と記録が元に戻る', await until(() => weights().genai === 1.6 && state.profile.adjustments.length === 0), state.profile);

  // ---- 一致するトピックが2つの記事: トピックを選ぶ ----
  await openMenu(w, '1');
  check('一致が2つなら、選択肢はトピックを選ぶ画面へ進む', options(w).map(option => option.dataset.sheet).join() === 'lower-pick,exclude-pick,mute,hide');
  clickOption(w, 'lower-pick');
  check('トピックの一覧に、変わる内容が出る（生成AI・教育）', await until(() => options(w).length === 2) && options(w).map(option => option.dataset.topic).join() === 'genai,edu' && options(w)[1].textContent!.includes('Medium → Low'), options(w).map(option => option.textContent));
  click(w, $(w, '[data-sheet="back"]'));
  check('「戻る」で最初の選択肢に戻る', await until(() => options(w).length === 4));
  clickOption(w, 'lower-pick');
  await until(() => options(w).length === 2);
  clickOption(w, 'lower', 'edu');
  check('選んだトピックだけ優先度が下がる（教育 1 → 0.6）', await until(() => weights().edu === 0.6) && weights().genai === 1.6 && state.profile.adjustments[0].topicId === 'edu', weights());
  click(w, $(w, '.toast-action'));
  await until(() => weights().edu === 1);

  // ---- すでに最低のトピック ----
  await openMenu(w, '4');
  const lowest = options(w)[0];
  check('すでに最低の優先度なら、「優先度を下げる」は選べず、理由が出る', lowest.hasAttribute('disabled') && lowest.textContent!.includes('already at the lowest priority') && !options(w)[1].hasAttribute('disabled'), lowest.textContent!);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Esc で閉じ、押したボタンに戻る', await until(() => !$(w, '#interestSheet')) && w.document.activeElement === cardButton(w, '4'));

  // ---- 一致するトピックがない記事（詳細への直接アクセスなど） ----
  await w.__t.openInterestSheet({ ...articles[0], matches: [] }, null);
  check('どのトピックにも一致しない記事: 優先度・除外キーワードは選べず、理由が出る。発信元オフ・隠すは使える',
    options(w)[0].hasAttribute('disabled') && options(w)[1].hasAttribute('disabled') && options(w)[0].textContent!.includes('doesn’t match any of your interest topics') && !options(w)[2].hasAttribute('disabled') && !options(w)[3].hasAttribute('disabled'));
  click(w, $(w, '#interestSheet'));
  check('背景を押すと閉じる', await until(() => !$(w, '#interestSheet')));
  check('開いて閉じただけでは、設定は何も変わらない', state.profile.adjustments.length === 0 && weights().genai === 1.6 && state.profile.hiddenItems.length === 0 && state.profile.excludedSources.length === 0);

  // ---- Tab は画面の中だけを回る ----
  await openMenu(w, '2');
  const focusable = $$(w, '#interestSheet button:not(:disabled)');
  focusable[focusable.length - 1].focus();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  check('Tab: 最後の要素から最初へ、Shift+Tab: 最初から最後へ', w.document.activeElement === focusable[0]
    && (w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })), w.document.activeElement === focusable[focusable.length - 1]));
  click(w, $(w, '[data-sheet="close"]'));
  await until(() => !$(w, '#interestSheet'));

  // ---- 除外キーワード ----
  await openMenu(w, '1');
  clickOption(w, 'exclude-pick');
  check('除外キーワード（2トピック）: トピックを選ぶ', await until(() => options(w).length === 2) && options(w).every(option => option.dataset.sheet === 'exclude'));
  clickOption(w, 'exclude', 'genai');
  const input = (await until(() => $(w, '#interestSheet input[name="keyword"]'))) && $(w, '#interestSheet input[name="keyword"]') as HTMLInputElement;
  check('語の入力欄に移り、見出しの語が選べる', w.document.activeElement === input && $$(w, '.sheet-word').map(el => el.textContent).join() === 'tutors,enter,classrooms', $$(w, '.sheet-word').map(el => el.textContent));
  ($(w, '#interestSheet .sheet-form') as HTMLFormElement).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  check('空のまま追加すると、理由が出て、画面は閉じない', await until(() => $(w, '.sheet-error')) && $(w, '.sheet-error')!.textContent === 'Enter a keyword' && !!$(w, '#interestSheet') && state.profile.adjustments.length === 0);
  click(w, $$(w, '.sheet-word')[0]);
  check('見出しの語を押すと、入力欄に入る', ($(w, '#interestSheet input[name="keyword"]') as HTMLInputElement).value === 'tutors');
  const fetches = state.newsFetches;
  ($(w, '#interestSheet .sheet-form') as HTMLFormElement).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  check('追加すると、そのトピックにだけ除外キーワードが入り、記録が残る', await until(() => state.profile.topics.find((entry: any) => entry.id === 'genai').excludeKeywords?.join() === 'tutors') && state.profile.topics.find((entry: any) => entry.id === 'edu').excludeKeywords === undefined && state.profile.adjustments[0].kind === 'exclude' && state.profile.adjustments[0].keyword === 'tutors', state.profile);
  check('一覧が取り直され、記事は別のトピック（教育）に一致したまま残る', await until(() => state.newsFetches > fetches && !$(w, '#interestSheet')) && listTitles(w).includes('AI tutors enter classrooms') && $(w, `.card[data-id="${ID('1')}"] .match-chips`)!.textContent!.includes('トピックB') && !$(w, `.card[data-id="${ID('1')}"] .match-chips`)!.textContent!.includes('トピックA'), $(w, `.card[data-id="${ID('1')}"] .match-chips`)?.textContent);
  check('通知で除外した内容が分かる', $(w, '.toast')!.textContent!.includes('Articles containing “tutors” no longer match “トピックA”'), $(w, '.toast')?.textContent);

  // 同じ語はもう足せない（大文字小文字の違いも）。入力した語は残る
  await openMenu(w, '2');
  clickOption(w, 'exclude', 'genai');
  await until(() => $(w, '#interestSheet input[name="keyword"]'));
  ($(w, '#interestSheet input[name="keyword"]') as HTMLInputElement).value = 'TUTORS';
  ($(w, '#interestSheet .sheet-form') as HTMLFormElement).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  check('すでにある語（大文字小文字違い）は足せず、理由を出して、入力を残す', await until(() => $(w, '.sheet-error')?.textContent === 'Already added') && ($(w, '#interestSheet input[name="keyword"]') as HTMLInputElement).value === 'TUTORS' && state.profile.adjustments.length === 1);
  click(w, $(w, '[data-sheet="close"]'));
  await until(() => !$(w, '#interestSheet'));
  await finish(w);
}

// ---- 発信元をオフ・今回だけ隠す（一覧から） ----
{
  const w = await openApp(profile1);
  await until(() => $$(w, '.card-wrap').length === 4);
  await openMenu(w, '2');
  clickOption(w, 'mute');
  check('「発信元をオフ」: 発信元が除外され、その記事が一覧から消える', await until(() => state.profile.excludedSources.includes(sourceIdOf(articles[1])) && !listTitles(w).includes('AI chips roadmap')) && listTitles(w).length === 3, state.profile.excludedSources);
  check('通知から元に戻せる', $(w, '.toast-action')?.textContent === 'Undo');
  click(w, $(w, '.toast-action'));
  check('元に戻すと、発信元がオンに戻り、記事がまた出る', await until(() => state.profile.excludedSources.length === 0 && listTitles(w).includes('AI chips roadmap')), state.profile.excludedSources);

  await openMenu(w, '3');
  clickOption(w, 'hide');
  check('「今回だけ隠す」: その記事だけが hiddenItems に入り、一覧から消える（トピックと発信元は変わらない）',
    await until(() => state.profile.hiddenItems.join() === ID('3') && !listTitles(w).includes('Classrooms get new desks')) && state.profile.excludedSources.length === 0 && weights().edu === 1 && state.profile.adjustments.length === 0 && listTitles(w).length === 3);
  click(w, $(w, '.toast-action'));
  check('元に戻すと、また出る', await until(() => state.profile.hiddenItems.length === 0 && listTitles(w).includes('Classrooms get new desks')));
  await finish(w);
}

// ---- 詳細画面から ----
{
  const w = await openApp(profile1);
  await until(() => $$(w, '.card-wrap').length === 4);
  await go(w, `#/article/${ID('2')}`);
  check('詳細画面の操作に「関心がない…」が最初に出る（既存の操作も残る）', await until(() => $(w, '.detail-actions')) && $$(w, '.detail-actions button').map(el => el.dataset.action).join() === 'interest-menu,hide-article,follow-source,mute-source', $$(w, '.detail-actions button').map(el => el.dataset.action));
  click(w, $(w, '#detailView [data-action="interest-menu"]'));
  check('押すと同じ画面が開く', await until(() => $(w, '#interestSheet .sheet-option')) && options(w).map(option => option.dataset.sheet).join() === 'lower,exclude,mute,hide');
  clickOption(w, 'lower');
  check('詳細画面から優先度を下げると、保存して一覧へ戻る', await until(() => weights().genai === 1) && await until(() => w.location.hash === '#/' && !$(w, '#interestSheet')), [weights(), w.location.hash]);
  await go(w, `#/article/${ID('2')}`);
  await until(() => $(w, '#detailView [data-action="interest-menu"]'));
  click(w, $(w, '#detailView [data-action="interest-menu"]'));
  await until(() => $(w, '#interestSheet .sheet-option'));
  clickOption(w, 'hide');
  check('詳細画面から隠すと、記事が隠れて一覧へ戻る', await until(() => state.profile.hiddenItems.includes(ID('2')) && w.location.hash === '#/'));
  await finish(w);
}

// ---- 設定の「関心の調整」 ----
const settingsProfile = () => {
  const p0 = profileOf({ topics: [topic('genai', 'トピックA', ['AI'], 1.6), topic('edu', 'トピックB', ['classrooms'], 1), topic('mini', 'トピックC', ['ZZZ'], 0.6)] });
  const a = I.lowerWeight(p0, 'genai', 'AI chips roadmap', new Date('2026-10-27T01:00:00.000Z'));
  const b = I.addExclude(a.profile, 'edu', 'desks', 'Classrooms get new desks', new Date('2026-10-27T02:00:00.000Z'));
  const c = I.addExclude(b.profile, 'genai', 'tutors', 'AI tutors', new Date('2026-10-27T03:00:00.000Z'));
  // edu の語を設定で消した（changed）、小さな話題は削除した（missing）
  const edited = { ...c.profile, topics: c.profile.topics.map((entry: any) => (entry.id === 'edu' ? { ...entry, excludeKeywords: [] } : entry)) };
  const gone = I.addExclude(edited, 'mini', 'gone', 'x', new Date('2026-10-27T04:00:00.000Z'));
  return { ...gone.profile, topics: gone.profile.topics.filter((entry: any) => entry.id !== 'mini') };
};
const openTopics = async (w: any) => {
  await go(w, '#/settings');
  if (!(await until(() => $(w, 'input[name="settings-pane"][value="topics"]')))) return false;
  const radio = $(w, 'input[name="settings-pane"][value="topics"]') as HTMLInputElement;
  radio.checked = true;
  radio.dispatchEvent(new w.Event('change', { bubbles: true }));
  return until(() => $(w, '#topicList'));
};
const rowOf = (w: any, keyword: string) => $$(w, '.adjustment').find(row => row.textContent!.includes(keyword));

{
  const w = await openApp(settingsProfile());
  await until(() => $$(w, '.card-wrap').length >= 1);
  check('設定の「関心トピック」を開ける', await openTopics(w));
  check('「関心の調整」に、記録が新しい順に並ぶ（4件）', $$(w, '.adjustment').length === 4 && $(w, '#adjustmentsTitle')!.textContent === 'Interest adjustments', $$(w, '.adjustment').map(row => row.textContent!.replace(/\s+/g, ' ')));
  const rows = $$(w, '.adjustment').map(row => row.textContent!.replace(/\s+/g, ' ').trim());
  check('記録の内容: トピック名・調整・日付・きっかけの記事', rows[1].includes('トピックA') && rows[1].includes('Excluded keyword “tutors”') && rows[1].includes('Prompted by: AI tutors') && rows[3].includes('Priority High → Medium') && rows[3].includes('Prompted by: AI chips roadmap'), rows);
  check('いまも効いている調整は「元に戻す」、設定で変えた・消した調整は理由と「記録を消す」', rows[1].endsWith('Undo') && rows[3].endsWith('Undo') && rows[2].includes('Changed in Settings') && rows[2].endsWith('Remove record') && rows[0].includes('Topic was deleted') && rows[0].endsWith('Remove record'), rows);
  const genaiEditor = $$(w, '.topic-editor').find(editor => (editor.querySelector('[data-field="label"]') as HTMLInputElement).value.includes('トピックA'))!;
  check('除外キーワードがあるトピックには、語の欄が出る（ないトピックには出さない）', (genaiEditor.querySelector('[data-field="excludeKeywords"]') as HTMLTextAreaElement).value === 'tutors' && $$(w, '[data-field="excludeKeywords"]').length === 1, $$(w, '[data-field="excludeKeywords"]').length);

  // 取り消すと下書きに反映する（保存するまで確定しない）
  click(w, rowOf(w, 'tutors')!.querySelector('[data-action="undo-adjustment"]'));
  check('「元に戻す」: 記録が一覧から消え、保存するまで設定は変わらない', await until(() => $$(w, '.adjustment').length === 3) && !rowOf(w, 'tutors') && state.profile.adjustments.length === 4 && state.profile.topics.find((entry: any) => entry.id === 'genai').excludeKeywords?.join() === 'tutors');
  check('取り消した語の欄は、空になる（欄ごと消える）', $$(w, '[data-field="excludeKeywords"]').length === 0);
  click(w, rowOf(w, 'Priority')!.querySelector('[data-action="undo-adjustment"]'));
  await until(() => $$(w, '.adjustment').length === 2);
  click(w, rowOf(w, 'Changed in Settings')!.querySelector('[data-action="undo-adjustment"]'));
  await until(() => $$(w, '.adjustment').length === 1);
  const priorityRadio = $$(w, '.topic-editor').find(editor => (editor.querySelector('[data-field="label"]') as HTMLInputElement).value.includes('トピックA'))!.querySelector('[data-field="weight"]:checked') as HTMLInputElement;
  check('優先度の選択も、元の値（高）に戻る', priorityRadio.value === '1.6', priorityRadio.value);
  click(w, $(w, '[data-action="save-profile"]'));
  check('保存すると確定する: 語・優先度・記録が元に戻る（削除したトピックの記録だけが残る）',
    await until(() => state.profile.adjustments.length === 1) && weights().genai === 1.6 && state.profile.topics.find((entry: any) => entry.id === 'genai').excludeKeywords?.length === 0 && state.profile.adjustments[0].topicLabel === 'トピックC', state.profile);
  await finish(w);
}

{
  // 保存せずに離れると、取り消しは確定しない
  const w = await openApp(settingsProfile());
  await openTopics(w);
  click(w, rowOf(w, 'tutors')!.querySelector('[data-action="undo-adjustment"]'));
  await until(() => $$(w, '.adjustment').length === 3);
  await go(w, '#/');
  check('保存せずに戻ると、取り消しは確定しない', state.profile.adjustments.length === 4 && state.profile.topics.find((entry: any) => entry.id === 'genai').excludeKeywords?.join() === 'tutors');
  await finish(w);
}

{
  // 設定の語の欄を直接編集する
  const w = await openApp(settingsProfile());
  await openTopics(w);
  const area = $(w, '[data-field="excludeKeywords"]') as HTMLTextAreaElement;
  area.value = 'tutors, Robots\nbooks、 books';
  click(w, $(w, '[data-action="save-profile"]'));
  check('語の欄を編集して保存すると、区切りで分けて重複を除いた配列になる', await until(() => state.profile.topics.find((entry: any) => entry.id === 'genai').excludeKeywords?.join() === 'tutors,Robots,books'), state.profile.topics[0].excludeKeywords);
  check('編集しても記録は消えない（語を消せば「設定で変更済み」になる）', state.profile.adjustments.length === 4);
  await finish(w);

  const w2 = await openApp(state.profile);
  await openTopics(w2);
  const textarea = $(w2, '[data-field="excludeKeywords"]') as HTMLTextAreaElement;
  textarea.value = 'Robots';
  click(w2, $(w2, '[data-action="save-profile"]'));
  await until(() => state.profile.topics.find((entry: any) => entry.id === 'genai').excludeKeywords?.join() === 'Robots');
  const w3 = await openApp(state.profile);
  await openTopics(w3);
  check('語を設定で消したあとは、その記録が「設定で変更済み」になる', rowOf(w3, 'tutors')!.textContent!.includes('Changed in Settings') && rowOf(w3, 'tutors')!.querySelector('[data-action="undo-adjustment"]')!.textContent === 'Remove record');
  await finish(w2, w3);
}

// ---------- 4. 悪意のある内容 ----------

{
  const evilLabel = '<img src=x onerror=window.__pwned=1>A';
  const evilTitle = 'AI <img src=x onerror="window.__pwned=2"> <script>window.__pwned=3</script>';
  const evilArticles = [article('1', evilTitle, '<b>省庁</b>')];
  const p0 = profileOf({ topics: [topic('genai', evilLabel, ['AI'], 1.6, { excludeKeywords: ['<script>window.__pwned=4</script>'] })] });
  const lowered = I.lowerWeight(p0, 'genai', evilTitle);
  const w = await openApp(lowered.profile, evilArticles);
  await until(() => $$(w, '.card-wrap').length === 1);
  await openMenu(w, '1');
  check('敵意のある見出し・トピック名: 画面は文字として表示し、要素にはならない', !$(w, '#interestSheet img') && !$(w, '#interestSheet script') && $(w, '#interestSheet .sheet-article')!.textContent === evilTitle && w.__pwned === undefined);
  clickOption(w, 'exclude');
  await until(() => $(w, '#interestSheet input[name="keyword"]'));
  check('敵意のある語の候補も、ボタンの文字として表示するだけ', !$(w, '#interestSheet img') && $$(w, '.sheet-word').every(el => !el.querySelector('*')) && w.__pwned === undefined);
  click(w, $(w, '[data-sheet="close"]'));
  await openTopics(w);
  check('敵意のあるトピック名・語・見出しは、設定の「関心の調整」と語の欄でも文字のまま', !$(w, '.adjustment-list img') && !$(w, '.adjustments script') && !$(w, '#topicList img') && $(w, '.adjustment strong')!.textContent === evilLabel && ($(w, '[data-field="excludeKeywords"]') as HTMLTextAreaElement).value === '<script>window.__pwned=4</script>' && w.__pwned === undefined);
  await finish(w);
}

if (failures) {
  console.error(`\n${failures} 件の確認に失敗しました`);
  process.exit(1);
}
console.log('\nすべて成功しました');

// All assertions are complete; release virtual-browser background timers.
process.exit(0);
