export type PilotExpressionPatternViolation =
  | 'literal_tone_marker_frequency_exceeded'
  | 'repeated_tone_marker_watermark';

export interface PilotExpressionSample {
  id: string;
  text: string;
}

export interface PilotExpressionPatternGate {
  passed: boolean;
  totalSamples: number;
  literalMarkerCount: number;
  literalMarkerRate: number;
  maxAllowedLiteralMarkers: number;
  maxAllowedSameMarker: number;
  markerCounts: Record<string, number>;
  markedSampleIds: string[];
  violations: PilotExpressionPatternViolation[];
}

const PARENTHETICAL_MARKER = /[（(]\s*([^）)\n]{1,20}?)\s*[）)]/g;
const INLINE_TONE_OR_ACTION = /^(?:小声|轻声|低声|认真|平静|慢慢|停(?:了|顿|一下|一会儿)|顿(?:了|一下)|沉默|安静|笑(?:了|一下|着)?|苦笑|叹(?:了|气|一下)?|想了想|缓(?:了|一下)|等(?:了|一拍|了一拍)|片刻|半晌|压低声音|放轻声音|语气|迟疑|犹豫|皱眉|摇头|点头|深呼吸|吸了口气)/;

function literalToneMarkers(text: string): string[] {
  const markers: string[] = [];
  const firstNonWhitespace = text.search(/\S/);
  let openingSequenceEnd: number | null = null;
  for (const match of text.matchAll(PARENTHETICAL_MARKER)) {
    if (!match[1] || match.index === undefined) continue;
    const normalized = match[1].trim().replace(/\s+/g, '');
    const isOpening = match.index === firstNonWhitespace
      || openingSequenceEnd !== null
        && text.slice(openingSequenceEnd, match.index).trim().length === 0;
    if (isOpening) openingSequenceEnd = match.index + match[0].length;
    if (!isOpening && !INLINE_TONE_OR_ACTION.test(normalized)) continue;
    markers.push(`（${normalized}）`);
  }
  return markers;
}

export function evaluateLiteralToneMarkerFrequency(
  samples: readonly PilotExpressionSample[],
): PilotExpressionPatternGate {
  const totalSamples = samples.length;
  const maxAllowedLiteralMarkers = totalSamples === 0
    ? 0
    : Math.max(1, Math.floor(totalSamples * 0.1));
  const maxAllowedSameMarker = totalSamples === 0
    ? 0
    : Math.max(1, Math.floor(totalSamples * 0.05));
  const markerCounts: Record<string, number> = {};
  const markedSampleIds: string[] = [];

  for (const sample of samples) {
    const markers = literalToneMarkers(sample.text);
    if (markers.length === 0) continue;
    for (const marker of markers) {
      markerCounts[marker] = (markerCounts[marker] ?? 0) + 1;
    }
    markedSampleIds.push(sample.id);
  }

  const literalMarkerCount = Object.values(markerCounts)
    .reduce((sum, count) => sum + count, 0);
  const violations: PilotExpressionPatternViolation[] = [];
  if (literalMarkerCount > maxAllowedLiteralMarkers) {
    violations.push('literal_tone_marker_frequency_exceeded');
  }
  if (Object.values(markerCounts).some((count) => count > maxAllowedSameMarker)) {
    violations.push('repeated_tone_marker_watermark');
  }

  return {
    passed: violations.length === 0,
    totalSamples,
    literalMarkerCount,
    literalMarkerRate: totalSamples === 0 ? 0 : literalMarkerCount / totalSamples,
    maxAllowedLiteralMarkers,
    maxAllowedSameMarker,
    markerCounts,
    markedSampleIds,
    violations,
  };
}
