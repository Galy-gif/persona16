import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
  PILOT_CHARACTER_SCENARIOS,
  canReusePilotCharacterResults,
} from '../src/pilotCharacterScenarios';

const EXPECTED_IDS = [
  'quit-without-buffer',
  'listen-no-advice',
  'rejected-correct-advice',
  'user-corrects-misread',
  'room-responsibility-conflict',
  'repair-after-boundary-violation',
  'explicit-end',
  'self-judgment-after-end',
  'shared-joy',
] as const;

function completeArtifact(scenarioIds: readonly string[] = EXPECTED_IDS) {
  const agents = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'];
  return {
    complete: true,
    canonVersion: '0.3',
    evaluationProtocolVersion: PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
    results: agents.map((agent) => ({
      agent,
      replies: scenarioIds.map((id) => ({ scenario: { id } })),
    })),
    relationshipContrasts: agents.map((agent) => ({
      agent,
      replies: ['R0', 'R1', 'R2'].map((relationship) => ({ relationship })),
    })),
  };
}

test('pilot character protocol has exactly nine unique ordered scenarios', () => {
  const ids = PILOT_CHARACTER_SCENARIOS.map((scenario) => scenario.id);
  assert.equal(PILOT_CHARACTER_EVAL_PROTOCOL_VERSION, '0.2');
  assert.deepEqual(ids, EXPECTED_IDS);
  assert.equal(new Set(ids).size, 9);
});

test('room-only reuse requires a complete current-protocol nine-scenario artifact', () => {
  assert.equal(canReusePilotCharacterResults(completeArtifact(), '0.3'), true);
  assert.equal(canReusePilotCharacterResults({
    ...completeArtifact(EXPECTED_IDS.slice(0, 8)),
    evaluationProtocolVersion: '0.1',
  }, '0.3'), false);
  assert.equal(canReusePilotCharacterResults({ ...completeArtifact(), complete: false }, '0.3'), false);
  assert.equal(canReusePilotCharacterResults({ ...completeArtifact(), canonVersion: '0.2' }, '0.3'), false);
  const { relationshipContrasts: _, ...withoutRelationshipContrasts } = completeArtifact();
  assert.equal(canReusePilotCharacterResults(withoutRelationshipContrasts, '0.3'), false);
});
