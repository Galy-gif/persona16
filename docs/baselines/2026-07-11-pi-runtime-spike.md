# Pi Runtime spike — 2026-07-11

## Scope

Validate that persona16 can use Pi as a runtime behind the runtime-neutral `AgentRuntime` port without migrating the existing room engine.

## Pinned dependencies

- `@earendil-works/pi-agent-core`: `0.80.6`
- `@earendil-works/pi-ai`: `0.80.6`

Both versions are exact in `packages/runtime-pi/package.json` and locked by pnpm.

## Supply-chain decision

Pi's provider graph brought in two packages with install scripts that are not needed by the DeepSeek or faux-provider path:

- `@google/genai@1.52.0`
- `protobufjs@7.6.5`

Their scripts remain explicitly blocked with `allowBuilds: false` in `pnpm-workspace.yaml`. Existing approved builds for `esbuild` and `sharp` remain unchanged.

## Implemented

- New workspace package: `@persona16/runtime-pi`.
- Pi lifecycle → persona16 `RuntimeEvent` mapping.
- Text delta streaming.
- Product-tool adapter with JSON-schema parameters and sequential execution.
- Model lookup with a compatibility alias for the existing `deepseek-chat` configuration.
- Runtime validation for duplicate run IDs, missing models and invalid transcripts.
- External cancellation, timeout and max-turn enforcement.
- Usage/cost event mapping when the provider reports it.
- No coding-agent file, shell, browser or write tools are enabled.
- The default model registry only bundles the DeepSeek provider. This avoids pulling Pi's full provider/OAuth graph into the Next.js server bundle; Anthropic remains on the legacy runtime until its minimal provider adapter is verified.

## Automated evidence

`pnpm test` passes 17/17 tests, including Pi adapter cases for:

1. Lifecycle and text streaming through Pi's faux provider.
2. Typed error for an unknown model.
3. Rejection of a transcript that does not end with a user message.
4. External cancellation.
5. Non-zero usage mapping.
6. Recoverable provider errors.
7. Deterministic timeout enforcement.

`pnpm typecheck` passes all four code-bearing workspace projects, including `@persona16/runtime-pi`.

## Live DeepSeek evidence

Command:

```bash
pnpm --filter @persona16/eval pi:smoke
```

Result:

- Provider/model: DeepSeek through the existing `deepseek-chat` config.
- Persona: INTJ.
- Runtime stop reason: `complete`.
- Non-empty streamed output received within the 30-second hard timeout.

The smoke script loads the existing root environment at runtime and never prints credentials.

## Frozen runtime regression

The Pi blind test writes separate `blindtest-pi.json` / `.html` artifacts and does not overwrite the legacy baseline.

| Case | Legacy top-3 | Pi top-3 | Legacy/Pi homogeneity | Pi average latency | Pi P95 latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| `q1-quit-job` | 14/16 | 14/16 | 2/5 → 2/5 | 2669 ms | 14969 ms |
| `q2-no-work` | 15/16 | 16/16 | 2/5 → 2/5 | 2865 ms | 9638 ms |

Both cases meet the PRD identification, homogeneity, short/long reply and opening-diversity gates. The generated comparison is stored in `eval/artifacts/runtime-regression.json`.

## Full-chain and rollback evidence

- Default `runTurn`: Director structured JSON → deterministic scoring → Pi persona generation succeeded with INTJ + ENFP.
- `PERSONA16_RUNTIME=legacy`: the same full-chain smoke succeeded, preserving the rollback path.
- Pi is now the default for DeepSeek persona generation. Director/Judge JSON remains on the dedicated legacy adapter.
- Anthropic remains legacy by default until a minimal Pi Anthropic provider adapter is separately verified.

## Web production build

Pi's packages are explicit Web server dependencies and listed in Next `serverExternalPackages`. This keeps Pi's provider/OAuth graph out of the webpack server bundle. `pnpm --filter @persona16/web build` completes without the earlier dynamic-import or Node builtin warnings.

## Phase 1 decision

Phase 1 migration gate passed. Keep the legacy runtime for one release window and proceed to runtime-aware room-loop work; do not migrate structured Director JSON during this phase.
