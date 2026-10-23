import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from 'rss-parser';
import { fetchArticleContent, isGenericImage } from './articleContent.js';
import { readHtmlList } from './htmlList.js';
import { filterNews } from './newsFilters.js';
import { isAllowedByRobots, USER_AGENT } from './robots.js';
import { cleanFeedText, decodeEntities } from './text.js';
import { CATEGORIES, SOURCE_TYPES, SUBGROUPS } from './types.js';
import { officialFeeds } from './feeds/index.js';
import { PACKS } from './feeds/packs.js';
import { defaultOn } from './sourceTier.js';
import type { CategoryKey, FeedSource, NewsFilters, NewsItem } from './types.js';

interface MediaField {
  $?: { url?: string; medium?: string; type?: string };
}

const parser = new Parser<Record<string, unknown>, { mediaContent?: MediaField; mediaThumbnail?: MediaField; language?: string; updatedAt?: string }>({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['dc:language', 'language'],
      // 欧州理事会のように pubDate の代わりに a10:updated を使うフィード
      ['a10:updated', 'updatedAt']
    ]
  }
});

// 取得元には SivreeBot と名乗る（「Mozilla/5.0 (compatible; …)」の形なら、公式サイトの多くが受け付ける）。ブラウザを装わない
// 100 件の取得を同時に始めると定期ジョブの実行環境で通信が詰まり、普段は数秒で返る情報源も時間切れになるため、
// 同時に取得する数を絞り、時間切れや一時的なサーバーの不調は1回だけ取り直す
const FETCH_TIMEOUT_MS = 15000;
const FETCH_ATTEMPTS = 2;
const FETCH_RETRY_DELAY_MS = 1500;
const FEED_CONCURRENCY = 10;
// 取得全体の上限時間。フィードが増えても、定期ジョブが長引いて止まらないように、超えたら残りは今回は取得しない
// （記事は前回の保存分が残る。並びは src/feeds/ の順で、後ろのフィードから見送る）。FEED_DEADLINE_MS で変えられる
const FEED_DEADLINE_MS = Number(process.env.FEED_DEADLINE_MS) > 0 ? Number(process.env.FEED_DEADLINE_MS) : 8 * 60 * 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const ITEMS_PER_FEED = 20;
const ARCHIVE_DAYS = 30;
// 保存する記事の上限。既定の情報源と候補（既定ではオフ）で別々に数え、候補の記事が既定の情報源の記事を押し出さないようにする。
// 候補の上限は、専門職向けの情報源の30日分が収まる程度（記事が増えると、利用者が読み込むベクトルも増えるため）
export const ARCHIVE_LIMIT = 3000;
export const CANDIDATE_ARCHIVE_LIMIT = 1000;
// フィードに画像がない記事のうち、新しい順にこの件数まで記事ページの画像を確認する
const IMAGE_ENRICH_LIMIT = 80;
const IMAGE_ENRICH_CONCURRENCY = 4;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_PATH = path.join(__dirname, '../data/news-archive.json');

// 取得するフィードの一覧は src/feeds/ にある（情報源の追加は、そこにファイルを足す）。他のモジュールとテストが読み込めるよう、ここからも渡す
export { officialFeeds };

// 見出しと説明文に含まれる語だけでカテゴリを追加する（推測による分類はしない）
const CATEGORY_RULES: { category: CategoryKey; pattern: RegExp | RegExp[]; subgroup?: '日本'; corporateOnly?: boolean; nonCorporate?: boolean }[] = [
  {
    // 企業の発表のうち、提携・買収・決算・事業展開・事故や不祥事など企業活動に関するもの
    category: '経済',
    corporateOnly: true,
    pattern: [
      // 日本語（「BtoB」の toB を TOB と誤認しないよう、大文字小文字を区別する）
      new RegExp([
        '業務提携|資本(業務)?提携|買収|合併|経営統合|子会社化|株式(の)?取得|事業(譲渡|承継|売却|再編|撤退)|公開買付|(?<![A-Za-z])TOB(?![A-Za-z])',
        '決算|業績予想|業績(の)?修正|上方修正|下方修正|増収|減収|増益|減益|過去最高|特別損失|新規上場|上場(承認|決定|廃止)|(東証|グロース|プライム|スタンダード)(市場)?への(上場|市場変更)',
        '新工場|工場(を|の)?(新設|建設|稼働|閉鎖)|生産(能力)?(の)?(増強|拡大|開始|停止|終了)|値上げ|価格改定|販売終了|事業終了|サービス終了',
        // 事故・不祥事は、セキュリティ製品の宣伝と区別するため「お知らせ／お詫び／発生」などの報告表現を伴うものに限る
        'リコール|自主回収|製品回収',
        '(不正アクセス|サイバー攻撃|ランサムウェア|情報漏え?い|個人情報.{0,8}(流出|漏え?い)|システム障害|サービス障害|通信障害)[^。]{0,30}(お知らせ|お詫び|おわび|発生|判明|被害を受け)',
        '不適切(な)?会計|行政処分|業務改善命令|代表取締役.{0,6}(就任|異動|交代)|社長交代|新経営体制|役員人事|役員の異動|中期経営計画|海外進出|海外展開|倒産|民事再生|破産'
      ].join('|')),
      // 英語
      new RegExp([
        '\\b(acquires?|acquired|acquisition|to acquire|merger|merges?|takeover|tender offer|financial results|quarterly results|earnings|net income|guidance)\\b',
        '\\b((first|second|third|fourth) quarter|fiscal (year )?\\d{4} results|revenue of|initial public offering|IPO|bankruptcy|chapter 11|restructuring|layoffs?)\\b',
        '\\b(recall|new (plant|factory)|joint venture|divest(s|iture)?|spin-?off)\\b',
        '\\b(notice of|discloses?|experienced|reports?|announces?)\\b.{0,40}\\b(data (security )?(breach|incident)|cyber ?(security )?incident|ransomware attack|service outage)\\b',
        '\\b(names?|appoints?) .{0,40}(CEO|chief executive)\\b'
      ].join('|'), 'i')
    ]
  },
  {
    category: '生成AI',
    pattern: /生成\s?AI|生成ＡＩ|ChatGPT|LLM|大規模言語モデル|基盤モデル|AIエージェント|generative AI|\bGenAI\b|large language model|\bGPT-?\d|\bGemini\b|\bClaude\b|\bAI agents?\b|frontier (AI|model)|foundation models?|生成系AI|対話型AI|エージェンティック|\b(OpenAI|Anthropic|Mistral AI|DeepSeek|Llama ?\d|Copilot|agentic|small language models?|retrieval-augmented)\b/i
  },
  {
    category: '投資',
    pattern: /資金調達|第三者割当増資|シリーズ[A-FＡ-Ｆ](ラウンド)?|シードラウンド|プレシリーズ|ベンチャーキャピタル|スタートアップ(への)?(投資|出資|支援|育成)|出資(を受け|契約|決定)|官民ファンド|国内投資|投資促進|GX投資|対日投資|直接投資|設備投資|投資計画|\braise[sd]? \$|funding round|\bSeries [A-F]\b|seed (round|funding)|venture capital|growth equity|億円(を|の)?(投資|出資|拠出)|\b(invest(s|ing|ment of)?|funding of|commit(s|ting)?|award(s|ing)?) (up to |over |more than |nearly |almost )?(C|US)?\$[\d.,]+ ?(million|billion|M\b|B\b)/i
  },
  {
    // ロボティクス・量子・半導体など（Physical AI を含む）
    category: 'テクノロジー',
    pattern: /ロボット|ロボティクス|ヒューマノイド|フィジカルAI|自動運転|ドローン|量子コンピュータ|半導体|AI半導体|データセンター|\b(robot(s|ics)?|humanoid|physical AI|embodied AI|autonomous (vehicle|driving|mobile robots?)|self-driving|drones?|quantum comput(er|ing)|semiconductors?|AI chips?|GPUs?|data cent(er|re)s?)\b/i
  },
  {
    category: 'サイエンス',
    pattern: /数学|定理|予想の(証明|解決)|\b(mathematic(s|al|ian)|theorem|conjecture|proof of)\b/i
  },
  {
    // 企業の発表は、セキュリティ製品やイベント告知の宣伝と区別できないため対象外
    category: '安全保障',
    nonCorporate: true,
    pattern: /防衛|安全保障|自衛隊|ミサイル|サイバー攻撃|不正アクセス|テロ対策|\b(defen[cs]e|military|armed forces|national security|NATO|missiles?|cyber ?attacks?|cyber ?security|ransomware|counter-?terrorism|nuclear weapons?|sanctions)\b/i
  },
  {
    category: '文化・芸術',
    nonCorporate: true,
    pattern: /文化財|文化芸術|芸術|美術|博物館|美術館|伝統芸能|映画|音楽|文学|(?<![-\w])(arts?|artists?|cultural|culture|museums?|heritage|galler(y|ies)|theatre|theater|literature|jazz|orchestra)(?![-\w])/i
  },
  {
    category: 'イベント',
    nonCorporate: true,
    pattern: /イベント|フェスティバル|展覧会|博覧会|祭り|まつり|シンポジウム|カンファレンス|\b(festivals?|parade|concerts?|celebrat(e|es|ion)|grand (re)?opening|exhibitions?|expo|(?<!press |news )conference|symposium|Oktoberfest|open house|(community|free|family|upcoming|special|public) events?)\b/i
  },
  {
    category: '国際',
    pattern: /首脳|外相|外務大臣|国連|G7|G20|ASEAN|APEC|大使|国際機関|二国間/,
    subgroup: '日本'
  }
];

// 全フィードの取得に失敗し、蓄積データもない場合のみ表示するサンプル記事（実在の発表ではない）
const fallbackArticles: Omit<NewsItem, 'id'>[] = [
  {
    category: '経済',
    categories: ['経済'],
    subgroup: '日本',
    sourceType: 'official',
    title: '日本銀行が政策金利の判断材料を公表',
    summary: '日本銀行は政策金利に関する判断材料を公表した。現時点の枠組みと説明を要点化した。',
    publishedAt: '2026-10-11T09:00:00+09:00',
    sourceName: '日本銀行',
    sourceUrl: 'https://www.boj.or.jp/',
    feedUrl: 'https://www.boj.or.jp/rss/whatsnew.xml',
    hashtags: ['#日本銀行', '#経済', '#日本'],
    keywords: ['日本銀行', '経済', '日本'],
    isSample: true
  },
  {
    category: '政治',
    categories: ['政治'],
    subgroup: '日本',
    sourceType: 'official',
    title: '首相官邸が政府の対応方針を発表',
    summary: '首相官邸は政府の対応方針を発表した。内容は公式発表に基づくもので、追加の見立ては含まない。',
    publishedAt: '2026-10-11T10:30:00+09:00',
    sourceName: '首相官邸',
    sourceUrl: 'https://www.kantei.go.jp/',
    feedUrl: 'https://www.kantei.go.jp/index-jnews.rdf',
    hashtags: ['#首相官邸', '#政治', '#日本'],
    keywords: ['首相官邸', '政治', '日本'],
    isSample: true
  }
];

// 公的機関の発表のうち、ニュース性の低い定型的なお知らせ（入札結果、採用募集など）
const ROUTINE_NOTICE = /入札|落札|発行予定額|国債金利情報|分離状況|現在高推移|(職員|スタッフ|人材|研究員).{0,12}募集|説明会|座談会|オープン・カンパニー|ディスカッション・ペーパー|時系列統計|調達情報|オペレーション（|国庫短期証券|^Weekly Report:|^APOD:|^Weekly schedule/i;
// 自治体の発表のうち、日々の定型的なお知らせ（通行止め、水道管の破損、施設の休業、撮影の告知など）
const LOCAL_ROUTINE_NOTICE = /^(road|trail|sidewalk|lane) closures?\b|road closures report|watermain break|filming notification|holiday hours|closed .{0,40}for maintenance|what['’]s open and closed|committee of adjustment meeting/i;

// 政府の挨拶・記念日の声明（祝日の挨拶など。事実の発表を含まない）
const GREETINGS = /\b(shares?|extends?|sends?|offers?) .{0,40}\b(greetings|wishes)\b|^(statement|message) (by|from) .{0,80}\bon (the )?(occasion of|[A-Z][\w'’-]*( [A-Z][\w'’-]*)* (Day|Week|Month|Festival|Holiday))\b|\bthanksgiving (greetings|message)\b|\bto (hold a |hold )?(press|media) (conference|availability)\b|^media advisory\b|^[^:]{0,80}\bto announce\b|\bto make an? (important |major )?announcement\b/i;

function isRoutine(title: string): boolean {
  return ROUTINE_NOTICE.test(title) || LOCAL_ROUTINE_NOTICE.test(title);
}

// 企業の発表を装った法律事務所の集団訴訟勧誘などは、企業活動の情報ではないため除外する
// ウェビナー・セミナーの告知も、企業活動そのものの情報ではないため除外する
// セール・割引・キャンペーン・プレゼントなど、販売促進の告知も除外する
// 「生成AIが選ぶ◯◯、1位は…（言及率）」のような、AI 検索向けの広告を兼ねた順位調査も除外する
const PROMOTIONAL_NOISE = /class action|shareholder alert|investor alert|securities fraud|reminds? (investors|shareholders)|lead plaintiff|on behalf of (investors|shareholders)|investors? who (lost|purchased)|have opportunity to lead|ウェビナー|オンラインセミナー|セミナー(を|の)?(開催|申込)|\bwebinar\b|(生成AI|AI|ChatGPT)が(選ぶ|推薦する|おすすめする)|言及率|LLMO|AIO対策|AI検索対策|交流会|セール|割引|クーポン|キャンペーン|プレゼント|先着|抽選で|感謝祭|[\d０-９]+\s?[%％]\s?OFF|\b(on sale|sale ends|discount(ed)?|coupon|promo code|giveaway|limited[- ]time offer|pre-?order|\d+% off|weekly investor update)\b|\bsale\b/i;

/** PR TIMES などの説明文に含まれる「[画像: URL]」や、先頭の「[会社名]」を取り除く */
function trimSummary(value: string): string {
  // 一部のフィード（欧州委員会など）は改行を「\n」という文字列のまま配信するため、空白に置き換える
  const normalized = cleanFeedText(value.replace(/<[^>]*>/g, ' ').replace(/\\[nrt]/g, ' ').replace(/\s+/g, ' ').trim());
  if (normalized.length <= 100) {
    return normalized;
  }
  return `${normalized.slice(0, 99).trim()}…`;
}

// フィードによっては文字列ではなく属性付きのオブジェクトとして解析される項目があるため、文字列に揃える
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record._ === 'string') return record._;
    return Object.values(record).map(textOf).join(' ');
  }
  return '';
}

function normalizeTitle(value: string): string {
  return decodeEntities(value).replace(/\s+/g, ' ').trim();
}

function baseCategory(source: FeedSource, link: string): CategoryKey | undefined {
  return source.categoryByUrl?.find(([pattern]) => pattern.test(link))?.[1] ?? source.category;
}

function classify(source: FeedSource, title: string, summary: string, link = ''): CategoryKey[] {
  const text = `${title} ${summary}`;
  const sourceCategory = baseCategory(source, link);
  const matched = CATEGORY_RULES
    .filter(rule =>
      (!rule.subgroup || rule.subgroup === source.subgroup) &&
      (!rule.corporateOnly || source.sourceType === 'corporate') &&
      (!rule.nonCorporate || source.sourceType !== 'corporate') &&
      [rule.pattern].flat().some(pattern => pattern.test(text)))
    .map(rule => rule.category);

  const found = sourceCategory
    ? [...new Set([sourceCategory, ...matched])]
    : matched.filter(category => source.matchOnly?.includes(category));

  // 投資（資金調達など）に該当する記事は経済から分けて扱う
  const categories = found.includes('投資') ? found.filter(category => category !== '経済') : found;
  if (!sourceCategory) {
    return categories.sort((a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b));
  }
  // 並び順を固定し、主カテゴリはフィードの既定カテゴリを優先する
  return categories.sort((a, b) =>
    a === sourceCategory ? -1 : b === sourceCategory ? 1 : CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b)
  );
}

// ハッシュタグは記事に含まれる事実（発信元・カテゴリ・地域）のみから作り、推測した語は加えない
function buildHashtags(sourceName: string, categories: CategoryKey[], subgroup: string): string[] {
  return [...new Set([sourceName, ...categories, subgroup])]
    .map(tag => `#${tag.replace(/\s+/g, '')}`)
    .slice(0, 3);
}

function makeId(key: string): string {
  return createHash('sha1').update(key).digest('hex').slice(0, 16);
}

// http/https や末尾のスラッシュの違いで同じ記事が重複しないよう、URL を正規化して ID に使う
function normalizeUrlForId(value: string): string {
  return value.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
}

function absoluteUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function pickImage(item: Parser.Item & { mediaContent?: MediaField; mediaThumbnail?: MediaField }, base: string) {
  const enclosure = item.enclosure;
  const candidates = [
    enclosure && (enclosure.type?.startsWith('image/') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(enclosure.url))
      ? enclosure.url
      : undefined,
    item.mediaContent?.$?.medium === 'image' || item.mediaContent?.$?.type?.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif)(\?|$)/i.test(item.mediaContent?.$?.url ?? '')
      ? item.mediaContent?.$?.url
      : undefined,
    item.mediaThumbnail?.$?.url
  ];
  return absoluteUrl(candidates.find(Boolean), base);
}

/** 記事の取得元設定（カテゴリ規則など）から、記事の分類関連の項目を組み立てる */
function finalizeItem(entry: Omit<NewsItem, 'id' | 'category' | 'categories' | 'hashtags' | 'keywords'> & { id?: string }, categories: CategoryKey[]): NewsItem {
  return {
    ...entry,
    // 蓄積データから読み込んだ記事は古い ID を持つことがあるため、必ず作り直す
    // 同じ記事が複数のフィード（CBC の地域版と経済版など）に載っても1件にまとめるため、URL と見出しから作る
    id: makeId(`${normalizeUrlForId(entry.sourceUrl)}|${entry.title}`),
    summary: trimSummary(entry.summary),
    category: categories[0],
    categories,
    hashtags: buildHashtags(entry.sourceName, categories, entry.subgroup),
    keywords: [entry.sourceName, ...categories, entry.subgroup]
  };
}

// 総務省のように Shift_JIS で配信されるフィードがあるため、XML 宣言の encoding を見てデコードする
function decodeFeed(buffer: ArrayBuffer, contentType: string | null): string {
  const head = new TextDecoder('ascii').decode(buffer.slice(0, 2048));
  const charset =
    head.slice(0, 200).match(/encoding=["']([\w-]+)["']/i)?.[1] ??
    contentType?.match(/charset=([\w-]+)/i)?.[1] ??
    // 一覧ページ（htmlList）の HTML は、文字コードを meta で示すことが多い（国税庁: Shift_JIS）
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    'utf-8';

  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

/** 読めない形の日付を、読める形に直す。直せないものはそのまま返す */
function repairDate(value: string): string {
  return value.trim()
    // 日付と時刻の間に「JST」が入っている形（青森県: 2026-10-21JST10:55:00+09:00）
    .replace(/^(\d{4}-\d{2}-\d{2})JST(\d{2}:\d{2}(?::\d{2})?)([+-]\d{2}:?\d{2}|Z)?$/, (_match, day: string, time: string, zone?: string) => `${day}T${time}${zone ?? '+09:00'}`)
    // 秒がなく、コロンが残っている形（e-Gov パブリック・コメント: 2026-10-19T15:00:Z）
    .replace(/T(\d{2}):(\d{2}):(Z|[+-]\d{2}:?\d{2})$/, 'T$1:$2:00$3');
}

export function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // 「JST」のようなタイムゾーン名は解釈できないため、時差に置き換える（金融庁など）
  const date = new Date(repairDate(value).replace(/\bJST\b/, '+0900'));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** 記事の公開日時。フィードによって isoDate・pubDate・date・a10:updated のいずれかに入っている */
function itemDate(item: { isoDate?: string; pubDate?: string; updatedAt?: string }): string | undefined {
  return toIsoDate(item.isoDate ?? item.pubDate) ?? toIsoDate((item as { date?: string }).date) ?? toIsoDate(item.updatedAt);
}

/** 情報源ごとの直近の取得結果（設定画面と品質チェックで、取得できていない情報源を見つけるため） */
export interface FeedHealth {
  checkedAt: string;
  ok: boolean;
  /** フィードに載っていた記事数（取り込み対象外のものを含む） */
  entries: number;
  /** 取り込んだ記事数 */
  imported: number;
  /** フィードで最も新しい記事の日時（更新の少ない情報源と、取り込みの不具合を区別するため） */
  newestEntry?: string;
  error?: string;
}

const feedHealth = new Map<string, FeedHealth>();

function recordHealth(source: FeedSource, health: Omit<FeedHealth, 'checkedAt'>): void {
  feedHealth.set(source.feedUrl, { checkedAt: new Date().toISOString(), ...health });
}

/** 時間切れ・通信エラー・5xx だけ取り直す。4xx（403 を含む）は拒否か URL の誤りなので、繰り返さず回避もしない */
async function fetchWithRetry(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      if (response.status < 500 || attempt >= FETCH_ATTEMPTS) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt >= FETCH_ATTEMPTS) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, FETCH_RETRY_DELAY_MS));
  }
}

/** 同時に実行する数を limit までに絞って、items の順に結果を返す */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * フィードを順に取得する。取得全体の上限時間を超えたら、まだ始めていないフィードは今回は取得しない。
 * 見送ったフィードの記事は前回の保存分から残り、取得の状態（FeedHealth）も前回のまま変えない
 */
export async function fetchFeedsWithin(
  feeds: FeedSource[],
  options: { concurrency?: number; deadlineMs?: number; fetcher?: (feed: FeedSource) => Promise<NewsItem[]>; now?: () => number } = {}
): Promise<{ results: NewsItem[][]; skipped: FeedSource[] }> {
  const { concurrency = FEED_CONCURRENCY, deadlineMs = FEED_DEADLINE_MS, fetcher = fetchFeed, now = Date.now } = options;
  const started = now();
  const skipped: FeedSource[] = [];
  const results = await mapWithConcurrency(feeds, concurrency, async (feed) => {
    if (now() - started > deadlineMs) {
      skipped.push(feed);
      return [];
    }
    return fetcher(feed);
  });
  if (skipped.length) {
    console.warn(`[feed] 取得の上限時間（${Math.round(deadlineMs / 1000)}秒）を超えたため、${skipped.length} 件のフィードは今回は取得しませんでした: ${skipped.map(feed => feed.sourceName).join('、')}`);
  }
  return { results, skipped };
}

async function parseFeedText(text: string) {
  // サイト停止のお知らせなどが 200 の HTML で返ることがある。XML の解析エラーではなく、原因が分かる形で記録する
  if (/^\s*(<!doctype html|<html)/i.test(text)) throw new Error('HTML page returned instead of a feed (site may be down)');
  const xml = text
    // Atom の type="xhtml" の要素（カナダ統計局など）は中身が XHTML のため、タグを除いたテキストにしてから解析する
    .replace(/<(title|summary|content|subtitle)([^>]*\btype=["']xhtml["'][^>]*)>([\s\S]*?)<\/\1>/g,
      (_match, tag: string, _attrs: string, inner: string) => `<${tag}>${inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}</${tag}>`);
  return parser.parseString(xml);
}

export async function fetchFeed(source: FeedSource): Promise<NewsItem[]> {
  try {
    // 記事ページと同じく、フィードも robots.txt に従う（禁止されている、または robots.txt を確認できないときは取得しない）
    if (!(await isAllowedByRobots(source.feedUrl))) {
      console.warn(`[feed] ${source.sourceName}: robots.txt が許可しない、または確認できないため取得しません`);
      recordHealth(source, { ok: false, entries: 0, imported: 0, error: 'robots.txt: disallowed or unavailable' });
      return [];
    }
    const response = await fetchWithRetry(source.feedUrl);
    if (!response.ok) {
      console.warn(`[feed] ${source.sourceName}: HTTP ${response.status}`);
      recordHealth(source, { ok: false, entries: 0, imported: 0, error: `HTTP ${response.status}` });
      return [];
    }

    const text = decodeFeed(await response.arrayBuffer(), response.headers.get('content-type'));
    // RSS のない一覧ページ（会計検査院など）は、ページから見出し・日付・リンクを読み、フィードの記事と同じ形にする
    const parsed: Pick<Awaited<ReturnType<typeof parseFeedText>>, 'items'> = source.htmlList ? { items: readHtmlList(text, source, response.url || source.feedUrl) } : await parseFeedText(text);
    const items: NewsItem[] = [];

    // フィードによっては新しい順に並んでいないため、日付順に並べ替えてから取り込む
    const sorted = [...(parsed.items ?? [])].sort(
      (a, b) => (Date.parse(itemDate(b) ?? '') || 0) - (Date.parse(itemDate(a) ?? '') || 0)
    );

    for (const item of sorted) {
      if (items.length >= (source.maxItems ?? ITEMS_PER_FEED)) break;

      const title = normalizeTitle(textOf(item.title));
      const link = absoluteUrl(item.link, source.sourceUrl);
      const publishedAt = itemDate(item);
      if (!title || !link || !publishedAt) continue;

      // 翻訳版など対象外の言語の記事は取り込まない
      const language = typeof item.language === 'string' ? item.language.toLowerCase() : '';
      if (source.languages && language && !source.languages.some(code => language.startsWith(code))) continue;

      const rawDescription = textOf(item.contentSnippet ?? item.content ?? item.summary);
      const haystack = `${title} ${rawDescription}`;
      if (source.include && !source.include.test(haystack)) continue;
      if (source.exclude?.test(haystack)) continue;
      const description = trimSummary(source.summaryPrefix ? rawDescription.replace(source.summaryPrefix, '') : rawDescription);
      if (source.excludeRoutine && isRoutine(title)) continue;
      if (source.sourceType === 'official' && GREETINGS.test(title)) continue;
      if (source.sourceType === 'corporate' && PROMOTIONAL_NOISE.test(`${title} ${description}`)) continue;

      const categories = classify(source, title, description, link);
      if (categories.length === 0) continue;

      items.push(finalizeItem({
        subgroup: source.subgroup,
        sourceType: source.sourceType,
        title,
        // 説明文が見出しと同じ場合は重複表示を避けるため空にする
        summary: description === title ? '' : description,
        publishedAt,
        sourceName: source.sourceName,
        sourceUrl: link,
        feedUrl: source.feedUrl,
        imageUrl: pickImage(item, link)
      }, categories));
    }

    const newest = sorted.map(itemDate).find(Boolean);
    recordHealth(source, { ok: true, entries: parsed.items?.length ?? 0, imported: items.length, newestEntry: newest });
    return items;
  } catch (error) {
    console.warn(`[feed] ${source.sourceName}: ${(error as Error).message}`);
    recordHealth(source, { ok: false, entries: 0, imported: 0, error: (error as Error).message.slice(0, 120) });
    return [];
  }
}

// 取得済みの記事をディスクに蓄積し、件数の少ないキーワード抽出カテゴリでも一定期間分を表示できるようにする
let archive: Map<string, NewsItem> | null = null;

async function loadArchive(): Promise<Map<string, NewsItem>> {
  if (archive) return archive;
  archive = new Map();

  try {
    const stored = JSON.parse(await readFile(ARCHIVE_PATH, 'utf8')) as NewsItem[];
    const feedsByUrl = new Map(officialFeeds.map(feed => [feed.feedUrl, feed]));

    for (const item of stored) {
      // フィード設定や分類規則が変わっても反映されるよう、現在の設定で分類し直す
      const source = feedsByUrl.get(item.feedUrl);
      if (!source) continue;
      if (source.excludeRoutine && isRoutine(item.title)) continue;
      if (source.sourceType === 'official' && GREETINGS.test(item.title)) continue;
      if (source.sourceType === 'corporate' && PROMOTIONAL_NOISE.test(`${item.title} ${item.summary}`)) continue;
      const categories = classify(source, item.title, item.summary, item.sourceUrl);
      if (categories.length === 0) continue;
      const refreshed = finalizeItem({ ...item, title: normalizeTitle(item.title), summary: cleanFeedText(item.summary), subgroup: source.subgroup, sourceName: source.sourceName, sourceType: source.sourceType }, categories);
      archive.set(refreshed.id, refreshed);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[archive] 読み込みに失敗しました: ${(error as Error).message}`);
    }
  }

  return archive;
}

// 発信元が見出しを直したり（末尾の「。」「*」、表記ゆれ、UPDATE: の付与）、同じ記事を複数のフィードに載せたりすると、
// ID（URL＋見出し）が変わって同じ記事が並ぶ。同じ発信元・同じページ・同じ公開時刻のものは1件にまとめる。
// 一覧ページを共有する発信元（デジタル庁の調達情報など）は別の記事なので、見出しが4種類以上ぶら下がる URL とトップページは対象外にする。
// 先に見つかった方（蓄積済みの方）を残すので、更新のたびに表示が入れ替わらない
const LISTING_URL_TITLES = 4;

export function dedupeSameDocument(items: NewsItem[]): NewsItem[] {
  const pageKey = (item: NewsItem) => `${item.sourceName}|${normalizeUrlForId(item.sourceUrl)}`;
  const titlesByPage = new Map<string, Set<string>>();
  for (const item of items) {
    const titles = titlesByPage.get(pageKey(item)) ?? new Set<string>();
    titlesByPage.set(pageKey(item), titles.add(item.title));
  }
  const isListingPage = (item: NewsItem) => {
    try {
      if (new URL(item.sourceUrl).pathname.replace(/\/+$/, '') === '') return true;
    } catch {
      return true;
    }
    return (titlesByPage.get(pageKey(item))?.size ?? 0) >= LISTING_URL_TITLES;
  };

  const kept = new Map<string, NewsItem>();
  for (const item of items) {
    const key = isListingPage(item) ? item.id : `${pageKey(item)}|${item.publishedAt}`;
    const first = kept.get(key);
    if (!first) {
      kept.set(key, item);
      continue;
    }
    const merged = mergeCategories(first, item);
    kept.set(key, first.summary || !item.summary ? merged : { ...merged, summary: item.summary });
  }
  return [...kept.values()];
}

// 利用条件が商用での利用・再配布を制限している発信元（SOURCE_TERMS.md の B1）は、見出しと原文へのリンクだけを表示する。
// フィードの説明文と画像は持たない（蓄積済みの記事からも取り除く）。要約の作成・埋め込みにも説明文は使わない
export function applyTitleOnly(items: NewsItem[]): NewsItem[] {
  // 一覧ページから読む情報源（htmlList）も、見出しと原文へのリンクだけ（記事ページを取得しないため、画像も確認済み扱い）
  const feeds = new Set(officialFeeds.filter(feed => feed.titleOnly || feed.htmlList).map(feed => feed.feedUrl));
  return items.map(item => feeds.has(item.feedUrl)
    ? { ...item, summary: '', imageUrl: undefined, imageChecked: true, titleOnly: true }
    : item);
}

// maxItems を設定したフィード（日本銀行・財務省など）は、蓄積分も含めて1日あたりの件数を制限する
function limitPerFeedPerDay(items: NewsItem[]): NewsItem[] {
  const limits = new Map(officialFeeds.filter(feed => feed.maxItems).map(feed => [feed.feedUrl, feed.maxItems!]));
  const counts = new Map<string, number>();
  return items.filter((item) => {
    const limit = limits.get(item.feedUrl);
    if (!limit) return true;
    const key = `${item.feedUrl}|${item.publishedAt.slice(0, 10)}`;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return count <= limit;
  });
}

function mergeCategories(first: NewsItem, second: NewsItem): NewsItem {
  const categories = [...new Set([...first.categories, ...second.categories])];
  const merged = categories.includes('投資') ? categories.filter(category => category !== '経済') : categories;
  return finalizeItem({ ...first, imageUrl: first.imageUrl ?? second.imageUrl }, merged);
}

function sortByDate(items: NewsItem[]): NewsItem[] {
  return items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

/** 情報源の ID（フィードの URL から作る。設定でどの情報源を使うかの保存に使う） */
export function sourceId(feedUrl: string): string {
  return createHash('sha1').update(feedUrl).digest('hex').slice(0, 10);
}

/** 設定画面用の情報源の一覧 */
export function listSources() {
  return officialFeeds.map(feed => ({
    id: sourceId(feed.feedUrl),
    sourceType: feed.sourceType,
    sourceName: feed.sourceName,
    label: feed.label,
    subgroup: feed.subgroup,
    categories: feed.category ? [feed.category] : (feed.matchOnly ?? []),
    sourceUrl: feed.sourceUrl,
    feedUrl: feed.feedUrl,
    // 既定ではオフの候補（利用者が設定でオンにしたものだけ表示する）
    candidate: !defaultOn(feed),
    // 専門パック（正式版では有償）。設定の「候補」で、パックごとに名前と説明をつけてまとめる
    pack: feed.pack && PACKS[feed.pack] ? { id: feed.pack, ...PACKS[feed.pack] } : undefined,
    health: feedHealth.get(feed.feedUrl) ?? null
  }));
}

// どの情報源を取り込むか（利用者が全員オフにした情報源は取得も保存もしない）
let shouldCollect: (id: string) => boolean = () => true;

export function setCollectionFilter(filter: (id: string) => boolean): void {
  shouldCollect = filter;
}

/** 情報源の設定が変わったときに、次の一覧の表示で取り込み直す */
export function invalidateNewsCache(): void {
  cache = null;
}

async function collectNews(): Promise<NewsItem[]> {
  const store = await loadArchive();
  const { results: feedResults } = await fetchFeedsWithin(officialFeeds.filter(feed => shouldCollect(sourceId(feed.feedUrl))));

  // 同じ記事が複数のフィード（PR Newswire の決算・M&A など）に載る場合は、カテゴリを統合する
  const fetched = new Map<string, NewsItem>();
  for (const item of feedResults.flat()) {
    const duplicate = fetched.get(item.id);
    fetched.set(item.id, duplicate ? mergeCategories(duplicate, item) : item);
  }

  for (const item of fetched.values()) {
    // 再取得した記事でも、記事ページから取得済みの画像は引き継ぐ
    const existing = store.get(item.id);
    store.set(item.id, existing
      ? { ...item, imageUrl: item.imageUrl ?? existing.imageUrl, imageChecked: existing.imageChecked }
      : item);
  }

  const kept = applyTitleOnly(trimArchive([...store.values()]));

  store.clear();
  kept.forEach(item => store.set(item.id, item));
  dropSharedImages(kept);

  if (kept.length === 0) {
    return fallbackArticles.map(entry => ({ ...entry, id: makeId(`sample|${entry.title}`) }));
  }

  await saveArchive(kept);
  imageEnrichment = enrichImages(kept);
  return kept;
}

/**
 * 保存する記事を決める: 新しい順に並べ、同じ記事をまとめ、30日より古いもの・いまのフィード一覧にない情報源
 * （取得をやめたもの、URL を替えたもの）・利用者が全員オフにした情報源の記事を外す。
 * 件数の上限は、既定の情報源（ARCHIVE_LIMIT）と候補（CANDIDATE_ARCHIVE_LIMIT）で別々に数える
 */
export function trimArchive(items: NewsItem[], now = Date.now()): NewsItem[] {
  const cutoff = now - ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
  const currentFeedUrls = new Set(officialFeeds.map(feed => feed.feedUrl));
  const defaultFeedUrls = new Set(officialFeeds.filter(defaultOn).map(feed => feed.feedUrl));
  let defaults = 0;
  let candidates = 0;
  return limitPerFeedPerDay(dedupeSameDocument(sortByDate([...items])))
    .filter(item => currentFeedUrls.has(item.feedUrl) && new Date(item.publishedAt).getTime() >= cutoff && shouldCollect(sourceId(item.feedUrl)))
    .filter(item => (defaultFeedUrls.has(item.feedUrl) ? defaults++ < ARCHIVE_LIMIT : candidates++ < CANDIDATE_ARCHIVE_LIMIT));
}

async function saveArchive(items: NewsItem[]): Promise<void> {
  try {
    await mkdir(path.dirname(ARCHIVE_PATH), { recursive: true });
    await writeFile(ARCHIVE_PATH, JSON.stringify(items));
  } catch (error) {
    console.warn(`[archive] 保存に失敗しました: ${(error as Error).message}`);
  }
}

// 3件以上の記事で同じ画像が使われている場合は、サイト共通の既定画像とみなして表示しない
function dropSharedImages(items: NewsItem[]): void {
  const counts = new Map<string, number>();
  items.forEach(item => item.imageUrl && counts.set(item.imageUrl, (counts.get(item.imageUrl) ?? 0) + 1));
  items.forEach((item) => {
    if (item.imageUrl && ((counts.get(item.imageUrl) ?? 0) >= 3 || isGenericImage(item.imageUrl))) {
      item.imageUrl = undefined;
    }
  });
}

let enriching = false;
let imageEnrichment: Promise<void> = Promise.resolve();

/** 裏で進めている記事画像の取得が終わるまで待つ（定期ジョブの書き出し前に使う） */
export function waitForImageEnrichment(): Promise<void> {
  return imageEnrichment;
}

// 多くの公式フィードは画像を含まないため、記事ページの og:image を裏で取得して一覧のサムネイルに使う。
// 一覧の応答は待たせず、取得できた画像は次回以降の一覧に反映される
async function enrichImages(items: NewsItem[]): Promise<void> {
  if (enriching) return;
  enriching = true;

  try {
    const queue = items.filter(item => !item.imageUrl && !item.imageChecked && !item.isSample).slice(0, IMAGE_ENRICH_LIMIT);
    if (!queue.length) return;

    const workers = Array.from({ length: IMAGE_ENRICH_CONCURRENCY }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const content = await fetchArticleContent(item.sourceUrl);
        // 通信エラーなど一時的な失敗は、次回の更新で再確認する
        if (content.status === 'unavailable' && content.reason && !content.reason.startsWith('HTTP')) continue;
        if (content.imageUrl && !isGenericImage(content.imageUrl)) {
          item.imageUrl = content.imageUrl;
        }
        item.imageChecked = true;
      }
    });
    await Promise.all(workers);
    dropSharedImages(items);
    await saveArchive(items);
  } catch (error) {
    console.warn(`[image] 画像の取得に失敗しました: ${(error as Error).message}`);
  } finally {
    enriching = false;
  }
}

let cache: { items: NewsItem[]; fetchedAt: number } | null = null;
let inFlight: Promise<NewsItem[]> | null = null;

export async function loadNews(): Promise<NewsItem[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.items;
  }

  // 同時に来たリクエストで同じフィードを重複取得しない
  inFlight ??= collectNews()
    .then((items) => {
      // サンプル記事しか得られなかった場合はキャッシュせず、次回再取得する
      if (!items.every(item => item.isSample)) {
        cache = { items, fetchedAt: Date.now() };
      }
      return items;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export async function getNews(filters: NewsFilters = {}) {
  return filterNews(await loadNews(), filters, sourceId);
}

export async function getNewsById(id: string): Promise<NewsItem | undefined> {
  const items = await loadNews();
  return items.find(item => item.id === id);
}
