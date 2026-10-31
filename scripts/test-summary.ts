// 要約の表示で見つかった不具合（2026-10-27 の実画面の確認）が戻らないことを確かめる。
//  - ブリーフィングの一文目が、英語の頭文字「B.」で切れる（"has won an Arthur B."）
//  - 抽出型の要約で、本文の小見出し（「…会見の概要」）が選ばれ、日本語は次の文に区切りなしでつながる（「…の概要昨日の…」）
import { firstSentence } from '../src/api.js';
import { summarizeExtractively } from '../src/summarizers/extractive.js';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`);
  if (!ok) failures++;
};

// ---------- ブリーフィングの一文目 ----------
const papernot = 'Professor Nicolas Papernot (ECE) has won an Arthur B. McDonald Fellowship for his research into the security of AI. The fellowship also releases time.';
check('頭文字（Arthur B.）では区切らない', firstSentence(papernot, 200) === 'Professor Nicolas Papernot (ECE) has won an Arthur B. McDonald Fellowship for his research into the security of AI.', firstSentence(papernot, 200));
check('敬称（Dr.）では区切らない', firstSentence('Dr. Smith announced a new program. More follows.', 200) === 'Dr. Smith announced a new program.', firstSentence('Dr. Smith announced a new program. More follows.', 200));
check('U.S. では区切らない', firstSentence('The U.S. Department of State released a statement today. Details follow.', 200) === 'The U.S. Department of State released a statement today.');
check('通常の文末では区切る', firstSentence('The Bank raised rates. Markets reacted.', 200) === 'The Bank raised rates.');
check('頭文字ばかりで文末がなければ、全体を上限で切る', firstSentence('Arthur B. McDonald', 200) === 'Arthur B. McDonald');
check('日本語は句点で区切る', firstSentence('令和８年10月26日、会議を開催しました。次の会議は未定です。', 200) === '令和８年10月26日、会議を開催しました。');
check('英語は上限で切るとき、語の途中で切らない', firstSentence(papernot) === 'Professor Nicolas Papernot (ECE) has won an Arthur B. McDonald Fellowship for his…', firstSentence(papernot));
check('上限を超えたら省略記号を付ける', firstSentence('a'.repeat(200) + '.', 50).length === 50 && firstSentence('a'.repeat(200) + '.', 50).endsWith('…'));

// ---------- 抽出型の要約: 本文の小見出し ----------
const title = '記者会見,片山財務大臣兼内閣府特命担当大臣閣議後記者会見の概要（令和８年10月16日）について掲載しました。';
const page = [
  '片山財務大臣兼内閣府特命担当大臣閣議後記者会見の概要',
  '（令和８年10月16日（金曜）8時30分～8時34分）',
  '昨日バンコクで開かれましたＧ20とＧ７の財務相・中央銀行総裁会議に出席されました。大変強行な日程だったと思いますが今回の成果をどのように評価されていますでしょうか。',
  '昨日のＧ20及びＧ７の財務大臣・中央銀行総裁会議では世界経済や金融の諸課題について幅広い議論が行われて、ほとんど全員本人出席で集まれたということが非常に意味があったと思っております。'
].join('\n\n');
const summary = summarizeExtractively(title, page);
check('小見出しは要約に入らない（「概要昨日の」のような連結がない）', !summary.summary.includes('概要昨日') && !summary.summary.startsWith('片山財務大臣兼内閣府特命担当大臣閣議後記者会見の概要'), summary.summary);
check('本文の文は要約に残る', summary.summary.includes('ほとんど全員本人出席で集まれた') || summary.summary.includes('バンコク'), summary.summary);

const listing = summarizeExtractively(title, '関連ページの一覧です。ここから各分野のご案内をご覧いただけます。\n\nお問い合わせは、各窓口までお願いいたします。受付時間は平日の午前です。');
check('見出しと関係のない一覧ページは、これまでどおり内容不足として扱う', listing.insufficient && listing.summary === '', JSON.stringify(listing));

const press = [
  '高市総理は、総理大臣官邸で第１回サイバーセキュリティに関する関係閣僚会議を開催しました。',
  '赤沢経済産業大臣は、中小企業や小規模事業者が十分に活用できるよう、支援策の拡充を速やかに検討してください。'
].join('\n\n');
const normal = summarizeExtractively('高市総理は第１回サイバーセキュリティに関する関係閣僚会議を開催しました', press);
check('句点で終わる普通の文は、見出しとよく似ていても残る', normal.summary.includes('赤沢経済産業大臣'), normal.summary);

const bullets = summarizeExtractively('新制度の概要', ['・新制度の概要', '・対象は中小企業です。'].join('\n') + '\n\n新制度は、中小企業の資金繰りを支援するため、来年度から実施されます。');
check('箇条書きは小見出しとして除かない（要約が空にならない）', bullets.summary.length > 0, JSON.stringify(bullets));

if (failures) {
  console.error(`\n${failures} 件の確認に失敗しました`);
  process.exit(1);
}
console.log('\nすべて成功しました');
