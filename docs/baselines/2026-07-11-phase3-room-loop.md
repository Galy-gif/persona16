# Phase 3 finite room-loop baseline — 2026-07-11

## Implementation

- `room/roomController.ts`: LLM next-action proposal.
- `room/roomPolicy.ts`: deterministic validation, budgets and duplicate guard.
- `room/roomLoop.ts`: finite execution loop.
- `engine.ts`: Director → RoomLoop → Pi persona integration.
- Web API/client: versioned v1 action and terminal events.
- Runtime-aware tracing excludes text deltas but records lifecycle, usage, errors and stop reasons.

## Automated evidence

- `pnpm test`: 29/29 passed.
- `pnpm eval:room-adversarial`: 4/4 passed.
- `pnpm eval:rooms`: 6/6 passed.
- `pnpm typecheck`: all workspaces passed.
- `pnpm --filter @persona16/web build`: production build passed.

## Adversarial cases

| Case | Expected protection | Result |
| --- | --- | --- |
| repeated speaker loop | Stop when controller reselects a used normal speaker | Pass |
| unplanned speaker | Stop when controller bypasses Director candidates | Pass |
| all-long upgrade | Downgrade so at most two long speeches remain | Pass |
| paused initial speaker | Do not execute a paused planned speaker | Pass |

## Live room chemistry

All combinations retained natural disagreement, avoided personal attack, converged and gave a next step:

- INTJ + ENFP
- ENTP + ISTJ
- INFP + ESTJ
- INFJ + ESTP
- ESFJ + INTP
- ISFP + ENTJ

Result: 6/6.

## Trace evidence

The trace-enabled INTJ + ENFP smoke recorded:

- Director decisions: 1
- Initial turn plans: 1
- Room actions: 3
- Completed room actions: 2
- Pi runtime lifecycle events: 6
- Final stop reason: `no_new_value`

Action chain:

```text
INTJ speak(long)
→ ENFP speak(short, explicitly adding a new possibility angle)
→ stop(no_new_value)
```

## Known follow-ups

- Persist turn events server-side in Phase 4/5 rather than relying on JSONL files.
- Add online metrics for controller-call count, stop-reason distribution, latency and cost.
- Improve semantic duplicate evaluation from collected badcases; do not replace the deterministic guard with an unbounded judge call.
- Keep voice transport outside the room engine; future interruption should map to the existing cancellation/stop contract.
