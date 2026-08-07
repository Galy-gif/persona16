import { REPORTED_SPEECH_VERB } from './evidencePredicates';

export function normalizeCorrectionEvidence(text: string): string {
  return text
    .replace(/收拾残局/gu, '收尾')
    .replace(
      /不想再捡那些不属于你的摊子(?:了)?/gu,
      '不想替人收尾',
    )
    .replace(
      /(?:再也)?不想(?:再)?当(?:那个)?(?:最后)?(?:兜底|收拾残局|收拾|收尾)(?:的人|人)/gu,
      '不想替人收尾',
    )
    .replace(
      /不再想当(?:所有人|别人|大家|人)的(?:收尾人|兜底人)/gu,
      '不想替人收尾',
    )
    .replace(/不愿意?/gu, '不想')
    .replace(/(?:动不起来|动不了)/gu, '缺行动力')
    .replace(/不是(?:怕失败|害怕失败|怕|害怕)(?=$|[，,。！？!?\s])/gu, '不是害怕失败')
    .replace(/不是做不到/gu, '不是缺行动力')
    .replace(/(?:这么|那么|如此|太)(?=[\p{Script=Han}])/gu, '很')
    .replace(/(?:所有人|别人|大家)/gu, '人')
    .replace(/(?:用户|人物|我|你|他|她|明确|纠正|根本|只是|只|也|再|已经|真的|就是|说|的|了|，|。|；|：|、|\s)/gu, '')
    .replace(/^是(?=不想)/u, '');
}
export const CORRECTION_ACKNOWLEDGEMENT_SOURCE = '(?:(?:是)?我理解(?:错|偏)了|(?:是)?我(?:看错|想错|判断错|搞错|弄错)了|是我把(?:这个|那个)?框架套错了|我(?:刚才)?套错框架了|(?:刚才)?(?:那个|这个)?框架套错了)';
export const CORRECTION_ACKNOWLEDGEMENT = new RegExp(
  CORRECTION_ACKNOWLEDGEMENT_SOURCE,
  'u',
);

export function affirmedCorrectionEvidence(
  evidenceSpans: readonly string[],
): {
  fearDenied: boolean;
  actionlessnessDenied: boolean;
  cleanupPropositions: string[];
  cleanupSubject?: string;
  cleanupBoundary?: string;
} {
  let fearDenied = false;
  let actionlessnessDenied = false;
  const cleanupPropositions: string[] = [];
  let cleanupSubject: string | undefined;
  let cleanupBoundary: string | undefined;
  const safeCleanupSubject = (value: string): string | undefined => {
    const subject = value.trim().replace(/^(?:那个|那些|这个|这些)/u, '');
    return /^[\p{Script=Han}A-Za-z0-9·_-]{1,12}$/u.test(subject)
      ? subject
      : undefined;
  };
  const metaNegationBefore = (sentence: string, index: number): boolean => (
    /(?:没(?:有)?说|不是说|并非说|并不是说|并未(?:说|表示)|没有(?:说|表示)|不能说|别(?:再)?说|不要说|(?:别人|同事|他|她)说)[^。！？!?\n；;]{0,28}$/u
      .test(sentence.slice(0, index))
  );
  for (const span of evidenceSpans) {
    const withoutQuotes = span.replace(
      /“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』|‘[^’]*’/gu,
      '',
    );
    const sourceSentences = withoutQuotes.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? [];
    for (const rawSentence of sourceSentences) {
      if (/[？?]/u.test(rawSentence)) continue;
      const sentence = rawSentence.replace(/[。！!]$/u, '');
      if (/(?:(?:前面|上面|上述)(?:这些|那些)?|这些|那些)(?:说法|判断|内容)?(?:都)?(?:并)?不是我的(?:情况|意思)/u
        .test(sentence)) {
        fearDenied = false;
        actionlessnessDenied = false;
        cleanupPropositions.length = 0;
        cleanupSubject = undefined;
        cleanupBoundary = undefined;
        continue;
      }
      const directDenial = /(?:^|[；;])\s*我(?:既)?不是(?:害怕失败|怕失败|害怕|怕)[，,]\s*也不是(?:缺行动力|动不了|动不起来)(?=$|[，,；;])/u
        .exec(sentence);
      if (directDenial && !metaNegationBefore(sentence, directDenial.index)) {
        fearDenied = true;
        actionlessnessDenied = true;
      }
      for (const match of sentence.matchAll(
        /(?:^|[；;]|[，,]\s*而是)\s*(?:我)?(?:只是|就是|是)?(?:根本)?(?:不想再替([^。！？!?\n；;]{1,16})(?:收尾|收拾残局|兜底)|不想再当(?:那个)?(?:最后)?(?:收拾残局|收拾|收尾|兜底)(?:的人|人)|不再想当([^。！？!?\n；;]{1,16})的(?:收尾人|兜底人))/gu,
      )) {
        if (metaNegationBefore(sentence, match.index ?? 0)) continue;
        const cleanupEvidence = match[0].replace(
          /^(?:[；;]\s*|[，,]\s*而是\s*)/u,
          '',
        );
        cleanupPropositions.push(normalizeCorrectionEvidence(cleanupEvidence));
        const subject = safeCleanupSubject(match[1] ?? match[2] ?? '');
        if (subject) {
          cleanupSubject = subject;
          cleanupBoundary = match[1]
            ? `再替${subject}收尾`
            : `再当${subject}的收尾人`;
        } else if (/不想再当(?:那个)?(?:最后)?(?:收拾残局|收拾|收尾|兜底)(?:的人|人)/u
          .test(cleanupEvidence)) {
          const role = cleanupEvidence.match(
            /不想(再当(?:那个)?(?:最后)?(?:收拾残局|收拾|收尾|兜底)(?:的人|人))/u,
          )?.[1];
          if (role) cleanupBoundary = role;
        }
      }
    }
  }
  return {
    fearDenied,
    actionlessnessDenied,
    cleanupPropositions,
    cleanupSubject,
    cleanupBoundary,
  };
}

export function hasExplicitCurrentCorrectionSignal(
  evidenceSpans: readonly string[],
): boolean {
  return evidenceSpans.some((span) => {
    const unquoted = span.replace(
      /“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』|‘[^’]*’/gu,
      '',
    );
    const signal = /(?:你|刚才的理解|这个理解)(?:理解|想|看|判断)?错了|你误会了|不是这个意思|我是在纠正(?:你|刚才的理解)|我说的不是(?!在纠正|想纠正|要纠正|为了纠正)/gu;
    return [...unquoted.matchAll(signal)].some((match) => {
      const index = match.index ?? 0;
      const sentenceStart = Math.max(
        unquoted.lastIndexOf('。', index - 1),
        unquoted.lastIndexOf('！', index - 1),
        unquoted.lastIndexOf('？', index - 1),
        unquoted.lastIndexOf('\n', index - 1),
        unquoted.lastIndexOf('；', index - 1),
      ) + 1;
      const prefix = unquoted.slice(sentenceStart, index);
      const sentenceEndCandidates = [
        unquoted.indexOf('。', index),
        unquoted.indexOf('！', index),
        unquoted.indexOf('？', index),
        unquoted.indexOf('\n', index),
        unquoted.indexOf('；', index),
      ].filter((candidate) => candidate >= 0);
      const sentenceEnd = sentenceEndCandidates.length > 0
        ? Math.min(...sentenceEndCandidates) + 1
        : unquoted.length;
      const sentence = unquoted.slice(sentenceStart, sentenceEnd);
      const negatedOrMeta = /(?:不是|并非|并不是|不算|(?:(?:并)?没(?:有)?|并未|不曾)(?:说|表示|认为|认定|咬定)|不代表|不能说|别说|不要说)[^，,。！？!?\n；;]{0,12}$/u
        .test(prefix);
      const clausePrefix = prefix.slice(
        Math.max(
          prefix.lastIndexOf('，'),
          prefix.lastIndexOf(','),
          prefix.lastIndexOf('；'),
          prefix.lastIndexOf(';'),
        ) + 1,
      ).trim();
      const containsReportVerb = REPORTED_SPEECH_VERB.test(clausePrefix)
        || /(?:的原话|原话是|引用|转述)/u.test(clausePrefix);
      const firstPersonReport = /^(?:我(?:自己)?|自己|用户)(?:刚才|现在|一直|其实)?(?:说|觉得|认为|认定|咬定|表示|写道|告诉|讲)/u
        .test(clausePrefix)
        || /^(?:我(?:自己)?|自己|用户)(?:的)?原话/u.test(clausePrefix);
      const thirdPartyReport = containsReportVerb && !firstPersonReport;
      const hypotheticalOrUncertain = /(?:如果|假如|要是|假设|假定|设想|姑且(?:假定|假设)?|可能|也许|或许|万一|是否|是不是|难道)[^，,。！？!?\n；;]{0,18}$/u
        .test(prefix);
      const questioned = /[？?]/u.test(sentence)
        || /(?:吗|么|呢)[。.!]?$/u.test(sentence.trim());
      return !negatedOrMeta
        && !thirdPartyReport
        && !hypotheticalOrUncertain
        && !questioned;
    });
  });
}

export function requiresClosedCorrection(
  evidenceSpans: readonly string[],
): boolean {
  if (!hasExplicitCurrentCorrectionSignal(evidenceSpans)) return false;
  const correction = affirmedCorrectionEvidence(evidenceSpans);
  return correction.fearDenied
    && correction.actionlessnessDenied
    && correction.cleanupPropositions.length > 0;
}
