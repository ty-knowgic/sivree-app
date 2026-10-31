/**
 * 取りこぼしの監査（src/coverageAudit.ts）を、2026-10-29 の Cohere の事例をもとにした公開データの写しで確かめる。
 * 首相府の AI 投資の発表が「政治」だけになった件、配信サービスの発表が日付行を読めずに米国になった件を、利用者の報告なしに見つけられること。
 */
import assert from 'node:assert/strict';
import { coverageAudit, topicKeywordGaps, type PublishedItem, type Snapshot } from '../src/coverageAudit.js';
import { officialFeeds } from '../src/newsPipeline.js';
import type { FeedSource } from '../src/types.js';

const generatedAt = '2026-10-29T18:00:00.000Z';
const at = (daysAgo: number) => new Date(Date.parse(generatedAt) - daysAgo * 86_400_000).toISOString();
const gov: FeedSource = { sourceType: 'official', level: 'national', category: '政治', subgroup: 'カナダ', sourceName: 'Test Gov', sourceUrl: 'https://example.test/', feedUrl: 'https://example.test/gov', label: 'Test Gov' };
const euGov: FeedSource = { ...gov, category: '社会', subgroup: '欧州', sourceName: 'Test EU', feedUrl: 'https://example.test/eu', label: 'Test EU' };
const jpGov: FeedSource = { ...gov, category: '生成AI', subgroup: '日本', sourceName: 'Test JP', feedUrl: 'https://example.test/jp', label: 'Test JP' };
const wireOld: FeedSource = { sourceType: 'corporate', category: '投資', subgroup: '米国', sourceName: 'Wire', sourceUrl: 'https://example.test/', feedUrl: 'https://example.test/wire-vc', label: 'Wire VC' };
const wireNew: FeedSource = { ...wireOld, category: '経済', feedUrl: 'https://example.test/wire-new', label: 'Wire New', datelineRegion: true };
const pm = officialFeeds.find(feed => feed.feedUrl === 'https://pm.gc.ca/en/news.rss');
assert(pm, 'カナダ首相府のフィードがある');
const feeds = [...officialFeeds, gov, euGov, jpGov, wireOld, wireNew];

let n = 0;
const item = (feed: FeedSource, title: string, categories: string[], daysAgo = 1, summary = '', subgroup: string = feed.subgroup): PublishedItem =>
  ({ id: `i${n++}`, title, summary, publishedAt: at(daysAgo), sourceName: feed.sourceName, sourceUrl: `https://example.test/a${n}`, feedUrl: feed.feedUrl, sourceType: feed.sourceType, subgroup, categories });

const news: PublishedItem[] = [
  // 2026-10-29 の公開データのまま（分類の修正前）
  item(pm, 'Canada announces landmark investment in Cohere to scale secure, sovereign AI', ['政治'], 0.1, 'Artificial intelligence (AI) is the next great technological transformation.'),
  item(wireOld, 'Cohere Announces Series E Fundraise Targeting CAD $7 Billion to Meet Surging Global Demand', ['投資'], 0.1, 'Record-setting round marks largest private capital raise in Canadian history fuelling investment in…'),
  // いまの規則でも付かない（見出しは分野を名指ししている）
  item(gov, 'Minister launches national machine learning strategy', ['政治'], 2),
  // 企業の「AI 搭載」の宣伝は、取りこぼしとして数えない
  item(wireOld, 'Breakthrough AI-powered cooling for data centers', ['投資'], 2),
  // 日付行が読める配信サービスの発表。設定のないフィードは未解決、設定のあるフィードはコード側で解消済み
  ...[1, 2, 3].map(day => item(wireOld, `Earnings ${day}`, ['投資'], day, 'CHAM, Switzerland, Oct. 29, 2026 /PRNewswire/ -- Landis+Gyr Group AG')),
  item(wireNew, 'Q3 results', ['経済'], 1, 'CALGARY, AB, Oct. 29, 2026 /PRNewswire/ -- Frontera'),
  // 地域・カテゴリの量（カナダの記事は来ていて、生成AI は日本では動いている）
  ...Array.from({ length: 30 }, (_, i) => item(gov, `Routine announcement ${i}`, ['政治'], 1 + (i % 12))),
  ...Array.from({ length: 20 }, (_, i) => item(jpGov, `AIの取組 ${i}`, ['生成AI'], 1 + (i % 12))),
  // 前の週にあった 社会×欧州 が、直近の週に消えた
  ...Array.from({ length: 8 }, (_, i) => item(euGov, `Social policy ${i}`, ['社会'], 8 + (i % 5)))
];
const sources = feeds.filter(feed => news.some(entry => entry.feedUrl === feed.feedUrl)).map(feed => ({ feedUrl: feed.feedUrl, label: feed.label, sourceName: feed.sourceName, candidate: false, health: feed === euGov ? { ok: false, error: 'HTTP 403' } : { ok: true } }));
const snapshot: Snapshot = { meta: { generatedAt }, news, sources };
const report = coverageAudit(snapshot, feeds);
const find = (predicate: (message: string) => boolean) => report.findings.filter(finding => predicate(finding.message));

const pmGap = find(message => message.startsWith('カナダ首相府') && message.includes('「AI」'));
assert.equal(pmGap.length, 1, '首相府の AI の発表に生成AIがないことを見つける');
assert.equal(pmGap[0].status, 'fixed-in-code', 'いまの規則では生成AIが付くことを確かめる');
assert.deepEqual(pmGap[0].examples[0].current?.categories, ['政治', '生成AI']);

const wireGenai = find(message => message.startsWith('Wire:') && message.includes('生成AI（企業）'));
assert.equal(wireGenai.length, 1, '基盤モデル企業の発表に生成AIがないことを見つける');
assert.equal(wireGenai[0].status, 'fixed-in-code');
assert.equal(wireGenai[0].count, 1, '企業の「AI 搭載」の宣伝は数えない');

const cohereRegion = find(message => message.startsWith('Wire VC') && message.includes('日付行が読めず'));
assert.equal(cohereRegion.length, 1, '日付行の消えた配信サービスの発表が、本文ではカナダを名指ししていることを見つける');
assert.equal(cohereRegion[0].status, 'open');
assert.equal(cohereRegion[0].examples[0].current?.subgroup, 'カナダ');

const dateline = report.findings.filter(finding => finding.code === 'dateline-region' && !finding.message.includes('日付行が読めず'));
assert.deepEqual(dateline.map(finding => [finding.message.split(':')[0], finding.status, finding.count]), [['Wire VC', 'open', 3], ['Wire New', 'fixed-in-code', 1]]);
assert(dateline[0].hint.includes('datelineRegion'), '直し方としてフィードの設定を示す');

const open = find(message => message.startsWith('Test Gov') && message.includes('「AI」'));
assert.equal(open.length, 1);
assert.equal(open[0].status, 'open', 'いまの規則でも付かない取りこぼしは未解決として残す');

const cell = report.cells.find(entry => entry.category === '生成AI' && entry.region === 'カナダ');
assert.deepEqual([cell?.current, cell?.prior], [0, 0]);
assert.equal(cell?.projected, 1, 'いまのコードで分類し直した件数を示す');
const empty = report.findings.find(finding => finding.code === 'cell-empty' && finding.message.startsWith('生成AI×カナダ'));
assert(empty, '生成AI×カナダが空であることを見つける');
assert.equal(empty.status, 'fixed-in-code');

const collapse = report.findings.find(finding => finding.code === 'cell-collapse' && finding.message.startsWith('社会×欧州'));
assert(collapse && collapse.priority === 'P1', '前の週から消えた組み合わせを見つける');
assert(collapse.message.includes('取得失敗: Test EU HTTP 403') && collapse.hint.includes('回避しない'), '取得に失敗している情報源を示し、403 を回避しないことを示す');

assert.deepEqual(report.findings.map(finding => finding.priority), [...report.findings.map(finding => finding.priority)].sort(), '優先度の高い順に並ぶ');

const custom = topicKeywordGaps([{ id: 'genai', label: 'テスト', keywords: ['generative AI', 'Mistral', 'unknownmodelword'] } as never]);
assert.equal(custom.findings.length, 1);
assert(custom.findings[0].message.includes('unknownmodelword') && !custom.findings[0].message.includes('Mistral'), '規則に入れない理由を書いた語は報告しない');
assert.deepEqual(topicKeywordGaps().findings.map(finding => finding.message), [], '既定トピックの語は、対応するカテゴリの規則に入っているか、入れない理由が書いてある');

console.log('✓ 取りこぼしの監査: 2026-10-29 の Cohere の事例（分類・地域）を利用者の報告なしに見つけ、コード側で解消済みかどうかを区別する');
