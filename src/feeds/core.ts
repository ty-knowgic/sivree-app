import type { FeedSource } from '../types.js';

// 2026-10 時点で取得できることを確認済みのフィード
// 並びは取得の優先順位。取得の上限時間を超えたときは、後ろのフィードから見送る
// level は公的機関に必須（international / national / regional / local）。regional と local には area（ISO 3166-2）、local には city も付ける
// since は、凍結（2026-10-20）より後に足した情報源にだけ付ける（付いた情報源は既定ではオフの候補になる）。このファイルの情報源には付かない
export const coreFeeds: FeedSource[] = [
  // 政治
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '日本', sourceName: '首相官邸', sourceUrl: 'https://www.kantei.go.jp/', feedUrl: 'https://www.kantei.go.jp/index-jnews.rdf', label: '首相官邸 新着情報' },
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '日本', sourceName: '総務省', sourceUrl: 'https://www.soumu.go.jp/', feedUrl: 'https://www.soumu.go.jp/news.rdf', label: '総務省 報道資料' },
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '米国', sourceName: '米国務省', sourceUrl: 'https://www.state.gov/', feedUrl: 'https://www.state.gov/rss-feed/press-releases/feed/', label: 'U.S. Department of State Press Releases' },
  // 経済（公的機関）: 発表量が多く定型的なお知らせも多いため、件数を抑えて定型告知を除外する
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '日本', sourceName: '日本銀行', sourceUrl: 'https://www.boj.or.jp/', feedUrl: 'https://www.boj.or.jp/rss/whatsnew.xml', label: '日本銀行 新着情報', maxItems: 6, excludeRoutine: true },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '日本', sourceName: '財務省', sourceUrl: 'https://www.mof.go.jp/', feedUrl: 'https://www.mof.go.jp/news.rss', label: '財務省 新着情報', maxItems: 6, excludeRoutine: true },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '日本', sourceName: '金融庁', sourceUrl: 'https://www.fsa.go.jp/', feedUrl: 'https://www.fsa.go.jp/fsaNewsListAll_rss2.xml', label: '金融庁 新着情報', maxItems: 6, excludeRoutine: true },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '日本', sourceName: 'JPX', sourceUrl: 'https://www.jpx.co.jp/', feedUrl: 'https://www.jpx.co.jp/rss/jpx-news.xml', label: '日本取引所グループ ニュース', titleOnly: true },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', sourceName: 'FRB', sourceUrl: 'https://www.federalreserve.gov/', feedUrl: 'https://www.federalreserve.gov/feeds/press_all.xml', label: 'Federal Reserve Press Releases', maxItems: 6 },
  { sourceType: 'official', level: 'international', category: '経済', subgroup: '欧州', sourceName: 'ECB', sourceUrl: 'https://www.ecb.europa.eu/', feedUrl: 'https://www.ecb.europa.eu/rss/press.html', label: 'ECB Press', maxItems: 6 },
  // 経済（企業の発表）: 提携・買収・決算・事業展開・事故や不祥事など、企業活動に関するプレスリリース
  { sourceType: 'corporate', matchOnly: ['経済', '投資', '生成AI', 'テクノロジー'], subgroup: '日本', sourceName: 'PR TIMES', sourceUrl: 'https://prtimes.jp/', feedUrl: 'https://prtimes.jp/index.rdf', label: 'PR TIMES（企業の一次発表）' },
  { sourceType: 'corporate', matchOnly: ['経済', '投資', '生成AI', 'テクノロジー'], subgroup: '日本', sourceName: '@Press', sourceUrl: 'https://www.atpress.ne.jp/', feedUrl: 'https://www.atpress.ne.jp/rss/index.rdf', label: '@Press（企業の一次発表）' },
  { sourceType: 'corporate', category: '経済', subgroup: '米国', sourceName: 'PR Newswire', sourceUrl: 'https://www.prnewswire.com/', feedUrl: 'https://www.prnewswire.com/rss/financial-services-latest-news/earnings-list.rss', label: 'PR Newswire 決算発表', languages: ['en'] },
  { sourceType: 'corporate', matchOnly: ['経済', '投資', '生成AI', 'テクノロジー'], subgroup: '米国', sourceName: 'PR Newswire', sourceUrl: 'https://www.prnewswire.com/', feedUrl: 'https://www.prnewswire.com/rss/financial-services-latest-news/mergers-and-acquisitions-list.rss', label: 'PR Newswire 新着（M&A 専用ではなく全般。経済・投資・生成AIの記事だけ採用）', languages: ['en'] },
  { sourceType: 'corporate', matchOnly: ['経済', '投資', '生成AI', 'テクノロジー'], subgroup: '米国', sourceName: 'PR Newswire', sourceUrl: 'https://www.prnewswire.com/', feedUrl: 'https://www.prnewswire.com/rss/general-business-latest-news/general-business-latest-news-list.rss', label: 'PR Newswire 一般ビジネス', languages: ['en'] },
  // 投資（政府系の投資、スタートアップの資金調達）
  { sourceType: 'official', level: 'national', category: '投資', subgroup: '日本', sourceName: 'GPIF', sourceUrl: 'https://www.gpif.go.jp/', feedUrl: 'https://www.gpif.go.jp/rss.xml', label: '年金積立金管理運用独立行政法人' },
  { sourceType: 'corporate', category: '投資', subgroup: '米国', sourceName: 'PR Newswire', sourceUrl: 'https://www.prnewswire.com/', feedUrl: 'https://www.prnewswire.com/rss/financial-services-latest-news/venture-capital-list.rss', label: 'PR Newswire Venture Capital（企業の一次発表）', languages: ['en'] },
  // 社会・国際
  { sourceType: 'official', level: 'national', category: '社会', subgroup: '日本', sourceName: '厚生労働省', sourceUrl: 'https://www.mhlw.go.jp/', feedUrl: 'https://www.mhlw.go.jp/stf/news.rdf', label: '厚生労働省 新着情報' },
  { sourceType: 'official', level: 'national', category: '社会', subgroup: '日本', sourceName: '文部科学省', sourceUrl: 'https://www.mext.go.jp/', feedUrl: 'https://www.mext.go.jp/b_menu/news/index.rdf', label: '文部科学省 新着情報' },
  { sourceType: 'official', level: 'national', category: '社会', subgroup: '米国', sourceName: '米CDC', sourceUrl: 'https://www.cdc.gov/', feedUrl: 'https://tools.cdc.gov/api/v2/resources/media/132608.rss', label: 'CDC Newsroom' },
  { sourceType: 'official', level: 'national', category: '国際', subgroup: '日本', sourceName: 'JETRO', sourceUrl: 'https://www.jetro.go.jp/', feedUrl: 'https://www.jetro.go.jp/rss/biznews.xml', label: 'JETRO ビジネス短信', titleOnly: true },
  { sourceType: 'official', level: 'international', category: '国際', subgroup: 'グローバル', sourceName: 'WHO', sourceUrl: 'https://www.who.int/', feedUrl: 'https://www.who.int/rss-feeds/news-english.xml', label: 'WHO News', titleOnly: true },
  { sourceType: 'official', level: 'international', category: '国際', subgroup: '欧州', sourceName: '欧州委員会', sourceUrl: 'https://ec.europa.eu/', feedUrl: 'https://ec.europa.eu/commission/presscorner/api/rss?language=en', label: 'European Commission Press Corner' },
  { sourceType: 'official', level: 'national', category: '国際', subgroup: '欧州', sourceName: '英国外務省', sourceUrl: 'https://www.gov.uk/', feedUrl: 'https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom', label: 'UK Foreign, Commonwealth & Development Office' },
  // テクノロジー
  { sourceType: 'official', level: 'national', category: 'テクノロジー', subgroup: '日本', sourceName: 'デジタル庁', sourceUrl: 'https://www.digital.go.jp/', feedUrl: 'https://www.digital.go.jp/rss/news.xml', label: 'デジタル庁 新着情報' },
  { sourceType: 'official', level: 'national', category: 'テクノロジー', subgroup: '日本', sourceName: 'JST', sourceUrl: 'https://www.jst.go.jp/', feedUrl: 'https://www.jst.go.jp/rss/press.xml', label: '科学技術振興機構 プレスリリース' },
  { sourceType: 'official', level: 'national', category: 'テクノロジー', subgroup: '米国', sourceName: 'NIST', sourceUrl: 'https://www.nist.gov/', feedUrl: 'https://www.nist.gov/news-events/news/rss.xml', label: 'NIST News' },
  { sourceType: 'official', level: 'national', category: 'テクノロジー', subgroup: '米国', sourceName: 'NSF', sourceUrl: 'https://www.nsf.gov/', feedUrl: 'https://www.nsf.gov/rss/rss_www_news.xml', label: 'NSF News' },
  { sourceType: 'corporate', category: 'テクノロジー', subgroup: '米国', sourceName: 'NVIDIA', sourceUrl: 'https://blogs.nvidia.com/', feedUrl: 'https://blogs.nvidia.com/feed/', label: 'NVIDIA Blog' },
  // 生成AI
  { sourceType: 'corporate', category: '生成AI', subgroup: '日本', sourceName: 'Sakana AI', sourceUrl: 'https://sakana.ai/', feedUrl: 'https://sakana.ai/feed.xml', label: 'Sakana AI' },
  { sourceType: 'corporate', category: '生成AI', subgroup: '米国', sourceName: 'OpenAI', sourceUrl: 'https://openai.com/', feedUrl: 'https://openai.com/news/rss.xml', label: 'OpenAI News' },
  { sourceType: 'corporate', category: '生成AI', subgroup: '欧州', sourceName: 'Google DeepMind', sourceUrl: 'https://deepmind.google/', feedUrl: 'https://deepmind.google/blog/rss.xml', label: 'Google DeepMind Blog' },
  { sourceType: 'corporate', category: '生成AI', subgroup: '米国', sourceName: 'Google', sourceUrl: 'https://blog.google/', feedUrl: 'https://blog.google/technology/ai/rss/', label: 'Google AI Blog' },
  // カナダ
  // ウォータールー地域の自治体（報道機関ではなく、市・リージョンの発表を直接取り込む）
  { sourceType: 'official', level: 'local', area: 'CA-ON', city: 'waterloo', category: '社会', subgroup: 'カナダ', since: '2026-10-21', sourceName: 'ウォータールー市', sourceUrl: 'https://www.waterloo.ca/news/', feedUrl: 'https://www.waterloo.ca/news/rss', label: 'City of Waterloo News', maxItems: 10, excludeRoutine: true },
  { sourceType: 'official', level: 'local', area: 'CA-ON', city: 'kitchener', category: '社会', subgroup: 'カナダ', since: '2026-10-21', sourceName: 'キッチナー市', sourceUrl: 'https://www.kitchener.ca/news/', feedUrl: 'https://www.kitchener.ca/news/rss', label: 'City of Kitchener News', maxItems: 10, excludeRoutine: true },
  { sourceType: 'official', level: 'local', area: 'CA-ON', city: 'cambridge', category: '社会', subgroup: 'カナダ', since: '2026-10-21', sourceName: 'ケンブリッジ市', sourceUrl: 'https://www.cambridge.ca/news/', feedUrl: 'https://www.cambridge.ca/news/rss', label: 'City of Cambridge News', maxItems: 10, excludeRoutine: true, titleOnly: true },
  { sourceType: 'official', level: 'local', area: 'CA-ON', city: 'waterloo-region', category: '社会', subgroup: 'カナダ', since: '2026-10-21', sourceName: 'ウォータールー・リージョン', sourceUrl: 'https://www.regionofwaterloo.ca/news-public-notices-and-council-info/', feedUrl: 'https://www.regionofwaterloo.ca/news-public-notices-and-council-info/rss', label: 'Region of Waterloo News', maxItems: 10, excludeRoutine: true, titleOnly: true },
  {
    sourceType: 'official', level: 'national', category: '政治', subgroup: 'カナダ', sourceName: 'カナダ政府', sourceUrl: 'https://www.canada.ca/en/news.html',
    feedUrl: 'https://api.io.canada.ca/io-server/gc/news/en/v2?sort=publishedDate&orderBy=desc&pick=100&format=atom&atomtitle=Canada%20News%20Centre',
    label: 'Canada News Centre（全省庁）', maxItems: 40, titleOnly: true,
    // 担当省庁は記事の URL（canada.ca/en/<省庁>/news/...）から判別する
    categoryByUrl: [
      [/\/en\/global-affairs\//, '国際'],
      [/\/en\/(innovation-science-economic-development|radio-television-telecommunications)\//, 'テクノロジー'],
      [/\/en\/(department-finance|competition-bureau|[a-z-]*economic-development[a-z-]*|fednor|treasury-board-secretariat)\//, '経済'],
      [/\/en\/(department-national-defence|national-defence|public-safety-canada|communications-security-establishment|security-intelligence-service|(canada-)?border-services-agency)\//, '安全保障'],
      [/\/en\/(space-agency|canadian-space-agency|national-research-council|natural-sciences-engineering-research|social-sciences-humanities-research|institutes-health-research)[a-z-]*\//, 'サイエンス'],
      [/\/en\/canadian-heritage\//, '文化・芸術'],
      [/\/en\/(health-canada|public-health|employment-social-development|immigration-refugees-citizenship|indigenous-services-canada|environment-climate-change|housing-infrastructure-communities)\//, '社会']
    ]
  },
  { sourceType: 'official', level: 'regional', area: 'CA-ON', category: '政治', subgroup: 'カナダ', since: '2026-10-21', sourceName: 'オンタリオ州政府', sourceUrl: 'https://news.ontario.ca/', feedUrl: 'https://news.ontario.ca/newsroom/en/rss/allnews.rss', label: 'Ontario Newsroom', maxItems: 15, titleOnly: true },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '日本', sourceName: 'ジェトロ', sourceUrl: 'https://www.jetro.go.jp/', feedUrl: 'https://www.jetro.go.jp/rss/news.xml', label: 'ジェトロ お知らせ・記者発表', maxItems: 10, excludeRoutine: true, titleOnly: true },
  { sourceType: 'official', level: 'national', category: '政治', subgroup: 'カナダ', sourceName: 'カナダ首相府', sourceUrl: 'https://www.pm.gc.ca/en/news', feedUrl: 'https://pm.gc.ca/en/news.rss', label: 'Prime Minister of Canada News', maxItems: 10 },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: 'カナダ', sourceName: 'カナダ銀行', sourceUrl: 'https://www.bankofcanada.ca/', feedUrl: 'https://www.bankofcanada.ca/content_type/press-releases/feed/', label: 'Bank of Canada Press Releases' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: 'カナダ', sourceName: 'カナダ統計局', sourceUrl: 'https://www150.statcan.gc.ca/', feedUrl: 'https://www150.statcan.gc.ca/n1/rss/dai-quo/0-eng.atom', label: 'Statistics Canada The Daily', maxItems: 8 },
  { sourceType: 'research', category: 'サイエンス', subgroup: 'カナダ', sourceName: 'CIFAR', sourceUrl: 'https://cifar.ca/', feedUrl: 'https://cifar.ca/feed/', label: 'CIFAR（カナダ先端研究機構）', titleOnly: true },
  { sourceType: 'research', category: 'テクノロジー', subgroup: 'カナダ', sourceName: 'トロント大学工学部', sourceUrl: 'https://news.engineering.utoronto.ca/', feedUrl: 'https://news.engineering.utoronto.ca/feed/', label: 'U of T Engineering News', maxItems: 8 },
  { sourceType: 'research', category: '生成AI', subgroup: 'カナダ', sourceName: 'Vector Institute', sourceUrl: 'https://vectorinstitute.ai/', feedUrl: 'https://vectorinstitute.ai/feed/', label: 'Vector Institute（AI 研究所）', maxItems: 10 },
  // 欧州・米国のデジタル政策
  { sourceType: 'official', level: 'national', category: 'テクノロジー', subgroup: '欧州', sourceName: '英国科学・イノベーション・技術省', sourceUrl: 'https://www.gov.uk/government/organisations/department-for-science-innovation-and-technology', feedUrl: 'https://www.gov.uk/government/organisations/department-for-science-innovation-and-technology.atom', label: 'UK Department for Science, Innovation and Technology', maxItems: 10 },
  { sourceType: 'official', level: 'national', category: '生成AI', subgroup: '欧州', sourceName: '英国 AI Security Institute', sourceUrl: 'https://www.aisi.gov.uk/', feedUrl: 'https://www.gov.uk/government/organisations/ai-security-institute.atom', label: 'UK AI Security Institute' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '欧州', sourceName: 'イングランド銀行', sourceUrl: 'https://www.bankofengland.co.uk/news', feedUrl: 'https://www.bankofengland.co.uk/rss/news', label: 'Bank of England News', maxItems: 6 },
  { sourceType: 'official', level: 'international', category: '政治', subgroup: '欧州', sourceName: '欧州委員会', sourceUrl: 'https://ec.europa.eu/commission/presscorner/', feedUrl: 'https://ec.europa.eu/commission/presscorner/api/rss?language=en', label: 'European Commission Press Corner', maxItems: 10 },
  { sourceType: 'official', level: 'national', category: 'テクノロジー', subgroup: '米国', sourceName: 'NIST', sourceUrl: 'https://www.nist.gov/news-events', feedUrl: 'https://www.nist.gov/news-events/news/rss.xml', label: 'NIST（米国標準技術研究所）ニュース', maxItems: 8 },
  { sourceType: 'official', level: 'national', category: 'テクノロジー', subgroup: '米国', sourceName: 'NTIA', sourceUrl: 'https://www.ntia.gov/', feedUrl: 'https://www.ntia.gov/rss.xml', label: 'NTIA（米商務省 電気通信情報庁）', maxItems: 6 },
  { sourceType: 'official', level: 'national', category: 'サイエンス', subgroup: '米国', sourceName: '全米科学財団', sourceUrl: 'https://www.nsf.gov/', feedUrl: 'https://www.nsf.gov/rss/rss_www_news.xml', label: 'NSF（全米科学財団）ニュース', maxItems: 6 },
  { sourceType: 'official', level: 'national', category: 'サイエンス', subgroup: '日本', sourceName: '文部科学省', sourceUrl: 'https://www.mext.go.jp/', feedUrl: 'https://www.mext.go.jp/b_menu/news/index.rdf', label: '文部科学省 新着情報', maxItems: 6, excludeRoutine: true },
  { sourceType: 'research', category: 'サイエンス', subgroup: '日本', sourceName: 'JST', sourceUrl: 'https://www.jst.go.jp/', feedUrl: 'https://www.jst.go.jp/rss/press.xml', label: '科学技術振興機構 プレスリリース', maxItems: 8 },
  { sourceType: 'npo', category: 'テクノロジー', subgroup: '米国', sourceName: 'Open Robotics', sourceUrl: 'https://www.openrobotics.org/', feedUrl: 'https://www.openrobotics.org/blog?format=rss', label: 'Open Robotics（ROS を支える非営利団体）', maxItems: 6 },
  { sourceType: 'official', level: 'international', category: 'テクノロジー', subgroup: '欧州', sourceName: '欧州委員会（デジタル）', sourceUrl: 'https://digital-strategy.ec.europa.eu/', feedUrl: 'https://digital-strategy.ec.europa.eu/en/rss.xml', label: 'Shaping Europe’s digital future' },
  // Physical AI（ロボティクス）
  // 安全保障（防衛・サイバーセキュリティ）
  { sourceType: 'official', level: 'national', category: '安全保障', subgroup: '日本', sourceName: '防衛省', sourceUrl: 'https://www.mod.go.jp/', feedUrl: 'https://www.mod.go.jp/j/rss/news.xml', label: '防衛省・自衛隊 新着情報', maxItems: 10, excludeRoutine: true },
  { sourceType: 'npo', category: '安全保障', subgroup: '日本', sourceName: 'JPCERT/CC', sourceUrl: 'https://www.jpcert.or.jp/', feedUrl: 'https://www.jpcert.or.jp/rss/jpcert.rdf', label: 'JPCERT/CC 注意喚起（サイバーセキュリティ）', maxItems: 6, excludeRoutine: true },
  { sourceType: 'official', level: 'national', category: '安全保障', subgroup: '米国', sourceName: '米国防総省', sourceUrl: 'https://www.defense.gov/', feedUrl: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=10', label: 'U.S. Department of Defense News', maxItems: 8 },
  { sourceType: 'official', level: 'national', category: '安全保障', subgroup: '米国', sourceName: 'CISA', sourceUrl: 'https://www.cisa.gov/', feedUrl: 'https://www.cisa.gov/news.xml', label: 'CISA（米サイバーセキュリティ・インフラ安全保障庁）' },
  // 国際機関・経済・通商・医療・気候（一般の関心が高い分野の一次情報。2026-10 に取得できることを確認済み）
  { sourceType: 'official', level: 'international', category: '経済', subgroup: 'グローバル', sourceName: 'WTO', sourceUrl: 'https://www.wto.org/', feedUrl: 'https://www.wto.org/library/rss/latest_news_e.xml', label: 'WTO（世界貿易機関）ニュース', maxItems: 8 },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', sourceName: '米経済分析局', sourceUrl: 'https://www.bea.gov/', feedUrl: 'https://www.bea.gov/rss/rss.xml', label: 'BEA（米国経済分析局）', maxItems: 8 },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', sourceName: '米通商代表部', sourceUrl: 'https://ustr.gov/', feedUrl: 'https://ustr.gov/rss.xml', label: 'USTR（米国通商代表部）', maxItems: 8 },
  { sourceType: 'official', level: 'national', category: '投資', subgroup: '米国', sourceName: 'SEC', sourceUrl: 'https://www.sec.gov/newsroom', feedUrl: 'https://www.sec.gov/news/pressreleases.rss', label: 'SEC（米証券取引委員会）プレスリリース', maxItems: 8 },
  { sourceType: 'official', level: 'national', category: '社会', subgroup: '米国', sourceName: 'FDA', sourceUrl: 'https://www.fda.gov/news-events', feedUrl: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml', label: 'FDA（米国食品医薬品局）プレスリリース', maxItems: 8 },
  { sourceType: 'official', level: 'national', category: 'サイエンス', subgroup: '米国', sourceName: 'NOAA', sourceUrl: 'https://www.noaa.gov/', feedUrl: 'https://www.noaa.gov/rss.xml', label: 'NOAA（米国海洋大気庁）', maxItems: 8 },
  { sourceType: 'official', level: 'international', category: '政治', subgroup: '欧州', sourceName: '欧州理事会', sourceUrl: 'https://www.consilium.europa.eu/en/press/', feedUrl: 'https://www.consilium.europa.eu/en/rss/pressreleases.ashx', label: 'Council of the EU Press Releases', maxItems: 8, excludeRoutine: true },
  { sourceType: 'official', level: 'international', category: '社会', subgroup: '欧州', sourceName: '欧州医薬品庁', sourceUrl: 'https://www.ema.europa.eu/en/news', feedUrl: 'https://www.ema.europa.eu/en/news.xml', label: 'EMA（欧州医薬品庁）ニュース', maxItems: 8 },
  { sourceType: 'official', level: 'international', category: '社会', subgroup: '欧州', sourceName: 'ECDC', sourceUrl: 'https://www.ecdc.europa.eu/en/news-events', feedUrl: 'https://www.ecdc.europa.eu/en/taxonomy/term/1307/feed', label: 'ECDC（欧州疾病予防管理センター）', maxItems: 8 },
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '日本', sourceName: '内閣府', sourceUrl: 'https://www.cao.go.jp/', feedUrl: 'https://www.cao.go.jp/rss/news.rdf', label: '内閣府 新着情報', maxItems: 8, excludeRoutine: true },
  { sourceType: 'research', category: 'サイエンス', subgroup: '日本', sourceName: '京都大学', sourceUrl: 'https://www.kyoto-u.ac.jp/', feedUrl: 'https://www.kyoto-u.ac.jp/ja/rss.xml', label: '京都大学 ニュース', maxItems: 8 },
  // 文化・芸術
  { sourceType: 'official', level: 'national', category: '文化・芸術', subgroup: '米国', sourceName: '全米芸術基金', sourceUrl: 'https://www.arts.gov/', feedUrl: 'https://www.arts.gov/rss.xml', label: 'National Endowment for the Arts' },
  // 業界団体・NPO
  { sourceType: 'npo', category: '生成AI', subgroup: '米国', sourceName: 'Partnership on AI', sourceUrl: 'https://partnershiponai.org/', feedUrl: 'https://partnershiponai.org/feed/', label: 'Partnership on AI（AI の業界横断団体）' },
  { sourceType: 'npo', category: 'テクノロジー', subgroup: 'グローバル', sourceName: 'Linux Foundation', sourceUrl: 'https://www.linuxfoundation.org/press', feedUrl: 'https://www.linuxfoundation.org/press/rss.xml', label: 'Linux Foundation プレスリリース', maxItems: 10 },
  {
    sourceType: 'research', category: 'テクノロジー', subgroup: 'グローバル', sourceName: 'arXiv', sourceUrl: 'https://arxiv.org/list/cs.RO/recent',
    // ロボティクス論文のうち、基盤モデル・ヒューマノイド・VLA・世界モデル・身体性に関するもの（Physical AI）。
    // API（export.arxiv.org）は robots.txt が全面禁止のため、制限のない公式の RSS を使い、絞り込みはこちらで行う。改訂（replace）は新着ではないので除く
    feedUrl: 'https://rss.arxiv.org/rss/cs.RO',
    include: /humanoid|foundation model|vision-language-action|world model|embodied/i,
    exclude: /Announce Type:\s*replace/i,
    summaryPrefix: /^\s*arXiv:\S+\s+Announce Type:\s*\S+\s+Abstract:\s*/i,
    label: 'arXiv cs.RO（Physical AI 関連の新着論文）', maxItems: 10
  },
  // 生成AI・AI 研究（企業の研究部門、研究機関、大学）
  { sourceType: 'corporate', category: '生成AI', subgroup: '米国', sourceName: 'Microsoft Research', sourceUrl: 'https://www.microsoft.com/en-us/research/', feedUrl: 'https://www.microsoft.com/en-us/research/feed/', label: 'Microsoft Research Blog', maxItems: 8, titleOnly: true },
  { sourceType: 'corporate', category: '生成AI', subgroup: '米国', sourceName: 'Google Research', sourceUrl: 'https://research.google/blog/', feedUrl: 'https://research.google/blog/rss/', label: 'Google Research Blog' },
  { sourceType: 'corporate', category: '生成AI', subgroup: '米国', sourceName: 'Apple', sourceUrl: 'https://machinelearning.apple.com/', feedUrl: 'https://machinelearning.apple.com/rss.xml', label: 'Apple Machine Learning Research', maxItems: 6 },
  { sourceType: 'corporate', category: '生成AI', subgroup: 'グローバル', sourceName: 'Hugging Face', sourceUrl: 'https://huggingface.co/blog', feedUrl: 'https://huggingface.co/blog/feed.xml', label: 'Hugging Face Blog（オープンなAIモデルの公開）', maxItems: 6 },
  { sourceType: 'npo', category: '生成AI', subgroup: '米国', sourceName: 'Ai2', sourceUrl: 'https://allenai.org/', feedUrl: 'https://allenai.org/rss.xml', label: 'Allen Institute for AI（非営利の AI 研究所）', maxItems: 6 },
  { sourceType: 'research', category: '生成AI', subgroup: '米国', sourceName: 'MIT', sourceUrl: 'https://news.mit.edu/topic/artificial-intelligence2', feedUrl: 'https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml', label: 'MIT News（AI の研究成果）', maxItems: 8 },
  // テクノロジー（半導体・通信・ロボティクス）
  { sourceType: 'research', category: 'テクノロジー', subgroup: '米国', sourceName: 'カーネギーメロン大学', sourceUrl: 'https://www.ri.cmu.edu/news/', feedUrl: 'https://www.ri.cmu.edu/feed/', label: 'CMU Robotics Institute（ロボティクス研究）', maxItems: 8, titleOnly: true },
  { sourceType: 'research', category: 'テクノロジー', subgroup: '米国', sourceName: 'MIT', sourceUrl: 'https://news.mit.edu/topic/robotics', feedUrl: 'https://news.mit.edu/topic/mitrobotics-rss.xml', label: 'MIT News（ロボティクス）', maxItems: 6 },
  { sourceType: 'corporate', category: 'テクノロジー', subgroup: '米国', sourceName: 'NVIDIA', sourceUrl: 'https://nvidianews.nvidia.com/', feedUrl: 'https://nvidianews.nvidia.com/releases.xml', label: 'NVIDIA Newsroom（プレスリリース）' },
  { sourceType: 'corporate', category: 'テクノロジー', subgroup: '日本', sourceName: 'NTT', sourceUrl: 'https://www.ntt.com/about-us/press-releases.html', feedUrl: 'https://www.ntt.com/index/rss.xml', label: 'NTT ドコモビジネス ニュースリリース', maxItems: 8 },
  { sourceType: 'corporate', category: 'テクノロジー', subgroup: 'カナダ', sourceName: 'Clearpath Robotics', sourceUrl: 'https://clearpathrobotics.com/', feedUrl: 'https://www.clearpathrobotics.com/feed/', label: 'Clearpath Robotics（キッチナーのロボット企業）' },
  { sourceType: 'corporate', category: 'テクノロジー', subgroup: 'カナダ', sourceName: 'Sanctuary AI', sourceUrl: 'https://sanctuary.ai/', feedUrl: 'https://sanctuary.ai/feed/', label: 'Sanctuary AI（バンクーバーのヒューマノイド企業）' },
  { sourceType: 'research', category: 'テクノロジー', subgroup: '欧州', sourceName: 'Fraunhofer', sourceUrl: 'https://www.fraunhofer.de/en/press.html', feedUrl: 'https://www.fraunhofer.de/en/rss/press.rss', label: 'Fraunhofer（欧州最大の応用研究機関）', maxItems: 8, titleOnly: true },
  // 宇宙・基礎科学
  { sourceType: 'official', level: 'national', category: 'サイエンス', subgroup: '米国', sourceName: 'NASA', sourceUrl: 'https://www.nasa.gov/news/', feedUrl: 'https://www.nasa.gov/news-release/feed/', label: 'NASA ニュースリリース', maxItems: 8, excludeRoutine: true },
  { sourceType: 'official', level: 'national', category: 'サイエンス', subgroup: '日本', sourceName: 'JAXA', sourceUrl: 'https://www.jaxa.jp/press/', feedUrl: 'https://www.jaxa.jp/rss/press_j.rdf', label: '宇宙航空研究開発機構 プレスリリース', titleOnly: true },
  { sourceType: 'research', category: 'サイエンス', subgroup: '日本', sourceName: '国立天文台', sourceUrl: 'https://www.nao.ac.jp/news/', feedUrl: 'https://www.nao.ac.jp/atom.xml', label: '国立天文台 ニュース', maxItems: 8 },
  { sourceType: 'research', category: 'サイエンス', subgroup: '日本', sourceName: 'KEK', sourceUrl: 'https://www.kek.jp/ja/', feedUrl: 'https://www.kek.jp/ja/feed/', label: '高エネルギー加速器研究機構', maxItems: 6, excludeRoutine: true, titleOnly: true },
  { sourceType: 'research', category: 'サイエンス', subgroup: '日本', sourceName: 'Kavli IPMU', sourceUrl: 'https://www.ipmu.jp/', feedUrl: 'https://www.ipmu.jp/en/rss.xml', label: 'カブリ数物連携宇宙研究機構（数学・物理）', maxItems: 6 },
  { sourceType: 'official', level: 'international', category: 'サイエンス', subgroup: '欧州', sourceName: 'ESA', sourceUrl: 'https://www.esa.int/Science_Exploration/Space_Science', feedUrl: 'https://www.esa.int/rssfeed/Our_Activities/Space_Science', label: '欧州宇宙機関 宇宙科学' },
  { sourceType: 'research', category: 'サイエンス', subgroup: '欧州', sourceName: 'EMBL', sourceUrl: 'https://www.embl.org/news/', feedUrl: 'https://www.embl.org/news/feed/', label: '欧州分子生物学研究所' },
  { sourceType: 'research', category: 'サイエンス', subgroup: '米国', sourceName: 'MIT', sourceUrl: 'https://news.mit.edu/research', feedUrl: 'https://news.mit.edu/rss/research', label: 'MIT News（研究成果）', maxItems: 8 },
  // 数学・科学の新発見
  { sourceType: 'npo', category: 'サイエンス', subgroup: '米国', sourceName: 'Clay Mathematics Institute', sourceUrl: 'https://www.claymath.org/', feedUrl: 'https://www.claymath.org/news/feed/', label: 'クレイ数学研究所（ミレニアム懸賞問題）' },
  { sourceType: 'research', category: 'サイエンス', subgroup: '米国', sourceName: 'Simons Foundation', sourceUrl: 'https://www.simonsfoundation.org/', feedUrl: 'https://www.simonsfoundation.org/feed/', label: 'Simons Foundation（数学・物理）', titleOnly: true }
];
