/**
 * Multi-source BusinessCandidate enrichment agent.
 *
 * Guardrails:
 * - Writes BusinessCandidate + JSON provenance sidecar only
 * - Never mutates frozen lifecycle fields
 * - Hard caps: 5 fetches, 3 Claude calls, 10 min wall-clock
 * - Protected Batch 0 skip is enforced in the batch loop (runBatchEnrichment)
 *
 * Not imported by discovery/QA auto-run paths. Opt-in route/script only.
 */

import type { BusinessCandidateRecord } from '../types.js';
import { saveBusinessCandidate } from '../candidateRepository.js';
import { lookupAbnPublic } from './abrLookup.js';
import { EnrichmentBudget, EnrichmentBudgetExhaustedError } from './budget.js';
import { isDefaultOtherCategory, mapToCardbeyCategory } from './categoryMap.js';
import { buildCategoryMappingInputFromCandidate } from './resolveEnrichmentSignals.js';
import { resolveHeroImage } from './heroImageResolve.js';
import { isPlaceholderDescription, wordCount } from './htmlUtils.js';
import { queryOsmOverpass } from './osmCrossRef.js';
import { appendCandidateFieldProvenance } from './provenanceRepository.js';
import {
  preferHigherTierField,
  synthesizeBiBrief,
  synthesizeDescription,
} from './synthesize.js';
import type {
  ConfirmedField,
  EnrichmentFieldName,
  EnrichmentSourceTier,
  MultiSourceEnrichmentResult,
} from './types.js';
import { FROZEN_CANDIDATE_KEYS } from './types.js';
import {
  extractFromBusinessWebsite,
  extractPublicSocialProfile,
  extractYellowPagesSnippet,
  extractTrueLocalSnippet,
} from './webExtractors.js';

function snapshotFrozen(c: BusinessCandidateRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of FROZEN_CANDIDATE_KEYS) {
    out[key] = (c as Record<string, unknown>)[key];
  }
  return out;
}

function assertFrozenUnchanged(
  before: Record<string, unknown>,
  after: BusinessCandidateRecord,
): void {
  for (const key of FROZEN_CANDIDATE_KEYS) {
    if (before[key] !== (after as Record<string, unknown>)[key]) {
      throw new Error(`Frozen field mutated during enrichment: ${key}`);
    }
  }
}

function resolveClaimUrl(candidate: BusinessCandidateRecord): string | null {
  if (candidate.claimUrl?.trim()) return candidate.claimUrl.trim();
  if (candidate.seedId) return `/activate-business/${candidate.seedId}`;
  return null;
}

function tierRank(t: EnrichmentSourceTier | null | undefined): number {
  return t ?? 99;
}

type FieldBag = {
  description?: ConfirmedField;
  category?: ConfirmedField;
  tags?: ConfirmedField<string[]>;
  heroImageUrl?: ConfirmedField;
  heroImageSource?: string;
  biBrief?: ConfirmedField;
  openingHours?: ConfirmedField;
  abn?: ConfirmedField;
  legalName?: ConfirmedField;
  website?: ConfirmedField;
};

function setField(
  bag: FieldBag,
  key: keyof FieldBag,
  incoming: ConfirmedField | ConfirmedField<string[]>,
): void {
  if (key === 'tags') {
    bag.tags = preferHigherTierField(bag.tags, incoming as ConfirmedField<string[]>);
    return;
  }
  if (key === 'heroImageSource') return;
  const k = key as Exclude<keyof FieldBag, 'tags' | 'heroImageSource'>;
  bag[k] = preferHigherTierField(bag[k], incoming as ConfirmedField);
}

function provenanceRowsFromBag(
  enrichmentRunId: string,
  candidateId: string,
  bag: FieldBag,
): Omit<import('./types.js').CandidateFieldProvenanceRecord, 'id' | 'generatedAt'>[] {
  const rows: Omit<import('./types.js').CandidateFieldProvenanceRecord, 'id' | 'generatedAt'>[] = [];
  const push = (
    field: EnrichmentFieldName | string,
    f: ConfirmedField | ConfirmedField<string[]> | undefined,
  ) => {
    if (!f) return;
    rows.push({
      enrichmentRunId,
      candidateId,
      field,
      source: f.source,
      sourceTier: f.sourceTier,
      sourceUrl: f.sourceUrl,
      confidence: f.confidence,
      rawExtract:
        typeof f.rawExtract === 'string'
          ? f.rawExtract
          : Array.isArray(f.value)
            ? JSON.stringify(f.value)
            : String(f.value),
    });
  };
  push('description', bag.description);
  push('category', bag.category);
  push('tags', bag.tags);
  push('heroImageUrl', bag.heroImageUrl);
  push('biBrief', bag.biBrief);
  push('openingHours', bag.openingHours);
  push('abn', bag.abn);
  push('legalName', bag.legalName);
  push('website', bag.website);
  return rows;
}

function qualityFloor(params: {
  description: string | null;
  category: string | null;
  biStatus: 'generated' | 'not_generated' | 'failed';
}): boolean {
  if (params.biStatus !== 'generated') return false;
  if (isPlaceholderDescription(params.description)) return false;
  if (isDefaultOtherCategory(params.category)) return false;
  return true;
}

/**
 * Enrich a single candidate. Caller must already skip protected batches.
 */
export async function enrichCandidateMultiSource(params: {
  candidate: BusinessCandidateRecord;
  enrichmentRunId: string;
  dryRun?: boolean;
}): Promise<{ result: MultiSourceEnrichmentResult; candidate: BusinessCandidateRecord }> {
  const { enrichmentRunId, dryRun = false } = params;
  const frozen = snapshotFrozen(params.candidate);
  const budget = new EnrichmentBudget();
  const flags: string[] = [];
  const sourcesUsed = new Set<string>();
  let highestTier: EnrichmentSourceTier | null = null;
  const noteHighest = (t: EnrichmentSourceTier) => {
    if (highestTier == null || t < highestTier) highestTier = t;
  };

  const baseResult = (): MultiSourceEnrichmentResult => ({
    candidateId: params.candidate.id,
    businessName: params.candidate.name,
    enrichmentRunId,
    status: 'PARTIAL',
    category: params.candidate.category ?? params.candidate.businessType,
    descriptionLength: wordCount(params.candidate.description),
    heroImageSource: params.candidate.heroImageSource ?? null,
    biStatus: params.candidate.biStatus === 'generated' ? 'generated' : 'not_generated',
    abn: params.candidate.abn ?? null,
    sourcesUsed: [...sourcesUsed],
    highestTierReached: highestTier,
    flags: [...flags],
    enrichmentDurationMs: budget.elapsedMs(),
    websiteFetches: budget.websiteFetches,
    claudeCalls: budget.claudeCalls,
  });

  try {
    return await budget.runWithDeadline(async () => {
      const candidate = { ...params.candidate };
      const bag: FieldBag = {};

      // Seed bag from existing higher-value fields so we do not overwrite blindly
      if (candidate.description && !isPlaceholderDescription(candidate.description)) {
        setField(bag, 'description', {
          value: candidate.description,
          source: 'google_places',
          sourceTier: 3,
          sourceUrl: candidate.sourceUrl,
          confidence: 0.7,
          rawExtract: candidate.description,
        });
      }
      if (candidate.abn) {
        setField(bag, 'abn', {
          value: candidate.abn,
          source: 'abr_lookup',
          sourceTier: 2,
          sourceUrl: null,
          confidence: 0.85,
          rawExtract: candidate.abn,
        });
      }

      const websiteUrl =
        candidate.website?.trim() ||
        candidate.socialLinks.find((s) => s.platform === 'website')?.url ||
        null;
      const facebookUrl =
        candidate.socialLinks.find((s) => /facebook/i.test(s.platform) || /facebook\.com/i.test(s.url))
          ?.url ?? null;
      const instagramUrl =
        candidate.socialLinks.find((s) => /instagram/i.test(s.platform) || /instagram\.com/i.test(s.url))
          ?.url ?? null;

      // STEP 1 — ABN
      budget.assertWithinBudget();
      if (candidate.name) {
        const abr = await lookupAbnPublic(budget, candidate.name, candidate.state);
        if (abr) {
          sourcesUsed.add('abr_lookup');
          noteHighest(2);
          if (abr.entityStatus === 'Cancelled' && abr.cancelConfidence === 'high') {
            flags.push('ABN_CANCELLED');
            candidate.enrichmentNote = 'ABN_CANCELLED — verify before QA approve';
            candidate.enrichmentRunId = enrichmentRunId;
            candidate.enrichmentUpdatedAt = new Date().toISOString();
            candidate.enrichmentSources = [...sourcesUsed];
            assertFrozenUnchanged(frozen, candidate);
            if (!dryRun) await saveBusinessCandidate(candidate);
            return {
              result: {
                ...baseResult(),
                status: 'SKIPPED',
                flags: [...flags],
                sourcesUsed: [...sourcesUsed],
                highestTierReached: highestTier,
                enrichmentDurationMs: budget.elapsedMs(),
                websiteFetches: budget.websiteFetches,
                claudeCalls: budget.claudeCalls,
                message: 'ABN cancelled — enrichment stopped',
              },
              candidate,
            };
          }
          if (abr.entityStatus === 'Cancelled' && abr.cancelConfidence !== 'high') {
            flags.push('ABN_STATUS_UNCLEAR');
          }
          if (abr.abn) {
            setField(bag, 'abn', {
              value: abr.abn,
              source: 'abr_lookup',
              sourceTier: 2,
              sourceUrl: abr.sourceUrl,
              confidence: 0.85,
              rawExtract: abr.rawExtract,
            });
          }
          if (abr.legalName) {
            setField(bag, 'legalName', {
              value: abr.legalName,
              source: 'abr_lookup',
              sourceTier: 2,
              sourceUrl: abr.sourceUrl,
              confidence: 0.85,
              rawExtract: abr.legalName,
            });
          }
        }
      }

      // STEP 2 — Website
      let websiteExtract: Awaited<ReturnType<typeof extractFromBusinessWebsite>> = null;
      if (websiteUrl && budget.websiteFetches < budget.maxFetches) {
        budget.assertWithinBudget();
        websiteExtract = await extractFromBusinessWebsite(budget, websiteUrl);
        if (websiteExtract) {
          sourcesUsed.add('business_website');
          noteHighest(1);
          if (websiteExtract.description) {
            setField(bag, 'description', {
              value: websiteExtract.description,
              source: 'business_website',
              sourceTier: 1,
              sourceUrl: websiteExtract.sourceUrl,
              confidence: 0.95,
              rawExtract: websiteExtract.description,
            });
          }
          if (websiteExtract.openingHours) {
            setField(bag, 'openingHours', {
              value: websiteExtract.openingHours,
              source: 'business_website',
              sourceTier: 1,
              sourceUrl: websiteExtract.sourceUrl,
              confidence: 0.9,
              rawExtract: websiteExtract.openingHours,
            });
          }
          if (!candidate.website && websiteUrl) {
            setField(bag, 'website', {
              value: websiteUrl,
              source: 'business_website',
              sourceTier: 1,
              sourceUrl: websiteExtract.sourceUrl,
              confidence: 0.95,
              rawExtract: websiteUrl,
            });
          }
        }
      } else if (!websiteUrl) {
        flags.push('NO_WEBSITE');
      }

      // STEP 3 — Social (optional, budget permitting)
      let igBio: string | null = null;
      let fbAbout: string | null = null;
      let igCategory: string | null = null;
      let fbCategory: string | null = null;

      if (instagramUrl && budget.websiteFetches < budget.maxFetches) {
        budget.assertWithinBudget();
        const ig = await extractPublicSocialProfile(budget, instagramUrl, 'instagram');
        if (ig?.bio) {
          sourcesUsed.add('instagram_public');
          noteHighest(1);
          igBio = ig.bio;
          igCategory = ig.category;
        }
      }
      if (facebookUrl && budget.websiteFetches < budget.maxFetches) {
        budget.assertWithinBudget();
        const fb = await extractPublicSocialProfile(budget, facebookUrl, 'facebook');
        if (fb?.bio) {
          sourcesUsed.add('facebook_public');
          noteHighest(1);
          fbAbout = fb.bio;
          fbCategory = fb.category;
        }
      }

      // Prefer Instagram bio as description seed when more specific
      if (igBio && (!bag.description || bag.description.sourceTier > 1 || wordCount(igBio) > wordCount(bag.description.value))) {
        setField(bag, 'description', {
          value: igBio,
          source: 'instagram_public',
          sourceTier: 1,
          sourceUrl: instagramUrl,
          confidence: 0.95,
          rawExtract: igBio,
        });
      } else if (fbAbout && !bag.description) {
        setField(bag, 'description', {
          value: fbAbout,
          source: 'facebook_public',
          sourceTier: 1,
          sourceUrl: facebookUrl,
          confidence: 0.9,
          rawExtract: fbAbout,
        });
      }

      // STEP 4 — OSM
      let osmTag: string | null = null;
      let cuisine: string | null = null;
      if (candidate.name && budget.websiteFetches < budget.maxFetches) {
        budget.assertWithinBudget();
        const osm = await queryOsmOverpass(budget, candidate.name, candidate.suburb);
        if (osm) {
          sourcesUsed.add('openstreetmap');
          noteHighest(2);
          osmTag = [osm.amenity, osm.shop].filter(Boolean).join('/') || null;
          cuisine = osm.cuisine;
          if (osm.openingHours && !bag.openingHours) {
            setField(bag, 'openingHours', {
              value: osm.openingHours,
              source: 'openstreetmap',
              sourceTier: 2,
              sourceUrl: osm.sourceUrl,
              confidence: 0.85,
              rawExtract: osm.openingHours,
            });
          }
        }
      }

      // STEP 5 — Tier 3 aggregators when evidence is thin
      const thinSoFar =
        !bag.description ||
        isPlaceholderDescription(bag.description.value) ||
        (!websiteExtract && !igBio && !fbAbout);
      let ypExtract: Awaited<ReturnType<typeof extractYellowPagesSnippet>> = null;
      let trueLocalExtract: Awaited<ReturnType<typeof extractTrueLocalSnippet>> = null;
      if (thinSoFar && candidate.name && budget.websiteFetches < budget.maxFetches) {
        budget.assertWithinBudget();
        ypExtract = await extractYellowPagesSnippet(budget, candidate.name, candidate.suburb);
        if (ypExtract) {
          sourcesUsed.add('yellow_pages');
          noteHighest(3);
        }
      }
      if (
        thinSoFar &&
        candidate.name &&
        budget.websiteFetches < budget.maxFetches &&
        (!ypExtract?.description || wordCount(ypExtract.description) < 30)
      ) {
        budget.assertWithinBudget();
        trueLocalExtract = await extractTrueLocalSnippet(budget, candidate.name, candidate.suburb);
        if (trueLocalExtract) {
          sourcesUsed.add('true_local');
          noteHighest(3);
        }
      }

      // STEP 6 — Category mapping (rule-based; uses aggregator snippets as signals)
      const signalInput = buildCategoryMappingInputFromCandidate(candidate);
      const mapped = mapToCardbeyCategory({
        ...signalInput,
        osmTag,
        igCategory,
        fbCategory,
        ypSnippet: ypExtract?.description ?? null,
        trueLocalSnippet: trueLocalExtract?.description ?? null,
        websiteNavItems: websiteExtract?.navItems ?? null,
      });
      setField(bag, 'category', {
        value: mapped.category,
        source: osmTag ? 'openstreetmap' : 'rule_synthesised',
        sourceTier: osmTag ? 2 : 3,
        sourceUrl: null,
        confidence: mapped.confidence,
        rawExtract: mapped.category,
      });
      if (candidate.suburb) mapped.tags.push(candidate.suburb.toLowerCase().replace(/\s+/g, '-'));
      if (cuisine) mapped.tags.push(cuisine.toLowerCase().replace(/\s+/g, '-'));
      setField(bag, 'tags', {
        value: mapped.tags.slice(0, 5),
        source: 'rule_synthesised',
        sourceTier: 3,
        sourceUrl: null,
        confidence: 0.65,
        rawExtract: JSON.stringify(mapped.tags.slice(0, 5)),
      });

      // STEP 7 — Hero (eligible business-owned media only)
      budget.assertWithinBudget();
      const heroResolved = await resolveHeroImage({
        budget,
        websiteOgImage: websiteExtract?.ogImage ?? null,
        websiteSourceUrl: websiteExtract?.sourceUrl ?? null,
        category: bag.category?.value ?? null,
        businessType: candidate.businessType,
        businessName: candidate.name,
        suburb: candidate.suburb,
        placesTypes: buildCategoryMappingInputFromCandidate(candidate).placesTypes,
        tags: mapped.tags,
        identityMatchedWebsite: Boolean(websiteUrl),
      });
      const hero = heroResolved.hero;
      if (hero?.eligible) {
        sourcesUsed.add(hero.source);
        noteHighest(hero.source === 'business_website' ? 1 : 4);
        setField(bag, 'heroImageUrl', {
          value: hero.url,
          source: hero.source,
          sourceTier: hero.source === 'business_website' ? 1 : 4,
          sourceUrl: hero.sourceUrl,
          confidence: hero.source === 'business_website' ? 0.9 : 0.65,
          rawExtract: hero.rawExtract,
        });
        bag.heroImageSource = hero.source;
      } else {
        flags.push(heroResolved.status === 'NO_ELIGIBLE_MEDIA' ? 'NO_ELIGIBLE_MEDIA' : 'HERO_MISSING');
      }

      // STEP 8 — Description synthesis (evidence-grounded)
      budget.assertWithinBudget();
      const descSynth = await synthesizeDescription(budget, {
        businessName: candidate.name ?? 'Business',
        category: bag.category?.value ?? null,
        suburb: candidate.suburb,
        websiteDescription: websiteExtract?.description ?? null,
        instagramBio: igBio,
        facebookAbout: fbAbout,
        yellowPagesDescription: ypExtract?.description ?? null,
        trueLocalDescription: trueLocalExtract?.description ?? null,
        cuisineOrSpecialty: cuisine,
        evidenceUrls: [
          websiteExtract?.sourceUrl,
          instagramUrl,
          facebookUrl,
          ypExtract?.sourceUrl,
          trueLocalExtract?.sourceUrl,
        ].filter(Boolean) as string[],
      });
      if (descSynth.meta.usedClaude) sourcesUsed.add('claude_synthesised');
      else sourcesUsed.add('rule_synthesised');
      if (descSynth.meta.rejectedClaims.length) {
        flags.push(`SYNTHESIS_REJECTED:${descSynth.meta.rejectedClaims.join('|')}`);
      }
      if (descSynth.text) {
        const existingTier = bag.description?.sourceTier ?? 99;
        const existingOk =
          bag.description &&
          !isPlaceholderDescription(bag.description.value) &&
          existingTier <= 1;
        if (!existingOk) {
          setField(bag, 'description', {
            value: descSynth.text,
            source: descSynth.meta.source === 'rejected' ? 'rule_synthesised' : descSynth.meta.source,
            sourceTier: 3,
            sourceUrl: null,
            confidence: descSynth.meta.aiGenerated ? 0.65 : 0.55,
            rawExtract: `evidenceHash=${descSynth.meta.evidenceHash};policy=${descSynth.meta.policyVersion};${descSynth.text}`,
          });
        }
      }

      // STEP 9 — BI brief
      budget.assertWithinBudget();
      const claimUrl = resolveClaimUrl(candidate);
      const briefSynth = await synthesizeBiBrief(budget, {
        businessName: candidate.name ?? 'Business',
        legalName: bag.legalName?.value ?? candidate.legalName ?? null,
        abn: bag.abn?.value ?? candidate.abn ?? null,
        category: bag.category?.value ?? null,
        suburb: candidate.suburb,
        description: bag.description?.value ?? null,
        website: candidate.website,
        instagram: instagramUrl,
        facebook: facebookUrl,
        openingHours: bag.openingHours?.value ?? null,
        tags: bag.tags?.value ?? [],
        heroImageSource: bag.heroImageSource ?? null,
        enrichmentSources: [...sourcesUsed],
        claimUrl,
        flags,
      });
      if (briefSynth.meta.usedClaude) sourcesUsed.add('claude_synthesised');
      setField(bag, 'biBrief', {
        value: briefSynth.text,
        source: briefSynth.meta.source === 'rejected' ? 'rule_synthesised' : briefSynth.meta.source,
        sourceTier: 3,
        sourceUrl: null,
        confidence: 0.65,
        rawExtract: `evidenceHash=${briefSynth.meta.evidenceHash};${briefSynth.text.slice(0, 400)}`,
      });

      // Apply bag → candidate (optional fields only)
      if (bag.description) candidate.description = bag.description.value;
      if (bag.category) candidate.category = bag.category.value;
      if (bag.tags) candidate.tags = bag.tags.value;
      if (bag.heroImageUrl) {
        candidate.heroImageUrl = bag.heroImageUrl.value;
        candidate.heroImageSource = bag.heroImageSource ?? bag.heroImageUrl.source;
      } else {
        candidate.heroImageUrl = null;
        candidate.heroImageSource = null;
      }
      if (bag.biBrief) {
        candidate.biBrief = bag.biBrief.value;
        candidate.biStatus = 'generated';
      } else {
        candidate.biStatus = 'not_generated';
      }
      if (bag.abn) candidate.abn = bag.abn.value;
      if (bag.legalName) candidate.legalName = bag.legalName.value;
      if (bag.openingHours) candidate.openingHours = bag.openingHours.value;
      if (bag.website && !candidate.website) candidate.website = bag.website.value;
      candidate.claimUrl = claimUrl;
      candidate.enrichmentSources = [...sourcesUsed];
      candidate.enrichmentUpdatedAt = new Date().toISOString();
      candidate.enrichmentRunId = enrichmentRunId;
      candidate.updatedAt = new Date().toISOString();

      if (
        thinSoFar &&
        isPlaceholderDescription(candidate.description) &&
        flags.includes('NO_WEBSITE')
      ) {
        flags.push('THIN_DATA');
      }

      const biStatus = candidate.biStatus === 'generated' ? 'generated' : 'not_generated';
      const enriched = qualityFloor({
        description: candidate.description ?? null,
        category: candidate.category ?? null,
        biStatus,
      });
      const status = enriched ? 'ENRICHED' : 'PARTIAL';

      assertFrozenUnchanged(frozen, candidate);

      // Dry-run: never mutate canonical candidate fields; optional isolated dry-run provenance only.
      const rows = provenanceRowsFromBag(enrichmentRunId, candidate.id, bag);
      if (dryRun) {
        if (rows.length) {
          await appendCandidateFieldProvenance(
            rows.map((r) => ({ ...r, rawExtract: `[DRY_RUN] ${r.rawExtract ?? ''}` })),
            { dryRun: true },
          );
        }
      } else {
        await saveBusinessCandidate(candidate);
        if (rows.length) await appendCandidateFieldProvenance(rows, { dryRun: false });
      }

      return {
        result: {
          candidateId: candidate.id,
          businessName: candidate.name,
          enrichmentRunId,
          status,
          category: candidate.category ?? null,
          descriptionLength: wordCount(candidate.description),
          heroImageSource: candidate.heroImageSource ?? null,
          biStatus,
          abn: candidate.abn ?? null,
          sourcesUsed: [...sourcesUsed],
          highestTierReached: highestTier,
          flags: [...flags],
          enrichmentDurationMs: budget.elapsedMs(),
          websiteFetches: budget.websiteFetches,
          claudeCalls: budget.claudeCalls,
        },
        candidate,
      };
    });
  } catch (err) {
    const isTimeout =
      err instanceof EnrichmentBudgetExhaustedError && err.code === 'TIMEOUT';
    const isCap = err instanceof EnrichmentBudgetExhaustedError;
    if (isCap) flags.push(err.code);
    else flags.push('ENRICHMENT_ERROR');

    const candidate = { ...params.candidate };
    candidate.enrichmentNote = String((err as Error)?.message ?? err).slice(0, 300);
    candidate.enrichmentRunId = enrichmentRunId;
    candidate.enrichmentUpdatedAt = new Date().toISOString();
    candidate.enrichmentSources = [...sourcesUsed];
    assertFrozenUnchanged(frozen, candidate);
    if (!dryRun) {
      try {
        await saveBusinessCandidate(candidate);
      } catch {
        /* ignore save on failure path */
      }
    }

    return {
      result: {
        ...baseResult(),
        status: isTimeout ? 'TIMEOUT' : 'PARTIAL',
        flags: [...flags],
        sourcesUsed: [...sourcesUsed],
        highestTierReached: highestTier,
        enrichmentDurationMs: budget.elapsedMs(),
        websiteFetches: budget.websiteFetches,
        claudeCalls: budget.claudeCalls,
        message: String((err as Error)?.message ?? err),
      },
      candidate,
    };
  }
}

/** @internal test helper */
export const __test = {
  assertFrozenUnchanged,
  snapshotFrozen,
  qualityFloor,
  tierRank,
};
