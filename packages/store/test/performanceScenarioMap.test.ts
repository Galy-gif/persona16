import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePerformanceScenarioMap } from '../src/performanceScenarioMap';

test('performance scenarios bind stable ids to exact turns', () => {
  assert.deepEqual(parsePerformanceScenarioMap(JSON.stringify({
    'turn-a': 'ordinary_greeting',
    'turn-b': 'boundary_repair',
  })), {
    'turn-a': 'ordinary_greeting',
    'turn-b': 'boundary_repair',
  });
  assert.throws(() => parsePerformanceScenarioMap('{}'), /between 1 and 5000/u);
  assert.throws(() => parsePerformanceScenarioMap('{"turn-a":"Bad Label"}'), /lowercase stable ids/u);
  assert.throws(() => parsePerformanceScenarioMap('[]'), /JSON object/u);
});
