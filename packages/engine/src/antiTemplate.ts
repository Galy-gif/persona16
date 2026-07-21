/**
 * 反模板守卫：代码级检测开场重复与助手腔模板句。
 * PRD §6.5：同一人格不能连续 3 次使用相同开场；
 * PRD §10.2：禁止"我理解你的感受"等模板开场。
 */

import type { RelationshipPromptContext } from './relationship/relationshipContext';
import { relationshipEvidenceProtectsDecisionAutonomy } from './relationship/relationshipContext';

const BANNED_OPENINGS = [
  '我理解你的感受',
  '我完全理解',
  '听起来你',
  '首先，',
  '作为一个',
  '作为你的',
  '我明白你',
  '这是一个很好的问题',
  '可以从三个角度',
  '从以下几个方面',
];

const DISMISSIVE_QUESTION_OPENING = /^(?:(?:你(?:这个|这)?|这个)问题|你)(?:其实)?问(?:错|反)了(?:[。！!，,\s]|$)/u;

function stripTextualToneMarker(text: string): string {
  return text.trim().replace(/^[（(]\s*(?:小声|轻声|认真|半开玩笑|开玩笑)\s*[）)]\s*/, '');
}

function normalizeOpening(text: string): string {
  return stripTextualToneMarker(text).replace(/\s+/g, '').slice(0, 8);
}

export interface AntiTemplateVerdict {
  ok: boolean;
  reason?: string;
  kind?: 'anti_template' | 'relationship_boundary';
}

function directlyChoosesForUser(text: string): boolean {
  const semanticText = stripTextualToneMarker(text).trim();
  return /^(?:所以[，,:：]?\s*)?(?:(?:我)?建议(?:你)?|你(?:应该|最好|必须)|那就|就|直接)?\s*(?:选择|选|挑)(?!权|项|标准)/u.test(semanticText)
    || /(?:^|[，。；：\s])(?:就|那就|应该|最好|必须|建议你)\s*(?:选择|选|挑)(?!权|项|标准)/u.test(semanticText);
}

function requestsComparisonMethod(context: RelationshipPromptContext): boolean {
  return context.evidence.some((item) => (
    item.kind === 'preference'
    && /比较(?:方法|框架|标准)|(?:方法|框架|标准).{0,4}比较|怎么比|如何比/u.test(item.content)
  ));
}

function onlyReturnsAQuestion(text: string): boolean {
  const withoutFinalQuestionMark = text.trim().replace(/[？?]+$/u, '');
  return withoutFinalQuestionMark.length < text.trim().length
    && !/[。！!；;]/u.test(withoutFinalQuestionMark);
}

export function checkUtterance(
  text: string,
  recentOpenings: string[],
  relationshipContext?: RelationshipPromptContext,
): AntiTemplateVerdict {
  const trimmed = text.trim();
  const semanticOpening = stripTextualToneMarker(trimmed);
  if (
    relationshipContext
    && relationshipEvidenceProtectsDecisionAutonomy(relationshipContext.evidence)
    && directlyChoosesForUser(semanticOpening)
  ) {
    return {
      ok: false,
      kind: 'relationship_boundary',
      reason: '违反已确认的决定权边界：不能替用户拍板',
    };
  }
  if (
    relationshipContext
    && requestsComparisonMethod(relationshipContext)
    && onlyReturnsAQuestion(semanticOpening)
  ) {
    return {
      ok: false,
      kind: 'anti_template',
      reason: '已确认偏好要求比较方法，不能只用反问代替',
    };
  }
  // 舞台说明开场：（放下笔看着你）/ (sighs) / *叹气*
  if (/^[（(*]/.test(semanticOpening)) {
    return { ok: false, kind: 'anti_template', reason: '舞台说明/动作描写开场' };
  }
  if (DISMISSIVE_QUESTION_OPENING.test(semanticOpening)) {
    return { ok: false, kind: 'anti_template', reason: '否定用户提问的压迫式开场' };
  }
  for (const banned of BANNED_OPENINGS) {
    if (semanticOpening.startsWith(banned)) {
      return { ok: false, kind: 'anti_template', reason: `模板开场"${banned}"` };
    }
  }
  const opening = normalizeOpening(trimmed);
  if (opening && recentOpenings.filter((o) => o === opening).length >= 2) {
    return { ok: false, kind: 'anti_template', reason: `连续第 3 次用相同开场"${opening}"` };
  }
  // 助手腔结构：编号清单 + 总结段的组合
  const numberedItems = (trimmed.match(/^\s*\d+[.、)]/gm) ?? []).length;
  if (numberedItems >= 3) {
    return { ok: false, kind: 'anti_template', reason: '三点式清单助手腔' };
  }
  return { ok: true };
}

export function recordOpening(text: string, recentOpenings: string[], keep = 5): string[] {
  const next = [...recentOpenings, normalizeOpening(text)];
  return next.slice(-keep);
}
