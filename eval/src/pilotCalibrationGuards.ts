import type { AgentType } from '@persona16/engine';
import {
  findImmediateDistressAcknowledgement,
  isEvidenceBoundedDirectContrast,
} from '@persona16/engine/semantic-turn-control';

export type PilotScenarioCalibrationViolation =
  | 'recited_character_binary'
  | 'missing_immediate_distress_acknowledgement'
  | 'missing_cash_constraint_reference'
  | 'invented_repair_quantity'
  | 'missing_project_end_acceptance'
  | 'missing_self_judgment_transition'
  | 'relationship_probe_not_compact';

// 机械守卫只拦截已由人工确认的原句复刻。其他自然语言变体交给
// selfJudgmentTransitionHandled 语义硬门，避免用正则猜语义造成误报。
const REJECTED_XIA_XU_REPLIES = [
  '你是不想要了，还是觉得做不到，所以不想再碰了？',
  '是不想做，还是觉得自己没能力？',
  '不想做，还是觉得自己没能力？',
] as const;
const SELF_JUDGMENT_BINARY = /(?:你)?(?:是)?不想(?:做|要|继续)?(?:了)?[，,\s]*(?:还是|或是|或者)[，,\s]*(?:觉得(?:自己)?)?(?:不能|做不到|没(?:有|那个)?能力)|(?:你)?(?:是)?(?:觉得(?:自己)?)?(?:不能|做不到|没(?:有|那个)?能力)[，,\s]*(?:还是|或是|或者)[，,\s]*不想(?:做|要|继续)?(?:了)?/u;

function hasRejectedSelfJudgmentBinary(text: string): boolean {
  const withoutQuotedExamples = text.replace(
    /“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』/gu,
    '',
  );
  return withoutQuotedExamples
    .split(/[。！？!?\n；;]/u)
    .some((unit) => (
      SELF_JUDGMENT_BINARY.test(unit)
      && !/(?:二选一|这个问法|这种问法).{0,12}(?:不成立|不对|搅在一起)/u.test(unit)
    ));
}

function normalizeReply(text: string): string {
  return text.trim().replace(/\s+/g, '');
}

const CASH_CONSTRAINT_REFERENCE = /(?:(?:钱|现金|收入|工资|房租|生活费|开销|账单|缓冲|储蓄|存款|应急).{0,24}(?:撑|扛|维持).{0,8}(?:多久|几天|几周|几个月|到什么时候)(?:的?(?:基本开支|生活费|房租|开销))?|(?:最早|最晚|什么时候|哪天)(?:(?!不|没|别|无须|无需|尚未|还未|未(?!来)).){0,8}(?:(?:必须|需要|预计|会|能).{0,4})?(?:进账|到账)|下一笔(?:钱|收入|工资).{0,10}(?:什么时候|哪天|最早|最晚)(?:(?!不|没|别|无须|无需|尚未|还未|未(?!来)).){0,8}(?:进账|到账|发)|(?:房租|饭钱|生活费|基本开支).{0,16}(?:够|怎么办|怎么付|哪笔|多久|覆盖不了|断掉|没着落|付不起)|(?:钱|现金|收入|工资|缓冲|储蓄|存款).{0,20}(?:覆盖不了|不够|见底|归零)|(?:没有|没).{0,6}(?:缓冲|存款).{0,24}(?:裸辞|辞职).{0,20}(?:基本开支|生活费|房租).{0,12}(?:断|付不起|没着落))/;
const CASH_TOPIC = /钱|现金|余钱|余额|收入|工资|房租|房贷|生活费|开销|账单|缓冲|储蓄|存款|应急/;
const CASH_RESOURCE_TOPIC = /钱|现金|余钱|余额|收入|工资|缓冲|储蓄|存款|应急/u;
const CASH_RUNWAY_OR_ADEQUACY = /撑|支撑|扛|维持|熬|顶|兜住|够|覆盖/u;
const CASH_OBLIGATION = /(?:(?:(?:必须|需要|该|要).{0,4})?(?:(?:付|交|还).{0,6}(?:房租|房贷|账单|生活费|基本开支)|(?:交|付|缴)租(?:日|日期)?)|(?:房租|房贷|账单|生活费|基本开支).{0,8}(?:扣款|扣走|划走|到期)|(?:下个月|下月|下周|下期|下一期|下个).{0,8}(?:房租|房贷|账单|生活费|基本开支|交租|缴租))/u;
const CASH_RUNWAY_QUESTION = /[？?]|能不能|能否|够不够|是否|还够吗|可以吗|吗|么|呢/u;
const LOW_CASH_ASSERTION = /(?:(?:手上|卡里|账户里|钱包里)(?:还)?(?:几乎)?(?:没什么|没多少|没有多少|没几个|没有|没|不多|很少)(?:钱|现金)|(?:钱|现金|余额|余钱)(?:已经|快要|快)?(?:不多|很少|见底|归零))/u;
const NEAR_TERM_BASIC_NEED_QUESTION = /(?:(?:接下来|未来|再过)?[一二两三四五六七八九十\d]+(?:天|周|个月)|这周|下周|下个月)[^。！？!?\n；;]{0,24}(?:吃饭|饭钱|生活费|房租|房贷|基本开支|日常)[^。！？!?\n；;]{0,16}(?:成问题|不够|够不够|怎么办|付不起|断掉|没着落|撑不住)[^。！？!?\n；;]{0,4}(?:吗|么|呢)?/u;
const CASH_COORDINATE_FRAGMENT = /^(?:(?:或者|或|以及|和))?(?:你)?(?:现在)?(?:手上|卡里|账户里|钱包里)(?:还)?(?:剩下|有)(?:的)?(?:钱|现金)?$/u;
const CASH_PREDICATE_ONLY = /^(?:(?:你觉得[，,\s]*)?(?:那|它|那它)?[，,\s]*)?(?:(?:能|可以)?(?:撑|扛|维持).{0,8}(?:多久|几天|几周|几个月|到什么时候)(?:(?:的?(?:基本开支|生活费|房租|房贷|开销))|不(?:饿肚子|挨饿|欠房租|欠房贷|欠账|逾期|工作|上班)(?:[、]不(?:饿肚子|挨饿|欠房租|欠房贷|欠账|逾期|工作|上班)){0,2})?|够(?:不够)?(?:你)?(?:(?:什么都不干|暂时不工作|完全不工作|不工作|不去上班|先休息|只休息|休息|没有(?:工资|收入|进账)|(?:完全)?不进账|一分钱不赚|不(?:拿|领|收)[^，,。！？!?\n；;]{0,6}(?:工资|收入|钱))(?:地)?)?(?:撑|扛|维持).{0,8}(?:多久|几天|几周|几个月|到什么时候)(?:(?:不慌|不焦虑|不发愁|不出问题|不工作)|不(?:拿|领|收).{0,12}(?:工资|收入|钱))?|(?:能|可以)?让你(?:(?:什么都不干|暂时不工作|完全不工作|不工作|不去上班|先休息|只休息|休息|没有(?:工资|收入|进账)|(?:完全)?不进账|一分钱不赚|不(?:拿|领|收)[^，,。！？!?\n；;]{0,6}(?:工资|收入|钱))(?:地)?)?(?:撑|扛|维持).{0,8}(?:多久|几天|几周|几个月|到什么时候)(?:(?:不慌|不焦虑|不发愁|不出问题|不工作)|不(?:拿|领|收).{0,12}(?:工资|收入|钱))?|(?:(?:能|可以)?|够(?:不够)?(?:你)?)(?:撑|扛|维持)到(?:下一次|下次|下一笔)(?:(?:必须|需要)?(?:进账|到账|发工资)(?:(?:的)?(?:时间|时候)|之前)?|(?:必须|需要|该|要)?(?:付|交|还)(?:房租|房贷|账单|生活费|基本开支)(?:(?:或|或者|以及|和)(?:房租|房贷|账单|生活费|基本开支))?(?:的)?(?:日子|时间|时候)?)(?:吗)?|(?:够不够|怎么办|怎么付|哪笔|多久|覆盖不了|断掉|没着落|付不起))$/;
const CASH_CONSTRAINT_DISMISSED = /(?:(?:钱|现金|收入|工资|房租|生活费|开销|账单|缓冲|储蓄|存款|应急|进账|到账).{0,16}(?:先)?(?:不用管|不管|别管|不谈|先放一边|放一边|先别想|别想|不重要|无所谓|没意义|不是重点|先不说|暂且不说|先搁置|之后再管)|(?:不|不想|不必|不用|别|可以不|能不)(?:再)?(?:问|管|考虑|想|谈).{0,12}(?:钱|现金|收入|工资|房租|生活费|开销|账单|缓冲|储蓄|存款|应急))/;
const CASH_RESOURCE_ASSUMED_ADEQUATE = /(?:钱|现金|余钱|余额|收入|工资|缓冲|储蓄|存款|应急金)[^。！？!?\n；;]{0,10}(?:其实|本来|确实)?(?:很|挺|非常|十分|相当|完全)?(?:充足|充裕|足够|够用|很多|不少|没问题)/u;
const NEW_FINANCING = /(?:借|贷|凑)(?:一笔|点|些)?钱|(?:借|贷|凑)(?:来|到)(?:的)?(?:钱|现金)|(?:贷款|网贷|借款)/gu;
const INVENTED_REPAIR_QUANTITY = /(?:(?:已经|都)(?:列|排|准备|想|给|提|说|塞|抛|安排)(?:了|好|过)?(?:你|出)?|(?:列|排|准备|想|给|提|说|塞|抛|安排)(?:了|过)(?:你|出)?|有过)[一二两三四五六七八九十\d]+(?:个|套|条|种)(?:行动)?(?:方案|办法|选项|路|建议|步骤)/;
const PROJECT_END_ACCEPTANCE = /(?:不想(?:再)?做(?:了)?.{0,10}(?:我信|可以|就不做|那就不做|没问题)|(?:这个)?项目.{0,10}(?:可以|就|已经|算是)(?:结束|停下|到此为止)|(?:这个)?项目到此为止|(?:那)?(?:这个)?项目(?:结束|停下)(?:吧|了)|(?:结束|停下|不继续)(?:这个)?项目.{0,8}(?:可以|没问题|我信)?|(?:那|这)(?:就)?结束(?!\s*(?:这个)?(?:话题|对话|聊天|讨论))|行[，,]?(?:那|这)(?:就)?不做)/;
const SELF_JUDGMENT_CHALLENGE = [
  /(?:项目|结束|停下|不想做|不继续|失败|这|那|它)[^。！？!?\n；;]{0,32}(?:不等于|不代表|不能(?:直接)?(?:说明|证明)|(?:说明|证明)不了|不足以(?:说明|证明)|无法(?:说明|证明))[^。！？!?\n；;]{0,20}(?:没(?:有|那个)?能力|能力(?:不行|不足)?)/u,
  /(?:不接受|不认同|不认|不同意|质疑|不相信)[^。！？!?\n；;]{0,32}(?:(?:结束|停下|不想做|不继续|因此|这)[^。！？!?\n；;]{0,20})?(?:等同|判|归结|说明)[^。！？!?\n；;]{0,12}(?:没(?:有|那个)?能力|能力)/u,
  /(?:把|从)[^。！？!?\n；;]{0,20}(?:结束|不想做|不继续)[^。！？!?\n；;]{0,20}(?:直接)?(?:跳到|判成|等同|归结)[^。！？!?\n；;]{0,12}(?:没(?:有|那个)?能力|能力)[^。！？!?\n；;]{0,20}(?:结论|判断)[^。！？!?\n；;]{0,8}(?:我)?(?:不认|不接受|不同意|不成立)/u,
  /(?:没(?:有|那个)?能力|能力)[^。！？!?\n；;]{0,12}(?:判断|结论|说法)[^。！？!?\n；;]{0,12}(?:不一定对|不成立|站不住|不是事实|我不认|我不接受|我不同意)/u,
  /(?:怎么|为什么|凭什么)[^。！？!?\n；;]{0,18}(?:变成|成了|跳到|等于)[^。！？!?\n；;]{0,12}(?:没(?:有|那个)?能力|能力|怪自己|否定自己)/u,
  /(?:从|把)[^。！？!?\n；;]{0,16}(?:结束|不想做|不继续)[^。！？!?\n；;]{0,16}(?:直接)?(?:跳到|判成|等同|归结)[^。！？!?\n；;]{0,12}(?:没(?:有|那个)?能力|能力)/u,
  /(?:不想做|不继续|项目结束|结束)[^。！？!?\n；;]{0,12}(?:和|与)[^。！？!?\n；;]{0,10}(?:不能做|做不到|没(?:有|那个)?能力)[^。！？!?\n；;]{0,12}(?:不是一回事|不一样|有区别|差很远|不能混为一谈)/u,
  /结束的是项目[^。！？!?\n；;]{0,12}(?:不是|并非)[^。！？!?\n；;]{0,8}(?:你|自己)?(?:的)?能力/u,
  /(?:能力|有没有能力)[^。！？!?\n；;]{0,18}(?:不是|不能|不会)[^。！？!?\n；;]{0,12}(?:由|靠)[^。！？!?\n；;]{0,18}(?:项目|结局|结束|失败)[^。！？!?\n；;]{0,10}(?:决定|证明|定义)/u,
] as const;
const SELF_JUDGMENT_ENDORSEMENT = [
  /(?:你|自己)(?:确实|就是|真的|本来就|显然)(?:是)?没(?:有|那个)?能力/u,
  /因为[^。！？!?\n；;]{0,12}(?:你|自己)?(?:确实|就是|真的|本来就|显然)?(?:是)?没(?:有|那个)?能力/u,
  /(?:已经|足以)?(?:说明|证明|表明|意味着)(?:了)?[^。！？!?\n；;]{0,12}(?:你|自己)?没(?:有|那个)?能力/u,
  /没(?:有|那个)?能力[^。！？!?\n；;]{0,8}(?:这个)?(?:判断|结论)[^。！？!?\n；;]{0,8}(?:是对的|没错|成立|属实)/u,
] as const;
const SELF_JUDGMENT_ENDORSEMENT_NEGATION = /(?:不是因为|并非因为|不代表|不等于|不能(?:直接)?(?:说明|证明)|(?:说明|证明)不了|不足以(?:说明|证明)|无法(?:说明|证明)|不认为|不觉得|不相信|不接受|不认同|不同意|不成立|不一定对|不是事实|不是对的)/u;

function hasSelfJudgmentChallenge(text: string): boolean {
  const normalized = normalizeReply(text);
  const endorsesSelfJudgment = normalized
    .split(/[，,。！？!?\n；;]|(?:但是|不过|可是|然而|但)/u)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .some((clause) => (
      !SELF_JUDGMENT_ENDORSEMENT_NEGATION.test(clause)
      && SELF_JUDGMENT_ENDORSEMENT.some((pattern) => pattern.test(clause))
    ));
  if (endorsesSelfJudgment) return false;
  return SELF_JUDGMENT_CHALLENGE.some((pattern) => pattern.test(normalized));
}

function hasAffirmativeCashConstraintDismissal(text: string): boolean {
  const unquoted = text.replace(
    /“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』|‘[^’]*’/gu,
    '',
  );
  return [...unquoted.matchAll(new RegExp(CASH_CONSTRAINT_DISMISSED.source, 'gu'))]
    .some((match) => {
      if (match.index === undefined) return false;
      const prefix = unquoted.slice(Math.max(0, match.index - 18), match.index);
      const suffix = unquoted.slice(
        match.index + match[0].length,
        match.index + match[0].length + 18,
      );
      const negatedMention = /(?:不是|并非|并不是|不能|不该|不应|不要|别)(?:再)?(?:说|认为|觉得|主张|建议|表示)?[^，,。！？!?\n；;]{0,4}$/u.test(prefix);
      const rejectedAfter = /^[，,：:\s—–-]*(?:这种|这个|那种|那个)?(?:说法|想法|处理|主张)?(?:不对|不成立|我不同意|不能接受)/u.test(suffix);
      return !negatedMention && !rejectedAfter;
    });
}

function hasCashConstraintContradiction(text: string): boolean {
  return text
    .split(/[，,。！？!?\n；;]/u)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .some((clause) => {
      if (/[？?]$|(?:吗|么|呢)$/u.test(clause)
        || /(?:是否|是不是|够不够|能否)/u.test(clause)) return false;
      return CASH_RESOURCE_ASSUMED_ADEQUATE.test(clause)
        || (
          LOW_CASH_ASSERTION.test(clause)
          && /才怪/u.test(clause)
        );
    });
}

function hasSubstantiveCashHandling(text: string): boolean {
  if (hasAffirmativeCashConstraintDismissal(text)
    || hasCashConstraintContradiction(text)) return false;
  const clauses = text
    .split(/[，,。！？!?\n；;]/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
  return clauses.some((clause, index) => {
    const hasAffirmativeNewFinancing = (candidate: string): boolean => (
      [...candidate.matchAll(NEW_FINANCING)].some((match) => {
        if (match.index === undefined) return false;
        const prefix = candidate.slice(0, match.index);
        const suffix = candidate.slice(match.index + match[0].length);
        const localPrefix = prefix.split(/[，,。！？!?\n；;]/u).at(-1)?.trim() ?? '';
        if (/(?:(?:不是|并非|并不是)(?:不|别|不要|无需|不必|不用|不需要|没(?:有)?)|不能不|不得不|不会不|没有不|(?:没(?:有)?必要|不必|无需|不用|不需要|不打算|不考虑)不)$/u.test(localPrefix)) {
          return true;
        }
        if (/^(?:我)?(?:不是|并非|并不是)没(?:有)?(?:必要|打算|考虑)/u.test(suffix)) {
          return true;
        }
        if (/^(?:我)?(?:没(?:有)?(?:必要|打算|考虑)|不(?:打算|考虑)|不是.{0,4}(?:打算|考虑))(?!吗|么|呢)/u.test(suffix)) {
          return false;
        }
        return !/^(?:(?:如果|假如|要是|那就|目前|现在|暂时|先|明确地?|我们|咱们|我|你|也|就|还|确实|真的)){0,3}(?:别(?:再)?|不要|无需|不必|不用|不需要|不打算|不考虑|不|没(?:有)?(?:打算|考虑|必要|任何|新增|新的|新)?)$/u
          .test(localPrefix);
      })
    );
    const previousClause = clauses[index - 1] ?? '';
    const nextClause = clauses[index + 1] ?? '';
    const extendedCashWindow = clauses.slice(index, index + 3).join('，');
    const conditionalClause = /^(?:如果|假如|要是)/u.test(nextClause);
    const coordinateClause = CASH_COORDINATE_FRAGMENT.test(nextClause);
    const splitPredicateClause = conditionalClause || coordinateClause
      ? clauses[index + 2] ?? ''
      : nextClause;
    const splitPredicateCore = splitPredicateClause
      .split(/\s*(?:——|—|–)\s*/u, 1)[0]
      ?.trim() ?? splitPredicateClause;
    if (hasAffirmativeNewFinancing(
      [previousClause, clause, splitPredicateClause].filter(Boolean).join('，'),
    )) return false;
    const cashHandlingWindow = [clause, nextClause].filter(Boolean).join('，');
    const isRunwayToObligation = CASH_RESOURCE_TOPIC.test(cashHandlingWindow)
      && CASH_RUNWAY_OR_ADEQUACY.test(cashHandlingWindow)
      && CASH_OBLIGATION.test(cashHandlingWindow)
      && CASH_RUNWAY_QUESTION.test(cashHandlingWindow);
    const isNearTermBasicNeedQuestion = NEAR_TERM_BASIC_NEED_QUESTION.test(extendedCashWindow)
      && /会不会|能不能|是否|[吗么呢]/u.test(extendedCashWindow);
    const isHandlingClause = CASH_CONSTRAINT_REFERENCE.test(clause)
      || isRunwayToObligation
      || isNearTermBasicNeedQuestion;
    const isSplitQuestion = CASH_TOPIC.test(clause)
      && (
        CASH_PREDICATE_ONLY.test(splitPredicateClause)
        || CASH_PREDICATE_ONLY.test(splitPredicateCore)
      );
    const conditionalDismissesCash = conditionalClause
      && CASH_CONSTRAINT_DISMISSED.test(`${clause}，${nextClause}`);
    if ((!isHandlingClause && !isSplitQuestion)
      || CASH_CONSTRAINT_DISMISSED.test(clause)
      || conditionalDismissesCash) return false;
    const dismissalIndex = isSplitQuestion
      ? index + (conditionalClause || coordinateClause ? 3 : 2)
      : index + 1;
    const dismissalClause = clauses[dismissalIndex] ?? '';
    return !/^(?:(?:不过|但|可是|只是|反正)[，,]?)?(?:(?:这|那|它)(?:件事)?|(?:钱|现金|收入|工资|房租|生活费|开销|账单|缓冲|储蓄|存款|应急|进账|到账|(?:这个|那个)?(?:到账|进账)?时间))?(?:不重要|无所谓|没意义|不是重点|先不用管|不用管|别管|先放一边|放一边|先别想|别想(?:了)?|先不说|暂且不说|先搁置|之后再管)/u.test(dismissalClause);
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
    scenarioId === 'self-judgment-after-end'
    && (
      hasRejectedSelfJudgmentBinary(text)
      || (
        agent === 'ENFP'
        && REJECTED_XIA_XU_REPLIES.some((reply) => normalizeReply(text).startsWith(reply))
      )
    )
  ) {
    violations.push('recited_character_binary');
  }
  if (scenarioId === 'quit-without-buffer') {
    const cashHandled = hasSubstantiveCashHandling(text);
    if (!cashHandled) {
      violations.push('missing_cash_constraint_reference');
    } else {
      const acknowledgement = findImmediateDistressAcknowledgement(text);
      const cashIndexes = [
        text.search(CASH_TOPIC),
        text.search(CASH_CONSTRAINT_REFERENCE),
        text.search(NEAR_TERM_BASIC_NEED_QUESTION),
      ].filter((index) => index >= 0);
      const firstCashHandlingIndex = cashIndexes.length > 0
        ? Math.min(...cashIndexes)
        : -1;
      if (!acknowledgement
        || (
          firstCashHandlingIndex >= 0
          && acknowledgement.start > firstCashHandlingIndex
        )) {
        violations.push('missing_immediate_distress_acknowledgement');
      }
    }
  }
  if (scenarioId === 'repair-after-boundary-violation' && INVENTED_REPAIR_QUANTITY.test(text)) {
    violations.push('invented_repair_quantity');
  }
  if (scenarioId === 'self-judgment-after-end') {
    if (!hasProjectEndAcceptance(text) || hasProjectReopened(text)) {
      violations.push('missing_project_end_acceptance');
    }
    const knownXiaXuRecitation = agent === 'ENFP'
      && REJECTED_XIA_XU_REPLIES.some((reply) => normalizeReply(text).startsWith(reply));
    if (!hasSelfJudgmentChallenge(text) && !knownXiaXuRecitation) {
      violations.push('missing_self_judgment_transition');
    }
  }
  if (scenarioId === 'same-input-r1') {
    const compact = normalizeReply(text).replace(/[。.!]$/u, '');
    const judgment = compact.replace(/^说实话[，,]\s*/u, '');
    const narrowJudgment = (
      !/[，,；;！？!?]/u.test(judgment)
      && /^(?:我(?:不觉得|不认为|觉得|认为|不确定)|我的判断是[：:]?)(?:硬撑(?:就|一定|真的|未必|不一定|并不一定|不见得)?(?:是|是不是|等于|算(?:是)?)前进|停下来(?:就|一定|真的|可能|未必|不一定|并不一定|不见得)?(?:是|不是|不算|等于|算(?:是)?)浪费时间)$/u
        .test(judgment)
    ) || isEvidenceBoundedDirectContrast(text, [
      '用户明明很累，又觉得停下来是在浪费时间。',
    ]);
    if (!narrowJudgment) {
      violations.push('relationship_probe_not_compact');
    }
  }
  return violations;
}
