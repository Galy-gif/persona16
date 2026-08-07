import { compileSemanticTurnControl } from './semanticTurnControl';
import { compileTurnActPlan } from './turnActPlan';
import type {
  DirectorDecision,
  RoomState,
  Scene,
  SpeechType,
} from './types';
import type { SafetyLevel } from './safety/safetyRouter';

function activeAgents(room: RoomState) {
  return room.agents.filter((agent) => !agent.paused);
}

function isDeterministicGreeting(userMessage: string): boolean {
  return compileTurnActPlan(userMessage).kind === 'greeting';
}

function asksForLongForm(userMessage: string): boolean {
  return /(?:详细|完整|展开|长一点|长文|故事|文案|总结|复盘)/u.test(userMessage);
}

/**
 * 单聊里只有在用户明确授权分析、建议或共同决策时，模型导演才有足够新增价值。
 * 多人房继续保留模型调度，以维持发言选择和房间化学反应。
 */
export function shouldUseModelDirector(room: RoomState, userMessage: string): boolean {
  if (isDeterministicGreeting(userMessage) && activeAgents(room).length > 0) return false;
  if (room.agents.length !== 1) return true;
  const control = compileSemanticTurnControl({ userMessage });
  return control.frame.requestedMode === 'analyze'
    || control.frame.requestedMode === 'advise'
    || control.frame.requestedMode === 'decide_together';
}

/**
 * 纯问候不需要模型发现话题相关性：所有在场人物得到相同、无人物倾向的
 * 短句候选，最终仍由 resolveTurnPlan 的点名、近期发言和拥挤规则选人。
 */
function createGreetingDecision(room: RoomState): DirectorDecision {
  const agents = activeAgents(room);
  if (agents.length === 0) {
    throw new Error('deterministic greeting director requires an active agent');
  }
  return {
    scene: '闲聊',
    userEmotion: '稳定',
    conflictTopic: null,
    forceSummary: false,
    assessments: agents.map((agent) => ({
      type: agent.type,
      baseImpulse: 60,
      angle: '只回一个自然招呼；不另起话题或展示人物倾向',
      suggestedSpeechType: '短句',
    })),
  };
}

export function createDeterministicDirectorDecision(
  room: RoomState,
  userMessage: string,
  safetyMode: SafetyLevel = 'normal',
): DirectorDecision {
  if (isDeterministicGreeting(userMessage)) return createGreetingDecision(room);
  return createSingleAgentDecision(room, userMessage, safetyMode);
}

function deterministicScene(userMessage: string): Scene {
  const act = compileTurnActPlan(userMessage);
  const control = compileSemanticTurnControl({ userMessage });
  if (act.kind === 'boundary_repair' || act.kind === 'style_repair' || act.kind === 'direct_confrontation') {
    return '冲突';
  }
  if (control.frame.requestedMode === 'listen') return '陪伴';
  if (control.frame.requestedMode === 'analyze'
    || control.frame.requestedMode === 'advise'
    || control.frame.requestedMode === 'decide_together') {
    return '决策';
  }
  if (/(?:写|创作|续写|故事|文案)/u.test(userMessage)) return '创作';
  return '闲聊';
}

export function createSingleAgentDecision(
  room: RoomState,
  userMessage: string,
  safetyMode: SafetyLevel = 'normal',
): DirectorDecision {
  const [agent] = activeAgents(room);
  if (!agent) {
    throw new Error('deterministic single-agent director requires one active agent');
  }
  const speechType: SpeechType = asksForLongForm(userMessage) ? '长发言' : '短句';
  return {
    scene: deterministicScene(userMessage),
    userEmotion: safetyMode === 'sensitive' ? '脆弱' : '稳定',
    conflictTopic: null,
    forceSummary: false,
    assessments: [{
      type: agent.type,
      baseImpulse: 60,
      angle: '直接接用户这句话；不必展示人物倾向或强行分析',
      suggestedSpeechType: speechType,
    }],
  };
}
