import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Tracer {
  emit(event: string, data: Record<string, unknown>): void;
}

export function createTracer(file?: string): Tracer {
  if (!file) {
    return { emit() {} };
  }
  mkdirSync(dirname(file), { recursive: true });
  let seq = 0;
  return {
    emit(event, data) {
      const line = JSON.stringify({ ts: new Date().toISOString(), seq: seq++, event, ...data });
      appendFileSync(file, line + '\n');
    },
  };
}
