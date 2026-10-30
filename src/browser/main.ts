import { buildBriefing, filterChoices, listCategoryGroups, listNews, newsDetail, onboardingOptions, searchElsewhere, sourcesWithUsage } from '../api.js';
import type { ApiContext, SourceInfo } from '../api.js';
import { defaultProfile, migrateProfile, ProfileSchema, semanticQueries, withDefaultDescriptions } from '../profile.js';
import type { Profile, TopicMatch } from '../profile.js';
import { compactScorer, joinSummary } from '../staticData.js';
import type { CompactScores, DetailsFile, Head, ListFile } from '../staticData.js';
import type { ArticleSummary, NewsItem } from '../types.js';
import { setStaticSimilarities, textKey } from '../vectors.js';

/**
 * 静的サイト版: サーバーの代わりに、ブラウザの中で `/api/...` への問い合わせに答える。
 * 記事・要約・分析は定期ジョブが書き出した静的ファイル（data/*.json）から読み込み、
 * 関心プロフィールはこの端末の localStorage に保存する（アカウントもサーバーも不要）。
 */

const PROFILE_KEY = 'sivry.profile.v1';
const PROFILE_UPDATED_KEY = 'sivry.profile.updatedAt';
declare const __SIVREE_PREVIEW__: boolean;
const LOCAL_PREVIEW = typeof __SIVREE_PREVIEW__ !== 'undefined' && __SIVREE_PREVIEW__;

/** list.json is needed before the first cards; details.json (key points, basis) follows once the list is visible. */
interface Texts { list: string; details?: string }
/** How long device storage may take before the same data is also requested from the network. */
const STORAGE_HEAD_START = 800;

interface StaticData {
  meta: Head;
  /** Response texts: the snapshot stores strings, which restore faster than object graphs on phones. */
  texts: Texts;
  items: NewsItem[];
  sources: SourceInfo[];
  scores: CompactScores;
  summaries: Map<string, ArticleSummary>;
  sourceIds: Map<string, string>;
  stored?: boolean;
  details?: Promise<void>;
}

interface Snapshot { meta: Head; texts: Texts }

const base = new URL('.', document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : location.href);

async function getText(name: string): Promise<string> {
  const response = await originalFetch(new URL(`data/${name}.json`, base), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${name}.json: HTTP ${response.status}`);
  return response.text();
}
const getHead = async () => JSON.parse(await getText('head')) as Head;
const wait = (ms: number) => new Promise<null>(resolve => setTimeout(() => resolve(null), ms));

const originalFetch = window.fetch.bind(window);
let loading: Promise<StaticData> | null = null;
let active: StaticData | null = null;
let pending: StaticData | null = null;
let racing: Promise<StaticData> | null = null;
let checking: Promise<void> | null = null;
let lastCheck = 0;

// Background work waits until the first list is on screen (app.js dispatches this), or a few seconds.
const listShown = new Promise<void>(resolve => {
  window.addEventListener('sivree:list-ready', () => resolve(), { once: true });
  setTimeout(resolve, 8000);
});

// A snapshot includes data, never rendered HTML or a user's profile.
function snapshotStore(write?: Snapshot): Promise<Snapshot | null> {
  return new Promise(resolve => {
    let db: IDBDatabase | undefined;
    let finished = false;
    const finish = (value: Snapshot | null) => { if (finished) return; finished = true; clearTimeout(timer); db?.close(); resolve(value); };
    // Only guards against a storage that never answers; load() does not wait for this.
    const timer = setTimeout(() => finish(null), 15000);
    try {
      const open = indexedDB.open('sivree-news-cache', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('snapshots');
      open.onerror = () => finish(null);
      open.onblocked = () => finish(null);
      open.onsuccess = () => {
        db = open.result;
        if (finished) { db.close(); return; }
        const tx = db.transaction('snapshots', write ? 'readwrite' : 'readonly');
        const store = tx.objectStore('snapshots');
        const req = write ? store.put(write, 'v3') : store.get('v3');
        // The schema 2 snapshot held object graphs of the older files.
        if (write) store.delete('v2');
        tx.oncomplete = () => finish(write ?? req.result ?? null);
        tx.onerror = tx.onabort = () => finish(null);
      };
    } catch { finish(null); }
  });
}

function parse(texts: Texts): StaticData {
  const list = JSON.parse(texts.list) as ListFile<SourceInfo>;
  if (list.head?.schema !== 3 || !Array.isArray(list.items)) throw new Error('Unknown data format');
  const summaries = new Map<string, ArticleSummary>();
  for (const item of list.items) {
    if (item.t) summaries.set(item.id, joinSummary(item, item.t));
    delete item.t;
  }
  return { meta: list.head, texts, items: list.items, sources: list.sources, summaries, scores: list.scores,
    sourceIds: new Map(list.sources.map(source => [source.feedUrl, source.id])) };
}

async function restore(): Promise<StaticData | null> {
  const snapshot = await snapshotStore();
  if (typeof snapshot?.texts?.list !== 'string') return null;
  try { return { ...parse(snapshot.texts), stored: true }; } catch { return null; }
}

// One file holds a whole generation, so a deployment between requests can never mix two.
const download = async () => parse({ list: await getText('list') });

/** Key points and the summary basis, needed only by the detail view and kept in the snapshot for offline use. */
function ensureDetails(data: StaticData): Promise<void> {
  data.details ??= (async () => {
    const text = data.texts.details ?? await getText('details');
    const file = JSON.parse(text) as DetailsFile;
    // Details of another generation would not match these articles; they stay unavailable for this one.
    if (file.generatedAt !== data.meta.generatedAt) return;
    if (data.texts.details === undefined) { data.texts.details = text; data.stored = false; }
    for (const [id, details] of Object.entries(file.details)) {
      const summary = data.summaries.get(id);
      if (summary) Object.assign(summary, details);
    }
  })();
  const result = data.details;
  // A network failure may be retried by the next detail view.
  result.catch(() => { if (data.details === result) data.details = undefined; });
  return result;
}

async function persist(data: StaticData) {
  // Never replace a newer downloaded generation with the one on screen.
  if (LOCAL_PREVIEW || data.stored || (pending && pending !== data)) return;
  data.stored = Boolean(await snapshotStore({ meta: data.meta, texts: data.texts }));
}

function activate(data: StaticData) {
  active = data;
  setStaticSimilarities(data.scores.pairs);
  loading = Promise.resolve(data);
}

/** Keeps a newer generation for an explicit refresh and for the next launch; the active list never changes here. */
async function offer(next: StaticData) {
  const current = pending ?? active;
  if (current && Date.parse(next.meta.generatedAt) <= Date.parse(current.meta.generatedAt)) return;
  pending = next;
  await ensureDetails(next).catch(() => {});
  await persist(next);
  window.dispatchEvent(new Event('sivree:update-available'));
}

async function checkUpdates() {
  if (checking) return checking;
  checking = (async () => {
    await load();
    if (racing) await racing.catch(() => null);
    const meta = await getHead();
    lastCheck = Date.now();
    if (meta.generatedAt === active?.meta.generatedAt || meta.generatedAt === pending?.meta.generatedAt) return;
    if (Date.parse(meta.generatedAt) < Date.parse((pending ?? active)!.meta.generatedAt)) return;
    await offer(await download());
  })();
  try { await checking; } finally { checking = null; }
}

window.addEventListener('sivree:reload-data', () => {
  // Only an explicit user refresh can adopt a newly downloaded generation.
  if (pending) { activate(pending); pending = null; }
});

/** The first promise that resolves with data; rejects only when none does. */
function firstReady(promises: Promise<StaticData | null>[]): Promise<StaticData> {
  return new Promise((resolve, reject) => {
    let left = promises.length;
    const miss = () => { if (--left === 0) reject(new Error('No data')); };
    for (const promise of promises) promise.then(value => value ? resolve(value) : miss(), miss);
  });
}

function load(): Promise<StaticData> {
  loading ??= (async () => {
    const restoring = LOCAL_PREVIEW ? Promise.resolve(null) : restore();
    let data = await Promise.race([restoring, wait(STORAGE_HEAD_START)]);
    if (!data) {
      // No snapshot, or storage is slow (a phone waking up): also ask the network and show whichever is complete first.
      const network = download();
      racing = network;
      data = await firstReady([restoring, network]);
      const shown = data;
      void network.then(next => next === shown ? undefined : offer(next), () => {}).finally(() => { if (racing === network) racing = null; });
    }
    activate(data);
    const loaded = data;
    void listShown.then(async () => {
      await ensureDetails(loaded).catch(() => {});
      await persist(loaded);
      setTimeout(() => { void checkUpdates().catch(() => {}); }, 1000);
    });
    return data;
  })();
  const result = loading;
  result.catch(() => { if (loading === result) loading = null; });
  return result;
}

function loadProfile(): Profile {
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    if (saved) return migrateProfile(withDefaultDescriptions(ProfileSchema.parse(JSON.parse(saved))));
  } catch {
    // 壊れた保存データは初期設定に戻す
  }
  return defaultProfile();
}

function saveProfile(input: unknown): Profile {
  const profile = migrateProfile(ProfileSchema.parse(input));
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  // 端末間の同期（sync.js）が「この端末で設定が変わった」ことを判断できるように、更新時刻を残して知らせる
  localStorage.setItem(PROFILE_UPDATED_KEY, String(Math.max(Date.now(), Number(localStorage.getItem(PROFILE_UPDATED_KEY)) + 1)));
  window.dispatchEvent(new Event('sivree:profile-saved'));
  return profile;
}

/** 事前計算したトピックの類似度がある関心だけ、意味での一致に使う（自分で追加したトピックはキーワードだけで判定する） */
function semanticFor(profile: Profile, data: StaticData) {
  const keys = new Map(semanticQueries(profile).map(topic => [topic.id, textKey(topic.description)]));
  return compactScorer(data.scores, keys, data.meta.threshold);
}

// Topic matches depend only on the articles, the saved profile and the scorer: the list and the briefing share them.
let matchMemo: { key: string; matches: Map<string, TopicMatch[]> } | null = null;
function matchCacheFor(data: StaticData) {
  const key = `${data.meta.generatedAt}\n${localStorage.getItem(PROFILE_KEY) ?? ''}`;
  if (matchMemo?.key !== key) matchMemo = { key, matches: new Map() };
  return matchMemo.matches;
}

async function context(withSemantic = false): Promise<ApiContext> {
  const data = await load();
  const profile = loadProfile();
  return {
    matchCache: withSemantic ? matchCacheFor(data) : undefined,
    items: data.items,
    summaries: data.summaries,
    profile,
    semantic: withSemantic ? semanticFor(profile, data) : null,
    hasVectors: Boolean(data.meta.analysisReady),
    sources: data.sources,
    sourceIdOf: feedUrl => data.sourceIds.get(feedUrl) ?? ''
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

async function handle(url: URL, method: string, request: Request): Promise<Response> {
  const path = url.pathname.replace(/^.*?\/api\//, '/api/');
  const query = url.searchParams;

  if (path === '/api/updates') {
    await checkUpdates();
    return json({ available: Boolean(pending), checkedAt: lastCheck });
  }

  if (path === '/api/health') return json({ status: 'ok', version: 'static' });

  if (path === '/api/config') {
    const { meta } = await load();
    return json({
      summaryEnabled: true,
      provider: 'extractive',
      method: 'extractive',
      semantic: { enabled: Boolean(meta.model), model: meta.model, available: Boolean(meta.model), embeddedCount: meta.analysisReady ? active!.items.length : 0, threshold: meta.threshold, error: null },
      static: true,
      localPreview: LOCAL_PREVIEW,
      generatedAt: meta.generatedAt
    });
  }

  if (path === '/api/profile') {
    if (method === 'PUT') {
      try {
        const input = await request.json();
        const save = () => {
          const expected = request.headers.get('X-Sivree-Profile-Version');
          if (expected != null && expected !== (localStorage.getItem(PROFILE_UPDATED_KEY) ?? '0')) return json({ error: 'Profile changed' }, 409);
          const profile = saveProfile(input);
          return json(profile, 200, { 'X-Sivree-Profile-Version': localStorage.getItem(PROFILE_UPDATED_KEY) ?? '0' });
        };
        return navigator.locks ? await navigator.locks.request('sivree-profile', save) : save();
      } catch (error) {
        return json({ error: `プロフィールの形式が正しくありません: ${(error as Error).message.slice(0, 300)}` }, 400);
      }
    }
    return json(loadProfile(), 200, { 'X-Sivree-Profile-Version': localStorage.getItem(PROFILE_UPDATED_KEY) ?? '0' });
  }
  // 保存した記事は設定ではなく利用者のデータなので、設定を初期化しても残す
  if (path === '/api/profile/reset' && method === 'POST') {
    const reset = () => json(saveProfile({ ...defaultProfile(), savedItems: loadProfile().savedItems }));
    return navigator.locks ? navigator.locks.request('sivree-profile', reset) : reset();
  }

  if (path === '/api/categories') return json(listCategoryGroups());
  if (path === '/api/filters') return json(filterChoices(loadProfile()));
  if (path === '/api/options') return json(onboardingOptions(await context()));
  if (path === '/api/sources') return json(sourcesWithUsage(await context()));
  if (path === '/api/briefing') return json(buildBriefing(await context(true)));
  if (path === '/api/search-elsewhere') return json(searchElsewhere(await context(true), query.get('keyword') ?? ''));

  if (path === '/api/news') {
    const text = (name: string) => query.get(name) ?? undefined;
    const { items, total } = listNews(await context(true), {
      forYou: query.get('forYou') === '1',
      category: text('category'),
      subgroup: text('subgroup'),
      sourceType: text('sourceType'),
      keyword: text('keyword'),
      offset: Number(query.get('offset')),
      limit: Number(query.get('limit'))
    });
    return json(items, 200, { 'X-Total-Count': String(total) });
  }

  const detail = path.match(/^\/api\/news\/([^/]+)(\/summary)?$/);
  if (detail) {
    const id = decodeURIComponent(detail[1]);
    // Key points arrive after the list; a slow or offline network shows the summary without them.
    await Promise.race([ensureDetails(await load()).catch(() => {}), wait(4000)]);
    const found = newsDetail(await context(), id);
    if (!found) return json({ error: '記事が見つかりません。' }, 404);
    if (detail[2]) {
      return found.summary
        ? json({ summary: found.summary })
        : json({ error: 'この記事の要約はまだ作成されていません。次の更新をお待ちください。' }, 502);
    }
    // 発信元のページはブラウザから直接読めないため、本文の抜粋は付けない（元記事へのリンクで読める）
    return json({ ...found, summaryEnabled: true, content: { status: 'unavailable', paragraphs: [], truncated: false } });
  }

  return json({ error: 'Not found' }, 404);
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = new Request(input, init);
  const url = new URL(request.url, location.href);
  if (url.origin !== location.origin || !/(^|\/)api\//.test(url.pathname)) return originalFetch(input, init);
  try {
    return await handle(url, request.method, request);
  } catch (error) {
    console.error('[static-api]', error);
    return json({ error: 'データを読み込めませんでした。通信状況を確認してください。' }, 500);
  }
};

// Start data/cache access alongside language loading, rather than after it.
void load().catch(() => {});
