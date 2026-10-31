import { SOURCE_MARGIN, WEAK_MARGIN } from './profile.js';
import type { ArticleSummary, NewsItem } from './types.js';
import type { SemanticScorer } from './vectors.js';

/**
 * Public data layout read by current static clients (schema 3):
 * - list.json: everything a list or briefing needs, in one self-consistent file (one request, no generation mixing);
 * - details.json: summary key points, basis and model, fetched after the first cards are visible;
 * - head.json: the generation alone, for update checks.
 * meta.json, news.json, summaries.json and analysis.json stay published unchanged for already-open older clients.
 */
export interface Head {
  schema: 3;
  generatedAt: string;
  analysisReady: boolean;
  model: string | null;
  threshold: number;
}

/** List text per article: the summary, plus the headline only when it differs from the original title. */
export type SummaryText = Record<string, { s: string; h?: string; m?: ArticleSummary['method'] }>;
export type SummaryDetails = Record<string, Omit<ArticleSummary, 'summary' | 'headlineJa' | 'method'>>;

export interface CompactScores {
  /** Topic similarities below this value were not published: every matching rule treats them alike. */
  floor: number;
  /** Articles without a vector (similarity undefined rather than low). */
  unscored: string[];
  topics: Record<string, Record<string, number>>;
  pairs: Record<string, Record<string, number>>;
}

/**
 * profile.ts compares a topic similarity only with threshold, threshold − SOURCE_MARGIN and threshold − WEAK_MARGIN.
 * Values below the lowest of these give the same result for all three, so publishing them adds nothing.
 */
export function scoreFloor(threshold: number) {
  return Math.min(threshold - SOURCE_MARGIN, threshold - WEAK_MARGIN);
}

export function splitSummaries(summaries: Iterable<[string, ArticleSummary]>, items: NewsItem[]) {
  const titles = new Map(items.map(item => [item.id, item.title]));
  const text: SummaryText = {};
  const details: SummaryDetails = {};
  for (const [id, { summary, headlineJa, method, ...rest }] of summaries) {
    if (!titles.has(id)) continue;
    text[id] = { s: summary, ...(headlineJa !== titles.get(id) ? { h: headlineJa } : {}), ...(method !== 'extractive' ? { m: method } : {}) };
    details[id] = rest;
  }
  return { text, details };
}

/** The list form of a summary. Details are merged in later with Object.assign. */
export function joinSummary(item: NewsItem, text: SummaryText[string]): ArticleSummary {
  return { method: text.m ?? 'extractive', headlineJa: text.h ?? item.title, summary: text.s } as ArticleSummary;
}

export function compactScores(analysis: { topicScores: Record<string, Record<string, number>>; pairs: Record<string, Record<string, number>> }, items: NewsItem[], threshold: number): CompactScores {
  const floor = scoreFloor(threshold);
  const scored = new Set(Object.values(analysis.topicScores).flatMap(scores => Object.keys(scores)));
  return {
    floor,
    unscored: items.map(item => item.id).filter(id => !scored.has(id)),
    topics: Object.fromEntries(Object.entries(analysis.topicScores).map(([key, scores]) => [key, Object.fromEntries(Object.entries(scores).filter(([, score]) => score >= floor))])),
    pairs: analysis.pairs
  };
}

/** Topic ID → precomputed topic key; returns the same matching decisions as the full similarity table. */
export function compactScorer(scores: CompactScores, keys: Map<string, string>, threshold: number): SemanticScorer {
  const unscored = new Set(scores.unscored);
  const below = scores.floor - 1;
  return {
    threshold,
    similarity(itemId, topicId) {
      const table = scores.topics[keys.get(topicId) ?? ''];
      if (!table || unscored.has(itemId)) return undefined;
      return table[itemId] ?? below;
    }
  };
}

/** An article in list.json, with its list summary text next to the feed description (they compress together). */
export type ListItem = NewsItem & { t?: SummaryText[string] };

export interface ListFile<Source = unknown> {
  head: Head;
  items: ListItem[];
  sources: Source[];
  scores: CompactScores;
}

export interface DetailsFile {
  generatedAt: string;
  details: SummaryDetails;
}

/** The schema 3 files for one generation, derived from the same data as the legacy files. */
export function schema3Files<Source>(meta: Omit<Head, 'schema'>, items: NewsItem[], sources: Source[], summaries: Iterable<[string, ArticleSummary]>, analysis: Parameters<typeof compactScores>[0]) {
  const { text, details } = splitSummaries(summaries, items);
  const head: Head = { schema: 3, generatedAt: meta.generatedAt, analysisReady: meta.analysisReady, model: meta.model, threshold: meta.threshold };
  const list: ListFile<Source> = { head, items: items.map(item => (text[item.id] ? { ...item, t: text[item.id] } : item)), sources, scores: compactScores(analysis, items, meta.threshold) };
  const detailsFile: DetailsFile = { generatedAt: meta.generatedAt, details };
  return { head, list, details: detailsFile };
}
