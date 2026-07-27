/**
 * Resolve loyalty creation source mode from intake signals.
 */

import { hasAuthoritativeLoyaltyTopology } from './loyaltyContractDiagnostics.js';

const IMPROVEMENT_CUES =
  /\b(better|improve|upgrade|redesign|modern(?:ize|ise)?|update|refresh|enhance)\b/i;

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {{
 *   hasAttachmentEvidence?: boolean;
 *   userMessage?: string | null;
 *   requirements?: string | null;
 *   preseededDraft?: Record<string, unknown> | null;
 *   extractedFromImage?: boolean;
 * }} input
 * @returns {'SOURCE_DRIVEN' | 'INTENT_DRIVEN' | 'HYBRID'}
 */
export function resolveLoyaltySourceMode(input = {}) {
  const preseeded =
    input.preseededDraft && typeof input.preseededDraft === 'object' ? input.preseededDraft : null;
  const message = pickString(input.userMessage, input.requirements);
  const hasExtractedRule = Number(preseeded?.rule?.purchasesRequired) > 0;
  const hasTopology = hasAuthoritativeLoyaltyTopology(preseeded?.cardTopology);
  const hasSourceEvidence =
    input.hasAttachmentEvidence === true ||
    input.extractedFromImage === true ||
    preseeded?.extractedFromImage === true ||
    hasExtractedRule ||
    hasTopology;
  const hasIntent = Boolean(message);
  const wantsImprovement = IMPROVEMENT_CUES.test(message);

  if (hasSourceEvidence && hasIntent && wantsImprovement) return 'HYBRID';
  if (hasSourceEvidence) return 'SOURCE_DRIVEN';
  return 'INTENT_DRIVEN';
}

export default { resolveLoyaltySourceMode };
