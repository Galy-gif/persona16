# ADR-0005: Isolate loop observers and restore pending memory work

- Status: Accepted and implemented
- Date: 2026-07-15
- Decision owners: persona16 maintainers

## Context

The finite RoomLoop correctly owns speaker, pause, safety and budget invariants, but its lifecycle callbacks and file tracer could still throw into the core loop. Separately, candidate memories were durable in the Store but existed in the Web only as transient stream state, so refreshing a room hid the user's unfinished confirmation task.

These are both Harness-boundary problems: optional side effects must not own loop correctness, while unfinished user work must be rehydrated from the truth source.

## Decision

Use three explicit runtime contracts:

1. **Core/Policy** owns ownership, Permission, version checks, safety, room budgets and final persistence. These controls fail closed.
2. **Delivery** owns versioned lifecycle events and streamed text delivery. Message IDs are created by the engine before delivery. A callback failure becomes an explicit `DeliveryCallbackError`; premature EOF or consumer failure becomes Web `DELIVERY_FAILED`.
3. **Observer** owns trace, metrics, analytics and any noncritical lifecycle copy. Observer callbacks are invoked through an isolated boundary, their failures are reported through a secondary safe callback, and they cannot abort the core loop.

The file tracer is fail-open. Initialization, serialization or append failure reports once, disables that tracer, and leaves the conversation running. This decision does not introduce a generic Hook Bus; narrow typed callbacks remain sufficient until a second real external observation adapter exists.

Treat a candidate memory as pending work:

- the Store remains the truth source;
- only candidates from completed turns are visible;
- memory queries may be scoped by the source turn's room;
- room entry and room refresh rehydrate `candidate` records for that room;
- candidates from other rooms are not rendered in the current conversation.

## Consequences

### Positive

- Trace or analytics outages no longer become conversation outages.
- Observer failures remain inspectable without recursive failure handling.
- Stream delivery failures have a distinct operational error code.
- Refreshing a room preserves the user's next available memory action.
- Pending memory cards retain their conversation context instead of becoming user-global noise.

### Negative

- Synchronous file trace writes still add event-loop latency while healthy; buffered asynchronous export remains a future optimization.
- Observer failures can reduce telemetry completeness, so their failure count must be monitored separately.
- Room-scoped memory recovery adds a Store join/filter through the source turn.

## Validation

- Store tests cover room-scoped pending-memory isolation.
- API tests cover room-filtered candidate recovery.
- RoomLoop tests prove an observer exception does not abort a valid turn and a Delivery failure stays explicit.
- Web client tests cover consumer exceptions and premature EOF without a terminal event.
- Tracer tests cover initialization and serialization/write failure isolation.
