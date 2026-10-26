import assert from 'node:assert/strict';
import { snapshotHealth, classifyCheck, collectionStatus, diagnosticExitCode } from './operations-health.mjs';

const now = Date.parse('2026-10-24T23:00:00Z');
const item = { id: 'a', title: 'Announcement', sourceName: 'Agency', sourceUrl: 'https://example.test/a', feedUrl: 'https://example.test/rss', publishedAt: new Date(now - 1000).toISOString() };
const data = { meta: { generatedAt: new Date(now).toISOString() }, news: [item], sources: [{ label: 'Agency', feedUrl: item.feedUrl, health: { ok: true, checkedAt: new Date(now).toISOString() } }] };
assert.equal(snapshotHealth(data, now).findings.length, 0);
const anomalous = snapshotHealth({ ...data, news: [item, { ...item, sourceUrl: 'javascript:alert(1)', publishedAt: new Date(now + 2 * 86_400_000).toISOString() }, { ...item, id: 'b', publishedAt: 'unknown' }], sources: [{ ...data.sources[0], health: { ok: false, error: 'HTTP 403', checkedAt: new Date(now).toISOString() } }] }, now);
assert.equal(anomalous.recentArticles, 1);
const duplicateSource = snapshotHealth({ ...data, sources: [
  { ...data.sources[0], label: 'Pack A', health: { ok: false, error: 'robots.txt: disallowed or unavailable' } },
  { ...data.sources[0], label: 'Pack B', health: { ok: false, error: 'robots.txt: http-error (HTTP 503)', robots: { allowed: false, reason: 'http-error', status: 503 } } }
] }, now);
assert.equal(duplicateSource.failedSourceDefinitions, 2);
assert.equal(duplicateSource.failedFeedUrls, 1);
const grouped = duplicateSource.findings.find(f => f.code === 'source-failures').details;
assert.equal(grouped.length, 1);
assert.deepEqual(grouped[0].definitions.map(d => d.label), ['Pack A', 'Pack B']);
assert.equal(grouped[0].definitions[0].robots, null, 'old evidence does not imply a known robots decision');
assert.equal(grouped[0].definitions[1].robots.status, 503);
for (const code of ['invalid-links', 'duplicate-ids', 'invalid-dates', 'future-dates', 'source-failures']) assert(anomalous.findings.some(f => f.code === code));
assert.equal(snapshotHealth(data, now + 2 * 86_400_000).findings[0].code, 'stale-snapshot');
assert.equal(snapshotHealth({ ...data, news: [{ ...item, feedUrl: 'missing' }] }, now).findings[0].code, 'unknown-feeds');
assert.equal(snapshotHealth({ ...data, sources: [{ ...data.sources[0], health: null }] }, now).unknownSourceHealth, 1);
assert.equal(classifyCheck(1, 'Error: listen EPERM: operation not permitted 127.0.0.1'), 'blocked');
assert.equal(classifyCheck(1, 'EPERM reading a file'), 'failed');
assert.equal(classifyCheck(1, 'AssertionError'), 'failed');
assert.equal(classifyCheck(0, '', true), 'timeout');
assert.equal(classifyCheck(0, ''), 'passed');
assert.equal(collectionStatus(snapshotHealth(data, now)), 'passed');
assert.equal(collectionStatus(anomalous), 'attention-required');
assert.equal(collectionStatus(undefined), 'incomplete');
assert.equal(collectionStatus(snapshotHealth(data, now), true), 'incomplete');
assert.equal(collectionStatus({ findings: [{ priority: 'P2' }] }), 'warnings');
assert.equal(diagnosticExitCode('passed', 'attention-required'), 2);
assert.equal(diagnosticExitCode('passed', 'incomplete'), 2);
assert.equal(diagnosticExitCode('incomplete', 'passed'), 2);
assert.equal(diagnosticExitCode('failed', 'passed'), 1);
assert.equal(diagnosticExitCode('passed', 'passed'), 0);
assert.equal(diagnosticExitCode('passed', 'warnings'), 0);
console.log('✓ Operational evidence distinguishes date/provenance failures, stale snapshots, environment blocks and actual test failures');
