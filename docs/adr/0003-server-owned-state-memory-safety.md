# ADR-0003: Keep room state, memory and safety control on the server

- Status: Accepted and implemented
- Date: 2026-07-11
- Decision owners: persona16 maintainers

## Context

The Web prototype previously trusted a complete `RoomState` uploaded from localStorage. That allowed clients to rewrite history, relationship memory and agent state, and it provided no durable idempotency or concurrency boundary. Phase 4 also needs user-confirmed memory and crisis handling that cannot be delegated to a personality prompt.

## Decision

Use PostgreSQL as the production truth source behind a `PersonaStore` port. The in-memory implementation is restricted to local development and deterministic tests.

- A signed anonymous-session cookie owns rooms and memories.
- Clients send `roomId + roomVersion + turnId + command`; they never submit trusted history or relationship state.
- `rooms.version` provides optimistic concurrency. A row lock plus `active_turn_id` allows one active turn per room.
- `turnId + requestHash` is the idempotency boundary. Completed requests replay persisted v1 events; mismatched reuse and concurrent turns return explicit conflicts.
- Active turns have a three-minute lease so a crashed worker cannot lock a room forever.
- `rooms.state_json` is the single persisted source of room membership and pause state; do not maintain a second room-agent projection unless a measured query need introduces a read path for it.
- Versioned turn events, messages, prompt/model metadata, reserved budget and latency are persisted with the completed turn. Adjacent provider deltas from the same speaker are coalesced before persistence, and completed messages/events are inserted in batches without changing replay order.

## Memory decision

Memory is a separate confirmation state machine:

```text
explicit user statement
→ candidate
→ confirmed | rejected
→ deleted
```

Only `confirmed` records from completed turns may enter a prompt. The memory table is the only truth source: injected relationship arrays are cleared before room state is persisted. Failed-turn candidates are hidden and deleted. Each record keeps its source turn/message, status, version and timestamps.

## Safety decision

Safety runs before Director/RoomLoop:

1. deterministic rules immediately catch known crisis and blocked patterns;
2. remaining input uses a structured low-cost classifier;
3. classifier failure conservatively routes to one low-stimulation response;
4. `crisis` and `blocked` bypass personalities and emit an independent `safety_notice` event.

The safety response is stored as `speaker: safety`, never as a Persona utterance.

## Budgets and abuse controls

- User input is capped at 2,000 characters; retained prompt context is capped at 12,000 characters.
- Room output remains capped by speaker, character, controller and duration limits.
- A shared turn model budget reserves worst-case JSON retries: at most 16 calls, 15,000 output tokens and 110 seconds across safety, Director, Controller and Persona execution.
- PostgreSQL-backed fixed windows always limit the anonymous session and also limit the client IP when a trusted IP is available. Proxy headers are trusted only when `PERSONA16_TRUST_PROXY=1` is explicitly configured; without a trusted IP, the IP bucket is skipped instead of collapsing all direct traffic into one shared fallback key.

## Consequences

### Positive

- Client history/relationship tampering cannot affect generation.
- Concurrent tabs cannot generate two turns for one room.
- Retried completed requests are deterministic event replays.
- Unconfirmed or deleted memory cannot leak into prompts or room JSON.
- Crisis output is visibly and architecturally separate from personality roleplay.
- Production instances share ownership, rate and turn state through PostgreSQL.

### Negative

- Production now requires PostgreSQL and a session-signing secret.
- A turn completes atomically only after generation, so streamed partial text can still precede a later recoverable persistence error.
- Budget reservations use worst-case output allocations rather than exact provider usage; Phase 5 should add actual usage reconciliation and online SLO dashboards.
