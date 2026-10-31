import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { qualityChecks } from './quality-checks.mjs';
import { classifyCheck, snapshotHealth, collectionStatus, diagnosticExitCode } from './operations-health.mjs';
import { downloadSnapshot, readSnapshot, snapshotDirectory } from './preview-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const argv = process.argv.slice(2);
if (argv.some(arg => !['--refresh-snapshot', '--snapshot-only'].includes(arg))) throw Error('Usage: npm run operations [-- --refresh-snapshot] [-- --snapshot-only]');
const directory = path.join(root, 'data/operations');
const lock = path.join(directory, 'running');
await mkdir(directory, { recursive: true });
try { await mkdir(lock); } catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.error('Another diagnostic owns data/operations/running. Confirm its process has stopped before removing a stale lock.');
  process.exit(2);
}
const startedAt = new Date().toISOString();
const runId = `${startedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const runDirectory = path.join(directory, runId);
const report = { schema: 1, runId, startedAt, mode: argv.includes('--snapshot-only') ? 'snapshot-only' : 'full', checks: [], observations: [], manual: { desktop: 'unverified', iphone: 'unverified', usability: 'unverified', pilot: 'not-started' } };
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
async function fingerprint() {
  const hash = createHash('sha256');
  const files = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean).sort();
  for (const file of new Set(files)) {
    hash.update(file); hash.update('\0');
    try { hash.update(await readFile(path.join(root, file))); } catch (error) { if (error.code !== 'ENOENT') throw error; hash.update('deleted'); }
  }
  return hash.digest('hex');
}
async function runCheck(check) {
  const started = Date.now(), log = path.join(runDirectory, `${check.id}.log`);
  let output = '', timedOut = false;
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, check.args, { cwd: root, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const kill = signal => { try { process.platform === 'win32' ? child.kill(signal) : process.kill(-child.pid, signal); } catch {} };
    let force;
    const timer = setTimeout(() => { timedOut = true; kill('SIGTERM'); force = setTimeout(() => kill('SIGKILL'), 2000); }, 180_000);
    const capture = chunk => { if (output.length < 4 * 1024 * 1024) output += chunk.toString(); };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    child.on('error', error => { output += `\n${error.message}`; });
    child.on('close', code => { clearTimeout(timer); clearTimeout(force); resolve(code); });
  });
  await writeFile(log, output);
  const result = { id: check.id, status: classifyCheck(code, output, timedOut), code, durationMs: Date.now() - started, log: path.relative(root, log) };
  console.log(`${result.status}: ${check.id} (${result.durationMs}ms)`);
  return result;
}
try {
  await mkdir(runDirectory);
  await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, runId, startedAt }));
  report.head = git(['rev-parse', 'HEAD']).trim();
  report.before = await fingerprint();
  if (argv.includes('--refresh-snapshot')) {
    try { await downloadSnapshot(); report.snapshotRefresh = 'passed'; }
    catch (error) { report.snapshotRefresh = 'failed'; report.observations.push(`Refresh failed; previous evidence retained: ${error.message}`); }
  }
  try { report.snapshot = snapshotHealth(await readSnapshot(snapshotDirectory)); }
  catch (error) { report.observations.push(`Snapshot unavailable: ${error.message}`); }
  // Classification/region gap candidates (docs/coverage-audit.md). Report only: never changes the exit code.
  if (report.snapshot) {
    const coverageJson = path.join(runDirectory, 'coverage.json');
    try {
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/coverage-audit.ts', '--data', snapshotDirectory, '--json', coverageJson], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], timeout: 120_000 });
      const coverage = JSON.parse(await readFile(coverageJson, 'utf8'));
      const open = coverage.findings.filter(finding => finding.status === 'open');
      report.coverage = { log: path.relative(root, coverageJson), open: open.length, fixedInCode: coverage.findings.length - open.length, top: open.filter(finding => finding.priority !== 'P3').slice(0, 10).map(({ priority, code, message }) => ({ priority, code, message })) };
    } catch (error) { report.observations.push(`Coverage audit unavailable: ${error.message.split('\n')[0]}`); }
  }
  if (report.mode === 'full') {
    for (const check of qualityChecks) {
      if (Date.now() - Date.parse(startedAt) > 15 * 60_000) {
        report.observations.push('15-minute budget exhausted; remaining checks were not run.'); break;
      }
      report.checks.push(await runCheck(check));
    }
  }
  report.after = await fingerprint();
  if (report.before !== report.after) report.observations.push('Source files changed during diagnosis; results do not describe one stable source state.');
  const failed = report.checks.some(check => ['failed', 'timeout'].includes(check.status));
  const incomplete = report.mode !== 'full' || report.checks.length !== qualityChecks.length || report.checks.some(check => check.status === 'blocked') || report.before !== report.after;
  report.checkStatus = failed ? 'failed' : incomplete ? 'incomplete' : 'passed';
  report.collectionStatus = collectionStatus(report.snapshot, report.snapshotRefresh === 'failed');
  report.releaseStatus = 'manual-review-required';
  report.finishedAt = new Date().toISOString();
  const json = JSON.stringify(report, null, 2) + '\n';
  await writeFile(path.join(runDirectory, 'report.json'), json);
  await writeFile(path.join(directory, `${runId}.tmp`), json);
  await rename(path.join(directory, `${runId}.tmp`), path.join(directory, 'latest.json'));
  const lines = [
    '# Sivree operational evidence', '', `Run: ${runId}`, ``, `Checks: **${report.checkStatus}**. Collection: **${report.collectionStatus}**. Release: **${report.releaseStatus}**.`, '',
    'A passing automated run does not verify mobile usability, live source recovery, or product demand.', '',
    '| Check | Result | Duration (ms) |', '|---|---|---:|', ...report.checks.map(check => `| ${check.id} | ${check.status} | ${check.durationMs} |`), '',
    '## Public snapshot', '', ...(report.snapshot ? [`Generated: ${report.snapshot.generatedAt}; age: ${report.snapshot.ageHours}h; articles: ${report.snapshot.articles}; source definitions: ${report.snapshot.sourceDefinitions}; unique feeds: ${report.snapshot.uniqueFeedUrls}.`, '', ...report.snapshot.findings.map(f => `- ${f.priority} / ${f.code}: ${f.message} (${f.details.length})`)] : ['Unavailable.']), '',
    '## Coverage audit (report only)', '', ...(report.coverage ? [`Open: ${report.coverage.open}; fixed in code, awaiting publish: ${report.coverage.fixedInCode}.`, '', ...report.coverage.top.map(f => `- ${f.priority} / ${f.code}: ${f.message}`)] : ['Unavailable.']), '',
    '## Limitations', '', ...report.observations.map(value => `- ${value}`), '- Desktop, iPhone and pilot use require separate evidence.', '',
    'See report.json for source references and individual logs for check output.', ''
  ];
  await writeFile(path.join(runDirectory, 'report.md'), lines.join('\n'));
  console.log(`Evidence: ${path.relative(root, runDirectory)}/report.md`);
  process.exitCode = diagnosticExitCode(report.checkStatus, report.collectionStatus);
} finally { await rm(lock, { recursive: true, force: true }); }
