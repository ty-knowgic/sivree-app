import { SAME_STORY, WINDOW_HOURS } from './stories.js';
import type { NewsItem } from './types.js';
import { decodeVector, dot } from './vectors.js';

/** Profile-independent results, computed at publication time instead of on phones. */
export function buildStaticAnalysis(items: NewsItem[], vectors: Record<string, string>, topics: Record<string, string>) {
  const decoded = new Map(Object.entries(vectors).map(([id, value]) => [id, decodeVector(value)]));
  const topicScores: Record<string, Record<string, number>> = {};
  for (const [key, value] of Object.entries(topics)) {
    const topic = decodeVector(value);
    topicScores[key] = Object.fromEntries([...decoded].filter(([, v]) => v.length === topic.length).map(([id, v]) => [id, dot(v, topic)]));
  }
  const pairs: Record<string, Record<string, number>> = {};
  const times = items.map(item => Date.parse(item.publishedAt));
  for (let i = 0; i < items.length; i++) {
    const a = decoded.get(items[i].id);
    if (!a) continue;
    for (let j = i + 1; j < items.length; j++) {
      if (Math.abs(times[i] - times[j]) > WINDOW_HOURS * 3600000) continue;
      const b = decoded.get(items[j].id);
      if (!b || a.length !== b.length) continue;
      const score = dot(a, b);
      // Lower similarities cannot pass either of the existing story thresholds.
      if (score >= SAME_STORY) (pairs[items[i].id] ??= {})[items[j].id] = score;
    }
  }
  return { topicScores, pairs };
}
