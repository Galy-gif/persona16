import { getAiHubMixModelProfile } from './modelCatalog';
import type { RuntimeThinkingLevel } from './runtime/agentRuntime';
import type { SemanticTurnActPlan } from './semanticTurnControl';
import type { EngineConfig } from './types';

export interface SelectAgentThinkingLevelInput {
  interactionMode: SemanticTurnActPlan['interactionMode'];
  model: string;
  maxTokens: number;
}

export function selectAgentModel(
  config: EngineConfig,
  interactionMode: SemanticTurnActPlan['interactionMode'],
): string {
  return interactionMode === 'analyze'
    ? config.analysisModel ?? config.agentModel
    : config.agentModel;
}

/**
 * 陪伴型对话按本轮任务分配思考预算，而不是把“高思考”当成固定人格动作。
 * 倾听、支持、修复和自然收尾优先即时回应；只有明确分析任务默认使用高思考。
 */
export function selectAgentThinkingLevel(
  input: SelectAgentThinkingLevelInput,
): RuntimeThinkingLevel {
  if (input.interactionMode !== 'analyze') return 'off';
  const profile = getAiHubMixModelProfile(input.model);
  if (profile?.reasoning === false) return 'off';
  if (
    profile?.minimumReasoningMaxTokens !== undefined &&
    input.maxTokens < profile.minimumReasoningMaxTokens
  ) {
    return 'off';
  }
  return 'high';
}
