/**
 * Intake V2 — detect when a user request is understood but likely needs product/schema work
 * (no safe existing tool mapping). Conservative: avoids headline/tagline fixes that code_fix handles.
 *
 * @typedef {object} CapabilityGapResult
 * @property {boolean} isGap
 * @property {string} [reason]
 * @property {string} [requestedCapability]
 * @property {'content_field'|'ui_element'|'schema_extension'|'editor_support'} [suggestedScope]
 * @property {string} [spawnIntent]
 */

import { readEflFeedback } from '../../services/eflRagReader.js';

/**
 * @param {string} intent
 * @param {CapabilityGapResult} gapResult
 * @param {string} userMessage
 * @returns {Promise<CapabilityGapResult>}
 */
async function applyEflSuccessSuppression(intent, gapResult, userMessage) {
  if (!gapResult.isGap) return gapResult;
  const msg = String(userMessage ?? '').trim();
  const eflSuccesses = await readEflFeedback(`${intent} ${msg.slice(0, 50)}`, {
    intent,
    limit: 3,
    minWeight: 0.7,
  }).catch(() => []);
  const hasSuccessHistory = eflSuccesses.some((f) => f.type === 'success_pattern');
  if (hasSuccessHistory) {
    return {
      isGap: false,
      reason: 'intent_has_efl_success_history',
      eflMatches: eflSuccesses.length,
    };
  }
  return gapResult;
}

/**
 * @returns {boolean}
 */
export function isIntakeV2CapabilityGapEnabled() {
  return String(process.env.DISABLE_INTAKE_V2_CAPABILITY_GAP || '')
    .trim()
    .toLowerCase() !== 'true';
}

/** Headline / copy edits — existing code_fix + store patch paths cover these. */
const SIMPLE_TEXT_OR_COPY_FIX_RE =
  /\b(fix|change|update|replace|correct|edit|rewrite)\b[\s\S]{0,120}\b(headline|title|tagline|subtitle|name|wording|text|spelling|typo|hero)\b/i;

/** Vague / too short → clarify, not capability gap. */
const VAGUE_ONLY_RE = /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|help)\b[!.\s]*$/i;

/** Short messages with commercial/promo vocabulary may still warrant gap detection. */
const CAPABILITY_KEYWORDS =
  /clear|stock|season|sale|flash|clearance|loyalty|referral|bogo|bundle|discount|offer|deal|campaign/i;

/** Wider commercial / ops vocabulary (e.g. general_chat misroutes). Exported for intake route parity. */
export const COMMERCIAL_INTENT_RE =
  /clear|stock|season|sale|flash|clearance|loyalty|referral|bogo|bundle|discount|offer|deal|campaign|promote|marketing|advertis|customer|revenue|profit|inventory/i;

/**
 * Tagline/subtitle *placement* under hero (may exceed current heroSubtitle contract in some templates).
 */
const TAGLINE_UNDER_HERO_RE =
  /\b(tagline|subtitle|sub-?headline|line of text)\b[\s\S]{0,100}\b(under|below)\b[\s\S]{0,80}\b(headline|hero|h1|title)\b/i;
const UNDER_HERO_THEN_TAGLINE_RE =
  /\b(under|below)\b[\s\S]{0,100}\b(headline|hero|h1|title)\b[\s\S]{0,120}\b(tagline|subtitle|sub-?headline)\b/i;

const NEW_SURFACE_RE = [
  /\badd\s+(a\s+)?(new\s+)?(ui\s+)?(section|block|panel|widget|column)\b/i,
  /** e.g. "add a new testimonials section …" */
  /\badd\s+(?:a\s+)?(?:new\s+)?[\w'-]+(?:\s+[\w'-]+){0,8}\s+(section|block|panel|widget)\b/i,
  /\bnew\s+(visual\s+)?(section|block|region)\b/i,
  /\bcustom\s+(layout|block|component|section)\b/i,
  /\b(schema|data\s+model)\s+(change|extension|migration|new\s+field)\b/i,
];

/**
 * @param {object} input
 * @param {string} input.userMessage
 * @param {object} input.classification
 * @param {Array<{ field?: string, reason?: string }>} [input.validationErrors]
 * @param {object|null} [input.intentResolution]
 * @returns {Promise<CapabilityGapResult>}
 */
export async function detectCapabilityGap({
  userMessage,
  classification,
  validationErrors = [],
  intentResolution = null,
}) {
  const msg = String(userMessage ?? '').trim();
  const intent = String(classification?.intent ?? classification?.tool ?? '').trim();
  const tool = String(classification?.tool ?? '').trim();
  if (!isIntakeV2CapabilityGapEnabled()) {
    return { isGap: false };
  }

  if (
    msg.length < 32 &&
    !CAPABILITY_KEYWORDS.test(msg) &&
    !(tool === 'general_chat' && COMMERCIAL_INTENT_RE.test(msg))
  ) {
    return { isGap: false };
  }

  if (VAGUE_ONLY_RE.test(msg)) {
    return { isGap: false };
  }

  if (tool === 'code_fix') {
    return { isGap: false };
  }

  // Plain headline/tagline wording fixes → code_fix, not gap
  if (SIMPLE_TEXT_OR_COPY_FIX_RE.test(msg) && !TAGLINE_UNDER_HERO_RE.test(msg) && !UNDER_HERO_THEN_TAGLINE_RE.test(msg)) {
    const blocked = NEW_SURFACE_RE.some((re) => re.test(msg));
    if (!blocked) {
      return { isGap: false };
    }
  }

  const irConf = typeof intentResolution?.confidence === 'number' ? intentResolution.confidence : 0;

  const taglinePlacement = TAGLINE_UNDER_HERO_RE.test(msg) || UNDER_HERO_THEN_TAGLINE_RE.test(msg);
  if (taglinePlacement) {
    if (irConf < 0.5 && msg.length < 55) {
      return { isGap: false };
    }
    return applyEflSuccessSuppression(
      intent,
      {
        isGap: true,
        reason: 'hero_tagline_placement_extension',
        requestedCapability: msg.slice(0, 200),
        suggestedScope: 'content_field',
        spawnIntent: `Proposal-only (additive): inspect how to support tagline/subtitle placement under the hero headline in preview + editor; identify minimal schema/UI path; do not apply changes.`,
      },
      msg,
    );
  }

  for (const re of NEW_SURFACE_RE) {
    if (re.test(msg)) {
      if (irConf < 0.48 && msg.length < 60) {
        return { isGap: false };
      }
      return applyEflSuccessSuppression(
        intent,
        {
          isGap: true,
          reason: 'new_ui_or_schema_surface',
          requestedCapability: msg.slice(0, 200),
          suggestedScope: 'ui_element',
          spawnIntent: `Proposal-only (additive): inspect minimal path to add the requested UI block/section; list affected components and schema; no production mutation.`,
        },
        msg,
      );
    }
  }

  const hasUnknownField =
    Array.isArray(validationErrors) && validationErrors.some((e) => e && e.reason === 'unknown_field');
  if (hasUnknownField && msg.length >= 48 && /\b(add|create|new|custom|extend)\b/i.test(msg)) {
    return applyEflSuccessSuppression(
      intent,
      {
        isGap: true,
        reason: 'strict_validation_unknown_field',
        requestedCapability: msg.slice(0, 200),
        suggestedScope: 'editor_support',
        spawnIntent: `Proposal-only: map rejected/unknown parameters to a supported product surface; additive extension only.`,
      },
      msg,
    );
  }

  if (tool === 'general_chat' && COMMERCIAL_INTENT_RE.test(msg)) {
    return applyEflSuccessSuppression(
      intent,
      {
        isGap: true,
        reason: 'commercial_intent_general_chat',
        requestedCapability: msg.slice(0, 200),
        suggestedScope: 'schema_extension',
        spawnIntent: `Proposal-only: commercial or ops intent routed to general_chat; map to supported product surfaces; additive extension only.`,
      },
      msg,
    );
  }

  return { isGap: false };
}
