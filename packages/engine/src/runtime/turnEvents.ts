import type { AgentType, Scene, SpeechType, UserEmotion } from '../types';

export const TURN_EVENT_VERSION = 1 as const;

export type TurnStopReason =
  | 'complete'
  | 'needs_user_input'
  | 'summary_complete'
  | 'no_new_value'
  | 'budget_exhausted'
  | 'safety_redirect'
  | 'cancelled'
  | 'error';

export type RoomActionEvent =
  | { type: 'speak'; agent: AgentType; speechType: SpeechType; angle: string }
  | { type: 'summarize'; agent: AgentType; reason: string }
  | { type: 'ask_user'; agent: AgentType; question: string }
  | { type: 'stop'; reason: TurnStopReason };

export interface MemoryCandidateEvent {
  id: string;
  agent: AgentType;
  kind: 'preference' | 'repeated_pattern' | 'boundary';
  content: string;
}

interface VersionedTurnEvent {
  v: typeof TURN_EVENT_VERSION;
  turnId: string;
}

export type TurnStreamEvent =
  | (VersionedTurnEvent & { type: 'turn_start' })
  | (VersionedTurnEvent & { type: 'plan'; scene: Scene; userEmotion: UserEmotion })
  | (VersionedTurnEvent & { type: 'room_action'; action: RoomActionEvent })
  | (VersionedTurnEvent & { type: 'speaker_start'; agent: AgentType; speechType: SpeechType })
  | (VersionedTurnEvent & { type: 'delta'; agent: AgentType; delta: string })
  | (VersionedTurnEvent & { type: 'speaker_end'; messageId: string; agent: AgentType; speechType: SpeechType; text: string })
  | (VersionedTurnEvent & { type: 'safety_notice'; level: 'crisis' | 'blocked'; text: string })
  | (VersionedTurnEvent & { type: 'memory_candidate'; candidate: MemoryCandidateEvent })
  | (VersionedTurnEvent & { type: 'turn_end'; stopReason: TurnStopReason; roomVersion: number })
  | (VersionedTurnEvent & { type: 'error'; code: string; message: string; recoverable: boolean });
