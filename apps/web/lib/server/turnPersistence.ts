import type { PersistedTurnEvent } from '@persona16/store';

/**
 * Provider delta boundaries are transport details, not durable product events.
 * Merge adjacent deltas from the same speaker so replay remains ordered without
 * creating one database row for every token-sized provider chunk.
 */
export function appendPersistedTurnEvent(
  events: PersistedTurnEvent[],
  event: PersistedTurnEvent,
): void {
  const previous = events.at(-1);
  if (
    event.type === 'delta'
    && previous?.type === 'delta'
    && previous.turnId === event.turnId
    && previous.agent === event.agent
  ) {
    events[events.length - 1] = { ...previous, delta: previous.delta + event.delta };
    return;
  }
  events.push(event);
}
