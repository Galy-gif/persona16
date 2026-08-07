import type { SystemBlock } from './llm';

/**
 * Prompt 预算基线只收拢已经生效的限制。没有既有硬门的区块保持 `null`，
 * 避免“补监控”暗中改变人物、关系或安全语义。
 */
export const PROMPT_BUDGET = Object.freeze({
  version: 'prompt-budget-v1',
  transcript: Object.freeze({
    maxMessages: 30,
    maxCharacters: 12_000,
  }),
  earlierThisTurn: Object.freeze({
    maxEntries: null,
    maxCharacters: null,
  }),
  relationship: Object.freeze({
    maxEvidence: 3,
    maxCharacters: null,
  }),
  safety: Object.freeze({
    maxCharacters: null,
  }),
} as const);

export type PromptSection =
  | 'system_safety'
  | 'system_contract'
  | 'system_character'
  | 'room_transcript'
  | 'earlier_this_turn'
  | 'character_turn_presence'
  | 'semantic_turn_control'
  | 'host_instruction'
  | 'turn_safety'
  | 'relationship'
  | 'user_message'
  | 'assembly_overhead';

export const PROMPT_SECTIONS: readonly PromptSection[] = Object.freeze([
  'system_safety',
  'system_contract',
  'system_character',
  'room_transcript',
  'earlier_this_turn',
  'character_turn_presence',
  'semantic_turn_control',
  'host_instruction',
  'turn_safety',
  'relationship',
  'user_message',
  'assembly_overhead',
]);

export interface PromptSectionMeasurement {
  characters: number;
  utf8Bytes: number;
  /**
   * Tokenizer 未知时用于比较内容量趋势的 UTF-8 字节代理。它不包含 role、
   * framing 或 special tokens，不能解释为完整请求或 provider usage 的上界。
   */
  utf8ByteTokenProxy: number;
}

export interface PromptMeasurement {
  version: typeof PROMPT_BUDGET.version;
  sections: Record<PromptSection, PromptSectionMeasurement>;
  total: PromptSectionMeasurement;
  limits: {
    transcriptMaxMessages: number;
    transcriptMaxCharacters: number;
    earlierThisTurnMaxEntries: null;
    earlierThisTurnMaxCharacters: null;
    relationshipMaxEvidence: number;
    relationshipMaxCharacters: null;
    safetyMaxCharacters: null;
  };
}

export interface MeasuredPrompt {
  text: string;
  measurement: PromptMeasurement;
}

const EMPTY_MEASUREMENT: PromptSectionMeasurement = Object.freeze({
  characters: 0,
  utf8Bytes: 0,
  utf8ByteTokenProxy: 0,
});

function measureText(text: string): PromptSectionMeasurement {
  const utf8Bytes = new TextEncoder().encode(text).byteLength;
  return {
    characters: text.length,
    utf8Bytes,
    utf8ByteTokenProxy: utf8Bytes,
  };
}

/** 固定 section key，确保 trace 维度低基数；返回值永远不包含 Prompt 正文。 */
export function measurePromptSections(
  values: Partial<Record<PromptSection, string>>,
): PromptMeasurement {
  const sections = Object.fromEntries(PROMPT_SECTIONS.map((section) => [
    section,
    values[section] === undefined ? EMPTY_MEASUREMENT : measureText(values[section]),
  ])) as Record<PromptSection, PromptSectionMeasurement>;
  const total = PROMPT_SECTIONS.reduce<PromptSectionMeasurement>(
    (sum, section) => ({
      characters: sum.characters + sections[section].characters,
      utf8Bytes: sum.utf8Bytes + sections[section].utf8Bytes,
      utf8ByteTokenProxy:
        sum.utf8ByteTokenProxy + sections[section].utf8ByteTokenProxy,
    }),
    { characters: 0, utf8Bytes: 0, utf8ByteTokenProxy: 0 },
  );
  return {
    version: PROMPT_BUDGET.version,
    sections,
    total,
    limits: {
      transcriptMaxMessages: PROMPT_BUDGET.transcript.maxMessages,
      transcriptMaxCharacters: PROMPT_BUDGET.transcript.maxCharacters,
      earlierThisTurnMaxEntries: PROMPT_BUDGET.earlierThisTurn.maxEntries,
      earlierThisTurnMaxCharacters: PROMPT_BUDGET.earlierThisTurn.maxCharacters,
      relationshipMaxEvidence: PROMPT_BUDGET.relationship.maxEvidence,
      relationshipMaxCharacters: PROMPT_BUDGET.relationship.maxCharacters,
      safetyMaxCharacters: PROMPT_BUDGET.safety.maxCharacters,
    },
  };
}

export function measureSystemBlocks(blocks: readonly SystemBlock[]): PromptMeasurement {
  return measurePromptSections({
    system_safety: blocks[0]?.text ?? '',
    system_contract: blocks[1]?.text ?? '',
    system_character: blocks.slice(2).map((block) => block.text).join(''),
  });
}
