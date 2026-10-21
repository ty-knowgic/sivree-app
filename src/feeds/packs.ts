import type { FeedSource } from '../types.js';

/**
 * 専門パック（分野別の束）。士業・企業法務・調査の仕事で追う、専門機関の発表を束ねる。
 * 正式版では有償の予定（ベータの間は無料）。パックに入れるのは、利用条件が A（再利用が明示）の情報源だけ（scripts/test-feeds.ts が確かめる）。
 * 名前は設定の候補の行に出すので、日本語を鍵にして public/locales の各言語に訳を置く（scripts/test-feeds.ts が確かめる）。
 * 説明は、パックの単位で選ぶ画面（段階 S4）で出す。訳はそのときに足す
 */
export interface SourcePack {
  id: string;
  name: string;
  description: string;
}

export const PACKS: SourcePack[] = [
  {
    id: 'legal',
    name: '法務・知財・規制対応',
    description: '法務省・消費者庁、英国の競争・市場庁と知的財産庁、米国の消費者金融保護局と連邦取引委員会の規則、EU のデータ保護機関、WIPO の発表を束ねたものです。公正取引委員会・個人情報保護委員会・特許庁は、配信（RSS）がないか取得できないため含みません。'
  },
  {
    id: 'tax',
    name: '税務・金融規制',
    description: '英国の歳入関税庁の発表と意見募集、米国の内国歳入庁と証券取引委員会の規則（連邦官報）を束ねたものです。国税庁と米国の内国歳入庁自身の発表は、配信（RSS）がないため含みません。'
  }
];

/** パックの名前（画面用）。知らない ID には undefined を返す */
export function packName(id: string | undefined): string | undefined {
  return PACKS.find(pack => pack.id === id)?.name;
}

// 2026-10-21 に取得と robots.txt と利用条件を確かめたフィード。凍結より後に足したので、すべて since を付ける（既定ではオフの候補）
// 米国の規則は、機関自身の RSS がない（IRS）か取得できない（FTC）ため、連邦官報（Federal Register）の規則・規則案に絞った RSS を使う
export const packFeeds: FeedSource[] = [
  // 法務・知財・規制対応
  { sourceType: 'official', level: 'national', category: '政治', subgroup: '日本', sourceName: '法務省', sourceUrl: 'https://www.moj.go.jp/', feedUrl: 'https://www.moj.go.jp/news.xml', label: '法務省 新着情報', pack: 'legal', terms: 'A', since: '2026-10-21' },
  // 消費者庁は、景品表示法の措置命令・差止請求・判決に、製品事故とリコールの公表、届出データベースの更新が毎週混じる。後者は除く
  { sourceType: 'official', level: 'national', category: '社会', subgroup: '日本', sourceName: '消費者庁', sourceUrl: 'https://www.caa.go.jp/', feedUrl: 'https://www.caa.go.jp/news.rss', label: '消費者庁 新着情報', pack: 'legal', terms: 'A', since: '2026-10-21',
    exclude: /届出情報の更新|重大(製品)?事故|リコール|システムメンテナンス|豚熱/, excludeRoutine: true },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '欧州', sourceName: '英国競争・市場庁', sourceUrl: 'https://www.gov.uk/government/organisations/competition-and-markets-authority', feedUrl: 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=competition-and-markets-authority', label: 'UK Competition and Markets Authority: news', pack: 'legal', terms: 'A', since: '2026-10-21' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '欧州', sourceName: '英国競争・市場庁', sourceUrl: 'https://www.gov.uk/government/organisations/competition-and-markets-authority', feedUrl: 'https://www.gov.uk/search/policy-papers-and-consultations.atom?organisations%5B%5D=competition-and-markets-authority', label: 'UK Competition and Markets Authority: policy papers and consultations', pack: 'legal', terms: 'A', since: '2026-10-21' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', sourceName: '米消費者金融保護局', sourceUrl: 'https://www.consumerfinance.gov/', feedUrl: 'https://www.consumerfinance.gov/about-us/newsroom/feed/', label: 'CFPB Newsroom', pack: 'legal', terms: 'A', since: '2026-10-21' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', sourceName: '米連邦取引委員会', sourceUrl: 'https://www.federalregister.gov/agencies/federal-trade-commission', feedUrl: 'https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=federal-trade-commission&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE', label: 'Federal Register: FTC rules and proposed rules', pack: 'legal', terms: 'A', since: '2026-10-21' },
  { sourceType: 'official', level: 'international', category: 'テクノロジー', subgroup: '欧州', sourceName: '欧州データ保護会議', sourceUrl: 'https://www.edpb.europa.eu/', feedUrl: 'https://www.edpb.europa.eu/feed/news_en', label: 'EDPB News', pack: 'legal', terms: 'A', since: '2026-10-21' },
  { sourceType: 'official', level: 'international', category: 'テクノロジー', subgroup: '欧州', sourceName: '欧州データ保護監察官', sourceUrl: 'https://www.edps.europa.eu/', feedUrl: 'https://www.edps.europa.eu/feed/news_en', label: 'EDPS News', pack: 'legal', terms: 'A', since: '2026-10-21' },
  { sourceType: 'official', level: 'international', category: 'テクノロジー', subgroup: 'グローバル', sourceName: 'WIPO', sourceUrl: 'https://www.wipo.int/', feedUrl: 'https://www.wipo.int/pressroom/en/rss.xml', label: 'WIPO（世界知的所有権機関）プレスルーム', pack: 'legal', terms: 'A', since: '2026-10-21' },
  { sourceType: 'official', level: 'national', category: 'テクノロジー', subgroup: '欧州', sourceName: '英国知的財産庁', sourceUrl: 'https://www.gov.uk/government/organisations/intellectual-property-office', feedUrl: 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=intellectual-property-office', label: 'UK Intellectual Property Office: news', pack: 'legal', terms: 'A', since: '2026-10-21' },
  // 税務・金融規制
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '欧州', sourceName: '英国歳入関税庁', sourceUrl: 'https://www.gov.uk/government/organisations/hm-revenue-customs', feedUrl: 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=hm-revenue-customs', label: 'HM Revenue & Customs: news', pack: 'tax', terms: 'A', since: '2026-10-21' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '欧州', sourceName: '英国歳入関税庁', sourceUrl: 'https://www.gov.uk/government/organisations/hm-revenue-customs', feedUrl: 'https://www.gov.uk/search/policy-papers-and-consultations.atom?organisations%5B%5D=hm-revenue-customs', label: 'HM Revenue & Customs: policy papers and consultations', pack: 'tax', terms: 'A', since: '2026-10-21' },
  { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', sourceName: '米内国歳入庁', sourceUrl: 'https://www.federalregister.gov/agencies/internal-revenue-service', feedUrl: 'https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=internal-revenue-service&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE', label: 'Federal Register: IRS rules and proposed rules', pack: 'tax', terms: 'A', since: '2026-10-21' },
  { sourceType: 'official', level: 'national', category: '投資', subgroup: '米国', sourceName: 'SEC', sourceUrl: 'https://www.federalregister.gov/agencies/securities-and-exchange-commission', feedUrl: 'https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bagencies%5D%5B%5D=securities-and-exchange-commission&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE', label: 'Federal Register: SEC rules and proposed rules', pack: 'tax', terms: 'A', since: '2026-10-21' }
];
