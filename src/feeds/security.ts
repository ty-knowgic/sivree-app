import type { FeedSource } from '../types.js';

// 安全保障・サイバーセキュリティの情報源（日本の防衛省・JPCERT/CC、米国の国防総省・CISA に並ぶ、英国・カナダ・フランスの窓口）。2026-10-27 に取得・robots.txt・利用条件を確認（SOURCE_TERMS.md）
// すべて既定ではオフの候補（since 付き）。パックには入れない
const SINCE = '2026-10-27';

export const securityFeeds: FeedSource[] = [
  // カナダ: CSE の条項（cyber.gc.ca を含む）は、カナダ政府共通の条項と同じく、商用の再配布に事前の書面の許諾を求める（B1）。見出し・日付・リンクだけを表示する
  // 件数が多い（ベンダーの修正情報を含む）ため上限を付ける。日付は更新日で、更新された古い勧告も新しく並ぶ（JPCERT/CC の「（更新）」と同じ）
  { sourceType: 'official', level: 'national', category: '安全保障', subgroup: 'カナダ', terms: 'B1', titleOnly: true, since: SINCE, sourceName: 'カナダ・サイバーセキュリティセンター', sourceUrl: 'https://www.cyber.gc.ca/en/alerts-advisories', feedUrl: 'https://www.cyber.gc.ca/api/cccs/atom/v1/get?feed=alerts_advisories&lang=en', label: 'Cyber Centre: Alerts and Advisories', maxItems: 10 },
  // 英国: Open Government Licence v3.0（出典の明示。事前の許諾は不要）
  { sourceType: 'official', level: 'national', category: '安全保障', subgroup: '欧州', terms: 'A', since: SINCE, sourceName: '英国 NCSC', sourceUrl: 'https://www.ncsc.gov.uk/', feedUrl: 'https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml', label: 'NCSC News and Guidance', maxItems: 8 },
  // 組織の全文書の Atom には射撃訓練の時間や敷地の管理などの定型文書が混じるため、ニュース・声明・発表の Atom を読む
  { sourceType: 'official', level: 'national', category: '安全保障', subgroup: '欧州', terms: 'A', since: SINCE, sourceName: '英国国防省', sourceUrl: 'https://www.gov.uk/government/organisations/ministry-of-defence', feedUrl: 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=ministry-of-defence', label: 'UK MoD: News and Communications', maxItems: 8 },
  // フランス: Licence Ouverte 2.0。サイトは cert.ssi.gouv.fr から cert.cyber.gouv.fr へ移った。通知は1日に何件も出るため件数を絞る
  { sourceType: 'official', level: 'national', category: '安全保障', subgroup: '欧州', terms: 'A', since: SINCE, sourceName: 'フランス CERT-FR', sourceUrl: 'https://cert.cyber.gouv.fr/', feedUrl: 'https://cert.cyber.gouv.fr/feed/', label: 'CERT-FR: Security Notices (French)', maxItems: 6 }
];
