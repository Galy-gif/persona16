# Turn protocol v1 fixtures

This directory is the cross-language fixture boundary for the current Web Harness and native clients.
Every identifier and every conversation line is synthetic. The fixtures must never be replaced with
production exports or copied user conversations.

## Ownership

- `TurnEvent` in `@persona16/turn-protocol` owns the complete v1 wire contract.
- `TurnStreamEvent` in Engine remains the runtime-event subset used by the Engine implementation.
- The current `/api/turn` Route does not emit a standalone `plan` event. Plan data may appear inside
  the persisted Harness `done` event instead.
- `done` is the persisted success terminal declared by Turn Protocol and is intentionally not part of
  the Engine-only runtime event subset.
- `done` and `error` end the stream, but only `done` and an `error` whose `outcome` is
  `known_failed` are trusted result terminals. `turn_end` alone is not enough.
- A stream that ends without a trusted result, either by truncation (`unknown-result.ndjson`) or an
  `error` whose `outcome` is `unknown` (`unknown-error.ndjson`), has an unknown outcome. Recovery
  must preserve and replay the exact original request with the original `turnId`.

## Fixture inventory

- `normal-single.ndjson`: one-person success with a candidate memory.
- `normal-room.ndjson`: two-person room success and a deterministic stop action.
- `safety.ndjson`: personality-room bypass with a safety response.
- `known-failure.ndjson`: a streamed, confirmed failure with an explicit recovery action.
- `unknown-result.ndjson`: an intentionally truncated delivery with no trusted terminal.
- `unknown-error.ndjson`: a streamed terminal error whose persistence outcome is explicitly unknown.
- `room.json`, `memories.json`, `feedback.json`: representative API response bodies.

The fixtures describe protocol shape and ordering. They are not evaluation goldens and their text is
not a recommended product response.
