/**
 * Store-creation generation grounding policy (Pass 2).
 *
 * Grounding Monotonicity Invariant:
 * Confidence/provenance may stay the same or decrease through transforms.
 * It must never increase without new supporting evidence.
 */

import { Features } from '../../config/features.js';

/** @typedef {'GROUNDED'|'GENERATIVE'} GenerationMode */

export const EVIDENCE_KIND = Object.freeze({
  BUSINESS_IDENTITY: 'BUSINESS_IDENTITY',
  OFFERING: 'OFFERING',
  PRICE: 'PRICE',
  OPENING_HOURS: 'OPENING_HOURS',
  CONTACT: 'CONTACT',
  LOCATION: 'LOCATION',
  PROMOTION: 'PROMOTION',
  POLICY: 'POLICY',
  OTHER: 'OTHER',
});

export const GROUNDED_QA_OUTCOME = Object.freeze({
  VALID: 'VALID',
  REPAIRED_FROM_EVIDENCE: 'REPAIRED_FROM_EVIDENCE',
  REMOVED_UNSUPPORTED: 'REMOVED_UNSUPPORTED',
  INCOMPLETE_MISSING_EVIDENCE: 'INCOMPLETE_MISSING_EVIDENCE',
  BLOCKED: 'BLOCKED',
});

/** Provenance ranks — higher = stronger. Monotonicity forbids increasing rank without evidence. */
export const PROVENANCE_RANK = Object.freeze({
  GENERATED_FALLBACK: 10,
  SUGGESTED: 20,
  INFERRED: 30,
  EXTRACTED: 40,
  SOURCED: 50,
  VERIFIED: 60,
});

const OPENING_HOURS_RE =
  /\b(trading\s*hours?|opening\s*hours?|business\s*hours?|hours?\s*of\s*operation|open(?:ing)?\s*times?|daily\s*hours?|public\s*holidays?\s*hours?)\b/i;

const HOURS_SCHEDULE_RE =
  /\b((mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?)(\s*[-–—/to]+\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?)?\b/i;

const TIME_RANGE_RE =
  /\b\d{1,2}([.:]\d{2})?\s*(am|pm|a\.m\.|p\.m\.)(\s*[-–—to]+\s*\d{1,2}([.:]\d{2})?\s*(am|pm|a\.m\.|p\.m\.))?\b/i;

const OPEN_CLOSED_RE = /\b(open|closed)\s+(from|until|at|:)?\s*\d/i;

const CONTACT_RE =
  /^(tel|phone|mobile|fax|email|e-mail|www\.|https?:\/\/|@)|^\+?\d[\d\s().-]{6,}$/i;

const LOCATION_RE =
  /\b(street|st\.|road|rd\.|avenue|ave\.|drive|dr\.|suburb|postcode|zip|vic|nsw|qld|sa|wa|tas|act|nt)\b/i;

const PRICE_ONLY_RE = /^\$?\s*\d+([.,]\d{2})?\s*(aud|usd|eur)?$/i;

const POLICY_RE = /\b(terms|conditions|privacy|refund|cancellation|allergy|allergen|disclaimer)\b/i;

const PROMOTION_RE = /\b(\d+\s*%\s*off|buy\s*\d+|happy\s*hour|special\s*offer|promo(tion)?)\b/i;

const IDENTITY_ONLY_RE =
  /^(menu|services?|products?|about\s*us|welcome|our\s*story)$/i;

/**
 * Classify a free-text evidence span before it can become an offering.
 * @param {unknown} raw
 * @returns {keyof typeof EVIDENCE_KIND}
 */
export function classifyEvidenceKind(raw) {
  const text = String(typeof raw === 'string' ? raw : raw?.name ?? raw?.title ?? raw?.label ?? '').trim();
  if (!text) return EVIDENCE_KIND.OTHER;

  if (OPENING_HOURS_RE.test(text) || (HOURS_SCHEDULE_RE.test(text) && TIME_RANGE_RE.test(text))) {
    return EVIDENCE_KIND.OPENING_HOURS;
  }
  if (HOURS_SCHEDULE_RE.test(text) && /\b(open|closed|am|pm)\b/i.test(text)) {
    return EVIDENCE_KIND.OPENING_HOURS;
  }
  if (OPEN_CLOSED_RE.test(text) || (/^\s*hours?\b/i.test(text) && TIME_RANGE_RE.test(text))) {
    return EVIDENCE_KIND.OPENING_HOURS;
  }
  if (CONTACT_RE.test(text) || (/@|^\+?\d/.test(text) && text.length < 60 && !/\$/.test(text))) {
    if (CONTACT_RE.test(text) || /@|^\+?\d/.test(text)) return EVIDENCE_KIND.CONTACT;
  }
  if (PRICE_ONLY_RE.test(text)) return EVIDENCE_KIND.PRICE;
  if (POLICY_RE.test(text) && text.length < 100) return EVIDENCE_KIND.POLICY;
  if (PROMOTION_RE.test(text) && text.length < 48) return EVIDENCE_KIND.PROMOTION;
  if (LOCATION_RE.test(text) && /\d{1,5}\s+\w+/.test(text) && !/\$/.test(text)) {
    return EVIDENCE_KIND.LOCATION;
  }
  if (IDENTITY_ONLY_RE.test(text)) return EVIDENCE_KIND.BUSINESS_IDENTITY;

  if (/\$\s*\d/.test(text) || /\d+\.\d{2}\s*$/.test(text)) return EVIDENCE_KIND.OFFERING;

  if (OPENING_HOURS_RE.test(text) || (TIME_RANGE_RE.test(text) && HOURS_SCHEDULE_RE.test(text))) {
    return EVIDENCE_KIND.OPENING_HOURS;
  }
  return EVIDENCE_KIND.OFFERING;
}

/**
 * True only when evidence supports a sellable/provided item or service.
 * @param {unknown} evidence
 */
export function isAuthoritativeOffering(evidence) {
  if (evidence == null) return false;
  if (typeof evidence === 'object' && evidence.isAuthoritativeOffering === false) return false;
  if (typeof evidence === 'object' && evidence.kind && evidence.kind !== EVIDENCE_KIND.OFFERING) {
    return false;
  }
  const name = String(
    typeof evidence === 'string' ? evidence : evidence?.name ?? evidence?.title ?? evidence?.label ?? '',
  ).trim();
  if (!name || name.length < 2) return false;
  const kind = classifyEvidenceKind(evidence);
  if (kind !== EVIDENCE_KIND.OFFERING) return false;
  if (/^(japanese|asian|chinese|thai|vietnamese|italian|indian|mexican)\s*(restaurant|cuisine|food)?$/i.test(name)) {
    return false;
  }
  if (/^(restaurant|cafe|café|takeaway|take-away|food\s*&\s*drink|handyman|plumber)$/i.test(name)) {
    return false;
  }
  return true;
}

/**
 * @param {unknown} status
 */
export function normalizeProvenanceToken(status) {
  const s = String(status || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (!s) return 'SUGGESTED';
  if (s.includes('FALLBACK') || s === 'GENERATED') return 'GENERATED_FALLBACK';
  if (s.includes('SUGGEST')) return 'SUGGESTED';
  if (s.includes('INFER')) return 'INFERRED';
  if (s.includes('EXTRACT')) return 'EXTRACTED';
  if (s.includes('SOURCE') || s === 'EVIDENCE') return 'SOURCED';
  if (s.includes('VERIF')) return 'VERIFIED';
  return s;
}

/**
 * @param {unknown} status
 */
export function provenanceRank(status) {
  const token = normalizeProvenanceToken(status);
  return PROVENANCE_RANK[token] ?? PROVENANCE_RANK.SUGGESTED;
}

/**
 * @param {unknown} fromStatus
 * @param {unknown} toStatus
 * @param {{ hasNewEvidence?: boolean }} [opts]
 */
export function canUpgradeProvenance(fromStatus, toStatus, opts = {}) {
  if (opts.hasNewEvidence === true) return true;
  return provenanceRank(toStatus) <= provenanceRank(fromStatus);
}

/**
 * @param {object} [ctx]
 * @returns {{ mode: GenerationMode, grounded: boolean, flag: string, source: string, canInventCatalogFacts: boolean, canAssignEvidenceProvenanceToGenerated: boolean }}
 */
export function resolveGenerationGroundingPolicy(ctx = {}) {
  const explicit =
    ctx.generationPolicy?.mode ||
    ctx.policy?.mode ||
    ctx.meta?.generationPolicy?.mode ||
    ctx.preview?.meta?.generationPolicy?.mode ||
    ctx.input?.generationPolicy?.mode ||
    null;

  let grounded = false;
  let source = 'features';

  if (explicit === 'GROUNDED' || explicit === 'GENERATIVE') {
    grounded = explicit === 'GROUNDED';
    source = 'explicit_generationPolicy.mode';
  } else if (typeof ctx.groundedStoreCreation === 'boolean') {
    grounded = ctx.groundedStoreCreation;
    source = 'ctx.groundedStoreCreation';
  } else if (ctx.preview?.meta?.groundedStoreCreation === true || ctx.meta?.groundedStoreCreation === true) {
    grounded = true;
    source = 'preview.meta.groundedStoreCreation';
  } else if (ctx.input?.groundedComposition || ctx.preview?.meta?.groundedComposition) {
    grounded = Features.groundedStoreCreation.v1 === true;
    source = grounded ? 'groundedComposition+flag' : 'groundedComposition_but_flag_off';
  } else {
    grounded = Features.groundedStoreCreation.v1 === true;
    source = 'Features.groundedStoreCreation.v1';
  }

  /** @type {GenerationMode} */
  const mode = grounded ? 'GROUNDED' : 'GENERATIVE';
  return {
    mode,
    grounded,
    flag: 'ENABLE_GROUNDED_STORE_CREATION_V1',
    source,
    canInventCatalogFacts: !grounded,
    canAssignEvidenceProvenanceToGenerated: false,
  };
}

/**
 * @param {object} [ctx]
 */
export function canInventCatalogFacts(ctx = {}) {
  return resolveGenerationGroundingPolicy(ctx).canInventCatalogFacts;
}

/**
 * @param {object} preview
 * @param {ReturnType<typeof resolveGenerationGroundingPolicy>} [policy]
 */
export function attachGenerationPolicyToPreview(preview, policy) {
  if (!preview || typeof preview !== 'object') return preview;
  const p = policy || resolveGenerationGroundingPolicy({ preview, meta: preview.meta });
  preview.meta = {
    ...(preview.meta && typeof preview.meta === 'object' ? preview.meta : {}),
    groundedStoreCreation: p.grounded,
    generationPolicy: {
      mode: p.mode,
      flag: p.flag,
      source: p.source,
      at: new Date().toISOString(),
    },
  };
  return preview;
}

/**
 * @param {object} item
 * @param {string} [reason]
 */
export function clearCustomerFacingItemMedia(item, reason = 'needs_media') {
  if (!item || typeof item !== 'object') return item;
  if (item.imageUrl && !item.candidateImageUrl) {
    item.candidateImageUrl = item.imageUrl;
  }
  item.imageUrl = null;
  item.mediaStatus = 'needs_media';
  item.mediaRejectReason = reason;
  item.imageMatchStatus = 'rejected';
  item.mediaApproved = false;
  return item;
}

/**
 * @param {object} item
 */
export function invalidateItemDerivedMedia(item) {
  if (!item || typeof item !== 'object') return item;
  item.imageUrl = null;
  item.candidateImageUrl = null;
  item.imageQuery = null;
  item.imageSource = null;
  item.imageConfidence = null;
  item.mediaMatchScore = null;
  item.mediaStatus = 'needs_media';
  item.mediaRejectReason = 'item_identity_changed';
  item.imageSelection = null;
  item.imageMatchStatus = null;
  item.mediaApproved = false;
  return item;
}

/**
 * @param {object} item
 * @param {{ provenanceStatus: string, origin?: string, catalogSource?: string, hasEvidenceChain?: boolean }} claim
 */
export function assignItemProvenance(item, claim) {
  if (!item || typeof item !== 'object' || !claim) return item;
  const status = normalizeProvenanceToken(claim.provenanceStatus);
  const generated =
    status === 'GENERATED_FALLBACK' ||
    claim.origin === 'cuisine_bank' ||
    claim.catalogSource === 'cuisine_template' ||
    claim.catalogSource === 'generated';

  if (generated || claim.hasEvidenceChain === false) {
    item.provenanceStatus =
      status === 'VERIFIED' || status === 'SOURCED' ? 'GENERATED_FALLBACK' : status;
    // Never launder generated/fallback claims into evidence origins.
    const claimOrigin = String(claim.origin || '');
    const launderedOrigin =
      claimOrigin === 'evidence' || claimOrigin === 'ocr' || claimOrigin === 'sourced';
    item.origin =
      generated || launderedOrigin || claim.hasEvidenceChain === false
        ? claim.origin === 'cuisine_bank'
          ? 'cuisine_bank'
          : 'generated'
        : claim.origin || 'generated';
    const cs = String(claim.catalogSource || '');
    item.catalogSource =
      cs === 'grounded_evidence' || cs === 'evidence' ? 'generated' : cs || 'generated';
    item.authorityLevel = 'GENERATED_FALLBACK';
    return item;
  }

  const prev = item.provenanceStatus;
  if (prev && !canUpgradeProvenance(prev, status, { hasNewEvidence: claim.hasEvidenceChain === true })) {
    return item;
  }
  item.provenanceStatus = status;
  if (claim.origin) item.origin = claim.origin;
  if (claim.catalogSource) item.catalogSource = claim.catalogSource;
  return item;
}

export default {
  EVIDENCE_KIND,
  GROUNDED_QA_OUTCOME,
  PROVENANCE_RANK,
  classifyEvidenceKind,
  isAuthoritativeOffering,
  normalizeProvenanceToken,
  provenanceRank,
  canUpgradeProvenance,
  resolveGenerationGroundingPolicy,
  canInventCatalogFacts,
  attachGenerationPolicyToPreview,
  clearCustomerFacingItemMedia,
  invalidateItemDerivedMedia,
  assignItemProvenance,
};
