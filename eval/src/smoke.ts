/** 冒烟测试：单次 Agent 回复 + 一次导演决策，验证 API 与 JSON 输出可用 */
import { createRoom, runTurn } from '@persona16/engine';
import './shared'; // 加载 dotenv

async function main() {
  console.log('冒烟：INTJ + ENFP 房间，跑一轮…');
  const room = createRoom(['INTJ', 'ENFP']);
  const result = await runTurn(room, '我最近很想辞职，但又怕后悔。');
  console.log(`场景=${result.plan.scene} 情绪=${result.plan.userEmotion}`);
  for (const s of result.plan.scores) console.log(`  评分 ${s.type}: ${s.detail} → ${s.adjusted}`);
  for (const u of result.utterances) {
    console.log(`\n[${u.type}·${u.speechType}]${u.regenerated ? '（重生成过）' : ''}\n${u.text}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
