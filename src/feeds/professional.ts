import type { FeedSource } from '../types.js';

// 専門職（士業・会計・金融のコンプライアンス・知財・ロビイストなど）向けの情報源。2026-10-23 に取得・robots.txt・利用条件を確認（SOURCE_TERMS.md）
// すべて既定ではオフの候補（since 付き）。pack を持つものは専門パック（src/feeds/packs.ts。利用条件が A のものだけ）、それ以外は無償の候補
// 利用条件が B1 のものは titleOnly（見出しと原文へのリンクだけ）、C のものは既存の C の情報源と同じに表示する
const SINCE = '2026-10-23';

// 米連邦官報（Federal Register）の API の RSS。機関ごとの規則と規則案（type=RULE・PRORULE）に絞る
const federalRegister = (conditions: string) => `https://www.federalregister.gov/api/v1/documents.rss?${conditions}`;
const rulesOf = (agency: string) => federalRegister(`conditions%5Bagencies%5D%5B%5D=${agency}&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE`);

export const professionalFeeds: FeedSource[] = [
  // 専門パック「法務・知財・立法」
  // 説明文はファイルの一覧（PDF・TEXT・メタデータのリンク）だけなので、すべて取り除く。日付は GovInfo に掲載された日で、成立の日ではない
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '米国', pack: 'legal', terms: 'A', since: SINCE, sourceName: '米政府出版局', sourceUrl: 'https://www.govinfo.gov/app/collection/plaw', feedUrl: 'https://www.govinfo.gov/rss/plaw.xml', label: 'GovInfo: Public Laws', maxItems: 10, summaryPrefix: /^\s*Content Files\b[\s\S]*/i },
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '米国', pack: 'legal', terms: 'A', since: SINCE, sourceName: '米連邦官報', sourceUrl: 'https://www.federalregister.gov/', feedUrl: federalRegister('conditions%5Bsignificant%5D=1&conditions%5Btype%5D%5B%5D=RULE'), label: 'Federal Register: Significant Final Rules' },
  { sourceType: 'official', level: 'national', category: 'テクノロジー', subgroup: '米国', pack: 'legal', terms: 'A', since: SINCE, sourceName: '米連邦官報', sourceUrl: 'https://www.federalregister.gov/agencies/patent-and-trademark-office', feedUrl: federalRegister('conditions%5Bagencies%5D%5B%5D=patent-and-trademark-office'), label: 'Federal Register: Patent and Trademark Office' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', pack: 'legal', terms: 'A', since: SINCE, sourceName: '米連邦取引委員会', sourceUrl: 'https://www.ftc.gov/', feedUrl: 'https://www.ftc.gov/feeds/press-release-competition.xml', label: 'FTC Press Releases: Competition' },
  { sourceType: 'official', level: 'international', category: '政治', subgroup: '欧州', pack: 'legal', terms: 'A', since: SINCE, sourceName: 'EU 司法裁判所', sourceUrl: 'https://curia.europa.eu/', feedUrl: 'https://curia.europa.eu/site/rss.jsp?lang=en', label: 'CJEU Press Releases' },
  { sourceType: 'official', level: 'international', category: '社会', subgroup: '欧州', pack: 'legal', terms: 'A', since: SINCE, sourceName: '欧州データ保護会議', sourceUrl: 'https://www.edpb.europa.eu/', feedUrl: 'https://www.edpb.europa.eu/feed/news_en', label: 'EDPB News' },
  { sourceType: 'official', level: 'international', category: 'テクノロジー', subgroup: 'グローバル', pack: 'legal', terms: 'A', since: SINCE, sourceName: '世界知的所有権機関', sourceUrl: 'https://www.wipo.int/', feedUrl: 'https://www.wipo.int/pressroom/en/rss.xml', label: 'WIPO Press Releases' },
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '日本', pack: 'legal', terms: 'A', since: SINCE, sourceName: 'e-Gov パブリック・コメント', sourceUrl: 'https://public-comment.e-gov.go.jp/', feedUrl: 'https://public-comment.e-gov.go.jp/rss/pcm_list.xml', label: 'e-Gov パブリック・コメント（意見募集中の案件）' },
  { sourceType: 'official', level: 'national', category: '社会', subgroup: '日本', pack: 'legal', terms: 'A', since: SINCE, sourceName: '消費者庁', sourceUrl: 'https://www.caa.go.jp/', feedUrl: 'https://www.caa.go.jp/news.rss', label: '消費者庁 新着情報', maxItems: 6, excludeRoutine: true },

  // 専門パック「税務・会計・金融規制」
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', pack: 'finance', terms: 'A', since: SINCE, sourceName: '米連邦官報', sourceUrl: 'https://www.federalregister.gov/agencies/internal-revenue-service', feedUrl: rulesOf('internal-revenue-service'), label: 'Federal Register: IRS Rules and Proposed Rules' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', pack: 'finance', terms: 'A', since: SINCE, sourceName: '米連邦官報', sourceUrl: 'https://www.federalregister.gov/agencies/securities-and-exchange-commission', feedUrl: rulesOf('securities-and-exchange-commission'), label: 'Federal Register: SEC Rules and Proposed Rules' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', pack: 'finance', terms: 'A', since: SINCE, sourceName: '米連邦官報', sourceUrl: 'https://www.federalregister.gov/agencies/financial-crimes-enforcement-network', feedUrl: rulesOf('financial-crimes-enforcement-network'), label: 'Federal Register: FinCEN Rules and Proposed Rules' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', pack: 'finance', terms: 'A', since: SINCE, sourceName: '米連邦官報', sourceUrl: 'https://www.federalregister.gov/agencies/foreign-assets-control-office', feedUrl: rulesOf('foreign-assets-control-office'), label: 'Federal Register: OFAC Sanctions Rules' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', pack: 'finance', terms: 'A', since: SINCE, sourceName: '米商品先物取引委員会', sourceUrl: 'https://www.cftc.gov/', feedUrl: 'https://www.cftc.gov/RSS/RSSGP/rssgp.xml', label: 'CFTC Press Releases' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', pack: 'finance', terms: 'A', since: SINCE, sourceName: '米商品先物取引委員会', sourceUrl: 'https://www.cftc.gov/', feedUrl: 'https://www.cftc.gov/RSS/RSSENF/rssenf.xml', label: 'CFTC Enforcement Press Releases' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', pack: 'finance', terms: 'A', since: SINCE, sourceName: '米消費者金融保護局', sourceUrl: 'https://www.consumerfinance.gov/', feedUrl: 'https://www.consumerfinance.gov/about-us/newsroom/feed/', label: 'CFPB Newsroom' },
  { sourceType: 'official', level: 'international', category: '経済', subgroup: '欧州', pack: 'finance', terms: 'A', since: SINCE, sourceName: '欧州銀行監督機構', sourceUrl: 'https://www.eba.europa.eu/', feedUrl: 'https://www.eba.europa.eu/news-press/news/rss.xml', label: 'EBA News' },
  { sourceType: 'official', level: 'international', category: '経済', subgroup: '欧州', pack: 'finance', terms: 'A', since: SINCE, sourceName: '欧州保険・年金監督機構', sourceUrl: 'https://www.eiopa.europa.eu/', feedUrl: 'https://www.eiopa.europa.eu/node/4816/rss_en', label: 'EIOPA News' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '日本', pack: 'finance', terms: 'A', since: SINCE, sourceName: '証券取引等監視委員会', sourceUrl: 'https://www.fsa.go.jp/sesc/', feedUrl: 'https://www.fsa.go.jp/sescReportList_rss2.xml', label: '証券取引等監視委員会 報道発表' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '日本', pack: 'finance', terms: 'A', since: SINCE, sourceName: '証券取引等監視委員会', sourceUrl: 'https://www.fsa.go.jp/sesc/', feedUrl: 'https://www.fsa.go.jp/sescOtherList_rss2.xml', label: '証券取引等監視委員会 その他の広報' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '日本', pack: 'finance', terms: 'A', since: SINCE, sourceName: '公認会計士・監査審査会', sourceUrl: 'https://www.fsa.go.jp/cpaaob/', feedUrl: 'https://www.fsa.go.jp/cpaaobNewsList_rss2.xml', label: '公認会計士・監査審査会 新着情報' },
  // 公的部門の会計検査（政府の支出・事業の検査結果）
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '米国', pack: 'finance', terms: 'A', since: SINCE, sourceName: '米会計検査院', sourceUrl: 'https://www.gao.gov/', feedUrl: 'https://www.gao.gov/rss/reports.xml', label: 'GAO Reports and Testimonies', summaryPrefix: /^\s*What GAO Found\s*/i },
  {
    sourceType: 'official', level: 'national', category: '政治', subgroup: '日本', pack: 'finance', terms: 'A', since: SINCE, sourceName: '会計検査院', sourceUrl: 'https://www.jbaudit.go.jp/',
    // RSS がないため、「注目の検査結果」の表（公表年月日・件名）を読む。年は元号なしの令和（「8年10月21日」）
    feedUrl: 'https://www.jbaudit.go.jp/report/about/attention.html',
    htmlList: { rows: 'table.table3 tr', link: 'a[href]', date: 'td:first-child', era: 'reiwa' },
    label: '会計検査院 注目の検査結果'
  },

  // 無償の候補: 利用条件が商用を制限する（B1）ため、見出しと原文へのリンクだけ
  { sourceType: 'official', level: 'national', category: '政治', subgroup: 'カナダ', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'カナダ官報', sourceUrl: 'https://gazette.gc.ca/', feedUrl: 'https://gazette.gc.ca/rss/p1-eng.xml', label: 'Canada Gazette Part I' },
  { sourceType: 'official', level: 'national', category: '政治', subgroup: 'カナダ', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'カナダ官報', sourceUrl: 'https://gazette.gc.ca/', feedUrl: 'https://gazette.gc.ca/rss/p2-eng.xml', label: 'Canada Gazette Part II (Regulations)' },
  { sourceType: 'official', level: 'national', category: '政治', subgroup: 'カナダ', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'カナダ議会', sourceUrl: 'https://www.parl.ca/legisinfo/', feedUrl: 'https://www.parl.ca/legisinfo/en/bills/rss', label: 'LEGISinfo: Bills', maxItems: 10 },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: 'カナダ', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'カナダ歳入庁', sourceUrl: 'https://www.canada.ca/en/revenue-agency.html', feedUrl: 'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=revenueagency&sort=publishedDate&orderBy=desc&pick=20&format=atom&atomtitle=Canada%20Revenue%20Agency', label: 'Canada Revenue Agency News' },
  { sourceType: 'official', level: 'national', category: 'テクノロジー', subgroup: 'カナダ', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'カナダ知的財産庁', sourceUrl: 'https://ised-isde.canada.ca/site/canadian-intellectual-property-office/en', feedUrl: 'https://api.io.canada.ca/io-server/gc/news/en/v2?dept=intellectualpropertyoffice&sort=publishedDate&orderBy=desc&pick=20&format=atom&atomtitle=Canadian%20Intellectual%20Property%20Office', label: 'CIPO News' },
  { sourceType: 'official', level: 'national', category: '社会', subgroup: 'カナダ', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'カナダ・プライバシー・コミッショナー', sourceUrl: 'https://www.priv.gc.ca/', feedUrl: 'https://www.priv.gc.ca/en/rss/news/', label: 'OPC News' },
  { sourceType: 'official', level: 'regional', area: 'CA-ON', category: '経済', subgroup: 'カナダ', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'オンタリオ州証券委員会', sourceUrl: 'https://www.osc.ca/', feedUrl: 'https://feeds.feedburner.com/rss_osc_headlines_en', label: 'OSC News' },
  { sourceType: 'official', level: 'regional', area: 'CA-ON', category: '経済', subgroup: 'カナダ', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'オンタリオ州証券委員会', sourceUrl: 'https://www.osc.ca/', feedUrl: 'https://feeds.feedburner.com/rss_osc_instruments_rules_polices_en', label: 'OSC Instruments, Rules and Policies' },
  { sourceType: 'npo', category: '経済', subgroup: '日本', terms: 'B1', titleOnly: true, since: SINCE, sourceName: '日本公認会計士協会', sourceUrl: 'https://jicpa.or.jp/', feedUrl: 'https://jicpa.or.jp/feed/sp_Information.xml', label: '日本公認会計士協会 お知らせ' },
  { sourceType: 'official', level: 'international', category: '経済', subgroup: 'グローバル', terms: 'B1', titleOnly: true, since: SINCE, sourceName: '金融安定理事会', sourceUrl: 'https://www.fsb.org/', feedUrl: 'https://www.fsb.org/feed/', label: 'FSB Publications' },
  { sourceType: 'official', level: 'international', category: '経済', subgroup: 'グローバル', terms: 'B1', titleOnly: true, since: SINCE, sourceName: '国際決済銀行', sourceUrl: 'https://www.bis.org/', feedUrl: 'https://www.bis.org/doclist/all_pressrels.rss', label: 'BIS Press Releases' },

  // 無償の候補: 利用条件を読み取れない（C）。既存の C の情報源と同じに表示する
  {
    sourceType: 'official', level: 'international', category: '政治', subgroup: '欧州', terms: 'C', since: SINCE, sourceName: 'EUR-Lex', sourceUrl: 'https://eur-lex.europa.eu/',
    feedUrl: 'https://eur-lex.europa.eu/EN/display-feed.rss?rssId=162',
    // 見出しが CELEX 番号だけの記事（英語版に関係しない訂正など）は除き、「CELEX:番号: 法令名」の形のものだけを取り込む
    include: /^CELEX:\S+: /,
    label: 'EUR-Lex: Parliament and Council Legislation'
  },
  { sourceType: 'official', level: 'international', category: 'テクノロジー', subgroup: '欧州', terms: 'C', since: SINCE, sourceName: '欧州特許庁', sourceUrl: 'https://www.epo.org/', feedUrl: 'https://www.epo.org/en/news-events/news/feed', label: 'EPO News', maxItems: 6 },
  { sourceType: 'official', level: 'international', category: 'テクノロジー', subgroup: '欧州', terms: 'C', since: SINCE, sourceName: '欧州特許庁', sourceUrl: 'https://www.epo.org/', feedUrl: 'https://www.epo.org/en/law-and-practice/boards-of-appeal/communications/feed', label: 'EPO Boards of Appeal Communications', maxItems: 6 },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', terms: 'C', since: SINCE, sourceName: '米通貨監督庁', sourceUrl: 'https://www.occ.gov/', feedUrl: 'https://www.occ.gov/rss/occ_news.xml', label: 'OCC News Releases' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', terms: 'C', since: SINCE, sourceName: '米通貨監督庁', sourceUrl: 'https://www.occ.gov/', feedUrl: 'https://www.occ.gov/rss/occ_bulletins.xml', label: 'OCC Bulletins' },
  { sourceType: 'official', level: 'international', category: '経済', subgroup: 'グローバル', terms: 'C', since: SINCE, sourceName: '証券監督者国際機構', sourceUrl: 'https://www.iosco.org/', feedUrl: 'https://www.iosco.org/rss/rss.xml', label: 'IOSCO Media Releases' },
  { sourceType: 'npo', category: '経済', subgroup: '米国', terms: 'C', since: SINCE, sourceName: '米アクチュアリー基準審議会', sourceUrl: 'https://www.actuarialstandardsboard.org/', feedUrl: 'https://www.actuarialstandardsboard.org/feed/atom/', label: 'Actuarial Standards Board News' },
  { sourceType: 'npo', category: '経済', subgroup: '日本', terms: 'C', since: SINCE, sourceName: '日本税理士会連合会', sourceUrl: 'https://www.nichizeiren.or.jp/', feedUrl: 'https://www.nichizeiren.or.jp/feed/', label: '日本税理士会連合会 新着情報' },
  { sourceType: 'npo', category: 'テクノロジー', subgroup: '日本', terms: 'C', since: SINCE, sourceName: '日本弁理士会', sourceUrl: 'https://www.jpaa.or.jp/', feedUrl: 'https://www.jpaa.or.jp/feed/', label: '日本弁理士会 新着情報' },

  // 無償の候補: 利用条件は A だが、技術士などの技術職向けのパックは、この1件だけになるため作らない
  { sourceType: 'official', level: 'national', category: '社会', subgroup: '日本', terms: 'A', since: SINCE, sourceName: '国土交通省', sourceUrl: 'https://www.mlit.go.jp/', feedUrl: 'https://www.mlit.go.jp/pressrelease.rdf', label: '国土交通省 報道発表', maxItems: 6, excludeRoutine: true }
];
