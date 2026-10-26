import { buildBriefing, filterChoices, listCategoryGroups, listNews, newsDetail, onboardingOptions, sourcesWithUsage } from '../api.js';
import type { ApiContext, SourceInfo } from '../api.js';
import { defaultProfile, migrateProfile, ProfileSchema, semanticQueries, withDefaultDescriptions } from '../profile.js';
import type { Profile } from '../profile.js';
import type { ArticleSummary, NewsItem } from '../types.js';
import { createScorer, decodeVector, itemVectors, setStaticSimilarities, textKey } from '../vectors.js';

/**
 * 静的サイト版: サーバーの代わりに、ブラウザの中で `/api/...` への問い合わせに答える。
 * 記事・要約・ベクトルは定期ジョブが書き出した静的ファイル（data/*.json）から読み込み、
 * 関心プロフィールはこの端末の localStorage に保存する（アカウントもサーバーも不要）。
 */

const PROFILE_KEY = 'sivry.profile.v1';
const PROFILE_UPDATED_KEY = 'sivry.profile.updatedAt';
declare const __SIVREE_PREVIEW__: boolean;
const LOCAL_PREVIEW = typeof __SIVREE_PREVIEW__ !== 'undefined' && __SIVREE_PREVIEW__;

interface Meta {
  schema?: number;
  analysisReady?: boolean;
  generatedAt: string;
  model: string | null;
  threshold: number;
  /** トピックの説明文（textKey） → ベクトル（Base64）。初期設定のトピックだけを事前計算している */
  topicVectors: Record<string, string>;
}

interface Analysis {
  topicScores: Record<string, Record<string, number>>;
  pairs: Record<string, Record<string, number>>;
}

interface StaticData {
  analysis?: Analysis;
  legacyVectors?: Record<string, string>;
  meta: Meta;
  items: NewsItem[];
  sources: SourceInfo[];
  summaries: Map<string, ArticleSummary>;
  sourceIds: Map<string, string>;
}

const base = new URL('.', document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : location.href);

async function getJson<T>(name: string): Promise<T> {
  const response = await originalFetch(new URL(`data/${name}.json`, base), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${name}.json: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

const originalFetch = window.fetch.bind(window);
let loading: Promise<StaticData> | null = null;
let active: StaticData | null = null;
let pending: StaticData | null = null;
let checking: Promise<void> | null = null;
let lastCheck = 0;

// A snapshot includes data, never rendered HTML or a user's profile.
function snapshotStore(write?: StaticData): Promise<StaticData | null> {
  return new Promise(resolve => {
    let db: IDBDatabase | undefined;
    let finished = false;
    const finish = (value: StaticData | null) => { if (finished) return; finished = true; clearTimeout(timer); db?.close(); resolve(value); };
    const timer = setTimeout(() => finish(null), 800);
    try {
      const open = indexedDB.open('sivree-news-cache', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('snapshots');
      open.onerror = () => finish(null);
      open.onblocked = () => finish(null);
      open.onsuccess = () => {
        db = open.result;
        if (finished) { db.close(); return; }
        const tx = db.transaction('snapshots', write ? 'readwrite' : 'readonly');
        const req = write ? tx.objectStore('snapshots').put(write, 'v2') : tx.objectStore('snapshots').get('v2');
        tx.oncomplete = () => finish(write ?? req.result ?? null);
        tx.onerror = tx.onabort = () => finish(null);
      };
    } catch { finish(null); }
  });
}

async function download(meta: Meta): Promise<StaticData> {
  const [items, sources, summaries, analysis, legacyVectors] = await Promise.all([
    getJson<NewsItem[]>('news'), getJson<SourceInfo[]>('sources'),
    getJson<Record<string, ArticleSummary>>('summaries'),
    meta.schema === 2 ? getJson<Analysis>('analysis') : Promise.resolve(undefined),
    meta.schema === 2 ? Promise.resolve(undefined) : getJson<Record<string, string>>('vectors')
  ]);
  // A deployment may finish between requests. Never combine two generations.
  if ((await getJson<Meta>('meta')).generatedAt !== meta.generatedAt) throw new Error('Data changed during download');
  return { meta, items, sources, analysis, legacyVectors,
    summaries: new Map(Object.entries(summaries)),
    sourceIds: new Map(sources.map(source => [source.feedUrl, source.id])) };
}

function activate(data: StaticData) {
  active = data;
  itemVectors.clear();
  setStaticSimilarities(data.analysis?.pairs ?? null);
  for (const [id, vector] of Object.entries(data.legacyVectors ?? {})) itemVectors.set(id, decodeVector(vector));
  loading = Promise.resolve(data);
}

async function checkUpdates() {
  if (checking) return checking;
  checking = (async () => {
    const data = await load();
    const meta = await getJson<Meta>('meta');
    lastCheck = Date.now();
    if (meta.generatedAt === data.meta.generatedAt || meta.generatedAt === pending?.meta.generatedAt) return;
    if (Date.parse(meta.generatedAt) < Date.parse(data.meta.generatedAt)) return;
    const next = await download(meta);
    pending = next;
    // Persist for the next launch without changing the active browsing session.
    if (!LOCAL_PREVIEW) await snapshotStore(next);
    window.dispatchEvent(new Event('sivree:update-available'));
  })();
  try { await checking; } finally { checking = null; }
}

window.addEventListener('sivree:reload-data', () => {
  // Only an explicit user refresh can adopt a newly downloaded generation.
  if (pending) { activate(pending); pending = null; }
});

function load(): Promise<StaticData> {
  loading ??= (async () => {
    const cached = LOCAL_PREVIEW ? null : await snapshotStore();
    const data = cached && Array.isArray(cached.items) && cached.summaries instanceof Map && cached.sourceIds instanceof Map
      ? cached : await download(await getJson<Meta>('meta'));
    activate(data);
    if (!cached && !LOCAL_PREVIEW) void snapshotStore(data);
    setTimeout(() => { void checkUpdates().catch(() => {}); }, 1000);
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

/** 事前計算したトピックのベクトルがある関心だけ、意味での一致に使う（自分で追加したトピックはキーワードだけで判定する） */
function semanticFor(profile: Profile, meta: Meta) {
  if (active?.analysis) {
    const scores = active.analysis.topicScores;
    const keys = new Map(semanticQueries(profile).map(topic => [topic.id, textKey(topic.description)]));
    return { threshold: meta.threshold, similarity: (itemId: string, topicId: string) => scores[keys.get(topicId) ?? '']?.[itemId] };
  }
  const vectors = new Map<string, Float32Array>();
  for (const topic of semanticQueries(profile)) {
    const encoded = meta.topicVectors[textKey(topic.description)];
    if (encoded) vectors.set(topic.id, decodeVector(encoded));
  }
  return createScorer(vectors, meta.threshold);
}

async function context(withSemantic = false): Promise<ApiContext> {
  const data = await load();
  const profile = loadProfile();
  return {
    items: data.items,
    summaries: data.summaries,
    profile,
    semantic: withSemantic ? semanticFor(profile, data.meta) : null,
    hasVectors: Boolean(data.meta.analysisReady) || itemVectors.size > 0,
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
      semantic: { enabled: Boolean(meta.model), model: meta.model, available: Boolean(meta.model), embeddedCount: meta.analysisReady ? active!.items.length : itemVectors.size, threshold: meta.threshold, error: null },
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
