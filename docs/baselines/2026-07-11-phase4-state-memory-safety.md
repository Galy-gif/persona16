# Phase 4 server state, memory and safety baseline — 2026-07-11

## Implemented chain

- Drizzle PostgreSQL schema and four forward migrations.
- Production `PostgresPersonaStore` plus deterministic in-memory reference Store.
- Signed anonymous ownership, server-created rooms and command-only APIs.
- Optimistic room versions, row locks, idempotent turn replay and stale-turn lease recovery.
- Persisted messages, typed v1 events, prompt/model metadata, reserved usage and latency.
- Candidate → confirm/reject → inject → delete memory lifecycle with source and version.
- Rule + structured safety routing, independent crisis/blocked bypass and sensitive single-speaker mode.
- Shared user/IP rate limits and a unified hard model budget.
- Web client no longer stores or uploads trusted RoomState; localStorage contains navigation metadata only.

## Automated evidence

- `pnpm typecheck`: all workspaces passed.
- `pnpm test` + `PERSONA16_TEST_DATABASE_URL=… pnpm --filter @persona16/store test:postgres`: 61/61 passed（60 个非数据库用例 + 1 个真实 PostgreSQL migration/并发/重放用例）。
- PostgreSQL cross-connection tests passed for locking, replay, shared rate limits, memory lifecycle and stale lease recovery.
- `pnpm eval:safety`: 6/6 passed.
- `pnpm eval:room-adversarial`: 4/4 passed.
- `pnpm eval:phase4-smoke`: live safety classifier → Director → Pi → memory candidate → confirm chain passed.
- `pnpm eval:rooms`: live room chemistry remained 6/6.
- `pnpm --filter @persona16/web build`: production build passed with all APIs dynamic.

## Exit-gate evidence

| Gate | Evidence | Result |
| --- | --- | --- |
| Client cannot rewrite history/relationship | API test uploads forged RoomState; persisted history contains only server input | Pass |
| Concurrent requests do not create two turns | in-memory Promise race + PostgreSQL cross-connection row-lock test | Pass |
| Completed retries are idempotent | persisted NDJSON replay matches first response | Pass |
| Unconfirmed memory never enters Prompt | memory policy/store tests; only completed + confirmed query is injectable | Pass |
| Deletion removes future injection | canonical memory table + cleared room relationship arrays + management UI | Pass |
| Crisis does not enter multi-person debate | no `room_action`; independent `safety_notice` / `speaker: safety` | Pass |
| Budgets are hard | 2k input, 12k context, 6k room characters, 16 reserved calls, 15k output tokens, 110s deadline | Pass |

## Next phase

Phase 5 should add invite/remove UX, message feedback tags, richer cancellation/recovery states, actual provider usage reconciliation, metrics segmented by build/prompt/model and an internal trace viewer/export.
