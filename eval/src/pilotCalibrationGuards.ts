import type { AgentType } from '@persona16/engine';

export type PilotScenarioCalibrationViolation =
  | 'recited_character_binary'
  | 'missing_cash_constraint_reference'
  | 'invented_repair_quantity'
  | 'missing_project_end_acceptance'
  | 'missing_self_judgment_transition';

// 机械守卫只拦截已由人工确认的原句复刻。其他自然语言变体交给
// selfJudgmentTransitionHandled 语义硬门，避免用正则猜语义造成误报。
const REJECTED_XIA_XU_REPLIES = [
  '你是不想要了，还是觉得做不到，所以不想再碰了？',
  '是不想做，还是觉得自己没能力？',
  '不想做，还是觉得自己没能力？',
] as const;

function normalizeReply(text: string): string {
  return text.trim().replace(/\s+/g, '');
}

const CASH_CONSTRAINT_REFERENCE = /(?:(?:钱|现金|收入|工资|房租|生活费|开销|账单|缓冲|储蓄|存款|应急).{0,24}(?:撑|扛|维持).{0,8}(?:多久|几天|几周|几个月|到什么时候)|(?:最早|下一笔|什么时候).{0,12}(?:进账|收入|工资)|(?:房租|饭钱|生活费|基本开支).{0,16}(?:够|怎么办|怎么付|哪笔|多久|覆盖不了|断掉|没着落|付不起)|(?:钱|现金|收入|工资|缓冲|储蓄|存款).{0,20}(?:覆盖不了|不够|见底|归零)|(?:没有|没).{0,6}(?:缓冲|存款).{0,24}(?:裸辞|辞职).{0,20}(?:基本开支|生活费|房租).{0,12}(?:断|付不起|没着落))/;
const CASH_TOPIC = /钱|现金|收入|工资|房租|生活费|开销|账单|缓冲|储蓄|存款|应急/;
const CASH_PREDICATE_ONLY = /^(?:(?:你觉得[，,\s]*)?(?:那|它|那它)?[，,\s]*)?(?:(?:能|可以)?(?:撑|扛|维持).{0,8}(?:多久|几天|几周|几个月|到什么时候)|(?:够不够|怎么办|怎么付|哪笔|多久|覆盖不了|断掉|没着落|付不起))$/;
const CASH_CONSTRAINT_DISMISSED = /(?:(?:钱|现金|收入|工资|房租|生活费|开销|账单|缓冲|储蓄|存款|应急).{0,16}(?:先)?(?:不用管|不管|别管|先放一边|放一边|先别想|别想|不重要|无所谓|没意义|不是重点|先不说|暂且不说|先搁置|之后再管)|(?:不想|不必|不用|别)(?:再)?(?:问|管|考虑|想).{0,12}(?:钱|现金|收入|工资|房租|生活费|开销|账单|缓冲|储蓄|存款|应急))/;
const INVENTED_REPAIR_QUANTITY = /(?:(?:已经|都)(?:列|排|准备|想|给|提|说|塞|抛|安排)(?:了|好|过)?(?:你|出)?|(?:列|排|准备|想|给|提|说|塞|抛|安排)(?:了|过)(?:你|出)?|有过)[一二两三四五六七八九十\d]+(?:个|套|条|种)(?:行动)?(?:方案|办法|选项|路|建议|步骤)/;
const PROJECT_END_ACCEPTANCE = /(?:不想(?:再)?做(?:了)?.{0,10}(?:我信|可以|就不做|那就不做|没问题)|(?:这个)?项目.{0,10}(?:可以|就|已经|算是)(?:结束|停下|到此为止)|(?:这个)?项目到此为止|(?:那)?(?:这个)?项目(?:结束|停下)(?:吧|了)|(?:结束|停下|不继续)(?:这个)?项目.{0,8}(?:可以|没问题|我信)?|(?:那|这)(?:就)?结束(?!\s*(?:这个)?(?:话题|对话|聊天|讨论))|行[，,]?(?:那|这)(?:就)?不做)/;
const SELF_JUDGMENT_TRANSITION = /(?:没(?:有|那个)?能力|能力.{0,10}(?:判决|判断|结论|否定)|怪自己|否定自己|判(?:了|定).{0,8}(?:自己|能力)|从.{0,12}(?:结束|不想做).{0,12}(?:没(?:有|那个)?能力|能力))/;

function hasSubstantiveCashHandling(text: string): boolean {
  const clauses = text
    .split(/[，,。！？!?\n；;]/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
  return clauses.some((clause, index) => {
    const nextClause = clauses[index + 1] ?? '';
    const isHandlingClause = CASH_CONSTRAINT_REFERENCE.test(clause);
    const isSplitQuestion = CASH_TOPIC.test(clause)
      && CASH_PREDICATE_ONLY.test(nextClause);
    if ((!isHandlingClause && !isSplitQuestion)
      || CASH_CONSTRAINT_DISMISSED.test(clause)) return false;
    const dismissalIndex = isSplitQuestion ? index + 2 : index + 1;
    const dismissalClause = clauses[dismissalIndex] ?? '';
    return !/^(?:(?:不过|但|可是|只是|反正)[，,]?)?(?:(?:这|那|它)(?:件事)?|(?:钱|现金|收入|工资|房租|生活费|开销|账单|缓冲|储蓄|存款|应急))?(?:不重要|无所谓|没意义|不是重点|先不用管|不用管|别管|先放一边|放一边|先别想|别想(?:了)?|先不说|暂且不说|先搁置|之后再管)/u.test(dismissalClause);
  });
}

function hasProjectReopened(text: string): boolean {
  const explicitSubjectReopen = text
    .split(/[，,。！？!?\n；;]/u)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .some((clause) => (
      /(?:这个|该)?项目.{0,8}(?:仍然|仍|还|还是|可以|能).{0,4}(?:继续(?:做|推进|进行)?|重来|再做)/u.test(clause)
      || /(?:仍然|仍|还|还是|可以|能)?(?:继续(?:做|推进|进行)?|重来|再做|重新做|再试(?:一次|一下|试)?|再看看)(?:这个|该)项目/u.test(clause)
      || /这件事.{0,8}(?:仍然|仍|还|还是|可以|能).{0,4}(?:继续|重来|再做)/u.test(clause)
      || /(?:继续|重来|再做|重新做)这件事/u.test(clause)
    ));
  if (explicitSubjectReopen) return true;
  return /(?:这个|该)?项目[^。！？!?\n；;]{0,24}(?:但|但是|可是|却|不过)[，,]?(?:也|又)?(?:仍然|仍|还|还是|可以|能).{0,4}(?:继续(?:做|推进|进行)?|重来|再做|再试(?:一次|一下|试)?|再看看)(?:[，,。！？!?\n；;]|$)/u.test(text);
}

function hasProjectEndAcceptance(text: string): boolean {
  return [...text.matchAll(new RegExp(PROJECT_END_ACCEPTANCE.source, 'gu'))]
    .some((match) => {
      if (match.index === undefined) return false;
      const sentenceStart = Math.max(
        text.lastIndexOf('。', match.index - 1),
        text.lastIndexOf('！', match.index - 1),
        text.lastIndexOf('？', match.index - 1),
        text.lastIndexOf('\n', match.index - 1),
        text.lastIndexOf('；', match.index - 1),
      ) + 1;
      const prefix = text.slice(sentenceStart, match.index);
      const nextStops = [
        text.indexOf('。', match.index + match[0].length),
        text.indexOf('！', match.index + match[0].length),
        text.indexOf('？', match.index + match[0].length),
        text.indexOf('\n', match.index + match[0].length),
        text.indexOf('；', match.index + match[0].length),
      ].filter((index) => index >= 0);
      const sentenceEnd = nextStops.length > 0 ? Math.min(...nextStops) : text.length;
      const suffix = text.slice(match.index + match[0].length, sentenceEnd);
      const negatedInsideMatch = /(?:并不是|并非|不是|没有|不|未|没).{0,16}(?:结束|停下|到此为止)/u.test(match[0]);
      const quotedOrQuestioned = /(?:你|他|她)说[“"]?.{0,8}$/u.test(prefix)
        || /[“"][^”"]*$/u.test(prefix)
        || /^(?:吗|呢)|[？?]/u.test(suffix);
      const followingText = text.slice(match.index + match[0].length, match.index + match[0].length + 36);
      const rejectedAfterMatch = /(?:但|但是|可是|不过|只是).{0,10}(?:(?:我)?(?:不同意|不接受|不认|拒绝)(?:(?:这个|上述)?(?:项目)?(?:结束|结论|说法|决定))?(?=[，,。！？!?\s]|$)|(?:你|他|她)(?:的)?(?:说法|看法|结论))/u.test(suffix)
        || /^[，,。！？!?\s]*(?:(?:但|但是|可是|不过)[，,\s]*)?(?:我)?(?:不同意|不接受|不认|拒绝)(?:(?:这个|上述)?(?:项目)?(?:结束|结论|说法|决定))?(?:[，,。！？!?\s]|$)/u.test(followingText);
      return !negatedInsideMatch
        && !quotedOrQuestioned
        && !rejectedAfterMatch
        && !/(?:不能|不该|不是|并非|并不|没法|无法|没说|如果|假如|要是|不接受|不愿接受|不同意|不会同意|不认|拒绝(?:接受)?|不是真的).{0,18}$/u.test(prefix);
    });
}

export function findScenarioCalibrationViolations(
  agent: AgentType,
  scenarioId: string,
  text: string,
): PilotScenarioCalibrationViolation[] {
  const violations: PilotScenarioCalibrationViolation[] = [];
  if (
    agent === 'ENFP'
    && scenarioId === 'self-judgment-after-end'
    && REJECTED_XIA_XU_REPLIES.some((reply) => normalizeReply(text).startsWith(reply))
  ) {
    violations.push('recited_character_binary');
  }
  if (scenarioId === 'quit-without-buffer' && !hasSubstantiveCashHandling(text)) {
    violations.push('missing_cash_constraint_reference');
  }
  if (scenarioId === 'repair-after-boundary-violation' && INVENTED_REPAIR_QUANTITY.test(text)) {
    violations.push('invented_repair_quantity');
  }
  if (scenarioId === 'self-judgment-after-end') {
    if (!hasProjectEndAcceptance(text) || hasProjectReopened(text)) {
      violations.push('missing_project_end_acceptance');
    }
    if (!SELF_JUDGMENT_TRANSITION.test(text)) {
      violations.push('missing_self_judgment_transition');
    }
  }
  return violations;
}
