/**
 * Phase 3 — heuristic disagreement classifier (observe only; never routes).
 */

import type {
  AgreementStatus,
  ClassifyDisagreementInput,
  DisagreementReason,
} from './decisionRecord.types.js';
import {
  isCampaignTool,
  isLoyaltyTool,
  userTextMentionsCampaign,
  userTextMentionsLoyalty,
} from './toolFamily.js';

const CLOSE_SCORE_MARGIN = 0.12;

function isAgreed(agreement: AgreementStatus): boolean {
  return agreement === 'top1' || agreement === 'top3';
}

function hasTag(tags: string[], tag: string): boolean {
  return tags.includes(tag);
}

function alternativesAreClose(
  alternatives: ClassifyDisagreementInput['kernelAlternatives'],
): boolean {
  if (!alternatives || alternatives.length < 2) return false;
  const top = alternatives[0]?.score ?? 0;
  const second = alternatives[1]?.score ?? 0;
  return top - second < CLOSE_SCORE_MARGIN;
}

/**
 * Classify why Performer and Kernel disagree (heuristic v1).
 */
export function classifyDisagreement(input: ClassifyDisagreementInput): DisagreementReason | null {
  if (isAgreed(input.agreement)) return null;
  if (input.agreement === 'no_kernel_run') return 'missing_context';

  const tags = input.tags ?? [];
  const userText = String(input.userText ?? '');
  const performerTool = String(input.performerTool ?? '').trim();
  const kernelTopTool = String(input.kernelTopTool ?? '').trim();
  const intentReasonerTool = String(input.intentReasonerTool ?? '').trim();
  const signals = input.attachmentSignals ?? {};

  if (hasTag(tags, 'missing_context') || signals.missingStore) {
    return 'missing_context';
  }

  if (signals.ocrFailed || signals.ocrWeak) {
    return 'ocr_ambiguity';
  }

  if (signals.visionAmbiguous || hasTag(tags, 'attachment_hijack')) {
    if (hasTag(tags, 'campaign_vs_loyalty')) return 'rule_conflict';
    return 'vision_ambiguity';
  }

  if (hasTag(tags, 'campaign_vs_loyalty')) {
    return 'rule_conflict';
  }

  if (userTextMentionsCampaign(userText) && isLoyaltyTool(performerTool) && isCampaignTool(kernelTopTool)) {
    return 'explicit_user_wording';
  }

  if (userTextMentionsLoyalty(userText) && isCampaignTool(performerTool) && isLoyaltyTool(kernelTopTool)) {
    return 'explicit_user_wording';
  }

  if (
    intentReasonerTool &&
    performerTool &&
    intentReasonerTool !== performerTool &&
    hasTag(tags, 'performer_override')
  ) {
    return 'runtime_override';
  }

  if (hasTag(tags, 'attachment_hijack')) {
    return 'rule_conflict';
  }

  if (alternativesAreClose(input.kernelAlternatives)) {
    return 'clarification_required';
  }

  if (hasTag(tags, 'disagreement')) {
    return 'unknown';
  }

  return 'unknown';
}

export function requiresHumanReview(
  agreement: AgreementStatus,
  reason: DisagreementReason | null,
  tags: string[],
): boolean {
  if (isAgreed(agreement)) return false;
  if (reason === 'unknown') return true;
  if (hasTag(tags, 'campaign_vs_loyalty')) return true;
  if (hasTag(tags, 'attachment_hijack')) return true;
  if (reason === 'rule_conflict' || reason === 'explicit_user_wording') return true;
  return false;
}
