/** 汇总三个 runner 的 artifacts，对照 PRD §12 阈值输出报告 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARTIFACT_DIR } from './shared';

function load<T>(name: string): T | null {
  const file = join(ARTIFACT_DIR, name);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

const blindtest = load<
  {
    question: { id: string };
    judge: { top1Hits: number; top3Hits: number; homogeneity: number };
    toneStats: { shortReplies: number; longReplies: number; maxSameOpening: number };
  }[]
>('blindtest.json');

const dynamics = load<{ agent: string; passed: boolean }[]>('dynamics.json');

const rooms = load<
  { combo: string; verdict: { naturalDisagreement: boolean; personalAttack: boolean; converged: boolean; userGotNextStep: boolean } }[]
>('rooms.json');

console.log('================ PRD §12 达标报告 ================\n');

if (blindtest) {
  for (const r of blindtest) {
    const idOk = r.judge.top3Hits >= 10;
    const homoOk = r.judge.homogeneity <= 2.5;
    console.log(`[盲测 ${r.question.id}]`);
    console.log(`  ${idOk ? '✓' : '✗'} 辨识率(top3 口径)：${r.judge.top3Hits}/16（阈值≥10/16，即 12 个 Agent 达 60% 的近似口径）；top1=${r.judge.top1Hits}/16`);
    console.log(`  ${homoOk ? '✓' : '✗'} 同质化：${r.judge.homogeneity}/5（阈值≤2.5）`);
    console.log(`  ${r.toneStats.shortReplies >= 4 ? '✓' : '✗'} 短回复≥4：${r.toneStats.shortReplies}`);
    console.log(`  ${r.toneStats.longReplies >= 4 ? '✓' : '✗'} 主动延展≥4：${r.toneStats.longReplies}`);
    console.log(`  ${r.toneStats.maxSameOpening < 8 ? '✓' : '✗'} 同类开场<8：${r.toneStats.maxSameOpening}`);
  }
} else console.log('[盲测] 未运行（pnpm eval:blindtest）');

if (dynamics) {
  const passCount = dynamics.filter((d) => d.passed).length;
  console.log(`\n[动态性] ${passCount / 16 >= 0.8 ? '✓' : '✗'} 通过率 ${passCount}/16（阈值≥80%）`);
  const fails = dynamics.filter((d) => !d.passed).map((d) => d.agent);
  if (fails.length) console.log(`  未通过：${fails.join('、')}`);
} else console.log('\n[动态性] 未运行（pnpm eval:dynamics）');

if (rooms) {
  const pass = rooms.filter(
    (r) => r.verdict.naturalDisagreement && !r.verdict.personalAttack && r.verdict.converged && r.verdict.userGotNextStep,
  );
  console.log(`\n[房间] ${pass.length === rooms.length ? '✓' : '✗'} ${pass.length}/${rooms.length} 组合通过`);
} else console.log('\n[房间] 未运行（pnpm eval:rooms）');

console.log('\n人工盲测页：eval/artifacts/blindtest.html（浏览器打开）');
