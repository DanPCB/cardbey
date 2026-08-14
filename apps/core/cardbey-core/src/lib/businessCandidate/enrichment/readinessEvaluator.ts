/**
 * Quality / readiness evaluator for claimable-page enrichment.
 * Does not inflate readiness from AI description alone.
 */

import type { BusinessCandidateRecord } from '../types.js';
import { isPlaceholderDescription, wordCount } from './htmlUtils.js';

export type ReadinessTier =
  | 'DISCOVERED_SPARSE'
  | 'PARTIAL'
  | 'REVIEW_REQUIRED'
  | 'PUBLIC_MINIMUM_READY'
  | 'RICH_PROFILE_READY';

export type ReadinessDimension =
  | 'identity'
  | 'contact'
  | 'location'
  | 'description'
  | 'visualMedia'
  | 'catalog'
  | 'operations'
  | 'trust'
  | 'provenance';

export type DimensionResult = {
  dimension: ReadinessDimension;
  passed: boolean;
  reason: string;
  score: number;
};

export type ReadinessReport = {
  tier: ReadinessTier;
  dimensions: DimensionResult[];
  publicMinimum: boolean;
  businessHealthEligible: boolean;
};

function dim(
  dimension: ReadinessDimension,
  passed: boolean,
  reason: string,
  score: number,
): DimensionResult {
  return { dimension, passed, reason, score };
}

export function evaluateCandidateReadiness(
  candidate: BusinessCandidateRecord,
  opts?: {
    provenanceCount?: number;
    eligibleMedia?: boolean;
    catalogCount?: number;
    aiDescriptionOnly?: boolean;
  },
): ReadinessReport {
  const provenanceCount = opts?.provenanceCount ?? 0;
  const eligibleMedia = opts?.eligibleMedia ?? Boolean(candidate.heroImageUrl);
  const catalogCount = opts?.catalogCount ?? candidate.fetchedServices.length;
  const aiOnly = opts?.aiDescriptionOnly === true;

  const dimensions: DimensionResult[] = [
    dim(
      'identity',
      Boolean(candidate.name && (candidate.seedId || candidate.externalId || candidate.placeId)),
      candidate.name
        ? candidate.seedId || candidate.externalId
          ? 'name + acquisition id present'
          : 'name only — weak identity'
        : 'missing name',
      candidate.name && (candidate.seedId || candidate.externalId) ? 80 : candidate.name ? 40 : 0,
    ),
    dim(
      'contact',
      Boolean(candidate.phone || candidate.website || candidate.email),
      candidate.phone || candidate.website || candidate.email
        ? 'at least one contact channel'
        : 'no phone/website/email',
      candidate.website ? 70 : candidate.phone ? 60 : candidate.email ? 50 : 0,
    ),
    dim(
      'location',
      Boolean(candidate.suburb || candidate.address || candidate.coordinates),
      candidate.coordinates
        ? 'coordinates present'
        : candidate.address && candidate.address !== candidate.suburb
          ? 'street address present'
          : candidate.suburb
            ? 'suburb-only location'
            : 'missing location',
      candidate.coordinates ? 90 : candidate.address && candidate.address !== candidate.suburb ? 70 : candidate.suburb ? 40 : 0,
    ),
    dim(
      'description',
      !isPlaceholderDescription(candidate.description) && !aiOnly,
      aiOnly
        ? 'AI description alone does not pass description dimension'
        : !isPlaceholderDescription(candidate.description)
          ? `description words=${wordCount(candidate.description)}`
          : 'missing/placeholder description',
      aiOnly ? 20 : !isPlaceholderDescription(candidate.description) ? 70 : 0,
    ),
    dim(
      'visualMedia',
      eligibleMedia && candidate.heroImageSource !== 'unsplash',
      !eligibleMedia
        ? 'NO_ELIGIBLE_MEDIA'
        : candidate.heroImageSource === 'unsplash'
          ? 'category stock is not eligible business media'
          : `hero source=${candidate.heroImageSource}`,
      eligibleMedia && candidate.heroImageSource === 'business_website' ? 90 : eligibleMedia ? 50 : 0,
    ),
    dim(
      'catalog',
      catalogCount > 0,
      catalogCount > 0 ? `catalog items=${catalogCount}` : 'no products/services evidence',
      catalogCount > 0 ? 70 : 0,
    ),
    dim(
      'operations',
      Boolean(candidate.openingHours),
      candidate.openingHours ? 'opening hours present' : 'no opening hours',
      candidate.openingHours ? 70 : 0,
    ),
    dim(
      'trust',
      Boolean(candidate.abn) || Boolean(candidate.website),
      candidate.abn
        ? 'ABN present (legal corroboration)'
        : candidate.website
          ? 'website present'
          : 'no trust anchors',
      candidate.abn ? 70 : candidate.website ? 50 : 10,
    ),
    dim(
      'provenance',
      provenanceCount > 0,
      provenanceCount > 0 ? `provenance rows=${provenanceCount}` : 'no provenance rows',
      provenanceCount > 0 ? 70 : 0,
    ),
  ];

  const passed = dimensions.filter((d) => d.passed).length;
  const hasEligibleMedia = dimensions.find((d) => d.dimension === 'visualMedia')?.passed === true;
  const hasCatalog = dimensions.find((d) => d.dimension === 'catalog')?.passed === true;
  const hasOps = dimensions.find((d) => d.dimension === 'operations')?.passed === true;
  const hasContact = dimensions.find((d) => d.dimension === 'contact')?.passed === true;
  const hasDesc = dimensions.find((d) => d.dimension === 'description')?.passed === true;

  let tier: ReadinessTier = 'DISCOVERED_SPARSE';
  if (passed <= 2) tier = 'DISCOVERED_SPARSE';
  else if (passed <= 4) tier = 'PARTIAL';
  else if (!hasEligibleMedia || !hasCatalog || !hasOps) tier = 'REVIEW_REQUIRED';
  else if (hasContact && hasDesc && hasEligibleMedia) tier = 'PUBLIC_MINIMUM_READY';
  if (
    hasEligibleMedia &&
    hasCatalog &&
    hasOps &&
    hasContact &&
    hasDesc &&
    dimensions.find((d) => d.dimension === 'trust')?.passed
  ) {
    tier = 'RICH_PROFILE_READY';
  }

  // Hard floor: AI-only description cannot reach PUBLIC_MINIMUM_READY / RICH
  if (aiOnly && (tier === 'PUBLIC_MINIMUM_READY' || tier === 'RICH_PROFILE_READY')) {
    tier = 'REVIEW_REQUIRED';
  }

  const publicMinimum = tier === 'PUBLIC_MINIMUM_READY' || tier === 'RICH_PROFILE_READY';
  const businessHealthEligible = publicMinimum && hasEligibleMedia && hasContact;

  return { tier, dimensions, publicMinimum, businessHealthEligible };
}
