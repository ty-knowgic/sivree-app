import { datelineRegion } from './dateline.js';
import { classify, officialFeeds } from './newsPipeline.js';
import { DEFAULT_PROFILE } from './profile.js';
import { CATEGORIES, SUBGROUPS } from './types.js';
import type { CategoryKey, FeedSource, SubgroupKey } from './types.js';

/**
 * 取りこぼしの監査: 公開データ（news.json・sources.json・meta.json）だけを読み、分類と地域の取りこぼしの候補を、影響の大きい順に並べる。
 * 利用者の設定・閲覧・保存した記事は読まない（それらは端末の外に出ない）。報告するだけで、規則もフィードも変えない。
 * 「コード側で解消済み」は、いまの分類規則・日付行の判定で分類し直すと解消する記事（次の公開で反映される）。
 */

export interface PublishedItem {
  id: string;
  title: string;
  summary: string;
  publishedAt: string;
  sourceName: string;
  sourceUrl: string;
  feedUrl: string;
  sourceType: string;
  subgroup: string;
  categories: string[];
}

export interface PublishedSource {
  feedUrl: string;
  label: string;
  sourceName: string;
  candidate?: boolean;
  health?: { ok: boolean; error?: string } | null;
}

export interface Snapshot {
  meta: { generatedAt: string };
  news: PublishedItem[];
  sources: PublishedSource[];
}

export type Priority = 'P1' | 'P2' | 'P3';
export type GapStatus = 'open' | 'fixed-in-code';

export interface Example {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  subgroup: string;
  categories: string[];
  /** いまのコードで分類し直したときのカテゴリ・地域 */
  current?: { categories: string[]; subgroup: string };
}

export interface Finding {
  priority: Priority;
  code: 'headline-category' | 'cell-empty' | 'cell-collapse' | 'dateline-region' | 'topic-keyword';
  status: GapStatus;
  message: string;
  count: number;
  hint: string;
  examples: Example[];
}

export interface CellCount {
  category: CategoryKey;
  region: SubgroupKey;
  current: number;
  prior: number;
  /** いまのコードで分類し直したときの直近7日の件数 */
  projected: number;
}

export interface CoverageReport {
  generatedAt: string;
  articles: number;
  window: { from: string; to: string };
  findings: Finding[];
  cells: CellCount[];
  /** カテゴリの対応がない既定トピック（監査の対象外であることを記録する） */
  uncheckedTopics: string[];
}

const DAY = 86_400_000;
const MAX_EXAMPLES = 5;

/**
 * 見出しが分野を名指ししているかを確かめる語の一覧。分類規則とは独立に、広めに書く（規則の見落としを見つけるため）。
 * accepts のいずれかのカテゴリが付いていれば取りこぼしではない。企業の発表は「AI 搭載」などの宣伝と区別できないため、corporate を付けた語（基盤モデルの名指し）だけで確かめる。
 */
export const HEADLINE_PROBES: { id: string; label: string; accepts: CategoryKey[]; patterns: RegExp[]; corporate?: boolean }[] = [
  { id: 'genai-corporate', label: '生成AI（企業）', accepts: ['生成AI'], corporate: true, patterns: [/生成AI|\bLLMs?\b/, /generative AI|large language models?|foundation models?|\b(Cohere|OpenAI|Anthropic|Mistral AI|DeepSeek|ChatGPT)\b/i] },
  { id: 'ai', label: 'AI', accepts: ['生成AI'], patterns: [/\bAI\b|ＡＩ|人工知能|生成AI|\bLLMs?\b/, /artificial intelligence|intelligence artificielle|machine learning|機械学習|deep learning|large language model|generative|\b(Cohere|OpenAI|Anthropic|DeepSeek|ChatGPT)\b/i] },
  { id: 'robotics', label: 'ロボット・自動運転', accepts: ['テクノロジー'], patterns: [/ロボット|ロボティクス|ヒューマノイド|自動運転|ドローン|\b(robot\w*|humanoids?|self-driving|autonomous (vehicles?|driving|systems?)|drones?)\b/i] },
  { id: 'semiconductors', label: '半導体', accepts: ['テクノロジー'], patterns: [/半導体|\b(semiconductors?|chipmakers?|microchips?|foundr(y|ies)|lithography|wafers?)\b/i] },
  { id: 'quantum', label: '量子', accepts: ['テクノロジー', 'サイエンス'], patterns: [/量子|\bquantum\b/i] },
  { id: 'compute', label: '計算基盤', accepts: ['テクノロジー', '生成AI'], patterns: [/データセンター|スーパーコンピュータ|スパコン|\b(data cent(er|re)s?|supercomput\w*|GPUs?|compute capacity)\b/i] },
  { id: 'cyber', label: 'サイバー', accepts: ['安全保障'], patterns: [/サイバー|ランサムウェア|不正アクセス|\b(cyber\w*|ransomware|malware)\b/i] },
  { id: 'defence', label: '防衛', accepts: ['安全保障'], patterns: [/防衛|自衛隊|安全保障|\b(defen[cs]e|military|armed forces|NATO)\b/i] },
  { id: 'trade', label: '貿易', accepts: ['経済', '国際', '投資'], patterns: [/関税|貿易|通商|輸出管理|経済連携|\b(tariffs?|free trade|trade (agreements?|deals?|policy|missions?|negotiations?|talks)|export controls?)\b/i] },
  { id: 'math', label: '数学', accepts: ['サイエンス'], patterns: [/数学|定理|\b(mathemat\w*|theorems?|conjectures?)\b/i] },
  { id: 'funding', label: '投資額', accepts: ['投資'], patterns: [/億円.{0,8}(投資|出資)|資金調達|\b(invest(s|ing|ments?)?|funding)\b.{0,60}(\$|€|£)[\d.,]+ ?(million|billion|M\b|B\b)|(\$|€|£)[\d.,]+ ?(million|billion)\b.{0,60}\b(invest\w*|fund\w*)\b/i] }
];

/** 既定トピックと、その語が入るべきカテゴリ（カテゴリのないトピックは対象外として記録する） */
export const TOPIC_CATEGORY: Record<string, CategoryKey> = {
  genai: '生成AI', 'physical-ai': 'テクノロジー', semiconductors: 'テクノロジー', cybersecurity: '安全保障', defense: '安全保障', math: 'サイエンス'
};

/**
 * 分類規則にあえて入れていないトピックの語（理由つき）。監査はこれらを取りこぼしとして報告しない。
 * 語を足すときは、規則に入れない理由を書く。理由が書けないものは規則に足す。
 */
export const INTENTIONAL_KEYWORD_GAPS: Record<string, string> = {
  Mistral: '風の名前（ミストラル）と重なるため、規則は「Mistral AI」に限る',
  manipulation: '一般語（世論操作・市場操作）。ロボットの文脈は robot 等で拾う',
  embodied: '一般語。規則は「embodied AI」に限る',
  wafer: '食品（ウエハース）と重なる',
  wafers: '食品（ウエハース）と重なる',
  foundry: '鋳造所・出版社名と重なる。半導体の文脈は semiconductor 等で拾う',
  ファウンドリ: '半導体の文脈は「半導体」で拾う',
  lithography: '版画（リトグラフ）と重なる',
  TSMC: '企業名だけでは技術の発表か分からない',
  'CHIPS Act': '法律名。米国の政策記事は「semiconductor」を伴うことが多い',
  chipmaker: '企業の紹介に使われる語で、技術の発表とは限らない',
  qubit: '研究機関の記事は quantum を伴う',
  qubits: '研究機関の記事は quantum を伴う',
  量子技術: '「量子コンピュータ」以外の量子研究はサイエンスのフィードが受け持つ',
  脆弱性: '製品の不具合情報（企業）と重なる。政府の注意喚起は「サイバー」を伴うことが多い',
  vulnerability: '一般語（社会的弱者など）と重なる',
  vulnerabilities: '一般語と重なる',
  'data breach': '企業の事故は「経済」で扱う',
  malware: '政府の注意喚起は cyber を伴うことが多い',
  'zero-day': '政府の注意喚起は cyber を伴うことが多い',
  CISA: '機関名。発表の内容は cyber を伴う',
  phishing: '消費者向けの詐欺の注意喚起（社会）と重なる',
  情報漏えい: '企業の事故は「経済」で扱う',
  国防: '「防衛」「安全保障」で拾う',
  防衛装備: '「防衛」で拾う',
  軍事: '他国の歴史・文化の記事と重なる',
  ceasefire: '外交の記事。国際・政治で扱う',
  peacekeeping: '外交の記事。国際・政治で扱う',
  'arms control': '外交の記事。国際・政治で扱う',
  数学者: '人物紹介。研究の発表は「数学」を伴う',
  アルゴリズム: '一般の IT の記事と重なる',
  algorithm: '一般の IT の記事と重なる',
  algorithms: '一般の IT の記事と重なる',
  量子: '量子の研究はテクノロジー（量子コンピュータ）とサイエンスのフィードが受け持つ',
  quantum: '量子の研究はテクノロジー（量子コンピュータ）とサイエンスのフィードが受け持つ',
  topology: '数学のフィードが受け持つ',
  geometry: '一般語と重なる',
  'number theory': '数学のフィードが受け持つ',
  combinatorics: '数学のフィードが受け持つ',
  'world model': '研究用語で、見出しの語としてはまだ少ない',
  'vision-language-action': '研究用語で、見出しの語としてはまだ少ない'
};

// 分類だけを確かめるための仮の情報源（既定カテゴリを持たないので、規則に一致したカテゴリだけが返る）
function probeSource(sourceType: FeedSource['sourceType']): FeedSource {
  return { sourceType, matchOnly: [...CATEGORIES], subgroup: '米国', sourceName: 'audit', sourceUrl: 'https://example.test/', feedUrl: 'https://example.test/rss', label: 'audit' };
}

// 同じフィードを既定カテゴリ違いで複数の定義が読むことがある（記事は主カテゴリが同じ定義のもの）
function feedFor(item: PublishedItem, feeds: readonly FeedSource[]): FeedSource | undefined {
  const sameUrl = feeds.filter(feed => feed.feedUrl === item.feedUrl);
  const primary = (feed: FeedSource) => feed.categoryByUrl?.find(([pattern]) => pattern.test(item.sourceUrl))?.[1] ?? feed.category;
  return sameUrl.find(feed => primary(feed) === item.categories[0]) ?? sameUrl.find(feed => feed.sourceName === item.sourceName) ?? sameUrl[0];
}

/** いまのコードで分類し直す（公開データの説明文は短縮済みのため、取得時の説明文で分類したものと一致しないことがある） */
export function reclassify(item: PublishedItem, feeds: readonly FeedSource[] = officialFeeds): { categories: string[]; subgroup: string } | undefined {
  const feed = feedFor(item, feeds);
  if (!feed) return undefined;
  const categories = classify(feed, item.title, item.summary, item.sourceUrl);
  const subgroup = feed.datelineRegion ? datelineRegion(item.summary) ?? item.subgroup : item.subgroup;
  return { categories, subgroup };
}

function example(item: PublishedItem, current?: { categories: string[]; subgroup: string }): Example {
  return { title: item.title, source: item.sourceName, publishedAt: item.publishedAt, url: item.sourceUrl, subgroup: item.subgroup, categories: item.categories, ...(current ? { current } : {}) };
}

const newestFirst = (a: PublishedItem, b: PublishedItem) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt);

// 件数が多い取りこぼしほど、規則の穴である可能性が高い。コード側で解消済みのものは、次の公開の確認だけでよい
function priorityFor(count: number, status: GapStatus): Priority {
  if (status === 'fixed-in-code') return 'P3';
  return count >= 10 ? 'P1' : count >= 3 ? 'P2' : 'P3';
}

/** 1. 政府・研究機関・団体の見出しが分野を名指ししているのに、そのカテゴリが付いていない記事（分野と発信元ごとにまとめる） */
export function headlineGaps(items: PublishedItem[], feeds: readonly FeedSource[] = officialFeeds): Finding[] {
  const groups = new Map<string, { probe: (typeof HEADLINE_PROBES)[number]; source: string; status: GapStatus; items: PublishedItem[]; current: Map<string, ReturnType<typeof reclassify>> }>();
  for (const item of items) {
    for (const probe of HEADLINE_PROBES) {
      if (Boolean(probe.corporate) !== (item.sourceType === 'corporate')) continue;
      if (!probe.patterns.some(pattern => pattern.test(item.title))) continue;
      if (probe.accepts.some(category => item.categories.includes(category))) continue;
      const current = reclassify(item, feeds);
      const status: GapStatus = current && probe.accepts.some(category => current.categories.includes(category)) ? 'fixed-in-code' : 'open';
      const key = `${probe.id}\0${item.sourceName}\0${status}`;
      const group = groups.get(key) ?? { probe, source: item.sourceName, status, items: [] as PublishedItem[], current: new Map() };
      group.items.push(item);
      group.current.set(item.id, current);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map(({ probe, source, status, items: matched, current }) => ({
    priority: priorityFor(matched.length, status),
    code: 'headline-category' as const,
    status,
    message: `${source}: 見出しが「${probe.label}」を含むのに ${probe.accepts.join('・')} が付いていない記事 ${matched.length}件`,
    count: matched.length,
    hint: status === 'fixed-in-code'
      ? 'いまの分類規則では付く。次の公開（蓄積記事の分類し直し）で反映されることを確かめる'
      : `CATEGORY_RULES（src/newsPipeline.ts）の ${probe.accepts[0]} の規則か、このフィードの category / categoryByUrl を見直す`,
    examples: examples(matched, item => current.get(item.id))
  }));
}

// 同じ発表が複数のフィードに載ることがあるため、見出しと発信元が同じ例は一つにする
function examples(items: PublishedItem[], current: (item: PublishedItem) => { categories: string[]; subgroup: string } | undefined = () => undefined, limit = MAX_EXAMPLES): Example[] {
  const seen = new Set<string>();
  return items.sort(newestFirst).filter(item => {
    const key = `${item.sourceName}\0${item.title}`;
    return !seen.has(key) && Boolean(seen.add(key));
  }).slice(0, limit).map(item => example(item, current(item)));
}

/** 2. カテゴリ×地域の件数（既定でオンの情報源だけ。候補は既定では見えないため）。直近7日と、その前の7日を比べる */
export function cellCounts(snapshot: Snapshot, feeds: readonly FeedSource[] = officialFeeds): { cells: CellCount[]; window: { from: number; to: number } } {
  const to = Date.parse(snapshot.meta.generatedAt);
  const from = to - 7 * DAY;
  const defaultFeeds = new Set(snapshot.sources.filter(source => !source.candidate).map(source => source.feedUrl));
  const visible = snapshot.news.filter(item => defaultFeeds.has(item.feedUrl));
  const cells = new Map<string, CellCount>();
  for (const category of CATEGORIES) for (const region of SUBGROUPS) cells.set(`${category}\0${region}`, { category, region, current: 0, prior: 0, projected: 0 });
  for (const item of visible) {
    const time = Date.parse(item.publishedAt);
    if (!(time <= to && time > to - 14 * DAY)) continue;
    const bucket = time > from ? 'current' : 'prior';
    for (const category of item.categories) {
      const cell = cells.get(`${category}\0${item.subgroup}`);
      if (cell) cell[bucket]++;
    }
    if (bucket === 'current') {
      const current = reclassify(item, feeds) ?? item;
      for (const category of current.categories) {
        const cell = cells.get(`${category}\0${current.subgroup}`);
        if (cell) cell.projected++;
      }
    }
  }
  return { cells: [...cells.values()], window: { from, to } };
}

export function cellGaps(snapshot: Snapshot, cells: CellCount[], window: { from: number; to: number }, headline: Finding[]): Finding[] {
  const findings: Finding[] = [];
  const total = (pick: (cell: CellCount) => boolean) => cells.filter(pick).reduce((sum, cell) => sum + cell.current + cell.prior, 0);
  for (const cell of cells) {
    const label = `${cell.category}×${cell.region}`;
    // その地域から記事が来ていて、そのカテゴリも他の地域では動いているのに、この組み合わせだけが空のもの
    const regionTotal = total(other => other.region === cell.region);
    const categoryTotal = total(other => other.category === cell.category && other.region !== cell.region);
    if (cell.current === 0 && cell.prior <= 1 && regionTotal >= 30 && categoryTotal >= 20) {
      // 見出しの取りこぼし（1.）のうち、この地域・カテゴリのもの
      const nearMiss = headline.flatMap(finding => finding.examples).filter(item => item.subgroup === cell.region && Date.parse(item.publishedAt) > window.from - 7 * DAY && (item.current?.categories.includes(cell.category) || HEADLINE_PROBES.some(probe => probe.accepts[0] === cell.category && probe.patterns.some(pattern => pattern.test(item.title)))));
      const status: GapStatus = cell.projected > 0 ? 'fixed-in-code' : 'open';
      // 見出しの取りこぼしがない空の組み合わせは、情報源の範囲の問題（追加は利用者の承認が必要）なので低くする
      findings.push({
        priority: status === 'open' && nearMiss.length ? 'P1' : 'P3',
        code: 'cell-empty', status,
        message: `${label}: 直近7日 ${cell.current}件・前の7日 ${cell.prior}件（いまのコードで分類し直すと ${cell.projected}件）`,
        count: nearMiss.length,
        hint: nearMiss.length ? '見出しは分野を名指ししている。分類規則か地域の判定を見直す' : 'この地域にこの分野の一次情報源があるか（候補・未登録）を調べる。追加は利用者の承認が必要',
        examples: nearMiss.slice(0, MAX_EXAMPLES)
      });
    } else if (cell.prior >= 6 && cell.current <= cell.prior * 0.25) {
      const lost = snapshot.news.filter(item => item.subgroup === cell.region && item.categories.includes(cell.category) && Date.parse(item.publishedAt) <= window.from && Date.parse(item.publishedAt) > window.from - 7 * DAY);
      const bySource = new Map<string, number>();
      for (const item of lost) bySource.set(item.sourceName, (bySource.get(item.sourceName) ?? 0) + 1);
      // 前の週に記事を出していた情報源のうち、いま取得に失敗しているもの
      const failing = [...new Set(snapshot.sources.filter(source => bySource.has(source.sourceName) && source.health?.ok === false).map(source => `${source.sourceName} ${source.health?.error ?? ''}`.trim()))];
      findings.push({
        priority: cell.current === 0 ? 'P1' : 'P2',
        code: 'cell-collapse', status: 'open',
        message: `${label}: 前の7日 ${cell.prior}件 → 直近7日 ${cell.current}件（前の週の主な発信元: ${[...bySource].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => `${name} ${count}`).join('・')}）${failing.length ? `。取得失敗: ${failing.join('・')}` : ''}`,
        count: cell.prior - cell.current,
        hint: failing.length
          ? '取得に失敗している情報源がある。403 や robots.txt の拒否は回避しない（docs/source-health-investigation.md）。代わりの一次情報源の追加は利用者の承認が必要'
          : '発信元の取得失敗（sources.json の health）・フィードの形式変更・分類規則の変更を順に確かめる。発表が少ない週である可能性もある',
        examples: examples(lost, undefined, 3)
      });
    }
  }
  return findings;
}

// 日付行が読めない（説明文の短縮で消えた）配信サービスの発表で、本文が名指しする地域。欧州は米国企業の進出の発表と区別できないため見ない
const REGION_MENTIONS: [SubgroupKey, RegExp][] = [
  ['カナダ', /\b(Canada|Canadian|Toronto|Montr[eé]al|Vancouver|Calgary|Ottawa|Ontario|Qu[eé]bec|Alberta|British Columbia)\b/],
  ['日本', /\b(Japan|Japanese|Tokyo|Osaka)\b|日本/]
];

/**
 * 3. 配信サービスの発表のうち、付いている地域が発表元の地域と違うもの（フィードごとにまとめる）。
 * 説明文の日付行が読めるものはそれで判定し、読めないものは本文が一つの地域だけを名指ししているかで判定する（後者は手がかりにとどまる）。
 */
export function datelineGaps(items: PublishedItem[], feeds: readonly FeedSource[] = officialFeeds): Finding[] {
  const wireFeeds = new Set(items.filter(item => /\/\s*(PRNewswire|CNW)/.test(item.summary)).map(item => item.feedUrl));
  for (const feed of feeds) if (feed.datelineRegion) wireFeeds.add(feed.feedUrl);
  const groups = new Map<string, { feed?: FeedSource; feedUrl: string; source: string; status: GapStatus; byMention: boolean; items: PublishedItem[]; regions: Map<string, number>; found: Map<string, SubgroupKey> }>();
  for (const item of items) {
    if (!wireFeeds.has(item.feedUrl)) continue;
    const dateline = datelineRegion(item.summary);
    const readable = /\/\s*(PRNewswire|CNW)/.test(item.summary);
    const mentioned = REGION_MENTIONS.filter(([, pattern]) => pattern.test(`${item.title} ${item.summary}`)).map(([region]) => region);
    const region = dateline ?? (!readable && mentioned.length === 1 ? mentioned[0] : undefined);
    if (!region || region === item.subgroup) continue;
    const feed = feedFor(item, feeds);
    const status: GapStatus = feed?.datelineRegion ? 'fixed-in-code' : 'open';
    const byMention = !dateline;
    const key = `${item.feedUrl}\0${status}\0${byMention}`;
    const group = groups.get(key) ?? { feed, feedUrl: item.feedUrl, source: item.sourceName, status, byMention, items: [] as PublishedItem[], regions: new Map(), found: new Map() };
    group.items.push(item);
    group.regions.set(region, (group.regions.get(region) ?? 0) + 1);
    group.found.set(item.id, region);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ feed, feedUrl, source, status, byMention, items: matched, regions, found }) => ({
    // 本文の名指しは手がかりにとどまるため、日付行による判定より一段低くする
    priority: byMention && status === 'open' ? (matched.length >= 3 ? 'P2' : 'P3') : priorityFor(matched.length, status),
    code: 'dateline-region' as const,
    status,
    message: byMention
      ? `${feed?.label ?? source}: 日付行が読めず、本文が別の地域を名指しする記事 ${matched.length}件（${[...regions].map(([region, count]) => `${region} ${count}`).join('・')}）`
      : `${feed?.label ?? source}: 日付行の地域と違う地域が付いた記事 ${matched.length}件（日付行: ${[...regions].map(([region, count]) => `${region} ${count}`).join('・')}）`,
    count: matched.length,
    hint: status === 'fixed-in-code'
      ? '取得時の説明文（短縮の前）の日付行で地域を決める設定になっている。次の取得で地域が変わることを確かめる'
      : `このフィード（${feedUrl}）に datelineRegion: true を付けるか確かめる（src/feeds/）`,
    examples: examples(matched, item => ({ categories: item.categories, subgroup: found.get(item.id) ?? item.subgroup }))
  }));
}

/** 4. 既定トピックの語のうち、対応するカテゴリの規則に一致しないもの（政府・研究機関の発表として確かめる） */
export function topicKeywordGaps(topics = DEFAULT_PROFILE.topics): { findings: Finding[]; unchecked: string[] } {
  const findings: Finding[] = [];
  const unchecked: string[] = [];
  for (const topic of topics) {
    const category = TOPIC_CATEGORY[topic.id];
    if (!category) { unchecked.push(topic.label); continue; }
    const missing = topic.keywords.filter(keyword => !(keyword in INTENTIONAL_KEYWORD_GAPS) && !classify(probeSource('official'), keyword, '').includes(category));
    if (!missing.length) continue;
    findings.push({
      priority: missing.length >= 3 ? 'P2' : 'P3',
      code: 'topic-keyword', status: 'open',
      message: `既定トピック「${topic.label}」の語 ${missing.length}件が ${category} の規則に一致しない: ${missing.join('、')}`,
      count: missing.length,
      hint: `${category} の規則（CATEGORY_RULES）に足すか、足さない理由を INTENTIONAL_KEYWORD_GAPS（src/coverageAudit.ts）に書く`,
      examples: []
    });
  }
  return { findings, unchecked };
}

const RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 };

export function coverageAudit(snapshot: Snapshot, feeds: readonly FeedSource[] = officialFeeds): CoverageReport {
  const to = Date.parse(snapshot.meta.generatedAt);
  // 直近30日（公開データの範囲）のうち、収集時刻より先の日付のものは除く（日付の異常は operations が扱う）
  const items = snapshot.news.filter(item => Date.parse(item.publishedAt) <= to + DAY);
  const headline = headlineGaps(items, feeds);
  const { cells, window } = cellCounts(snapshot, feeds);
  const topics = topicKeywordGaps();
  const findings = [...headline, ...cellGaps(snapshot, cells, window, headline), ...datelineGaps(items, feeds), ...topics.findings]
    .sort((a, b) => RANK[a.priority] - RANK[b.priority] || (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1) || b.count - a.count);
  return {
    generatedAt: snapshot.meta.generatedAt,
    articles: snapshot.news.length,
    window: { from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString() },
    findings, cells, uncheckedTopics: topics.unchecked
  };
}
