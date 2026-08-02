import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import {
  classifySafety,
  createModelBudget,
  createRoom,
  defaultConfig,
  runTurn,
  type EngineConfig,
} from '@persona16/engine';
import { PiAgentRuntime } from '@persona16/runtime-pi';
import { saveArtifact } from './shared';

loadEnv({ path: join(import.meta.dirname, '..', '..', '.env') });

const DEFAULT_MODELS = [
  'deepseek-v4-pro',
  'claude-haiku-4-5',
  'gpt-5.6-luna',
  'claude-sonnet-5',
] as const;

const DEFAULT_CONTROL_MODEL = 'deepseek-v4-flash';
const TRUST_PROMPT =
  '我和最好的朋友吵架了。我知道自己也有问题，但现在不想分析谁对谁错，也不想听建议。先让我难受一会儿，只接住这句话，不要追问。';

interface BoundaryChecks {
  noQuestion: boolean;
  noAdvice: boolean;
  noAnalysis: boolean;
  concise: boolean;
  passed: boolean;
}

function boundaryChecks(text: string): BoundaryChecks {
  const noQuestion = !/[？?]/u.test(text);
  const noAdvice = !/(你应该|我建议|建议你|不如|可以试试|要不|先.{0,8}再)/u.test(text);
  const noAnalysis = !/(你其实|本质上|说明你|因为你|问题在于|这意味着)/u.test(text);
  const concise = [...text].length <= 140;
  return {
    noQuestion,
    noAdvice,
    noAnalysis,
    concise,
    passed: noQuestion && noAdvice && noAnalysis,
  };
}

function requestedModels(): string[] {
  const option = process.argv.find((value) => value.startsWith('--models='));
  if (!option) return [...DEFAULT_MODELS];
  return option
    .slice('--models='.length)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function requestedControlModel(): string {
  const option = process.argv.find((value) => value.startsWith('--control='));
  return option?.slice('--control='.length).trim() || DEFAULT_CONTROL_MODEL;
}

async function probe(model: string, controlModel: string, runtime: PiAgentRuntime) {
  const baseConfig = defaultConfig();
  const config: EngineConfig = {
    ...baseConfig,
    provider: 'aihubmix',
    runtime: 'pi',
    agentModel: model,
    analysisModel: model,
    directorModel: controlModel,
  };
  const room = createRoom(['INTJ']);
  const budget = createModelBudget({ maxDurationMs: 110_000 });
  const startedAt = performance.now();
  const safety = await classifySafety(TRUST_PROMPT, controlModel, undefined, budget);
  const safetyFinishedAt = performance.now();
  let speakerStartedAt: number | undefined;
  let speakerFinishedAt: number | undefined;

  if (safety.bypassRoom) {
    throw new Error(`synthetic trust prompt unexpectedly bypassed as ${safety.level}`);
  }

  const result = await runTurn(
    room,
    TRUST_PROMPT,
    {
      calledAgent: 'INTJ',
      roomId: `trust-balance:${model}`,
      promptVersion: 'trust-balance-v1',
      safetyMode: safety.level,
      onSpeakerStart: () => {
        speakerStartedAt ??= performance.now();
      },
      onSpeakerEnd: () => {
        speakerFinishedAt = performance.now();
      },
    },
    config,
    { runtime, modelBudget: budget },
  );
  const finishedAt = performance.now();
  const response = result.utterances.map(({ text }) => text).join('\n');
  const snapshot = budget.snapshot();

  return {
    model,
    controlModel,
    prompt: TRUST_PROMPT,
    response,
    safetyLevel: safety.level,
    regenerated: result.utterances.some(({ regenerated }) => regenerated),
    checks: boundaryChecks(response),
    latencyMs: {
      total: Math.round(finishedAt - startedAt),
      safety: Math.round(safetyFinishedAt - startedAt),
      prePersona: speakerStartedAt === undefined
        ? null
        : Math.round(speakerStartedAt - safetyFinishedAt),
      persona: speakerStartedAt === undefined || speakerFinishedAt === undefined
        ? null
        : Math.round(speakerFinishedAt - speakerStartedAt),
    },
    usage: snapshot.actualUsage,
  };
}

async function main() {
  if (!process.env.AIHUBMIX_API_KEY) {
    throw new Error('AIHUBMIX_API_KEY is required');
  }
  process.env.PERSONA16_PROVIDER = 'aihubmix';
  const runtime = new PiAgentRuntime();
  const controlModel = requestedControlModel();
  const results: Array<Record<string, unknown>> = [];

  for (const model of requestedModels()) {
    console.log(`\n[trust-balance] ${model}`);
    try {
      const result = await probe(model, controlModel, runtime);
      results.push(result);
      console.log(
        `time=${result.latencyMs.total}ms cost=$${(result.usage.estimatedCostUsd ?? 0).toFixed(6)} ` +
        `calls=${result.usage.calls} boundary=${result.checks.passed ? 'pass' : 'fail'}`,
      );
      console.log(result.response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ model, error: message });
      console.error(`failed: ${message}`);
    }
  }

  const artifact = {
    protocolVersion: 'trust-balance-v1',
    generatedAt: new Date().toISOString(),
    provider: 'aihubmix',
    controlModel,
    syntheticInputOnly: true,
    gatewayAttribution: {
      status: 'not_captured',
      note: 'This harness does not capture per-request X-Aihubmix-Model headers.',
    },
    silentFallback: {
      status: 'unknown',
      note: 'Fallback cannot be ruled out without per-request gateway attribution.',
    },
    results,
  };
  const modelSuffix = requestedModels().join('-vs-').replaceAll(/[^a-z0-9.-]+/giu, '-');
  const controlSuffix = controlModel.replaceAll(/[^a-z0-9.-]+/giu, '-');
  saveArtifact(`trust-balance-wave1-aihubmix-${modelSuffix}-control-${controlSuffix}.json`, artifact);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
