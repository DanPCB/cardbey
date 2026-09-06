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
import { RESERVED_HERO_FETCHES } from './constants.js';
import { isDefaultOtherCategory, mapToCardbeyCategory } from './categoryMap.js';
import { buildCategoryMappingInputFromCandidate } from './resolveEnrichmentSignals.js';
import { fetchFoursquarePhotos, fetchFoursquareVenue } from './foursquareFetcher.js';
import { recoverFullName } from './fullNameRecovery.js';
import { resolveHeroImage } from './heroImageResolve.js';
import { isPlaceholderDescription, wordCount } from './htmlUtils.js';
import { osmTagsToCategorySignals, queryOsmOverpass } from './osmCrossRef.js';
import { appendCandidateFieldProvenance } from './provenanceRepository.js';
import {
  assessEnrichmentGaps,
  buildSourceFetchPlan,
  isBroaderEnrichmentSourcesEnabled,
  splitFetchBudgetForHeroReserve,
} from './sourceSelector.js';
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
  extractSocialLinksFromHtml,
  extractYellowPagesSnippet,
  extractTrueLocalSnippet,
} from './webExtractors.js';
import { fetchWikimediaPhoto } from './wikimediaFetcher.js';
import { resolveLogoUrl } from './logoResolve.js';
import { extractBrandColors } from './brandColorExtract.js';
import { extractTagline } from './taglineExtract.js';
import { calculateProfileScore } from './profileScore.js';
import { priceRangeFromRawSource } from './priceRange.js';
import { fetchAndExtractMenu, isFoodBusinessCategory } from './menuFetchOrchestrator.js';
import { syncCandidateMenuToLinkedStore } from '../menuPromotion.js';
import { writeEnrichedFieldsToLinkedStore } from '../writeEnrichedFieldsToLinkedStore.js';
import type { ExtractedMenu } from './types/menuTypes.js';

function getCandidateMetadata(candidate: BusinessCandidateRecord): Record<string, unknown> {
  const raw = candidate.originalContent?.metadata;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

function mergeSocialLinks(
  existing: Array<{ platform: string; url: string }>,
  incoming: Array<{ platform: string; url: string }>,
): Array<{ platform: string; url: string }> {
  const byPlatform = new Map(existing.map((s) => [s.platform.toLowerCase(), s]));
  for (const link of incoming) {
    const key = link.platform.toLowerCase();
    if (!byPlatform.has(key)) byPlatform.set(key, link);
  }
  return [...byPlatform.values()];
}

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
  subCategory?: ConfirmedField;
  tags?: ConfirmedField<string[]>;
  heroImageUrl?: ConfirmedField;
  heroImageSource?: string;
  logoUrl?: ConfirmedField;
  tagline?: ConfirmedField;
  brandColors?: ConfirmedField;
  biBrief?: ConfirmedField;
  openingHours?: ConfirmedField;
  priceRange?: ConfirmedField;
  abn?: ConfirmedField;
  legalName?: ConfirmedField;
  website?: ConfirmedField;
  phone?: ConfirmedField;
  email?: ConfirmedField;
  address?: ConfirmedField;
  suburb?: ConfirmedField;
  name?: ConfirmedField;
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
  push('subCategory', bag.subCategory);
  push('tags', bag.tags);
  push('heroImageUrl', bag.heroImageUrl);
  push('logoUrl', bag.logoUrl);
  push('tagline', bag.tagline);
  push('brandColors', bag.brandColors);
  push('biBrief', bag.biBrief);
  push('name', bag.name);
  push('openingHours', bag.openingHours);
  push('priceRange', bag.priceRange);
  push('abn', bag.abn);
  push('legalName', bag.legalName);
  push('website', bag.website);
  push('phone', bag.phone);
  push('email', bag.email);
  push('address', bag.address);
  push('suburb', bag.suburb);
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
      // Backfill / thin records often omit socialLinks — never throw on .find.
      candidate.socialLinks = Array.isArray(candidate.socialLinks) ? candidate.socialLinks : [];
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

      const placesPriceRange = priceRangeFromRawSource(candidate.rawSourceJson);
      if (placesPriceRange) {
        setField(bag, 'priceRange', {
          value: placesPriceRange,
          source: 'google_places',
          sourceTier: 3,
          sourceUrl: candidate.sourceUrl,
          confidence: 0.8,
          rawExtract: placesPriceRange,
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

      // STEP 2 — Website (skip when manually verified / stub site locked)
      let websiteExtract: Awaited<ReturnType<typeof extractFromBusinessWebsite>> = null;
      const skipWebsite =
        getCandidateMetadata(candidate).skipWebsiteFetch === true ||
        getCandidateMetadata(candidate).manuallyVerified === true ||
        /MANUALLY_VERIFIED/i.test(String(candidate.enrichmentNote ?? ''));
      if (skipWebsite) {
        flags.push('SKIP_WEBSITE_FETCH_MANUALLY_VERIFIED');
      } else if (websiteUrl && budget.websiteFetches < budget.maxFetches) {
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
          if (websiteExtract.telephone && !candidate.phone) {
            setField(bag, 'phone', {
              value: websiteExtract.telephone,
              source: 'business_website',
              sourceTier: 1,
              sourceUrl: websiteExtract.sourceUrl,
              confidence: 0.9,
              rawExtract: websiteExtract.telephone,
            });
          }
          if (websiteExtract.email && !candidate.email) {
            setField(bag, 'email', {
              value: websiteExtract.email,
              source: 'business_website',
              sourceTier: 1,
              sourceUrl: websiteExtract.sourceUrl,
              confidence: 0.9,
              rawExtract: websiteExtract.email,
            });
          }
          if (websiteExtract.address && !candidate.address) {
            setField(bag, 'address', {
              value: websiteExtract.address,
              source: 'business_website',
              sourceTier: 1,
              sourceUrl: websiteExtract.sourceUrl,
              confidence: 0.85,
              rawExtract: websiteExtract.address,
            });
          }
          const websiteSocial = extractSocialLinksFromHtml(websiteExtract.html);
          if (websiteSocial.length) {
            candidate.socialLinks = mergeSocialLinks(candidate.socialLinks, websiteSocial);
            sourcesUsed.add('business_website');
          }
          const tagline = extractTagline(
            websiteExtract.html,
            candidate.name,
            bag.category?.value ?? candidate.category ?? candidate.businessType,
          );
          if (tagline) {
            setField(bag, 'tagline', {
              value: tagline,
              source: 'business_website',
              sourceTier: 1,
              sourceUrl: websiteExtract.sourceUrl,
              confidence: 0.85,
              rawExtract: tagline,
            });
          }
          const brandColors = extractBrandColors(websiteExtract.html);
          if (brandColors.primary || brandColors.secondary) {
            setField(bag, 'brandColors', {
              value: JSON.stringify(brandColors),
              source: 'business_website',
              sourceTier: 1,
              sourceUrl: websiteExtract.sourceUrl,
              confidence: 0.5,
              rawExtract: JSON.stringify(brandColors),
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

      // STEP 2b — Menu extraction (F&B only, budget permitting)
      let extractedMenu: ExtractedMenu | null = null;
      if (
        isFoodBusinessCategory(
          bag.category?.value ?? candidate.category ?? candidate.businessType,
          bag.subCategory?.value ?? candidate.subCategory ?? null,
          candidate.name,
        )
      ) {
        budget.assertWithinBudget();
        extractedMenu = await fetchAndExtractMenu({
          budget,
          businessName: candidate.name ?? 'Business',
          category: bag.category?.value ?? candidate.category ?? candidate.businessType ?? '',
          subCategory: bag.subCategory?.value ?? candidate.subCategory ?? null,
          suburb: candidate.suburb ?? candidate.city ?? '',
          description: bag.description?.value ?? candidate.description ?? null,
          websiteHtml: websiteExtract?.html ?? null,
          baseUrl: websiteUrl ?? candidate.website ?? bag.website?.value ?? null,
          googlePlacesData: candidate.rawSourceJson,
          missionId: candidate.missionId ?? undefined,
        });
        if (extractedMenu) {
          sourcesUsed.add(extractedMenu.source);
          console.log(
            `[enrich] ${candidate.name} menu: ${extractedMenu.items.length} items,` +
              ` confidence: ${extractedMenu.confidence}`,
          );
        }
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

      // STEP 4+ — Confidence-gap plan + OSM / Foursquare / name / Wikimedia
      const broaderEnabled = isBroaderEnrichmentSourcesEnabled();
      const gaps = assessEnrichmentGaps({
        description: bag.description?.value ?? candidate.description,
        heroImageUrl: candidate.heroImageUrl,
        name: candidate.name,
        category: bag.category?.value ?? candidate.category,
        openingHours: bag.openingHours?.value ?? candidate.openingHours,
        rawSourceJson: candidate.rawSourceJson,
      });
      const remainingFetches = Math.max(0, budget.maxFetches - budget.websiteFetches);
      const { remainingForSources, heroReserve } = splitFetchBudgetForHeroReserve(remainingFetches, {
        needsHero: gaps.needsHero,
        pexelsConfigured: Boolean(process.env.PEXELS_API_KEY?.trim()),
        reserveSlots: RESERVED_HERO_FETCHES,
      });
      const sourceFetchCeiling = budget.maxFetches - heroReserve;
      const canSpendSourceFetch = () => budget.websiteFetches < sourceFetchCeiling;
      const plan = broaderEnabled
        ? buildSourceFetchPlan(gaps, Boolean(websiteUrl || bag.website), remainingForSources)
        : {
            // Broader off: do not burn fetch budget on Overpass/YP/TL (often blocked from cloud hosts).
            // Keep slots for Pexels hero + Claude synthesis.
            fetchOSM: false,
            fetchFoursquare: false,
            fetchFullName: false,
            fetchWikimedia: false,
            fetchFoursquarePhotos: false,
            skipThinAggregators: true,
          };

      console.log(
        `[sourceSelector] gaps: ${JSON.stringify(gaps)} plan: ${JSON.stringify(plan)} remainingFetches=${remainingFetches} remainingForSources=${remainingForSources} heroReserve=${heroReserve}`,
      );

      let osmTag: string | null = null;
      let cuisine: string | null = null;
      let osmAmenity: string | null = null;
      let foursquareDescription: string | null = null;
      let foursquarePhotoUrl: string | null = null;
      let wikimediaPhotoUrl: string | null = null;
      let wikimediaLicence: string | null = null;
      let foursquareVenueId: string | null = null;
      let fsqCategories: string[] = [];

      if (plan.fetchOSM && candidate.name && canSpendSourceFetch()) {
        budget.assertWithinBudget();
        const osm = await queryOsmOverpass(
          budget,
          candidate.name,
          candidate.suburb,
          candidate.state,
        );
        if (osm) {
          sourcesUsed.add('openstreetmap');
          noteHighest(2);
          osmTag = [osm.amenity, osm.shop].filter(Boolean).join('/') || null;
          osmAmenity = osm.amenity;
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
          if (osm.website && !websiteUrl && !bag.website) {
            setField(bag, 'website', {
              value: osm.website,
              source: 'openstreetmap',
              sourceTier: 2,
              sourceUrl: osm.sourceUrl,
              confidence: 0.8,
              rawExtract: osm.website,
            });
          }
          if (
            osm.fullName &&
            candidate.name &&
            osm.fullName.length > candidate.name.length + 2
          ) {
            setField(bag, 'name', {
              value: osm.fullName,
              source: 'openstreetmap',
              sourceTier: 2,
              sourceUrl: osm.sourceUrl,
              confidence: 0.85,
              rawExtract: osm.fullName,
            });
          }
          console.log(
            `[OSM] ${candidate.name} — amenity:${osm.amenity} cuisine:${osm.cuisine} signals:${osmTagsToCategorySignals(osm).join(',')}`,
          );
        }
      }

      let fsqDelivered = false;
      if (plan.fetchFoursquare && candidate.name && canSpendSourceFetch()) {
        budget.assertWithinBudget();
        const fsq = await fetchFoursquareVenue(
          budget,
          bag.name?.value ?? candidate.name,
          candidate.suburb,
          candidate.state ?? 'VIC',
        );
        if (fsq) {
          fsqDelivered = true;
          sourcesUsed.add('foursquare');
          noteHighest(3);
          foursquareVenueId = fsq.fsqId;
          fsqCategories = fsq.categories;
          if (fsq.description && fsq.description.length > 20) {
            foursquareDescription = fsq.description;
            if (!bag.description || isPlaceholderDescription(bag.description.value)) {
              setField(bag, 'description', {
                value: fsq.description,
                source: 'foursquare',
                sourceTier: 3,
                sourceUrl: `https://foursquare.com/v/${fsq.fsqId}`,
                confidence: 0.8,
                rawExtract: fsq.description,
              });
            }
          }
          if (fsq.hours && !bag.openingHours) {
            setField(bag, 'openingHours', {
              value: fsq.hours,
              source: 'foursquare',
              sourceTier: 3,
              sourceUrl: `https://foursquare.com/v/${fsq.fsqId}`,
              confidence: 0.75,
              rawExtract: fsq.hours,
            });
          }
          if (fsq.website && !websiteUrl && !bag.website) {
            setField(bag, 'website', {
              value: fsq.website,
              source: 'foursquare',
              sourceTier: 3,
              sourceUrl: fsq.website,
              confidence: 0.8,
              rawExtract: fsq.website,
            });
          }
          if (
            fsq.fullName &&
            candidate.name &&
            fsq.fullName.length > (bag.name?.value ?? candidate.name).length + 2
          ) {
            setField(bag, 'name', {
              value: fsq.fullName,
              source: 'foursquare',
              sourceTier: 3,
              sourceUrl: `https://foursquare.com/v/${fsq.fsqId}`,
              confidence: 0.8,
              rawExtract: fsq.fullName,
            });
          }
          console.log(`[Foursquare] ${candidate.name} — ${fsq.categories.join(', ')}`);
        }
      }

      if (
        plan.fetchFoursquarePhotos &&
        foursquareVenueId &&
        canSpendSourceFetch()
      ) {
        budget.assertWithinBudget();
        const photos = await fetchFoursquarePhotos(budget, foursquareVenueId, 3);
        if (photos.length) {
          sourcesUsed.add('foursquare_photos');
          foursquarePhotoUrl = photos[0]!.url;
          console.log(`[Foursquare Photos] ${candidate.name} — ${photos.length} photos`);
        }
      }

      if (plan.fetchFullName && !bag.name && candidate.name && canSpendSourceFetch()) {
        budget.assertWithinBudget();
        const recovered = await recoverFullName(budget, candidate.name, candidate.suburb, {
          fbUrl: facebookUrl,
          rawSourceJson: candidate.rawSourceJson,
        });
        if (recovered) {
          sourcesUsed.add('full_name_recovery');
          setField(bag, 'name', {
            value: recovered,
            source: 'full_name_recovery',
            sourceTier: 3,
            sourceUrl: null,
            confidence: 0.75,
            rawExtract: recovered,
          });
          console.log(`[FullName] ${candidate.name} → ${recovered}`);
        }
      }

      if (plan.fetchWikimedia && candidate.name && canSpendSourceFetch()) {
        budget.assertWithinBudget();
        const wiki = await fetchWikimediaPhoto(
          budget,
          bag.name?.value ?? candidate.name,
          candidate.suburb,
        );
        if (wiki) {
          sourcesUsed.add('wikimedia_commons');
          wikimediaPhotoUrl = wiki.url;
          wikimediaLicence = wiki.licence;
          console.log(`[Wikimedia] ${candidate.name} — ${wiki.licence}`);
        }
      }

      // STEP 5 — Tier 3 aggregators when evidence is thin (skip if FSQ delivered; retry when FSQ 429/miss)
      const allowThinAggregators =
        !plan.skipThinAggregators || (plan.fetchFoursquare && !fsqDelivered);
      if (plan.fetchFoursquare && !fsqDelivered) {
        console.log(
          `[sourceSelector] FSQ unavailable for ${candidate.name} — falling back to thin aggregators`,
        );
      }
      const thinSoFar =
        !bag.description ||
        isPlaceholderDescription(bag.description.value) ||
        (!websiteExtract && !igBio && !fbAbout && !foursquareDescription);
      let ypExtract: Awaited<ReturnType<typeof extractYellowPagesSnippet>> = null;
      let trueLocalExtract: Awaited<ReturnType<typeof extractTrueLocalSnippet>> = null;
      if (
        thinSoFar &&
        allowThinAggregators &&
        candidate.name &&
        canSpendSourceFetch()
      ) {
        budget.assertWithinBudget();
        ypExtract = await extractYellowPagesSnippet(budget, candidate.name, candidate.suburb);
        if (ypExtract) {
          sourcesUsed.add('yellow_pages');
          noteHighest(3);
        }
      }
      if (
        thinSoFar &&
        allowThinAggregators &&
        candidate.name &&
        canSpendSourceFetch() &&
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
        businessName: bag.name?.value ?? signalInput.businessName,
        osmTag,
        igCategory,
        fbCategory,
        ypSnippet: ypExtract?.description ?? null,
        trueLocalSnippet: trueLocalExtract?.description ?? null,
        websiteNavItems: websiteExtract?.navItems ?? null,
        placesTypes: [...(signalInput.placesTypes ?? []), ...fsqCategories],
      });
      setField(bag, 'category', {
        value: mapped.category,
        source: osmTag ? 'openstreetmap' : fsqCategories.length ? 'foursquare' : 'rule_synthesised',
        sourceTier: osmTag ? 2 : 3,
        sourceUrl: null,
        confidence: mapped.confidence,
        rawExtract: mapped.category,
      });
      if (mapped.subCategory) {
        setField(bag, 'subCategory', {
          value: mapped.subCategory,
          source: 'rule_synthesised',
          sourceTier: 3,
          sourceUrl: null,
          confidence: mapped.confidence,
          rawExtract: mapped.subCategory,
        });
      }
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

      // STEP 7 — Hero (website og → FSQ → Wikimedia → Pexels)
      budget.assertWithinBudget();
      const displayName = bag.name?.value ?? candidate.name;
      const heroResolved = await resolveHeroImage({
        budget,
        websiteOgImage: websiteExtract?.ogImage ?? null,
        websiteSourceUrl: websiteExtract?.sourceUrl ?? null,
        category: bag.category?.value ?? null,
        businessType: candidate.businessType,
        businessName: displayName,
        suburb: candidate.suburb,
        placesTypes: buildCategoryMappingInputFromCandidate(candidate).placesTypes,
        tags: mapped.tags,
        identityMatchedWebsite: Boolean(websiteUrl),
        foursquarePhotoUrl,
        wikimediaPhotoUrl,
        wikimediaLicence,
      });
      const hero = heroResolved.hero;
      if (hero?.eligible) {
        sourcesUsed.add(hero.source);
        noteHighest(
          hero.source === 'business_website'
            ? 1
            : hero.source === 'foursquare_photos' || hero.source === 'wikimedia_commons'
              ? 3
              : 4,
        );
        setField(bag, 'heroImageUrl', {
          value: hero.url,
          source: hero.source,
          sourceTier:
            hero.source === 'business_website'
              ? 1
              : hero.source === 'foursquare_photos' || hero.source === 'wikimedia_commons'
                ? 3
                : 4,
          sourceUrl: hero.sourceUrl,
          confidence: hero.source === 'business_website' ? 0.9 : 0.75,
          rawExtract: hero.attribution
            ? `${hero.attribution};${hero.rawExtract}`
            : hero.rawExtract,
        });
        bag.heroImageSource = hero.source;
        console.log(`[Hero] ${candidate.name} — ${hero.source}`);
      } else {
        flags.push(heroResolved.status === 'NO_ELIGIBLE_MEDIA' ? 'NO_ELIGIBLE_MEDIA' : 'HERO_MISSING');
        const pexelsNotes = heroResolved.adapterResults
          .filter((r) => r.adapter === 'pexels')
          .map((r) => `${r.status}:${r.message ?? ''}`)
          .slice(0, 4);
        console.warn(
          `[Hero] ${candidate.name} — ${heroResolved.status}` +
            (pexelsNotes.length ? ` pexels=[${pexelsNotes.join('; ')}]` : ''),
        );
      }

      // STEP 7b — Logo / avatar
      budget.assertWithinBudget();
      const logoUrl = await resolveLogoUrl(
        displayName ?? candidate.name ?? 'Business',
        candidate.website ?? bag.website?.value ?? websiteUrl,
        websiteExtract?.html ?? null,
        { remaining: Math.max(0, budget.maxFetches - budget.websiteFetches) },
      );
      if (logoUrl) {
        sourcesUsed.add('business_website');
        setField(bag, 'logoUrl', {
          value: logoUrl,
          source: 'business_website',
          sourceTier: 1,
          sourceUrl: websiteExtract?.sourceUrl ?? candidate.website ?? null,
          confidence: 0.8,
          rawExtract: logoUrl,
        });
        console.log(`[Logo] ${candidate.name} — resolved`);
      }

      // STEP 8 — Description synthesis (evidence-grounded)
      budget.assertWithinBudget();
      const descSynth = await synthesizeDescription(budget, {
        businessName: displayName ?? 'Business',
        category: bag.category?.value ?? null,
        suburb: candidate.suburb,
        websiteDescription: websiteExtract?.description ?? null,
        instagramBio: igBio,
        facebookAbout: fbAbout,
        yellowPagesDescription: ypExtract?.description ?? null,
        trueLocalDescription: trueLocalExtract?.description ?? null,
        foursquareDescription,
        osmAmenity,
        cuisineOrSpecialty: cuisine,
        openingHours: bag.openingHours?.value ?? null,
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
        businessName: bag.name?.value ?? candidate.name ?? 'Business',
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
      if (bag.name) candidate.name = bag.name.value;
      if (bag.description) candidate.description = bag.description.value;
      if (bag.category) candidate.category = bag.category.value;
      if (bag.subCategory) candidate.subCategory = bag.subCategory.value;
      if (bag.tags) candidate.tags = bag.tags.value;
      if (bag.heroImageUrl) {
        candidate.heroImageUrl = bag.heroImageUrl.value;
        candidate.heroImageSource = bag.heroImageSource ?? bag.heroImageUrl.source;
      } else {
        candidate.heroImageUrl = null;
        candidate.heroImageSource = null;
      }
      if (bag.logoUrl) candidate.logoUrl = bag.logoUrl.value;
      if (bag.tagline) candidate.tagline = bag.tagline.value;
      if (bag.brandColors) {
        try {
          candidate.brandColors = JSON.parse(bag.brandColors.value) as {
            primary: string | null;
            secondary: string | null;
          };
        } catch {
          candidate.brandColors = null;
        }
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
      if (bag.priceRange) candidate.priceRange = bag.priceRange.value;
      if (bag.website && !candidate.website) candidate.website = bag.website.value;
      if (bag.phone && !candidate.phone) candidate.phone = bag.phone.value;
      if (bag.email && !candidate.email) candidate.email = bag.email.value;
      if (bag.address && !candidate.address) candidate.address = bag.address.value;
      if (bag.suburb && !candidate.suburb) candidate.suburb = bag.suburb.value;

      if (extractedMenu) {
        candidate.fetchedMenu = extractedMenu as unknown as Record<string, unknown>;
        candidate.missingFields = (candidate.missingFields ?? []).filter((f) => f !== 'menu');
      }

      const profileScore = calculateProfileScore({
        name: candidate.name,
        description: candidate.description,
        heroImageUrl: candidate.heroImageUrl,
        logoUrl: candidate.logoUrl,
        category: candidate.category,
        phone: candidate.phone,
        email: candidate.email,
        address: candidate.address,
        suburb: candidate.suburb,
        website: candidate.website,
        tagline: candidate.tagline,
        socialLinks: candidate.socialLinks,
        openingHours: candidate.openingHours,
      });
      candidate.profileScore = profileScore.score;
      candidate.enrichmentStatus = profileScore.ready ? 'enriched' : 'partial';
      candidate.enrichedAt = new Date().toISOString();
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
        if (candidate.storeId?.trim()) {
          try {
            await writeEnrichedFieldsToLinkedStore(candidate);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[enrich] Business write-back failed for ${candidate.id}:`, message);
          }
        }
        if (extractedMenu && candidate.storeId) {
          try {
            await syncCandidateMenuToLinkedStore(candidate);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[enrich] menu promotion failed for ${candidate.id}:`, message);
          }
        }
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
