/**
 * Apply taxonomy SSOT to BusinessCandidate + linked BusinessSeed normalized category.
 */

import type { IngestedSeedRecord } from '../../businessIngestion/types.js';
import { getSeedRecordById, upsertSeedRecords } from '../../businessIngestion/IngestionRepository.js';
import type { BusinessCandidateRecord } from '../types.js';
import { getBusinessCandidateBySeedId, saveBusinessCandidate } from '../candidateRepository.js';
import { isDefaultOtherCategory, mapToCardbeyCategory } from './categoryMap.js';
import { buildCategoryMappingInputFromCandidate } from './resolveEnrichmentSignals.js';
import { isPlaceholderDescription, wordCount } from './htmlUtils.js';
import { EnrichmentBudget } from './budget.js';
import { synthesizeDescription } from './synthesize.js';

export function resolveTaxonomyCategoryForCandidate(
  candidate: Pick<
    BusinessCandidateRecord,
    'name' | 'businessType' | 'category' | 'rawSourceJson' | 'originalContent'
  >,
): ReturnType<typeof mapToCardbeyCategory> {
  return mapToCardbeyCategory(buildCategoryMappingInputFromCandidate(candidate));
}

export function shouldRefreshTaxonomyCategory(
  candidate: Pick<BusinessCandidateRecord, 'category' | 'enrichmentUpdatedAt'>,
): boolean {
  if (!candidate.enrichmentUpdatedAt) return false;
  return isDefaultOtherCategory(candidate.category);
}

export async function applyTaxonomyCategoryToSeed(
  seed: IngestedSeedRecord,
  categoryLabel: string,
): Promise<IngestedSeedRecord> {
  if (!categoryLabel.trim()) return seed;
  if (seed.normalized.category === categoryLabel) return seed;

  const updated: IngestedSeedRecord = {
    ...seed,
    normalized: {
      ...seed.normalized,
      category: categoryLabel,
    },
    updatedAt: new Date().toISOString(),
  };
  await upsertSeedRecords([updated]);
  return updated;
}

export async function syncSeedCategoryFromLinkedCandidate(
  seedId: string,
): Promise<IngestedSeedRecord | null> {
  const seed = await getSeedRecordById(seedId);
  if (!seed) return null;

  const candidate = await getBusinessCandidateBySeedId(seedId);
  if (!candidate) return seed;

  const mapped = resolveTaxonomyCategoryForCandidate(candidate);
  const categoryLabel = candidate.category?.trim() || mapped.category;
  if (isDefaultOtherCategory(categoryLabel) && isDefaultOtherCategory(seed.normalized.category)) {
    return seed;
  }

  return applyTaxonomyCategoryToSeed(seed, isDefaultOtherCategory(categoryLabel) ? mapped.category : categoryLabel);
}

/**
 * Re-run taxonomy + description synthesis on stored signals (no website fetches / full enrichment).
 */
export async function reapplyTaxonomyAndDescriptionForCandidate(params: {
  candidate: BusinessCandidateRecord;
  dryRun?: boolean;
}): Promise<{
  candidate: BusinessCandidateRecord;
  changed: boolean;
  previousCategory: string | null;
  nextCategory: string | null;
  descriptionChanged: boolean;
}> {
  const { candidate, dryRun = false } = params;
  const previousCategory = candidate.category ?? null;
  const mapped = resolveTaxonomyCategoryForCandidate(candidate);
  const nextCategory = mapped.category;

  const budget = new EnrichmentBudget();
  const descSynth = await synthesizeDescription(budget, {
    businessName: candidate.name ?? 'Business',
    category: nextCategory,
    suburb: candidate.suburb,
    websiteDescription: candidate.description,
    instagramBio: null,
    facebookAbout: null,
    yellowPagesDescription: null,
    trueLocalDescription: null,
    cuisineOrSpecialty: null,
    evidenceUrls: candidate.sourceUrl ? [candidate.sourceUrl] : [],
  });

  const nextDescription =
    descSynth.text && !isPlaceholderDescription(descSynth.text) && wordCount(descSynth.text) >= 20
      ? descSynth.text
      : candidate.description ?? null;

  const categoryChanged = previousCategory !== nextCategory;
  const descriptionChanged =
    Boolean(nextDescription) &&
    nextDescription !== candidate.description &&
    !isPlaceholderDescription(nextDescription);

  const changed = categoryChanged || descriptionChanged;
  if (!changed) {
    return {
      candidate,
      changed: false,
      previousCategory,
      nextCategory,
      descriptionChanged: false,
    };
  }

  const updated: BusinessCandidateRecord = {
    ...candidate,
    category: nextCategory,
    tags: mapped.tags,
    description: nextDescription,
    enrichmentUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!dryRun) {
    await saveBusinessCandidate(updated);
    if (updated.seedId) {
      const linkedSeed = await getSeedRecordById(updated.seedId);
      if (linkedSeed) {
        await applyTaxonomyCategoryToSeed(linkedSeed, nextCategory);
      }
    }
  }

  return {
    candidate: updated,
    changed: true,
    previousCategory,
    nextCategory,
    descriptionChanged,
  };
}

export function isPartialEnrichedCandidate(candidate: BusinessCandidateRecord): boolean {
  if (!candidate.enrichmentUpdatedAt) return false;
  const thinCategory = isDefaultOtherCategory(candidate.category);
  const thinDescription =
    !candidate.description || isPlaceholderDescription(candidate.description) || wordCount(candidate.description) < 20;
  const partialBi = candidate.biStatus !== 'generated';
  return thinCategory || thinDescription || partialBi;
}
