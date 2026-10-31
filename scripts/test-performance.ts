import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { buildStaticAnalysis } from '../src/staticAnalysis.js';
import { itemVectors, decodeVector, setStaticSimilarities, textKey, createScorer } from '../src/vectors.js';
import { defaultProfile, semanticQueries } from '../src/profile.js';
import { listNews, buildBriefing, newsDetail } from '../src/api.js';
import type { NewsItem } from '../src/types.js';
import { buildStoryIndex, groupStories, isSameStory } from '../src/stories.js';
import { compactScorer, compactScores, schema3Files } from '../src/staticData.js';

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

// The sparse lookup must retain the first compatible group, the eight-item cap,
// pair direction, and full-member checks for every input ordering.
const denseItems = items.map((item, i) => ({ ...item, publishedAt: new Date(fixedNow - i * 3600000).toISOString() }));
setStaticSimilarities(buildStaticAnalysis(denseItems, vectors, {}).pairs);
let seed = 17;
for (let trial = 0; trial < 25; trial++) {
  const ordered = [...denseItems];
  for (let i = ordered.length - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; const j = seed % (i + 1); [ordered[i], ordered[j]] = [ordered[j], ordered[i]]; }
  const index = buildStoryIndex(ordered), reference: NewsItem[][] = [];
  for (const item of ordered) {
    const group = reference.find(group => group.length < 8 && group.every(other => isSameStory(other, item, index)));
    if (group) group.push(item); else reference.push([item]);
  }
  assert.deepEqual(groupStories(ordered, index).map(item => [item.id, ...item.related.map(other => other.id)]), reference.map(group => group.map(item => item.id)));
}
setStaticSimilarities(null);
console.log('✓ Sparse grouping matches the original algorithm across 25 shuffled input orders');

// Unpublished low similarities must not change any matching decision. Random 8-dimensional vectors spread
// similarities across the threshold and both margins; headlines and sources exercise keyword and source matches.
{
  const rand = (() => { let s = 99; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 - 0.5; }; })();
  const unit = () => { const v = Array.from({ length: 8 }, rand); const n = Math.hypot(...v); return v.map(x => x / n); };
  const titles = ['Generative AI model release', 'Humanoid robot pilot', 'Canada and Japan sign agreement', 'Quantum chips export controls', 'New theorem proved', 'Tariff schedule update', 'Ministry budget notice', 'City council meeting'];
  const sourcesFor = ['MIT News', 'ウォータールー市', 'Simons Foundation', 'Cabinet Office'];
  const mixed = Array.from({ length: 160 }, (_, i) => ({ ...items[i % items.length], id: `m${i.toString(16).padStart(15, '0')}`, title: titles[i % titles.length], summary: i % 3 ? '' : 'Robotics and AI policy research', sourceName: sourcesFor[i % sourcesFor.length], feedUrl: i % 7 ? 'feed' : 'https://news.mit.edu/topic/mitrobotics-rss.xml', publishedAt: new Date(fixedNow - i * 2 * 3600000).toISOString() })) as NewsItem[];
  const mixedVectors = Object.fromEntries(mixed.slice(0, 150).map(x => [x.id, encode(unit())]));
  const allTopics = defaultProfile();
  allTopics.regions = []; allTopics.categories = []; allTopics.topics.forEach(t => t.enabled = true);
  const topicVectors = Object.fromEntries(semanticQueries(allTopics).map(t => [textKey(t.description), encode(unit())]));
  const full = buildStaticAnalysis(mixed, mixedVectors, topicVectors);
  const threshold = 0.28;
  const compact = compactScores(full, mixed, threshold);
  assert(compact.unscored.length === 10 && Object.values(compact.topics).some(t => Object.keys(t).length < 150));
  const topicKeys = new Map(semanticQueries(allTopics).map(t => [t.id, textKey(t.description)]));
  const mctx = { items: mixed, sources: [], summaries: new Map(), profile: allTopics, hasVectors: true, sourceIdOf: () => '',
    semantic: { threshold, similarity: (id: string, topic: string) => full.topicScores[topicKeys.get(topic)!]?.[id] } };
  Date.now = () => fixedNow;
  setStaticSimilarities(full.pairs);
  const exact = [listNews(mctx, { limit: 200 }), listNews(mctx, { forYou: true, limit: 200 }), buildBriefing(mctx)];
  mctx.semantic = compactScorer(compact, topicKeys, threshold);
  const fromCompact = [listNews(mctx, { limit: 200 }), listNews(mctx, { forYou: true, limit: 200 }), buildBriefing(mctx)];
  (fromCompact[2] as any).generatedAt = (exact[2] as any).generatedAt;
  assert(exact[1].total > 20);
  assert.deepEqual(fromCompact, exact);
  Date.now = realNow; setStaticSimilarities(null);
  console.log('✓ Compact topic scores give the same matches, ranking and briefing as the full similarity table');
}

const bundle = await build({ entryPoints: ['src/browser/main.ts'], bundle: true, format: 'iife', platform: 'browser', write: false });
const stored = new Map<string, unknown>();
let generation = 1;
let offline = false;
let storageDelay = 0;
const calls: string[] = [];
const summaryOf = (id: string) => ({ method: 'extractive', provider: 'extractive', headlineJa: '', summary: `Summary ${id}`, keyPoints: [`Point ${id}`], insufficient: false, basis: 'article', model: '', createdAt: '2026-10-30T00:00:00Z' });
function files(g: number): Record<string, unknown> {
  const news = items.map(x => ({ ...x, title: `${g}-${x.title}` }));
  const summaries = news.slice(0, 5).map(x => [x.id, { ...summaryOf(x.id), headlineJa: x.title }] as [string, any]);
  const current = schema3Files({ generatedAt: `2026-10-30T0${g}:00:00.000Z`, analysisReady: true, model: 'test', threshold: .65 }, news, [], summaries, analysis);
  return Object.fromEntries(Object.entries(current).map(([name, data]) => [`${name}.json`, data]));
}
function open(code = bundle.outputFiles[0].text) {
  const dom = new JSDOM('<!doctype html>', { url: 'https://example.test/', runScripts: 'outside-only' });
  const w = dom.window;
  (w as any).structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value));
  // Minimal transactional IndexedDB double; keeps snapshots across launches. storageDelay models a phone waking up.
  Object.defineProperty(w, 'indexedDB', { value: { open() {
    const req: any = {};
    req.result = { close() {}, transaction() {
      const tx: any = {};
      const done = (ms = 0) => setTimeout(() => tx.oncomplete?.(), ms);
      tx.objectStore = () => ({
        get(key: string) { const r: any = {}; setTimeout(() => { r.result = stored.has(key) ? structuredClone(stored.get(key)) : undefined; tx.oncomplete?.(); }, storageDelay); return r; },
        put(v: any, key: string) { stored.set(key, structuredClone(v)); done(); return {}; },
        delete(key: string) { stored.delete(key); return {}; }
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
    return new Response(JSON.stringify(files(generation)[name]), { status: name in files(generation) ? 200 : 404 });
  }) as any;
  w.eval(code);
  return w;
}
const json = async (w: any, path: string) => { const r = await w.fetch(path); assert.equal(r.status, 200); return r.json(); };
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
let w = open();
const first = await json(w, '/api/news?limit=2');
await tick();
assert.deepEqual(calls, ['list.json']);
assert(first.length > 0 && first[0].ai && !('keyPoints' in first[0].ai) && !('t' in first[0]));
// Key points come after the first list, then the complete generation is stored.
w.dispatchEvent(new w.Event('sivree:list-ready'));
await tick(50);
assert(calls.includes('details.json'));
assert.equal((stored.get('v3') as any)?.meta.generatedAt, '2026-10-30T01:00:00.000Z');
assert.equal(typeof (stored.get('v3') as any).texts.details, 'string');
assert.deepEqual((await json(w, `/api/news/${items[0].id}`)).summary.keyPoints, [`Point ${items[0].id}`]);
assert.deepEqual(await json(w, '/api/news?limit=2'), first);
generation = 2;
let notices = 0; w.addEventListener('sivree:update-available', () => notices++);
await json(w, '/api/updates');
assert.equal(notices, 1);
assert.deepEqual(await json(w, '/api/news?limit=2'), first);
const secondPage = await json(w, '/api/news?offset=2&limit=2');
assert(secondPage.every((x: any) => x.title.startsWith('1-')));
assert.equal((await json(w, '/api/config')).generatedAt, '2026-10-30T01:00:00.000Z');
w.dispatchEvent(new w.Event('sivree:reload-data'));
assert.equal((await json(w, '/api/config')).generatedAt, '2026-10-30T02:00:00.000Z');
assert((await json(w, '/api/news?limit=2')).every((x: any) => x.title.startsWith('2-')));
assert.deepEqual((await json(w, `/api/news/${items[1].id}`)).summary.keyPoints, [`Point ${items[1].id}`]);
console.log('✓ Background downloads keep list, pagination and metadata pinned until explicit refresh');
w.close();

// Details of a newer deployment are never attached to the pinned generation's articles.
stored.clear(); generation = 3;
w = open();
await json(w, '/api/news?limit=2');
generation = 4;
const stale = await json(w, `/api/news/${items[0].id}`);
assert.equal(stale.summary.summary, `Summary ${items[0].id}`);
assert.equal(stale.summary.keyPoints, undefined);
console.log('✓ Summary details from a different generation are not mixed into the pinned one');
w.close();

stored.clear(); generation = 2;
w = open(); await json(w, '/api/news?limit=2'); w.dispatchEvent(new w.Event('sivree:list-ready')); await tick(50); w.close();
w = open();
offline = true; const before = calls.length;
assert((await json(w, '/api/news?limit=2')).every((x: any) => x.title.startsWith('2-')));
assert.deepEqual((await json(w, `/api/news/${items[0].id}`)).summary.keyPoints, [`Point ${items[0].id}`]);
assert.equal(calls.length, before);
const p = await json(w, '/api/profile');
p.hiddenItems = [items[0].id];
assert.equal((await w.fetch('/api/profile', { method: 'PUT', body: JSON.stringify(p) })).status, 200);
assert(!(await json(w, '/api/news?limit=30')).some((x: any) => x.id === items[0].id));
console.log('✓ Offline relaunch restores snapshot (with key points) without network; current hidden-item settings still apply');
w.close();

// Slow storage must not hold the list back: the network starts after a short head start and whichever finishes first is shown.
offline = false; storageDelay = 1500; generation = 2;
w = open();
let started = Date.now();
assert((await json(w, '/api/news?limit=2')).every((x: any) => x.title.startsWith('2-')));
assert(Date.now() - started < 1400 && calls.at(-1) === 'list.json');
notices = 0; w.addEventListener('sivree:update-available', () => notices++);
await tick(1500);
assert.equal(notices, 0);
w.close();
// Offline with slow storage: the snapshot still arrives and is used.
offline = true;
w = open();
started = Date.now();
assert((await json(w, '/api/news?limit=2')).every((x: any) => x.title.startsWith('2-')));
assert(Date.now() - started >= 1400);
w.close();
// A newer generation from the network, after slow storage already answered, waits for an explicit refresh.
offline = false; storageDelay = 0; generation = 5;
w = open();
assert((await json(w, '/api/news?limit=2')).every((x: any) => x.title.startsWith('2-')));
w.close();
storageDelay = 900;
w = open();
notices = 0; w.addEventListener('sivree:update-available', () => notices++);
const raced = await json(w, '/api/news?limit=2');
await tick(1200);
assert(raced.every((x: any) => x.title.startsWith('2-') || x.title.startsWith('5-')));
if (raced[0].title.startsWith('2-')) assert.equal(notices, 1);
assert.deepEqual(await json(w, '/api/news?limit=2'), raced);
storageDelay = 0;
console.log('✓ Slow device storage races the network without delaying the list or swapping cards');
w.close();

const previewBundle = await build({ entryPoints: ['src/browser/main.ts'], bundle: true, format: 'iife', platform: 'browser', write: false, define: { __SIVREE_PREVIEW__: 'true' } });
offline = false; generation = 3;
const beforePreview = calls.length, cachedBeforePreview = JSON.stringify([...stored]);
w = open(previewBundle.outputFiles[0].text);
assert((await json(w, '/api/news?limit=2')).every((x: any) => x.title.startsWith('3-')));
assert(calls.slice(beforePreview).includes('list.json'));
assert.equal((await json(w, '/api/config')).localPreview, true);
w.dispatchEvent(new w.Event('sivree:list-ready')); await tick(50);
assert.equal(JSON.stringify([...stored]), cachedBeforePreview);
console.log('✓ Development preview bypasses the old article snapshot and leaves the cache intact');
w.close();
