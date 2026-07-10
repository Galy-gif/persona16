/**
 * 反模板守卫：代码级检测开场重复与助手腔模板句。
 * PRD §6.5：同一人格不能连续 3 次使用相同开场；
 * PRD §10.2：禁止"我理解你的感受"等模板开场。
 */

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

function normalizeOpening(text: string): string {
  return text.trim().replace(/\s+/g, '').slice(0, 8);
}

export interface AntiTemplateVerdict {
  ok: boolean;
  reason?: string;
}

export function checkUtterance(text: string, recentOpenings: string[]): AntiTemplateVerdict {
  const trimmed = text.trim();
  for (const banned of BANNED_OPENINGS) {
    if (trimmed.startsWith(banned)) {
      return { ok: false, reason: `模板开场"${banned}"` };
    }
  }
  const opening = normalizeOpening(trimmed);
  if (opening && recentOpenings.filter((o) => o === opening).length >= 2) {
    return { ok: false, reason: `连续第 3 次用相同开场"${opening}"` };
  }
  // 助手腔结构：编号清单 + 总结段的组合
  const numberedItems = (trimmed.match(/^\s*\d+[.、)]/gm) ?? []).length;
  if (numberedItems >= 3) {
    return { ok: false, reason: '三点式清单助手腔' };
  }
  return { ok: true };
}

export function recordOpening(text: string, recentOpenings: string[], keep = 5): string[] {
  const next = [...recentOpenings, normalizeOpening(text)];
  return next.slice(-keep);
}
