import type { FeedSource } from '../types.js';

// 日本の府省庁のうち、凍結（2026-10-20）の一覧に入っていない発信元。きっかけと網羅の現状は docs/feedback-log.md（DATA-04）。
// 2026-11-08 に取得・robots.txt・利用条件を確認した（SOURCE_TERMS.md）。すべて既定ではオフの候補（since 付き）。パックには入れない
const SINCE = '2026-11-08';

export const ministryFeeds: FeedSource[] = [
  // 農林水産省: /rss.xml は報道発表（林野庁・水産庁・農林水産技術会議のものを含む）の新しい順40件。説明文は空
  // （/j/rss.xml は 2016 年で止まった古いフィードなので使わない）。利用条件は PDL1.0 準拠（https://www.maff.go.jp/j/use/link.html）
  { sourceType: 'official', level: 'national', category: '社会', subgroup: '日本', terms: 'A', since: SINCE, sourceName: '農林水産省', sourceUrl: 'https://www.maff.go.jp/', feedUrl: 'https://www.maff.go.jp/rss.xml', label: '農林水産省 報道発表' }
];
