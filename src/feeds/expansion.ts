import type { FeedSource } from '../types.js';

const since = '2026-10-24';
const common = { sourceType: 'official', level: 'national', category: '経済', subgroup: '米国', since } as const;

/** Rights/collection audit: SOURCE_TERMS.md. All new sources remain opt-in. */
export const expansionFeeds: FeedSource[] = [
  { ...common, category: '政治', sourceName: '米連邦官報', sourceUrl: 'https://www.federalregister.gov/', feedUrl: 'https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bsignificant%5D=1&conditions%5Btype%5D%5B%5D=PRORULE', label: 'Federal Register: Significant Proposed Rules', terms: 'A', pack: 'legal', documentKind: 'proposed-rule' },
  { ...common, category: '社会', sourceName: '米連邦取引委員会', sourceUrl: 'https://www.ftc.gov/', feedUrl: 'https://www.ftc.gov/feeds/press-release-consumer-protection.xml', label: 'FTC Press Releases: Consumer Protection', terms: 'A', pack: 'legal', documentKind: 'consumer-protection' },
  ...[
    ['press_bcreg.xml', 'Federal Reserve: Regulatory Policy', 'regulatory-policy'],
    ['press_enforcement.xml', 'Federal Reserve: Enforcement Actions', 'enforcement'],
    ['bankinginfo-rss.xml', 'Federal Reserve: Supervision Letters', 'supervisory-guidance']
  ].map(([file, label, documentKind]) => ({ ...common, sourceName: 'FRB', sourceUrl: 'https://www.federalreserve.gov/', feedUrl: `https://www.federalreserve.gov/feeds/${file}`, label, terms: 'A' as const, pack: 'finance', documentKind })),
  { ...common, sourceName: '米内国歳入庁', sourceUrl: 'https://www.irs.gov/irb', feedUrl: 'https://www.irs.gov/irb', label: 'IRS Internal Revenue Bulletin', terms: 'A', pack: 'finance', bulletinIndex: true, documentKind: 'tax-bulletin', maxItems: 6, titleOnly: true },
  // These metadata-only sources are NOT paid: their site-specific reuse terms remain unresolved.
  { ...common, sourceName: 'SEC', sourceUrl: 'https://www.sec.gov/enforcement-litigation/litigation-releases', feedUrl: 'https://www.sec.gov/enforcement-litigation/litigation-releases/rss', label: 'SEC Litigation Releases', terms: 'C', titleOnly: true, documentKind: 'enforcement' },
  { ...common, sourceName: 'SEC', sourceUrl: 'https://www.sec.gov/enforcement-litigation/administrative-proceedings', feedUrl: 'https://www.sec.gov/enforcement-litigation/administrative-proceedings/rss', label: 'SEC Administrative Proceedings', terms: 'C', titleOnly: true, documentKind: 'enforcement' },
];

/** Do not register until robots/rights checks succeed reliably. */
export const deferredExpansionFeeds: FeedSource[] = [
  { ...common, sourceName: 'FinCEN', sourceUrl: 'https://www.fincen.gov/', feedUrl: 'https://www.fincen.gov/resources/advisoriesbulletinsfact-sheets', label: 'FinCEN Alerts and Advisories', terms: 'C', titleOnly: true, documentKind: 'aml-guidance', htmlList: { rows: 'table tbody tr', link: 'td:first-child a[href]', date: 'td:nth-child(2)', dateOrder: 'mdy' } },
  { ...common, sourceName: 'OFAC', sourceUrl: 'https://ofac.treasury.gov/', feedUrl: 'https://ofac.treasury.gov/recent-actions', label: 'OFAC Recent Actions', terms: 'C', titleOnly: true, documentKind: 'sanctions-update', htmlList: { rows: '.views-row', link: 'a[href^="/recent-actions/20"]' } }
];
