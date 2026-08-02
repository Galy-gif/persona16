import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectAgentModel,
  selectAgentThinkingLevel,
} from '../src/reasoningPolicy';

test('spends reasoning only when the interaction actually needs analysis', () => {
  assert.equal(
    selectAgentThinkingLevel({
      interactionMode: 'listen',
      model: 'deepseek-v4-pro',
      maxTokens: 400,
    }),
    'off',
  );
  assert.equal(
    selectAgentThinkingLevel({
      interactionMode: 'repair',
      model: 'claude-sonnet-5',
      maxTokens: 400,
    }),
    'off',
  );
  assert.equal(
    selectAgentThinkingLevel({
      interactionMode: 'analyze',
      model: 'deepseek-v4-pro',
      maxTokens: 1200,
    }),
    'high',
  );
});

test('disables reasoning when a gateway model needs more tokens than the turn budget', () => {
  assert.equal(
    selectAgentThinkingLevel({
      interactionMode: 'analyze',
      model: 'claude-haiku-4-5',
      maxTokens: 1200,
    }),
    'off',
  );
});

test('does not request reasoning from a gateway model that explicitly lacks it', () => {
  assert.equal(
    selectAgentThinkingLevel({
      interactionMode: 'analyze',
      model: 'gemini-3.1-flash-lite-nothink',
      maxTokens: 1200,
    }),
    'off',
  );
});

test('uses a relational default model and a separate analysis model when configured', () => {
  const config = {
    provider: 'aihubmix' as const,
    runtime: 'pi' as const,
    agentModel: 'gpt-5.6-luna',
    analysisModel: 'deepseek-v4-pro',
    directorModel: 'deepseek-v4-flash',
  };

  assert.equal(selectAgentModel(config, 'listen'), 'gpt-5.6-luna');
  assert.equal(selectAgentModel(config, 'repair'), 'gpt-5.6-luna');
  assert.equal(selectAgentModel(config, 'analyze'), 'deepseek-v4-pro');
  assert.equal(
    selectAgentModel({ ...config, analysisModel: undefined }, 'analyze'),
    'gpt-5.6-luna',
  );
});
