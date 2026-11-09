// トピックの一致（matchTopics）の精度を確かめる（2026-10-31 の実画面と公開データの確認で見つかった誤一致）。
//  - 「脆弱性」は、金融の「クロスボーダーの脆弱性」にも使う。金融の記事が「サイバーセキュリティ」に入っていた
//  - 会社名（株式会社サイバーセキュリティクラウド）の一部が、記事の話題として数えられていた
// 初期設定のトピックだけが対象で、利用者が追加したトピックのキーワードは、これまでどおり記事の語で判定する
import { defaultProfile, matchTopics } from '../src/profile.js';
import type { Profile } from '../src/profile.js';
import type { NewsItem } from '../src/types.js';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`);
  if (!ok) failures++;
};

const profile = (onlyId: string): Profile => {
  const value = defaultProfile();
  for (const topic of value.topics) topic.enabled = topic.id === onlyId;
  return value;
};
const item = (title: string, summary = '', sourceName = 'テスト発信元'): NewsItem => ({
  id: title, title, summary, sourceName, sourceType: 'official', subgroup: '日本', category: '社会', feedUrl: 'https://example.com/feed', sourceUrl: 'https://example.com/', publishedAt: '2026-10-26T00:00:00.000Z',
  hashtags: [], keywords: [], imageChecked: true
} as unknown as NewsItem);
const cyber = profile('cybersecurity');
const matched = (value: NewsItem, target = cyber) => matchTopics(value, target).find(match => match.id === 'cybersecurity');

// ---------- 「脆弱性」の意味 ----------
check('金融の「クロスボーダーの脆弱性」（日本語）は、サイバーセキュリティに一致しない',
  !matched(item('金融安定理事会による「グローバル・ステーブルコイン（GSC）：クロスボーダーの脆弱性と金融安定のモニタリング」の公表について', '', '日本銀行')));
check('金融の vulnerabilities（英語）は、サイバーセキュリティに一致しない',
  !matched(item('Global Stablecoin Arrangements: Cross-border vulnerabilities and financial stability monitoring', '', '金融安定理事会')));
check('ソフトウェアの脆弱性（CVE）は、見出しの一致として強く一致する',
  matched(item('注意喚起: PHPにおける複数の脆弱性（CVE-2026-109618）に関する注意喚起', '', 'JPCERT/CC'))?.strength === 1);
check('別の意味の証拠がなければ、短い英語の見出しでも一致する（"vulnerability discovery"）',
  matched(item('Cloudflare links vulnerability discovery to defense with OpenAI'))?.strength === 1);
check('金融の記事でも、サイバーの文脈（ランサムウェア・攻撃）があれば一致する',
  matched(item('Bank hit by ransomware attack exploiting a vulnerability in its payment software', '', 'Example Bank')) !== undefined);
check('「脆弱性」以外の語（ランサムウェア）は、金融の記事でも一致する',
  matched(item('銀行を狙うランサムウェアの被害が増加', '金融機関の市場データが暗号化された'))?.strength === 1);

// ---------- 組織名 ----------
check('会社名「サイバーセキュリティクラウド」だけでは、サイバーセキュリティに一致しない',
  !matched(item('採用業務改革ウェビナー、株式会社サイバーセキュリティクラウドと共催', '採用の質を落とさず業務を効率化するための取り組みを紹介します。')));
check('会社名があっても、記事がサイバーセキュリティの話題なら一致する',
  matched(item('サイバーセキュリティクラウドが、ランサムウェア対策の新機能を発表'))?.strength === 1);
check('「サイバーセキュリティ」の見出しは、これまでどおり強く一致する',
  matched(item('高市総理は第１回サイバーセキュリティに関する関係閣僚会議を開催しました'))?.strength === 1);

// ---------- 利用者のトピック ----------
const custom = profile('cybersecurity');
custom.topics.push({ id: 'my-finance', label: '金融の脆弱性', enabled: true, weight: 1, sourceTypes: [], regions: [], alsoRequires: [], alsoRequiresRegions: [], sources: [], boostOnly: false, keywords: ['脆弱性'] } as Profile['topics'][number]);
const finance = item('グローバル・ステーブルコイン：クロスボーダーの脆弱性と金融安定', '', '日本銀行');
check('利用者が追加したトピックは、キーワード（脆弱性）で、これまでどおり一致する', matchTopics(finance, custom).some(match => match.id === 'my-finance'));
check('同じ記事は、初期設定のサイバーセキュリティには一致しない', !matchTopics(finance, custom).some(match => match.id === 'cybersecurity'));

if (failures) {
  console.error(`\n${failures} 件の確認に失敗しました`);
  process.exit(1);
}
console.log('\nすべて成功しました');
