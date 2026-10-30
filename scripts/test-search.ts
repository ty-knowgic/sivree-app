import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { listNews, searchElsewhere } from '../src/api.js';
import type { ApiContext, SourceInfo } from '../src/api.js';
import { defaultProfile } from '../src/profile.js';
import type { NewsItem } from '../src/types.js';

// ---------- 検索の範囲外の一致（src/api.ts の searchElsewhere） ----------

const source = (id: string, subgroup: string, candidate = false): SourceInfo => ({
  id, sourceType: 'official', sourceName: `Source ${id}`, label: `Source ${id}`, subgroup, categories: ['経済'],
  sourceUrl: `https://${id}.example/`, feedUrl: `https://${id}.example/feed`, health: null, candidate
});
const sources = [source('on', '米国'), source('off', '米国'), source('cand', '米国', true), source('candon', '米国', true), source('jp', '日本', true)];
let seq = 0;
const item = (sourceId: string, title: string, overrides: Partial<NewsItem> = {}): NewsItem => {
  const owner = sources.find(entry => entry.id === sourceId)!;
  return {
    id: `item-${++seq}`, category: '経済', categories: ['経済'], subgroup: owner.subgroup as NewsItem['subgroup'], sourceType: 'official',
    title, summary: '', publishedAt: new Date(Date.now() - seq * 3_600_000).toISOString(), sourceName: owner.sourceName,
    sourceUrl: owner.sourceUrl, feedUrl: owner.feedUrl, hashtags: [], keywords: [], ...overrides
  };
};
const items = [
  item('on', 'Quantum tariff notice'),
  item('on', 'Quantum budget', { category: '政治', categories: ['政治'] }),
  item('off', 'Quantum export rule'),
  item('off', 'Quantum export rule 2'),
  item('off', 'Unrelated'),
  item('cand', 'Quantum grant'),
  item('cand', 'Quantum hidden'),
  item('candon', 'Quantum already on'),
  item('jp', 'Quantum in Japan')
];
const profile = { ...defaultProfile(), regions: ['米国'], categories: ['経済'], excludedSources: ['off'], extraSources: ['candon'], hiddenItems: [items[6].id] };
const ctx = (p = profile): ApiContext => ({
  items, summaries: new Map(), profile: p, semantic: null, hasVectors: false, sources,
  sourceIdOf: feedUrl => sources.find(entry => entry.feedUrl === feedUrl)?.id ?? ''
});

assert.deepEqual(searchElsewhere(ctx(), '  '), { all: 0, sources: [] }, 'No keyword, no hint');
const found = searchElsewhere(ctx(), 'quantum');
assert.equal(found.all, listNews(ctx(), { keyword: 'quantum' }).total, '「すべて」の件数は一覧と同じ計算');
assert.equal(found.all, 2, 'Visible sources only, within the chosen categories: on (経済) + candon');
assert.deepEqual(found.sources.map(entry => [entry.id, entry.count, entry.candidate]), [['off', 2, false], ['cand', 1, true]],
  'Turned-off defaults and unselected candidates, most matches first; hidden items, other regions and enabled candidates are not counted');

// オンにすると、その件数だけ「すべて」に出る
const enabled = searchElsewhere(ctx({ ...profile, excludedSources: [], extraSources: ['candon', 'cand'] }), 'quantum');
assert.equal(enabled.all, found.all + 3);
assert.deepEqual(enabled.sources, []);
console.log('✓ Search hints count only matches that turning a source on would actually show');

// ---------- 画面: 「すべて」への切り替えと、その場でオンにする ----------

const dom = new JSDOM(await readFile('public/index.html', 'utf8'), { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window as any;
let saved: any = { ...defaultProfile(), onboarded: true, regions: ['米国'], categories: ['経済'], excludedSources: ['off'] };
let version = 1;
const clone = (value: unknown) => JSON.parse(JSON.stringify(value));
const response = (body: unknown, headers: Record<string, string> = {}) => ({ ok: true, status: 200, json: async () => clone(body), headers: new Map(Object.entries({ 'X-Sivree-Profile-Version': String(version), ...headers })) });
const newsRequests: string[] = [];
const elsewhere = { all: 7, sources: [{ id: 'off', sourceName: 'Source off', label: 'Source off: rules', subgroup: '米国', candidate: false, count: 2 }, ...['a', 'b', 'c', 'd', 'e'].map(id => ({ id, sourceName: `Source ${id}`, label: `Source ${id}`, subgroup: '米国', candidate: true, count: 1 }))] };
w.localStorage.setItem('sivry:lang', 'ja');
w.fetch = async (url: string, init: any = {}) => {
  if (url === '/api/profile') { if (init.method === 'PUT') { saved = JSON.parse(init.body); version++; } return response(saved); }
  if (url.startsWith('/api/search-elsewhere')) return response(elsewhere);
  if (url.startsWith('/api/news')) { newsRequests.push(url); return response([], { 'X-Total-Count': '0' }); }
  if (url === '/api/sources') return response([]);
  if (url === '/api/options') return response({ regions: [], categories: [], topics: [] });
  if (url === '/api/filters') return response({ categories: ['経済'], regions: ['米国'], sourceTypes: [] });
  if (url === '/api/config') return response({});
  if (url === '/api/briefing') return response({ stories: [], storyCount: 0 });
  return response({});
};
w.structuredClone = clone;
w.IntersectionObserver = class { observe() {} };
w.matchMedia = () => ({ matches: false, addEventListener() {} });
w.Element.prototype.scrollIntoView = () => {};
w.scrollTo = () => {};
w.eval((await Promise.all(['i18n.js', 'saved.js', 'app.js'].map(file => readFile(`public/${file}`, 'utf8')))).join('\n'));
const doc = w.document;
const until = async (condition: () => unknown) => { for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(r => setTimeout(r, 10)); } assert.fail('UI did not reach expected state'); };
await until(() => doc.getElementById('status').textContent !== '読み込み中…' && doc.querySelector('[data-tab]'));
assert.equal(doc.querySelector('[aria-selected="true"]').dataset.tab, '__for_you');

doc.getElementById('searchToggle').click();
const input = doc.getElementById('keywordInput');
input.value = 'quantum'; input.dispatchEvent(new w.Event('input', { bubbles: true }));
await until(() => doc.querySelector('.search-elsewhere'));
const block = doc.querySelector('.search-elsewhere');
assert(doc.querySelector('.empty-state').textContent.includes('「quantum」に一致する記事はありません'), 'The empty message stays');
assert(block.querySelector('[data-action="search-all"]').textContent.includes('「すべて」で探す（7件）'));
assert.equal(block.querySelectorAll('[data-enable-source]').length, 5, 'At most five sources are offered');
assert(block.querySelector('.search-elsewhere-more').textContent.includes('ほか1の情報源'));
assert.equal(block.querySelector('[data-enable-source="off"]').getAttribute('aria-label'), 'Source off: rulesをオンにする', 'Feed labels tell apart sources of one publisher');

block.querySelector('[data-action="search-all"]').click();
await until(() => doc.querySelector('[aria-selected="true"]')?.dataset.tab === '' && newsRequests.at(-1)?.includes('keyword=quantum') && !newsRequests.at(-1)?.includes('forYou'));
assert.equal(input.value, 'quantum', 'Switching to すべて keeps the keyword');
await until(() => doc.querySelector('.search-elsewhere'));
assert.equal(doc.querySelector('[data-action="search-all"]'), null, 'No switch button once on すべて');

doc.querySelector('[data-enable-source="a"]').click();
await until(() => saved.extraSources?.includes('a'));
assert(!saved.excludedSources.includes('a'));
await until(() => doc.querySelector('.toast-action'));
doc.querySelector('.toast-action').click();
await until(() => !saved.extraSources.includes('a') && saved.excludedSources.includes('a'));

doc.querySelector('[data-enable-source="off"]').click();
await until(() => !saved.excludedSources.includes('off'));
assert(!saved.extraSources.includes('off'), 'A default source is turned on by leaving excludedSources only');

input.value = ''; input.dispatchEvent(new w.Event('input', { bubbles: true }));
await until(() => !doc.querySelector('.search-elsewhere'));
dom.window.close();
console.log('✓ Search offers すべて and off sources; turning one on (and undo) saves the same state as the source settings');
