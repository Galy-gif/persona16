# ADR-0001: Use Pi as the base Agent Runtime

- Status: Accepted and implemented for DeepSeek persona generation
- Date: 2026-07-11
- Decision owners: persona16 maintainers

## Context

persona16 already owns the product-specific behavior that creates its value: 16 persona definitions, tone sampling, dynamic relationship state, deterministic speaker scoring, room conflict management, anti-template checks, safety policy, and evaluation suites.

The current `llm.ts` also owns generic infrastructure concerns such as provider selection, model streaming, structured output, and retry behavior. Rebuilding a general agent loop would add maintenance cost without differentiating the product.

Pi provides an MIT-licensed TypeScript agent runtime and multi-provider model layer. Its independent runtime packages expose state, event streaming, tool execution, cancellation and stop hooks without requiring the coding-agent user interface.

## Decision

Use Pi as persona16's base single-agent runtime through an internal adapter.

- `@persona16/engine` defines and consumes its own `AgentRuntime` port.
- A new `@persona16/runtime-pi` package will be the only workspace package allowed to import Pi packages.
- Prefer Pi's independent agent-core and AI packages. Do not embed or fork the complete coding-agent product.
- Keep room orchestration in persona16. Pi's tool loop executes one selected persona; it does not choose the room's speakers or own room stop conditions.
- Keep the legacy runtime behind configuration until the Pi path passes regression, latency, cancellation and cost gates.

## Responsibility boundary

### Pi runtime owns

- Provider/model integration.
- Single-agent message state and lifecycle.
- Streaming runtime events.
- Tool-call execution when product tools are explicitly enabled.
- Cancellation, retry integration, usage and cost reporting.

### persona16 owns

- Persona identity, prompt composition and tone behavior.
- Director assessments and deterministic room policy.
- Multi-persona room loop and hard budgets.
- Relationship memory policy and user confirmation.
- Safety routing and dependency-risk restrictions.
- Product traces, badcase labels and evaluation gates.

## Constraints

- Engine code must not expose Pi-specific messages or events in its public contract.
- The MVP enables no general file, shell, browser or write tools.
- Product tools use an explicit allowlist and JSON-schema inputs.
- Pi versions are pinned through the workspace lockfile and upgraded only after compatibility tests.
- Structured controller output may temporarily retain a dedicated JSON adapter if the Pi runtime path cannot meet schema reliability requirements.

## Consequences

### Positive

- Avoids maintaining a generic agent loop and provider matrix.
- Gives the product a standard event and cancellation lifecycle.
- Preserves persona16 as the owner of its differentiating behavior.
- Provides a replaceable boundary if Pi no longer fits.

### Negative

- Adds an upstream dependency and upgrade surface.
- Requires mapping between Pi and product event/message types.
- Pi is oriented toward agentic tool use, so persona16 must explicitly disable coding-oriented defaults.
- Runtime migration can change timing and sampling behavior, so full personality regression is mandatory.

## Rollout

1. Freeze the legacy quality baseline.
2. Add the runtime-neutral port and faux runtime tests.
3. Build a one-persona Pi spike with DeepSeek.
4. Run legacy/Pi comparisons for quality, latency, cost and cancellation.
5. Migrate single chat before the multi-persona room loop.
6. Keep a configuration rollback for one release window.

## Implementation result

The first rollout passed on 2026-07-11:

- Pi Agent Core / Pi AI pinned to 0.80.6.
- Runtime-neutral port and Pi adapter implemented.
- 17/17 deterministic tests passed.
- Frozen Pi blind test met all PRD gates and matched or improved top-3 identification.
- Default and legacy rollback full-chain DeepSeek smokes passed.
- Next.js production build passed with Pi externalized as a server dependency.

DeepSeek persona generation now defaults to Pi. Structured Director/Judge calls and Anthropic persona generation remain on the legacy adapter until separately migrated.

## References

- https://github.com/earendil-works/pi
- https://github.com/earendil-works/pi/blob/main/packages/agent/README.md
- https://github.com/earendil-works/pi/blob/main/packages/ai/README.md
