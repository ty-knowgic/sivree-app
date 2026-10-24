import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { balancedArchive, collectionOrder, resultsInRegistryOrder } from '../src/collectionBalance.js';
import { bulletinLinks, readBulletin } from '../src/irsBulletins.js';
import { expansionFeeds, deferredExpansionFeeds } from '../src/feeds/expansion.js';
import { workflowsOf, WORKFLOWS } from '../src/feeds/workflows.js';
import { defaultOn, tierOf } from '../src/sourceTier.js';
import { defaultProfile } from '../src/profile.js';
import { fetchFeed, listSources } from '../src/newsPipeline.js';
import type { NewsItem } from '../src/types.js';

const news = (feedUrl: string, id: string) => ({ feedUrl, id }) as NewsItem;
const busy = Array.from({ length: 1200 }, (_, i) => news('busy', `busy-${i}`));
const sparse = news('sparse', 'important-older-notice');
const selected = balancedArchive([...busy, sparse], 1000);
assert.equal(selected.length, 1000);
assert(selected.includes(sparse));
assert.equal(selected[0], busy[0]);
assert.deepEqual(balancedArchive(busy, 1000), busy.slice(0, 1000));
assert.deepEqual(balancedArchive([sparse], 0), []);
console.log('✓ Archive shares a fixed budget without losing a sparse source or changing display order');

const feed = expansionFeeds[0];
const groups = [
  ...Array.from({ length: 30 }, (_, i) => ({ ...feed, since: undefined, pack: undefined, feedUrl: `default-${i}` })),
  ...expansionFeeds
];
const order = collectionOrder(groups, 0);
assert.equal(new Set(order).size, groups.length);
assert(order.slice(0, 4).some(source => source.pack === 'legal'));
assert(order.slice(0, 4).some(source => source.pack === 'finance'));
assert.notDeepEqual(order, collectionOrder(groups, 1));
for (let window = 0; window < 20; window++) {
  const scheduled = collectionOrder(groups, window);
  // An article present in both default and paid feeds must keep its free provenance.
  const fetched = scheduled.map(source => [news(source.feedUrl, 'same-document')]);
  assert.equal(resultsInRegistryOrder(groups, scheduled, fetched).flat()[0].feedUrl, 'default-0');
}
console.log('✓ Collection gives both packs early opportunities and rotates without duplicating sources');

assert.deepEqual(bulletinLinks('<table><tr><td><a href="/irb/2026-43_irb">one</a><a href="https://evil.test/irb/2026-43_irb">bad</a><a href="/irb/2026-43_irb">duplicate</a></td></tr></table>', 'https://www.irs.gov/irb'), ['https://www.irs.gov/irb/2026-43_irb']);
const issue = '<h1>Internal Revenue Bulletin: 2026-43</h1><p class="pubdate">October 19, 2026</p><p>Effective January 1, 2027</p>';
assert.equal(readBulletin(issue, 'https://www.irs.gov/irb/2026-43_irb', Date.parse('2026-10-24'))?.isoDate, '2026-10-19T12:00:00.000Z');
assert.equal(readBulletin(issue.replace('class="pubdate"', ''), 'https://www.irs.gov/irb/2026-43_irb'), undefined);
assert.equal(readBulletin(issue, 'https://www.irs.gov/irb/2026-43_irb', Date.parse('2026-10-18')), undefined);
console.log('✓ IRS uses the masthead date, rejects future issues, ignores effective dates and external links');

const originalFetch = globalThis.fetch;
const requested: string[] = [];
let broken = false;
globalThis.fetch = async input => {
  const url = String(input); requested.push(url);
  if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
  if (url === 'https://www.irs.gov/irb') return new Response('<table><tr><td><a href="/irb/2026-43_irb">issue</a><a href="https://evil.test/irb/2026-43_irb">bad</a></td></tr></table>');
  return new Response(broken ? '<h1>Internal Revenue Bulletin: 2026-43</h1>' : issue);
};
try {
  const source = expansionFeeds.find(value => value.bulletinIndex)!;
  const found = await fetchFeed(source);
  assert.equal(found.length, 1);
  assert.equal(found[0].documentKind, 'tax-bulletin');
  assert(requested.some(url => url.endsWith('/robots.txt')));
  assert(requested.every(url => url.startsWith('https://www.irs.gov/')));
  broken = true;
  assert.equal((await fetchFeed(source)).length, 0);
  assert.equal((listSources().find(value => value.feedUrl === source.feedUrl)?.health as { ok: boolean }).ok, false);
} finally { globalThis.fetch = originalFetch; }
console.log('✓ Bulletin collection respects robots and marks malformed mastheads as a source failure');

assert.equal(WORKFLOWS.length, 6);
assert(expansionFeeds.every(source => !defaultOn(source)));
assert(expansionFeeds.filter(source => source.pack).every(source => source.terms === 'A'));
assert(expansionFeeds.filter(source => source.terms === 'C').every(source => source.titleOnly && tierOf(source) === 'free'));
assert(deferredExpansionFeeds.every(source => !expansionFeeds.includes(source)));
assert.deepEqual(workflowsOf({ sourceName: '米会計検査院', label: 'GAO Reports and Testimonies' }), []);
assert.deepEqual(workflowsOf({ sourceName: '米連邦官報', label: 'Federal Register: Significant Proposed Rules' }).map(workflow => workflow.id), ['policy']);
console.log('✓ Opt-in, rights boundaries and optional public-sector audits stay intact');

const html = await readFile('public/index.html', 'utf8');
const code = await Promise.all(['i18n.js', 'saved.js', 'app.js'].map(name => readFile(`public/${name}`, 'utf8')));
const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window as any;
w.localStorage.setItem('sivry:lang', 'ja');
w.fetch = async () => ({ ok: true, json: async () => ({}), headers: new Map() });
w.IntersectionObserver = class { observe() {} };
w.matchMedia = () => ({ matches: false, addEventListener() {} });
w.Element.prototype.scrollIntoView = () => {};
w.scrollTo = () => {};
w.eval(code.join('\n') + '\nwindow.professionalFixture = (p, s) => { profileDraft = p; profileDraftBase = structuredClone(p); sourcesDraft = s; settingsPane = "sources"; renderSettings(); }; window.professionalDraft = () => profileDraft;');
w.structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value));
await new Promise(resolve => setImmediate(resolve));
const profile = defaultProfile(); profile.onboarded = true; profile.regions = ['米国'];
const sources = listSources();
const audit = sources.find(source => source.label === 'GAO Reports and Testimonies')!;
const outside = sources.find(source => source.sourceName === 'ウォータールー市')!;
profile.extraSources = [audit.id, outside.id];
const sec = sources.find(source => source.label === 'SEC（米証券取引委員会）プレスリリース')!;
profile.excludedSources = [sec.id];
w.professionalFixture(JSON.parse(JSON.stringify(profile)), JSON.parse(JSON.stringify(sources)));
const button = w.document.querySelector('[data-workflow="financial-compliance"]');
assert(button && !button.disabled);
button.click();
const draft = w.professionalDraft();
assert(draft.extraSources.includes(audit.id));
assert(draft.extraSources.includes(outside.id));
assert(!draft.excludedSources.includes(sec.id));
const inRegion = sources.filter(source => source.subgroup === '米国' && source.workflows.some(workflow => workflow.id === 'financial-compliance'));
assert(inRegion.filter(source => source.candidate).every(source => draft.extraSources.includes(source.id)));
assert(sources.filter(source => source.subgroup !== '米国' && source.workflows.some(workflow => workflow.id === 'financial-compliance')).every(source => !draft.extraSources.includes(source.id)));
assert.equal(w.document.querySelector('[data-workflow="financial-compliance"]').disabled, true);
assert.deepEqual(draft.hiddenItems, profile.hiddenItems);
dom.window.close();
console.log('✓ Workflows add in-region paid and free sources, preserve prior choices, and do not add other regions');
