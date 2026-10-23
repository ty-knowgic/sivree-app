import { JSDOM, VirtualConsole } from 'jsdom';
import type { FeedSource } from './types.js';

/** 一覧ページの1行（rss-parser の記事と同じ形にして、フィードと同じ取り込みの処理に渡す） */
export interface HtmlListEntry {
  title: string;
  link: string;
  isoDate: string;
}

export interface ListDateOptions {
  /** 年が元号なしで書かれているときの元号（会計検査院の「8年10月21日」） */
  era?: 'reiwa';
  /** 数字だけの日付の並び（既定は年・月・日。米最高裁の「9/25/26」は mdy、ESMA の「22/10/2026」は dmy） */
  order?: 'mdy' | 'dmy';
  /** 日本の発信元か。日本は日本の暦のその日の 0 時（+09:00）、それ以外は協定世界時の正午（どの地域でも同じ日付になる） */
  japan?: boolean;
  /** 年のない日付（法務省の「10月22日（木）」）の年を決める基準の時刻 */
  now?: number;
}

const ERA_START: Record<string, number> = { 令和: 2018, 平成: 1988 };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAME = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 一覧ページの日付を読む。「令和8年10月21日」「8年10月21日」（元号なし。era で指定）「2026年10月21日」「10月22日」（年なし。直近のその日）、
 * 「2026-10-21」「2026.10.21」「Oct. 23, 2026」「23 October 2026」と、order を指定した「9/25/26」「22/10/2026」の形
 */
export function parseListDate(text: string, options: ListDateOptions = {}): string | undefined {
  // 全角の数字や「⽉」（康熙部首）などを通常の文字にそろえる
  const value = text.normalize('NFKC').replace(/\s+/g, ' ');
  const ymd = (year: number, month: number, day: number) => [year, month, day] as const;
  let found: readonly [number, number, number] | undefined;
  const japanese = value.match(/(令和|平成)?\s*(\d{1,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  const yearless = value.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  const english = value.match(new RegExp(`${MONTH_NAME}\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i'));
  const englishDayFirst = value.match(new RegExp(`(\\d{1,2})\\s+${MONTH_NAME}\\s+(\\d{4})`, 'i'));
  const numeric = options.order
    ? value.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2}(?:\d{2})?)\b/)
    : value.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (japanese) {
    const [, eraName, y, m, d] = japanese;
    const start = eraName ? ERA_START[eraName] : (options.era === 'reiwa' && Number(y) < 100 ? ERA_START['令和'] : 0);
    found = ymd(start + Number(y), Number(m), Number(d));
  } else if (english) {
    found = ymd(Number(english[3]), MONTHS.indexOf(english[1].toLowerCase()) + 1, Number(english[2]));
  } else if (englishDayFirst) {
    found = ymd(Number(englishDayFirst[3]), MONTHS.indexOf(englishDayFirst[2].toLowerCase()) + 1, Number(englishDayFirst[1]));
  } else if (numeric) {
    const [a, b, c] = numeric.slice(1).map(Number);
    const year = (n: number) => (n < 100 ? 2000 + n : n);
    found = options.order === 'mdy' ? ymd(year(c), a, b) : options.order === 'dmy' ? ymd(year(c), b, a) : ymd(a, b, c);
  } else if (yearless) {
    // 年のない日付は、基準の時刻から見て直近のその日（2日より先の日付になるなら前の年）
    const now = options.now ?? Date.now();
    const thisYear = new Date(now + 9 * 60 * 60 * 1000).getUTCFullYear();
    const month = Number(yearless[1]);
    const day = Number(yearless[2]);
    const candidate = Date.UTC(thisYear, month - 1, day);
    found = ymd(candidate - now > 2 * DAY_MS ? thisYear - 1 : thisYear, month, day);
  }
  if (!found) return undefined;
  const [year, month, day] = found;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(options.japan === false ? `${date}T12:00:00Z` : `${date}T00:00:00+09:00`);
  // 存在しない日（2月30日など）は、Date が翌月に繰り上げるので、読めないものとする
  return Number.isNaN(parsed.getTime()) || new Date(parsed.getTime() + (options.japan === false ? 0 : 9 * 60 * 60 * 1000)).getUTCDate() !== day
    ? undefined
    : parsed.toISOString();
}

// 見出しの先頭に括弧つきで付いた日付（公正取引委員会の「(令和8年10月22日)…」）は、日付の欄と重なるので外す
const LEADING_DATE = /^[（(]\s*(令和|平成)?\s*[0-9０-９]{1,4}\s*年\s*[0-9０-９]{1,2}\s*[月⽉]\s*[0-9０-９]{1,2}\s*[日⽇]\s*[）)]\s*/;

/** 追跡用の引数（ref・utm_*）は、同じ記事が別の ID にならないように外す */
function withoutTracking(link: string): string {
  const url = new URL(link);
  for (const key of [...url.searchParams.keys()]) {
    if (key === 'ref' || key.startsWith('utm_')) url.searchParams.delete(key);
  }
  return url.href;
}

/**
 * RSS のない一覧ページ（source.htmlList）から、見出し・リンク・日付を読む。スクリプトは実行しない。
 * link は見出しの要素で、URL はその要素が <a> ならそれ、なければ外側か内側の <a> から取る。date を省くと、行の文字から日付を探す。
 * 読める行が1つもないときは、ページの構成が変わったとみなして例外にする（取得の不調として記録される）
 */
export function readHtmlList(html: string, source: FeedSource, pageUrl = source.feedUrl, now = Date.now()): HtmlListEntry[] {
  const config = source.htmlList;
  if (!config) return [];
  const { document } = new JSDOM(html, { url: pageUrl, virtualConsole: new VirtualConsole() }).window;
  const dateOptions: ListDateOptions = { era: config.era, order: config.dateOrder, japan: source.subgroup === '日本', now };
  const entries: HtmlListEntry[] = [];
  for (const row of document.querySelectorAll(config.rows)) {
    const heading = row.querySelector(config.link);
    const anchor = heading?.closest('a') ?? heading?.querySelector('a');
    // 見出しは原文のまま（引用に使うため、全角・半角もそろえない）
    const title = heading?.textContent?.replace(/\s+/g, ' ').trim().replace(LEADING_DATE, '');
    const dateText = config.date ? row.querySelector(config.date)?.textContent : row.textContent;
    const isoDate = parseListDate(dateText ?? '', dateOptions);
    if (!anchor || !title || !isoDate) continue;
    let link: string;
    try {
      link = withoutTracking(new URL(anchor.getAttribute('href') ?? '', pageUrl).href);
    } catch {
      continue;
    }
    if (!/^https?:/.test(link)) continue;
    entries.push({ title, link, isoDate });
  }
  if (!entries.length) throw new Error('No dated links found in the list page (its layout may have changed)');
  return entries;
}
