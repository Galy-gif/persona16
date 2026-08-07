import type { TurnEvent } from '@persona16/turn-protocol';

/** 合并相邻同人物 delta，减少持久化体积但不改变实时投递顺序。 */
export function appendDurableEvent(events: TurnEvent[], event: TurnEvent): void {
  const previous = events.at(-1);
  if (previous?.type === 'delta'
    && event.type === 'delta'
    && previous.turnId === event.turnId
    && previous.agent === event.agent) {
    previous.delta += event.delta;
    return;
  }
  events.push(event);
}
