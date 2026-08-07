import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRelationshipEvent,
  createRelationshipBranch,
  createRoom,
} from '@persona16/engine';
import { applyRelationshipBranchContexts } from '../src/relationshipProjection';

test('relationship branches project active boundaries into the turn context', () => {
  const room = createRoom(['INTJ']);
  let branch = applyRelationshipEvent(createRelationshipBranch('legacy-intj'), {
    id: 'boundary-listen', sourceTurnId: 'turn-boundary', type: 'boundary_set',
    content: '用户明确说只想被听见时，不继续给方案',
  });
  branch = applyRelationshipEvent(branch, {
    id: 'rupture-listen', sourceTurnId: 'turn-rupture', type: 'meaningful_disagreement',
    content: '人物越过已知边界，继续替用户安排下一步',
  });

  applyRelationshipBranchContexts(room, [{
    userId: 'user-a', agent: 'INTJ', characterId: 'legacy-intj', branch,
    version: 2, updatedAt: new Date(0),
  }]);

  const context = room.agents[0]!.relationship.promptContext;
  assert.equal(context?.climate, 'tense');
  assert.deepEqual(context?.evidence.map((evidence) => evidence.kind), [
    'boundary', 'tension', 'turning_point',
  ]);
});

test('matching branch evidence keeps memory message and time provenance', () => {
  const room = createRoom(['INTJ']);
  room.agents[0]!.relationship.promptContext = {
    memoryEnabled: true,
    evidence: [{
      id: 'memory-preference-1', kind: 'preference', content: '用户希望先看到真实例子',
      traceability: 'traceable', sourceTurnId: 'turn-source', sourceMessageId: 'message-source',
      recordedAt: '2026-08-07T00:00:00.000Z',
    }],
  };
  const branch = applyRelationshipEvent(createRelationshipBranch('legacy-intj'), {
    id: 'memory:preference-1', sourceTurnId: 'turn-source', type: 'preference_stated',
    content: '用户希望先看到真实例子',
  });

  applyRelationshipBranchContexts(room, [{
    userId: 'user-a', agent: 'INTJ', characterId: 'legacy-intj', branch,
    version: 1, updatedAt: new Date(0),
  }]);

  const [evidence] = room.agents[0]!.relationship.promptContext?.evidence ?? [];
  assert.equal(evidence?.traceability, 'traceable');
  if (evidence?.traceability === 'traceable') {
    assert.equal(evidence.sourceMessageId, 'message-source');
    assert.equal(evidence.recordedAt, '2026-08-07T00:00:00.000Z');
  }
});

test('active boundaries survive more than fifty ordinary relationship events', () => {
  const room = createRoom(['INTJ']);
  let branch = createRelationshipBranch('legacy-intj');
  for (let index = 0; index < 55; index += 1) {
    branch = applyRelationshipEvent(branch, {
      id: `context-${index}`, sourceTurnId: `turn-${index}`, type: 'context_shared',
      content: `普通共同语境 ${index}`,
    });
  }
  branch = applyRelationshipEvent(branch, {
    id: 'boundary-after-context', sourceTurnId: 'turn-boundary', type: 'boundary_set',
    content: '用户明确说只想被听见时，不继续给方案',
  });

  applyRelationshipBranchContexts(room, [{
    userId: 'user-a', agent: 'INTJ', characterId: 'legacy-intj', branch,
    version: 56, updatedAt: new Date(0),
  }]);

  assert.ok(room.agents[0]!.relationship.promptContext?.evidence.some((item) => (
    item.id === 'boundary:boundary-after-context'
  )));
});
