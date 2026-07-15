import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARTIFACT_DIR, saveArtifact } from './shared';

interface BlindtestResult {
  question: { id: string };
  replies: { agent: string; text: string; latencyMs?: number }[];
  judge: { top1Hits: number; top3Hits: number; homogeneity: number };
  toneStats: { shortReplies: number; longReplies: number; maxSameOpening: number };
}

function load(name: string): BlindtestResult[] {
  return JSON.parse(readFileSync(join(ARTIFACT_DIR, name), 'utf8')) as BlindtestResult[];
}

const legacy = load('blindtest.json');
const pi = load('blindtest-pi.json');

const comparisons = pi.map((result) => {
  const baseline = legacy.find((item) => item.question.id === result.question.id);
  if (!baseline) throw new Error(`missing legacy baseline for ${result.question.id}`);

  const latency = result.replies.map((reply) => reply.latencyMs).filter((value): value is number => value !== undefined);
  const sorted = [...latency].sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const pass = {
    identification: result.judge.top3Hits >= 10,
    homogeneity: result.judge.homogeneity <= 2.5,
    shortReplies: result.toneStats.shortReplies >= 4,
    longReplies: result.toneStats.longReplies >= 4,
    openings: result.toneStats.maxSameOpening < 8,
  };

  return {
    question: result.question.id,
    legacy: {
      top1: baseline.judge.top1Hits,
      top3: baseline.judge.top3Hits,
      homogeneity: baseline.judge.homogeneity,
      shortReplies: baseline.toneStats.shortReplies,
      longReplies: baseline.toneStats.longReplies,
    },
    pi: {
      top1: result.judge.top1Hits,
      top3: result.judge.top3Hits,
      homogeneity: result.judge.homogeneity,
      shortReplies: result.toneStats.shortReplies,
      longReplies: result.toneStats.longReplies,
      averageLatencyMs: latency.length
        ? Math.round(latency.reduce((sum, value) => sum + value, 0) / latency.length)
        : null,
      p95LatencyMs: sorted.length ? sorted[p95Index] : null,
    },
    delta: {
      top1: result.judge.top1Hits - baseline.judge.top1Hits,
      top3: result.judge.top3Hits - baseline.judge.top3Hits,
      homogeneity: result.judge.homogeneity - baseline.judge.homogeneity,
    },
    pass,
    passed: Object.values(pass).every(Boolean),
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  legacyArtifact: 'blindtest.json',
  piArtifact: 'blindtest-pi.json',
  comparisons,
  passed: comparisons.every((item) => item.passed),
};

saveArtifact('runtime-regression.json', report);
for (const comparison of comparisons) {
  console.log(
    `${comparison.passed ? '✓' : '✗'} ${comparison.question}: ` +
    `top3 ${comparison.legacy.top3}→${comparison.pi.top3}, ` +
    `homogeneity ${comparison.legacy.homogeneity}→${comparison.pi.homogeneity}, ` +
    `avg ${comparison.pi.averageLatencyMs}ms, p95 ${comparison.pi.p95LatencyMs}ms`,
  );
}

if (!report.passed) {
  process.exitCode = 1;
}
