import { JSDOM, VirtualConsole } from 'jsdom';
import type { FeedSource } from './types.js';

/** 一覧ページの1行（rss-parser の記事と同じ形にして、フィードと同じ取り込みの処理に渡す） */
export interface HtmlListEntry {
  title: string;
  link: string;
  isoDate: string;
}

const ERA_START: Record<string, number> = { 令和: 2018, 平成: 1988 };

/**
 * 一覧ページの日付を読む。「令和8年10月21日」「8年10月21日」（元号なし。era で元号を指定）「2026年10月21日」「2026-10-21」「2026/10/21」の形。
 * 時刻はないので、日本の暦のその日の 0 時（+09:00）とする
 */
export function parseListDate(text: string, era?: 'reiwa'): string | undefined {
  const value = text.replace(/[０-９]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0xfee0)).replace(/\s+/g, '');
  let year: number;
  let month: number;
  let day: number;
  const japanese = value.match(/(令和|平成)?(\d{1,4})年(\d{1,2})月(\d{1,2})日/);
  const numeric = value.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (japanese) {
    const [, eraName, y, m, d] = japanese;
    const start = eraName ? ERA_START[eraName] : (era === 'reiwa' && Number(y) < 100 ? ERA_START['令和'] : 0);
    year = start + Number(y);
    month = Number(m);
    day = Number(d);
  } else if (numeric) {
    [year, month, day] = numeric.slice(1).map(Number);
  } else {
    return undefined;
  }
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * RSS のない一覧ページ（source.htmlList）から、見出し・リンク・日付を読む。スクリプトは実行しない。
 * 行は見つかるのに読める行が1つもないときは、ページの構成が変わったとみなして例外にする（取得の不調として記録される）
 */
export function readHtmlList(html: string, source: FeedSource): HtmlListEntry[] {
  const config = source.htmlList;
  if (!config) return [];
  const { document } = new JSDOM(html, { url: source.feedUrl, virtualConsole: new VirtualConsole() }).window;
  const entries: HtmlListEntry[] = [];
  for (const row of document.querySelectorAll(config.rows)) {
    const anchor = row.querySelector<HTMLAnchorElement>(config.link);
    const title = anchor?.textContent?.replace(/\s+/g, ' ').trim();
    const isoDate = parseListDate(row.querySelector(config.date)?.textContent ?? '', config.era);
    if (!anchor || !title || !isoDate) continue;
    let link: string;
    try {
      link = new URL(anchor.getAttribute('href') ?? '', source.feedUrl).href;
    } catch {
      continue;
    }
    if (!/^https?:/.test(link)) continue;
    entries.push({ title, link, isoDate });
  }
  if (!entries.length) throw new Error('No dated links found in the list page (its layout may have changed)');
  return entries;
}
