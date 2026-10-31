/**
 * 取りこぼしの監査（src/coverageAudit.ts）を公開データに対して実行し、影響の大きい順に一覧にする。報告だけで、何も変えない。
 * 使い方: npm run audit:coverage [-- --data <ディレクトリか URL>] [--json <ファイル>] [--markdown <ファイル>] [--all]
 * --data を省くと site/data → data/preview/snapshot → https://sivree.com/data の順に探す。
 * 終了コードは、データを読めないときだけ 1（発見があっても 0。公開を止めない）。
 */
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { coverageAudit, type CoverageReport, type Finding, type Snapshot } from '../src/coverageAudit.js';

const argv = process.argv.slice(2);
const option = (name: string) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
const showAll = argv.includes('--all');

async function load(location: string): Promise<Snapshot> {
  const read = async (name: string) => /^https?:\/\//.test(location)
    ? (async () => {
        const response = await fetch(`${location.replace(/\/+$/, '')}/${name}.json?audit=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw Error(`${name}.json: HTTP ${response.status}`);
        return response.json();
      })()
    : JSON.parse(await readFile(path.join(location, `${name}.json`), 'utf8'));
  const [meta, news, sources] = await Promise.all(['meta', 'news', 'sources'].map(read));
  if (!Array.isArray(news) || !Array.isArray(sources) || !Number.isFinite(Date.parse(meta?.generatedAt))) throw Error(`${location}: 公開データの形式が不正です`);
  return { meta, news, sources };
}

const location = option('--data') ?? ['site/data', 'data/preview/snapshot'].find(dir => existsSync(path.join(dir, 'news.json'))) ?? 'https://sivree.com/data';
let report: CoverageReport;
try {
  report = coverageAudit(await load(location));
} catch (error) {
  console.error(`監査できませんでした（${location}）: ${(error as Error).message}`);
  process.exit(1);
}

const STATUS = { open: '未解決', 'fixed-in-code': 'コード側で解消済み・次の公開で反映' };
const open = report.findings.filter(finding => finding.status === 'open');
const fixed = report.findings.filter(finding => finding.status === 'fixed-in-code');
const shown = (findings: Finding[]) => showAll ? findings : findings.filter(finding => finding.priority !== 'P3').slice(0, 25);

function text(): string {
  const lines = [`取りこぼしの監査  データ ${location}（${report.generatedAt} 生成・記事 ${report.articles}件）`, `未解決 ${open.length}件（P1 ${open.filter(f => f.priority === 'P1').length}・P2 ${open.filter(f => f.priority === 'P2').length}・P3 ${open.filter(f => f.priority === 'P3').length}）・コード側で解消済み ${fixed.length}件`, ''];
  const block = (finding: Finding, rank: number) => {
    lines.push(`${rank}. [${finding.priority}] ${finding.message}`, `   → ${finding.hint}`);
    for (const item of finding.examples.slice(0, 3)) {
      const now = item.current && (item.current.subgroup !== item.subgroup || item.current.categories.join() !== item.categories.join()) ? ` ⇒ いま: ${item.current.categories.join('・')} / ${item.current.subgroup}` : '';
      lines.push(`   - ${item.publishedAt.slice(0, 10)} ${item.source}「${item.title.slice(0, 80)}」 ${item.categories.join('・')} / ${item.subgroup}${now}`);
    }
  };
  lines.push(`■ ${STATUS.open}${showAll ? '' : '（P1・P2 の上位。すべては --all）'}`);
  shown(open).forEach((finding, index) => block(finding, index + 1));
  if (!shown(open).length) lines.push('  なし');
  lines.push('', `■ ${STATUS['fixed-in-code']}`);
  (showAll ? fixed : fixed.slice(0, 10)).forEach((finding, index) => block(finding, index + 1));
  if (!fixed.length) lines.push('  なし');
  lines.push('', '■ カテゴリ×地域（既定でオンの情報源、直近7日 / 前の7日 / いまのコードで分類し直した直近7日）');
  const regions = [...new Set(report.cells.map(cell => cell.region))];
  lines.push(['', ...regions].join('\t'));
  for (const category of [...new Set(report.cells.map(cell => cell.category))]) {
    lines.push([category, ...regions.map(region => { const cell = report.cells.find(c => c.category === category && c.region === region)!; return `${cell.current}/${cell.prior}/${cell.projected}`; })].join('\t'));
  }
  lines.push('', `カテゴリの対応がないため語の照合をしていない既定トピック: ${report.uncheckedTopics.join('、')}`);
  lines.push('この監査は公開データの見出し・説明文だけを見る。利用者の設定や閲覧は読まない。候補の判定は語の一致で、取りこぼしかどうかの最終判断ではない。');
  return lines.join('\n');
}

function markdown(): string {
  const row = (finding: Finding) => `| ${finding.priority} | ${finding.code} | ${finding.message.replace(/\|/g, '\\|')} | ${finding.examples[0] ? `[${finding.examples[0].title.slice(0, 60).replace(/[|[\]]/g, ' ')}](${finding.examples[0].url.replace(/[()|]/g, encodeURIComponent)})` : ''} |`;
  return [
    '## 取りこぼしの監査（報告のみ）', '',
    `データ: ${report.generatedAt} 生成・記事 ${report.articles}件。未解決 ${open.length}件・コード側で解消済み ${fixed.length}件。`, '',
    '| 優先 | 種類 | 内容 | 例 |', '|---|---|---|---|', ...shown(open).map(row), '',
    fixed.length ? `<details><summary>コード側で解消済み（${fixed.length}件）</summary>\n\n| 優先 | 種類 | 内容 | 例 |\n|---|---|---|---|\n${fixed.map(row).join('\n')}\n\n</details>` : '', ''
  ].join('\n');
}

console.log(text());
const json = option('--json');
if (json) await writeFile(json, JSON.stringify({ data: location, ...report }, null, 2) + '\n');
const md = option('--markdown');
if (md) await appendFile(md, markdown());
