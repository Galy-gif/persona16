import type {
  RelationshipContextFocus,
  RelationshipPromptContext,
} from '../relationship/relationshipContext';
import type { SafetyLevel } from '../safety/safetyRouter';
import type { TurnActKind } from '../turnActPlan';
import type { AgentType } from '../types';

export type SemanticTurnAct =
  | 'acknowledge'
  | 'reflect'
  | 'ask_open'
  | 'ask_directional'
  | 'ask_binary'
  | 'offer_menu'
  | 'advise'
  | 'reopen_decision'
  | 'claim_shared_history'
  | 'assign_responsibility'
  | 'justify_intent'
  | 'stop_intervening';

export interface TurnSemanticRequirements {
  readonly acceptProjectEnd?: boolean;
  readonly handleSelfJudgmentAfterEnd?: boolean;
  readonly acknowledgeImmediateDistress?: boolean;
}

export interface TurnResponseContract {
  userCommitments: readonly string[];
  requiredMoves: readonly string[];
  allowedMoves: readonly string[];
  forbiddenMoves: readonly string[];
  semanticRequirements?: TurnSemanticRequirements;
}

export interface TurnFrame {
  userCommitments: string[];
  explicitDecisions: string[];
  realWorldConstraints: string[];
  requestedMode: 'listen' | 'analyze' | 'advise' | 'decide_together' | 'unspecified';
  deferredRequestedMode?: 'analyze' | 'advise' | 'decide_together';
  pendingRequestedMode?: 'analyze' | 'advise' | 'decide_together';
  consumedPendingRequest: boolean;
  explicitlyForbiddenActs: SemanticTurnAct[];
  mustAddress: string[];
  semanticRequirements: {
    acceptProjectEnd: boolean;
    handleSelfJudgmentAfterEnd: boolean;
    acknowledgeImmediateDistress: boolean;
  };
  evidenceSpans: string[];
}

export interface RelationshipEffect {
  id: string;
  sourceEventIds: string[];
  status: 'active' | 'superseded' | 'resolved' | 'revoked';
  activeWhen: 'always' | 'topic_match' | 'until_repaired' | 'until_revoked';
  forbiddenActs: SemanticTurnAct[];
  requiredActs: SemanticTurnAct[];
  relationshipMove?: RelationshipMove;
}

export type RelationshipMoveKind =
  | 'honor_stated_preference'
  | 'reuse_verified_method';

export interface RelationshipMove {
  kind: RelationshipMoveKind;
  sourceEvidenceId: string;
  sourceEventIds: string[];
  observableCue:
    | 'honest_tentative_judgment'
    | 'lead_with_conclusion'
    | 'reversible_small_experiment'
    | 'concise_response'
    | 'single_question_max'
      | 'avoid_advice'
      | 'lead_with_example';
  outputScope?: 'evidence_bounded_judgment';
  instruction: string;
}

export interface SemanticTurnActPlan {
  conversationAct: TurnActKind;
  conversationInstruction: string;
  safetyMode: Extract<SafetyLevel, 'normal' | 'sensitive'>;
  interactionMode: 'listen' | 'repair' | 'support' | 'analyze' | 'close';
  deferredInteractionMode?: 'analyze' | 'advise' | 'decide_together';
  mustAddress: string[];
  semanticRequirements: TurnFrame['semanticRequirements'];
  advicePolicy: 'allowed' | 'permission_required' | 'forbidden';
  directionalQuestionBudget: 0 | 1;
  menuBudget: 0 | 1;
  reopenDecisionAllowed: boolean;
  responsibilityAct: 'none' | 'observe_gap' | 'request_confirmation' | 'assign';
  forbiddenActs: SemanticTurnAct[];
  requiredActs: SemanticTurnAct[];
  relationshipMove?: RelationshipMove;
  boundaryRepairSubject?: 'listen_only' | 'generic';
  activeEffectIds: string[];
  allowedEvidenceIds: string[];
  currentEvidenceSpans: string[];
  allowedEvidenceSpans: string[];
  bufferUntilValidated: boolean;
}

export interface SemanticTurnControl {
  frame: TurnFrame;
  effects: RelationshipEffect[];
  plan: SemanticTurnActPlan;
}

export type SemanticTurnViolationCode =
  | 'forbidden_directional_question'
  | 'forbidden_advice'
  | 'forbidden_menu'
  | 'forbidden_justification'
  | 'decision_reopened'
  | 'required_semantic_move_missing'
  | 'relationship_move_not_observable'
  | 'unsupported_shared_history'
  | 'unsupported_privacy_claim'
  | 'unsupported_user_inference'
  | 'unit_mismatch'
  | 'response_too_long'
  | 'responsibility_owner_unconfirmed';

export interface SemanticTurnViolation {
  code: SemanticTurnViolationCode;
  evidenceSpan?: string;
  effectId?: string;
  repairInstruction: string;
}

export type SemanticTurnBlockingViolationCode = Exclude<
  SemanticTurnViolationCode,
  'relationship_move_not_observable'
>;

export interface SemanticTurnBlockingViolation extends Omit<
  SemanticTurnViolation,
  'code'
> {
  code: SemanticTurnBlockingViolationCode;
}

export type SemanticTurnQualityObservationCode =
  | 'relationship_move_not_observable'
  | 'response_not_concise'
  | 'user_wording_not_preserved'
  | 'character_voice_weak';

export interface SemanticTurnQualityObservation {
  code: SemanticTurnQualityObservationCode;
  evidenceSpan?: string;
  effectId?: string;
  observation: string;
}

export interface SemanticTurnValidationResult {
  blockingViolations: SemanticTurnBlockingViolation[];
  qualityObservations: SemanticTurnQualityObservation[];
}

export interface CompileSemanticTurnControlInput {
  userMessage: string;
  responseContract?: TurnResponseContract;
  relationshipContext?: RelationshipPromptContext;
  previousUserMessage?: string;
  safetyMode?: Extract<SafetyLevel, 'normal' | 'sensitive'>;
  pendingRequestedMode?: 'analyze' | 'advise' | 'decide_together';
  relationshipFocus?: RelationshipContextFocus;
}

export interface PendingUserRequest {
  mode: 'analyze' | 'advise' | 'decide_together';
  sourceTurnId: string;
}

export interface ImmediateDistressAcknowledgementMatch {
  start: number;
  end: number;
  sentence: string;
}

export type SemanticTurnFallbackKind =
  | 'listen'
  | 'boundary_repair'
  | 'correction'
  | 'neutral';

export interface SemanticTurnFallbackContext {
  agentType?: AgentType;
  turnKey: string;
  recentOpenings?: readonly string[];
}

export interface SemanticTurnFallbackResult {
  text: string;
  fallbackKind: SemanticTurnFallbackKind;
  variantId: string;
}
