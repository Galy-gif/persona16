import type { RoomActionEvent, TurnStopReason } from '../runtime/turnEvents';
import type { AgentType, AgentUtterance, RoomState, SpeakerPlan, TurnPlan } from '../types';
import {
  DEFAULT_ROOM_LOOP_BUDGET,
  type RoomAction,
  type RoomLoopBudget,
  type RoomLoopState,
} from './types';

export function createRoomLoopState(now = Date.now()): RoomLoopState {
  return {
    startedAt: now,
    actions: [],
    utterances: [],
    speakers: [],
    normalSpeakers: [],
    summaryCount: 0,
    controllerCalls: 0,
    generatedCharacters: 0,
    duplicateDetected: false,
  };
}

export function initialRoomAction(plan: TurnPlan): RoomAction {
  const first = plan.speakers[0];
  if (!first) return { type: 'stop', reason: 'no_new_value' };
  if (plan.forceSummary) {
    return { type: 'summarize', agent: first.type, reason: '争论已达到收束阈值' };
  }
  return {
    type: 'speak',
    agent: first.type,
    speechType: first.speechType,
    angle: first.angle,
  };
}

function isActive(room: RoomState, agent: AgentType): boolean {
  return room.agents.some((candidate) => candidate.type === agent && !candidate.paused);
}

function isPlanned(plan: TurnPlan, agent: AgentType): boolean {
  return plan.speakers.some((speaker) => speaker.type === agent);
}

export function forcedStopReason(
  state: Readonly<RoomLoopState>,
  budget: RoomLoopBudget = DEFAULT_ROOM_LOOP_BUDGET,
  now = Date.now(),
): TurnStopReason | undefined {
  if (now - state.startedAt >= budget.maxDurationMs) return 'budget_exhausted';
  if (state.generatedCharacters >= budget.maxGeneratedCharacters) return 'budget_exhausted';
  return undefined;
}

export function validateRoomAction(
  proposed: RoomAction,
  room: RoomState,
  plan: TurnPlan,
  state: Readonly<RoomLoopState>,
  budget: RoomLoopBudget = DEFAULT_ROOM_LOOP_BUDGET,
  now = Date.now(),
): RoomAction {
  const forced = forcedStopReason(state, budget, now);
  if (forced) return { type: 'stop', reason: forced };
  if (proposed.type === 'stop') return proposed;

  if (!isActive(room, proposed.agent)) return { type: 'stop', reason: 'no_new_value' };

  if (proposed.type === 'summarize') {
    if (state.summaryCount >= budget.maxSummaries) return { type: 'stop', reason: 'summary_complete' };
    return proposed;
  }

  if (proposed.type === 'ask_user') {
    if (!proposed.question.trim()) return { type: 'stop', reason: 'no_new_value' };
    return proposed;
  }

  if (state.normalSpeakers.length >= budget.maxNormalSpeakers) {
    return { type: 'stop', reason: 'budget_exhausted' };
  }
  if (!isPlanned(plan, proposed.agent)) return { type: 'stop', reason: 'no_new_value' };
  if (state.normalSpeakers.includes(proposed.agent)) return { type: 'stop', reason: 'no_new_value' };
  const planned = plan.speakers.find((speaker) => speaker.type === proposed.agent);
  const longCount = state.speakers.filter((speaker) => speaker.speechType === '长发言').length;
  if (proposed.speechType === '长发言' && (planned?.speechType !== '长发言' || longCount >= 2)) {
    return { ...proposed, speechType: '短句' };
  }
  return proposed;
}

export function speakerPlanForAction(action: Exclude<RoomAction, { type: 'stop' }>, plan: TurnPlan): SpeakerPlan {
  const planned = plan.speakers.find((speaker) => speaker.type === action.agent);
  const base = {
    type: action.agent,
    finalScore: planned?.finalScore ?? 60,
    toneShift: planned?.toneShift,
  };
  if (action.type === 'speak') {
    return { ...base, speechType: action.speechType, angle: action.angle };
  }
  if (action.type === 'ask_user') {
    return { ...base, speechType: '追问', angle: `只追问这个缺失信息：${action.question}` };
  }
  return {
    ...base,
    speechType: '长发言',
    angle: `收束当前讨论：${action.reason}。总结分歧并给出下一步。`,
  };
}

function normalizedBigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  const grams = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index++) {
    grams.add(normalized.slice(index, index + 2));
  }
  return grams;
}

export function utteranceSimilarity(left: string, right: string): number {
  if (left.length < 20 || right.length < 20) return 0;
  const a = normalizedBigrams(left);
  const b = normalizedBigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function isLikelyDuplicate(utterance: AgentUtterance, previous: AgentUtterance[]): boolean {
  return previous.some((candidate) => utteranceSimilarity(utterance.text, candidate.text) >= 0.72);
}

export function recordExecutedAction(
  state: RoomLoopState,
  action: Exclude<RoomActionEvent, { type: 'stop' }>,
  speaker: SpeakerPlan,
  utterance: AgentUtterance,
): void {
  state.actions.push(action);
  state.speakers.push(speaker);
  state.generatedCharacters += utterance.text.length;
  if (action.type === 'speak') state.normalSpeakers.push(action.agent);
  if (action.type === 'summarize') state.summaryCount += 1;
  state.duplicateDetected = isLikelyDuplicate(utterance, state.utterances);
  state.utterances.push(utterance);
}
