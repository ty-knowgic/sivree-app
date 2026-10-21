// 情報源の提供層（tierOf）と既定のオン・オフ（defaultOn）が、属性（pack・level・since）だけから決まることを確かめる。
// 上限の判定と絞り込みは別の段階で足すので、ここでは関数の全分岐と、いまのフィードの層の内訳だけを確かめる
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
// 凍結した既定の93本と、候補25本（ウォータールー周辺の5本、2026-10-21 に足した専門パック14本と無償の候補8本）
const count = (tier: string) => officialFeeds.filter(feed => tierOf(feed) === tier).length;
check('いまのフィード120本の層は、無償98・上限の対象8・有償14',
  officialFeeds.length === 120 && count('free') === 98 && count('limited') === 8 && count('paid') === 14, `${count('free')}/${count('limited')}/${count('paid')} of ${officialFeeds.length}`);
const namesOf = (feeds: typeof officialFeeds) => [...new Set(feeds.map(feed => feed.sourceName))].sort().join(',');
const legacyNames = ['ウォータールー市', 'ウォータールー・リージョン', 'オンタリオ州政府', 'キッチナー市', 'ケンブリッジ市'].sort().join(',');
check('上限の対象は、オンタリオ州政府とウォータールー周辺の4自治体、オンタリオ州証券委員会',
  namesOf(officialFeeds.filter(feed => tierOf(feed) === 'limited')) === [...legacyNames.split(','), 'オンタリオ州証券委員会'].sort().join(','), namesOf(officialFeeds.filter(feed => tierOf(feed) === 'limited')));
check('有償の層は、専門パックの情報源だけ', officialFeeds.filter(feed => tierOf(feed) === 'paid').every(feed => feed.pack));
check('無償の候補（since つきの free）は、e-Gov・公認会計士協会・税理士会連合会・BIS',
  namesOf(officialFeeds.filter(feed => tierOf(feed) === 'free' && feed.since)) === ['BIS', 'e-Gov パブリック・コメント', '日本公認会計士協会', '日本税理士会連合会'].sort().join(','), namesOf(officialFeeds.filter(feed => tierOf(feed) === 'free' && feed.since)));
check('既定でオンは93本（候補の27本を除く）', officialFeeds.filter(defaultOn).length === 93 && officialFeeds.filter(feed => !defaultOn(feed)).length === 27);

if (failures) {
  console.error(`\n${failures} 件の確認に失敗しました`);
  process.exit(1);
}
console.log('\nすべて成功しました');
