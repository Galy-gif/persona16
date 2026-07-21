export type EvaluatedRelationship = 'R1' | 'R2';

export interface RelationshipEvidenceCitation {
  relationship: EvaluatedRelationship;
  replyQuote: string;
  counterfactualQuote: string;
  sourceEventIds: string[];
  eventUseExplanation: string;
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
    const quote = citation.replyQuote.trim();
    const counterfactualQuote = citation.counterfactualQuote.trim();
    const allowed = new Set(availableEventIds[relationship]);
    return Boolean(reply)
      && quote.length >= 4
      && reply!.text.includes(quote)
      && Boolean(counterfactual)
      && counterfactualQuote.length >= 4
      && counterfactual!.text.includes(counterfactualQuote)
      && citation.eventUseExplanation.trim().length >= 12
      && citation.sourceEventIds.length > 0
      && citation.sourceEventIds.every((eventId) => allowed.has(eventId));
  });
}
