import { selectRelationshipEvidence } from '../relationship/relationshipContext';
import type {
  RelationshipContextEvidence,
  RelationshipContextFocus,
} from '../relationship/relationshipContext';
import type { SafetyLevel } from '../safety/safetyRouter';
import type { SemanticTurnControl } from '../semanticTurnControl';
import type { AgentType, RoomState, TurnMessage, TurnPlan } from '../types';
import {
  getRelationalCharacterProfile,
  type InterpersonalAct,
  type InterpersonalSituation,
} from './relationalCharacter';

export type KnownOrUnknown = string | 'unknown';
export type MutterPolicy = 'default' | 'suppress' | 'disabled';

export interface DynamicContextEvidence {
  id: string;
  kind: RelationshipContextEvidence['kind'];
  content: string;
  sourceTurnId: KnownOrUnknown;
  sourceMessageId: KnownOrUnknown;
  sourceEventId: KnownOrUnknown;
  recordedAt: KnownOrUnknown;
  traceability: RelationshipContextEvidence['traceability'];
}

export interface TurnInterpersonalIntent {
  situation: InterpersonalSituation | 'ordinary';
  target: { agency: number; communion: number };
  primaryAct: InterpersonalAct;
  secondaryAct?: InterpersonalAct;
  relationalModifiers: string[];
  inhibitors: string[];
  evidenceIds: string[];
}

export interface DynamicContextPacket {
  generatedAt: string;
  coverage: {
    fromTurnId: KnownOrUnknown;
    throughTurnId: KnownOrUnknown;
    fromMessageId: KnownOrUnknown;
    throughMessageId: KnownOrUnknown;
    fromRecordedAt: KnownOrUnknown;
    throughRecordedAt: KnownOrUnknown;
    sourceMessageIds: string[];
  };
  room: {
    scene: TurnPlan['scene'];
    userEmotion: TurnPlan['userEmotion'];
    participantCount: number;
    roomGoal?: string;
  };
  currentRequest: {
    requestedMode: SemanticTurnControl['frame']['requestedMode'];
    conversationAct: SemanticTurnControl['plan']['conversationAct'];
    interactionMode: SemanticTurnControl['plan']['interactionMode'];
    mustAddress: string[];
  };
  activeBoundaries: DynamicContextEvidence[];
  relationshipEvidence: DynamicContextEvidence[];
  relationshipState: {
    memoryEnabled: boolean;
    climate: KnownOrUnknown;
    intimacy: number | 'unknown';
  };
  unresolvedThreads: DynamicContextEvidence[];
  recentRawTurns: Array<{
    id: KnownOrUnknown;
    recordedAt: KnownOrUnknown;
    speaker: string;
    text: string;
  }>;
  uncertainty: string[];
  interpersonalIntent: TurnInterpersonalIntent;
  mutterPolicy: MutterPolicy;
  userMessage: string;
}

export interface BuildDynamicContextPacketInput {
  generatedAt?: string;
  room: RoomState;
  plan: TurnPlan;
  speaker: AgentType;
  userMessage: string;
  semanticControl: SemanticTurnControl;
  relationshipFocus: RelationshipContextFocus;
  safetyMode?: SafetyLevel;
  mutterEnabled?: boolean;
}

const DIRECT_TECHNICAL_TASK = /(?:代码|报错|错误栈|SQL|接口|函数|部署|配置|正则|脚本|文件|表格|PPT|PDF|翻译|改写|总结|计算|查资料|搜索|格式化|typecheck|测试失败)/iu;
const PUBLIC_FACE_RISK = /(?:当众|公开|群里|会上|所有人面前|大庭广众|同事面前).{0,24}(?:纠正|反驳|批评|指出|拆穿|否定)|(?:纠正|反驳|批评|指出|拆穿).{0,24}(?:当众|公开|群里|会上)/u;
const RESPONSIBILITY_IMBALANCE = /(?:总是|一直|每次|长期).{0,16}(?:我|一个人|他|她).{0,12}(?:收尾|兜底|维护|承担|负责)|(?:没人|无人).{0,8}(?:负责|收尾|维护|认领)/u;
const IRREVERSIBLE_RISK = /(?:不可逆|回不了头|无法撤回|全部押上|梭哈|裸辞|立刻辞职|删库|永久删除|签了就不能|没有退路)/u;
const REQUESTED_MOMENTUM = /(?:推进|催我|逼我一把|马上行动|下一步|现在就做|别让我拖|帮我开始)/u;
const RECENT_TURN_LIMIT = 30;
const RECENT_CHARACTER_LIMIT = 12_000;

function selectRecentMessages(history: readonly TurnMessage[]): TurnMessage[] {
  const candidates = history.slice(-RECENT_TURN_LIMIT);
  const selected: TurnMessage[] = [];
  let usedCharacters = 0;
  for (let index = candidates.length - 1; index >= 0; index--) {
    const message = candidates[index]!;
    if (selected.length > 0 && usedCharacters + message.text.length > RECENT_CHARACTER_LIMIT) break;
    selected.unshift(message);
    usedCharacters += message.text.length;
  }
  return selected;
}

function evidenceProjection(item: RelationshipContextEvidence): DynamicContextEvidence {
  if (item.traceability === 'legacy_untraceable') {
    return {
      id: item.id,
      kind: item.kind,
      content: item.content,
      sourceTurnId: 'unknown',
      sourceMessageId: 'unknown',
      sourceEventId: 'unknown',
      recordedAt: 'unknown',
      traceability: item.traceability,
    };
  }
  return {
    id: item.id,
    kind: item.kind,
    content: item.content,
    sourceTurnId: item.sourceTurnId,
    sourceMessageId: item.sourceMessageId ?? 'unknown',
    sourceEventId: item.sourceEventId ?? 'unknown',
    recordedAt: item.recordedAt ?? 'unknown',
    traceability: item.traceability,
  };
}

function situationForTurn(input: BuildDynamicContextPacketInput): InterpersonalSituation | 'ordinary' {
  const { semanticControl, relationshipFocus, userMessage } = input;
  if (semanticControl.plan.interactionMode === 'repair') return 'repair_after_harm';
  if (semanticControl.plan.interactionMode === 'close' || relationshipFocus === 'explicit_end') return 'explicit_end';
  if (PUBLIC_FACE_RISK.test(userMessage)) return 'public_face_risk';
  if (RESPONSIBILITY_IMBALANCE.test(userMessage)) return 'responsibility_imbalance';
  if (IRREVERSIBLE_RISK.test(userMessage)) return 'irreversible_risk';
  if (semanticControl.plan.interactionMode === 'listen'
    || semanticControl.plan.advicePolicy === 'forbidden') return 'vulnerable_no_advice';
  if (REQUESTED_MOMENTUM.test(userMessage)) return 'requested_momentum';
  if (semanticControl.plan.interactionMode === 'analyze') return 'explicit_analysis';
  return 'ordinary';
}

function clamp(value: number, range: readonly [number, number]): number {
  return Math.min(range[1], Math.max(range[0], value));
}

function boundedShift(value: number, maxNaturalShift: number): number {
  return clamp(value, [-maxNaturalShift, maxNaturalShift]);
}

function defaultAct(control: SemanticTurnControl): InterpersonalAct {
  if (control.plan.interactionMode === 'repair') return 'repair';
  if (control.plan.interactionMode === 'close') return 'defer';
  if (control.plan.interactionMode === 'listen') return 'listen';
  if (control.plan.interactionMode === 'support') return 'validate';
  if (control.plan.interactionMode === 'analyze') return 'clarify';
  return 'validate';
}

function compileInterpersonalIntent(
  type: AgentType,
  control: SemanticTurnControl,
  situation: InterpersonalSituation | 'ordinary',
  evidence: readonly DynamicContextEvidence[],
): TurnInterpersonalIntent {
  const policy = getRelationalCharacterProfile(type)?.interpersonalPolicy;
  const anchor = policy?.anchor ?? { agency: 0, communion: 0.3 };
  const rule = situation === 'ordinary'
    ? undefined
    : policy?.transitionRules.find((candidate) => candidate.situation === situation);
  const agency = policy
    ? clamp(
        anchor.agency + boundedShift(rule?.agencyDelta ?? 0, policy.maxNaturalShift),
        policy.permittedRegion.agency,
      )
    : anchor.agency;
  const communion = policy
    ? clamp(
        anchor.communion + boundedShift(rule?.communionDelta ?? 0, policy.maxNaturalShift),
        policy.permittedRegion.communion,
      )
    : anchor.communion;
  const primaryAct = rule?.preferredAct ?? defaultAct(control);
  const secondaryAct = primaryAct !== 'validate' && communion >= 0.45 ? 'validate' : undefined;
  return {
    situation,
    target: { agency, communion },
    primaryAct,
    ...(secondaryAct ? { secondaryAct } : {}),
    relationalModifiers: [
      ...(rule ? [rule.instruction] : []),
      ...(control.plan.relationshipMove ? [control.plan.relationshipMove.instruction] : []),
    ],
    inhibitors: [
      ...control.plan.forbiddenActs.map((act) => `forbid:${act}`),
      '不得推断用户稳定人格或文化属性',
      '不得制造人情债、关系占有或依赖暗示',
    ],
    evidenceIds: evidence.map((item) => item.id),
  };
}

function compileMutterPolicy(input: BuildDynamicContextPacketInput): MutterPolicy {
  if (input.mutterEnabled === false) return 'disabled';
  if (input.safetyMode && input.safetyMode !== 'normal') return 'suppress';
  if (input.semanticControl.plan.interactionMode === 'repair'
    || input.semanticControl.plan.interactionMode === 'close'
    || input.relationshipFocus === 'repair'
    || input.relationshipFocus === 'explicit_end'
    || DIRECT_TECHNICAL_TASK.test(input.userMessage)) return 'suppress';
  return 'default';
}

export function buildDynamicContextPacket(input: BuildDynamicContextPacketInput): DynamicContextPacket {
  const messages = selectRecentMessages(input.room.history);
  const first = messages[0];
  const last = messages[messages.length - 1];
  const agentRelationship = input.room.agents.find((agent) => agent.type === input.speaker)
    ?.relationship;
  const relationshipContext = agentRelationship?.promptContext;
  const availableEvidence = relationshipContext?.memoryEnabled === false
    ? []
    : relationshipContext?.evidence ?? [];
  const selected = selectRelationshipEvidence(availableEvidence, {
    focus: input.relationshipFocus,
    maxEvidence: 3,
  }).map(evidenceProjection);
  const allEvidence = availableEvidence.map(evidenceProjection);
  const activeBoundaries = allEvidence.filter((item) => item.kind === 'boundary');
  const unresolvedThreads = allEvidence.filter((item) => item.kind === 'tension');
  const uncertainty: string[] = [];
  if (messages.some((message) => !message.id)) uncertainty.push('部分对话缺少来源消息 ID');
  if (messages.some((message) => !message.turnId)) uncertainty.push('部分对话缺少来源轮次 ID');
  if (messages.some((message) => !message.createdAt)) uncertainty.push('部分对话缺少记录时间');
  if (messages.length < input.room.history.length) {
    uncertainty.push('较早对话未进入本轮原始上下文；只能使用当前覆盖范围和召回证据');
  }
  if (allEvidence.some((item) => item.traceability === 'legacy_untraceable')) {
    uncertainty.push('存在旧版不可追溯关系记录；只能按已确认兼容数据使用');
  }
  if (allEvidence.some((item) => item.recordedAt === 'unknown')) {
    uncertainty.push('部分关系证据缺少记录时间，不能推断先后或当前有效性');
  }
  const situation = situationForTurn(input);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    coverage: {
      fromTurnId: first?.turnId ?? 'unknown',
      throughTurnId: last?.turnId ?? 'unknown',
      fromMessageId: first?.id ?? 'unknown',
      throughMessageId: last?.id ?? 'unknown',
      fromRecordedAt: first?.createdAt ?? 'unknown',
      throughRecordedAt: last?.createdAt ?? 'unknown',
      sourceMessageIds: messages.flatMap((message) => message.id ? [message.id] : []),
    },
    room: {
      scene: input.plan.scene,
      userEmotion: input.plan.userEmotion,
      participantCount: input.room.agents.filter((agent) => !agent.paused).length,
      ...(input.room.roomGoal ? { roomGoal: input.room.roomGoal } : {}),
    },
    currentRequest: {
      requestedMode: input.semanticControl.frame.requestedMode,
      conversationAct: input.semanticControl.plan.conversationAct,
      interactionMode: input.semanticControl.plan.interactionMode,
      mustAddress: [...input.semanticControl.plan.mustAddress],
    },
    activeBoundaries,
    relationshipEvidence: selected,
    relationshipState: {
      memoryEnabled: relationshipContext?.memoryEnabled ?? true,
      climate: relationshipContext?.climate ?? 'unknown',
      intimacy: relationshipContext?.intimacy ?? agentRelationship?.intimacy ?? 'unknown',
    },
    unresolvedThreads,
    recentRawTurns: messages.map((message) => ({
      id: message.id ?? 'unknown',
      recordedAt: message.createdAt ?? 'unknown',
      speaker: message.speaker,
      text: message.text,
    })),
    uncertainty,
    interpersonalIntent: compileInterpersonalIntent(input.speaker, input.semanticControl, situation, selected),
    mutterPolicy: compileMutterPolicy(input),
    userMessage: input.userMessage,
  };
}

function targetLabel(value: number, positive: string, negative: string): string {
  if (value >= 0.55) return `明显${positive}`;
  if (value >= 0.15) return `偏${positive}`;
  if (value <= -0.55) return `明显${negative}`;
  if (value <= -0.15) return `偏${negative}`;
  return '居中';
}

function evidenceLine(item: DynamicContextEvidence): string {
  const source = item.sourceMessageId === 'unknown'
    ? `来源轮次 ${item.sourceTurnId}`
    : `来源消息 ${item.sourceMessageId}`;
  return `- [${item.kind}] ${item.content}（${source}；记录时间 ${item.recordedAt === 'unknown' ? '未知' : item.recordedAt}）`;
}

export function renderDynamicContextPacket(packet: DynamicContextPacket): string {
  const intent = packet.interpersonalIntent;
  return `【动态上下文包｜生成时间 ${packet.generatedAt}】

【覆盖范围】
从轮次 ${packet.coverage.fromTurnId}、消息 ${packet.coverage.fromMessageId}（${packet.coverage.fromRecordedAt === 'unknown' ? '时间未知' : packet.coverage.fromRecordedAt}）
到轮次 ${packet.coverage.throughTurnId}、消息 ${packet.coverage.throughMessageId}（${packet.coverage.throughRecordedAt === 'unknown' ? '时间未知' : packet.coverage.throughRecordedAt}）
来源消息：${packet.coverage.sourceMessageIds.length ? packet.coverage.sourceMessageIds.join('、') : '未知'}

【当前场景与请求】
场景：${packet.room.scene}｜用户情绪：${packet.room.userEmotion}｜在场人数：${packet.room.participantCount}
请求模式：${packet.currentRequest.requestedMode}｜互动模式：${packet.currentRequest.interactionMode}｜对话动作：${packet.currentRequest.conversationAct}
必须处理：${packet.currentRequest.mustAddress.length ? packet.currentRequest.mustAddress.join('；') : '无额外项目'}

【关系状态】
记忆：${packet.relationshipState.memoryEnabled ? '开启' : '关闭'}｜气候：${packet.relationshipState.climate}｜亲密度：${packet.relationshipState.intimacy}

【最近原始对话】
${packet.recentRawTurns.length ? packet.recentRawTurns.map((turn) => `- [${turn.id}｜${turn.recordedAt}] ${turn.speaker}：${turn.text}`).join('\n') : '（没有可用原始对话）'}

【有效边界】
${packet.activeBoundaries.length ? packet.activeBoundaries.map(evidenceLine).join('\n') : '（没有召回有效边界）'}

【本轮最多三条关系证据】
${packet.relationshipEvidence.length ? packet.relationshipEvidence.map(evidenceLine).join('\n') : '（没有可用关系证据）'}

【未解决线程】
${packet.unresolvedThreads.length ? packet.unresolvedThreads.map(evidenceLine).join('\n') : '（没有召回未解决线程）'}

【不确定信息】
${packet.uncertainty.length ? packet.uncertainty.map((item) => `- ${item}`).join('\n') : '（无）'}

【本轮人际意图】
情境：${intent.situation}
主动性：${targetLabel(intent.target.agency, '主动', '让位')}｜联结性：${targetLabel(intent.target.communion, '靠近', '保留')}
主动作：${intent.primaryAct}${intent.secondaryAct ? `｜次动作：${intent.secondaryAct}` : ''}
关系调节：${intent.relationalModifiers.length ? intent.relationalModifiers.join('；') : '无额外调节'}
禁止：${intent.inhibitors.join('；')}
证据编号只供校验：${intent.evidenceIds.length ? intent.evidenceIds.join('、') : '无'}

【碎碎念策略】
${packet.mutterPolicy}

【用户刚刚说】
${packet.userMessage}`;
}
