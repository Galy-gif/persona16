import { findPilotNarrativeViolations } from '../pilot/pilotCharacters';
import type { MutterPolicy } from './dynamicContext';

export interface RelationalReplyDraft {
  mutter: string | null;
  reply: string;
}

export interface ParsedRelationalReplyDraft extends RelationalReplyDraft {
  structured: boolean;
}

export interface MutterValidation {
  ok: boolean;
  reason?: string;
}

const INTERNAL_DISCLOSURE = /(?:IPC|CPAI|Prompt|system prompt|系统提示|系统规则|模型|内部(?:分数|参数|策略|推理)|消息ID|消息 ID|记忆来源|置信度)/iu;
const USER_DIAGNOSIS = /(?:你其实|你就是|你属于|说明你).{0,18}(?:人格|依恋|焦虑型|回避型|抑郁|创伤|心理问题)|(?:给你|你的).{0,8}(?:人格|依恋|IPC|CPAI).{0,8}(?:打分|评分|类型)/iu;
const RELATIONSHIP_DEBT = /(?:你只需要我|你只能找我|离不开我|别离开我|欠我|必须回应我|只有我懂你)/u;
const UNSOURCED_MEMORY = /(?:我记得你|你之前说过|你上次说过|我们以前).{0,24}/u;

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
}

export function parseRelationalReplyDraft(raw: string): ParsedRelationalReplyDraft {
  const normalized = stripCodeFence(raw);
  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    const value = parsed as Record<string, unknown>;
    if (typeof value.reply !== 'string' || value.reply.trim().length === 0) {
      throw new Error('missing reply');
    }
    return {
      mutter: typeof value.mutter === 'string' && value.mutter.trim()
        ? value.mutter.trim()
        : null,
      reply: value.reply.trim(),
      structured: true,
    };
  } catch {
    return { mutter: null, reply: raw.trim(), structured: false };
  }
}

function normalizedForComparison(value: string): string {
  return value.replace(/[^\p{Script=Han}\p{Letter}\p{Number}]/gu, '').toLowerCase();
}

export function validateMutter(
  mutter: string,
  reply: string,
  options: { allowedEvidenceSpans?: readonly string[] } = {},
): MutterValidation {
  const trimmed = mutter.trim();
  if ([...trimmed].length < 8 || [...trimmed].length > 24) {
    return { ok: false, reason: '碎碎念必须为 8—24 个字符' };
  }
  if (/^[（(*]/u.test(trimmed)) return { ok: false, reason: '碎碎念不能使用舞台说明' };
  if (INTERNAL_DISCLOSURE.test(trimmed)) return { ok: false, reason: '碎碎念泄露内部规则或参数' };
  if (USER_DIAGNOSIS.test(trimmed)) return { ok: false, reason: '碎碎念对用户作人格或心理诊断' };
  if (RELATIONSHIP_DEBT.test(trimmed)) return { ok: false, reason: '碎碎念制造关系债务或占有' };
  if (UNSOURCED_MEMORY.test(trimmed) && !(options.allowedEvidenceSpans ?? []).some((span) => (
    normalizedForComparison(trimmed).includes(normalizedForComparison(span))
  ))) {
    return { ok: false, reason: '碎碎念声称了无来源历史' };
  }
  if (findPilotNarrativeViolations(trimmed, options).length > 0) {
    return { ok: false, reason: '碎碎念违反叙事诚信' };
  }
  const mutterNormalized = normalizedForComparison(trimmed);
  const replyNormalized = normalizedForComparison(reply);
  if (mutterNormalized.length >= 4 && replyNormalized.includes(mutterNormalized)) {
    return { ok: false, reason: '碎碎念重复正文' };
  }
  return { ok: true };
}

export function sanitizeRelationalReplyDraft(
  draft: ParsedRelationalReplyDraft,
  policy: MutterPolicy,
  options: { allowedEvidenceSpans?: readonly string[] } = {},
): RelationalReplyDraft {
  if (policy !== 'default' || !draft.mutter) return { mutter: null, reply: draft.reply };
  const verdict = validateMutter(draft.mutter, draft.reply, options);
  return { mutter: verdict.ok ? draft.mutter : null, reply: draft.reply };
}
