// 情報源の提供層（tierOf）と既定のオン・オフ（defaultOn）が、属性（pack・level・since）だけから決まることを確かめる。
// 上限の判定と絞り込みは別の段階で足すので、ここでは関数の全分岐と、いまのフィードの層の内訳だけを確かめる
import { coreFeeds } from '../src/feeds/core.js';
import { professionalFeeds } from '../src/feeds/professional.js';
import { officialFeeds } from '../src/newsPipeline.js';
import { defaultOn, tierOf } from '../src/sourceTier.js';
import { SOURCE_LEVELS } from '../src/types.js';
import type { SourceLevel } from '../src/types.js';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`);
  if (!ok) failures++;
};

// ---------- tierOf ----------
const levels: (SourceLevel | undefined)[] = [...SOURCE_LEVELS, undefined];
for (const level of levels) {
  check(`pack があれば、level が ${level ?? '未指定'} でも有償`, tierOf({ level, pack: 'legal' }) === 'paid');
}
check('pack があれば、since が付いていても有償', tierOf({ level: 'national', pack: 'legal', since: '2026-10-21' }) === 'paid');
check('regional は無償の上限の対象', tierOf({ level: 'regional' }) === 'limited');
check('local は無償の上限の対象', tierOf({ level: 'local' }) === 'limited');
check('national は無償', tierOf({ level: 'national' }) === 'free');
check('international は無償', tierOf({ level: 'international' }) === 'free');
check('level が無い情報源（企業・研究機関・団体）は無償', tierOf({}) === 'free');
check('regional・local でも、since の有無で層は変わらない', tierOf({ level: 'regional', since: '2026-10-21' }) === 'limited' && tierOf({ level: 'local', since: '2026-10-21' }) === 'limited');
check('pack が空の文字列なら、パックなしとして扱う', tierOf({ level: 'national', pack: '' }) === 'free');

// ---------- defaultOn ----------
check('無償で since が無ければ、既定でオン', defaultOn({ level: 'national' }) && defaultOn({ level: 'international' }) && defaultOn({}));
check('無償でも since が付いていれば、既定ではオフの候補（規約が確認できるまで置く中央政府など）',
  !defaultOn({ level: 'national', since: '2026-10-21' }) && !defaultOn({ since: '2026-10-21' }) && !defaultOn({ level: 'international', since: '2026-10-21' }));
check('regional・local は since が無くても、層が limited なので既定オンにならない', !defaultOn({ level: 'regional' }) && !defaultOn({ level: 'local' }));
check('有償のパックは既定でオフ', !defaultOn({ level: 'national', pack: 'legal' }) && !defaultOn({ pack: 'legal', since: '2026-10-21' }));

// ---------- いまのフィードの内訳 ----------
// 凍結した情報源（src/feeds/core.ts）と、2026-10-23 に足した専門職向けの情報源（src/feeds/professional.ts）
const count = (feeds: typeof officialFeeds, tier: string) => feeds.filter(feed => tierOf(feed) === tier).length;
const breakdown = (feeds: typeof officialFeeds) => `${count(feeds, 'free')}/${count(feeds, 'limited')}/${count(feeds, 'paid')} of ${feeds.length}`;
check('凍結した情報源98件の層は、無償93・上限の対象5（オンタリオ州政府と、ウォータールー周辺の4自治体）・有償0',
  coreFeeds.length === 98 && breakdown(coreFeeds) === '93/5/0 of 98', breakdown(coreFeeds));
check('専門職向けの42件の層は、無償19・上限の対象2（オンタリオ州証券委員会）・有償21（専門パック）',
  professionalFeeds.length === 42 && breakdown(professionalFeeds) === '19/2/21 of 42', breakdown(professionalFeeds));
check('フィードの一覧は、この2つを合わせたもの', officialFeeds.length === coreFeeds.length + professionalFeeds.length);
const limitedNames = ['ウォータールー市', 'ウォータールー・リージョン', 'オンタリオ州政府', 'キッチナー市', 'ケンブリッジ市'].sort().join(',');
check('凍結した情報源で上限の対象の5件は、オンタリオ州政府とウォータールー周辺の4自治体',
  coreFeeds.filter(feed => tierOf(feed) === 'limited').map(feed => feed.sourceName).sort().join(',') === limitedNames);
check('凍結した情報源で since が付いているのは、候補へ移したこの5件だけ（候補は既定ではオフ。既存の利用者には移行で引き継ぐ）',
  coreFeeds.filter(feed => feed.since).map(feed => feed.sourceName).sort().join(',') === limitedNames);
check('専門職向けの情報源は、すべて since が付き、既定ではオフ', professionalFeeds.every(feed => feed.since === '2026-10-23' && !defaultOn(feed)));
check('既定でオンの対象は93件（候補の5件と専門職向けの42件を除く）', officialFeeds.filter(defaultOn).length === 93 && officialFeeds.filter(feed => !defaultOn(feed)).length === 47);

if (failures) {
  console.error(`\n${failures} 件の確認に失敗しました`);
  process.exit(1);
}
console.log('\nすべて成功しました');
