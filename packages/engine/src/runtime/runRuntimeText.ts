import type { AgentRuntime, RuntimeEvent, RuntimeRequest, RuntimeStopReason } from './agentRuntime';
import { RuntimeExecutionError, type RuntimeFailureDetails } from './recoveryPolicy';

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
  let runtimeFailure: RuntimeFailureDetails | undefined;
  let stopReason: RuntimeStopReason | undefined;

  for await (const event of runtime.run(request, options.signal)) {
    options.onEvent?.(event);
    if (event.type === 'text_delta') {
      streamedText += event.delta;
      options.onDelta?.(event.delta);
    } else if (event.type === 'run_error') {
      runtimeFailure = {
        code: event.code,
        message: event.message,
        recoverable: event.recoverable,
      };
    } else if (event.type === 'run_end') {
      finalText = event.text;
      stopReason = event.stopReason;
    }
  }

  if (runtimeFailure) {
    throw new RuntimeExecutionError({
      ...runtimeFailure,
      stopReason,
      hadPartialText: streamedText.length > 0,
    });
  }
  if (!stopReason) {
    throw new RuntimeExecutionError({
      code: 'runtime_missing_terminal',
      message: 'runtime ended without a terminal event',
      recoverable: true,
      hadPartialText: streamedText.length > 0,
    });
  }
  if (stopReason && stopReason !== 'complete') {
    throw new RuntimeExecutionError({
      code: `runtime_${stopReason}`,
      message: `runtime stopped: ${stopReason}`,
      recoverable: stopReason !== 'aborted' && stopReason !== 'error',
      stopReason,
      hadPartialText: streamedText.length > 0,
    });
  }
  const text = (finalText ?? streamedText).trim();
  if (!text) {
    throw new RuntimeExecutionError({
      code: 'runtime_no_text',
      message: 'runtime returned no text',
      recoverable: true,
      stopReason,
    });
  }
  return text;
}
