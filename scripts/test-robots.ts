import assert from 'node:assert/strict';
import { checkRobots, isAllowedByRobots, USER_AGENT } from '../src/robots.js';
import { fetchFeed, listSources, officialFeeds } from '../src/newsPipeline.js';

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let clock = Date.parse('2026-10-25T12:00:00Z');
const requests: string[] = [];
let release: (() => void) | undefined;
try {
  Date.now = () => clock;
  globalThis.fetch = async (input, options) => {
    const url = String(input); requests.push(url);
    assert.equal((options?.headers as Record<string, string>)['User-Agent'], USER_AGENT);
    if (url.includes('shared.test')) {
      await new Promise<void>(resolve => { release = resolve; });
      return new Response('User-agent: SivreeBot\nDisallow: /private\n');
    }
    if (url.includes('absent.test')) return new Response('', { status: 404 });
    if (url.includes('server.test')) return new Response('', { status: 503 });
    if (url.includes('timeout.test')) throw new DOMException('timed out', 'TimeoutError');
    throw new TypeError('fetch failed');
  };
  const allowed = checkRobots('https://shared.test/public');
  const denied = checkRobots('https://shared.test/private');
  assert.equal(requests.length, 1, 'concurrent same-origin checks must share one request');
  release!();
  assert.deepEqual(await allowed, { allowed: true, reason: 'allowed', status: 200 });
  assert.deepEqual(await denied, { allowed: false, reason: 'disallowed', status: 200 });
  assert.equal(await isAllowedByRobots('https://shared.test/private/child'), false);
  assert.equal(requests.length, 1, 'cached policy is evaluated separately for each path');
  assert.deepEqual(await checkRobots('https://absent.test/feed'), { allowed: true, reason: 'missing', status: 404 });
  assert.deepEqual(await checkRobots('https://server.test/feed'), { allowed: false, reason: 'http-error', status: 503 });
  assert.deepEqual(await checkRobots('https://network.test/feed'), { allowed: false, reason: 'network-error' });
  assert.deepEqual(await checkRobots('https://timeout.test/feed'), { allowed: false, reason: 'timeout' });
  const count = requests.length;
  assert.deepEqual(await checkRobots('javascript:alert(1)'), { allowed: false, reason: 'invalid-url' });
  assert.deepEqual(await checkRobots('invalid'), { allowed: false, reason: 'invalid-url' });
  assert.equal(requests.length, count);
  await checkRobots('https://network.test/another');
  assert.equal(requests.length, count, 'cache unavailable policy briefly rather than retry every feed');
  clock += 10 * 60_000 + 1;
  globalThis.fetch = async input => { requests.push(String(input)); return new Response('User-agent: *\nAllow: /'); };
  assert.equal((await checkRobots('https://network.test/feed')).allowed, true, 'retry after the failure cache expires');
  assert.equal(requests.length, count + 1);

  // Feed errors carry the decision; unavailable robots never triggers a feed request.
  const source = officialFeeds.find(feed => new URL(feed.feedUrl).hostname === 'www.gov.uk')!;
  assert(source);
  const feedRequests: string[] = [];
  globalThis.fetch = async input => { feedRequests.push(String(input)); return new Response('', { status: 503 }); };
  assert.deepEqual(await fetchFeed(source), []);
  assert.deepEqual(feedRequests, ['https://www.gov.uk/robots.txt']);
  const health = listSources().find(feed => feed.feedUrl === source.feedUrl)!.health as { robots: unknown; error: string };
  assert.deepEqual(health.robots, { allowed: false, reason: 'http-error', status: 503 });
  assert.equal(health.error, 'robots.txt: http-error (HTTP 503)');
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
}
console.log('✓ Robots decisions distinguish denial, HTTP failure, network failure and timeout; concurrent checks share requests and recover after expiry');
