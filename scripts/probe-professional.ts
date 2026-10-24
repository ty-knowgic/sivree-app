/** Read-only production-code smoke test. No profile or archive writes. */
import { expansionFeeds, deferredExpansionFeeds } from '../src/feeds/expansion.js';
import { fetchFeed, listSources } from '../src/newsPipeline.js';

const rounds = Number(process.argv[2] ?? 1);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 3) throw new Error('rounds must be 1..3');
let failures = 0;
for (let round = 1; round <= rounds; round++) {
  for (const source of (process.argv.includes('--deferred') ? deferredExpansionFeeds : expansionFeeds)) {
    const items = await fetchFeed(source);
    const health = listSources().find(value => value.feedUrl === source.feedUrl)?.health;
    const ok = Boolean(health && typeof health === 'object' && 'ok' in health && health.ok && items.length);
    if (!ok) failures++;
    console.log(JSON.stringify({ round, label: source.label, feedUrl: source.feedUrl, terms: source.terms, pack: source.pack ?? null, ok, count: items.length, health, first: items[0] && { title: items[0].title, publishedAt: items[0].publishedAt, url: items[0].sourceUrl } }));
  }
}
process.exitCode = failures ? 1 : 0;
