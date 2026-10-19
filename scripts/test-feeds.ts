// フィード取得の信頼性を確かめる。時間切れ・5xx は取り直し、4xx は取り直さないこと、HTML が返ったときに原因が分かること、
// 同時に取得する数が絞られること、同じ記事の見出し違いが1件にまとまる（別の記事は残る）ことを、本物の通信なしで調べる。
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dedupeSameDocument, fetchFeed, mapWithConcurrency } from '../src/newsPipeline.js';
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
console.warn = originalWarn;
server.close();

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

if (failures) {
  console.error(`\n${failures} 件の確認に失敗しました`);
  process.exit(1);
}
console.log('\nすべて成功しました');
