import { z, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { RuntimeTool, RuntimeToolResult } from './agentRuntime';

export interface RuntimeToolDefinition<
  TSchema extends ZodTypeAny,
  TDetails extends Record<string, unknown>,
> {
  name: string;
  description: string;
  schema: TSchema;
  execute(
    input: z.infer<TSchema>,
    signal: AbortSignal,
  ): Promise<RuntimeToolResult<TDetails>>;
}

/**
 * Zod 是工具输入的单一事实源：同一份 schema 同时生成模型可见 JSON Schema，
 * 并在任何副作用发生前把 unknown 输入解析成 handler 的强类型参数。
 */
export function defineRuntimeTool<
  TSchema extends ZodTypeAny,
  TDetails extends Record<string, unknown>,
>(definition: RuntimeToolDefinition<TSchema, TDetails>): RuntimeTool<TDetails> {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: zodToJsonSchema(definition.schema, { $refStrategy: 'none' }),
    async execute(input, signal) {
      return definition.execute(definition.schema.parse(input), signal);
    },
  };
}
