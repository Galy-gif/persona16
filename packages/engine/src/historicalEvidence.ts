export type HistoricalEvidencePerspective = 'user_message' | 'persona_reply';

export type HistoricalParticipant =
  | 'user'
  | 'persona'
  | 'third'
  | 'shared'
  | 'unknown';

export type HistoricalRecipient = Exclude<
  HistoricalParticipant,
  'shared' | 'unknown'
>;

export type EventTime =
  | {
    kind: 'point';
    value:
      | 'today'
      | 'yesterday'
      | 'day_before_yesterday'
      | 'last_time'
      | 'last_week'
      | 'recent'
      | 'before';
    origin: 'explicit' | 'inherited';
  }
  | { kind: 'habitual'; frequency?: string }
  | { kind: 'standing' }
  | { kind: 'unspecified' };

export interface HistoricalFactuality {
  mode: 'asserted' | 'negated' | 'hypothetical' | 'questioned' | 'uncertain';
  retractedBy?: string;
}

export interface HistoricalClaim {
  id: string;
  kind: 'speech' | 'directed_action' | 'state' | 'habit' | 'standing_permission';
  actor: HistoricalParticipant;
  recipient?: HistoricalRecipient;
  attributedOwner?: Exclude<HistoricalParticipant, 'shared' | 'unknown'>;
  eventTime: EventTime;
  contentTime?: EventTime;
  predicate: string;
  actionCategory?: 'advice' | 'arrange' | 'intervene';
  boundaryCategory?: 'listen' | 'advice' | 'analysis';
  boundaryPolarity?: 'positive' | 'negative';
  contentPolarity?: 'positive' | 'negative';
  contentRemainder?: string;
  contentSpecificity?: 'exact' | 'omitted';
  speechClarity?: 'clear';
  factuality: HistoricalFactuality;
  source: {
    text: string;
    start: number;
    end: number;
    sentenceIndex: number;
  };
}

export interface HistoricalEvidenceAnalysis {
  text: string;
  perspective: HistoricalEvidencePerspective;
  claims: HistoricalClaim[];
}

interface Clause {
  text: string;
  normalized: string;
  terminator: string;
  start: number;
  end: number;
  sentenceIndex: number;
}

const ROLE_TOKEN = String.raw`我的?朋友|我的?老板|我们|用户|人物|小王|别人|对方|我|你|他|她`;
const SPEECH_VERB = String.raw`说得(?:很)?清楚|说清楚(?:了)?|说(?:了|过)?(?!得)|讲(?:了|过)?|告诉(?:了|过)?|表示(?:了|过)?|强调(?:了|过)?|声称(?:了|过)?|答应(?:了|过)?|承认(?:了|过)?|回复(?:了|过)?|回应(?:了|过)?|指出(?:了|过)?|提到|提及|提起`;

function normalizeAliases(text: string): string {
  return text
    .replaceAll('昨日', '昨天')
    .replaceAll('上一次', '上次')
    .replaceAll('上回', '上次')
    .replaceAll('在昨天', '昨天')
    .replace(/\s+/gu, '');
}

function segmentHistoricalDiscourse(text: string): Clause[] {
  const clauses: Clause[] = [];
  let sentenceIndex = 0;
  for (const sentenceMatch of text.matchAll(/[^。！？!?\n]+[。！？!?\n]?/gu)) {
    const sentence = sentenceMatch[0];
    const sentenceStart = sentenceMatch.index ?? 0;
    const terminator = sentence.match(/[。！？!?\n]+$/u)?.[0] ?? '';
    const sentenceBody = sentence.slice(0, sentence.length - terminator.length);
    const clauseMatches = [...sentenceBody.matchAll(/[^，,；;]+/gu)];
    for (let clauseIndex = 0; clauseIndex < clauseMatches.length; clauseIndex += 1) {
      const clauseMatch = clauseMatches[clauseIndex]!;
      const nextMatch = clauseMatches[clauseIndex + 1];
      const rawCurrent = clauseMatch[0].trim();
      const currentIsDetachedTimeSubject = new RegExp(
        `^(?:${ROLE_TOKEN})(?:在)?(?:今天(?:上午|下午|晚上|早上)?|昨天(?:上午|下午|晚上|早上)?|前天|上次(?:聊天时)?|上周|刚才|最近|以前|过去|曾经|此前|之前|当时|那时|那天)$`,
        'u',
      ).test(normalizeAliases(rawCurrent))
        && !new RegExp(`^(?:${ROLE_TOKEN})`, 'u')
          .test(normalizeAliases(nextMatch?.[0] ?? ''));
      const mergesDetachedTimeSubject = Boolean(currentIsDetachedTimeSubject && nextMatch);
      const raw = currentIsDetachedTimeSubject && nextMatch
        ? `${clauseMatch[0]}，${nextMatch[0]}`
        : clauseMatch[0];
      if (mergesDetachedTimeSubject) clauseIndex += 1;
      const leadingWhitespace = raw.length - raw.trimStart().length;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const start = sentenceStart + (clauseMatch.index ?? 0) + leadingWhitespace;
      clauses.push({
        text: trimmed,
        normalized: mergesDetachedTimeSubject
          ? normalizeAliases(trimmed).replace(/[，,]/gu, '')
          : normalizeAliases(trimmed),
        terminator: clauseIndex === clauseMatches.length - 1 ? terminator : '',
        start,
        end: start + trimmed.length,
        sentenceIndex,
      });
    }
    sentenceIndex += 1;
  }
  return clauses;
}

function participantForToken(
  token: string | undefined,
  perspective: HistoricalEvidencePerspective,
): HistoricalParticipant {
  if (!token) return 'unknown';
  if (token === '用户') return 'user';
  if (token === '人物') return 'persona';
  if (token === '我们') return 'shared';
  if (/^(?:我的?朋友|我的?老板|小王|他|她|别人|对方)$/u.test(token)) {
    return 'third';
  }
  if (token === '我') {
    return perspective === 'user_message' ? 'user' : 'persona';
  }
  if (token === '你') {
    return perspective === 'user_message' ? 'persona' : 'user';
  }
  return 'unknown';
}

function pointTime(
  marker: string,
  origin: 'explicit' | 'inherited',
): EventTime {
  const value = marker.startsWith('今天')
    ? 'today'
    : marker.startsWith('昨天')
      ? 'yesterday'
      : marker.startsWith('前天')
        ? 'day_before_yesterday'
        : marker.startsWith('上次')
        ? 'last_time'
          : marker.startsWith('上周')
            ? 'last_week'
            : /^(?:刚才|最近)/u.test(marker)
              ? 'recent'
              : 'before';
  return { kind: 'point', value, origin };
}

function explicitTimeBefore(text: string, eventIndex: number): EventTime | undefined {
  const prefix = text.slice(0, Math.max(eventIndex, 0));
  const matches = [...prefix.matchAll(
    /今天(?:上午|下午|晚上|早上)?|昨天(?:上午|下午|晚上|早上)?|前天|上次(?:聊天时)?|上周|刚才|最近|以前|过去|曾经|此前|之前|当时|那时|那天/gu,
  )];
  const lastMarker = matches.at(-1)?.[0];
  const rangeStart = prefix.match(
    /(?:从)?(今天(?:上午|下午|晚上|早上)?|昨天(?:上午|下午|晚上|早上)?|前天|上次(?:聊天时)?|上周|刚才|最近)[^，,；;]{0,8}?(?:一直)?到(?:今天|昨天|前天|现在)/u,
  )?.[1];
  const marker = rangeStart
    ?? (lastMarker && /^(?:当时|那时|那天)$/u.test(lastMarker)
      ? [...matches]
        .reverse()
        .find((match) => !/^(?:当时|那时|那天)$/u.test(match[0]))?.[0]
        ?? lastMarker
      : lastMarker);
  if (!marker) return undefined;
  if (new RegExp(`${marker}的(?:天气|气温|新闻|日期)`, 'u').test(prefix)) {
    return undefined;
  }
  return pointTime(marker, 'explicit');
}

function explicitContentTime(content: string): EventTime | undefined {
  const marker = content.match(
    /今天(?:上午|下午|晚上|早上)?|昨天(?:上午|下午|晚上|早上)?|前天|上次(?:聊天时)?|上周|刚才|最近|以前|过去|曾经|此前|之前|当时|那时|那天/u,
  )?.[0];
  return marker ? pointTime(marker, 'explicit') : undefined;
}

function boundaryMeaning(text: string): Pick<
  HistoricalClaim,
  'boundaryCategory' | 'boundaryPolarity' | 'predicate'
> | undefined {
  if (/只想(?:让(?:你|人物))?听|只想被听见|只要(?:你|人物)?听(?:着)?/u.test(text)) {
    return {
      boundaryCategory: 'listen',
      boundaryPolarity: 'positive',
      predicate: 'boundary:listen:positive',
    };
  }
  if (/(?:不要|不想|不需要)(?:再)?(?:听|要|让(?:你|人物))?(?:任何)?(?:建议|方案)|别(?:再)?给(?:我|用户)?(?:建议|方案)/u.test(text)) {
    return {
      boundaryCategory: 'advice',
      boundaryPolarity: 'negative',
      predicate: 'boundary:advice:negative',
    };
  }
  if (/(?:不要|不想|不需要)(?:再)?(?:听|要|让(?:你|人物))?(?:任何)?分析|别(?:再)?分析/u.test(text)) {
    return {
      boundaryCategory: 'analysis',
      boundaryPolarity: 'negative',
      predicate: 'boundary:analysis:negative',
    };
  }
  return undefined;
}

function boundaryCoreMatch(
  text: string,
  category: HistoricalClaim['boundaryCategory'],
): RegExpMatchArray | null {
  if (category === 'listen') {
    return text.match(
      /只想(?:让(?:你|人物))?听|只想被听见|只要(?:你|人物)?听(?:着)?/u,
    );
  }
  if (category === 'advice') {
    return text.match(
      /(?:不要|不想|不需要)(?:再)?(?:听|要|让(?:你|人物))?(?:任何)?(?:建议|方案)|别(?:再)?给(?:我|用户)?(?:建议|方案)/u,
    );
  }
  if (category === 'analysis') {
    return text.match(
      /(?:不要|不想|不需要)(?:再)?(?:听|要|让(?:你|人物))?(?:任何)?分析|别(?:再)?分析/u,
    );
  }
  return null;
}

function clauseQuestioned(clause: Clause): boolean {
  return /[？?]/u.test(clause.terminator)
    || /(?:吗|么|是不是|是否|有没有|说没说|对吗|对不对)$/u
      .test(clause.normalized);
}

function factualityForEvent(
  clause: Clause,
  eventIndex: number,
): HistoricalFactuality {
  const prefix = clause.normalized.slice(0, eventIndex);
  if (/(?:没(?:有)?|并未|未曾|不曾|从未|不是|并非)[^，,；;]{0,12}$/u
    .test(prefix)
    || /(?:(?:选择|决定)[^，,；;]{0,6}不(?:跟(?:你|人物|用户))?|闭口不|拒绝|避免|否认(?:自己)?)$/u
      .test(prefix)) {
    return { mode: 'negated' };
  }
  if (/(?:如果|假如|要是|假设|假定|若是|倘若|假若|若|假使|倘使|如若|就算|即使|即便|纵使|纵然|哪怕|万一)[^，,；;]*$/u
    .test(prefix)
    || /(?:想|准备|打算|计划|试图|差点|本来想)[^，,；;]{0,12}$/u
      .test(prefix)) {
    return { mode: 'hypothetical' };
  }
  if (/(?:可能|也许|或许|大概|似乎|好像|以为(?:自己)?|记不清|不确定|说不准)[^，,；;]{0,12}$/u
    .test(prefix)) {
    return { mode: 'uncertain' };
  }
  if (clauseQuestioned(clause)) return { mode: 'questioned' };
  return { mode: 'asserted' };
}

function factualityForSpeech(
  clause: Clause,
  eventIndex: number,
  content: string,
): HistoricalFactuality {
  const factuality = factualityForEvent(clause, eventIndex);
  if (factuality.mode === 'asserted' && /才怪$/u.test(content)) {
    return { mode: 'negated' };
  }
  if (factuality.mode === 'asserted'
    && /的话$/u.test(content)
    && !/(?:说|讲|表示|告诉|提到|提及|强调|声称|答应|承认)(?:了|过)?(?:的)?话$/u
      .test(content)) {
    return { mode: 'hypothetical' };
  }
  return factuality;
}

function canonicalizeRoleContent(
  content: string,
  perspective: HistoricalEvidencePerspective,
): string {
  return normalizeAliases(content)
    .replace(/用户/gu, 'ROLE_USER')
    .replace(/人物/gu, 'ROLE_PERSONA')
    .replace(/我们/gu, 'ROLE_SHARED')
    .replace(/我的?朋友|我的?老板|小王|他|她|别人|对方/gu, 'ROLE_THIRD')
    .replace(/我/gu, perspective === 'user_message' ? 'ROLE_USER' : 'ROLE_PERSONA')
    .replace(/你/gu, perspective === 'user_message' ? 'ROLE_PERSONA' : 'ROLE_USER')
    .replace(/今天(?:上午|下午|晚上|早上)?|昨天(?:上午|下午|晚上|早上)?|前天|上次(?:聊天时)?|上周|刚才|最近|以前|过去|曾经|此前|之前|当时|那时|那天/gu, '')
    .replace(/[“”"'：:（）()]/gu, '')
    .replace(/(?:了|过)$/u, '');
}

interface SpeechContentSemantics {
  predicate: string;
  boundaryCategory?: HistoricalClaim['boundaryCategory'];
  boundaryPolarity?: HistoricalClaim['boundaryPolarity'];
  contentPolarity: 'positive' | 'negative';
  contentRemainder?: string;
  contentSpecificity: 'exact' | 'omitted';
}

function stripContentAttribution(content: string): {
  content: string;
  thirdPartyOwner: boolean;
} {
  let normalized = normalizeAliases(content);
  let thirdPartyOwner = false;
  if (/^(?:小王|他|她|别人|对方)(?:说)?/u.test(normalized)) {
    thirdPartyOwner = true;
    normalized = normalized.replace(/^(?:小王|他|她|别人|对方)(?:说)?/u, '');
  }
  if (/(?:的)?(?:其实是|并不是)(?:小王|他|她|别人|对方|我)$/u
    .test(normalized)
    || /的并不是我$/u.test(normalized)) {
    thirdPartyOwner = true;
    normalized = normalized.replace(
      /(?:的)?(?:其实是|并不是)(?:小王|他|她|别人|对方|我)$/u,
      '',
    );
  }
  return { content: normalized, thirdPartyOwner };
}

function analyzeSpeechContent(
  rawContent: string,
  perspective: HistoricalEvidencePerspective,
): SpeechContentSemantics {
  const { content } = stripContentAttribution(rawContent);
  if (!content) {
    return {
      predicate: 'speech:content_omitted',
      contentPolarity: 'positive',
      contentSpecificity: 'omitted',
    };
  }
  const boundary = boundaryMeaning(content);
  if (!boundary) {
    return {
      predicate: canonicalizeRoleContent(content, perspective),
      contentPolarity: /(?:不是|并非|没有|没)(?:今天|昨天|前天|上次|上周)?/u
        .test(content)
        ? 'negative'
        : 'positive',
      contentSpecificity: 'exact',
    };
  }

  const core = boundaryCoreMatch(content, boundary.boundaryCategory);
  const coreIndex = core?.index ?? 0;
  const prefix = content.slice(0, coreIndex);
  const suffix = core
    ? content.slice(coreIndex + core[0].length)
    : '';
  const contentPolarity = /(?:不是|并非|没有|没)(?:今天|昨天|前天|上次|上周)?$/u
    .test(prefix)
    ? 'negative'
    : 'positive';
  const normalizedPrefix = canonicalizeRoleContent(prefix, perspective)
    .replace(/^(?:ROLE_USER|ROLE_PERSONA|ROLE_THIRD)/u, '')
    .replace(/(?:不是|并非|没有|没)$/u, '');
  const remainder = canonicalizeRoleContent(
    `${normalizedPrefix}${suffix}`,
    perspective,
  );
  const predicate = [
    boundary.predicate,
    ...(contentPolarity === 'negative' ? ['content:negative'] : []),
    ...(remainder ? [`remainder:${remainder}`] : []),
  ].join('|');
  return {
    predicate,
    boundaryCategory: boundary.boundaryCategory,
    boundaryPolarity: boundary.boundaryPolarity,
    contentPolarity,
    ...(remainder ? { contentRemainder: remainder } : {}),
    contentSpecificity: 'exact',
  };
}

function canonicalizeContent(
  content: string,
  perspective: HistoricalEvidencePerspective,
): string {
  return analyzeSpeechContent(content, perspective).predicate;
}

function makeClaim(
  clause: Clause,
  index: number,
  partial: Omit<HistoricalClaim, 'id' | 'source'>,
): HistoricalClaim {
  return {
    id: `${clause.sentenceIndex}:${clause.start}:${index}:${partial.kind}`,
    ...partial,
    source: {
      text: clause.text,
      start: clause.start,
      end: clause.end,
      sentenceIndex: clause.sentenceIndex,
    },
  };
}

function speechOwner(
  actor: HistoricalParticipant,
  content: string,
  forcedOwner?: HistoricalParticipant,
): HistoricalClaim['attributedOwner'] {
  const owner = forcedOwner
    ?? (stripContentAttribution(content).thirdPartyOwner ? 'third' : actor);
  return owner === 'user' || owner === 'persona' || owner === 'third'
    ? owner
    : undefined;
}

function speechContentFields(
  content: string,
  verb: string,
  perspective: HistoricalEvidencePerspective,
): Pick<
  HistoricalClaim,
  | 'predicate'
  | 'boundaryCategory'
  | 'boundaryPolarity'
  | 'contentPolarity'
  | 'contentRemainder'
  | 'contentSpecificity'
  | 'speechClarity'
> {
  const semantics = analyzeSpeechContent(content, perspective);
  return {
    ...semantics,
    ...(
      semantics.contentSpecificity === 'omitted' && /清楚/u.test(verb)
        ? { speechClarity: 'clear' as const }
        : {}
    ),
  };
}

function parseSpeechClaim(
  clause: Clause,
  perspective: HistoricalEvidencePerspective,
  inheritedTime?: EventTime,
): HistoricalClaim | undefined {
  const speechEventTime = (
    eventIndex: number,
    verb: string,
  ): EventTime => (
    explicitTimeBefore(clause.normalized, eventIndex)
      ?? inheritedTime
      ?? (/过/u.test(verb)
        ? { kind: 'point', value: 'before', origin: 'explicit' }
        : { kind: 'unspecified' })
  );
  const heard = clause.normalized.match(
    new RegExp(
      `(${ROLE_TOKEN})([^，,；;]{0,32}?)听(?:到|见)?(${ROLE_TOKEN})`
        + `([^，,；;]{0,20}?)(${SPEECH_VERB})(.*)$`,
      'u',
    ),
  );
  if (heard && heard.index !== undefined) {
    const actor = participantForToken(heard[3], perspective);
    const verb = heard[5] ?? '';
    const eventIndex = heard.index + clause.normalized
      .slice(heard.index)
      .indexOf(verb);
    const content = heard[6] ?? '';
    const contentFields = speechContentFields(content, verb, perspective);
    return makeClaim(clause, 0, {
      kind: 'speech',
      actor,
      attributedOwner: speechOwner(actor, content),
      eventTime: speechEventTime(eventIndex, verb),
      ...(explicitContentTime(content)
        ? { contentTime: explicitContentTime(content) }
        : {}),
      ...contentFields,
      factuality: factualityForSpeech(clause, eventIndex, content),
    });
  }

  const relayed = clause.normalized.match(
    new RegExp(
      `(${ROLE_TOKEN})([^，,；;]{0,32}?)(转述|引用|复述)(?:了|过)?(?:给[^，,；;]{0,8})?`
        + `(${ROLE_TOKEN})(?:${SPEECH_VERB})?(.*)$`,
      'u',
    ),
  );
  if (relayed && relayed.index !== undefined) {
    const actor = participantForToken(relayed[1], perspective);
    const relayVerb = relayed[3] ?? '';
    const owner = participantForToken(relayed[4], perspective);
    const eventIndex = relayed.index + clause.normalized
      .slice(relayed.index)
      .indexOf(relayVerb);
    const content = relayed[5] ?? '';
    const contentFields = speechContentFields(content, relayVerb, perspective);
    return makeClaim(clause, 0, {
      kind: 'speech',
      actor,
      attributedOwner: speechOwner(actor, content, owner),
      eventTime: speechEventTime(eventIndex, relayVerb),
      ...(explicitContentTime(content)
        ? { contentTime: explicitContentTime(content) }
        : {}),
      ...contentFields,
      factuality: factualityForSpeech(clause, eventIndex, content),
    });
  }

  const originalWords = clause.normalized.match(
    new RegExp(`(${ROLE_TOKEN})([^，,；;]{0,32}?)的?原话是(.*)$`, 'u'),
  );
  if (originalWords && originalWords.index !== undefined) {
    const actor = participantForToken(originalWords[1], perspective);
    const eventIndex = originalWords.index + clause.normalized
      .slice(originalWords.index)
      .indexOf('原话');
    const content = originalWords[3] ?? '';
    return makeClaim(clause, 0, {
      kind: 'speech',
      actor,
      attributedOwner: speechOwner(actor, content),
      eventTime: speechEventTime(eventIndex, '原话'),
      ...(explicitContentTime(content)
        ? { contentTime: explicitContentTime(content) }
        : {}),
      ...speechContentFields(content, '原话', perspective),
      factuality: factualityForSpeech(clause, eventIndex, content),
    });
  }

  const direct = clause.normalized.match(
    new RegExp(`(${ROLE_TOKEN})([^，,；;]{0,36}?)(${SPEECH_VERB})(.*)$`, 'u'),
  );
  if (!direct || direct.index === undefined) return undefined;
  const verb = direct[3] ?? '';
  const eventIndex = direct.index + (direct[1]?.length ?? 0)
    + (direct[2]?.length ?? 0);
  const rawContent = direct[4] ?? '';
  if (/话$/u.test(direct[2] ?? '')) {
    return undefined;
  }
  const nestedTemporalActor = (direct[2] ?? '').match(
    new RegExp(`在(${ROLE_TOKEN})[^，,；;]{0,12}$`, 'u'),
  )?.[1];
  const actor = participantForToken(nestedTemporalActor ?? direct[1], perspective);
  const content = nestedTemporalActor
    ? rawContent.split(/之后|以后/u, 1)[0] ?? rawContent
    : rawContent;
  const contentFields = speechContentFields(content, verb, perspective);
  return makeClaim(clause, 0, {
    kind: 'speech',
    actor,
    attributedOwner: speechOwner(actor, content),
    eventTime: speechEventTime(eventIndex, verb),
    ...(explicitContentTime(content)
      ? { contentTime: explicitContentTime(content) }
      : {}),
    ...contentFields,
    factuality: factualityForSpeech(clause, eventIndex, content),
  });
}

function roleBeforeIndex(
  text: string,
  index: number,
  perspective: HistoricalEvidencePerspective,
): HistoricalParticipant {
  const prefix = text.slice(0, index);
  const roles = [...prefix.matchAll(new RegExp(ROLE_TOKEN, 'gu'))];
  return participantForToken(roles.at(-1)?.[0], perspective);
}

function parseDirectedActionClaim(
  clause: Clause,
  perspective: HistoricalEvidencePerspective,
  inheritedTime?: EventTime,
): HistoricalClaim | undefined {
  const arrange = clause.normalized.match(
    new RegExp(`(?:替|给|帮)(${ROLE_TOKEN})[^，,；;]{0,12}?(安排|拆|找|推)(?:了|过)?(?:下一步|后续)?`, 'u'),
  );
  const advice = clause.normalized.match(
    new RegExp(
      `(?:(?:给(?:了|过)?|向|对)(${ROLE_TOKEN})[^，,；;]{0,10}?(建议|方案)`
        + `|(?:建议|劝)(?:了|过)?(${ROLE_TOKEN}))`,
      'u',
    ),
  );
  const intervene = clause.normalized.match(
    /(?:介入|干预|插手|越过|越界|踩过|往下(?:推|安排))/u,
  );
  const match = arrange ?? advice ?? intervene;
  if (!match || match.index === undefined) return undefined;

  const actor = roleBeforeIndex(clause.normalized, match.index, perspective);
  if (actor === 'unknown' || actor === 'shared') return undefined;
  const recipientToken = arrange?.[1] ?? advice?.[1] ?? advice?.[3];
  const parsedRecipient = participantForToken(recipientToken, perspective);
  const recipient = parsedRecipient === 'user'
    || parsedRecipient === 'persona'
    || parsedRecipient === 'third'
    ? parsedRecipient
    : actor === 'persona'
      ? 'user'
      : actor === 'user'
        ? 'persona'
        : undefined;
  const actionCategory = advice
    ? 'advice'
    : intervene
      ? 'intervene'
      : 'arrange';
  return makeClaim(clause, 0, {
    kind: 'directed_action',
    actor,
    ...(recipient ? { recipient } : {}),
    eventTime: explicitTimeBefore(clause.normalized, match.index)
      ?? inheritedTime
      ?? { kind: 'unspecified' },
    predicate: `directed_action:${actionCategory}`,
    actionCategory,
    factuality: factualityForEvent(clause, match.index),
  });
}

function parseBoundaryStateClaim(
  clause: Clause,
  perspective: HistoricalEvidencePerspective,
  inheritedTime?: EventTime,
): HistoricalClaim | undefined {
  const boundary = boundaryMeaning(clause.normalized);
  if (!boundary) return undefined;
  const boundaryIndex = clause.normalized.search(
    /只想(?:让(?:你|人物))?听|只想被听见|只要(?:你|人物)?听|(?:不要|不想|不需要)|别(?:再)?/u,
  );
  const actor = roleBeforeIndex(
    clause.normalized,
    boundaryIndex < 0 ? clause.normalized.length : boundaryIndex,
    perspective,
  );
  if (actor === 'unknown' || actor === 'shared') return undefined;
  return makeClaim(clause, 0, {
    kind: 'state',
    actor,
    attributedOwner: actor,
    eventTime: explicitTimeBefore(
      clause.normalized,
      boundaryIndex < 0 ? clause.normalized.length : boundaryIndex,
    ) ?? inheritedTime ?? { kind: 'unspecified' },
    ...boundary,
    factuality: factualityForEvent(
      clause,
      boundaryIndex < 0 ? clause.normalized.length : boundaryIndex,
    ),
  });
}

function permissionAction(text: string): string | undefined {
  if (/沉默|不(?:回答|说|回应)|无需(?:回答|说|回应)|不必(?:回答|说|回应)|不用(?:回答|说|回应)|不需要(?:回答|说|回应)|没必要(?:回答|说|回应)|没有(?:回答|说|回应)的义务/u
    .test(text)) return 'withhold_response';
  if (/拒绝/u.test(text)) return 'refuse';
  if (/停(?:下|止)?/u.test(text)) return 'stop';
  if (/离开/u.test(text)) return 'leave';
  if (/决定|选择/u.test(text)) return 'decide';
  return undefined;
}

function parseGenericClaim(
  clause: Clause,
  perspective: HistoricalEvidencePerspective,
): HistoricalClaim | undefined {
  const subjectMatch = clause.normalized.match(new RegExp(`^(${ROLE_TOKEN})(.*)$`, 'u'));
  if (!subjectMatch) return undefined;
  const actor = participantForToken(subjectMatch[1], perspective);
  if (actor === 'unknown' || actor === 'shared') return undefined;
  const remainder = subjectMatch[2] ?? '';
  const autonomy = permissionAction(remainder);
  const permissionSyntax = /(?:可以|能(?:够)?选择|有权|有.{0,16}(?:选择|决定).{0,12}(?:权利|自由)|不必|无需|不用|不需要|没必要|没有.{0,8}义务)/u
    .test(remainder);
  if (autonomy && permissionSyntax) {
    return makeClaim(clause, 0, {
      kind: 'standing_permission',
      actor,
      eventTime: { kind: 'standing' },
      predicate: `permission:${autonomy}`,
      factuality: clauseQuestioned(clause)
        ? { mode: 'questioned' }
        : { mode: 'asserted' },
    });
  }

  const frequency = remainder.match(
    /^(一直|每次|每回|每一次|总是|从来|向来|一向|一贯|通常|习惯|惯常|历来|素来|老是|动不动)/u,
  )?.[1];
  if (!frequency) return undefined;
  const behavior = remainder.slice(frequency.length).replace(/^都/u, '');
  const predicate = /不(?:回答|说|回应)/u.test(behavior)
    ? 'habit:withhold_response'
    : /找到?借口|找借口/u.test(behavior)
      ? 'habit:find_excuse'
      : `habit:${canonicalizeContent(behavior.replace(/的话$/u, ''), perspective)}`;
  return makeClaim(clause, 0, {
    kind: 'habit',
    actor,
    eventTime: { kind: 'habitual', frequency },
    predicate,
    factuality: /的话$/u.test(remainder)
      ? { mode: 'hypothetical' }
      : clauseQuestioned(clause)
        ? { mode: 'questioned' }
        : { mode: 'asserted' },
  });
}

function isUncertaintyOperator(clause: Clause): boolean {
  const text = clause.normalized.replace(
    /^(?:但|不过|可是|然而|然后|后来|之后)/u,
    '',
  );
  if (/没听清(?:你|人物|他|她|小王|对方)的?(?:回答|回应|话)/u.test(text)) {
    return false;
  }
  return /^(?:(?:如果|要是|假如|假设|只要)?(?:我)?没(?:有)?记错(?:的话)?|前提是我没(?:有)?记错|我记得没错的话|(?:除非|恐怕)?我?记错了|(?:也许|可能|没准)?我(?:也许|可能|没准)?记错了|我(?:现在)?记不清(?:了)?|我(?:也)?(?:不太|不能|不敢)?确定|我(?:也)?拿不准|(?:也许)?我(?:也|也许)?说不准|(?:应该|也许|大概|可能|不一定|没准)吧)$/u
    .test(text);
}

function isRetractionOperator(clause: Clause): boolean {
  return /(?:取消|否定|否认|撤回|收回|作废|推翻)|(?:前面|这|那).{0,12}(?:不作数|不算数|不认)|不认(?:这|那)句话|(?:改口|纠正|更正)(?:说)?(?:自己|我)?(?:不是|没有|没)(?:这个|那个|这|那)意思|说(?:自己|我)?(?:不是|没有|没)(?:这个|那个|这|那)意思/u
    .test(clause.normalized)
    || /(?:后来发现|现在想想)?我(?:从未|没有|没)(?:当着[^。！？]{0,12})?(?:真正)?(?:把)?(?:这件事|这句话)?说出口/u
      .test(clause.normalized)
    || /(?:其实)?我(?:没有|没)[^。！？]{0,16}(?:清楚)?表达出来/u
      .test(clause.normalized)
    || /(?:后来发现|现在想想)?我从未说过/u.test(clause.normalized);
}

function isAttributionCorrection(clause: Clause): boolean {
  return /(?:这|那)句话(?:其实)?来自(?:小王|他|她|别人|对方)|不是(?:我|你|用户|人物)说的|(?:其实)?是(?:我|你|用户|人物|小王|他|她|别人|对方)说的/u
    .test(clause.normalized);
}

function isActionDenialOperator(clause: Clause): boolean {
  const text = clause.normalized.replace(
    /^(?:但|不过|可是|然而|然后|后来|之后|现在想想)/u,
    '',
  );
  return /^(?:其实)?(?:没有|没做|并没有|并未做|最后没做)$/u.test(text);
}

function operatorClause(clause: Clause): boolean {
  return isUncertaintyOperator(clause)
    || isRetractionOperator(clause)
    || isAttributionCorrection(clause)
    || isActionDenialOperator(clause)
    || /^(?:我)?(?:指的是|说的是|撤回的是|收回的是)/u.test(clause.normalized)
    || /^(?:对吗|是吗|没错吧|对不对|是不是|还是(?:没有|没)|是还是不是)$/u
      .test(clause.normalized);
}

function nearestClaimBefore(
  claims: readonly HistoricalClaim[],
  clause: Clause,
  kind?: HistoricalClaim['kind'],
): HistoricalClaim | undefined {
  return [...claims]
    .reverse()
    .find((claim) => claim.source.end <= clause.start && (!kind || claim.kind === kind));
}

function nearestClaimAfterInSentence(
  claims: readonly HistoricalClaim[],
  clause: Clause,
): HistoricalClaim | undefined {
  return claims.find((claim) => (
    claim.source.start >= clause.end
    && claim.source.sentenceIndex === clause.sentenceIndex
  ));
}

function topicMatchesClaim(topic: string, claim: HistoricalClaim): boolean {
  const normalized = canonicalizeContent(topic, 'user_message');
  if (/辞职/u.test(topic)) return claim.predicate.includes('辞职');
  if (/听见|只想听/u.test(topic)) return claim.boundaryCategory === 'listen';
  if (/建议|方案/u.test(topic)) return claim.boundaryCategory === 'advice';
  if (/分析/u.test(topic)) return claim.boundaryCategory === 'analysis';
  if (/边界/u.test(topic)) return Boolean(claim.boundaryCategory);
  return claim.predicate.includes(normalized) || normalized.includes(claim.predicate);
}

function retractionTopic(
  clause: Clause,
  clarification: Clause | undefined,
): string | undefined {
  const clarificationTopic = clarification?.normalized.match(
    /^(?:我)?(?:指的是|说的是|撤回的是|收回的是)(.+)$/u,
  )?.[1];
  if (clarificationTopic) return clarificationTopic;
  return clause.normalized.match(
    /关于(.+?)的(?:那|这)?(?:番|句)?话/u,
  )?.[1]
    ?? clause.normalized.match(/关于(.+?)的说法/u)?.[1]
    ?? clause.normalized.match(
      /把(.+?)的(?:那|这)句话(?:完整地)?(?:撤回|收回|取消|否定|否认)/u,
    )?.[1]
    ?? clause.normalized.match(
      /(?:那|这)句(.+?)的?话(?:完整地)?(?:撤回|收回|取消|否定)/u,
    )?.[1]
    ?? clause.normalized.match(
      /(?:撤回|收回|取消|否定)(?:了)?(.+?)(?:这几个字|这句话|那句话|这段话|那段话)$/u,
    )?.[1];
}

function resolveDiscourseOperators(
  clauses: readonly Clause[],
  claims: HistoricalClaim[],
  perspective: HistoricalEvidencePerspective,
): void {
  for (let index = 0; index < clauses.length; index += 1) {
    const clause = clauses[index]!;
    if (isUncertaintyOperator(clause)) {
      const followingTarget = nearestClaimAfterInSentence(claims, clause);
      const immediatelyPriorClause = clauses[index - 1];
      const immediatelyPriorIsLocalContext = Boolean(
        immediatelyPriorClause
        && immediatelyPriorClause.sentenceIndex === clause.sentenceIndex
        && !claims.some((claim) => claim.source.start === immediatelyPriorClause.start),
      );
      const sameSentenceTarget = immediatelyPriorIsLocalContext
        ? undefined
        : followingTarget
          ?? [...claims].reverse().find((claim) => (
            claim.source.end <= clause.start
            && claim.source.sentenceIndex === clause.sentenceIndex
          ));
      const hasEarlierLocalClause = clauses.slice(0, index).some((candidate) => (
        candidate.sentenceIndex === clause.sentenceIndex
      ));
      const target = sameSentenceTarget
        ?? (hasEarlierLocalClause ? undefined : nearestClaimBefore(claims, clause));
      if (target) target.factuality = { mode: 'uncertain' };
      continue;
    }
    if (isActionDenialOperator(clause)) {
      const target = nearestClaimBefore(claims, clause);
      if (target) target.factuality = { mode: 'negated' };
      continue;
    }
    if (isRetractionOperator(clause)) {
      const clarification = clauses[index + 1];
      const topic = retractionTopic(clause, clarification);
      const priorSpeech = claims.filter((claim) => (
        claim.kind === 'speech' && claim.source.end <= clause.start
      ));
      const target = topic
        ? [...priorSpeech].reverse().find((claim) => topicMatchesClaim(topic, claim))
        : priorSpeech.at(-1);
      if (!target) continue;
      target.factuality = {
        ...target.factuality,
        retractedBy: clause.text,
      };
      continue;
    }
    if (isAttributionCorrection(clause)) {
      const target = nearestClaimBefore(claims, clause, 'speech');
      if (!target) continue;
      const next = clauses[index + 1];
      const correctionText = `${clause.normalized}${next?.normalized ?? ''}`;
      const correctedOwnerToken = correctionText.match(
        /(?:^|[^不非])(?:其实)?是(我|你|用户|人物|小王|他|她|别人|对方)说的/u,
      )?.[1];
      const correctedOwner = participantForToken(correctedOwnerToken, perspective);
      if (correctedOwner === 'user'
        || correctedOwner === 'persona'
        || correctedOwner === 'third') {
        target.attributedOwner = correctedOwner;
      } else if (/(?:来自)(?:小王|他|她|别人|对方)/u.test(correctionText)) {
        target.attributedOwner = 'third';
      } else {
        delete target.attributedOwner;
      }
      continue;
    }
    if (/^(?:对吗|是吗|没错吧|对不对|是不是|还是(?:没有|没)|是还是不是)$/u
      .test(clause.normalized)) {
      const immediatelyPrior = clauses[index - 1];
      if (!immediatelyPrior) continue;
      const target = claims.find((claim) => (
        claim.source.start === immediatelyPrior.start
      ));
      if (target) target.factuality = { mode: 'questioned' };
    }
  }
}

function pureTimeFrame(clause: Clause): EventTime | undefined {
  const marker = clause.normalized.match(
    /^(今天(?:上午|下午|晚上|早上)?|昨天(?:上午|下午|晚上|早上)?|前天|上次(?:聊天时)?|上周|刚才|最近|以前|过去|曾经|此前|之前|当时|那时|那天)$/,
  )?.[1];
  return marker ? pointTime(marker, 'explicit') : undefined;
}

export function analyzeHistoricalEvidence(
  text: string,
  perspective: HistoricalEvidencePerspective,
): HistoricalEvidenceAnalysis {
  const clauses = segmentHistoricalDiscourse(text);
  const claims: HistoricalClaim[] = [];
  let frameSentence = -1;
  let inheritedTime: EventTime | undefined;
  for (const clause of clauses) {
    if (frameSentence !== clause.sentenceIndex) {
      frameSentence = clause.sentenceIndex;
      inheritedTime = undefined;
    }
    const frame = pureTimeFrame(clause);
    if (frame) {
      inheritedTime = frame.kind === 'point'
        ? { ...frame, origin: 'inherited' }
        : frame;
      continue;
    }
    if (operatorClause(clause)) continue;
    const generic = parseGenericClaim(clause, perspective);
    if (generic) {
      claims.push(generic);
      continue;
    }
    const speech = parseSpeechClaim(clause, perspective, inheritedTime);
    if (speech) {
      claims.push(speech);
      continue;
    }
    const action = parseDirectedActionClaim(clause, perspective, inheritedTime);
    if (action) {
      claims.push(action);
      continue;
    }
    const boundary = parseBoundaryStateClaim(clause, perspective, inheritedTime);
    if (boundary) {
      claims.push(boundary);
      continue;
    }
  }
  resolveDiscourseOperators(clauses, claims, perspective);
  return { text, perspective, claims };
}

function eventTimesMatch(candidate: EventTime, source: EventTime): boolean {
  if (candidate.kind !== source.kind) return false;
  if (candidate.kind === 'unspecified' && source.kind === 'unspecified') {
    return false;
  }
  if (candidate.kind === 'point' && source.kind === 'point') {
    return candidate.value === source.value;
  }
  if (candidate.kind === 'habitual' && source.kind === 'habitual') {
    return !candidate.frequency
      || !source.frequency
      || candidate.frequency === source.frequency;
  }
  return true;
}

function optionalEventTimesMatch(
  candidate: EventTime | undefined,
  source: EventTime | undefined,
): boolean {
  if (!candidate || !source) return candidate === source;
  return eventTimesMatch(candidate, source);
}

function eventTimeSupportedBySource(
  candidate: HistoricalClaim,
  source: HistoricalClaim,
): boolean {
  if (eventTimesMatch(candidate.eventTime, source.eventTime)) return true;
  if (candidate.eventTime.kind !== 'point'
    || candidate.eventTime.value !== 'today') return false;
  if (source.eventTime.kind === 'unspecified') {
    return /(?:还是)?一直/u.test(source.source.text);
  }
  return source.eventTime.kind === 'point'
    && source.eventTime.value === 'yesterday'
    && (
      /昨天[^。！？]{0,16}(?:一直)?到今天/u.test(source.source.text)
      || /昨天[^。！？]{0,16}(?:还是|一直)/u.test(source.source.text)
    );
}

export function isHistoricalClaimSupported(
  candidate: HistoricalClaim,
  sources: readonly HistoricalClaim[],
): boolean {
  if (candidate.kind === 'standing_permission') {
    return candidate.factuality.mode === 'asserted'
      && candidate.factuality.retractedBy === undefined;
  }
  return sources.some((source) => {
    const commonSupport = candidate.kind === source.kind
      && candidate.actor === source.actor
      && candidate.recipient === source.recipient
      && candidate.attributedOwner === source.attributedOwner
      && candidate.actionCategory === source.actionCategory
      && candidate.factuality.mode === 'asserted'
      && candidate.factuality.retractedBy === undefined
      && source.factuality.mode === 'asserted'
      && source.factuality.retractedBy === undefined
      && eventTimeSupportedBySource(candidate, source);
    if (!commonSupport) return false;

    if (candidate.kind === 'speech'
      && candidate.contentSpecificity === 'omitted') {
      return candidate.speechClarity === 'clear'
        && source.contentSpecificity === 'exact'
        && source.predicate !== 'speech:content_omitted';
    }

    return candidate.predicate === source.predicate
      && candidate.boundaryCategory === source.boundaryCategory
      && candidate.boundaryPolarity === source.boundaryPolarity
      && candidate.contentPolarity === source.contentPolarity
      && candidate.contentRemainder === source.contentRemainder
      && candidate.contentSpecificity === source.contentSpecificity
      && optionalEventTimesMatch(candidate.contentTime, source.contentTime);
  });
}
