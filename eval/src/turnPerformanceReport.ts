import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  TURN_TIMING_STAGES,
  summarizeTurnPerformance,
  type TurnPerformanceReport,
  type TurnPerformanceSample,
} from './turnPerformanceSummary';

interface CliOptions {
  input: string;
  format: 'json' | 'markdown';
  jsonOutput?: string;
  markdownOutput?: string;
}

function optionValue(args: readonly string[], index: number, name: string): { value: string; consumed: number } {
  const argument = args[index]!;
  const inline = argument.startsWith(`${name}=`) ? argument.slice(name.length + 1) : undefined;
  const value = inline ?? args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return { value, consumed: inline === undefined ? 2 : 1 };
}

function parseArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = { input: '-', format: 'markdown' };
  for (let index = 0; index < args.length;) {
    const argument = args[index]!;
    if (argument === '--') {
      index += 1;
    } else if (argument === '--input' || argument.startsWith('--input=')) {
      const parsed = optionValue(args, index, '--input');
      options.input = parsed.value;
      index += parsed.consumed;
    } else if (argument === '--format' || argument.startsWith('--format=')) {
      const parsed = optionValue(args, index, '--format');
      if (parsed.value !== 'json' && parsed.value !== 'markdown') throw new Error('--format must be json or markdown');
      options.format = parsed.value;
      index += parsed.consumed;
    } else if (argument === '--json' || argument.startsWith('--json=')) {
      const parsed = optionValue(args, index, '--json');
      options.jsonOutput = parsed.value;
      index += parsed.consumed;
    } else if (argument === '--markdown' || argument.startsWith('--markdown=')) {
      const parsed = optionValue(args, index, '--markdown');
      options.markdownOutput = parsed.value;
      index += parsed.consumed;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

function loadNdjson(input: string): TurnPerformanceSample[] {
  const source = input === '-' ? readFileSync(0, 'utf8') : readFileSync(resolve(input), 'utf8');
  return source.split(/\r?\n/u).flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('line is not a JSON object');
      }
      return [parsed as TurnPerformanceSample];
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`invalid NDJSON at line ${index + 1}: ${reason}`);
    }
  });
}

const REPORT_OUTPUT_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'artifacts',
  'performance',
);

function ensureDirectoryIsNotSymlink(path: string): void {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    throw new Error(`report output directory must not be a symbolic link: ${path}`);
  }
  mkdirSync(path, { recursive: true });
}

function ensureSafeOutputRoot(): void {
  const artifactsRoot = dirname(REPORT_OUTPUT_ROOT);
  ensureDirectoryIsNotSymlink(artifactsRoot);
  ensureDirectoryIsNotSymlink(REPORT_OUTPUT_ROOT);
}

export function resolveReportOutputPath(name: string, extension: '.json' | '.md'): string {
  ensureSafeOutputRoot();
  if (name !== basename(name)) throw new Error('report output must be a file name without directories');
  if (extname(name) !== extension) throw new Error(`report output must end with ${extension}`);
  const target = resolve(REPORT_OUTPUT_ROOT, name);
  if (!target.startsWith(`${REPORT_OUTPUT_ROOT}${sep}`)) throw new Error('report output escapes artifacts/performance');
  return target;
}

function assertWritableTarget(target: string): void {
  if (existsSync(target)) throw new Error(`report output already exists: ${target}`);
}

export function writeReportArtifact(target: string, content: string): void {
  ensureSafeOutputRoot();
  const temporary = resolve(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { flag: 'wx' });
    linkSync(temporary, target);
    unlinkSync(temporary);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function renderPerformanceMarkdown(report: TurnPerformanceReport): string {
  const total = report.overall.latency.totalMs;
  const validated = report.overall.latency.validatedOutputMs;
  const lines = [
    '# persona16 Turn 性能报告',
    '',
    `- 生成时间：${report.generatedAt}`,
    `- 样本数：${report.sampleCount}`,
    `- 总耗时覆盖率：${percent(report.overall.coverage.totalMs.ratio)}`,
    `- 验证后正文耗时覆盖率：${percent(report.overall.coverage.validatedOutputMs.ratio)}`,
    `- 总耗时：p50=${total?.p50Ms ?? 'n/a'}ms，p95=${total?.p95Ms ?? 'n/a'}ms`,
    `- 验证后正文耗时：p50=${validated?.p50Ms ?? 'n/a'}ms，p95=${validated?.p95Ms ?? 'n/a'}ms`,
    `- 模型调用：${report.overall.usage.calls}`,
    `- Token：input=${report.overall.usage.inputTokens}，output=${report.overall.usage.outputTokens}，cache-read=${report.overall.usage.cacheReadTokens}，cache-write=${report.overall.usage.cacheWriteTokens}`,
    `- 估算成本：${report.overall.usage.estimatedCostUsd === null ? 'n/a' : `$${report.overall.usage.estimatedCostUsd.toFixed(6)}`}`,
    '',
    '## 阶段耗时',
    '',
    '| 阶段 | 覆盖率 | p50 | p95 | 最大值 |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const stage of TURN_TIMING_STAGES) {
    const summary = report.overall.stages[stage];
    lines.push(`| ${stage} | ${percent(report.overall.coverage.stages[stage].ratio)} | ${summary?.p50Ms ?? 'n/a'}ms | ${summary?.p95Ms ?? 'n/a'}ms | ${summary?.maxMs ?? 'n/a'}ms |`);
  }
  lines.push('', '缺失数据只降低覆盖率，不按 0ms 参与百分位。', '');
  return lines.join('\n');
}

export function runPerformanceReport(args: readonly string[]): void {
  const options = parseArgs(args);
  const report = summarizeTurnPerformance(loadNdjson(options.input));
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderPerformanceMarkdown(report);
  const jsonTarget = options.jsonOutput
    ? resolveReportOutputPath(options.jsonOutput, '.json')
    : undefined;
  const markdownTarget = options.markdownOutput
    ? resolveReportOutputPath(options.markdownOutput, '.md')
    : undefined;
  if (jsonTarget && markdownTarget && jsonTarget === markdownTarget) {
    throw new Error('JSON and Markdown report outputs must be different files');
  }
  if (jsonTarget) assertWritableTarget(jsonTarget);
  if (markdownTarget) assertWritableTarget(markdownTarget);
  if (jsonTarget) writeReportArtifact(jsonTarget, json);
  if (markdownTarget) writeReportArtifact(markdownTarget, markdown);
  process.stdout.write(options.format === 'json' ? json : markdown);
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entry === import.meta.url) runPerformanceReport(process.argv.slice(2));
