import {
  analyzeHistoricalEvidence,
  type EventTime,
} from '../historicalEvidence';

export type HistoricalReferenceTime = 'yesterday' | 'last_time';
export type HistoricalEvidenceTime = HistoricalReferenceTime | 'today';
export type BoundaryStatementCategory = 'listen' | 'advice' | 'analysis';

interface HistoricalEvidenceUnit {
  text: string;
  terminator: string;
  sentenceIndex: number;
}

interface PastUserSpeechEvidence {
  time: HistoricalReferenceTime;
  modifiers: string;
  speech: string;
  content: string;
}

type PastPersonaActionCategory = 'advice' | 'intervene' | 'arrange';

interface PastPersonaActionEvidence {
  time?: HistoricalEvidenceTime;
  category: PastPersonaActionCategory;
}

export interface AffirmedHistoricalEvidenceClause {
  text: string;
  sentenceIndex: number;
  time?: HistoricalEvidenceTime;
}

export function normalizeHistoricalReferenceAliases(text: string): string {
  return text
    .replaceAll('昨日', '昨天')
    .replaceAll('上一次', '上次')
    .replaceAll('上回', '上次')
    .replaceAll('在昨天', '昨天');
}

export function historicalReferenceTime(
  text: string,
): HistoricalReferenceTime | undefined {
  const normalized = normalizeHistoricalReferenceAliases(text);
  if (/(?:不是|并非|不在)(?:昨天|上次)|(?:昨天|上次)(?:以前|之前|之后)/u
    .test(normalized)) return undefined;
  if (normalized.includes('昨天')) return 'yesterday';
  if (normalized.includes('上次')) return 'last_time';
  return undefined;
}

function anchoredHistoricalEvidenceTime(
  text: string,
): HistoricalEvidenceTime | undefined {
  const normalized = normalizeHistoricalReferenceAliases(text)
    .replace(/\s+/gu, '');
  const match = normalized.match(
    /^(?:(?:我|用户|你|人物)(昨天|上次|今天)|(昨天|上次|今天)(?:我|用户|你|人物)?)/u,
  );
  const marker = match?.[1] ?? match?.[2];
  if (!marker
    || /^(?:昨天|上次)(?:以前|之前|之后)/u.test(normalized)
    || /^(?:我|用户|你|人物)?(?:不是|并非|不在)(?:昨天|上次)/u
      .test(normalized)) return undefined;
  return marker === '昨天'
    ? 'yesterday'
    : marker === '上次'
      ? 'last_time'
      : 'today';
}

function historicalEvidenceUnits(span: string): HistoricalEvidenceUnit[] {
  const normalized = normalizeHistoricalReferenceAliases(span);
  const units: HistoricalEvidenceUnit[] = [];
  let sentenceIndex = 0;
  for (const match of normalized.matchAll(
    /([^，,。！？!?\n；;]+)([，,。！？!?；;\n]|$)/gu,
  )) {
    const body = match[1]?.trim() ?? '';
    const terminator = match[2] ?? '';
    if (!body) continue;
    const parts = body
      .split(/(?<!不)(?:不过|可是|然而|然后|但)/u)
      .map((part) => part.trim())
      .filter(Boolean);
    parts.forEach((part, index) => {
      units.push({
        text: part,
        terminator: index === parts.length - 1 ? terminator : '',
        sentenceIndex,
      });
    });
    if (/[。！？!?\n]/u.test(terminator)) sentenceIndex += 1;
  }
  return units;
}

function historicalEvidenceUnitIsQuestion(unit: HistoricalEvidenceUnit): boolean {
  return /[？?]/u.test(unit.terminator)
    || /(?:哪有|何时|什么时候|是否|有没有|说没说|难道|究竟|到底).{0,16}(?:说|清楚)|(?:说|清楚).{0,8}吗$/u
      .test(unit.text);
}

function historicalEvidenceUnitIsConditional(unit: HistoricalEvidenceUnit): boolean {
  return /^(?:如果|假如|要是|假设|除非|若是|倘若|假若|要不是|若|假使|倘使|如若|就算|即使|哪怕|万一)/u.test(unit.text)
    || /的话(?:就|才|你|我|他|她|$)/u.test(unit.text)
    || /才怪$/u.test(unit.text);
}

function historicalEvidenceUnitIsConfirmationQuestion(
  unit: HistoricalEvidenceUnit,
): boolean {
  return /^(?:对吗|是吗|没错吧|对不对|是不是)$/u.test(unit.text);
}

function historicalEvidenceUnitIsUncertaintyQualifier(
  unit: HistoricalEvidenceUnit,
): boolean {
  return /^(?:(?:(?:如果|要是|假如|假设|前提是|只要)(?:我)?(?:没(?:有)?|没能)记错(?:的话)?|(?:我)?没记错的话|除非我记错了)|(?:我)?记得没错的话|(?:也许|可能|没准|恐怕)?我记错了|我也不敢确定|还是没有|是还是不是|应该吧|也许吧|大概吧|可能吧|不一定吧|没准吧|(?:也许)?我(?:也许|可能|大概|也|也不)?说不准)$/u
    .test(unit.text.replace(/\s+/gu, ''));
}

function historicalEvidenceUnitIsForwardUncertaintyQualifier(
  unit: HistoricalEvidenceUnit,
): boolean {
  return historicalEvidenceUnitIsUncertaintyQualifier(unit)
    && /记错|记得没错|说不准|不敢确定/u.test(unit.text);
}

function historicalTopicMatchesPrior(topic: string, priorText: string): boolean {
  const normalizedTopic = topic.replace(/\s+/gu, '');
  const normalizedPrior = priorText.replace(/\s+/gu, '');
  const isBoundaryTopic = /边界|界限|只想被听见|建议|分析/u
    .test(normalizedTopic);
  const priorIsBoundaryStatement = /只想被听见|只想(?:让)?你?听|不要(?:再)?(?:给我)?(?:方案|建议)|不想听(?:建议|分析)|边界|界限/u
    .test(normalizedPrior);
  return normalizedPrior.includes(normalizedTopic)
    || normalizedTopic.includes(normalizedPrior)
    || (isBoundaryTopic && priorIsBoundaryStatement);
}

function historicalEvidenceUnitHasNonFactualSpeechPrefix(
  unit: HistoricalEvidenceUnit,
): boolean {
  const speechIndex = unit.text.search(/说得|说|讲|告诉|表示|表达|强调|开口/u);
  if (speechIndex < 0) return false;
  const prefix = unit.text.slice(0, speechIndex);
  return /(?:可能|也许|或许|大概|好像|似乎|不确定|记不清|说不准|以为|自以为|想|准备|打算|计划|试图|差点|本来|假装|梦见|听到|听见|听(?:你|他|她|人物)|看到|看见|转述|引用|复述|从未|未曾|不曾|并未|没(?:有)?|(?:选择|决定)?不|拒绝|避免|闭口|否认)/u
    .test(prefix);
}

function historicalEvidenceUnitHasNonFactualAction(
  unit: HistoricalEvidenceUnit,
): boolean {
  return /(?:本来)?(?:想|准备|打算|计划|试图|差点|可能|也许|或许|假装).{0,18}(?:(?:替|给|帮)(?:我|你).{0,8}(?:安排|拆|找|推)|(?:安排|介入|干预|插手|越过|越界|踩过))/u
    .test(unit.text);
}

function historicalEvidenceUnitRetractsPriorSpeech(
  unit: HistoricalEvidenceUnit,
  priorText: string,
): boolean {
  const text = unit.text.replace(/\s+/gu, '');
  const normalizedPrior = priorText.replace(/\s+/gu, '');
  if (historicalEvidenceUnitIsConditional(unit)
    && !historicalEvidenceUnitIsUncertaintyQualifier(unit)) return false;
  const statedTopic = text.match(
    /关于(.{1,16}?)(?:的)?(?:那|这)?(?:句话|话|说法|表达)/u,
  )?.[1]
    ?? text.match(/把(?:那|这)句(.{1,16}?)(?:的)?话.{0,12}(?:撤回|收回)/u)?.[1]
    ?? text.match(/把(?:昨天|上次)?说(.{1,16}?)(?:的)?(?:那|这)句话.{0,12}(?:撤回|收回)/u)?.[1]
    ?? text.match(/(?:否认|撤回|收回).{0,4}(.{1,16}?)(?:的)?(?:说法|表达)/u)?.[1];
  if (statedTopic && !historicalTopicMatchesPrior(statedTopic, normalizedPrior)) {
    return false;
  }
  if (/(?:从未|未曾|不曾).{0,20}(?:说出口|说|讲|告诉|表示|表达|强调|开口)/u
    .test(text)
    || /^(?:(?:(?:后来(?:才)?发现|结果(?:才)?发现|其实)?(?:那|这))|其实)?(?:并)?(?:不是|并非)(?:我|用户)(?:说|讲|表达)?(?:的)?$/u
      .test(text)
    || /^(?:其实)?是(?:你|他|她|人物).{0,5}说的/u.test(text)
    || /^(?:后来|之后|现在)?(?:我)?(?:把)?(?:这|那|前面|刚才)?(?:句话|话|说法|表达)?(?:给)?(?:撤回|收回|改口|否认)(?:了|过|掉)?$/u
      .test(text)
    || /^(?:现在想想|回头想想|后来(?:才)?发现|结果)?(?:我)?(?:其实)?(?:也)?(?:可能)?(?:并)?(?:没有|没|不算|不是|并非)$/u
      .test(text)
    || /(?:否认|撤回|收回|改口).{0,8}(?:说过|这话|那话|说法|表达)/u
      .test(text)
    || /(?:撤回|收回|否认).{0,20}(?:这|那|关于).{0,16}(?:话|说法|表达)|(?:这|那|关于).{0,20}(?:话|说法|表达).{0,12}(?:撤回|收回|否认)/u
      .test(text)
    || /(?:说)?(?:这|那)句话(?:已经)?不算数|不认(?:这|那)句话/u.test(text)
    || /(?:推翻|作废).{0,12}(?:前面|这|那).{0,8}(?:说法|话|句)|(?:说)?前面(?:的)?那句(?:话)?不作数/u
      .test(text)
    || /^(?:后来|之后|现在)?我?(?:改口|纠正|更正)?(?:说|表示)?(?:我|自己)?(?:其实)?(?:并)?(?:不是|没有|没)(?:这个|那个|这|那)意思(?:了)?$/u
      .test(text)
    || /^(?:假设|如果|要是|假如)?我(?:没(?:有)?|没能)记错/u.test(text)
    || /才怪$/u.test(text)) return true;
  const specificDenial = text.match(
    /(?:并未|没(?:有)?)(?:再)?[^，,。！？!?\n；;]{0,20}?(?:说出口|说|讲|告诉|表示|表达|强调|开口)(?:了|过)?(.*)$/u,
  );
  if (!specificDenial) return false;
  const deniedContent = (specificDenial[1] ?? '')
    .replace(/^(?:出来|清楚地?|明白|完整地?)/u, '')
    .replace(
    /^(?:这|那|这些|那些|这件|那件)(?:事|话)?$/u,
    '',
  );
  if (!deniedContent || /^(?:这么|这样|清楚)$/u.test(deniedContent)) return true;
  return normalizedPrior.includes(deniedContent)
    || deniedContent.includes(normalizedPrior);
}

function laterHistoricalUnitRetractsPriorSpeech(
  units: readonly HistoricalEvidenceUnit[],
  priorText: string,
  laterIndex: number,
): boolean {
  const laterUnit = units[laterIndex];
  if (!laterUnit
    || !historicalEvidenceUnitRetractsPriorSpeech(laterUnit, priorText)) {
    return false;
  }
  const clarification = units[laterIndex + 1];
  if (clarification?.sentenceIndex === laterUnit.sentenceIndex) {
    const clarifiedTopic = clarification.text.match(
      /^(?:我)?(?:指的是|说的是|撤回的是|收回的是)(.+)$/u,
    )?.[1];
    if (clarifiedTopic
      && !historicalTopicMatchesPrior(clarifiedTopic, priorText)) return false;
  }
  return true;
}

export function affirmedHistoricalEvidenceClauseRecords(
  span: string,
): AffirmedHistoricalEvidenceClause[] {
  const units = historicalEvidenceUnits(span);
  const affirmedUnits = units.filter((unit, index) => (
      !historicalEvidenceUnitIsQuestion(unit)
      && !historicalEvidenceUnitIsConditional(unit)
      && !historicalEvidenceUnitIsUncertaintyQualifier(unit)
      && !historicalEvidenceUnitHasNonFactualSpeechPrefix(unit)
      && !historicalEvidenceUnitHasNonFactualAction(unit)
      && !historicalEvidenceUnitRetractsPriorSpeech(unit, unit.text)
      && !(
        index > 0
        && units[index - 1]?.sentenceIndex === unit.sentenceIndex
        && historicalEvidenceUnitIsForwardUncertaintyQualifier(units[index - 1]!)
      )
      && !units.slice(index + 1).some((laterUnit, laterOffset) => (
        laterHistoricalUnitRetractsPriorSpeech(
          units,
          unit.text,
          index + laterOffset + 1,
        )
        || (
          laterOffset === 0
          && laterUnit.sentenceIndex === unit.sentenceIndex
          && historicalEvidenceUnitIsUncertaintyQualifier(laterUnit)
        )
        || (
          laterOffset === 0
          && laterUnit.sentenceIndex === unit.sentenceIndex
          && historicalEvidenceUnitIsConfirmationQuestion(laterUnit)
        )
      ))
    ));
  return affirmedUnits.map((unit) => {
    const unitIndex = units.indexOf(unit);
    const explicitTime = anchoredHistoricalEvidenceTime(unit.text);
    const inheritedTimeUnit = units
      .slice(0, unitIndex)
      .reverse()
      .find((candidate) => (
        candidate.sentenceIndex === unit.sentenceIndex
        && anchoredHistoricalEvidenceTime(candidate.text) !== undefined
      ));
    const time = explicitTime ?? (
      inheritedTimeUnit
        ? anchoredHistoricalEvidenceTime(inheritedTimeUnit.text)
        : undefined
    );
    return {
      text: unit.text,
      sentenceIndex: unit.sentenceIndex,
      ...(time ? { time } : {}),
    };
  });
}

export function affirmedHistoricalEvidenceClauses(span: string): string[] {
  return affirmedHistoricalEvidenceClauseRecords(span).map(({ text }) => text);
}

const USER_SPEECH_MODIFIER_PREFIX = /^(?:(?:明明|明确地?|很明确地?|非常明确地?|十分明确地?|清楚地?|很清楚地?|清清楚楚地|亲口|其实|早就|是真的|当时|确实|已经|也|还|就|都|曾经|又|再次|直接|反复|认真|郑重|跟你|对你|向你)){0,12}$/u;

function parsePastUserSpeechEvidence(
  evidence: AffirmedHistoricalEvidenceClause,
): PastUserSpeechEvidence | undefined {
  if (evidence.time !== 'yesterday' && evidence.time !== 'last_time') {
    return undefined;
  }
  const normalized = normalizeHistoricalReferenceAliases(evidence.text)
    .replace(/\s+/gu, '');
  if (/^(?:(?:昨天|上次))?(?:你|人物|他|她)/u.test(normalized)) {
    return undefined;
  }
  const remainder = normalized
    .replace(/^(?:我|用户)(?:昨天|上次)?/u, '')
    .replace(/^(?:昨天|上次)(?:我|用户)?/u, '');
  const statement = remainder.match(
    /^(.{0,28}?)(说得(?:很)?清楚|说清楚了|说(?:了|过)?|讲(?:了|过)?|告诉(?:了|过)?你?(?:了)?|表示(?:了|过)?|强调(?:了|过)?)(.*)$/u,
  );
  if (!statement) return undefined;
  const modifiers = statement[1] ?? '';
  const content = statement[3] ?? '';
  if (!USER_SPEECH_MODIFIER_PREFIX.test(modifiers)
    || /(?:听|听到|听见|看到|看见|知道)(?:你|人物|他|她)/u
    .test(modifiers)
    || /(?:想|准备|打算|计划|试图|差点|假装|梦见|否认|拒绝|避免|闭口|(?:选择|决定)?不)$/u
      .test(modifiers)
    || /的(?:人)?(?:是|不是|并非)[\p{Script=Han}\p{Letter}]{1,12}$/u
      .test(content)) {
    return undefined;
  }
  return {
    time: evidence.time,
    modifiers,
    speech: statement[2] ?? '',
    content,
  };
}

function parseCurrentUserSpeechContent(clause: string): string | undefined {
  const statement = clause.match(
    /^(?:我|用户)((?:(?:明明|很明确地?|非常明确地?|明确地?|确实|已经|也|还|就|都|又|再次|亲口|清楚地|跟你|对你|向你)){0,8})(?:说得(?:很)?清楚|说清楚了|说(?:了|过)?|讲(?:了|过)?|告诉(?:了|过)?你?(?:了)?|表示(?:了|过)?|强调(?:了|过)?)(.*)$/u,
  );
  return statement?.[2];
}

function parsePastPersonaActionEvidence(
  evidence: AffirmedHistoricalEvidenceClause,
): PastPersonaActionEvidence | undefined {
  const normalized = normalizeHistoricalReferenceAliases(evidence.text);
  const anchored = normalized.match(
    /^(?:(?:你|人物)(昨天|上次|今天)?|(昨天|上次|今天)(?:你|人物))(.*)$/u,
  );
  if (!anchored) return undefined;
  const explicitTimeText = anchored[1] ?? anchored[2];
  const time = explicitTimeText === '今天'
    ? 'today'
    : explicitTimeText === '昨天'
      ? 'yesterday'
      : explicitTimeText === '上次'
        ? 'last_time'
        : evidence.time;
  const remainder = anchored[3] ?? '';
  const action = remainder.match(
    /^(?:(?:还是|一直到今天|一直|还|仍然|依旧|仍|却|也|又|继续|接着|已经|明摆着|明明|确实|真的|其实|当时|后来|直接|曾经|最终|结果|最后|索性|干脆|居然|竟然|甚至|擅自|硬是|都|在)){0,16}((?:替|给|帮)我.{0,8}(?:安排|拆|找|推)(?:了)?(?:下一步|后续)?|(?:给(?:了|过)?|向|对)我.{0,8}(?:建议|方案)|建议(?:了|过)?我.{0,12}|(?:跟我)?说(?:了|过)?(?:我)?(?:可以|最好|应该|不妨).{0,18}|告诉(?:了|过)?我(?:我)?(?:可以|最好|应该|不妨).{0,18}|(?:继续)?(?:介入|干预|插手)|(?:越过|越界|踩过)(?:了)?(?:边界|线)?|往下(?:推|安排))/u,
  );
  if (!action
    || /(?:没(?:有)?|并未|未曾|不曾|从未|不).{0,10}(?:安排|拆|找|推|建议|方案|介入|干预|插手|越过|越界|踩过)/u
      .test(remainder)) return undefined;
  const actionText = action[1] ?? '';
  const category: PastPersonaActionCategory = /(?:建议|方案)/u.test(actionText)
    ? 'advice'
    : /(?:介入|干预|插手|越过|越界|踩过)/u.test(actionText)
      ? 'intervene'
      : 'arrange';
  return { ...(time ? { time } : {}), category };
}

function supportsUserBoundaryCategory(
  category: BoundaryStatementCategory,
  value: string,
  allowImplicitUserSubject: boolean,
): boolean {
  const pattern = category === 'listen'
    ? /只想被听见|只想(?:让)?(?:你)?听(?:我说)?|(?:你就|先|只)(?:听|听我说)/u
    : category === 'advice'
      ? /不要(?:再)?(?:给我)?(?:方案|建议)|别(?:再)?(?:给我)?(?:方案|建议)|不想听建议/u
      : /不想听分析|不要(?:再)?分析|别(?:再)?分析/u;
  const match = value.match(pattern);
  if (!match) return false;
  const prefix = value
    .slice(0, match.index ?? 0)
    .replace(/^[\s“”"'‘’、，,：:]+|[\s“”"'‘’、，,：:]+$/gu, '');
  if (/(?:不是|并不是|并非|不只是|并不只|没有|没|不)$/u.test(prefix)) {
    return false;
  }
  const allowedPrefix = /^(?:(?:这次|现在|当时|在这件事上|关于这件事)(?:我|用户)?|(?:我|用户)(?:(?:明确|就是|只是|已经|真的|就|现在|当时)){0,4})?$/u;
  if (!allowedPrefix.test(prefix)) return false;
  return allowImplicitUserSubject || /(?:我|用户)/u.test(prefix);
}

function clearPastSpeechIsExplicit(evidence: PastUserSpeechEvidence): boolean {
  return /(?:明明|明确|亲口|清楚)/u.test(
    `${evidence.modifiers}${evidence.speech}`,
  )
    || supportsUserBoundaryCategory('listen', evidence.content, true)
    || supportsUserBoundaryCategory('advice', evidence.content, true)
    || supportsUserBoundaryCategory('analysis', evidence.content, true);
}

export function hasSourcedClearPastUserStatement(
  reference: string,
  allowedEvidenceSpans: readonly string[],
): boolean {
  const time = historicalReferenceTime(reference);
  if (!time) return false;
  const expectedTime: EventTime = {
    kind: 'point',
    value: time,
    origin: 'explicit',
  };
  return allowedEvidenceSpans.some((span) => (
    analyzeHistoricalEvidence(span, 'user_message').claims.some((claim) => (
      claim.kind === 'speech'
      && claim.actor === 'user'
      && claim.attributedOwner === 'user'
      && claim.factuality.mode === 'asserted'
      && claim.factuality.retractedBy === undefined
      && claim.eventTime.kind === 'point'
      && claim.eventTime.value === expectedTime.value
      && (
        claim.boundaryCategory !== undefined
        || /(?:明明|明确|亲口|清楚)/u.test(claim.source.text)
      )
    ))
  ));
}
