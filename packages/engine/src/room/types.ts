import type { RoomActionEvent, TurnStopReason } from '../runtime/turnEvents';
import type { AgentType, AgentUtterance, RoomState, SpeakerPlan, TurnPlan } from '../types';

export type RoomAction = RoomActionEvent;

export interface RoomLoopBudget {
  maxNormalSpeakers: number;
  maxSummaries: number;
  maxControllerCalls: number;
  maxDurationMs: number;
  maxGeneratedCharacters: number;
}

export const DEFAULT_ROOM_LOOP_BUDGET: RoomLoopBudget = {
  maxNormalSpeakers: 3,
  maxSummaries: 1,
  maxControllerCalls: 3,
  maxDurationMs: 60_000,
  maxGeneratedCharacters: 6_000,
};

export interface RoomLoopState {
  startedAt: number;
  actions: RoomAction[];
  utterances: AgentUtterance[];
  speakers: SpeakerPlan[];
  normalSpeakers: AgentType[];
  summaryCount: number;
  controllerCalls: number;
  generatedCharacters: number;
  duplicateDetected: boolean;
}

export interface RoomControllerContext {
  room: RoomState;
  /** 本轮原始用户消息；不能从会在循环中追加 Agent 发言的 room.history 尾部推断。 */
  userMessage: string;
  plan: TurnPlan;
  state: Readonly<RoomLoopState>;
  budget: RoomLoopBudget;
  availableSpeakers: SpeakerPlan[];
}

export interface RoomController {
  decide(context: RoomControllerContext): Promise<RoomAction>;
}

export interface RoomLoopReport {
  actions: RoomAction[];
  stopReason: TurnStopReason;
  controllerCalls: number;
  normalSpeakerCount: number;
  summaryCount: number;
  generatedCharacters: number;
  duplicateDetected: boolean;
  elapsedMs: number;
}

export interface RoomLoopResult {
  utterances: AgentUtterance[];
  speakers: SpeakerPlan[];
  report: RoomLoopReport;
}
