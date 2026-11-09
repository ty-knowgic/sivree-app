import type { FeedSource } from '../types.js';

// 凍結した既定の情報源（src/feeds/core.ts）のうち、フィードがなくなって外したものの後継。
// 凍結の URL は替えない（ID が変わり、利用者のオン・オフが失われる）ので、古い方を外し、後継は since を付けた候補として足す（既定ではオフ）。
// 外した凍結の情報源: Cision Canada（2026-10-21）、ESA 宇宙科学（2026-11-07）
const since = '2026-11-07';

export const replacementFeeds: FeedSource[] = [
  // ESA: 旧 /rssfeed/Our_Activities/Space_Science は、サイトの刷新で 2026-10-29 から 404。後継は 2026-11-07 に robots.txt（全許可）と 200・15件を確認した（docs/source-health-investigation.md）
  { sourceType: 'official', level: 'international', category: 'サイエンス', subgroup: '欧州', since, sourceName: 'ESA', sourceUrl: 'https://www.esa.int/Science_Exploration/Space_Science', feedUrl: 'https://www.esa.int/rss/science.rss', label: '欧州宇宙機関 宇宙科学' },
];
