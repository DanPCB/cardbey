/**
 * Score a single registered blueprint against scoring evidence.
 */

import {
  SCORING_WEIGHTS,
  ACTION_FIT_SPLIT,
  SCORER_VERSION,
} from './scoringWeights.js';
import { freezeBlueprintScoreResult, clamp01 } from './blueprintScoreResult.js';
import { isNoiseContentRole } from './blueprintEvidence.js';

/** Section role → content roles that satisfy it for coverage. */
const SECTION_TO_CONTENT = Object.freeze({
  service_categories: ['service_category'],
  services: ['service', 'service_category'],
  menu: ['menu_item', 'menu_category'],
  products: ['product', 'product_category'],
  projects: ['project'],
  gallery: ['gallery', 'project'],
  testimonials: ['testimonial'],
  trust: ['trust_content', 'testimonial'],
  about: ['about'],
  contact: ['contact'],
  location: ['location'],
  service_area: ['location'],
  featured_items: ['product', 'service', 'menu_item'],
  quote: [], // action-driven
  booking: [], // booking evidence
  hours: [],
  brands: [],
  offers: [],
  process: [],
  hero: [],
  footer: [],
});

/**
 * @param {import('../contracts/blueprint.js').StorefrontBlueprint} blueprint
 * @param {import('./blueprintEvidence.js').BlueprintScoringEvidence} evidence
 * @returns {import('./blueprintScoreResult.js').BlueprintScoreResult}
 */
export function scoreBlueprint(blueprint, evidence) {
  if (!blueprint || typeof blueprint !== 'object' || !blueprint.id) {
    throw new Error('[designLibrary.scoring] Unknown or invalid blueprint reference');
  }

  /** @type {import('./blueprintScoreResult.js').ScoreReason[]} */
  const reasons = [];
  /** @type {import('./blueprintScoreResult.js').ScoreReason[]} */
  const penalties = [];

  const businessModelFit = scoreBusinessModelFit(blueprint, evidence, reasons, penalties);
  const content = scoreContentCoverage(blueprint, evidence, reasons, penalties);
  const action = scoreActionFit(blueprint, evidence, reasons, penalties);
  const required = scoreRequiredData(blueprint, evidence, reasons, penalties);
  const media = scoreMediaTrust(blueprint, evidence, reasons, penalties);

  const eligibility = evaluateEligibility(blueprint, evidence, penalties);
  const preference = scoreOwnerPreference(
    blueprint,
    evidence,
    reasons,
    penalties,
    businessModelFit,
    eligibility.eligible,
  );

  const dimensions = {
    businessModelFit,
    contentCoverage: content.score,
    actionFit: action.score,
    requiredDataReadiness: required.score,
    mediaTrustReadiness: media,
    ownerPreference: preference,
  };

  let score =
    SCORING_WEIGHTS.businessModelFit * businessModelFit +
    SCORING_WEIGHTS.contentCoverage * content.score +
    SCORING_WEIGHTS.actionFit * action.score +
    SCORING_WEIGHTS.requiredDataReadiness * required.score +
    SCORING_WEIGHTS.mediaTrustReadiness * media +
    SCORING_WEIGHTS.ownerPreference * preference;

  // Soft floor for ineligible: keep visible in allScores but suppress selection later.
  if (!eligibility.eligible) {
    score = Math.min(score, 0.35);
    penalties.push({
      code: 'ineligible_cap',
      contribution: -0.1,
      detail: eligibility.reason,
    });
  }

  return freezeBlueprintScoreResult({
    blueprintId: blueprint.id,
    blueprintVersion: blueprint.version,
    score: clamp01(score),
    eligible: eligibility.eligible,
    reasons,
    penalties,
    matchedContentRoles: content.matched,
    missingRequiredData: required.missing,
    unsupportedContentRoles: content.unsupported,
    actionFit: action.detail,
    dimensions,
    scorerVersion: SCORER_VERSION,
  });
}

/**
 * @param {import('../contracts/blueprint.js').StorefrontBlueprint} blueprint
 * @param {import('./blueprintEvidence.js').BlueprintScoringEvidence} evidence
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} reasons
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} penalties
 */
function scoreBusinessModelFit(blueprint, evidence, reasons, penalties) {
  const model = evidence.businessModel;
  const preferred = blueprint.preferredBusinessModels || [];

  if (preferred.includes(model)) {
    reasons.push({
      code: 'business_model_preferred',
      contribution: 0.3,
      detail: `${model} ∈ preferredBusinessModels`,
    });
    return 1;
  }

  // Soft adjacency
  if (model === 'service_quote' && preferred.includes('portfolio')) {
    reasons.push({ code: 'business_model_adjacent_portfolio', contribution: 0.18 });
    return 0.72;
  }
  if (model === 'portfolio' && preferred.includes('service_quote')) {
    reasons.push({ code: 'business_model_adjacent_quote', contribution: 0.15 });
    return 0.65;
  }
  if (model === 'mixed') {
    reasons.push({ code: 'business_model_mixed', contribution: 0.08 });
    return 0.45;
  }

  // service_quote vs service-booking without booking → weak
  if (
    blueprint.id === 'service-booking' &&
    model === 'service_quote' &&
    !evidence.hasBookingEvidence
  ) {
    penalties.push({
      code: 'business_model_mismatch_booking',
      contribution: -0.25,
      detail: 'service_quote without booking evidence',
    });
    return 0.12;
  }

  if (blueprint.id === 'restaurant-menu' && model !== 'restaurant' && !evidence.hasMenuEvidence) {
    penalties.push({
      code: 'business_model_mismatch_restaurant',
      contribution: -0.25,
      detail: 'no restaurant/menu evidence',
    });
    return 0.08;
  }

  if (
    blueprint.id === 'retail-commerce' &&
    model !== 'retail' &&
    !evidence.hasProductEvidence &&
    !evidence.hasPricedPurchasableProduct
  ) {
    penalties.push({
      code: 'business_model_mismatch_retail',
      contribution: -0.25,
      detail: 'no commerce/product evidence',
    });
    return 0.1;
  }

  // Weak residual for other mismatches
  penalties.push({
    code: 'business_model_mismatch',
    contribution: -0.15,
    detail: `${model} ∉ preferred (${preferred.join(',')})`,
  });
  return 0.2;
}

/**
 * @param {import('../contracts/blueprint.js').StorefrontBlueprint} blueprint
 * @param {import('./blueprintEvidence.js').BlueprintScoringEvidence} evidence
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} reasons
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} penalties
 */
function scoreContentCoverage(blueprint, evidence, reasons, penalties) {
  const supported = new Set(blueprint.supportedContentRoles || []);
  const presentMeaningful = evidence.presentRoles.filter((r) => !isNoiseContentRole(r));
  const matched = presentMeaningful.filter((r) => supported.has(r));
  const unsupported = presentMeaningful.filter((r) => !supported.has(r));

  // Offering coverage
  const presentOffering = evidence.offeringRoles;
  const matchedOffering = presentOffering.filter((r) => supported.has(r));
  let offeringScore = 0.4;
  if (presentOffering.length > 0) {
    offeringScore = matchedOffering.length / presentOffering.length;
  }

  // Trust / social proof soft coverage
  const presentTrust = evidence.trustRoles;
  const matchedTrust = presentTrust.filter((r) => supported.has(r));
  const trustScore = presentTrust.length > 0 ? matchedTrust.length / presentTrust.length : 0.5;

  // Default section satisfaction
  const sections = blueprint.defaultSections || [];
  let sectionHits = 0;
  let sectionRelevant = 0;
  for (const sec of sections) {
    const mapped = SECTION_TO_CONTENT[sec.role];
    if (!mapped) continue;
    if (mapped.length === 0) {
      if (sec.role === 'booking' && evidence.hasBookingEvidence) {
        sectionRelevant += 1;
        sectionHits += 1;
      } else if (sec.role === 'quote' && (evidence.primaryAction === 'request_quote' || evidence.businessModel === 'service_quote')) {
        sectionRelevant += 1;
        sectionHits += 1;
      } else if (sec.role === 'hours' && evidence.hasHours) {
        sectionRelevant += 1;
        sectionHits += 1;
      }
      continue;
    }
    sectionRelevant += 1;
    if (mapped.some((r) => (evidence.roleCounts[r] ?? 0) > 0)) sectionHits += 1;
  }
  const sectionScore = sectionRelevant > 0 ? sectionHits / sectionRelevant : 0.5;

  const score = clamp01(offeringScore * 0.55 + trustScore * 0.2 + sectionScore * 0.25);

  if (matched.length > 0) {
    reasons.push({
      code: 'content_roles_matched',
      contribution: SCORING_WEIGHTS.contentCoverage * score,
      detail: matched.join(','),
    });
  }
  if (unsupported.length > 0) {
    penalties.push({
      code: 'content_roles_unsupported',
      contribution: -0.02 * Math.min(unsupported.length, 3),
      detail: unsupported.join(','),
    });
  }

  return { score, matched, unsupported };
}

/**
 * @param {import('../contracts/blueprint.js').StorefrontBlueprint} blueprint
 * @param {import('./blueprintEvidence.js').BlueprintScoringEvidence} evidence
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} reasons
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} penalties
 */
function scoreActionFit(blueprint, evidence, reasons, penalties) {
  const supported = new Set(blueprint.supportedActions || []);
  const primary = evidence.primaryAction;
  const secondary = evidence.secondaryActions[0] ?? null;

  const primarySupported = Boolean(primary && supported.has(primary));
  const secondarySupported = Boolean(secondary && supported.has(secondary));

  /** @type {string[]} */
  const unsupportedActions = [];
  if (primary && !supported.has(primary)) unsupportedActions.push(primary);
  if (secondary && !supported.has(secondary)) unsupportedActions.push(secondary);

  let score = 0;
  if (!primary) {
    score = 0.4;
  } else if (primarySupported) {
    score += ACTION_FIT_SPLIT.primary;
    reasons.push({
      code: 'primary_action_supported',
      contribution: SCORING_WEIGHTS.actionFit * ACTION_FIT_SPLIT.primary,
      detail: primary,
    });
  } else {
    penalties.push({
      code: 'primary_action_unsupported',
      contribution: -SCORING_WEIGHTS.actionFit * ACTION_FIT_SPLIT.primary,
      detail: primary,
    });
  }

  if (secondary) {
    if (secondarySupported) {
      score += ACTION_FIT_SPLIT.secondary;
      reasons.push({
        code: 'secondary_action_supported',
        contribution: SCORING_WEIGHTS.actionFit * ACTION_FIT_SPLIT.secondary,
        detail: secondary,
      });
    } else {
      // Secondary mismatch is mild
      score += ACTION_FIT_SPLIT.secondary * 0.25;
      penalties.push({
        code: 'secondary_action_unsupported',
        contribution: -0.02,
        detail: secondary,
      });
    }
  } else {
    score += ACTION_FIT_SPLIT.secondary * 0.5;
  }

  // Extra penalty: book unsupported when book is primary
  if (primary === 'book' && !primarySupported) {
    penalties.push({ code: 'book_unsupported_as_primary', contribution: -0.08 });
  }

  return {
    score: clamp01(score),
    detail: {
      primaryActionSupported: primarySupported,
      secondaryActionsSupported: secondarySupported && secondary ? [secondary] : [],
      unsupportedActions,
    },
  };
}

/**
 * @param {import('../contracts/blueprint.js').StorefrontBlueprint} blueprint
 * @param {import('./blueprintEvidence.js').BlueprintScoringEvidence} evidence
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} reasons
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} penalties
 */
function scoreRequiredData(blueprint, evidence, reasons, penalties) {
  const required = blueprint.requiredData || [];
  const optional = blueprint.optionalData || [];
  /** @type {string[]} */
  const missing = [];
  let present = 0;
  for (const key of required) {
    if (evidence.availableData[key]) present += 1;
    else missing.push(key);
  }
  let score = required.length === 0 ? 1 : present / required.length;

  // Optional missing — limited penalty
  let optionalMissing = 0;
  for (const key of optional) {
    if (!evidence.availableData[key]) optionalMissing += 1;
  }
  if (optional.length > 0 && optionalMissing > 0) {
    const optionalPenalty = (optionalMissing / optional.length) * 0.15;
    score = clamp01(score - optionalPenalty);
    penalties.push({
      code: 'optional_data_missing',
      contribution: -optionalPenalty * SCORING_WEIGHTS.requiredDataReadiness,
      detail: `${optionalMissing}/${optional.length}`,
    });
  }

  if (missing.length > 0) {
    penalties.push({
      code: 'required_data_missing',
      contribution: -0.1 * missing.length,
      detail: missing.join(','),
    });
  } else if (required.length > 0) {
    reasons.push({ code: 'required_data_ready', contribution: 0.05, detail: required.join(',') });
  }

  return { score: clamp01(score), missing };
}

/**
 * @param {import('../contracts/blueprint.js').StorefrontBlueprint} blueprint
 * @param {import('./blueprintEvidence.js').BlueprintScoringEvidence} evidence
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} reasons
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} penalties
 */
function scoreMediaTrust(blueprint, evidence, reasons, penalties) {
  let score = 0.35;
  if (evidence.hasTestimonials) {
    score += 0.2;
    reasons.push({ code: 'testimonials_present', contribution: 0.02 });
  }
  if (evidence.hasTrustContent) {
    score += 0.15;
    reasons.push({ code: 'trust_content_present', contribution: 0.015 });
  }
  if (evidence.hasLocation) {
    score += 0.1;
  }
  if (evidence.hasPhone) {
    score += 0.05;
  }
  if (evidence.hasImages || evidence.hasProjectOrGallery) {
    score += 0.15;
  }

  // Portfolio needs project/gallery evidence
  if (blueprint.id === 'portfolio-showcase' && !evidence.hasProjectOrGallery) {
    score = Math.min(score, 0.45);
    penalties.push({
      code: 'portfolio_missing_projects',
      contribution: -0.08,
      detail: 'no project/gallery evidence',
    });
  }

  // Trade benefits from trust even without projects
  if (blueprint.id === 'trade-lead-generation' && (evidence.hasTestimonials || evidence.hasTrustContent)) {
    score = Math.max(score, 0.7);
  }

  return clamp01(score);
}

/**
 * @param {import('../contracts/blueprint.js').StorefrontBlueprint} blueprint
 * @param {import('./blueprintEvidence.js').BlueprintScoringEvidence} evidence
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} reasons
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} penalties
 * @param {number} businessModelFit
 * @param {boolean} eligible
 */
function scoreOwnerPreference(blueprint, evidence, reasons, penalties, businessModelFit, eligible) {
  const preferred = evidence.preferredBlueprintId;
  if (!preferred) return 0.5; // neutral — weight still applies but equal across blueprints

  if (preferred === blueprint.id) {
    // Cannot overcome strong incompatibility (visual/preview preference ≠ structure win)
    if (!eligible || businessModelFit <= 0.25) {
      penalties.push({
        code: 'owner_preference_blocked_incompatible',
        contribution: 0,
        detail: preferred,
      });
      return 0;
    }
    reasons.push({
      code: 'owner_preference_match',
      contribution: SCORING_WEIGHTS.ownerPreference,
      detail: preferred,
    });
    return 1;
  }

  return 0.35;
}

/**
 * @param {import('../contracts/blueprint.js').StorefrontBlueprint} blueprint
 * @param {import('./blueprintEvidence.js').BlueprintScoringEvidence} evidence
 * @param {import('./blueprintScoreResult.js').ScoreReason[]} penalties
 */
function evaluateEligibility(blueprint, evidence, penalties) {
  const id = blueprint.id;
  const model = evidence.businessModel;

  if (
    id === 'restaurant-menu' &&
    !evidence.hasMenuEvidence &&
    model !== 'restaurant'
  ) {
    penalties.push({
      code: 'ineligible_restaurant_without_menu',
      contribution: -0.2,
    });
    return { eligible: false, reason: 'restaurant-menu without menu/restaurant evidence' };
  }

  if (
    id === 'retail-commerce' &&
    !evidence.hasProductEvidence &&
    !evidence.hasPricedPurchasableProduct &&
    model !== 'retail'
  ) {
    penalties.push({
      code: 'ineligible_retail_without_commerce',
      contribution: -0.2,
    });
    return { eligible: false, reason: 'retail-commerce without product/commerce evidence' };
  }

  if (
    id === 'service-booking' &&
    !evidence.hasBookingEvidence &&
    model === 'service_quote'
  ) {
    penalties.push({
      code: 'ineligible_booking_for_quote_model',
      contribution: -0.2,
      detail: 'no booking provider/url; primary model is service_quote',
    });
    return { eligible: false, reason: 'service-booking without booking evidence under service_quote' };
  }

  return { eligible: true, reason: null };
}
