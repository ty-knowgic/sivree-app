import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { buildStaticAnalysis } from '../src/staticAnalysis.js';
import { itemVectors, decodeVector, setStaticSimilarities, textKey, createScorer } from '../src/vectors.js';
import { defaultProfile, semanticQueries } from '../src/profile.js';
import { listNews, buildBriefing, newsDetail } from '../src/api.js';
import type { NewsItem } from '../src/types.js';

// A mixed set with duplicates, unrelated stories, missing vectors and >96h gaps.
const encode = (v: number[]) => Buffer.from(new Float32Array(v).buffer).toString('base64');
const items = Array.from({ length: 40 }, (_, i) => ({ id: i.toString(16).padStart(16, '0'), title: `Robot research ${i % 3}`, summary: 'Robotics learning research', sourceName: `Source ${i % 3}`, sourceType: 'research', category: 'テクノロジー', categories: ['テクノロジー'], subgroup: '日本', publishedAt: new Date(Date.now() - i * 12 * 3600000).toISOString(), url: `https://example.test/${i}`, feedUrl: 'feed', hashtags: [], keywords: [] })) as unknown as NewsItem[];
const vectors = Object.fromEntries(items.slice(0, 39).map((x, i) => [x.id, encode(i % 2 ? [1, 0, 0] : [0.8, 0.6, 0])]));
const profile = defaultProfile();
profile.regions = []; profile.categories = []; profile.topics.forEach(t => t.enabled = true);
const topics = Object.fromEntries(semanticQueries(profile).map(t => [textKey(t.description), encode([1, 0, 0])]));
const analysis = buildStaticAnalysis(items, vectors, topics);
for (const [id, v] of Object.entries(vectors)) itemVectors.set(id, decodeVector(v));
const ctx = { items, sources: [], summaries: new Map(), profile, semantic: createScorer(new Map(semanticQueries(profile).map(t => [t.id, decodeVector(topics[textKey(t.description)])])), 0.65), hasVectors: true, sourceIdOf: () => '' };
const fixedNow = Date.now(); const realNow = Date.now; Date.now = () => fixedNow;
const expected = [listNews(ctx, { limit: 30 }), listNews(ctx, { forYou: true, limit: 30 }), buildBriefing(ctx), newsDetail(ctx, items[0].id)];
setStaticSimilarities(analysis.pairs); itemVectors.clear();
const keys = new Map(semanticQueries(profile).map(t => [t.id, textKey(t.description)]));
ctx.semantic = { threshold: 0.65, similarity: (id, topic) => analysis.topicScores[keys.get(topic)!]?.[id] };
const actual = [listNews(ctx, { limit: 30 }), listNews(ctx, { forYou: true, limit: 30 }), buildBriefing(ctx), newsDetail(ctx, items[0].id)];
(actual[2] as any).generatedAt = (expected[2] as any).generatedAt;
assert.deepEqual(actual, expected);
Date.now = realNow; setStaticSimilarities(null);
console.log('✓ Precomputed analysis preserves ranking, grouping, briefing and related articles');

const bundle = await build({ entryPoints: ['src/browser/main.ts'], bundle: true, format: 'iife', platform: 'browser', write: false });
let stored: unknown;
let generation = 1;
let offline = false;
const calls: string[] = [];
function open() {
  const dom = new JSDOM('<!doctype html>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window;
  (w as any).structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value));
  // Minimal transactional IndexedDB double; keeps structured-cloned snapshots across launches.
  Object.defineProperty(w, 'indexedDB', { value: { open() {
    const req: any = {};
    req.result = { close() {}, transaction() {
      const tx: any = {};
      tx.objectStore = () => ({
        get() { const r = { result: stored === undefined ? undefined : w.eval('v => v')(stored) }; setTimeout(() => tx.oncomplete?.(), 0); return r; },
        put(v: any) { stored = v; setTimeout(() => tx.oncomplete?.(), 0); return {}; }
      }); return tx;
    } };
    setTimeout(() => req.onsuccess?.(), 0); return req;
  } } });
  w.Request = class extends Request { constructor(input: any, init?: any) { super(new URL(String(input), w.location.href), init); } } as any;
  w.Response = Response as any;
  w.fetch = (async (url: any) => {
    const name = new URL(String(url)).pathname.split('/').pop()!;
    calls.push(name);
    if (offline) throw new Error('offline');
    const data: Record<string, unknown> = { 'meta.json': { schema: 2, analysisReady: true, generatedAt: `generation-${generation}`, model: 'test', threshold: .65, topicVectors: {} }, 'news.json': items.map(x => ({ ...x, title: `${generation}-${x.title}` })), 'sources.json': [], 'summaries.json': {}, 'analysis.json': analysis };
    return new Response(JSON.stringify(data[name]));
  }) as any;
  w.eval(bundle.outputFiles[0].text);
  return w;
}
const json = async (w: any, path: string) => { const r = await w.fetch(path); assert.equal(r.status, 200); return r.json(); };
let w = open();
const first = await json(w, '/api/news?limit=2');
await new Promise(r => setTimeout(r, 20));
assert(!calls.includes('vectors.json'));
assert(first.length > 0);
generation = 2;
let notices = 0; w.addEventListener('sivree:update-available', () => notices++);
await json(w, '/api/updates');
assert.equal(notices, 1);
assert.deepEqual(await json(w, '/api/news?limit=2'), first);
const secondPage = await json(w, '/api/news?offset=2&limit=2');
assert(secondPage.every((x: any) => x.title.startsWith('1-')));
assert.equal((await json(w, '/api/config')).generatedAt, 'generation-1');
w.dispatchEvent(new w.Event('sivree:reload-data'));
assert.equal((await json(w, '/api/config')).generatedAt, 'generation-2');
assert((await json(w, '/api/news?limit=2')).every((x: any) => x.title.startsWith('2-')));
console.log('✓ Background downloads keep list, pagination and metadata pinned until explicit refresh');
w.close();
// Cross-realm Map recognition is handled as IndexedDB does: recreate objects in the new realm.
const snapshot: any = stored;
w = open();
// The double must produce Maps in the receiving realm, as real IndexedDB does.
(snapshot as any).summaries = new (w as any).Map(snapshot.summaries);
(snapshot as any).sourceIds = new (w as any).Map(snapshot.sourceIds);
offline = true; const before = calls.length;
assert((await json(w, '/api/news?limit=2')).every((x: any) => x.title.startsWith('2-')));
assert.equal(calls.length, before);
const p = await json(w, '/api/profile');
p.hiddenItems = [items[0].id];
assert.equal((await w.fetch('/api/profile', { method: 'PUT', body: JSON.stringify(p) })).status, 200);
assert(!(await json(w, '/api/news?limit=30')).some((x: any) => x.id === items[0].id));
console.log('✓ Offline relaunch restores snapshot without network; current hidden-item settings still apply');
w.close();
