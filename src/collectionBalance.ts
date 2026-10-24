import type { FeedSource, NewsItem } from './types.js';
import { defaultOn } from './sourceTier.js';

/** Scheduling must never change which source wins duplicate merging. */
export function resultsInRegistryOrder<T>(registered: FeedSource[], scheduled: FeedSource[], results: T[][]): T[][] {
  const bySource = new Map(scheduled.map((source, index) => [source, results[index] ?? []]));
  return registered.map(source => bySource.get(source) ?? []);
}

/** Round-robin by feed: a busy publisher cannot evict every sparse specialist source. */
export function balancedArchive(items: NewsItem[], limit: number): NewsItem[] {
  const groups = new Map<string, NewsItem[]>();
  for (const item of items) {
    const group = groups.get(item.feedUrl) ?? [];
    group.push(item);
    groups.set(item.feedUrl, group);
  }
  const selected = new Set<NewsItem>();
  for (let depth = 0; selected.size < limit; depth++) {
    let added = false;
    for (const group of groups.values()) {
      if (group[depth]) { selected.add(group[depth]); added = true; }
      if (selected.size >= limit) break;
    }
    if (!added) break;
  }
  // Keep the existing global date order for display and stable pagination.
  return items.filter(item => selected.has(item));
}

/** Share collection opportunities across tiers; rotate starting feeds every publication window. */
export function collectionOrder(feeds: FeedSource[], window = Math.floor(Date.now() / (3 * 3600000))): FeedSource[] {
  const groups = new Map<string, FeedSource[]>();
  for (const feed of feeds) {
    const key = defaultOn(feed) ? 'default' : feed.pack ?? 'additional';
    const group = groups.get(key) ?? [];
    group.push(feed); groups.set(key, group);
  }
  const buckets = [...groups.values()].map(group => {
    const offset = ((window % group.length) + group.length) % group.length;
    return [...group.slice(offset), ...group.slice(0, offset)];
  });
  return Array.from({ length: Math.max(0, ...buckets.map(group => group.length)) }, (_, i) => buckets.flatMap(group => group[i] ? [group[i]] : [])).flat();
}
