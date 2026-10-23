// フィード取得の信頼性を確かめる。時間切れ・5xx は取り直し、4xx は取り直さないこと、HTML が返ったときに原因が分かること、
// フィードも robots.txt に従うこと（禁止・確認できないときは取得せず、無ければ取得する）、arXiv の RSS を絞り込めること、
// 同時に取得する数が絞られること、同じ記事の見出し違いが1件にまとまる（別の記事は残る）ことを、本物の通信なしで調べる。
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { withStoredSummaries } from '../src/api.js';
import { PACKS } from '../src/feeds/packs.js';
import { applyTitleOnly, ARCHIVE_LIMIT, CANDIDATE_ARCHIVE_LIMIT, dedupeSameDocument, fetchFeed, fetchFeedsWithin, mapWithConcurrency, officialFeeds, sourceId, toIsoDate, trimArchive } from '../src/newsPipeline.js';
import { parseListDate, readHtmlList } from '../src/htmlList.js';
import { defaultOn } from '../src/sourceTier.js';
import { SOURCE_LEVELS } from '../src/types.js';
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
// RSS のない一覧ページ（会計検査院の「注目の検査結果」の形: 見出しの行、元号なしの令和の日付、相対パスのリンク、日付のない行）
const listPage = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><script>window.__ran = 1</script></head><body>
<table class="table3"><tr><th>公表年月日</th><th>件名</th></tr>
<tr><td nowrap>8年<br class="sp">10月21日</td><td><a href="/report/new/r081021.html">共済システムの再構築について（34条処置要求）</a></td></tr>
<tr><td nowrap>8年<br class="sp">10月9日</td><td><a href="r081009.html"> 用途廃止された航空機からの部品取りについて（処置済） </a></td></tr>
<tr><td>（日付なし）</td><td><a href="/report/x.html">日付のない行</a></td></tr>
</table></body></html>`;
// 文字コードを meta だけで示す Shift_JIS のページ（国税庁の形。応答の content-type に charset がない）。「8年10月21日」の 年・月・日 は Shift_JIS のバイト列
const sjisListPage = Buffer.concat([
  Buffer.from('<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS"></head><body><table class="table3"><tr><td>8'),
  Buffer.from([0x94, 0x4e]), Buffer.from('10'), Buffer.from([0x8c, 0x8e]), Buffer.from('21'), Buffer.from([0x93, 0xfa]),
  Buffer.from('</td><td><a href="/report/sjis-a.html">Notice in Shift_JIS page</a></td></tr></table></body></html>')
]);
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
  else if (route === '/report/list.html') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(listPage); return; }
  else if (route === '/report/sjis.html') { response.writeHead(200, { 'content-type': 'text/html' }).end(sjisListPage); return; }
  else if (route === '/report/changed.html') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!DOCTYPE html><html><body><ul><li>新しい構成</li></ul></body></html>'); return; }
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

// RSS のない一覧ページ（htmlList）: 見出し・日付・リンクだけを読む
const jstDay = '2026-10-20T15:00:00.000Z';
check('一覧ページの日付: 元号なしの令和・全角の数字・康熙部首・西暦・ISO・ドット区切りの形を、日本の暦のその日として読む',
  parseListDate('8年10月21日', { era: 'reiwa' }) === jstDay && parseListDate('令和８年１０月２１日') === jstDay && parseListDate('(令和8年10⽉21⽇)') === jstDay
  && parseListDate('2026年10月21日') === jstDay && parseListDate('2026/10/21') === jstDay && parseListDate('2026.10.21') === jstDay && parseListDate('平成31年4月30日') === '2019-04-29T15:00:00.000Z',
  String(parseListDate('8年10月21日', { era: 'reiwa' })));
const octoberNow = Date.parse('2026-10-23T03:00:00Z');
check('一覧ページの日付: 年のない「10月22日（木）」は直近のその日（先の日付なら前の年）',
  parseListDate('10月22日（木）', { now: octoberNow }) === '2026-10-21T15:00:00.000Z' && parseListDate('12月28日（月）', { now: octoberNow }) === '2025-12-27T15:00:00.000Z',
  String(parseListDate('12月28日（月）', { now: octoberNow })));
check('一覧ページの日付: 日本以外は英語の月名・月/日/年・日/月/年を、協定世界時の正午として読む',
  parseListDate('IR-2026-128, Oct. 23, 2026 — The IRS', { japan: false }) === '2026-10-23T12:00:00.000Z' && parseListDate('October 23, 2026', { japan: false }) === '2026-10-23T12:00:00.000Z'
  && parseListDate('23 October 2026', { japan: false }) === '2026-10-23T12:00:00.000Z' && parseListDate('9/25/26', { order: 'mdy', japan: false }) === '2026-09-25T12:00:00.000Z'
  && parseListDate('10/14/2026', { order: 'mdy', japan: false }) === '2026-10-14T12:00:00.000Z' && parseListDate('22/10/2026', { order: 'dmy', japan: false }) === '2026-10-22T12:00:00.000Z',
  String(parseListDate('9/25/26', { order: 'mdy', japan: false })));
check('一覧ページの日付: 元号の指定がない「8年」、存在しない日、読めない日付は読まない',
  parseListDate('8年10月21日') === undefined && parseListDate('（日付なし）') === undefined && parseListDate('2026年13月1日') === undefined && parseListDate('2026年2月30日') === undefined);
const listSource: FeedSource = { ...source('/report/list.html'), htmlList: { rows: 'table.table3 tr', link: 'a[href]', date: 'td:first-child', era: 'reiwa' } };
const listItems = await fetchFeed(listSource);
check('一覧ページ: HTML でもフィードとして扱い、日付とリンクのある行だけを取り込む（見出しの行・日付のない行は除く）',
  listItems.map(entry => entry.title).join('|') === '共済システムの再構築について（34条処置要求）|用途廃止された航空機からの部品取りについて（処置済）', listItems.map(entry => entry.title).join('|'));
check('一覧ページ: リンクはページからの絶対 URL、日付は日本の暦のその日',
  listItems[0]?.sourceUrl === `${base}/report/new/r081021.html` && listItems[1]?.sourceUrl === `${base}/report/r081009.html` && listItems[0]?.publishedAt === '2026-10-20T15:00:00.000Z',
  listItems.map(entry => `${entry.sourceUrl} ${entry.publishedAt}`).join(' | '));
check('一覧ページ: 説明文は取らない', listItems.every(entry => entry.summary === ''));
const sjisItems = await fetchFeed({ ...listSource, feedUrl: `${base}/report/sjis.html` });
check('一覧ページ: 文字コードを meta で示す Shift_JIS のページも読める', sjisItems.length === 1 && sjisItems[0].publishedAt === '2026-10-20T15:00:00.000Z', JSON.stringify(sjisItems.map(entry => entry.publishedAt)));
// 見出しが <a> の中の要素（法務省・ASBJ の形）、見出しの先頭の括弧つきの日付（公正取引委員会）、追跡用の引数（個人情報保護委員会の ?ref=）
const nested = readHtmlList(`<ul class="list">
<li><span><a href="/list_info.html">新着・お知らせ</a></span><a href="/a.html?ref=top&amp;id=7"><span class="date">10月22日（木）</span><span class="title">（令和8年10月22日）要請について</span></a></li>
</ul>`, { ...source('/index.html'), feedUrl: 'https://example.test/index.html', htmlList: { rows: 'ul.list > li', link: 'span.title', date: 'span.date' } }, 'https://example.test/index.html', octoberNow);
check('一覧ページ: 見出しの要素を囲む <a> の URL を取り、見出しの先頭の日付と追跡用の引数を外す',
  nested.length === 1 && nested[0].title === '要請について' && nested[0].link === 'https://example.test/a.html?id=7' && nested[0].isoDate === '2026-10-21T15:00:00.000Z', JSON.stringify(nested));
const changedItems = await fetchFeed({ ...listSource, feedUrl: `${base}/report/changed.html` });
check('一覧ページの構成が変わって読める行がないときは、空にし、原因が分かる記録を残す',
  changedItems.length === 0 && warnings.some(line => line.includes('layout may have changed')), warnings.slice(-2).join(' | '));

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

// ---------- 保存する記事の上限 ----------
// 候補（既定ではオフ）の記事が、既定の情報源の記事を押し出さないこと。上限は既定の情報源と候補で別々に数える
{
  const now = Date.now();
  const defaultFeed = officialFeeds.find(feed => defaultOn(feed) && !feed.maxItems)!;
  const candidateFeed = officialFeeds.find(feed => !defaultOn(feed) && !feed.maxItems)!;
  // 候補の記事のほうが新しい（新しい順に数えると、候補が先に来る）
  const archiveItems = (feed: FeedSource, count: number, olderByMs: number) => Array.from({ length: count }, (_, index) => item({
    feedUrl: feed.feedUrl, sourceName: feed.sourceName, title: `${feed.sourceName} ${index}`,
    sourceUrl: `https://e.test/${sourceId(feed.feedUrl)}/${index}`, publishedAt: new Date(now - olderByMs - index * 1000).toISOString()
  }));
  const candidates = archiveItems(candidateFeed, CANDIDATE_ARCHIVE_LIMIT + 200, 0);
  const defaults = archiveItems(defaultFeed, ARCHIVE_LIMIT + 100, 2 * 60 * 60 * 1000);
  const expired = item({ feedUrl: defaultFeed.feedUrl, sourceName: defaultFeed.sourceName, title: 'expired', sourceUrl: 'https://e.test/expired', publishedAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString() });
  const trimmed = trimArchive([...candidates, ...defaults, expired], now);
  const keptDefaults = trimmed.filter(entry => entry.feedUrl === defaultFeed.feedUrl);
  const keptCandidates = trimmed.filter(entry => entry.feedUrl === candidateFeed.feedUrl);
  check('新しい候補の記事が多くても、既定の情報源の記事は上限まで残る', keptDefaults.length === ARCHIVE_LIMIT, `${keptDefaults.length}`);
  check('候補の記事は、候補の上限まで（新しい順）', keptCandidates.length === CANDIDATE_ARCHIVE_LIMIT && keptCandidates[0].title === `${candidateFeed.sourceName} 0`, `${keptCandidates.length}`);
  check('既定の情報源の記事は、新しいものから残る', keptDefaults.at(-1)?.title === `${defaultFeed.sourceName} ${ARCHIVE_LIMIT - 1}`, keptDefaults.at(-1)?.title);
  check('30日より古い記事は残さない', !trimmed.some(entry => entry.title === 'expired'));
  check('残した記事は新しい順', trimmed.every((entry, index) => index === 0 || trimmed[index - 1].publishedAt >= entry.publishedAt));
}

// ---------- 見出しと原文へのリンクだけを表示する情報源（利用条件が商用を制限するもの） ----------
// 2026-10-20 の15件と、2026-10-23 に足した専門職向けの B1 の情報源（同じ名前の複数のフィードは1つに数える）
const TITLE_ONLY = ['カナダ政府', 'オンタリオ州政府', 'ウォータールー・リージョン', 'ケンブリッジ市', 'JPX', 'JETRO', 'ジェトロ', 'JAXA', 'KEK', 'WHO', 'Fraunhofer', 'Microsoft Research', 'カーネギーメロン大学', 'Simons Foundation', 'CIFAR',
  'カナダ官報', 'カナダ議会', 'カナダ歳入庁', 'カナダ知的財産庁', 'カナダ・プライバシー・コミッショナー', 'オンタリオ州証券委員会', '日本公認会計士協会', '金融安定理事会', '国際決済銀行',
  '企業会計基準委員会', 'カナダ金融機関監督庁'];
const flagged = [...new Set(officialFeeds.filter(feed => feed.titleOnly).map(feed => feed.sourceName))].sort();
check('SOURCE_TERMS.md の B1 の情報源だけが titleOnly', flagged.join(',') === [...TITLE_ONLY].sort().join(','), flagged.join(','));

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
const listFeed = officialFeeds.find(feed => feed.htmlList)!;
const [listed] = applyTitleOnly([item({ feedUrl: listFeed.feedUrl, sourceName: listFeed.sourceName, summary: '説明文', imageUrl: 'https://example.test/c.jpg' })]);
check('一覧ページから読む情報源（htmlList）も、見出しと原文へのリンクだけ（記事ページを取得しないので、画像も確認済み扱い）',
  listed.summary === '' && listed.imageUrl === undefined && listed.imageChecked === true && listed.titleOnly === true);

const stored = new Map([['x', { headlineJa: '要点', summary: '要約', method: 'extractive' }]]) as unknown as Parameters<typeof withStoredSummaries>[0];
const [withoutAi, withAi] = withStoredSummaries(stored, [item({ id: 'x', titleOnly: true }), item({ id: 'x' })]);
check('titleOnly の記事には、保存済みの要約があっても添えない', !('ai' in withoutAi) && 'ai' in withAi);

// ---------- 読めない形の日付 ----------
// 日付が読めない記事は取り込まれない。実際のフィードで見つかった2つの崩れた形を、読める形に直す
check('日付: 秒がなくコロンが残る形（e-Gov: 2026-10-19T15:00:Z）を読む', toIsoDate('2026-10-19T15:00:Z') === '2026-10-19T15:00:00.000Z', String(toIsoDate('2026-10-19T15:00:Z')));
check('日付: 日付と時刻の間に JST が入る形（青森県）を読む', toIsoDate('2026-10-21JST10:55:00+09:00') === '2026-10-21T01:55:00.000Z', String(toIsoDate('2026-10-21JST10:55:00+09:00')));
check('日付: 末尾が JST の形（千葉県など）は従来どおり読める', toIsoDate('Wed, 21 Oct 2026 10:30:00 JST') === '2026-10-21T01:30:00.000Z', String(toIsoDate('Wed, 21 Oct 2026 10:30:00 JST')));
check('日付: 正しい形は変えない', toIsoDate('2026-10-19T15:00:00Z') === '2026-10-19T15:00:00.000Z' && toIsoDate('2026-10-19T15:00:00+09:00') === '2026-10-19T06:00:00.000Z');
check('日付: 読めないものは未定義のまま', toIsoDate('not a date') === undefined && toIsoDate('') === undefined && toIsoDate(undefined) === undefined);

const datedFeed = (items: string) => `<?xml version="1.0" encoding="UTF-8"?><rdf:RDF xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><channel rdf:about="x"><title>t</title><link>https://example.test/</link><description>d</description></channel>${items}</rdf:RDF>`;
const brokenDates = datedFeed(`
<item rdf:about="https://example.test/egov"><title>意見募集の案件</title><link>https://example.test/egov</link><description>案の公示日</description><dc:date>2026-10-19T15:00:Z</dc:date></item>
<item rdf:about="https://example.test/aomori"><title>青森県の新着</title><link>https://example.test/aomori</link><description>更新情報</description><dc:date>2026-10-21JST10:55:00+09:00</dc:date></item>`);
const dateServer = createServer((request, response) => {
  if (request.url === '/robots.txt') { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'content-type': 'application/rss+xml' }).end(brokenDates);
});
await new Promise<void>(resolve => dateServer.listen(0, '127.0.0.1', resolve));
const dateBase = `http://127.0.0.1:${(dateServer.address() as AddressInfo).port}`;
const datedItems = await fetchFeed({ ...source('/'), sourceUrl: `${dateBase}/`, feedUrl: `${dateBase}/feed` });
check('日付が崩れたフィードでも、記事を取り込む（e-Gov と青森県の形）',
  datedItems.length === 2 && datedItems.map(entry => entry.publishedAt).sort().join(',') === '2026-10-19T15:00:00.000Z,2026-10-21T01:55:00.000Z',
  datedItems.map(entry => entry.publishedAt).join(','));
dateServer.close();

// ---------- 取得全体の上限時間 ----------
// 時計を差し替えて、上限を超えたら、まだ始めていないフィードを今回は取得しないことを確かめる
const stubFeed = (name: string): FeedSource => ({ ...source('/'), sourceName: name, feedUrl: `https://example.test/${name}` });
const stubFeeds = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'].map(stubFeed);
let clock = 0;
const fetchedNames: string[] = [];
const warningsBefore = warnings.length;
console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };
const within = await fetchFeedsWithin(stubFeeds, {
  concurrency: 1, deadlineMs: 100, now: () => clock,
  fetcher: async (feed) => { fetchedNames.push(feed.sourceName); clock += 60; return [item({ title: feed.sourceName, feedUrl: feed.feedUrl })]; }
});
check('上限時間を超えたら、後ろのフィードを今回は取得しない', fetchedNames.join(',') === 'f0,f1' && within.skipped.map(feed => feed.sourceName).join(',') === 'f2,f3,f4,f5', `fetched=${fetchedNames} skipped=${within.skipped.map(feed => feed.sourceName)}`);
check('見送ったフィードは空の結果を返し、順序は保たれる', within.results.length === 6 && within.results[0].length === 1 && within.results[2].length === 0 && within.results[5].length === 0);
check('見送ったことを記録に残す', warnings.slice(warningsBefore).some(line => line.includes('上限時間') && line.includes('f2')));
clock = 0;
const unlimited = await fetchFeedsWithin(stubFeeds, { concurrency: 2, now: () => clock, fetcher: async () => { clock += 1000; return []; } });
check('既定の上限時間（8分）の中なら、すべて取得する', unlimited.skipped.length === 0);
console.warn = originalWarn;

// ---------- フィードの属性（level・area・city・pack・since・terms） ----------
// 公的機関に level が必須、regional と local に area、local に city。pack を持つ情報源は利用条件が A、B1 は titleOnly
const attributeProblems: string[] = [];
for (const feed of officialFeeds) {
  const name = feed.sourceName;
  if (feed.sourceType === 'official' && !feed.level) attributeProblems.push(`${name}: level がない`);
  if (feed.sourceType !== 'official' && feed.level) attributeProblems.push(`${name}: 公的機関でないのに level がある`);
  if (feed.level && !(SOURCE_LEVELS as readonly string[]).includes(feed.level)) attributeProblems.push(`${name}: level が不正`);
  const regionalOrLocal = feed.level === 'regional' || feed.level === 'local';
  if (regionalOrLocal && !/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(feed.area ?? '')) attributeProblems.push(`${name}: area がない・不正`);
  if (!regionalOrLocal && (feed.area || feed.city)) attributeProblems.push(`${name}: regional・local でないのに area・city がある`);
  if (feed.level === 'local' && !/^[a-z0-9-]+$/.test(feed.city ?? '')) attributeProblems.push(`${name}: city がない・不正`);
  if (feed.level !== 'local' && feed.city) attributeProblems.push(`${name}: local でないのに city がある`);
  if (feed.pack && feed.terms !== 'A') attributeProblems.push(`${name}: pack を持つのに利用条件が A でない`);
  if (feed.pack && !(feed.pack in PACKS)) attributeProblems.push(`${name}: pack「${feed.pack}」が src/feeds/packs.ts にない`);
  if (feed.terms === 'B1' && !feed.titleOnly) attributeProblems.push(`${name}: 利用条件が B1 なのに titleOnly でない`);
  if (feed.since && !(/^\d{4}-\d{2}-\d{2}$/.test(feed.since) && feed.since > '2026-10-20')) attributeProblems.push(`${name}: since が不正（凍結の2026-10-20より後の日付）`);
}
const localKeys = officialFeeds.filter(feed => feed.level === 'local').map(feed => `${feed.area}/${feed.city}`);
check('フィードの属性が規則に合う（level・area・city・pack・since・terms）', attributeProblems.length === 0, attributeProblems.join(' | '));
check('市の識別子（area と city の組）は、管轄ごとに1つ', new Set(localKeys).size === localKeys.length, localKeys.join(','));

// 階層の割り当て（PR の説明の一覧表と同じ。変えるときはユーザーの確認が要る）
const namesAt = (level: string) => [...new Set(officialFeeds.filter(feed => feed.level === level).map(feed => feed.sourceName))].sort().join(',');
check('国際機関・EU の機関の割り当て', namesAt('international') === ['ECB', 'ECDC', 'ESA', 'WHO', 'WTO', '欧州医薬品庁', '欧州委員会', '欧州委員会（デジタル）', '欧州理事会',
  // 2026-10-23 に足した専門職向けの情報源
  'EU 司法裁判所', '欧州データ保護会議', '世界知的所有権機関', '欧州銀行監督機構', '欧州保険・年金監督機構', '金融安定理事会', '国際決済銀行', 'EUR-Lex', '欧州特許庁', '証券監督者国際機構', '欧州証券市場監督機構'].sort().join(','), namesAt('international'));
check('州・県の政府の割り当て', namesAt('regional') === ['オンタリオ州政府', 'オンタリオ州証券委員会'].sort().join(','), namesAt('regional'));
// 専門パックの中身（PR の説明の一覧表と同じ。変えるときはユーザーの確認が要る）
const packNames = (pack: string) => [...new Set(officialFeeds.filter(feed => feed.pack === pack).map(feed => feed.sourceName))].sort().join(',');
check('専門パック「法務・知財・立法」の情報源', packNames('legal') === ['米政府出版局', '米連邦官報', '米連邦取引委員会', 'EU 司法裁判所', '欧州データ保護会議', '世界知的所有権機関', 'e-Gov パブリック・コメント', '消費者庁',
  // RSS のない一覧ページから読む当局（2026-10-23 に追加）
  '法務省', '公正取引委員会', '個人情報保護委員会'].sort().join(','), packNames('legal'));
check('専門パック「税務・会計・金融規制」の情報源', packNames('finance') === ['米連邦官報', '米商品先物取引委員会', '米消費者金融保護局', '欧州銀行監督機構', '欧州保険・年金監督機構', '証券取引等監視委員会', '公認会計士・監査審査会',
  // 公的部門の会計検査と、RSS のない一覧ページから読む当局（2026-10-23 に追加）
  '米会計検査院', '会計検査院', '国税庁', '米内国歳入庁', '欧州証券市場監督機構'].sort().join(','), packNames('finance'));
check('専門パックはすべて既定でオフ（候補）', officialFeeds.filter(feed => feed.pack).every(feed => !defaultOn(feed)));
check('市区町村の割り当て', namesAt('local') === ['ウォータールー市', 'キッチナー市', 'ケンブリッジ市', 'ウォータールー・リージョン'].sort().join(','), namesAt('local'));

// ---------- 既定の情報源の凍結 ----------
// 凍結（2026-10-20）までの情報源は、フィードの URL と ID を固定する。URL を替えると ID が変わり、利用者のオン・オフの記録が外れる。
// 凍結より後に足す情報源は、since を付ける（既定ではオフの候補になり、既存の利用者の表示を変えない）
const frozen = JSON.parse(readFileSync(new URL('./frozen-default-feeds.json', import.meta.url), 'utf8')) as { id: string; feedUrl: string; sourceName: string }[];
const frozenUrls = new Set(frozen.map(row => row.feedUrl));
const currentUrls = new Set(officialFeeds.map(feed => feed.feedUrl));
check('凍結した情報源の URL が重複しない', frozenUrls.size === frozen.length);
check('凍結した情報源の ID は、フィードの URL から決まる値のまま', frozen.every(row => sourceId(row.feedUrl) === row.id), frozen.filter(row => sourceId(row.feedUrl) !== row.id).map(row => row.sourceName).join(','));
check('凍結した情報源が、すべて一覧に残っている（URL を替えていない）', [...frozenUrls].every(url => currentUrls.has(url)), [...frozenUrls].filter(url => !currentUrls.has(url)).join(' '));
check('凍結より後に足した情報源には since が付いている（付いていないものは凍結の一覧にある）',
  officialFeeds.every(feed => feed.since || frozenUrls.has(feed.feedUrl)), officialFeeds.filter(feed => !feed.since && !frozenUrls.has(feed.feedUrl)).map(feed => feed.sourceName).join(','));
// 2026-10-21: Cision Canada（Venture Capital の RSS が 404、代わりの RSS はカナダ向けではない）を外して、94件から93件に
check('凍結の一覧は93件（同じフィードを2つのカテゴリで使う5件の重複を除く）', frozen.length === 93 && officialFeeds.length >= 98, `${frozen.length} / ${officialFeeds.length}`);

if (failures) {
  console.error(`\n${failures} 件の確認に失敗しました`);
  process.exit(1);
}
console.log('\nすべて成功しました');
