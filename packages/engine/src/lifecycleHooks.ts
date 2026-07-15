export interface ObserverFailure {
  hook: string;
  error: unknown;
}

export type ObserverErrorHandler = (failure: ObserverFailure) => void;

/** 非关键观察者不得把异常传播回核心循环；错误观察者自身也必须隔离。 */
export function invokeObserver<TArgs extends unknown[]>(
  hook: string,
  observer: ((...args: TArgs) => void) | undefined,
  args: TArgs,
  onError?: ObserverErrorHandler,
): void {
  if (!observer) return;
  try {
    observer(...args);
  } catch (error) {
    try {
      onError?.({ hook, error });
    } catch {
      // Observer 错误报告仍是观察能力，不能递归破坏核心循环。
    }
  }
}

export class DeliveryCallbackError extends Error {
  constructor(public readonly hook: string, public readonly originalError: unknown) {
    super(`Delivery callback failed: ${hook}`);
    this.name = 'DeliveryCallbackError';
  }
}

/** 流式投递失败不是观察失败：保留失败信号，但转换为明确的错误类型。 */
export function invokeDelivery<TArgs extends unknown[]>(
  hook: string,
  delivery: ((...args: TArgs) => void) | undefined,
  args: TArgs,
): void {
  if (!delivery) return;
  try {
    delivery(...args);
  } catch (error) {
    throw new DeliveryCallbackError(hook, error);
  }
}
