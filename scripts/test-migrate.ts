// 候補（既定ではオフの情報源）の仕組みと、古い形式の設定の移行を確かめる。最重要の条件は「運営者の見え方が変わらない」こと。
//  1. migrateProfile（読み込み・貼り付け・ドライブ同期が通る関数）の全分岐と、冪等であること
//  2. 移行する5件の ID が、フィード一覧（src/feeds/core.ts）の同名の情報源と一致すること
//  3. 本物のブラウザ用 API（src/browser/main.ts をその場でまとめたもの）に、古い形式の設定を渡して、
//     記事の表示が、候補の仕組みの前の規則（excludedSources と地域だけ）と同じになること
//  4. 本物の public/app.js の設定画面で、候補をオン・オフし、古い画面が設定を保存しても戻らないこと
// 設定の保存先は、サーバーと同じ ProfileSchema が検証する（本物のブラウザ用 API の中で）。
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSources, officialFeeds, sourceId } from '../src/newsPipeline.js';
import { defaultProfile, LEGACY_DEFAULT_CANDIDATES, migrateProfile, ProfileSchema, SOURCES_VERSION } from '../src/profile.js';
import type { Profile } from '../src/profile.js';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(repo, 'public');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
const script = async (name: string) => readFile(path.join(root, name), 'utf8');
let failures = 0;
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failures++;
};

const ids = LEGACY_DEFAULT_CANDIDATES.map(source => source.id);
const idOf = (name: string) => LEGACY_DEFAULT_CANDIDATES.find(source => source.sourceName === name)!.id;
// 凍結（2026-10-20）の時点の情報源。より後に足した情報源（専門職向けなど）は候補で、古い設定の利用者には出ない
const frozenUrls = new Set((JSON.parse(await readFile(path.join(repo, 'scripts/frozen-default-feeds.json'), 'utf8')) as { feedUrl: string }[]).map(row => row.feedUrl));
const addedLater = [...new Set(officialFeeds.filter(feed => !frozenUrls.has(feed.feedUrl)).map(feed => sourceId(feed.feedUrl)))];
const candidateCount = ids.length + addedLater.length;
const promotedCount = listSources().filter(source => source.candidate && !source.pack && source.sourceType === 'official' && ['national', 'international'].includes(source.level ?? '')).length;
const additionalCount = listSources().filter(source => source.candidate && !source.pack && !(source.sourceType === 'official' && ['national', 'international'].includes(source.level ?? ''))).length;
const today = new Date().toISOString().slice(0, 10);

/** 候補の仕組みの前の形（新しい項目がない）の設定 */
const legacy = (over: object = {}): Record<string, unknown> => ({ onboarded: true, regions: [], categories: [], hiddenItems: [], excludedSources: [], topics: [], ...over });
const parse = (raw: object): Profile => ProfileSchema.parse(raw);

// ---------- 1. migrateProfile ----------
{
  const fresh = defaultProfile();
  check('新規の利用者の設定は、最新の版で、候補が空', fresh.sourcesVersion === SOURCES_VERSION && fresh.extraSources.length === 0);
  check('新規の利用者の設定は、移行しても変わらない', JSON.stringify(migrateProfile(fresh)) === JSON.stringify(fresh));
  check('新規の利用者の「候補を見た日」は初期設定を作った日', fresh.candidatesSeenAt === today, fresh.candidatesSeenAt);

  const parsed = parse(legacy());
  check('古い形式の設定は、版 0・候補なしとして読み込まれる', parsed.sourcesVersion === 0 && parsed.extraSources.length === 0 && parsed.candidatesSeenAt === '');
  const migrated = migrateProfile(parsed);
  check('古い形式の設定（地域の指定なし）: 5件すべてが候補のオンに引き継がれる', migrated.extraSources.slice().sort().join() === ids.slice().sort().join() && migrated.sourcesVersion === SOURCES_VERSION, migrated.extraSources);
  check('移行した日が「候補を見た日」になる（その日までの候補は新しい候補にしない）', migrated.candidatesSeenAt === today);
  check('冪等: 2回目の移行で何も変わらない', JSON.stringify(migrateProfile(migrated)) === JSON.stringify(migrated));
  check('冪等: 保存して読み直しても同じ', JSON.stringify(migrateProfile(parse(JSON.parse(JSON.stringify(migrated))))) === JSON.stringify(migrated));

  const oneOff = migrateProfile(parse(legacy({ excludedSources: [idOf('キッチナー市'), '0123456789'] })));
  check('1つでも除外していれば、それは戻さない（ほかの4件は引き継ぐ）', oneOff.extraSources.length === 4 && !oneOff.extraSources.includes(idOf('キッチナー市')), oneOff.extraSources);
  check('除外の記録は消さない', oneOff.excludedSources.includes(idOf('キッチナー市')) && oneOff.excludedSources.includes('0123456789'));

  check('地域が日本だけなら、足さない', migrateProfile(parse(legacy({ regions: ['日本'] }))).extraSources.length === 0);
  check('地域にカナダが含まれていれば、足す', migrateProfile(parse(legacy({ regions: ['日本', 'カナダ'] }))).extraSources.length === 5);

  const existing = migrateProfile(parse(legacy({ extraSources: ['aaaaaaaaaa'] })));
  check('すでにある候補のオンは外さない（和集合）', existing.extraSources.includes('aaaaaaaaaa') && existing.extraSources.length === 6);
  check('すでにある候補のオンと重ならない', new Set(existing.extraSources).size === existing.extraSources.length);

  const already = parse({ ...legacy(), sourcesVersion: 1, extraSources: [] });
  check('最新の版の設定は、候補が空でも足さない（利用者が全部オフにした状態を保つ）', migrateProfile(already).extraSources.length === 0);
  check('候補を見た日がすでにあれば、移行しても変えない', migrateProfile(parse(legacy({ candidatesSeenAt: '2026-10-01' }))).candidatesSeenAt === '2026-10-01');

  const bad = ProfileSchema.safeParse({ ...legacy(), extraSources: ['not-an-id'] });
  const tooMany = ProfileSchema.safeParse({ ...legacy(), extraSources: Array.from({ length: 201 }, (_, index) => index.toString(16).padStart(10, '0')) });
  check('候補のオンの形式と上限（200件）は、保存のときに検証される', !bad.success && !tooMany.success);
  check('候補を見た日の形式は YYYY-MM-DD か空', !ProfileSchema.safeParse({ ...legacy(), candidatesSeenAt: 'yesterday' }).success && ProfileSchema.safeParse({ ...legacy(), candidatesSeenAt: '2026-10-21' }).success);
}

// ---------- 2. 移行する5件とフィード一覧 ----------
{
  const feeds = LEGACY_DEFAULT_CANDIDATES.map(source => officialFeeds.find(feed => feed.sourceName === source.sourceName));
  check('移行する5件は、フィード一覧に1件ずつある', feeds.every(Boolean) && feeds.length === 5);
  check('移行する5件の ID は、フィードの URL から決まる値と同じ', LEGACY_DEFAULT_CANDIDATES.every((source, index) => sourceId(feeds[index]!.feedUrl) === source.id
    && createHash('sha1').update(feeds[index]!.feedUrl).digest('hex').slice(0, 10) === source.id));
  check('移行する5件の地域は、フィードの subgroup と同じ', LEGACY_DEFAULT_CANDIDATES.every((source, index) => feeds[index]!.subgroup === source.subgroup));
  const candidates = listSources().filter(source => source.candidate).map(source => source.id).sort();
  check('候補（既定ではオフ）は、この5件と、凍結より後に足した情報源', candidates.join() === [...ids, ...addedLater].sort().join(), candidates);
}

// ---------- 3. 本物のブラウザ用 API ----------
const bundle = (await build({
  entryPoints: [path.join(repo, 'src/browser/main.ts')], bundle: true, format: 'iife', target: 'es2020', platform: 'browser', write: false, logLevel: 'silent'
})).outputFiles[0].text;

const sources = listSources();
const feedByUrl = new Map(officialFeeds.map(feed => [feed.feedUrl, feed]));
const items = [...new Set(officialFeeds.map(feed => feed.feedUrl))].map((url, index) => {
  const feed = feedByUrl.get(url)!;
  const id = createHash('sha1').update(`item|${url}`).digest('hex').slice(0, 16);
  const category = feed.category ?? '政治';
  return {
    id, category, categories: [category], subgroup: feed.subgroup, sourceType: feed.sourceType, title: `${feed.sourceName}の発表`, summary: '',
    publishedAt: new Date(Date.now() - index * 60_000).toISOString(), sourceName: feed.sourceName, sourceUrl: `https://example.test/${id}`, feedUrl: url, hashtags: [], keywords: []
  };
});
const itemOfSource = (name: string) => items.find(entry => entry.sourceName === name)!;
const fixtures: Record<string, unknown> = { meta: { generatedAt: new Date().toISOString(), model: null, threshold: 0.5, topicVectors: {} }, news: items, sources, summaries: {}, vectors: {} };

/** fetch の Request・Response は jsdom にないので、ブラウザ用 API が使う分だけの代わりを渡す */
class FakeRequest {
  headers: Map<string, string>;
  url: string; method: string; private body: unknown;
  constructor(input: unknown, init: any = {}) { this.url = new URL(String(input), 'https://example.test/').href; this.method = (init.method ?? 'GET').toUpperCase(); this.body = init.body; this.headers = new Map(Object.entries(init.headers ?? {})); }
  async json() { return JSON.parse(String(this.body)); }
}
class FakeResponse {
  status: number; ok: boolean; headers: Map<string, string>; private text: string;
  constructor(body: string, init: any = {}) { this.text = body; this.status = init.status ?? 200; this.ok = this.status < 400; this.headers = new Map(Object.entries(init.headers ?? {})); }
  async json() { return JSON.parse(this.text); }
}

async function browser(storage: Record<string, string> = {}, options: { app?: boolean; sourcesOverride?: unknown } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window as any;
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value);
  w.Request = FakeRequest;
  w.Response = FakeResponse;
  w.structuredClone = structuredClone;
  // 本物のブラウザ用 API が「元の fetch」として使うもの。静的なデータとことば（locales）だけを返す
  w.fetch = async (input: unknown) => {
    const url = String(input);
    const data = url.match(/data\/(\w+)\.json/);
    if (data) return new FakeResponse(JSON.stringify(data[1] === 'sources' && options.sourcesOverride ? options.sourcesOverride : fixtures[data[1]]));
    const dictionary = url.match(/locales\/([\w-]+)\.json/);
    if (dictionary) return new FakeResponse(await readFile(path.join(root, 'locales', `${dictionary[1]}.json`), 'utf8'));
    return new FakeResponse('{}', { status: 404 });
  };
  w.IntersectionObserver = class { observe() {} };
  w.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
  w.Element.prototype.scrollIntoView = () => {};
  w.scrollTo = () => {};
  w.confirm = () => true;
  w.eval(bundle);
  if (options.app) {
    w.localStorage.setItem('sivry:lang', 'ja');
    w.eval(`${await script('i18n.js')}\n${await script('saved.js')}\n${await script('app.js')}\nwindow.__ready = i18nReady;`);
    await w.__ready;
  }
  return w;
}

const api = async (w: any, url: string, init?: object) => {
  const response = await w.fetch(url, init);
  return { status: response.status as number, body: await response.json(), headers: response.headers as Map<string, string> };
};
const stored = (w: any): any => JSON.parse(w.localStorage.getItem('sivry.profile.v1') ?? 'null');
const visibleIds = async (w: any) => (await api(w, '/api/news?limit=200')).body.map((entry: any) => entry.id as string).sort();
/** 候補の仕組みの前の規則: その時点の情報源（凍結した一覧）のうち、excludedSources と、選んだ地域だけで決まる */
const oldRule = (profile: { excludedSources: string[]; regions: string[] }) => items
  .filter(entry => frozenUrls.has(entry.feedUrl))
  .filter((entry) => {
    const source = sources.find(candidate => candidate.feedUrl === entry.feedUrl)!;
    return !profile.excludedSources.includes(source.id) && (!profile.regions.length || profile.regions.includes(source.subgroup));
  })
  .map(entry => entry.id).sort();

// 運営者の設定のいくつかの形（候補の仕組みの前に保存された形）
const defaultSourceId = sources.find(source => source.sourceName === '総務省')!.id;
const cases: [string, Record<string, unknown>][] = [
  ['地域の指定なし・除外なし（運営者の通常の形）', legacy()],
  ['地域が日本・カナダ', legacy({ regions: ['日本', 'カナダ'] })],
  ['地域が日本だけ', legacy({ regions: ['日本'] })],
  ['ウォータールー市を除外', legacy({ excludedSources: [idOf('ウォータールー市')] })],
  ['5件すべてを除外', legacy({ excludedSources: ids })],
  ['既定の情報源とキッチナー市を除外', legacy({ excludedSources: [defaultSourceId, idOf('キッチナー市')] })],
  ['地域が米国・欧州（カナダなし）', legacy({ regions: ['米国', '欧州'] })]
];
for (const [label, profile] of cases) {
  const w = await browser({ 'sivry.profile.v1': JSON.stringify(profile) });
  const expected = oldRule(profile as any);
  const actual = await visibleIds(w);
  check(`表示が変わらない: ${label}`, JSON.stringify(actual) === JSON.stringify(expected), `期待 ${expected.length} 件 / 実際 ${actual.length} 件`);
}
{
  const w = await browser({ 'sivry.profile.v1': JSON.stringify(legacy()) });
  const shown = new Set(await visibleIds(w));
  check('運営者の通常の形: ウォータールー市・キッチナー市・ケンブリッジ市・リージョン・オンタリオ州政府の記事が出る',
    ['ウォータールー市', 'キッチナー市', 'ケンブリッジ市', 'ウォータールー・リージョン', 'オンタリオ州政府'].every(name => shown.has(itemOfSource(name).id)));
  const profile = (await api(w, '/api/profile')).body;
  check('読み込みで移行された設定が返る（候補5件・版 1）', profile.extraSources.length === 5 && profile.sourcesVersion === 1 && profile.candidatesSeenAt === today, profile);
  const again = (await api(w, '/api/profile')).body;
  check('読み込みを繰り返しても同じ（冪等）', JSON.stringify(again) === JSON.stringify(profile));
  const put = await api(w, '/api/profile', { method: 'PUT', body: JSON.stringify(profile) });
  check('返された設定をそのまま保存しても変わらない', put.status === 200 && JSON.stringify(put.body) === JSON.stringify(profile) && JSON.stringify(stored(w)) === JSON.stringify(profile));
  const sourceList = (await api(w, '/api/sources')).body;
  const flagged = sourceList.filter((source: any) => source.candidate);
  check('情報源の一覧: 移行した5件はオン、凍結より後に足した候補はオフ', flagged.length === candidateCount
    && flagged.every((source: any) => source.enabled === ids.includes(source.id)));
  check('情報源の一覧: 既定の情報源は候補ではなく、オンのまま', sourceList.filter((source: any) => !source.candidate).every((source: any) => source.enabled === true));
}
{
  // 新規の利用者（保存された設定がない）
  const w = await browser();
  const profile = (await api(w, '/api/profile')).body;
  check('新規の利用者: 候補は空で、版は最新', profile.extraSources.length === 0 && profile.sourcesVersion === 1, profile);
  const defaults = items.filter(entry => !sources.find(source => source.feedUrl === entry.feedUrl)!.candidate).map(entry => entry.id).sort();
  const actual = await visibleIds(w);
  check('新規の利用者: 候補の記事は出ず、既定の情報源の記事だけが出る', JSON.stringify(actual) === JSON.stringify(defaults), `${actual.length} / ${defaults.length}`);
  const list = (await api(w, '/api/sources')).body;
  check('新規の利用者: 情報源の一覧で、候補はオフ', list.filter((source: any) => source.candidate).every((source: any) => source.enabled === false) && list.filter((source: any) => source.candidate).length === candidateCount);
  const options = (await api(w, '/api/options')).body;
  const canadaDefaults = sources.filter(source => source.subgroup === 'カナダ' && !source.candidate).length;
  check('初回の質問の情報源数は、候補を数えない', options.regions.find((region: any) => region.value === 'カナダ').sources === canadaDefaults, options.regions);
}
{
  // 設定の貼り付け・ドライブ同期は PUT /api/profile を通る
  const w = await browser();
  const put = await api(w, '/api/profile', { method: 'PUT', body: JSON.stringify(legacy({ excludedSources: [idOf('ケンブリッジ市')] })) });
  check('古い形式の設定を貼り付け・同期で受け取っても、移行して保存する', put.status === 200 && put.body.extraSources.length === 4 && !put.body.extraSources.includes(idOf('ケンブリッジ市')) && stored(w).sourcesVersion === 1, put.body);
  const invalid = await api(w, '/api/profile', { method: 'PUT', body: JSON.stringify({ ...legacy(), extraSources: ['xx'] }) });
  check('形式が正しくない設定は保存しない', invalid.status === 400);
}
{
  // 古い画面（キャッシュされた古い app.js）が設定を保存すると、新しい項目が落ちる。次の読み込みで直ること
  const w = await browser({ 'sivry.profile.v1': JSON.stringify(legacy()) });
  const profile = (await api(w, '/api/profile')).body;
  const turnedOff = { ...profile, extraSources: profile.extraSources.filter((id: string) => id !== idOf('ウォータールー市')), excludedSources: [...profile.excludedSources, idOf('ウォータールー市')] };
  await api(w, '/api/profile', { method: 'PUT', body: JSON.stringify(turnedOff) });
  const { extraSources, sourcesVersion, candidatesSeenAt, ...oldPage } = stored(w);
  const w2 = await browser({ 'sivry.profile.v1': JSON.stringify(oldPage) });
  const after = (await api(w2, '/api/profile')).body;
  check('古い画面が保存して新しい項目が落ちても、次の読み込みで直る（オフにした候補は戻らず、ほかは戻る）',
    after.extraSources.length === 4 && !after.extraSources.includes(idOf('ウォータールー市')) && after.sourcesVersion === 1, after.extraSources);
  const expected = oldRule({ excludedSources: oldPage.excludedSources, regions: oldPage.regions });
  check('古い画面が保存したあとも、表示は、オフにした1件を除いて変わらない', JSON.stringify(await visibleIds(w2)) === JSON.stringify(expected));
}

// ---------- 4. 設定画面（本物の app.js） ----------
const go = async (w: any, hash: string) => { w.location.hash = hash; await new Promise(resolve => setTimeout(resolve, 80)); };
const until = async (condition: () => unknown, ms = 4000) => {
  const start = Date.now();
  while (!condition() && Date.now() - start < ms) await new Promise(resolve => setTimeout(resolve, 20));
  return Boolean(condition());
};
const click = (w: any, el: Element | null) => el?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const $ = (w: any, selector: string) => w.document.querySelector(selector) as HTMLElement | null;
const $$ = (w: any, selector: string) => [...w.document.querySelectorAll(selector)] as HTMLElement[];
const openSources = async (w: any) => {
  await go(w, '#/settings');
  const radio = await until(() => $(w, 'input[name="settings-pane"][value="sources"]'));
  if (!radio) return false;
  const input = $(w, 'input[name="settings-pane"][value="sources"]') as HTMLInputElement;
  input.checked = true;
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
  return until(() => $(w, '[data-candidates]'));
};

{
  const w = await browser({ 'sivry.profile.v1': JSON.stringify(legacy()) }, { app: true });
  check('設定の「情報源」に「候補」の節が出る', await openSources(w));
  const rows = $$(w, '[data-candidates] [data-source]') as HTMLInputElement[];
  check('追加情報源に移行した5件を残し、国の機関は政府一覧へ集約する', rows.length === additionalCount && rows.every(row => row.checked === ids.includes(row.getAttribute('data-source')!)), rows.map(row => row.checked));
  check('表示場所を移した国の機関を追加欄に重複させず、全件を維持する', new Set($$(w, '[data-source]').map(input => input.getAttribute('data-source'))).size === new Set(sources.map(source => source.id)).size && sources.filter(source => source.candidate && !source.pack && source.sourceType === 'official' && ['national', 'international'].includes(source.level ?? '')).every(source => $(w, `.source-group[data-type="official"] [data-source="${source.id}"]`) && !$(w, `[data-candidates] [data-source="${source.id}"]`)));
  check('追加情報源の見出しに選択数が出る', $(w, '[data-candidates] .source-count')?.textContent === `5/${additionalCount}`);
  const packs = $$(w, '.specialist-packs .source-pack');
  check('専門パックは独立した節に、名前・利用料・説明と直接選択できる情報源を持つ',
    packs.map(pack => pack.getAttribute('data-pack')).join() === 'legal,finance'
    && packs.every(pack => pack.querySelector('h3')?.textContent && pack.querySelector('.source-badge')?.textContent === '正式版では有償（ベータ中は無料）' && pack.querySelector('.source-pack-description')?.textContent)
    && listSources().filter(source => source.pack).every(source => $(w, `[data-pack="${source.pack!.id}"] .professional-group [data-source="${source.id}"]`))
    && $(w, '[data-candidates] .source-pack') === null,
    packs.map(pack => pack.textContent?.replace(/\s+/g, ' ').slice(0, 80)));
  check('移行した5件は、パックの外（無償の候補）に並ぶ', ids.every(id => !$(w, `[data-candidates] .source-pack [data-source="${id}"]`) && $(w, `[data-candidates] [data-source="${id}"]`)));
  check('説明文が出る', $(w, '[data-candidates] .settings-note')?.textContent?.includes('既定ではオフ') === true);

  // 1件をオフにして保存する
  const target = rows.find(row => row.getAttribute('data-source') === idOf('キッチナー市'))!;
  target.checked = false;
  target.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('オフにすると、候補の件数が更新される', $(w, '[data-candidates] .source-count')?.textContent === `4/${additionalCount}`);
  click(w, $(w, '[data-action="save-profile"]'));
  check('保存すると、候補のオンから外れ、除外にも入る（古い画面が保存しても戻らないため）',
    await until(() => stored(w)?.extraSources?.length === 4), stored(w));
  const saved = stored(w);
  check('保存した設定: キッチナー市は候補のオンになく、除外にある。ほかの4件はオンのまま',
    !saved.extraSources.includes(idOf('キッチナー市')) && saved.excludedSources.includes(idOf('キッチナー市')) && saved.extraSources.length === 4 && saved.sourcesVersion === 1, saved);
  check('その後の記事: キッチナー市は出ず、ほかの4件は出る', await (async () => {
    const set = new Set(await visibleIds(w));
    return !set.has(itemOfSource('キッチナー市').id) && ['ウォータールー市', 'ケンブリッジ市', 'ウォータールー・リージョン', 'オンタリオ州政府'].every(name => set.has(itemOfSource(name).id));
  })());

  // 開き直しても、オフのまま。古い画面が保存しても戻らない
  const reopened = await browser({ 'sivry.profile.v1': JSON.stringify(stored(w)) }, { app: true });
  check('開き直しても、オフにした候補はオフのまま', await openSources(reopened) && ($$(reopened, '[data-candidates] [data-source]') as HTMLInputElement[]).filter(row => row.checked).length === 4);
  const { extraSources: _a, sourcesVersion: _b, candidatesSeenAt: _c, ...oldPage } = stored(w);
  const afterOldPage = await browser({ 'sivry.profile.v1': JSON.stringify(oldPage) }, { app: true });
  check('古い画面が保存した設定を読み込んでも、オフにした候補はオフのまま', await openSources(afterOldPage)
    && ($$(afterOldPage, '[data-candidates] [data-source]') as HTMLInputElement[]).filter(row => row.checked).map(row => row.getAttribute('data-source')).sort().join() === ids.filter(id => id !== idOf('キッチナー市')).sort().join());

  // オンに戻す
  const back = ($$(reopened, '[data-candidates] [data-source]') as HTMLInputElement[]).find(row => row.getAttribute('data-source') === idOf('キッチナー市'))!;
  back.checked = true;
  back.dispatchEvent(new reopened.Event('change', { bubbles: true }));
  click(reopened, $(reopened, '[data-action="save-profile"]'));
  check('オンに戻すと、候補のオンに入り、除外から外れる', await until(() => stored(reopened)?.extraSources?.includes(idOf('キッチナー市'))) && !stored(reopened).excludedSources.includes(idOf('キッチナー市')), stored(reopened));
}
{
  // 新規の利用者: 候補はすべてオフで、「すべてオン」は既定の情報源だけに効く
  const profile = defaultProfile();
  profile.onboarded = true;
  const fresh = await browser({ 'sivry.profile.v1': JSON.stringify(profile) }, { app: true });
  check('新規の利用者: 追加情報源はすべてオフ', await openSources(fresh) && ($$(fresh, '[data-candidates] [data-source]') as HTMLInputElement[]).every(row => !row.checked) && $(fresh, '[data-candidates] .source-count')?.textContent === `0/${additionalCount}`);
  const group = $(fresh, '.source-group[data-type="official"] [data-action="toggle-group"]');
  click(fresh, group);
  click(fresh, $(fresh, '.source-group[data-type="official"] [data-action="toggle-group"]'));
  check('種類ごとの「すべてオン」「すべてオフ」は、候補に効かない', ($$(fresh, '[data-candidates] [data-source]') as HTMLInputElement[]).every(row => !row.checked));
  const toggle = ($$(fresh, '[data-candidates] [data-source]') as HTMLInputElement[])[0];
  toggle.checked = true;
  toggle.dispatchEvent(new fresh.Event('change', { bubbles: true }));
  click(fresh, $(fresh, '[data-action="save-profile"]'));
  check('政府一覧の一括選択と追加情報源の個別選択が保存できる', await until(() => stored(fresh)?.extraSources?.length === promotedCount + 1) && stored(fresh).extraSources.includes(toggle.getAttribute('data-source')), stored(fresh));
}
{
  // 記事の画面の「この情報源をオフにする」は、候補なら候補のオンから外す
  const w = await browser({ 'sivry.profile.v1': JSON.stringify(legacy()) }, { app: true });
  const target = itemOfSource('ウォータールー市');
  await go(w, `#/article/${target.id}`);
  const mute = await until(() => $(w, '[data-action="mute-source"]'));
  check('記事の画面に「この情報源をオフにする」が出る', Boolean(mute));
  click(w, $(w, '[data-action="mute-source"]'));
  check('候補の記事でオフにすると、候補のオンから外れ、除外に入る', await until(() => stored(w)?.extraSources && !stored(w).extraSources.includes(idOf('ウォータールー市'))) && stored(w).excludedSources.includes(idOf('ウォータールー市')) && stored(w).extraSources.length === 4, stored(w));
  check('その後、その情報源の記事は出ない', !(await visibleIds(w)).includes(target.id));
}
{
  // 敵意のある名前・ラベルの候補でも、実行できるものが残らない
  const hostile = sources.map(source => (source.id === idOf('ウォータールー市')
    ? { ...source, sourceName: '<img src=x onerror=window.__pwned=1>', label: '<script>window.__pwned=1</script>' }
    : source));
  const w = await browser({ 'sivry.profile.v1': JSON.stringify(legacy()) }, { app: true, sourcesOverride: hostile });
  check('敵意のある名前の候補でも設定画面が開く', await openSources(w));
  check('敵意のある名前・ラベルは、タグとして解釈されず、スクリプトも動かない',
    $(w, '[data-candidates] img') === null && $(w, '[data-candidates] script') === null && w.__pwned === undefined && $(w, '[data-candidates]')!.textContent!.includes('<img src=x'));
}

// Settings drafts must not roll back data arriving from sync while editing.
{
  const profile = defaultProfile();
  profile.onboarded = true;
  profile.regions = ['日本', 'カナダ'];
  profile.categories = ['経済'];
  profile.extraSources = [...ids];
  const w = await browser({ 'sivry.profile.v1': JSON.stringify(profile) }, { app: true });
  await openSources(w);
  const toggle = $(w, `[data-source="${idOf('キッチナー市')}"]`) as HTMLInputElement;
  toggle.checked = false;
  toggle.dispatchEvent(new w.Event('change', { bubbles: true }));
  const latest = (await api(w, '/api/profile')).body;
  const saved = w.SivreeSaved.toSavedItem(items[0]);
  saved.note = 'arrived-during-settings';
  const otherSource = sources.find(source => !source.candidate)!.id;
  await api(w, '/api/profile', { method: 'PUT', body: JSON.stringify({ ...latest, savedItems: [saved], hiddenItems: [items[1].id], excludedSources: [otherSource] }) });
  click(w, $(w, '[data-action="save-profile"]'));
  await until(() => stored(w).excludedSources.includes(idOf('キッチナー市')));
  const result = stored(w);
  check('設定編集中の同期: 保存記事・メモ・非表示を巻き戻さない', result.savedItems[0]?.note === saved.note && result.hiddenItems.includes(items[1].id));
  check('設定編集中の同期: 両方の情報源変更を残す', result.excludedSources.includes(otherSource) && result.excludedSources.includes(idOf('キッチナー市')) && !result.extraSources.includes(idOf('キッチナー市')));

  await go(w, '#/settings');
  await until(() => $(w, 'input[name="settings-pane"][value="topics"]'));
  const pane = $(w, 'input[name="settings-pane"][value="topics"]') as HTMLInputElement;
  pane.checked = true; pane.dispatchEvent(new w.Event('change', { bubbles: true }));
  const label = $(w, '[data-field="label"]') as HTMLInputElement;
  label.value = 'local-label';
  const concurrent = (await api(w, '/api/profile')).body;
  concurrent.topics[0].weight = 4;
  await api(w, '/api/profile', { method: 'PUT', body: JSON.stringify(concurrent) });
  click(w, $(w, '[data-action="save-profile"]'));
  await until(() => stored(w).topics[0].label === 'local-label');
  check('設定編集中の同期: 同じトピックの別々の項目は両方残す', stored(w).topics[0].label === 'local-label' && stored(w).topics[0].weight === 4);
  w.close();
}

// Conditional profile writes reject stale snapshots, leaving the latest intact.
{
  const w = await browser();
  const first = await w.fetch('/api/profile');
  const version = first.headers.get('X-Sivree-Profile-Version');
  const profile = await first.json();
  await api(w, '/api/profile', { method: 'PUT', body: JSON.stringify({ ...profile, name: 'latest' }) });
  const stale = await w.fetch('/api/profile', { method: 'PUT', headers: { 'X-Sivree-Profile-Version': version }, body: JSON.stringify({ ...profile, name: 'stale' }) });
  check('古いプロフィールの条件付き保存: 409 を返し、最新の設定を残す', stale.status === 409 && stored(w).name === 'latest');
  w.close();
}

if (failures) {
  console.error(`\n${failures} 件の確認に失敗しました`);
  process.exit(1);
}
console.log('\nすべて成功しました');

// All assertions are complete; release virtual-browser background timers.
process.exit(0);
