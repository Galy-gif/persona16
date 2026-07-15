import type { AgentRuntime, RuntimeEvent, RuntimeRequest, RuntimeStopReason } from './agentRuntime';

export interface RunRuntimeTextOptions {
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  onEvent?: (event: RuntimeEvent) => void;
}

export async function runRuntimeText(
  runtime: AgentRuntime,
  request: RuntimeRequest,
  options: RunRuntimeTextOptions = {},
): Promise<string> {
  let streamedText = '';
  let finalText: string | undefined;
  let runtimeError: Error | undefined;
  let stopReason: RuntimeStopReason | undefined;

  for await (const event of runtime.run(request, options.signal)) {
    options.onEvent?.(event);
    if (event.type === 'text_delta') {
      streamedText += event.delta;
      options.onDelta?.(event.delta);
    } else if (event.type === 'run_error') {
      runtimeError = new Error(`${event.code}: ${event.message}`);
    } else if (event.type === 'run_end') {
      finalText = event.text;
      stopReason = event.stopReason;
    }
  }

  if (runtimeError) throw runtimeError;
  if (stopReason && stopReason !== 'complete') {
    throw new Error(`runtime stopped: ${stopReason}`);
  }
  const text = (finalText ?? streamedText).trim();
  if (!text) throw new Error('runtime returned no text');
  return text;
}
