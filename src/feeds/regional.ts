import type { FeedSource } from '../types.js';

// 州・県の政府の情報源（カナダの州、米国の州）。2026-10-27 に取得・robots.txt・利用条件を確認（SOURCE_TERMS.md）
// 州・県は層が limited（src/sourceTier.ts）で、すべて既定ではオフの候補（since 付き）。B1 は専門パックに入れられないので、パックには入れない
// BC 州・ケベック州は、利用条件が複製の事前許諾を求めるため、許諾を得るまで置かない（SOURCE_TERMS.md）
const SINCE = '2026-10-27';

export const regionalFeeds: FeedSource[] = [
  // マニトバ: OpenMB Licence（許諾なしで複製・翻案・配布・商用利用が可。公式の標章と個人情報は除く）
  { sourceType: 'official', level: 'regional', area: 'CA-MB', category: '政治', subgroup: 'カナダ', terms: 'A', since: SINCE, sourceName: 'マニトバ州政府', sourceUrl: 'https://news.gov.mb.ca/news/', feedUrl: 'https://news.gov.mb.ca/news/index.rss', label: 'Manitoba News Releases', maxItems: 10 },
  // サスカチュワン: 非商用の複製は可、商用は事前の書面許諾が要る（B1）。見出しと原文へのリンクだけを表示する
  { sourceType: 'official', level: 'regional', area: 'CA-SK', category: '政治', subgroup: 'カナダ', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'サスカチュワン州政府', sourceUrl: 'https://www.saskatchewan.ca/government/news-and-media', feedUrl: 'https://www.saskatchewan.ca/Feeds/NewsFeed.ashx', label: 'Saskatchewan News Releases', maxItems: 10 },
  // ニューファンドランド・ラブラドール: 「公衆と非政府組織に使用を許可」とあり、企業を含むか読み取れないため、保守的に B1 に置く
  { sourceType: 'official', level: 'regional', area: 'CA-NL', category: '政治', subgroup: 'カナダ', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'ニューファンドランド・ラブラドール州政府', sourceUrl: 'https://www.gov.nl.ca/releases/', feedUrl: 'https://www.gov.nl.ca/releases/feed/', label: 'Newfoundland and Labrador News Releases', maxItems: 8 },
  // カリフォルニア: 州の共通条項に「原則パブリックドメインで、法が許す範囲で配布・複製できる」とある（写真などの第三者の著作物は別）。3つの情報源で共通
  // 知事室のフィードの説明は、写真の縮小画像と「Source」のリンクだけで要約にならない。写真の権利も残りうるため、A でも見出しと原文へのリンクだけを表示する
  { sourceType: 'official', level: 'regional', area: 'US-CA', category: '政治', subgroup: '米国', terms: 'A', titleOnly: true, since: SINCE, sourceName: 'カリフォルニア州知事室', sourceUrl: 'https://www.gov.ca.gov/newsroom/', feedUrl: 'https://www.gov.ca.gov/feed/', label: 'Governor of California: News', maxItems: 10 },
  { sourceType: 'official', level: 'regional', area: 'US-CA', category: '社会', subgroup: '米国', terms: 'A', since: SINCE, sourceName: 'カリフォルニア州司法省', sourceUrl: 'https://oag.ca.gov/news', feedUrl: 'https://oag.ca.gov/news/feed', label: 'California Attorney General: News', maxItems: 8 },
  // 発信は2か月で10件ほどと少ない。CCPA の規則・執行の発表
  { sourceType: 'official', level: 'regional', area: 'US-CA', category: '社会', subgroup: '米国', terms: 'A', since: SINCE, sourceName: 'カリフォルニア州プライバシー保護庁', sourceUrl: 'https://privacy.ca.gov/about-us/newsroom/', feedUrl: 'https://privacy.ca.gov/feed/', label: 'California Privacy Protection Agency: News', maxItems: 10 },
  // テキサス: サイトの一部でも複製の商用利用を「厳禁」としている（B1）
  { sourceType: 'official', level: 'regional', area: 'US-TX', category: '政治', subgroup: '米国', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'テキサス州知事室', sourceUrl: 'https://gov.texas.gov/news', feedUrl: 'https://gov.texas.gov/news/rss', label: 'Governor of Texas: News', maxItems: 10 },
  // ニューヨーク州金融サービス局: RSS がないので、報道発表の一覧ページを読む。非商用の複製・配布は許可（未改変・出典の明示が条件。商用は書かれていないので B1）
  {
    sourceType: 'official', level: 'regional', area: 'US-NY', category: '経済', subgroup: '米国', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'ニューヨーク州金融サービス局',
    sourceUrl: 'https://www.dfs.ny.gov/press-room', feedUrl: 'https://www.dfs.ny.gov/press-room', label: 'NYDFS: Press Room', maxItems: 10,
    htmlList: { rows: '.views-row', link: '.listing-view__card-headline a[href]', date: '.results-date' }
  }
];
