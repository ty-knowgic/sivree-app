export const CATEGORIES = ['政治', '経済', '投資', '安全保障', '国際', '社会', 'テクノロジー', '生成AI', 'サイエンス', '文化・芸術', 'イベント'] as const;
/** 地域（発信元の所在地）。グローバルは国際機関や、複数国の発表を配信する通信社など */
export const SUBGROUPS = ['日本', 'カナダ', '米国', '欧州', 'グローバル'] as const;

export type CategoryKey = (typeof CATEGORIES)[number];
export type SubgroupKey = (typeof SUBGROUPS)[number];

/**
 * 公的機関 / 企業 / 研究機関 / 団体・NPO。一次情報（発信者自身の発表）だけを集めるため、報道機関は扱わない
 * （PR TIMES などのプレスリリース配信は、企業の発表をそのまま載せるため「企業」とする）
 */
export const SOURCE_TYPES = ['official', 'corporate', 'research', 'npo'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * 公的機関の階層。international は国際機関と EU の機関、national は中央政府、
 * regional は州・県・準州の政府（ISO 3166-2 の第1階層）、local は市区町村
 */
export const SOURCE_LEVELS = ['international', 'national', 'regional', 'local'] as const;
export type SourceLevel = (typeof SOURCE_LEVELS)[number];

/** 利用条件の区分（SOURCE_TERMS.md）。A=再利用が明示、B1=商用を制限、B2=引用の範囲、C=読み取れない、D=取得できない */
export const TERMS_CLASSES = ['A', 'B1', 'B2', 'C', 'D'] as const;
export type TermsClass = (typeof TERMS_CLASSES)[number];

export interface FeedSource {
  /** Fixed publication stream, not a claim about legal effect or effective date. */
  documentKind?: string;
  /** IRS index needs official issue masthead dates; no article text is retained. */
  bulletinIndex?: boolean;
  sourceType: SourceType;
  /** フィードの既定カテゴリ。省略した場合はキーワード規則に一致した記事だけを取り込む */
  category?: CategoryKey;
  /** category を省略したフィードで、取り込み対象とするカテゴリ */
  matchOnly?: CategoryKey[];
  subgroup: SubgroupKey;
  sourceName: string;
  sourceUrl: string;
  feedUrl: string;
  label: string;
  /** 1回の取得で取り込む最大件数（発表量が多い公的機関の比重を抑えるため） */
  maxItems?: number;
  /** 入札結果・採用募集など定型的なお知らせを除外する */
  excludeRoutine?: boolean;
  /** フィードが言語情報を持つ場合、取り込む言語（例: ['en', 'ja']） */
  languages?: string[];
  /** 記事の URL からカテゴリを決める規則（カナダ政府の全省庁フィードのように、記事ごとに担当省庁が異なる場合） */
  categoryByUrl?: [RegExp, CategoryKey][];
  /** 発信元の利用条件が商用での利用・再配布を制限している場合（SOURCE_TERMS.md の B1）。見出しと原文へのリンクだけを表示し、説明文・要約・画像は出さない */
  titleOnly?: boolean;
  /** 公的機関の階層。sourceType が official のときは必須。企業・研究機関・団体は national と同じに扱う */
  level?: SourceLevel;
  /** 管轄の ISO 3166-2 コード（例 'JP-13'、'CA-ON'）。level が regional または local のとき必須 */
  area?: string;
  /** 市の識別子（例 'toronto'）。area の中で一意。level が local のとき必須 */
  city?: string;
  /** 専門パックの ID。付いた情報源は有償のパックに属する。パックに入れるのは、利用条件が A の情報源だけ */
  pack?: string;
  /** 追加した日（YYYY-MM-DD）。凍結（2026-10-20）より後に足した、または候補へ移した情報源にだけ付ける。付いた情報源は、既定ではオフの候補になる */
  since?: string;
  /** 利用条件の区分。B1 は titleOnly が必須、pack を持つ情報源は A が必須 */
  terms?: TermsClass;
  /** 見出しと説明文（短縮の前）がこの条件に合う記事だけを取り込む。フィード側で絞り込めないときに使う（arXiv の RSS など） */
  include?: RegExp;
  /** 見出しと説明文（短縮の前）がこの条件に合う記事は取り込まない */
  exclude?: RegExp;
  /** 説明文の先頭から取り除く定型の文（arXiv の RSS の「arXiv:… Announce Type: … Abstract:」など） */
  summaryPrefix?: RegExp;
  /**
   * RSS のない一覧ページから、見出し・日付・リンクだけを読む（feedUrl はその一覧ページ。src/htmlList.ts）。
   * rows は行、link は行の中の見出しの要素（URL はその要素か、外側・内側の <a> から取る）、date は日付の要素（省くと行の文字から探す）の CSS セレクター。
   * 年が元号なし（会計検査院の「8年10月21日」）なら era、数字だけの日付が年・月・日の順でないなら dateOrder を指定する。
   * 説明文と画像は取らず、記事ページも取得しない（titleOnly と同じく、見出しと原文へのリンクだけを表示する）
   */
  htmlList?: { rows: string; link: string; date?: string; era?: 'reiwa'; dateOrder?: 'mdy' | 'dmy' };
}

export interface NewsItem {
  documentKind?: string;
  id: string;
  /** 主カテゴリ（categories の先頭） */
  category: CategoryKey;
  categories: CategoryKey[];
  subgroup: SubgroupKey;
  sourceType: SourceType;
  title: string;
  summary: string;
  publishedAt: string;
  sourceName: string;
  sourceUrl: string;
  feedUrl: string;
  imageUrl?: string;
  /** 記事ページの画像を確認済みか（確認は1記事1回のみ） */
  imageChecked?: boolean;
  hashtags: string[];
  keywords: string[];
  isSample?: boolean;
  /** 見出しと原文へのリンクだけを表示する記事（発信元の利用条件による）。説明文・要約・画像は持たない */
  titleOnly?: boolean;
}

export interface NewsFilters {
  /** マイニュース（関心プロフィールに一致する記事を関連度順に並べる） */
  forYou?: boolean;
  category?: string;
  subgroup?: string;
  sourceType?: string;
  keyword?: string;
  /** 利用者が選んだ地域・分野（空なら限定しない） */
  regions?: string[];
  categories?: string[];
  /** 利用者がオフにした情報源の ID */
  excludedSources?: Set<string>;
  /** 利用者が非表示にした記事の ID */
  hiddenItems?: Set<string>;
}

export interface ArticleContent {
  status: 'ok' | 'pdf' | 'unavailable';
  paragraphs: string[];
  truncated: boolean;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  reason?: string;
}

export interface ArticleSummary {
  /** 抽出型（本文の文をそのまま抜き出す） / LLM（生成モデルが要約を書く） */
  method: 'extractive' | 'llm';
  /** 要約エンジンの ID（例: extractive, local:qwen3-4b, claude） */
  provider: string;
  /** 日本語の見出し（LLM の場合、原題が外国語なら訳。抽出型では原題のまま） */
  headlineJa: string;
  summary: string;
  keyPoints: string[];
  /** 本文から見出し以上の内容を読み取れなかった場合 true */
  insufficient: boolean;
  /** 要約の根拠: 記事本文 / PDF 資料 / RSS の説明文のみ */
  basis: 'article' | 'pdf' | 'feed';
  model: string;
  createdAt: string;
}
