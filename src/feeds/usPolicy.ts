import type { FeedSource } from '../types.js';

// 米国務省のフィード（src/feeds/core.ts）は 2026-10-29 から SivreeBot に 403（robots.txt も 403。回避しない）。
// 米国の政治の一次情報として、大統領の正式な措置と、国務省の制裁・決定の官報掲載を足す。すべて既定ではオフの無償の候補（SOURCE_TERMS.md）
const since = '2026-10-30';

export const usPolicyFeeds: FeedSource[] = [
  // ホワイトハウスは全体のニュース（/news/feed/）ではなく、大統領令・布告・覚書（Presidential Actions）とその説明（Fact Sheets）に限る。記念日・記念月の布告は除く
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '米国', terms: 'A', since, sourceName: 'ホワイトハウス', sourceUrl: 'https://www.whitehouse.gov/presidential-actions/', feedUrl: 'https://www.whitehouse.gov/presidential-actions/feed/', label: 'The White House: Presidential Actions', maxItems: 10, exclude: /^[^:]{0,80}\b(Day|Week|Month),? 20\d\d\b/i },
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '米国', terms: 'A', since, sourceName: 'ホワイトハウス', sourceUrl: 'https://www.whitehouse.gov/fact-sheets/', feedUrl: 'https://www.whitehouse.gov/fact-sheets/feed/', label: 'The White House: Fact Sheets', maxItems: 10 },
  // 連邦官報の国務省の文書のうち、制裁・指定・大統領や長官の決定・武器輸出規制だけ（情報収集の告知・プライバシー法・展示品の決定・会議の告知は除く）
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '米国', terms: 'A', since, sourceName: '米連邦官報', sourceUrl: 'https://www.federalregister.gov/agencies/state-department', feedUrl: 'https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=state-department', label: 'Federal Register: State Department Sanctions and Determinations', maxItems: 8, include: /sanction|designat|determination|terrorist|International Traffic in Arms|\bITAR\b|export|visa restriction/i, exclude: /Culturally Significant Objects?|Information Collection|Privacy Act|System of Records|Public Meeting|Advisory Committee|Meeting Notice/i },
];
