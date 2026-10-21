// フィード取得の信頼性を確かめる。時間切れ・5xx は取り直し、4xx は取り直さないこと、HTML が返ったときに原因が分かること、
// フィードも robots.txt に従うこと（禁止・確認できないときは取得せず、無ければ取得する）、arXiv の RSS を絞り込めること、
// 同時に取得する数が絞られること、同じ記事の見出し違いが1件にまとまる（別の記事は残る）ことを、本物の通信なしで調べる。
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { withStoredSummaries } from '../src/api.js';
import { applyTitleOnly, dedupeSameDocument, fetchFeed, mapWithConcurrency, officialFeeds } from '../src/newsPipeline.js';
import type { FeedSource, NewsItem } from '../src/types.js';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`);
  if (!ok) failures++;
};

// ---------- 取得（ローカルのサーバーに対して） ----------
const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>
<item><title>Test announcement</title><link>https://example.test/a</link><pubDate>${new Date().toUTCString()}</pubDate><description>Body text of the announcement.</description></item>
</channel></rss>`;
// arXiv の RSS の形（説明文の先頭に「arXiv:… Announce Type: … Abstract:」が付き、改訂（replace）も流れる）
const arxivItem = (id: string, type: string, title: string, abstract: string) =>
  `<item><title>${title}</title><link>https://arxiv.org/abs/${id}</link><pubDate>${new Date().toUTCString()}</pubDate><description>arXiv:${id}v1 Announce Type: ${type} \nAbstract: ${abstract}</description></item>`;
const arxivRss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>cs.RO</title>
${arxivItem('2610.00001', 'new', 'Humanoid walking with a world model', 'We present a controller for humanoid robots.')}
${arxivItem('2610.00002', 'new', 'A survey of gripper materials', 'Soft materials for grippers.')}
${arxivItem('2501.00003', 'replace', 'Humanoid balance revisited', 'A revised humanoid paper.')}
${arxivItem('2610.00004', 'cross', 'Embodied agents in the home', 'An embodied AI study.')}
</channel></rss>`;
const hits = new Map<string, number>();
const server = createServer((request, response) => {
  const route = request.url ?? '';
  const count = (hits.get(route) ?? 0) + 1;
  hits.set(route, count);
  if (route === '/flaky') {
    if (count === 1) { response.writeHead(503).end('busy'); return; }
  } else if (route === '/gone') { response.writeHead(404).end('gone'); return; }
  else if (route === '/forbidden') { response.writeHead(403).end('no'); return; }
  else if (route === '/down') { response.writeHead(503).end('maintenance'); return; }
  else if (route === '/html') { response.writeHead(200, { 'content-type': 'text/html' }).end('<!DOCTYPE html><html><body>maintenance</body></html>'); return; }
  else if (route === '/robots.txt') { response.writeHead(200, { 'content-type': 'text/plain' }).end('User-agent: SivreeBot\nDisallow: /blocked\n'); return; }
  else if (route === '/arxiv') { response.writeHead(200, { 'content-type': 'application/rss+xml' }).end(arxivRss); return; }
  response.writeHead(200, { 'content-type': 'application/rss+xml' }).end(rss);
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const source = (route: string): FeedSource => ({
  sourceType: 'official', category: '政治', subgroup: '日本', sourceName: 'テスト', sourceUrl: `${base}/`, feedUrl: `${base}${route}`, label: 'テスト'
});
const warnings: string[] = [];
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };

const flaky = await fetchFeed(source('/flaky'));
check('503 のあとの再取得で記事が取れる', flaky.length === 1 && hits.get('/flaky') === 2, `items=${flaky.length} hits=${hits.get('/flaky')}`);
const down = await fetchFeed(source('/down'));
check('5xx が続くときは1回だけ取り直して諦める', down.length === 0 && hits.get('/down') === 2, `hits=${hits.get('/down')}`);
const gone = await fetchFeed(source('/gone'));
check('404 は取り直さない', gone.length === 0 && hits.get('/gone') === 1, `hits=${hits.get('/gone')}`);
const forbidden = await fetchFeed(source('/forbidden'));
check('403 は取り直さない（回避しない）', forbidden.length === 0 && hits.get('/forbidden') === 1, `hits=${hits.get('/forbidden')}`);
const html = await fetchFeed(source('/html'));
check('HTML が返ったら空にし、原因が分かる記録を残す', html.length === 0 && warnings.some(line => line.includes('HTML page returned')), warnings.join(' | '));
const blocked = await fetchFeed(source('/blocked'));
check('robots.txt が禁止するフィードは、取得せずに空にする', blocked.length === 0 && !hits.has('/blocked') && warnings.some(line => line.includes('robots.txt')), `hits=${hits.get('/blocked')} warnings=${warnings.join(' | ')}`);
check('robots.txt が許可するフィードは取得する', (await fetchFeed(source('/allowed'))).length === 1 && hits.get('/allowed') === 1);

// robots.txt を確認できない（5xx）ときは取得しない。robots.txt が無い（404）ときは取得してよい（RFC 9309）
const otherServer = (robotsStatus: number) => {
  const feedHits: string[] = [];
  const instance = createServer((request, response) => {
    if (request.url === '/robots.txt') { response.writeHead(robotsStatus).end('x'); return; }
    feedHits.push(request.url ?? '');
    response.writeHead(200, { 'content-type': 'application/rss+xml' }).end(rss);
  });
  return new Promise<{ base: string; feedHits: string[]; close: () => void }>(resolve => instance.listen(0, '127.0.0.1', () =>
    resolve({ base: `http://127.0.0.1:${(instance.address() as AddressInfo).port}`, feedHits, close: () => instance.close() })));
};
const unavailable = await otherServer(503);
const withoutCheck = await fetchFeed({ ...source('/feed'), sourceUrl: `${unavailable.base}/`, feedUrl: `${unavailable.base}/feed` });
check('robots.txt を確認できない（5xx）ときは、フィードを取得しない', withoutCheck.length === 0 && unavailable.feedHits.length === 0, `feedHits=${unavailable.feedHits.length}`);
unavailable.close();
const absent = await otherServer(404);
const withoutRobots = await fetchFeed({ ...source('/feed'), sourceUrl: `${absent.base}/`, feedUrl: `${absent.base}/feed` });
check('robots.txt が無い（404）ときは、フィードを取得する', withoutRobots.length === 1 && absent.feedHits.length === 1, `items=${withoutRobots.length} feedHits=${absent.feedHits.length}`);
absent.close();

// arXiv の RSS: 絞り込み（Physical AI 関連だけ）、改訂（replace）の除外、説明文の先頭の定型の除去
const arxivSource = officialFeeds.find(feed => feed.sourceName === 'arXiv');
const arxivItems = arxivSource ? await fetchFeed({ ...arxivSource, feedUrl: `${base}/arxiv`, sourceUrl: 'https://arxiv.org/list/cs.RO/recent' }) : [];
check('arXiv: 絞り込みに合う新着（new・cross）だけを取り込み、改訂（replace）と無関係の論文は除く',
  arxivItems.map(entry => entry.title).sort().join('|') === 'Embodied agents in the home|Humanoid walking with a world model', arxivItems.map(entry => entry.title).join('|'));
check('arXiv: 説明文の先頭の「arXiv:… Announce Type: … Abstract:」を取り除く',
  arxivItems.length > 0 && arxivItems.every(entry => !entry.summary.includes('Announce Type') && /^(We present|An embodied)/.test(entry.summary)), arxivItems.map(entry => entry.summary).join(' | '));

console.warn = originalWarn;
server.close();

// robots.txt が SivreeBot の取得を許可しないことを確認したホスト（2026-10-21）のフィードを使っていない
const robotsDisallowedHosts = ['news.un.org', 'export.arxiv.org'];
check('robots.txt が許可しない既知のホストのフィードを、一覧に入れていない',
  !officialFeeds.some(feed => robotsDisallowedHosts.includes(new URL(feed.feedUrl).hostname)),
  officialFeeds.filter(feed => robotsDisallowedHosts.includes(new URL(feed.feedUrl).hostname)).map(feed => feed.sourceName).join(','));

// ---------- 同時に取得する数 ----------
let running = 0;
let peak = 0;
const doubled = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async n => {
  peak = Math.max(peak, ++running);
  await new Promise(resolve => setTimeout(resolve, 5));
  running--;
  return n * 2;
});
check('同時に実行する数が上限を超えない', peak <= 3 && peak > 1, `peak=${peak}`);
check('結果は入力の順に返る', doubled.join(',') === '2,4,6,8,10,12,14,16,18,20', doubled.join(','));
check('空の入力でも終わる', (await mapWithConcurrency([], 3, async n => n)).length === 0);

// ---------- 同じ記事のまとめ ----------
const at = '2026-10-17T10:00:00.000Z';
let serial = 0;
const item = (over: Partial<NewsItem>): NewsItem => ({
  id: `id${serial++}`, category: '政治', categories: ['政治'], subgroup: '日本', sourceType: 'official', title: 'title', summary: '',
  publishedAt: at, sourceName: '首相官邸', sourceUrl: 'https://www.kantei.go.jp/jp/actions/a.html', feedUrl: 'https://example.test/f',
  hashtags: [], keywords: [], ...over
});
const titles = (items: NewsItem[]) => items.map(entry => entry.title).join(' / ');

const trio = dedupeSameDocument([
  item({ title: '自衛隊殉職隊員追悼式' }),
  item({ title: '高市総理は令和８年度自衛隊殉職隊員追悼式に参列しました' }),
  item({ title: '高市総理は、令和８年度自衛隊殉職隊員追悼式に参列しました。' })
]);
check('同じページ・同じ時刻の見出し違いは1件にまとまり、先のものが残る', trio.length === 1 && trio[0].title === '自衛隊殉職隊員追悼式', titles(trio));

const sameWithSlash = dedupeSameDocument([
  item({ title: 'A', sourceUrl: 'https://www.example.test/news/1' }),
  item({ title: 'A *', sourceUrl: 'http://example.test/news/1/' })
]);
check('http/https・www・末尾の / の違いは同じページとみなす', sameWithSlash.length === 1, titles(sameWithSlash));

const otherTime = dedupeSameDocument([item({ title: '要旨' }), item({ title: '動画', publishedAt: '2026-10-16T01:00:00.000Z' })]);
check('公開時刻が違えば別の記事として残す', otherTime.length === 2, titles(otherTime));

const otherSource = dedupeSameDocument([item({ title: 'A' }), item({ title: 'B', sourceName: '別の発信元' })]);
check('発信元が違えば別の記事として残す', otherSource.length === 2, titles(otherSource));

const listing = dedupeSameDocument(['一', '二', '三', '四'].map(title => item({ title, sourceUrl: 'https://www.digital.go.jp/procurement' })));
check('一覧ページを共有する別々のお知らせ（4件以上）は残す', listing.length === 4, titles(listing));

const root = dedupeSameDocument([item({ title: 'X', sourceUrl: 'https://survey.example.test/' }), item({ title: 'Y', sourceUrl: 'https://survey.example.test' })]);
check('トップページを指す記事は同じとみなさない', root.length === 2, titles(root));

const merged = dedupeSameDocument([
  item({ title: 'A', categories: ['政治'], summary: '' }),
  item({ title: 'B', category: '経済', categories: ['経済'], summary: 'Summary from the second feed.' })
]);
check('カテゴリを統合し、先の記事に要約がなければ後の要約を使う',
  merged.length === 1 && merged[0].title === 'A' && merged[0].categories.length === 2 && merged[0].summary === 'Summary from the second feed.',
  JSON.stringify(merged.map(({ title, categories, summary }) => ({ title, categories, summary }))));

const ordered = dedupeSameDocument([
  item({ title: 'new', sourceUrl: 'https://e.test/p/3', publishedAt: '2026-10-19T00:00:00.000Z' }),
  item({ title: 'dup', sourceUrl: 'https://e.test/p/2', publishedAt: '2026-10-18T00:00:00.000Z' }),
  item({ title: 'dup (edited)', sourceUrl: 'https://e.test/p/2', publishedAt: '2026-10-18T00:00:00.000Z' }),
  item({ title: 'old', sourceUrl: 'https://e.test/p/1', publishedAt: '2026-10-17T00:00:00.000Z' })
]);
check('並び順は変わらない', titles(ordered) === 'new / dup / old', titles(ordered));

// ---------- 見出しと原文へのリンクだけを表示する情報源（利用条件が商用を制限するもの） ----------
const TITLE_ONLY = ['カナダ政府', 'オンタリオ州政府', 'ウォータールー・リージョン', 'ケンブリッジ市', 'JPX', 'JETRO', 'ジェトロ', 'JAXA', 'KEK', 'WHO', 'Fraunhofer', 'Microsoft Research', 'カーネギーメロン大学', 'Simons Foundation', 'CIFAR'];
const flagged = officialFeeds.filter(feed => feed.titleOnly).map(feed => feed.sourceName).sort();
check('SOURCE_TERMS.md の B1 の15件だけが titleOnly', flagged.join(',') === [...TITLE_ONLY].sort().join(','), flagged.join(','));

const restrictedFeed = officialFeeds.find(feed => feed.sourceName === 'JPX')!.feedUrl;
const normalFeed = officialFeeds.find(feed => feed.sourceName === '総務省')!.feedUrl;
const [limited, untouched] = applyTitleOnly([
  item({ title: 'JPX の発表', summary: '説明文', imageUrl: 'https://example.test/a.jpg', feedUrl: restrictedFeed, sourceName: 'JPX', sourceUrl: 'https://www.jpx.co.jp/a' }),
  item({ title: '総務省の発表', summary: '説明文', imageUrl: 'https://example.test/b.jpg', feedUrl: normalFeed, sourceName: '総務省', sourceUrl: 'https://www.soumu.go.jp/b' })
]);
check('titleOnly の情報源は、説明文と画像を持たず、画像の確認も済み扱いにする',
  limited.summary === '' && limited.imageUrl === undefined && limited.imageChecked === true && limited.titleOnly === true && limited.title === 'JPX の発表',
  JSON.stringify(limited));
check('それ以外の情報源は変えない', untouched.summary === '説明文' && untouched.imageUrl === 'https://example.test/b.jpg' && !untouched.titleOnly);

const stored = new Map([['x', { headlineJa: '要点', summary: '要約', method: 'extractive' }]]) as unknown as Parameters<typeof withStoredSummaries>[0];
const [withoutAi, withAi] = withStoredSummaries(stored, [item({ id: 'x', titleOnly: true }), item({ id: 'x' })]);
check('titleOnly の記事には、保存済みの要約があっても添えない', !('ai' in withoutAi) && 'ai' in withAi);

if (failures) {
  console.error(`\n${failures} 件の確認に失敗しました`);
  process.exit(1);
}
console.log('\nすべて成功しました');
