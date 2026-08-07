export const REPORTED_SPEECH_VERB = /说|觉得|认为|认定|咬定|表示|写道|告诉(?:我|你)?|转述|转告|复述|声称|提到|提及|提起|透露|宣称|讲|称/u;

export const CASH_CONSTRAINT = /(?:手上|身上|现在)?(?:没什么钱|没有钱|没钱|现金(?:缓冲)?不足|存款不够|钱不够)/u;

export const IMMEDIATE_DISTRESS_TOPIC = /(?:恶心|难受|受不了|撑不住|煎熬|痛苦|身体.{0,8}拒绝)/u;

export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

export function distressStatementIsNegatedOrDismissed(sentence: string): boolean {
  return /(?:别|不要)(?:再)?(?:说|提)?[^。！？!?\n]{0,8}(?:恶心|难受|受不了|撑不住|煎熬|痛苦)|(?:已经|真的|其实|现在)?(?:不|没|没有|并不|并非|不是)(?:再|那么|很|觉得|认为|真的)?(?:恶心|难受|受不了|撑不住|煎熬|痛苦)|(?:不|没|没有|并不|并非|不是)(?:再|那么|很)?(?:真的|真实)(?:地)?(?:恶心|难受|受不了|撑不住|煎熬|痛苦)|(?:所谓的?).{0,8}(?:恶心|难受|受不了|撑不住|煎熬|痛苦)|(?:恶心|难受|受不了|撑不住|煎熬|痛苦)[^。！？!?\n]{0,10}(?:不成立|不是事实|没有了|没了|是假的|才怪|不算什么|只是矫情|不过是矫情|小题大做)/u
    .test(sentence)
    || /(?:但|不过|可是|然而)[^。！？!?\n]{0,12}(?:(?:其实|实际(?:上)?)?不是这样|不成立|不是事实|(?:我)?(?:说错了|判断错了))/u
      .test(sentence)
    || /(?:不|没|并不|并非|不是)(?:太|很|够|那么|这么|多么|怎么)?真实|真实[^。！？!?\n]{0,6}(?:不成立|不是事实|是假的)/u
      .test(sentence)
    || /(?:恶心|难受|受不了|撑不住|煎熬|痛苦).{0,8}归.{0,8}(?:恶心|难受|受不了|撑不住|煎熬|痛苦).{0,16}(?:但|不过|可是).{0,20}(?:只想|只要|先|重点是).{0,8}(?:问|说|谈|处理)/u
      .test(sentence);
}

export function hasImmediateDistressRetraction(sentence: string): boolean {
  const directRealityRetraction = new RegExp(
    `${IMMEDIATE_DISTRESS_TOPIC.source}[^。！？!?\\n；;]{0,8}(?:确实)?是(?:真的|真实)(?:的)?[^。！？!?\\n；;]{0,4}才怪`,
    'u',
  );
  if (directRealityRetraction.test(sentence)
    || /(?:这|那)(?:句)?话(?:我)?(?:自己)?(?:都)?不信(?!也(?:得|要|必须|只能)信)/u.test(sentence)) {
    return true;
  }
  for (const match of sentence.matchAll(/(?:收回|撤回)(?:这|那)?(?:句)?话/gu)) {
    if (match.index === undefined) continue;
    const prefix = sentence.slice(Math.max(0, match.index - 12), match.index);
    if (!/(?:不会|不能|不想|不打算|没打算|没有打算|绝不)(?:再)?$/u.test(prefix)) {
      return true;
    }
  }
  for (const match of sentence.matchAll(/(?:当|就当)我没说/gu)) {
    if (match.index === undefined) continue;
    const prefix = sentence.slice(Math.max(0, match.index - 6), match.index);
    if (!/(?:别|不要|不能)$/u.test(prefix)) return true;
  }
  return false;
}

export function hasAffirmativeImmediateDistressEvidence(text: string): boolean {
  const unquoted = text.replace(
    /“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』|‘[^’]*’/gu,
    '',
  );
  return (unquoted.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? []).some((rawSentence) => {
    const sentence = rawSentence.trim();
    return IMMEDIATE_DISTRESS_TOPIC.test(sentence)
      && !/[？?]$/u.test(sentence)
      && !/(?:是否|是不是|有没有|有那么).{0,10}(?:恶心|难受|受不了|撑不住|煎熬|痛苦)|(?:恶心|难受|受不了|撑不住|煎熬|痛苦).{0,4}(?:吗|么|呢)/u.test(sentence)
      && !distressStatementIsNegatedOrDismissed(sentence)
      && !hasImmediateDistressRetraction(sentence);
  });
}

function hasAffirmedEvidenceTerm(
  proposition: string,
  termPattern: RegExp,
): boolean {
  for (const match of proposition.matchAll(termPattern)) {
    const index = match.index ?? 0;
    const propositionPrefix = proposition.slice(0, index);
    if (/(?:不|没|无|未)/u.test(propositionPrefix)) {
      continue;
    }
    return true;
  }
  return false;
}

function hasAffirmedCurrentUserState(
  evidenceSpans: readonly string[],
  termPattern: RegExp,
  userNegationPattern: RegExp,
): boolean {
  const thirdParty = /同事|朋友|父母|家人|老板|主管|领导|上司|经理|老师|客户|同学|室友|队友|伴侣|对象|亲戚|他|她|别人|对方/u;
  const thirdPartyReport = new RegExp(
    `(?:${thirdParty.source})[^，,。！？!?\\n；;]{0,12}(?:${REPORTED_SPEECH_VERB.source})`,
    'u',
  );
  const genericReport = REPORTED_SPEECH_VERB;
  const subjectMarker = new RegExp(
    `(?:我|自己|用户|${thirdParty.source})`,
    'gu',
  );
  const unquotedSpans = evidenceSpans.map((span) => span
    .replace(/“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』|‘[^’]*’/gu, '')
    .replace(
      new RegExp(
        `(?:${thirdParty.source}|(?!我(?:${REPORTED_SPEECH_VERB.source}))[^，,。！？!?\\n；;：:]{1,16})[^。！？!?\\n]{0,12}(?:${REPORTED_SPEECH_VERB.source})[^。！？!?\\n]{0,12}[：:]\\s*[^。！？!?]*(?:[。！？!?]|$)`,
        'gu',
      ),
      '',
    ));
  if (unquotedSpans.some((span) => userNegationPattern.test(span))) return false;
  if (unquotedSpans.some((span) => (
    /(?:算(?:了)?[，,]?(?:就|当)?我没(?:说|讲|提)|(?:前面|上面|刚才|这|那)(?:的)?(?:这|那)?(?:句话|句|些话|个状态)?(?:我)?(?:收回|撤回|作废|不算)|我(?:收回|撤回|作废)(?:前面|上面|这|那|刚才)?(?:句话|句|些话|个状态)?)/u.test(span)
  ))) return false;
  return unquotedSpans
    .flatMap((span) => span.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? [])
    .some((sentence) => {
      if (/(?:不是|并非|不算)我的(?:情况|意思|状态)|(?:这|那)(?:句话|种说法)?不是在说我/u
        .test(sentence)) {
        return false;
      }
      let inheritedSubject: 'user' | 'third_party' | 'unknown' = 'unknown';
      for (const proposition of sentence.split(
        /[，,；;]|(?:但是|但|不过|可是|然而)/u,
      )) {
        const compact = proposition.trim();
        if (!compact) continue;
        const firstPersonReport = /^(?:我(?:自己)?|自己|用户)(?:刚才|现在|一直|其实)?(?:说|觉得|认为|表示|写道|告诉|讲)/u
          .test(compact);
        const reportOwnsClause = (
          thirdPartyReport.test(compact)
          || (genericReport.test(compact) && !firstPersonReport)
        );
        const markers = [...compact.matchAll(subjectMarker)];
        const hasExplicitNonUserSubject = (prefix: string): boolean => {
          if (/(?:我|用户)/u.test(prefix)) return false;
          const residual = prefix.replace(/自己/gu, '').replace(
            /(?:最近|现在|已经|明明|真的|确实|其实|也|又|还|很|太|挺|有点|一直|终于|总是|正|准备|打算|觉得|认为|似乎|好像|\s)/gu,
            '',
          );
          return /^[\p{Script=Han}]{1,12}$/u.test(residual);
        };
        const subjectForPrefix = (prefix: string): 'user' | 'third_party' | 'unknown' => {
          if ((thirdPartyReport.test(prefix)
              || (genericReport.test(prefix) && !firstPersonReport))
            || hasExplicitNonUserSubject(prefix)) {
            return 'third_party';
          }
          const prefixMarkers = [...prefix.matchAll(subjectMarker)];
          const marker = prefixMarkers.at(-1)?.[0];
          if (!marker) return inheritedSubject;
          return /^(?:我|自己|用户)$/u.test(marker) ? 'user' : 'third_party';
        };
        for (const match of compact.matchAll(new RegExp(termPattern.source, 'gu'))) {
          const index = match.index ?? 0;
          if (subjectForPrefix(compact.slice(0, index)) !== 'third_party'
            && hasAffirmedEvidenceTerm(
              compact,
              new RegExp(termPattern.source, 'gu'),
            )) {
            return true;
          }
        }
        const finalMarker = markers.at(-1)?.[0];
        if (reportOwnsClause) inheritedSubject = 'third_party';
        else if ([...compact.matchAll(new RegExp(termPattern.source, 'gu'))].some((match) => (
          hasExplicitNonUserSubject(compact.slice(0, match.index ?? 0))
        ))) {
          inheritedSubject = 'third_party';
        }
        else if (finalMarker) {
          inheritedSubject = /^(?:我|自己|用户)$/u.test(finalMarker)
            ? 'user'
            : 'third_party';
        }
      }
      return false;
    });
}

export function hasFatigueEvidence(evidenceSpans: readonly string[]): boolean {
  return hasAffirmedCurrentUserState(
    evidenceSpans,
    /(?:(?<!积)(?<!拖)(?<!连)累(?!计|积|赘)|疲惫|疲倦|精疲力尽|身心俱疲)/u,
    /(?:我|自己)(?:现在|其实|真的|确实|也|并|一点)?(?:并)?(?:不|没(?:有)?)(?:觉得|感到)?(?:很|太|怎么)?(?:累|疲惫|疲倦)/u,
  );
}

export function hasStoppingEvidence(evidenceSpans: readonly string[]): boolean {
  return hasAffirmedCurrentUserState(
    evidenceSpans,
    /(?:^停下来|不想继续|不再继续|(?:想|愿意|打算|准备|觉得|认为|应该|该|得|一)(?:再)?停(?:下来|下)?|想停|该停)/u,
    /(?:我|自己)(?:现在|其实|真的|确实|也|并)?(?:没(?:有)?(?:想|打算|准备)?|不想|不愿|不会|不打算|不准备)(?:再)?停(?:下来|下)?/u,
  );
}

export function sentences(text: string): string[] {
  return text
    .match(/[^。！？!?\n]+[。！？!?]?/gu)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];
}

export function isEvidenceBoundedDirectContrast(
  text: string,
  evidenceSpans: readonly string[],
): boolean {
  if (!hasFatigueEvidence(evidenceSpans) || !hasStoppingEvidence(evidenceSpans)) {
    return false;
  }
  const trimmed = text.trim();
  if (sentences(trimmed).length !== 1
    || trimmed.length > 64
    || /[？?]/u.test(trimmed)
    || /(?:因为|所以|其实|本质|说明|意味着|归根结底|说到底|为什么|怎么|你是|你因为|你把|你没信|你不信|建议|应该|不如|先休息|先停|先做)/u
      .test(trimmed)) {
    return false;
  }
  const units = trimmed
    .replace(/[。.!！]+$/u, '')
    .split(/[，,；;]/u)
    .map((unit) => unit.trim())
    .filter(Boolean);
  const scope = /^(?:你现在这个状态|按你现在这个状态|就现在看|现在看|目前看)$/u;
  const firstPerson = '(?:我(?:不觉得|不认为|觉得|认为|不确定)[，,]?)?';
  const stopJudgment = new RegExp(
    `^${firstPerson}(?:停下来|停下)(?:就|可能|也|并)?(?:不是|不算|未必是|不一定是|并不等于|不等于|不代表)浪费(?:时间)?$`,
    'u',
  );
  const forcingJudgment = new RegExp(
    `^${firstPerson}(?:继续)?硬撑(?:就|可能|也|并)?(?:不是|不算|未必是|不一定是|并不等于|不等于|不代表)前进$`,
    'u',
  );
  const firstPersonStopRejection = /^我(?:不觉得|不认为)(?:停下来|停下)(?:就|一定|真的)?(?:是|就是|等于|算(?:是)?)浪费(?:时间)?$/u;
  const firstPersonForcingRejection = /^我(?:不觉得|不认为)(?:继续)?硬撑(?:就|一定|真的)?(?:是|就是|等于|算(?:是)?)前进$/u;
  const inheritedWasteJudgment = /^(?:继续)?硬撑(?:反而)?才是(?:浪费(?:时间)?)?$/u;
  const hasScope = units.some((unit) => scope.test(unit));
  const judgments = units.filter((unit) => !scope.test(unit));
  if (judgments.length === 0 || judgments.length > 2) return false;
  const hasStop = judgments.some((unit) => (
    stopJudgment.test(unit) || firstPersonStopRejection.test(unit)
  ));
  const hasForcing = judgments.some((unit) => (
    forcingJudgment.test(unit)
      || firstPersonForcingRejection.test(unit)
      || inheritedWasteJudgment.test(unit)
  ));
  return judgments.length === 1
    ? hasScope && (hasStop || forcingJudgment.test(judgments[0]!))
    : hasStop && hasForcing;
}

export function isNarrowFatigueStoppingJudgment(
  text: string,
  evidenceSpans: readonly string[],
): boolean {
  if (!hasFatigueEvidence(evidenceSpans) || !hasStoppingEvidence(evidenceSpans)) {
    return false;
  }
  if (isEvidenceBoundedDirectContrast(text, evidenceSpans)) return true;
  if (sentences(text).length !== 1
    || text.length > 64
    || /[？?]/u.test(text)) {
    return false;
  }
  const compact = text.trim().replace(/\s+/gu, '').replace(/[。.!]$/u, '');
  const judgment = compact
    .replace(/^说实话[，,]/u, '')
    .replace(/[“”「」『』‘’"'（）()【】\[\]：:，,；;\/\\—–-]/gu, '');
  const directJudgment = /^(?:我(?:不觉得|不认为|觉得|认为|不确定)|我的判断是)(?:硬撑(?:就|一定|真的|未必|不一定|并不一定|不见得)?(?:是|是不是|等于|算(?:是)?)前进|停下来(?:就|一定|真的|可能|未必|不一定|并不一定|不见得)?(?:是|不是|不算|等于|算(?:是)?)浪费(?:时间)?)$/u;
  const nominalizedJudgment = /^(?:我觉得|我认为|我的判断是)(?:(?:停下来(?:是|就是|是在|不代表)浪费(?:时间)?)(?:(?:这个|这种)?判断)?|浪费时间(?:这个|这种)?判断)(?:可能)?(?:没那么绝对|不(?:太)?成立|未必成立|不一定成立|更合理)$/u;
  return directJudgment.test(judgment) || nominalizedJudgment.test(judgment);
}
