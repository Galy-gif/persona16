import type {
  DirectorDecision,
  RoomState,
  SpeakerPlan,
  SpeechType,
  TurnPlan,
} from './types';

/**
 * PRD §8.1 的确定性部分：导演模型给出 baseImpulse（0-85，相当于
 * 话题相关性+独特洞察+分歧+需求匹配+关系牵引+人格主动性），
 * 代码在此之上叠加可复现的加减分并裁决发言名单。
 *
 * 规则：
 * - 用户点名 +40；被暂停置 0；新入场（本轮刚加入）+20
 * - 最近发言惩罚：上轮刚说过 -20，隔一轮 -10
 * - 房间拥挤惩罚：3 个 Agent 在场时每人 -8
 * - ≥60 允许长发言；45-59 只允许短句/追问/反驳；<45 沉默
 * - 每轮最多 3 人出声，长发言最多 2 人
 */
export function resolveTurnPlan(decision: DirectorDecision, room: RoomState): TurnPlan {
  const active = room.agents.filter((a) => !a.paused);
  const crowdPenalty = active.length >= 3 ? 8 : 0;

  const scores: TurnPlan['scores'] = [];
  const candidates: SpeakerPlan[] = [];

  for (const agent of room.agents) {
    const assessment = decision.assessments.find((x) => x.type === agent.type);
    const base = assessment?.baseImpulse ?? 0;
    const detail: string[] = [`base=${base}`];
    let score = base;

    if (agent.paused) {
      scores.push({ type: agent.type, base, adjusted: 0, detail: 'paused→0' });
      continue;
    }
    if (room.calledAgent === agent.type) {
      score += 40;
      detail.push('点名+40');
    }
    if (agent.turnsInRoom === 0) {
      score += 20;
      detail.push('新入场+20');
    }
    if (agent.turnsSinceSpoke === 0) {
      score -= 20;
      detail.push('刚发言-20');
    } else if (agent.turnsSinceSpoke === 1) {
      score -= 10;
      detail.push('隔轮-10');
    }
    if (crowdPenalty) {
      score -= crowdPenalty;
      detail.push(`拥挤-${crowdPenalty}`);
    }

    scores.push({ type: agent.type, base, adjusted: score, detail: detail.join(' ') });

    if (score < 45) continue;
    const wantsLong = (assessment?.suggestedSpeechType ?? '短句') === '长发言';
    const speechType: SpeechType =
      score >= 60
        ? assessment?.suggestedSpeechType ?? '长发言'
        : wantsLong
          ? '短句'
          : assessment?.suggestedSpeechType ?? '短句';
    if (speechType === '沉默') continue;
    candidates.push({
      type: agent.type,
      speechType,
      finalScore: score,
      angle: assessment?.angle ?? '',
      toneShift: assessment?.toneShift,
    });
  }

  candidates.sort((a, b) => b.finalScore - a.finalScore);

  // 每轮最多 3 人出声，长发言最多 2 人
  const speakers: SpeakerPlan[] = [];
  let longCount = 0;
  for (const c of candidates) {
    if (speakers.length >= 3) break;
    if (c.speechType === '长发言') {
      if (longCount >= 2) c.speechType = '短句';
      else longCount += 1;
    }
    speakers.push(c);
  }

  // 点名的 Agent 必须发言且排最前
  if (room.calledAgent) {
    const idx = speakers.findIndex((s) => s.type === room.calledAgent);
    if (idx > 0) {
      const [called] = speakers.splice(idx, 1);
      speakers.unshift(called!);
    } else if (idx === -1) {
      const agent = room.agents.find((a) => a.type === room.calledAgent && !a.paused);
      if (agent) {
        const assessment = decision.assessments.find((x) => x.type === agent.type);
        speakers.unshift({
          type: agent.type,
          speechType: '长发言',
          finalScore: 60,
          angle: assessment?.angle ?? '用户点名要求回应',
          toneShift: assessment?.toneShift,
        });
        if (speakers.length > 3) speakers.pop();
      }
    }
  }

  // 语气互补：连续两个长发言时，后一个降为短句以外的处理交给生成层，
  // 这里只保证长发言不排在一起超过 2 个（上面已限制 2 个）。

  const forceSummary = decision.forceSummary || room.conflictRounds >= 3;

  return {
    scene: decision.scene,
    userEmotion: decision.userEmotion,
    forceSummary,
    speakers,
    scores,
  };
}

/** 一轮结束后更新房间状态（发言计数、争论轮数） */
export function advanceRoomState(
  room: RoomState,
  plan: TurnPlan,
  conflictTopic: string | null,
): void {
  const spoke = new Set(plan.speakers.map((s) => s.type));
  for (const a of room.agents) {
    a.turnsInRoom += 1;
    a.turnsSinceSpoke = spoke.has(a.type) ? 0 : a.turnsSinceSpoke + 1;
  }
  if (conflictTopic && conflictTopic === room.conflictTopic) {
    room.conflictRounds += 1;
  } else {
    room.conflictTopic = conflictTopic;
    room.conflictRounds = conflictTopic ? 1 : 0;
  }
  if (plan.forceSummary) {
    room.conflictTopic = null;
    room.conflictRounds = 0;
  }
  room.calledAgent = undefined;
}
