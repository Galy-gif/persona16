export type EvaluatedRelationship = 'R1' | 'R2';

export interface RelationshipEvidenceCitation {
  relationship: EvaluatedRelationship;
  replyQuote: string;
  counterfactualQuote: string;
  sourceEventIds: string[];
  eventUseExplanation: string;
}

export interface RelationshipSourceEvent {
  id: string;
  content: string;
}

export interface RelationshipEventEntailment {
  relationship: EvaluatedRelationship;
  sourceEventId: string;
  eventContentQuote: string;
  replyQuote: string;
  counterfactualQuote: string;
  eventUsed: boolean;
  behaviorChangedFromR0: boolean;
  replyEntailedByEvent: boolean;
  relationshipHistoryClaimed: boolean;
  addsUnsupportedSpecificity: boolean;
  unsupportedSpecificityQuote: string | null;
  analysis: string;
}

export interface RelationshipEventEntailmentValidation {
  passed: boolean;
  validationErrors: string[];
}

function normalizeComparableText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function containsExactWords(source: string, quote: string): boolean {
  const normalizedSource = normalizeComparableText(source);
  const normalizedQuote = normalizeComparableText(quote);
  return normalizedQuote.length >= 4 && normalizedSource.includes(normalizedQuote);
}

export function validateRelationshipEvidenceCitations(
  citations: readonly RelationshipEvidenceCitation[],
  replies: readonly { relationship: string; text: string }[],
  availableEventIds: Readonly<Record<EvaluatedRelationship, readonly string[]>>,
): boolean {
  return (['R1', 'R2'] as const).every((relationship) => {
    const relationshipCitations = citations.filter((citation) => citation.relationship === relationship);
    if (relationshipCitations.length !== 1) return false;
    const citation = relationshipCitations[0]!;
    const reply = replies.find((candidate) => candidate.relationship === relationship);
    const counterfactual = replies.find((candidate) => candidate.relationship === 'R0');
    const allowed = new Set(availableEventIds[relationship]);
    return Boolean(reply)
      && containsExactWords(reply!.text, citation.replyQuote)
      && Boolean(counterfactual)
      && containsExactWords(counterfactual!.text, citation.counterfactualQuote)
      && citation.eventUseExplanation.trim().length >= 12
      && citation.sourceEventIds.length > 0
      && citation.sourceEventIds.every((eventId) => allowed.has(eventId));
  });
}

export function validateRelationshipEventEntailments(
  entailments: readonly RelationshipEventEntailment[],
  citations: readonly RelationshipEvidenceCitation[],
  replies: readonly { relationship: string; text: string }[],
  availableEvents: Readonly<Record<EvaluatedRelationship, readonly RelationshipSourceEvent[]>>,
): RelationshipEventEntailmentValidation {
  const validationErrors: string[] = [];
  const expectedKeys = citations.flatMap((citation) => citation.sourceEventIds.map((sourceEventId) => (
    `${citation.relationship}:${sourceEventId}`
  )));
  const actualKeys = entailments.map((item) => `${item.relationship}:${item.sourceEventId}`);
  const sameSet = expectedKeys.length === actualKeys.length
    && new Set(expectedKeys).size === expectedKeys.length
    && new Set(actualKeys).size === actualKeys.length
    && expectedKeys.every((key) => actualKeys.includes(key));
  if (!sameSet) validationErrors.push('event_entailment_set_mismatch');

  const counterfactual = replies.find(({ relationship }) => relationship === 'R0');
  for (const item of entailments) {
    const event = availableEvents[item.relationship]
      .find(({ id }) => id === item.sourceEventId);
    const reply = replies.find(({ relationship }) => relationship === item.relationship);
    if (!event) validationErrors.push(`event_source_not_found:${item.sourceEventId}`);
    if (!event || !containsExactWords(event.content, item.eventContentQuote)) {
      validationErrors.push(`event_content_quote_not_found:${item.sourceEventId}`);
    }
    if (!reply || !containsExactWords(reply.text, item.replyQuote)) {
      validationErrors.push(`event_reply_quote_not_found:${item.sourceEventId}`);
    }
    if (!counterfactual || !containsExactWords(counterfactual.text, item.counterfactualQuote)) {
      validationErrors.push(`event_counterfactual_quote_not_found:${item.sourceEventId}`);
    }
    if (reply && counterfactual
      && normalizeComparableText(reply.text) === normalizeComparableText(counterfactual.text)) {
      validationErrors.push(`event_no_behavior_change:${item.sourceEventId}`);
    }
    if (!item.eventUsed) validationErrors.push(`event_not_used:${item.sourceEventId}`);
    if (!item.behaviorChangedFromR0) {
      validationErrors.push(`event_no_behavior_change:${item.sourceEventId}`);
    }
    if (!item.replyEntailedByEvent) {
      validationErrors.push(`event_reply_not_entailed:${item.sourceEventId}`);
    }
    if (item.addsUnsupportedSpecificity) {
      validationErrors.push(`event_adds_unsupported_specificity:${item.sourceEventId}`);
      if (!item.relationshipHistoryClaimed) {
        validationErrors.push(`unsupported_specificity_not_historical:${item.sourceEventId}`);
      }
      if (item.unsupportedSpecificityQuote === null
        || !reply
        || !containsExactWords(reply.text, item.unsupportedSpecificityQuote)) {
        validationErrors.push(`unsupported_specificity_quote_not_found:${item.sourceEventId}`);
      }
    } else if (item.unsupportedSpecificityQuote !== null) {
      validationErrors.push(`unexpected_unsupported_specificity_quote:${item.sourceEventId}`);
    }
  }
  return {
    passed: validationErrors.length === 0,
    validationErrors: [...new Set(validationErrors)],
  };
}
