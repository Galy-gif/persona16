# ADR-0002: Use a finite, policy-guarded room loop

- Status: Accepted and implemented
- Date: 2026-07-11
- Decision owners: persona16 maintainers

## Context

The original room engine called the Director once, selected up to three speakers, then generated every planned response in sequence. Later speakers could read earlier responses, but the system could not reconsider whether they still added value, whether a clarification was needed, or whether the disagreement should be summarized.

An unrestricted LLM-driven loop would improve adaptability but weaken reproducibility, cost control and safety. The product needs stepwise re-evaluation without giving the model authority to bypass deterministic speaker rules.

## Decision

Use a two-stage, finite room loop:

1. The existing Director classifies the scene and produces scored speaker candidates.
2. After each visible utterance, a RoomController proposes exactly one next action: `speak`, `summarize`, `ask_user` or `stop`.
3. A deterministic RoomPolicy validates every proposal before execution.

Pi executes the selected persona. persona16 remains the owner of room orchestration.

## Deterministic constraints

- Only active agents may act.
- Normal `speak` actions must come from the Director's planned candidate list.
- A normal agent may speak at most once per user turn.
- At most three normal speakers and one summary are allowed.
- At most two normal long speeches are allowed; the controller cannot upgrade a planned short speaker to long.
- Controller calls, elapsed time and generated characters have explicit budgets.
- A clarification question and a summary terminate the current turn.
- Dangerous user emotion stops multi-person continuation after the first safe response.
- Near-duplicate replies stop further continuation.

## Event and trace contract

The Web stream is versioned with `v: 1` and a `turnId`. It emits room actions, speaker lifecycle events and a terminal stop reason. Tracing records:

- initial Director decision and plan;
- each proposed/validated room action;
- each completed action;
- non-delta Pi runtime lifecycle events;
- the final loop report and stop reason.

## Consequences

### Positive

- Later responses are conditional on what was actually said.
- The engine can stop when no new value remains.
- Clarification and summary become first-class actions.
- Every continuation and stop is inspectable.
- LLM flexibility cannot bypass deterministic room limits.

### Negative

- Multi-agent turns add one cheap controller call after most utterances.
- Latency and cost increase compared with a single precomputed plan.
- Character-bigram duplicate detection is only a deterministic guard; semantic duplication still relies on the controller and evals.
- The room-wide time budget is enforced between actions, while each Pi generation retains its own hard timeout.

## Validation

- 29/29 deterministic tests passed.
- Four adversarial room cases passed: repeated speaker, unplanned speaker, all-long upgrade and paused initial speaker.
- Six production-model room chemistry combinations passed 6/6.
- A trace-enabled live smoke recorded Director → actions → Pi runtime events → final stop reason.
