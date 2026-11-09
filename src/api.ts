import { workflowsOf } from './feeds/workflows.js';
import { filterNews, listCategoryGroups, listFilterOptions, withPrimaryCategory } from './newsFilters.js';
import { DEFAULT_PROFILE, matchTopics, rankForYou, STARTER_TOPIC_IDS } from './profile.js';
import type { Profile, TopicMatch } from './profile.js';
import { buildStoryIndex, findRelated, groupStories } from './stories.js';
import { cleanFeedText } from './text.js';
import { CATEGORIES, SUBGROUPS } from './types.js';
import type { ArticleSummary, NewsItem } from './types.js';
import type { SemanticScorer } from './vectors.js';

/**
 * 画面が使う API の中身（記事の一覧・マイニュース・ブリーフィング・情報源など）。
 * サーバー（Express）でもブラウザ（静的サイト版）でも同じ計算になるよう、
 * 記事・プロフィール・ベクトルを引数で受け取る純粋な関数にしてある。
 */

export interface SourceInfo {
  workflows?: ReturnType<typeof workflowsOf>;
  id: string;
  sourceType: string;
  sourceName: string;
  label: string;
  subgroup: string;
  level?: import('./types.js').SourceLevel;
  area?: string;
  city?: string;
  categories: string[];
  sourceUrl: string;
  feedUrl: string;
  health: unknown;
  /** 既定ではオフの候補か（src/sourceTier.ts の defaultOn でないもの）。古いデータには付いていない（候補ではない扱い） */
  candidate?: boolean;
  /** 専門パック（src/feeds/packs.ts）。名前と説明は画面の文言（日本語がキー） */
  pack?: { id: string; name: string; blurb: string };
}

export interface ApiContext {
  /** 蓄積中の全記事 */
  items: NewsItem[];
  /** 記事 ID → 保存済みの要約 */
  summaries: Map<string, ArticleSummary>;
  profile: Profile;
  /** 意味による一致の判定（使えない場合は null） */
  semantic: SemanticScorer | null;
  /** 記事のベクトルが読み込み済みか（同じ話題のまとめに必要） */
  hasVectors: boolean;
  sources: SourceInfo[];
  sourceIdOf(feedUrl: string): string;
  /** 記事 ID → 一致したトピック。同じ記事群・プロフィール・判定のあいだだけ使い回す（呼び出し側が作り直す） */
  matchCache?: Map<string, TopicMatch[]>;
}

function matchesOf(ctx: ApiContext, item: Parameters<typeof matchTopics>[0]): TopicMatch[] {
  const cached = ctx.matchCache?.get(item.id);
  if (cached) return cached;
  const matches = matchTopics(item, ctx.profile, ctx.semantic);
  ctx.matchCache?.set(item.id, matches);
  return matches;
}

export interface NewsQuery {
  forYou?: boolean;
  category?: string;
  subgroup?: string;
  sourceType?: string;
  keyword?: string;
  offset?: number;
  limit?: number;
}

// プレスリリース配信サービス（誰でも有料で配信できる）
const PR_WIRES = new Set(['PR TIMES', '@Press', 'PR Newswire', 'Cision Canada']);

/**
 * 発信元による重み: 政府・研究機関・団体の発表と、企業が自社サイトで公開した発表を、
 * 配信サービス経由の企業発表（宣伝や調査リリースが多い）より上位にする
 */
function sourceWeight(item: NewsItem): number {
  if (PR_WIRES.has(item.sourceName)) return 0.6;
  return item.sourceType === 'corporate' ? 0.9 : 1;
}

// 保存済みの要約があれば一覧用の項目に添える（ここでは新たな要約は作らない）
export function withStoredSummaries(summaries: Map<string, ArticleSummary>, items: NewsItem[]) {
  return items.map((item) => {
    // 見出しとリンクだけを表示する記事（利用条件による）には、要約を添えない
    const summary = item.titleOnly ? undefined : summaries.get(item.id);
    return summary ? { ...item, ai: { headlineJa: summary.headlineJa, summary: summary.summary, method: summary.method } } : item;
  });
}

/**
 * 表示順の記事を話題ごとにまとめる。マイニュースでは、複数の発信元が伝えている話題を少し上位にする
 * （官公庁の発表と報道の両方がある、など。同じ発信元の続報は数えない）
 */
function groupForDisplay<T extends NewsItem & { score?: number }>(ctx: ApiContext, items: T[], byScore: boolean) {
  if (!ctx.hasVectors) return items.map(item => ({ ...item, related: [] }));
  const grouped = groupStories(items, buildStoryIndex(ctx.items));
  if (!byScore) return grouped;
  const coverage = (item: (typeof grouped)[number]) => new Set([item.sourceName, ...item.related.map(related => related.sourceName)]).size;
  return grouped
    .map(item => ({ item, score: (item.score ?? 0) * sourceWeight(item) * (1 + 0.25 * Math.min(2, coverage(item) - 1)) }))
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

/**
 * 利用者の選んだ地域・分野と、オフにした情報源による絞り込み条件。
 * マイニュースとブリーフィングは関心トピックで選ぶため、分野では絞らない
 * （例: 「社会」を選んでいなくても、関心トピック「ウォータールー周辺」に一致する市の発表は表示する）
 */
export function scopeOf(profile: Profile, forYou = false, sources: SourceInfo[] = []) {
  return { excludedSources: excludedSourceIds(profile, sources), hiddenItems: new Set(profile.hiddenItems), regions: profile.regions, categories: forYou ? [] : profile.categories };
}

/**
 * 表示しない情報源の ID。既定の情報源は excludedSources にあるもの、候補は extraSources にないもの。
 * （候補は excludedSources を見ない。オフにした候補が excludedSources にも入るのは、移行のやり直しで戻さないためだけ）
 */
function excludedSourceIds(profile: Profile, sources: SourceInfo[]): Set<string> {
  const candidates = new Set(sources.filter(source => source.candidate).map(source => source.id));
  const extra = new Set(profile.extraSources);
  return new Set([
    ...profile.excludedSources.filter(id => !candidates.has(id)),
    ...[...candidates].filter(id => !extra.has(id))
  ]);
}

/** 利用者の対象範囲（地域・情報源、マイニュース以外では分野も）に含まれる、蓄積中の全記事 */
export function visibleNews(ctx: ApiContext, forYou = false): NewsItem[] {
  return filterNews(ctx.items, scopeOf(ctx.profile, forYou, ctx.sources), ctx.sourceIdOf).map(item => withPrimaryCategory(item, ctx.profile.categories));
}

/** 記事の一覧（マイニュースは関心プロフィールに一致する記事を関連度順に、それ以外は新しい順）。どちらも一致したトピックを添える */
export function listNews(ctx: ApiContext, query: NewsQuery) {
  const { profile } = ctx;
  const filtered = filterNews(ctx.items, {
    category: query.category,
    subgroup: query.subgroup,
    sourceType: query.sourceType,
    keyword: query.keyword,
    ...scopeOf(profile, query.forYou, ctx.sources)
  }, ctx.sourceIdOf);

  const withSummaries = withStoredSummaries(ctx.summaries, filtered.map(item => withPrimaryCategory(item, profile.categories)));
  const ranked = query.forYou
    ? rankForYou(withSummaries, profile, ctx.semantic, item => matchesOf(ctx, item))
    : withSummaries.map(item => ({ ...item, matches: matchesOf(ctx, item) }));
  // 同じ出来事の発表・報道は1枚のカードにまとめる（埋め込みが使えない場合はまとめない）
  const result = groupForDisplay(ctx, ranked, Boolean(query.forYou));

  // 蓄積データが多くなっても端末側の負荷が増えないよう、ページ単位で返す
  const start = Math.max(0, Number(query.offset) || 0);
  const size = Math.min(200, Math.max(1, Number(query.limit) || 200));
  return { total: result.length, items: result.slice(start, start + size) };
}

/**
 * 検索語に一致する記事が、いまの表示の外にどれだけあるか（検索中の画面が「すべて」への切り替えと、情報源をオンにする案内に使う）。
 * all: 「すべて」タブで表示される件数（一覧と同じく、同じ話題をまとめたカードの数）。
 * sources: オフにした情報源・候補のうち、オンにすれば「すべて」に一致する記事が出るもの（件数の多い順）。
 * 地域・分野・非表示にした記事は利用者の選択のまま絞るので、件数はオンにしたときに実際に増える数になる
 */
export function searchElsewhere(ctx: ApiContext, keyword: string) {
  if (!keyword.trim()) return { all: 0, sources: [] };
  const all = listNews(ctx, { keyword, limit: 1 }).total;
  const scope = scopeOf(ctx.profile, false, ctx.sources);
  const counts = new Map<string, number>();
  for (const item of filterNews(ctx.items, { keyword, ...scope, excludedSources: new Set() }, ctx.sourceIdOf)) {
    const id = ctx.sourceIdOf(item.feedUrl);
    if (scope.excludedSources.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const byId = new Map(ctx.sources.map(source => [source.id, source]));
  const sources = [...counts].flatMap(([id, count]) => {
    const source = byId.get(id);
    return source ? [{ id, sourceName: source.sourceName, label: source.label, subgroup: source.subgroup, candidate: Boolean(source.candidate), count }] : [];
  });
  return { all, sources: sources.sort((a, b) => b.count - a.count || a.sourceName.localeCompare(b.sourceName)) };
}

// 英語で、ピリオドが文の終わりではない語: 頭文字（"Arthur B. McDonald"）、敬称・略語（"Dr."、"U.S."）。次に大文字が続いても、ここでは区切らない
const ABBREVIATION_BEFORE_PERIOD = /(?:^|[\s("'“])(?:[A-Z]|Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Mt|U\.S|U\.K)$/;

/** 要約（なければ説明文）の最初の一文を、ブリーフィング用の短い説明にする */
export function firstSentence(text: string, max = 90): string {
  const clean = cleanFeedText(text);
  const ending = /。|[.!?](?=\s|$)/g;
  let sentence = clean;
  for (let match = ending.exec(clean); match; match = ending.exec(clean)) {
    if (match[0] === '.' && ABBREVIATION_BEFORE_PERIOD.test(clean.slice(0, match.index))) continue;
    sentence = clean.slice(0, match.index + match[0].length);
    break;
  }
  if (sentence.length <= max) return sentence;
  // 英語は語の途中で切らない（日本語は空白がないので、そのまま max で切る）
  const cut = sentence.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * 今日のブリーフィング: マイニュースのうち直近の話題から、関心トピックが偏らないよう最大5件を選ぶ。
 * 文章は記事の要約・説明文から取り出すだけで、生成AIは使わない
 */
const BRIEFING_SIZE = 5;
// 新しい発表を優先し、足りなければ広げる期間（時間）。最長は1週間
const BRIEFING_WINDOWS = [24, 48, 72, 120, 168];

export function buildBriefing(ctx: ApiContext) {
  const { profile } = ctx;
  const items = withStoredSummaries(ctx.summaries, visibleNews(ctx, true));
  const stories = groupForDisplay(ctx, rankForYou(items, profile, ctx.semantic, item => matchesOf(ctx, item)), true);
  const boostOnly = new Set(profile.topics.filter(topic => topic.boostOnly).map(topic => topic.id));
  const MAX_PER_TOPIC = 2;

  type Story = (typeof stories)[number];
  const ageHours = (story: Story) => (Date.now() - new Date(story.publishedAt).getTime()) / 3_600_000;
  const within = (hours: number) => stories.filter(story => ageHours(story) <= hours);
  const lineOf = (story: Story) => firstSentence(('ai' in story && story.ai?.summary) || story.summary);
  const topicOf = (story: Story) => story.matches.find(match => !boostOnly.has(match.id))?.id ?? '';
  // 載せてよい記事: 本文で触れているだけ・内容の近さが弱いなど、一致の弱い記事と、見出しだけで内容が分からない記事は載せない
  const qualified = new Map<Story, boolean>();
  const qualifies = (story: Story) => {
    let ok = qualified.get(story);
    if (ok === undefined) {
      ok = story.matches.some(match => !boostOnly.has(match.id) && match.strength >= 0.75) && lineOf(story).length >= 20;
      qualified.set(story, ok);
    }
    return ok;
  };

  // すでに選んだ記事との関係で、載せられるか
  const fits = (story: Story, chosen: Story[]) => !chosen.includes(story)
    && chosen.filter(other => topicOf(other) === topicOf(story)).length < MAX_PER_TOPIC
    // プレスリリース配信サービスの発表は1件まで（発信元の多様さを保つ）
    && !(PR_WIRES.has(story.sourceName) && chosen.some(other => PR_WIRES.has(other.sourceName)))
    // 同じ発信元は1件まで（トピックが違っても同じ省庁・企業の発表が並ばないように）
    && !chosen.some(other => other.sourceName === story.sourceName);
  const rankOf = (story: Story) => stories.indexOf(story);
  // 同じ地域が重複して保存されていても、その地域に2枠は与えない
  const regions = [...new Set(profile.regions.length ? profile.regions : SUBGROUPS)];
  // 利用者が選んだ地域（選んでいなければすべて）から、1周に1件ずつ取る。1周の中は、その周の最初の候補の順位が高い地域から。
  // 地域ごとの候補は、前の地域が選ぶたびに選び直す（前の地域が同じトピックの枠を使い切っても、次の地域は別のトピックの記事を選べる）。
  // 件数が地域の数より少なければ上位の地域だけ、多ければ2周目以降も同じ順で続く。候補のない地域は飛ばす
  const balanced = (pool: Story[]) => {
    const chosen: Story[] = [];
    const nextFor = (region: string) => pool.find(candidate => candidate.subgroup === region && qualifies(candidate) && fits(candidate, chosen));
    while (chosen.length < BRIEFING_SIZE) {
      const order = regions.flatMap(region => { const next = nextFor(region); return next ? [{ region, rank: rankOf(next) }] : []; })
        .sort((a, b) => a.rank - b.rank);
      if (!order.length) break;
      for (const { region } of order) {
        if (chosen.length >= BRIEFING_SIZE) break;
        const next = nextFor(region);
        if (next) chosen.push(next);
      }
    }
    return chosen;
  };
  // 新しい発表だけで5件そろえばその期間で、そろわなければ期間を広げる（週末や連休明けは1週間まで）
  let windowHours = BRIEFING_WINDOWS[0];
  let picked: Story[] = [];
  for (const hours of BRIEFING_WINDOWS) {
    windowHours = hours;
    picked = balanced(within(hours));
    if (picked.length >= BRIEFING_SIZE) break;
  }
  // 期間を広げずにそろった場合に、新しい発表のない静かな地域も、1週間以内の発表から1件取る。
  // 5件を保つため、件数のいちばん多い地域の、いちばん順位の低い記事と入れ替える
  for (const region of regions.filter(value => !picked.some(story => story.subgroup === value))) {
    let base = picked;
    if (base.length >= BRIEFING_SIZE) {
      const counts = new Map<string, number>();
      for (const story of base) counts.set(story.subgroup, (counts.get(story.subgroup) ?? 0) + 1);
      const victim = base.filter(story => (counts.get(story.subgroup) ?? 0) > 1).sort((a, b) => rankOf(b) - rankOf(a))
        .sort((a, b) => (counts.get(b.subgroup) ?? 0) - (counts.get(a.subgroup) ?? 0))[0];
      if (!victim) continue;
      base = base.filter(story => story !== victim);
    }
    const extra = within(BRIEFING_WINDOWS[BRIEFING_WINDOWS.length - 1]).find(candidate => candidate.subgroup === region && qualifies(candidate) && fits(candidate, base));
    if (!extra) continue;
    picked = [...base, extra];
    windowHours = Math.max(windowHours, BRIEFING_WINDOWS.find(hours => ageHours(extra) <= hours) ?? windowHours);
  }
  // 画面には、地域ごとではなく、関連度の順に並べる
  picked.sort((a, b) => rankOf(a) - rankOf(b));
  const recent = within(windowHours);

  // 関心トピックごとの話題数（「生成AI 12件」のように、全体の動きを一目で見られるように）
  const topicCounts = profile.topics
    .filter(topic => topic.enabled && !topic.boostOnly)
    .map(topic => ({ id: topic.id, label: topic.label, count: recent.filter(story => story.matches.some(match => match.id === topic.id)).length }))
    .filter(topic => topic.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    generatedAt: new Date().toISOString(),
    windowHours,
    storyCount: recent.length,
    topics: topicCounts,
    stories: picked.map(story => ({
      id: story.id,
      title: ('ai' in story && story.ai?.headlineJa) || story.title,
      line: lineOf(story),
      category: story.category,
      subgroup: story.subgroup,
      sourceName: story.sourceName,
      sourceType: story.sourceType,
      publishedAt: story.publishedAt,
      matches: story.matches,
      related: story.related
    }))
  };
}

/** 情報源の一覧（設定画面用）。直近30日の取り込み件数と、この利用者が使っているかを添える */
export function sourcesWithUsage(ctx: ApiContext) {
  const counts = new Map<string, number>();
  for (const item of ctx.items) {
    const id = ctx.sourceIdOf(item.feedUrl);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const { profile } = ctx;
  return ctx.sources.map(source => ({
    ...source,
    enabled: source.candidate ? profile.extraSources.includes(source.id) : !profile.excludedSources.includes(source.id),
    // 選んだ地域の外にある情報源（設定の「地域・分野」で地域を加えると使われる）
    outOfRegion: Boolean(profile.regions.length) && !profile.regions.includes(source.subgroup),
    count: counts.get(source.id) ?? 0
  }));
}

/**
 * タブ（分野）と地域の選択肢。利用者が選んだ分野・地域だけを返す。
 * 地域の並び順はここでは決めない（画面が regionOrder で決める）。そのために、利用者が並べ替えた順（空なら自動）を添える
 */
export function filterChoices(profile: Profile) {
  const pick = <T extends string>(all: readonly T[], chosen: string[]) => (chosen.length ? all.filter(value => chosen.includes(value)) : [...all]);
  return { ...listFilterOptions(), categories: pick(CATEGORIES, profile.categories), regions: pick(SUBGROUPS, profile.regions), regionOrder: profile.regionOrder };
}

/** 初回の質問の選択肢: 地域・分野ごとの情報源数と、直近30日の記事数 */
export function onboardingOptions(ctx: ApiContext) {
  return {
    // 候補は既定ではオフなので、数に含めない
    regions: SUBGROUPS.map(region => ({ value: region, sources: ctx.sources.filter(source => source.subgroup === region && !source.candidate).length })),
    categories: CATEGORIES.map(category => ({ value: category, articles: ctx.items.filter(item => item.categories.includes(category)).length })),
    // 初回の質問で選べるテーマ（マイニュースの関心トピックになる）
    topics: STARTER_TOPIC_IDS.flatMap((id) => {
      const topic = DEFAULT_PROFILE.topics.find(candidate => candidate.id === id);
      return topic ? [{ value: topic.id, label: topic.label }] : [];
    })
  };
}

export { listCategoryGroups };

/** 記事詳細のうち、記事自身・同じ話題の記事・保存済みの要約（本文の抜粋は発信元ページの取得が必要なため、呼び出し側で添える） */
export function newsDetail(ctx: ApiContext, id: string) {
  const item = ctx.items.find(candidate => candidate.id === id);
  if (!item) return undefined;
  const related = ctx.hasVectors ? findRelated(item, visibleNews(ctx, true), buildStoryIndex(ctx.items)) : [];
  return { item, related, summary: (item.titleOnly ? undefined : ctx.summaries.get(item.id)) ?? null };
}
