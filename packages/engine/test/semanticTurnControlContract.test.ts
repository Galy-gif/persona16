import assert from 'node:assert/strict';
import test from 'node:test';
import * as semanticTurnControl from '../src/semanticTurnControl';
import type {
  AffirmedHistoricalEvidenceClause,
  CompileSemanticTurnControlInput,
  HistoricalEvidenceTime,
  ImmediateDistressAcknowledgementMatch,
  PendingUserRequest,
  RelationshipEffect,
  RelationshipMove,
  RelationshipMoveKind,
  SemanticTurnAct,
  SemanticTurnActPlan,
  SemanticTurnBlockingViolation,
  SemanticTurnBlockingViolationCode,
  SemanticTurnControl,
  SemanticTurnFallbackContext,
  SemanticTurnFallbackKind,
  SemanticTurnFallbackResult,
  SemanticTurnQualityObservation,
  SemanticTurnQualityObservationCode,
  SemanticTurnValidationResult,
  SemanticTurnViolation,
  SemanticTurnViolationCode,
  TurnFrame,
  TurnResponseContract,
  TurnSemanticRequirements,
} from '../src/semanticTurnControl';

type SemanticTurnControlPublicTypeContract = readonly [
  SemanticTurnAct,
  TurnSemanticRequirements,
  TurnResponseContract,
  TurnFrame,
  RelationshipEffect,
  RelationshipMoveKind,
  RelationshipMove,
  SemanticTurnActPlan,
  SemanticTurnControl,
  SemanticTurnViolationCode,
  SemanticTurnViolation,
  SemanticTurnBlockingViolationCode,
  SemanticTurnBlockingViolation,
  SemanticTurnQualityObservationCode,
  SemanticTurnQualityObservation,
  SemanticTurnValidationResult,
  CompileSemanticTurnControlInput,
  PendingUserRequest,
  HistoricalEvidenceTime,
  AffirmedHistoricalEvidenceClause,
  ImmediateDistressAcknowledgementMatch,
  SemanticTurnFallbackKind,
  SemanticTurnFallbackContext,
  SemanticTurnFallbackResult,
];

type AssertPublicTypeContract<T extends SemanticTurnControlPublicTypeContract> = T;
type SemanticTurnControlPublicTypesRemainExported = AssertPublicTypeContract<
  SemanticTurnControlPublicTypeContract
>;

void (undefined as SemanticTurnControlPublicTypesRemainExported | undefined);

test('semantic turn control facade preserves every runtime export', () => {
  assert.deepEqual(Object.keys(semanticTurnControl).sort(), [
    'SEMANTIC_TURN_GENERATION_POLICY',
    'affirmedHistoricalEvidenceClauseRecords',
    'affirmedHistoricalEvidenceClauses',
    'compileRelationshipEffects',
    'compileSemanticTurnControl',
    'compileTurnFrame',
    'findImmediateDistressAcknowledgement',
    'hasSourcedClearPastUserStatement',
    'isEvidenceBoundedDirectContrast',
    'isNarrowFatigueStoppingJudgment',
    'nextPendingUserRequest',
    'renderSemanticTurnActPlan',
    'semanticTurnFallback',
    'semanticTurnGenerationTemperature',
    'validateSemanticTurnDelivery',
    'validateUtteranceAgainstTurnPlan',
  ]);
});
