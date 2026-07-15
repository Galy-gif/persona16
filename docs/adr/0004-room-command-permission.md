# ADR-0004: Keep Room Command permission in one server module

- Status: Accepted and implemented for direct UI commands
- Date: 2026-07-13
- Decision owners: persona16 maintainers

## Context

Room membership can already be changed from the UI, and the Agent runtime now has a narrow `pause_agent({ agent })` contract. If the UI route and future tool executors each implement their own checks, ownership, confirmation, room policy and concurrency behavior can drift. A prompt instruction cannot grant or enforce permission.

## Decision

Use one server-side RoomCommand module as the seam for every persistent room membership change.

The module accepts trusted `userId`, `roomId`, `expectedVersion`, one narrow command, and a server-created authorization source. It performs checks in this order:

1. load the room through the owner-scoped Store interface;
2. deny `model_inference` and `safety_system` mutations;
3. require a separate confirmation for `remove_agent`;
4. validate the expected room version and busy state;
5. validate room membership invariants;
6. persist with the Store interface's atomic version comparison.

Commands are action-specific: `pause_agent`, `resume_agent`, `invite_agent`, and `remove_agent`. Model-visible tool input never contains `userId`, `roomId`, room version, authorization source, or confirmation state.

## Current scope

- Direct UI commands use authorization source `ui_action`.
- Removing a member requires an explicit client confirmation before retrying with confirmed intent.
- `explicit_user_text` is supported by the module but is not yet produced by the chat pipeline.
- Persona runtime requests still have no Room Command tools and keep `maxTurns=1`.

## Consequences

- UI and future tool executors share one set of room rules.
- A Persona cannot grant itself permission by changing tool arguments.
- Permission, RoomPolicy and optimistic concurrency remain independently testable.
- Natural-language intent detection, confirmation UI, audit records and tool-loop activation remain separate follow-up work.
