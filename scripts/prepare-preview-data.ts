import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { listSources } from '../src/newsPipeline.js';

const [snapshot, output] = process.argv.slice(2);
if (!snapshot || !output) throw Error('Usage: prepare-preview-data.ts SNAPSHOT OUTPUT');
await mkdir(output, { recursive: true });
if (path.resolve(snapshot) !== path.resolve(output)) {
  for (const name of ['meta', 'news', 'summaries', 'analysis']) await copyFile(path.join(snapshot, `${name}.json`), path.join(output, `${name}.json`));
}
const publicSources = JSON.parse(await readFile(path.join(snapshot, 'sources.json'), 'utf8')) as { feedUrl: string; health?: unknown }[];
const health = new Map(publicSources.map(source => [source.feedUrl, source.health]));
// New local sources and workflow definitions must appear without publishing first.
const sources = listSources().map(source => ({ ...source, health: health.get(source.feedUrl) ?? null }));
await writeFile(path.join(output, 'sources.json'), JSON.stringify(sources));
const meta = JSON.parse(await readFile(path.join(output, 'meta.json'), 'utf8'));
// Local source definitions create a new data generation without changing article dates.
meta.previewSourceGeneratedAt = meta.generatedAt;
meta.generatedAt = new Date().toISOString();
await writeFile(path.join(output, 'meta.json'), JSON.stringify(meta));
