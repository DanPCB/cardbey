/**
 * Data acquisition coordinator — orchestrates permitted acquisition tasks.
 *
 * Phase 1: advisory/read-only. No background crawling. Bounded task count per run.
 * Integrates: business discovery, website/schema.org, public media APIs.
 */

import { searchBusinesses } from '../businessDiscovery/index.js';
import { extractFromWebsite } from '../businessDiscovery/businessDiscoverySources.js';
import { searchAllSources } from '../../services/media/VideoSearchService.js';
import { pickBestSourceForCapability } from './acquisitionSourceRegistry.js';
import type { AcquisitionPayload } from './externalDataFusion.js';
import type { AcquisitionTaskType, DataGap, StructuredIntent } from './intentGapAnalyzer.js';
import { provenanceFromSource } from './confidenceResolver.js';

const MAX_TASKS_PER_RUN = 8;

export interface AcquisitionContext {
  intent: StructuredIntent;
  gaps: DataGap[];
  /** Hard cap on tasks (Phase 1 anti-crawl). */
  maxTasks?: number;
}

export interface AcquisitionRunResult {
  tasksPlanned: AcquisitionTaskType[];
  tasksExecuted: number;
  payloads: AcquisitionPayload[];
  skipped: Array<{ task: AcquisitionTaskType; reason: string }>;
}

function buildSearchQuery(intent: StructuredIntent): string {
  const name = intent.entities.businessName ?? intent.entities.name;
  const loc = intent.entities.location;
  if (name && loc) return `${name} ${loc}`;
  if (name) return String(name);
  return intent.rawText ?? '';
}

async function runSearchBusiness(intent: StructuredIntent): Promise<AcquisitionPayload> {
  const q = buildSearchQuery(intent);
  const location = intent.entities.location ? String(intent.entities.location) : null;
  const result = await searchBusinesses({ q, location });
  const top = result.candidates[0];
  if (!top) {
    return {
      task: 'search_business',
      sourceId: 'business_discovery',
      ok: false,
      data: {},
    };
  }
  return {
    task: 'search_business',
    sourceId: 'business_discovery',
    ok: true,
    data: {
      businessName: top.name,
      category: top.category,
      address: top.address,
      phone: top.phone,
      website: top.website,
      location: top.location?.raw ?? top.address,
      lat: top.location?.lat,
      lng: top.location?.lng,
      openingHours: top.openingHours,
      photos: top.photos,
      rating: top.rating,
      reviewCount: top.reviewCount,
      socialLinks: top.socialLinks,
    },
    attribution: provenanceFromSource('business_discovery', 0.75, {
      sourceUrl: top.sourceUrl,
      attributionText: top.attributions?.[0]?.attributionText ?? null,
    }),
  };
}

async function runFetchWebsite(url: string): Promise<AcquisitionPayload> {
  const results = await extractFromWebsite(url);
  const first = results[0];
  if (!first) {
    return { task: 'fetch_website', sourceId: 'website_metadata', ok: false, data: {} };
  }
  return {
    task: 'fetch_website',
    sourceId: first.source === 'schema_org' ? 'schema_org' : 'website_metadata',
    ok: true,
    data: first.raw as Record<string, unknown>,
    attribution: provenanceFromSource(first.source, 0.6, {
      sourceUrl: first.attribution.sourceUrl,
      attributionText: first.attribution.attributionText,
    }),
  };
}

async function runSearchMedia(query: string): Promise<AcquisitionPayload> {
  const source = pickBestSourceForCapability('search_media');
  if (!source) {
    return { task: 'search_media', sourceId: 'pexels', ok: false, data: {} };
  }
  try {
    const { results } = await searchAllSources(query, { perPage: 3, sources: ['pexels', 'pixabay', 'coverr', 'mixkit'] });
    const hero = results[0];
    if (!hero) {
      return { task: 'search_media', sourceId: source.sourceId, ok: false, data: {} };
    }
    return {
      task: 'search_media',
      sourceId: hero.source ?? source.sourceId,
      ok: true,
      data: {
        heroMedia: hero.thumbnailUrl ?? hero.url,
        mediaAssets: results.slice(0, 3).map((r) => ({
          url: r.thumbnailUrl ?? r.url,
          type: r.type === 'video' ? 'video' : 'image',
          role: 'gallery',
          attribution: r.license ?? r.source,
        })),
      },
      attribution: provenanceFromSource(String(hero.source ?? source.sourceId), 0.5, {
        sourceUrl: hero.url,
        attributionText: hero.license ?? null,
      }),
    };
  } catch {
    return { task: 'search_media', sourceId: source.sourceId, ok: false, data: {} };
  }
}

async function runFindLocation(intent: StructuredIntent): Promise<AcquisitionPayload> {
  return runSearchBusiness(intent);
}

async function runDiscoverReviews(intent: StructuredIntent): Promise<AcquisitionPayload> {
  const biz = await runSearchBusiness(intent);
  if (!biz.ok) return { ...biz, task: 'discover_reviews' };
  return { ...biz, task: 'discover_reviews' };
}

async function runFindSupplierCandidates(intent: StructuredIntent): Promise<AcquisitionPayload> {
  const q = intent.rawText ?? buildSearchQuery(intent);
  const result = await searchBusinesses({ q, location: intent.entities.location ? String(intent.entities.location) : null });
  return {
    task: 'find_supplier_candidates',
    sourceId: 'cardbey_internal',
    ok: result.candidates.length > 0,
    data: {
      supplierCandidates: result.candidates.slice(0, 5).map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        confidence: c.confidence,
      })),
    },
    attribution: provenanceFromSource('cardbey_internal', 0.7),
  };
}

async function executeTask(task: AcquisitionTaskType, intent: StructuredIntent): Promise<AcquisitionPayload> {
  switch (task) {
    case 'search_business':
    case 'find_location_data':
      return runFindLocation(intent);
    case 'fetch_website':
    case 'extract_metadata':
    case 'search_social':
    case 'find_brand_assets': {
      const url = intent.entities.website ? String(intent.entities.website) : null;
      if (url) return runFetchWebsite(url);
      return { task, sourceId: 'website_metadata', ok: false, data: {} };
    }
    case 'search_media':
      return runSearchMedia(buildSearchQuery(intent) || String(intent.entities.businessType ?? 'business'));
    case 'discover_reviews':
      return runDiscoverReviews(intent);
    case 'find_supplier_candidates':
      return runFindSupplierCandidates(intent);
    case 'extract_menu':
      return {
        task: 'extract_menu',
        sourceId: 'user_upload',
        ok: Boolean(intent.entities.hasMenuUpload || intent.entities.menuItems),
        data: intent.entities.menuItems ? { menuItems: intent.entities.menuItems } : {},
        attribution: provenanceFromSource('user_upload', 0.95),
      };
    default:
      return { task, sourceId: 'unknown', ok: false, data: {} };
  }
}

/**
 * Plan and execute acquisition for detected gaps (bounded, Phase 1).
 */
export async function runAcquisitionPlan(ctx: AcquisitionContext): Promise<AcquisitionRunResult> {
  const max = Math.min(ctx.maxTasks ?? MAX_TASKS_PER_RUN, MAX_TASKS_PER_RUN);
  const tasksPlanned = [...new Set(ctx.gaps.map((g) => g.acquisitionTask))].slice(0, max);
  const payloads: AcquisitionPayload[] = [];
  const skipped: Array<{ task: AcquisitionTaskType; reason: string }> = [];

  for (const task of tasksPlanned) {
    const source = pickBestSourceForCapability(task);
    if (!source && task !== 'extract_menu') {
      skipped.push({ task, reason: 'no_configured_source' });
      continue;
    }
    const payload = await executeTask(task, ctx.intent);
    payloads.push(payload);
    if (!payload.ok) {
      skipped.push({ task, reason: 'acquisition_returned_empty' });
    }
  }

  return {
    tasksPlanned,
    tasksExecuted: payloads.filter((p) => p.ok).length,
    payloads,
    skipped,
  };
}

export { MAX_TASKS_PER_RUN };
