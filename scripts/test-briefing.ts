// ブリーフィングが、利用者の選んだ地域を満遍なく取ることを確かめる（2026-10-31）。
// 日本・米国・カナダを選んだ利用者の上位5件が、日本3件・カナダ1件・米国0件になっていた（記事の多い地域に偏る）。
// 地域の絞り込みで選べる地域は、ブリーフィングでも取れていること。ただし、候補のない地域は飛ばし、選んでいない地域は取らない
import { buildBriefing } from '../src/api.js';
import { defaultProfile } from '../src/profile.js';
import type { Profile } from '../src/profile.js';
import type { NewsItem } from '../src/types.js';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` ${detail}`}`);
  if (!ok) failures++;
};

const NOW = Date.parse('2026-10-27T12:00:00Z');
Date.now = () => NOW;

// 5つの別々のトピック（1つのトピックは2件までなので、偏りの検証に十分な数）
const KEYWORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
const profileFor = (regions: string[]): Profile => {
  const profile = defaultProfile();
  profile.regions = regions;
  profile.topics = KEYWORDS.map(keyword => ({
    id: keyword, label: keyword, enabled: true, weight: 1, sourceTypes: [], regions: [], alsoRequires: [], alsoRequiresRegions: [], sources: [], boostOnly: false, keywords: [keyword]
  })) as Profile['topics'];
  return profile;
};

let counter = 0;
/** region の記事を count 件。hours は発表からの経過時間、keywordIndex でトピックを散らす */
const articles = (region: string, count: number, hours: number, options: { wire?: boolean; startAt?: number } = {}): NewsItem[] =>
  Array.from({ length: count }, (_, index) => {
    const keyword = KEYWORDS[((options.startAt ?? 0) + index) % KEYWORDS.length];
    counter++;
    return {
      id: `a${String(counter).padStart(15, '0')}`, title: `${keyword} update number ${counter}`,
      summary: 'This is a sufficiently long summary sentence for the briefing line.',
      sourceName: options.wire ? 'PR Newswire' : `${region}の発信元${counter}`, sourceType: options.wire ? 'corporate' : 'official', category: '政治', categories: ['政治'], subgroup: region,
      publishedAt: new Date(NOW - (hours + index * 0.1) * 3_600_000).toISOString(), url: `https://example.test/${counter}`, feedUrl: `https://example.test/feed/${region}`, hashtags: [], keywords: []
    } as unknown as NewsItem;
  });
const briefing = (profile: Profile, items: NewsItem[]) => buildBriefing({ items, sources: [], summaries: new Map(), profile, semantic: null, hasVectors: false, sourceIdOf: () => '' });
const byRegion = (stories: { subgroup: string }[]) => stories.reduce<Record<string, number>>((acc, story) => ({ ...acc, [story.subgroup]: (acc[story.subgroup] ?? 0) + 1 }), {});
const show = (stories: { subgroup: string }[]) => JSON.stringify(byRegion(stories));

// ---------- 満遍なく取る ----------
// 記事の数が日本 >> 米国 > カナダでも、3つの地域がそろう（件数の差は1件まで）
{
  const items = [...articles('日本', 12, 1), ...articles('米国', 6, 3), ...articles('カナダ', 3, 5)];
  const { stories } = briefing(profileFor(['日本', '米国', 'カナダ']), items);
  const counts = byRegion(stories);
  const values = ['日本', '米国', 'カナダ'].map(region => counts[region] ?? 0);
  check('日本・米国・カナダ: 5件取れる', stories.length === 5, show(stories));
  check('日本・米国・カナダ: どの地域も1件以上', values.every(value => value >= 1), show(stories));
  check('日本・米国・カナダ: 地域ごとの件数の差は1件まで（記事の多い日本に偏らない）', Math.max(...values) - Math.min(...values) <= 1, show(stories));
}
// 5つの地域すべて: 1件ずつ
{
  const items = ['日本', '米国', 'カナダ', '欧州', 'グローバル'].flatMap((region, index) => articles(region, 4, 2 + index, { startAt: index }));
  const { stories } = briefing(profileFor([]), items);
  check('地域をすべて選ぶ（または選ばない）と、5地域から1件ずつ', stories.length === 5 && Object.values(byRegion(stories)).every(value => value === 1) && Object.keys(byRegion(stories)).length === 5, show(stories));
}
// 2つの地域: 3件と2件
{
  const items = [...articles('米国', 8, 1), ...articles('欧州', 8, 2, { startAt: 2 })];
  const { stories } = briefing(profileFor(['米国', '欧州']), items);
  const counts = byRegion(stories);
  check('2つの地域: 3件と2件に分かれる', stories.length === 5 && Math.abs((counts['米国'] ?? 0) - (counts['欧州'] ?? 0)) === 1, show(stories));
}
// 1つの地域だけ: 従来どおり、その地域から5件
{
  const { stories } = briefing(profileFor(['日本']), [...articles('日本', 10, 1), ...articles('米国', 10, 1)]);
  check('1つの地域だけを選ぶと、その地域から5件', stories.length === 5 && show(stories) === '{"日本":5}', show(stories));
}

// ---------- 地域の扱い ----------
{
  // 同じ地域が重複して保存されていても、その地域が倍の枠を取らない
  const items = [...articles('日本', 12, 1), ...articles('米国', 12, 2, { startAt: 2 })];
  const duplicated = briefing(profileFor(['日本', '日本', '米国']), items);
  const single = briefing(profileFor(['日本', '米国']), items);
  check('同じ地域が重複して保存されていても、取り方は変わらない', show(duplicated.stories) === show(single.stories) && duplicated.stories.map(story => story.id).join() === single.stories.map(story => story.id).join(), `${show(duplicated.stories)} / ${show(single.stories)}`);
  check('存在しない地域名（Mars）が混じっていても、ほかの地域で5件取れる', briefing(profileFor(['日本', 'Mars', '米国']), items).stories.length === 5);
}
{
  const items = [...articles('日本', 8, 2), ...articles('米国', 8, 2, { startAt: 1 })];
  const { stories } = briefing(profileFor(['日本', '米国', 'カナダ']), items);
  check('候補のない地域（カナダ）は飛ばし、ほかの地域で5件にする', stories.length === 5 && !('カナダ' in byRegion(stories)), show(stories));
}
{
  // 選んでいない地域（カナダ）の記事が、最も新しく数が多くても、取らない
  const items = [...articles('カナダ', 20, 0.5), ...articles('日本', 3, 6), ...articles('米国', 3, 6, { startAt: 2 })];
  const { stories } = briefing(profileFor(['日本', '米国']), items);
  check('選んでいない地域の記事は載せない', stories.every(story => story.subgroup !== 'カナダ') && stories.length >= 4, show(stories));
}

// ---------- 新しさ ----------
{
  // ほかの地域が直近24時間にあっても、静かな地域（カナダ）は、期間を広げてでも1件取る
  const items = [...articles('日本', 8, 1), ...articles('米国', 8, 2, { startAt: 1 }), ...articles('カナダ', 2, 100, { startAt: 3 })];
  const { stories, windowHours } = briefing(profileFor(['日本', '米国', 'カナダ']), items);
  check('静かな地域は、期間を広げて1件取る（時間は広げた分だけ）', stories.some(story => story.subgroup === 'カナダ') && windowHours === 120, `${show(stories)} window=${windowHours}`);
  check('新しい発表がある地域は、広げた期間の古い記事ではなく新しい記事を取る', stories.filter(story => story.subgroup === '日本').every(story => Date.now() - Date.parse(story.publishedAt) <= 24 * 3_600_000), show(stories));
}
{
  const { windowHours } = briefing(profileFor(['日本', '米国']), [...articles('日本', 6, 1), ...articles('米国', 6, 2, { startAt: 2 })]);
  check('すべての地域に直近24時間の記事があれば、期間は24時間', windowHours === 24, String(windowHours));
}

// ---------- 従来の条件は保つ ----------
{
  const items = [...articles('米国', 6, 1, { wire: true }), ...articles('米国', 6, 2), ...articles('日本', 6, 2, { startAt: 1 })];
  const { stories } = briefing(profileFor(['日本', '米国']), items);
  check('プレスリリース配信サービスの発表は1件まで', stories.filter(story => story.sourceName === 'PR Newswire').length <= 1, JSON.stringify(stories.map(story => story.sourceName)));
  check('同じ発信元は1件まで', new Set(stories.map(story => story.sourceName)).size === stories.length);
  check('同じトピックは2件まで', Object.values(stories.reduce<Record<string, number>>((acc, story) => ({ ...acc, [story.matches[0].id]: (acc[story.matches[0].id] ?? 0) + 1 }), {})).every(value => value <= 2));
}
{
  const items = [...articles('日本', 6, 1), ...articles('米国', 6, 5, { startAt: 2 }), ...articles('カナダ', 6, 3, { startAt: 4 })];
  const { stories } = briefing(profileFor(['日本', '米国', 'カナダ']), items);
  const times = stories.map(story => Date.parse(story.publishedAt));
  // どの記事も一致の強さと重みが同じなので、関連度の順は新しい順になる
  check('画面には、地域の取り方の順ではなく、関連度の順に並べる', stories.length === 5 && times.every((time, index) => index === 0 || times[index - 1] >= time), JSON.stringify(stories.map(story => `${story.subgroup}:${story.publishedAt.slice(11, 16)}`)));
}

if (failures) {
  console.error(`\n${failures} 件の確認に失敗しました`);
  process.exit(1);
}
console.log('\nすべて成功しました');
