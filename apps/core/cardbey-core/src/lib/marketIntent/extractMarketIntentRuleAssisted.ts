/**
 * Conservative rule-assisted fallback when LLM is unavailable.
 * NOT the primary classifier — returns AMBIGUOUS/CLASSIFICATION_FAILED for most commercial cases.
 */
import type { ExternalMarketSignal } from './types.js';
import type { MarketIntentLlmResponse } from './marketIntentSchema.js';

function evidence(statement: string, span: string | null, basis: 'EXPLICIT' | 'INFERRED', confidence: number) {
  return [{ statement, span, basis, confidence }];
}

/** Very short personal/social phrases with no business objective. */
function isObviousNonCommercial(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.length < 8) return true;
  const personalPatterns = [
    /^happy birthday\b/,
    /^congrats\b/,
    /^chúc mừng\b/,
    /^have a great weekend\b/,
    /^just had coffee\b/,
    /^lovely weather\b/,
  ];
  return personalPatterns.some((re) => re.test(t));
}

export function extractMarketIntentRuleAssisted(
  signal: ExternalMarketSignal,
): MarketIntentLlmResponse | null {
  const text = signal.rawText.trim();
  if (!text) return null;

  if (isObviousNonCommercial(text)) {
    return {
      classification: 'NON_COMMERCIAL',
      classificationConfidence: 0.72,
      classificationReason: 'Text appears to be personal/social conversation without commercial objective.',
      classificationEvidence: evidence(
        'No business objective detected in short personal message.',
        text.slice(0, 80),
        'INFERRED',
        0.65,
      ),
      intents: [],
      has: [],
      wants: [],
      actorHint: null,
      businessHint: null,
      locationHint: null,
    };
  }

  // Without semantic LLM, do not guess commercial intent families.
  return {
    classification: 'AMBIGUOUS',
    classificationConfidence: 0.2,
    classificationReason:
      'LLM extraction unavailable; rule-assisted fallback cannot confidently classify commercial intent.',
    classificationEvidence: evidence(
      'Semantic classification requires LLM provider.',
      null,
      'INFERRED',
      0.2,
    ),
    intents: [],
    has: [],
    wants: [],
    actorHint: signal.actorHint ?? null,
    businessHint: null,
    locationHint: signal.locationHint ?? null,
  };
}
