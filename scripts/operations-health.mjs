const DAY = 86_400_000;
const validUrl = value => {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
};

// Public snapshot only. This module never reads profiles, notes, or browser storage.
export function snapshotHealth(data, now = Date.now()) {
  const findings = [];
  const add = (priority, code, message, details = []) => findings.push({ priority, code, message, details });
  const generated = Date.parse(data.meta.generatedAt);
  const ageHours = (now - generated) / 3_600_000;
  if (ageHours > 12) add('P1', 'stale-snapshot', 'Snapshot is older than 12 hours; refresh before judging current collection health.');
  if (ageHours < -1) add('P1', 'future-snapshot', 'Snapshot generation is ahead of the diagnostic clock.');
  const invalidDates = data.news.filter(item => !Number.isFinite(Date.parse(item.publishedAt)));
  // Compare against collection time, not today's clock: old evidence must stay reproducible.
  const future = data.news.filter(item => Date.parse(item.publishedAt) > generated + DAY);
  const invalidLinks = data.news.filter(item => !validUrl(item.sourceUrl));
  const unknownFeeds = data.news.filter(item => !data.sources.some(source => source.feedUrl === item.feedUrl));
  const ids = new Set();
  const duplicates = data.news.filter(item => ids.has(item.id) || !ids.add(item.id));
  const failed = data.sources.filter(source => source.health?.ok === false);
  const failedFeeds = new Map();
  for (const source of failed) {
    const group = failedFeeds.get(source.feedUrl) ?? { feedUrl: source.feedUrl, definitions: [] };
    group.definitions.push({ label: source.label, checkedAt: source.health.checkedAt, error: source.health.error, robots: source.health.robots ?? null });
    failedFeeds.set(source.feedUrl, group);
  }
  const unknown = data.sources.filter(source => !source.health);
  const staleHealth = data.sources.filter(source => source.health && (!Number.isFinite(Date.parse(source.health.checkedAt)) || generated - Date.parse(source.health.checkedAt) > 2 * DAY));
  const reference = item => ({ id: item.id, source: item.sourceName, url: item.sourceUrl, publishedAt: item.publishedAt });
  if (invalidDates.length) add('P1', 'invalid-dates', 'Articles have invalid publication dates.', invalidDates.map(reference));
  if (future.length) add('P1', 'future-dates', 'Source-supplied dates exceed collection time by >24h; investigate scheduled publication or date errors without inventing a replacement date.', future.map(reference));
  if (invalidLinks.length) add('P0', 'invalid-links', 'Articles lack a safe HTTP(S) original-source URL.', invalidLinks.map(reference));
  if (unknownFeeds.length) add('P1', 'unknown-feeds', 'Articles cannot be joined to a source definition.', unknownFeeds.map(reference));
  if (duplicates.length) add('P1', 'duplicate-ids', 'Article identities are duplicated.', duplicates.map(reference));
  if (failed.length) add('P1', 'source-failures', 'Recorded collection failures grouped by feed URL; a snapshot is not a fresh live probe.', [...failedFeeds.values()]);
  if (unknown.length) add('P2', 'unknown-source-health', 'Sources lack collection evidence.', unknown.map(source => source.label));
  if (staleHealth.length) add('P2', 'stale-source-health', 'Source checks are missing dates or >48h older than the snapshot.', staleHealth.map(source => source.label));
  return {
    generatedAt: data.meta.generatedAt, ageHours: Math.round(ageHours * 10) / 10,
    articles: data.news.length, sourceDefinitions: data.sources.length,
    uniqueFeedUrls: new Set(data.sources.map(source => source.feedUrl)).size,
    failedSourceDefinitions: failed.length, failedFeedUrls: failedFeeds.size, unknownSourceHealth: unknown.length,
    futureDates: future.length, invalidDates: invalidDates.length,
    recentArticles: data.news.filter(item => { const date = Date.parse(item.publishedAt); return date <= generated && date >= generated - 7 * DAY; }).length,
    findings
  };
}

export function classifyCheck(code, output, timedOut = false) {
  if (timedOut) return 'timeout';
  if (code === 0) return 'passed';
  // Do not turn every EPERM or every network error into an environment exemption.
  return /(?:listen EPERM|Error: listen EACCES)/.test(output) ? 'blocked' : 'failed';
}

// Keep code correctness separate from collection quality. Neither implies release readiness.
export function collectionStatus(snapshot, refreshFailed = false) {
  if (!snapshot || refreshFailed) return 'incomplete';
  if (snapshot.findings.some(finding => ['P0', 'P1'].includes(finding.priority))) return 'attention-required';
  return snapshot.findings.length ? 'warnings' : 'passed';
}

export function diagnosticExitCode(checkStatus, collection) {
  if (checkStatus === 'failed') return 1;
  return checkStatus !== 'passed' || ['incomplete', 'attention-required'].includes(collection) ? 2 : 0;
}
