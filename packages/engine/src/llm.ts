import Anthropic from '@anthropic-ai/sdk';
import type { EngineConfig } from './types';

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function defaultConfig(): EngineConfig {
  return {
    agentModel: process.env.PERSONA16_AGENT_MODEL || 'claude-sonnet-5',
    directorModel: process.env.PERSONA16_DIRECTOR_MODEL || 'claude-haiku-4-5',
    traceFile: process.env.PERSONA16_TRACE_FILE,
  };
}
