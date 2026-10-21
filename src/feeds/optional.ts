import type { FeedSource } from '../types.js';

// 専門パックに入れない候補（利用条件が A ではないため）。無償で、既定ではオフ。2026-10-21 に取得と robots.txt を確かめた
// 利用条件の区分は SOURCE_TERMS.md。B1 は見出しと原文へのリンクだけを表示する（titleOnly）
export const optionalFeeds: FeedSource[] = [
  // 全府省の規則案の意見募集（利用条件は e-gov.go.jp が 403 で読めず C）
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '日本', sourceName: 'e-Gov パブリック・コメント', sourceUrl: 'https://public-comment.e-gov.go.jp/', feedUrl: 'https://public-comment.e-gov.go.jp/rss/pcm_list.xml', label: 'e-Gov パブリック・コメント 意見募集中の案件', terms: 'C', since: '2026-10-21' },
  { sourceType: 'npo', category: '経済', subgroup: '日本', sourceName: '日本公認会計士協会', sourceUrl: 'https://jicpa.or.jp/', feedUrl: 'https://jicpa.or.jp/feed/sp_topics.xml', label: '日本公認会計士協会 トピックス', titleOnly: true, terms: 'B1', since: '2026-10-21' },
  { sourceType: 'npo', category: '経済', subgroup: '日本', sourceName: '日本公認会計士協会', sourceUrl: 'https://jicpa.or.jp/', feedUrl: 'https://jicpa.or.jp/feed/sp_Information.xml', label: '日本公認会計士協会 お知らせ', titleOnly: true, terms: 'B1', since: '2026-10-21' },
  { sourceType: 'npo', category: '経済', subgroup: '日本', sourceName: '日本税理士会連合会', sourceUrl: 'https://www.nichizeiren.or.jp/', feedUrl: 'https://www.nichizeiren.or.jp/feed/', label: '日本税理士会連合会 新着情報', terms: 'B2', since: '2026-10-21' },
  { sourceType: 'official', level: 'international', category: '経済', subgroup: 'グローバル', sourceName: 'BIS', sourceUrl: 'https://www.bis.org/', feedUrl: 'https://www.bis.org/doclist/all_pressrels.rss', label: 'BIS（国際決済銀行）プレスリリース', terms: 'B2', since: '2026-10-21' },
  // オンタリオ州証券委員会（州の機関なので regional）
  { sourceType: 'official', level: 'regional', area: 'CA-ON', category: '投資', subgroup: 'カナダ', sourceName: 'オンタリオ州証券委員会', sourceUrl: 'https://www.osc.ca/', feedUrl: 'https://feeds.feedburner.com/rss_osc_headlines_en', label: 'OSC headlines', titleOnly: true, terms: 'B1', since: '2026-10-21' },
  { sourceType: 'official', level: 'regional', area: 'CA-ON', category: '投資', subgroup: 'カナダ', sourceName: 'オンタリオ州証券委員会', sourceUrl: 'https://www.osc.ca/', feedUrl: 'https://feeds.feedburner.com/rss_osc_instruments_rules_polices_en', label: 'OSC instruments, rules and policies', titleOnly: true, terms: 'B1', since: '2026-10-21' },
  { sourceType: 'official', level: 'regional', area: 'CA-ON', category: '投資', subgroup: 'カナダ', sourceName: 'オンタリオ州証券委員会', sourceUrl: 'https://www.osc.ca/', feedUrl: 'https://feeds.feedburner.com/rss_osc_requests_comments_letters_en', label: 'OSC requests for comments', titleOnly: true, terms: 'B1', since: '2026-10-21' }
];
