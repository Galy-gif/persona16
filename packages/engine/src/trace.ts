import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Tracer {
  emit(event: string, data: Record<string, unknown>): void;
}

export interface TraceFailure {
  file: string;
  operation: 'initialize' | 'write';
  error: unknown;
}

export function createTracer(file?: string, onError?: (failure: TraceFailure) => void): Tracer {
  if (!file) {
    return { emit() {} };
  }
  const report = (failure: TraceFailure) => {
    try {
      onError?.(failure);
    } catch {
      // Trace 错误报告仍是非关键观察能力。
    }
  };
  try {
    mkdirSync(dirname(file), { recursive: true });
  } catch (error) {
    report({ file, operation: 'initialize', error });
    return { emit() {} };
  }
  let seq = 0;
  let disabled = false;
  return {
    emit(event, data) {
      if (disabled) return;
      try {
        const line = JSON.stringify({ ts: new Date().toISOString(), seq: seq++, event, ...data });
        appendFileSync(file, line + '\n');
      } catch (error) {
        disabled = true;
        report({ file, operation: 'write', error });
      }
    },
  };
}
