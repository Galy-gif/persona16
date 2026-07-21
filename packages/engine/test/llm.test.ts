import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultConfig, defaultJudgeModel } from '../src/llm';

const MODEL_ENV_KEYS = [
  'PERSONA16_PROVIDER',
  'PERSONA16_AGENT_MODEL',
  'PERSONA16_DIRECTOR_MODEL',
  'PERSONA16_JUDGE_MODEL',
] as const;

test('uses explicit DeepSeek V4 Pro model IDs for every default role', () => {
  const previous = Object.fromEntries(MODEL_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    process.env.PERSONA16_PROVIDER = 'deepseek';
    delete process.env.PERSONA16_AGENT_MODEL;
    delete process.env.PERSONA16_DIRECTOR_MODEL;
    delete process.env.PERSONA16_JUDGE_MODEL;

    const config = defaultConfig();

    assert.equal(config.agentModel, 'deepseek-v4-pro');
    assert.equal(config.directorModel, 'deepseek-v4-pro');
    assert.equal(defaultJudgeModel(), 'deepseek-v4-pro');
  } finally {
    for (const key of MODEL_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
