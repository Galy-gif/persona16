import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
  PILOT_CHARACTER_SCENARIOS,
  PILOT_PROMPT_ASSEMBLY_VERSION,
  PILOT_ROOM_PARTICIPATION_VERSION,
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

const EXPECTED_SIGNATURE = {
  promptAssemblyVersion: PILOT_PROMPT_ASSEMBLY_VERSION,
  provider: 'test-provider',
  runtime: 'test-runtime',
  agentModel: 'test-agent',
  judgeModel: 'test-judge',
  roomArbitratorModel: 'test-room-arbitrator',
  roomParticipationVersion: PILOT_ROOM_PARTICIPATION_VERSION,
} as const;

function completeArtifact(scenarioIds: readonly string[] = EXPECTED_IDS) {
  const agents = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'];
  return {
    complete: true,
    canonVersion: '0.3',
    evaluationProtocolVersion: PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
    evaluationSignature: EXPECTED_SIGNATURE,
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
  assert.equal(PILOT_CHARACTER_EVAL_PROTOCOL_VERSION, '0.5');
  assert.equal(PILOT_PROMPT_ASSEMBLY_VERSION, 'pilot-runtime-prompt-v0.4');
  assert.equal(PILOT_ROOM_PARTICIPATION_VERSION, 'pilot-room-participation-v0.1');
  assert.deepEqual(ids, EXPECTED_IDS);
  assert.equal(new Set(ids).size, 9);
  assert.equal(PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'shared-joy')?.contextFocus, 'ordinary');
  assert.equal(PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'explicit-end')?.contextFocus, 'explicit_end');
  const selfJudgment = PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === 'self-judgment-after-end');
  assert.ok(selfJudgment?.responseContract.userCommitments.some((item) => item.includes('项目')));
  assert.ok(selfJudgment?.responseContract.requiredMoves.some((item) => item.includes('接受')));
  assert.ok(selfJudgment?.responseContract.forbiddenMoves.some((item) => item.includes('审问')));
});

test('room-only reuse requires a complete current-protocol nine-scenario artifact', () => {
  const canReuse = (artifact: unknown) => canReusePilotCharacterResults(
    artifact,
    '0.3',
    EXPECTED_SIGNATURE,
  );
  assert.equal(canReuse(completeArtifact()), true);
  assert.equal(canReusePilotCharacterResults({
    ...completeArtifact(EXPECTED_IDS.slice(0, 8)),
    evaluationProtocolVersion: '0.1',
  }, '0.3', EXPECTED_SIGNATURE), false);
  assert.equal(canReuse({ ...completeArtifact(), complete: false }), false);
  assert.equal(canReuse({ ...completeArtifact(), evaluationSignature: undefined }), false);
  assert.equal(canReuse({ ...completeArtifact(), canonVersion: '0.2' }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    evaluationSignature: { ...EXPECTED_SIGNATURE, agentModel: 'different-agent' },
  }), false);
  assert.equal(canReuse({
    ...completeArtifact(),
    evaluationSignature: { ...EXPECTED_SIGNATURE, provider: 'different-provider' },
  }), false);
  const { relationshipContrasts: _, ...withoutRelationshipContrasts } = completeArtifact();
  assert.equal(canReuse(withoutRelationshipContrasts), false);
});
