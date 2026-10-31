import type { SubgroupKey } from './types.js';

/**
 * 配信サービスの発表の日付行（「TORONTO, Oct. 29, 2026 /PRNewswire/」）から、発表元の地域を求める。
 * 州・国名が付いていればそれで、付いていなければ主要都市の一覧で判定する。判定できないときは undefined（フィードの地域のまま）。
 * 米国の州・都市は undefined を返す（配信サービスのフィードの地域が米国のため）。
 */

// 都市名は大文字の語の並び、州・国名は続く短い語。日付行の前に副題が付くことがあるため、日付の直前だけを読む
const CAPS_WORD = "[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ.'’-]*";
const DATELINE = new RegExp(`((?:${CAPS_WORD} )*${CAPS_WORD})(?:, ((?:the )?[A-Z][A-Za-z.]*(?: [A-Za-z.]+){0,3}))?, (?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\\.? \\d{1,2}, \\d{4} ?/\\s*(?:PRNewswire|CNW)`);

const SUFFIX_REGIONS: [RegExp, SubgroupKey][] = [
  [/^(ON|Ont\.?|Ontario|QC|Que\.?|Quebec|Québec|BC|B\.C\.|AB|Alta\.?|Alberta|MB|Man\.|Manitoba|SK|Sask\.?|Saskatchewan|NS|N\.S\.|Nova Scotia|NB|N\.B\.|New Brunswick|NL|N\.L\.|Newfoundland( and Labrador)?|PE|PEI|P\.E\.I\.|Prince Edward Island|YT|Yukon|NT|N\.W\.T\.|Northwest Territories|NU|Nunavut|Canada)$/, 'カナダ'],
  [/^Japan$/, '日本'],
  [/^(United Kingdom|U\.K\.|UK|England|Scotland|Wales|(Northern )?Ireland|Germany|France|Spain|Italy|(the )?Netherlands|Belgium|Switzerland|Austria|Sweden|Norway|Denmark|Finland|Iceland|Poland|Czech Republic|Czechia|Portugal|Greece|Luxembourg|Estonia|Latvia|Lithuania|Hungary|Romania|Bulgaria|Croatia|Slovenia|Slovakia|Malta|Cyprus)$/, '欧州']
];

// 州・国名を付けずに書かれる主要都市（米国の都市と同名になりうるものは入れない）
const CITY_REGIONS: [RegExp, SubgroupKey][] = [
  [/(^|[^A-Z])(TORONTO|MONTR[EÉ]AL|VANCOUVER|CALGARY|OTTAWA|EDMONTON|WINNIPEG|QU[EÉ]BEC CITY|HALIFAX|MISSISSAUGA)$/, 'カナダ'],
  [/(^|[^A-Z])(TOKYO|OSAKA|KYOTO|YOKOHAMA|NAGOYA|FUKUOKA|KOBE|SAPPORO)$/, '日本'],
  [/(^|[^A-Z])(LONDON|PARIS|BERLIN|MUNICH|FRANKFURT|HAMBURG|AMSTERDAM|ROTTERDAM|EINDHOVEN|BRUSSELS|STOCKHOLM|COPENHAGEN|OSLO|HELSINKI|DUBLIN|MADRID|BARCELONA|MILAN|ROME|Z[UÜ]RICH|GENEVA|BASEL|VIENNA|WARSAW|PRAGUE|LISBON|LUXEMBOURG|EDINBURGH)$/, '欧州']
];

export function datelineRegion(text: string): SubgroupKey | undefined {
  const match = DATELINE.exec(text);
  if (!match) return undefined;
  // 「MIAMI and MEXICO CITY」のように複数の都市が並ぶものは判定しない
  if (/(\band|&)\s*$/.test(text.slice(0, match.index))) return undefined;
  const [, city, suffix] = match;
  if (suffix) return SUFFIX_REGIONS.find(([pattern]) => pattern.test(suffix))?.[1];
  return CITY_REGIONS.find(([pattern]) => pattern.test(city))?.[1];
}
