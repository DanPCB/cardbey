/**
 * Acquisition decision policy — agent recommends; this layer decides.
 * PUBLICLY_ACCESSIBLE ≠ REUSABLE ≠ DOWNLOADABLE ≠ PUBLISHABLE
 */

import { classifyOpenMediaLicense } from '../universalLibrary/openMediaRights.js';
import { suggestRights, decideRights } from '../universalResourceIntelligence/rightsIntelligence.js';
import { CUSTODY_MODE } from '../universalResourceIntelligence/types.js';

export const ACQUISITION_DECISION = Object.freeze({
  INDEX_ONLY: 'INDEX_ONLY',
  REFERENCE_ONLY: 'REFERENCE_ONLY',
  REMOTE_REUSE: 'REMOTE_REUSE',
  DOWNLOAD_ALLOWED: 'DOWNLOAD_ALLOWED',
  DOWNLOAD_WITH_ATTRIBUTION: 'DOWNLOAD_WITH_ATTRIBUTION',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  BLOCKED: 'BLOCKED',
});

/** Sources that may never be treated as acquireable stock media. */
export const DISCOVERY_ONLY_PROVIDERS = Object.freeze([
  'tiktok',
  'youtube',
  'instagram',
  'facebook',
  'website',
  'web_crawl',
  'directory_crawl',
  'google_maps',
  'google',
]);

export const SOURCE_ROLE = Object.freeze({
  ACQUISITION_SOURCE: 'ACQUISITION_SOURCE',
  REFERENCE_ONLY: 'REFERENCE_ONLY',
  BUSINESS_DISCOVERY: 'BUSINESS_DISCOVERY',
});

/**
 * @param {string} provider
 * @returns {string}
 */
export function sourceRoleForProvider(provider) {
  const p = String(provider || '')
    .toLowerCase()
    .replace(/^src_/, '');
  if (DISCOVERY_ONLY_PROVIDERS.some((d) => p.includes(d))) {
    return SOURCE_ROLE.BUSINESS_DISCOVERY;
  }
  if (
    ['pexels', 'openverse', 'wikimedia', 'pixabay', 'freesound', 'unsplash'].some((d) =>
      p.includes(d),
    )
  ) {
    return SOURCE_ROLE.ACQUISITION_SOURCE;
  }
  return SOURCE_ROLE.REFERENCE_ONLY;
}

/**
 * Map license + provider signals → acquisition decision + scores.
 * Never enables permanent custody by default.
 *
 * @param {object} input
 */
export function resolveAcquisitionDecision(input = {}) {
  const provider = String(input.provider || input.sourceId || '')
    .toLowerCase()
    .replace(/^src_/, '');
  const license = String(input.license || '').trim();
  const role = sourceRoleForProvider(provider);

  if (role === SOURCE_ROLE.BUSINESS_DISCOVERY || role === SOURCE_ROLE.REFERENCE_ONLY) {
    if (DISCOVERY_ONLY_PROVIDERS.some((d) => provider.includes(d))) {
      return buildResult({
        decision: ACQUISITION_DECISION.REFERENCE_ONLY,
        custodyMode: CUSTODY_MODE.REFERENCE_ONLY,
        rightsConfidence: 10,
        reviewStatus: 'REFERENCE_ONLY',
        canAcquire: false,
        canDownload: false,
        reason: 'discovery_only_source',
        attributionRequired: false,
      });
    }
  }

  const classified = classifyOpenMediaLicense(license);
  const suggestion = suggestRights({
    sourceId: input.sourceId || `src_${provider}`,
    license,
    rightsStatus: classified.rightsStatus,
  });
  const policy = decideRights(suggestion, input.policyContext || {});

  let attributionRequired = Boolean(
    input.attributionRequired ??
      (/creativecommons|cc by|\bby-sa\b|\bby\b|unsplash|freesound/i.test(license) ||
        Boolean(input.attributionText)),
  );
  // Pexels / Pixabay: courtesy credit is not a hard attribution gate
  if (/pexels license|pixabay/i.test(license)) {
    attributionRequired = input.attributionRequired === true;
  }
  // Public domain / CC0: never force attribution from creator metadata alone
  if (/cc0|public domain|pdm|public-domain/i.test(license)) {
    attributionRequired = input.attributionRequired === true;
  }

  const commercialUse =
    input.commercialUse != null
      ? Boolean(input.commercialUse)
      : classified.reusable && !/\bnc\b|non-commercial/i.test(license);

  const derivativesAllowed =
    input.derivativesAllowed != null
      ? Boolean(input.derivativesAllowed)
      : classified.reusable && !/\bnd\b|no-deriv/i.test(license);

  let rightsConfidence = 40;
  if (classified.rightsStatus === 'CLEARED' && classified.reusable) rightsConfidence = 90;
  if (/pexels license/i.test(license)) rightsConfidence = 95;
  if (/pixabay/i.test(license)) rightsConfidence = 85;
  if (classified.rightsStatus === 'RESTRICTED') rightsConfidence = 95;
  if (classified.rightsStatus === 'UNKNOWN' || !license) rightsConfidence = 20;
  if (policy.decision === 'REJECTED') rightsConfidence = Math.max(rightsConfidence, 90);

  // Fail-closed: low confidence → review / reference
  if (classified.rightsStatus === 'RESTRICTED' || policy.decision === 'REJECTED') {
    return buildResult({
      decision: ACQUISITION_DECISION.BLOCKED,
      custodyMode: CUSTODY_MODE.REFERENCE_ONLY,
      rightsConfidence,
      reviewStatus: 'BLOCKED',
      canAcquire: false,
      canDownload: false,
      reason: 'license_restricted',
      attributionRequired,
      commercialUse: false,
      derivativesAllowed: false,
      classified,
      suggestion,
      policy,
    });
  }

  if (rightsConfidence < 50 || classified.rightsStatus === 'UNKNOWN') {
    return buildResult({
      decision: ACQUISITION_DECISION.MANUAL_REVIEW,
      custodyMode: CUSTODY_MODE.REFERENCE_ONLY,
      rightsConfidence,
      reviewStatus: 'REVIEW_REQUIRED',
      canAcquire: false,
      canDownload: false,
      reason: 'insufficient_rights_confidence',
      attributionRequired,
      commercialUse,
      derivativesAllowed,
      classified,
      suggestion,
      policy,
    });
  }

  if (classified.reusable && attributionRequired) {
    return buildResult({
      decision: ACQUISITION_DECISION.DOWNLOAD_WITH_ATTRIBUTION,
      custodyMode: CUSTODY_MODE.PROVIDER_HOSTED,
      rightsConfidence,
      reviewStatus: 'ATTRIBUTION_REQUIRED',
      canAcquire: true,
      canDownload: false, // V1: prefer provider-hosted; no auto binary pull
      reason: 'cleared_with_attribution',
      attributionRequired: true,
      commercialUse,
      derivativesAllowed,
      classified,
      suggestion,
      policy,
    });
  }

  if (classified.reusable) {
    return buildResult({
      decision: ACQUISITION_DECISION.REMOTE_REUSE,
      custodyMode: CUSTODY_MODE.PROVIDER_HOSTED,
      rightsConfidence,
      reviewStatus: 'SAFE_TO_REUSE',
      canAcquire: true,
      canDownload: false,
      reason: 'cleared_remote_reuse',
      attributionRequired: false,
      commercialUse,
      derivativesAllowed,
      classified,
      suggestion,
      policy,
    });
  }

  return buildResult({
    decision: ACQUISITION_DECISION.MANUAL_REVIEW,
    custodyMode: CUSTODY_MODE.REFERENCE_ONLY,
    rightsConfidence: Math.min(rightsConfidence, 45),
    reviewStatus: 'REVIEW_REQUIRED',
    canAcquire: false,
    canDownload: false,
    reason: 'policy_manual_review',
    attributionRequired,
    commercialUse,
    derivativesAllowed,
    classified,
    suggestion,
    policy,
  });
}

function buildResult(partial) {
  return {
    decision: partial.decision,
    custodyMode: partial.custodyMode,
    rightsConfidence: partial.rightsConfidence,
    reviewStatus: partial.reviewStatus,
    canAcquire: partial.canAcquire,
    canDownload: Boolean(partial.canDownload),
    reason: partial.reason,
    attributionRequired: Boolean(partial.attributionRequired),
    commercialUse: partial.commercialUse ?? null,
    derivativesAllowed: partial.derivativesAllowed ?? null,
    classified: partial.classified || null,
    suggestion: partial.suggestion || null,
    policy: partial.policy || null,
    publishable: false, // never auto-publish from discovery
  };
}
