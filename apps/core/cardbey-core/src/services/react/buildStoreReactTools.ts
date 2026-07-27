/**
 * Build-store ReAct: canonical tool ids, planner allowlist, and tool definitions
 * for discrete steps (performer console / draft generation).
 */
import {
  runBusinessImageEnricherTool,
  type BusinessImageEnricherHttpInput,
  type BusinessImageEnricherInput,
  type RunBusinessImageEnricherToolResult,
} from '../draftStore/businessImageEnricher.js';
import type { ImageFillProfile } from '../menuVisualAgent/menuVisualAgent.js';
import type { ScrapedImage } from '../draftStore/storeImageScraper.js';
import { scrapeStoreImages } from '../draftStore/storeImageScraper.js';
import { resolveItemImageSearchQuery } from '../draftStore/itemImageQueryResolver.js';

/** Order: research → catalog (AI) → web scrape → enrich → media → copy. Catalog is never gated on image confidence. */
export const BUILD_STORE_REACT_TOOLS = [
  'research',
  'catalog',
  'web_scrape_store_images',
  'business_image_enrich',
  'media',
  'copy',
] as const;

export type BuildStoreReactToolId = (typeof BUILD_STORE_REACT_TOOLS)[number];

export type BuildStoreReactBlackboardLike = {
  write(key: string, value: unknown): void;
  snapshot?(): Record<string, unknown>;
};

export type BuildStoreToolExecuteContext = {
  blackboard?: BuildStoreReactBlackboardLike;
};

/** Heuristic image-match confidence for performer upload prompt (0–1). */
export function computeImageConfidenceScore(enrichmentApplied: boolean, keywordsLength: number): number {
  if (!enrichmentApplied) return 0.3;
  if (keywordsLength >= 6) return 0.72;
  if (keywordsLength >= 3) return 0.55;
  return 0.35;
}

export type BusinessImageEnrichForReactResult = RunBusinessImageEnricherToolResult & {
  imageConfidenceScore: number;
  uploadSuggestionNeeded: boolean;
  skippedReason?: string;
  imageEnrichmentStatus?: string;
};

function readScrapedImagesFromSnapshot(snap: Record<string, unknown> | undefined): ScrapedImage[] | undefined {
  if (!snap) return undefined;
  const raw = snap.scrapedImages;
  if (!Array.isArray(raw)) return undefined;
  const out: ScrapedImage[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const src = o.source === 'facebook' || o.source === 'website' || o.source === 'google_places' ? o.source : 'website';
    const confidence = typeof o.confidence === 'number' && Number.isFinite(o.confidence) ? o.confidence : 0.7;
    const alt = typeof o.alt === 'string' ? o.alt : undefined;
    out.push({ url, source: src, alt, confidence });
  }
  return out.length ? out : undefined;
}

/**
 * Per-item Pexels/category hint from product name + store vertical (slug or storeType string).
 * Used in finalizeDraft so e.g. "Door Repair" gets handyman-specific search bias.
 */
export function deriveItemCategoryHint(
  itemName: string,
  verticalSlug?: string | null,
  storeTypeHint?: string | null,
): string {
  return resolveItemImageSearchQuery({
    itemName,
    verticalSlug: verticalSlug ?? undefined,
    businessType: storeTypeHint ?? undefined,
    storeName: undefined,
  });
}

/**
 * ReAct executor path: run enricher and persist on blackboard for the media step.
 */
export async function executeBusinessImageEnrichForReact(
  blackboard: BuildStoreReactBlackboardLike | undefined,
  payload: BusinessImageEnricherInput,
): Promise<BusinessImageEnrichForReactResult> {
  const httpInput: BusinessImageEnricherHttpInput = {
    businessName: payload.storeName ?? undefined,
    businessType: payload.businessType ?? undefined,
    location: payload.location ?? undefined,
    classifierProfile: (payload.profile ?? null) as unknown as Record<string, unknown> | null,
  };
  const r = await businessImageEnrichToolDefinition.execute(httpInput, { blackboard });
  return r as BusinessImageEnrichForReactResult;
}

export const webScrapeStoreImagesToolDefinition = {
  name: 'web_scrape_store_images' as const,
  description: `Scrapes real product/service images from the store's own website, Facebook page, and Google Images. Writes scrapedImages to the blackboard. When overallConfidence >= 0.75, business_image_enrich will use these images instead of Pexels. Input: { businessName, businessType, suburb?, websiteUrl?, facebookHandle? }. Output: { images, overallConfidence, scrapeStatus, sourcesSucceeded }.`,

  inputSchema: {
    type: 'object',
    properties: {
      businessName: { type: 'string' },
      businessType: { type: 'string' },
      suburb: { type: 'string', nullable: true },
      websiteUrl: { type: 'string', nullable: true },
      facebookHandle: { type: 'string', nullable: true },
    },
    required: ['businessName', 'businessType'],
  },

  execute: async (input: Record<string, unknown>, context?: BuildStoreToolExecuteContext) => {
    const result = await scrapeStoreImages({
      businessName: String(input.businessName ?? ''),
      businessType: String(input.businessType ?? ''),
      suburb: input.suburb != null ? String(input.suburb) : null,
      websiteUrl: input.websiteUrl != null ? String(input.websiteUrl) : null,
      facebookHandle: input.facebookHandle != null ? String(input.facebookHandle) : null,
    });

    if (context?.blackboard?.write) {
      context.blackboard.write('scrapedImages', result.images);
      context.blackboard.write('scrapeOverallConfidence', result.overallConfidence);
      context.blackboard.write('scrapeStatus', result.scrapeStatus);
      context.blackboard.write('react_step_web_scrape_store_images', true);
    }

    console.log('[WebScrape] completed', {
      businessName: input.businessName,
      status: result.scrapeStatus,
      imageCount: result.images.length,
      confidence: result.overallConfidence,
      sources: result.sourcesSucceeded,
    });

    return result;
  },
};

export async function executeWebScrapeForReact(
  bb: BuildStoreReactBlackboardLike,
  payload: Record<string, unknown>,
): Promise<Awaited<ReturnType<typeof scrapeStoreImages>>> {
  return webScrapeStoreImagesToolDefinition.execute(payload, { blackboard: bb });
}

/** Tool metadata + execute (blackboard uses MissionReactBlackboard.write, not .set). */
export const businessImageEnrichToolDefinition = {
  name: 'business_image_enrich' as const,
  description: `Enriches the image fill profile for a business by merging store name tokens, location, and vertical heuristics into the classification profile. Must run before the media step so generateImageForDraftItem uses accurate visual keywords. Input: { businessName, businessType, location, classifierProfile? }. Output: { effectiveImageFillProfile, keywords, enrichmentApplied }.`,

  inputSchema: {
    type: 'object',
    properties: {
      businessName: { type: 'string' },
      businessType: { type: 'string' },
      location: { type: 'string', description: 'suburb, state' },
      classifierProfile: { type: 'object', nullable: true },
    },
    required: ['businessName', 'businessType'],
  },

  execute: async (input: BusinessImageEnricherHttpInput, context?: BuildStoreToolExecuteContext) => {
    const snap =
      typeof context?.blackboard?.snapshot === 'function' ? context.blackboard.snapshot() : undefined;
    const scrapedImages = readScrapedImagesFromSnapshot(snap);
    const scrapeConfidenceRaw = snap?.scrapeOverallConfidence;
    const scrapeConfidence =
      typeof scrapeConfidenceRaw === 'number' && Number.isFinite(scrapeConfidenceRaw)
        ? scrapeConfidenceRaw
        : typeof scrapeConfidenceRaw === 'string'
          ? parseFloat(scrapeConfidenceRaw)
          : undefined;

    if (
      Array.isArray(scrapedImages) &&
      scrapedImages.length >= 3 &&
      (scrapeConfidence ?? 0) >= 0.75 &&
      context?.blackboard?.write
    ) {
      context.blackboard.write('enrichedImages', scrapedImages);
      context.blackboard.write('enrichedImageFillProfile', null);
      context.blackboard.write('imageEnrichmentStatus', 'web_scrape');
      context.blackboard.write('imageConfidenceScore', scrapeConfidence ?? 0);
      context.blackboard.write('uploadSuggestionNeeded', false);

      console.log('[BusinessImageEnrich] skipped — using web scrape', {
        imageCount: scrapedImages.length,
        confidence: scrapeConfidence,
      });

      const out: BusinessImageEnrichForReactResult = {
        ok: true,
        enrichmentApplied: false,
        effectiveImageFillProfile: null,
        keywords: [],
        addedTerms: [],
        profile: null,
        imageConfidenceScore: scrapeConfidence ?? 0,
        uploadSuggestionNeeded: false,
        skippedReason: 'web_scrape_high_confidence',
        imageEnrichmentStatus: 'web_scrape',
      };
      return out;
    }

    const result = await runBusinessImageEnricherTool(input);
    const keywords = result.keywords ?? [];
    const score = computeImageConfidenceScore(result.enrichmentApplied, keywords.length);
    if (context?.blackboard?.write) {
      if (result.effectiveImageFillProfile) {
        context.blackboard.write('enrichedImageFillProfile', result.effectiveImageFillProfile);
      } else {
        context.blackboard.write('enrichedImageFillProfile', null);
      }
      context.blackboard.write('imageEnrichmentStatus', result.enrichmentApplied ? 'enriched' : 'passthrough');
      context.blackboard.write('imageConfidenceScore', score);
      // Upload prompt is draft-review only — pipeline must not block on this flag.
      context.blackboard.write('uploadSuggestionNeeded', false);
      context.blackboard.write('uploadSuggestionKeywords', keywords);
    }
    return { ...result, imageConfidenceScore: score, uploadSuggestionNeeded: false };
  },
};
