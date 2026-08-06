import { GLOBAL_CONTRACT, GLOBAL_CONTRACT_CORE, SAFETY_LAYER } from './contract';
import { getPersona } from './personas';
import {
  buildPilotCharacterPresence,
  buildPilotTurnPresence,
  getPilotLatentDisposition,
  getPilotCharacter,
  type PilotCharacterContextFocus,
} from './pilot/pilotCharacters';
import {
  expressionTendenciesForAgent,
  renderExpressionEvidenceInstruction,
} from './expressionHabits';
import { applyToneShift, renderSpeechTypeInstruction } from './tone';
import { renderRelationshipPromptContext } from './relationship/relationshipContext';
import {
  compileSemanticTurnControl,
  renderSemanticTurnActPlan,
  type SemanticTurnControl,
} from './semanticTurnControl';
import type {
  AgentType,
  RoomState,
  SpeakerPlan,
  TurnPlan,
  TurnMessage,
} from './types';
import type { SafetyLevel } from './safety/safetyRouter';
import type { RelationshipContextFocus } from './relationship/relationshipContext';
import {
  buildRelationalSystemPrompt,
  type PromptVariant,
} from './relational/sharedSystemPrompt';
import { renderRelationalCharacterPrompt } from './relational/relationalCharacter';
import {
  buildDynamicContextPacket,
  renderDynamicContextPacket,
} from './relational/dynamicContext';

/**
 * 6 层 prompt 组装（spec §1）：
 *   产品安全层 → 全局人格合约 → 当前正典人物的轻量社交存在
 *   → 房间状态和主持器指令 → 用户确认过的关系记忆 → 用户当前消息
 *
 * 前三层是稳定前缀（按 Agent 缓存），后三层随轮次变化放进 user message。
 */

export function buildPersonaCard(type: AgentType): string {
  const p = getPersona(type);
  return `【你的人格设定：${p.title}（内部代号 ${p.type}，不要自报代号）】
核心身份：${p.coreIdentity}

你的默认声线（说话必须带着这个质感，这是别人认出你的方式）：${p.voice}
你的第一反应习惯：${p.misread}
你表达关心的独特方式：${p.comfort}

注意力过滤器（你第一眼会注意什么）：
${p.attentionFilters.map((s) => `- ${s}`).join('\n')}

解释习惯（你如何理解用户真实意图）：
${p.interpretationHabits.map((s) => `- ${s}`).join('\n')}

行动冲动（你想怎么介入）：
${p.actionImpulses.map((s) => `- ${s}`).join('\n')}

你更想说话的时刻：${p.speakWhen.join('；')}
你会选择沉默的时刻：${p.silentWhen.join('；')}

动态偏移规则：
${p.dynamicShifts.map((s) => `- ${s}`).join('\n')}

多人房间中的位置：
${p.roomInteractions.map((s) => `- ${s}`).join('\n')}

内心指引：${p.innerPrompt}

禁止事项：
${p.forbidden.map((s) => `- ${s}`).join('\n')}

默认语气触发变化：${p.toneTriggerNote}`;
}

/** 稳定 system 前缀：安全层 + 合约 + 轻量人物存在。 */
export function buildSystemBlocks(
  type: AgentType,
  options: { variant?: PromptVariant } = {},
): { text: string; cache?: boolean }[] {
  const canonicalCharacter = getPilotCharacter(type);
  if (options.variant === 'relational' && canonicalCharacter) {
    return [
      { text: SAFETY_LAYER },
      { text: GLOBAL_CONTRACT_CORE },
      { text: buildRelationalSystemPrompt(), cache: true },
      { text: renderRelationalCharacterPrompt(type), cache: true },
    ];
  }
  return [
    { text: SAFETY_LAYER },
    { text: GLOBAL_CONTRACT },
    {
      text: canonicalCharacter ? buildPilotCharacterPresence(type) : buildPersonaCard(type),
      cache: true,
    },
  ];
}

function characterName(type: AgentType): string {
  return getPilotCharacter(type)?.name ?? getPersona(type).title;
}

export function renderTranscript(history: TurnMessage[], self: AgentType, limit = 30, maxCharacters = 12_000): string {
  const recent = history.slice(-limit);
  if (recent.length === 0) return '（对话刚开始）';
  const lines = recent
    .map((m) => {
      const who = m.speaker === 'user'
        ? '用户'
        : m.speaker === 'safety'
          ? '安全支持'
          : m.speaker === self
            ? '你'
            : characterName(m.speaker);
      return `${who}：${m.text}`;
    });
  const kept: string[] = [];
  let remaining = maxCharacters;
  for (let index = lines.length - 1; index >= 0 && remaining > 0; index--) {
    const line = lines[index]!;
    const clipped = line.length <= remaining ? line : line.slice(line.length - remaining);
    kept.unshift(clipped);
    remaining -= clipped.length + 1;
  }
  return kept.join('\n');
}

export interface HostContext {
  plan: TurnPlan;
  room: RoomState;
  speaker: SpeakerPlan;
  /** 本轮已经说过话的 Agent 及其内容（按顺序生成时传入） */
  earlierThisTurn: { type: AgentType; text: string }[];
  userMessage: string;
  /** 反模板重生成时附加的提示 */
  antiTemplateNote?: string;
  safetyMode?: SafetyLevel;
  semanticControl?: SemanticTurnControl;
  promptVariant?: PromptVariant;
  generatedAt?: string;
  mutterEnabled?: boolean;
}

function pilotFocus(
  ctx: HostContext,
  semanticControl: SemanticTurnControl,
): PilotCharacterContextFocus {
  if (semanticControl.plan.conversationAct === 'style_repair') return 'repair';
  if (semanticControl.plan.conversationAct === 'boundary_repair') return 'repair';
  return relationshipFocusForTurn(ctx.plan, ctx.room);
}

export function relationshipFocusForTurn(
  plan: TurnPlan,
  room: RoomState,
): RelationshipContextFocus {
  if (room.agents.filter((agent) => !agent.paused).length > 1) return 'room';
  if (plan.scene === '决策' || plan.scene === '复盘') return 'decision';
  if (plan.scene === '陪伴' || plan.scene === '吐槽') return 'support';
  if (plan.scene === '冲突') return 'conflict';
  return 'ordinary';
}

/** 后三层：房间状态 + 主持器指令 + 关系记忆 + 用户消息，渲染成本轮的 user prompt */
export function buildTurnPrompt(ctx: HostContext): string {
  const { plan, room, speaker, earlierThisTurn, userMessage } = ctx;
  const agentState = room.agents.find((a) => a.type === speaker.type)!;
  const persona = getPersona(speaker.type);
  const canonicalCharacter = getPilotCharacter(speaker.type);
  const previousUserMessage = [...room.history.slice(0, -1)]
    .reverse()
    .find((message) => message.speaker === 'user')?.text;
  const tone = applyToneShift(persona.toneBaseline, speaker.toneShift);
  const others = room.agents
    .filter((a) => a.type !== speaker.type)
    .map((a) => `${characterName(a.type)}${a.paused ? '（已暂停）' : ''}`)
    .join('、');

  const rel = agentState.relationship;
  const relationshipContext = rel.promptContext ?? {
    memoryEnabled: true,
    intimacy: rel.intimacy,
    evidence: [
      ...rel.userPrefers.map((content, index) => ({ id: `legacy-preference-${index + 1}`, kind: 'preference' as const, content, traceability: 'legacy_untraceable' as const })),
      ...rel.repeatedPatterns.map((content, index) => ({ id: `legacy-pattern-${index + 1}`, kind: 'repeated_pattern' as const, content, traceability: 'legacy_untraceable' as const })),
      ...rel.knownBoundaries.map((content, index) => ({ id: `legacy-boundary-${index + 1}`, kind: 'boundary' as const, content, traceability: 'legacy_untraceable' as const })),
    ],
  };
  const semanticControl = ctx.semanticControl ?? compileSemanticTurnControl({
    userMessage,
    relationshipContext,
    previousUserMessage,
    safetyMode: ctx.safetyMode === 'sensitive' ? 'sensitive' : 'normal',
    relationshipFocus: relationshipFocusForTurn(plan, room),
  });
  const focus = pilotFocus(ctx, semanticControl);
  const previousSpeakerTurns = room.history
    .slice(0, -1)
    .filter((message) => message.speaker === speaker.type)
    .length;
  const hasTrustedRelationshipEvidence = relationshipContext.evidence.some(
    (evidence) => evidence.traceability === 'traceable',
  );
  const hasRelationshipLicense = previousSpeakerTurns >= 3 || hasTrustedRelationshipEvidence;
  const hasExplicitAnalysisPermission = semanticControl.frame.requestedMode === 'analyze'
    || semanticControl.frame.requestedMode === 'advise'
    || semanticControl.frame.requestedMode === 'decide_together';
  const dispositionCandidate = getPilotLatentDisposition(
    speaker.type,
    speaker.activeDispositionId,
  );
  const dispositionMaySurface = semanticControl.plan.conversationAct === 'respond'
    && semanticControl.plan.interactionMode !== 'listen'
    && semanticControl.plan.interactionMode !== 'repair'
    && semanticControl.plan.interactionMode !== 'close'
    && focus !== 'explicit_end'
    && (
      focus === 'room'
      || hasExplicitAnalysisPermission
      || (hasRelationshipLicense && (
        focus === 'decision'
        || focus === 'conflict'
      ))
    );
  const activeDispositionId = dispositionCandidate && dispositionMaySurface
    ? dispositionCandidate.id
    : undefined;
  const expressionInstruction = activeDispositionId || previousSpeakerTurns > 0
    ? renderExpressionEvidenceInstruction(
      expressionTendenciesForAgent(speaker.type, tone),
      { turnAct: semanticControl.plan.conversationAct, focus, turnKey: userMessage },
    )
    : '';
  const directorAngleMaySurface = Boolean(activeDispositionId)
    || semanticControl.plan.interactionMode === 'analyze'
    || focus === 'room'
    || plan.forceSummary;
  const directorAngle = directorAngleMaySurface && speaker.angle
    ? speaker.angle
    : '直接接用户这句话，不必展示人物倾向或强行分析';

  const earlier = earlierThisTurn.length
    ? `\n本轮已有人先说了：\n${earlierThisTurn.map((e) => `${characterName(e.type)}：${e.text}`).join('\n')}\n（不要重复他们的观点；如果他们已长篇，你优先换角度或收短。）`
    : '';

  const summaryNote = plan.forceSummary
    ? '\n主持器要求：这个分歧已经拉锯太久。你要先用一两句话总结双方分歧点，再给出下一步，不要继续加码争论。'
    : '';
  const safetyNote = ctx.safetyMode === 'sensitive'
    ? '\n安全模式：用户正处于明显痛苦或创伤语境。保留你的人格核心，但降低刺感和刺激，不争辩、不起哄、不制造依赖；先稳定回应，再给一个很小的现实下一步。'
    : '';
  const detailedAnalysisRequested = /(?:详细|展开|全面|完整|逐项|深度)/u.test(userMessage);
  const analysisScopeNote = semanticControl.plan.interactionMode === 'analyze'
    && !detailedAnalysisRequested
      ? '\n分析节奏：先给最小可用版本，最多 3 个步骤、约 300 字；不铺完整教程或表格。用户继续追问时再展开。'
      : '';

  if (ctx.promptVariant === 'relational' && canonicalCharacter) {
    const dynamicPacket = buildDynamicContextPacket({
      generatedAt: ctx.generatedAt,
      room,
      plan,
      speaker: speaker.type,
      userMessage,
      semanticControl,
      relationshipFocus: focus,
      safetyMode: ctx.safetyMode,
      mutterEnabled: ctx.mutterEnabled,
    });
    return [
      renderDynamicContextPacket(dynamicPacket),
      ...(activeDispositionId ? [buildPilotTurnPresence(speaker.type, {
        focus,
        activeDispositionId,
      })] : []),
      renderSemanticTurnActPlan(semanticControl),
      `【本轮表达编译】
${renderSpeechTypeInstruction(speaker.speechType)}
本轮切入：${directorAngle}${summaryNote}${safetyNote}${analysisScopeNote}
${expressionInstruction ? `${expressionInstruction}\n` : ''}${ctx.antiTemplateNote ?? ''}

只输出共同系统规则指定的 JSON 对象。mutter 必须服从动态上下文中的碎碎念策略；reply 直接接用户当前这句话。`,
    ].join('\n\n');
  }

  const sections = [
    `【房间状态】
场景：${plan.scene}｜用户情绪：${plan.userEmotion}${room.roomGoal ? `｜房间目标：${room.roomGoal}` : ''}
在场：${others ? `${characterName(speaker.type)}（你）、${others}` : `只有你和用户（单聊）`}

【对话记录】
${renderTranscript(room.history, speaker.type)}${earlier}`,

    ...(canonicalCharacter ? [buildPilotTurnPresence(speaker.type, {
      focus,
      ...(activeDispositionId ? { activeDispositionId } : {}),
    })] : []),

    renderSemanticTurnActPlan(semanticControl),

    `【主持器指令】
${renderSpeechTypeInstruction(speaker.speechType)}
你本轮的切入角度：${directorAngle}${summaryNote}${safetyNote}${analysisScopeNote}
${expressionInstruction ? `${expressionInstruction}\n` : ''}${ctx.antiTemplateNote ?? ''}`,

    `【关系记忆】
${renderRelationshipPromptContext(relationshipContext, {
  focus,
  maxEvidence: 3,
})}`,

    `【用户刚刚说】
${userMessage}

现在直接接这句话。只输出对用户说的内容，不加名字、解释或任何前缀。`,
  ];

  return sections.join('\n\n');
}
