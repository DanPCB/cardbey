/**
 * SocialImportService
 *
 * Paste any social/business URL → detect platform → scrape public data via the
 * matching adapter → normalize to the store intake shape → stage a governed
 * `store` mission that, on owner confirmation, runs the existing
 * `structured_store_build` pipeline with the Q&A checkpoints skipped.
 *
 * GOVERNANCE (safe-execution-governance.mdc, LOCKED):
 *   Creating/publishing a live store is a confirmation-required action. This
 *   service therefore STAGES the mission (`requiresConfirmation: true`,
 *   status `awaiting_confirmation`) instead of auto-executing the build/publish.
 *   Scraping + normalization + draft preparation are non-public analysis steps
 *   and run without confirmation. The mission is returned so the dashboard can
 *   list it under "Auto-imported stores" for a 1-click owner confirm.
 */

import GoogleBusinessAdapter from './adapters/GoogleBusinessAdapter.js';
import FacebookAdapter from './adapters/FacebookAdapter.js';
import TikTokAdapter from './adapters/TikTokAdapter.js';
import InstagramAdapter from './adapters/InstagramAdapter.js';
import WebsiteAdapter from './adapters/WebsiteAdapter.js';
import { normalizeToStorePayload } from './normalizeToStorePayload.js';

/** Platform-specific adapters checked before the generic website fallback. */
const ADAPTERS = [GoogleBusinessAdapter, FacebookAdapter, TikTokAdapter, InstagramAdapter];

/** Source key written to the mission blackboard context. */
export const SOCIAL_IMPORT_SOURCE = 'social_import';

/**
 * Resolve the adapter for a URL (auto-detected from the URL host/path).
 * @param {string} url
 * @returns {{ platform: string, matches: Function, extract: Function } | null}
 */
export function detectAdapter(url) {
  const cleanUrl = sanitizeUrl(url);
  if (!cleanUrl) return null;
  const specific = ADAPTERS.find((a) => {
    try {
      return a.matches(cleanUrl);
    } catch {
      return false;
    }
  });
  if (specific) return specific;
  if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
    return WebsiteAdapter;
  }
  return null;
}

/**
 * Resolve platform key for a URL (social platforms or generic website).
 * @param {string} url
 * @returns {string | null}
 */
export function detectPlatform(url) {
  const adapter = detectAdapter(url);
  return adapter?.platform ?? null;
}

/**
 * Validate + normalize a candidate URL. Returns null when not an http(s) URL.
 * @param {string} url
 * @returns {string | null}
 */
export function sanitizeUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Scrape + normalize only (no mission, no writes). Useful for previews/tests.
 * @param {string} url
 * @returns {Promise<{ platform: string, raw: object, normalized: object } | null>}
 */
export async function scrapeAndNormalize(url) {
  const cleanUrl = sanitizeUrl(url);
  if (!cleanUrl) return null;
  const adapter = detectAdapter(cleanUrl);
  if (!adapter) return null;

  const raw = await adapter.extract(cleanUrl);
  const normalized = normalizeToStorePayload(raw);
  return { platform: adapter.platform, raw, normalized };
}

/**
 * Build the mission metadata (blackboard context) from a normalized payload.
 * @param {ReturnType<typeof normalizeToStorePayload>} normalized
 * @param {object} raw
 */
function buildMissionMetadata(normalized, raw) {
  return {
    businessName: normalized.businessName,
    businessType: normalized.businessType,
    storeType: normalized.businessType,
    location: normalized.location,
    currencyCode: normalized.currencyCode,
    brandTone: normalized.brandTone,
    brandStyle: normalized.brandStyle,
    ...(normalized.logoUrl ? { logoUrl: normalized.logoUrl } : {}),
    ...(normalized.heroMedia?.url ? { heroMediaUrl: normalized.heroMedia.url } : {}),
    ...(normalized.socialLinks ? { socialLinks: normalized.socialLinks } : {}),
    phone: normalized.phone ?? null,
    email: normalized.email ?? null,
    websiteUrl: normalized.websiteUrl ?? null,
    address: normalized.address ?? null,
    suburb: normalized.suburb ?? null,
    state: normalized.state ?? null,
    postcode: normalized.postcode ?? null,
    country: normalized.country ?? null,
    mapUrl: normalized.mapUrl ?? null,
    rawUserText: normalized.rawUserText,
    intentMode: 'store',
    // Blackboard context source + import provenance
    source: SOCIAL_IMPORT_SOURCE,
    skipQA: true,
    storeStatus: 'pre_created',
    socialImport: {
      platform: normalized.platform,
      sourceUrl: normalized.sourceUrl,
      productCount: Array.isArray(normalized.products) ? normalized.products.length : 0,
      productSource: normalized.productSource ?? raw?.productSource ?? null,
      products: Array.isArray(normalized.products) ? normalized.products : [],
      scraped: {
        category: raw?.category ?? '',
        hours: raw?.hours ?? '',
        contact: raw?.contact ?? {},
        photoCount: Array.isArray(raw?.photos) ? raw.photos.length : 0,
      },
    },
  };
}

/**
 * Seed the mission with action-only steps (no Q&A checkpoints) so that, on
 * confirmation, the runner jumps straight to structured_store_build. This is the
 * concrete meaning of `skipQA: true`.
 * @param {object} prisma
 * @param {string} missionId
 */
async function seedSkipQaStoreSteps(prisma, missionId) {
  await prisma.missionPipelineStep.deleteMany({ where: { missionId } });
  await prisma.missionPipelineStep.createMany({
    data: [
      {
        missionId,
        orderIndex: 0,
        toolName: 'structured_store_build',
        label: 'Generate store draft',
        status: 'pending',
        stepKind: 'action',
      },
      {
        missionId,
        orderIndex: 1,
        toolName: 'analyze_store',
        label: 'Review store',
        status: 'pending',
        stepKind: 'action',
      },
    ],
  });
  await prisma.missionPipeline.update({
    where: { id: missionId },
    data: { progressTotalSteps: 2 },
  });
}

/**
 * Full import flow: scrape → normalize → stage a governed store mission.
 *
 * @param {object} params
 * @param {string} params.url
 * @param {{ id: string, business?: { id: string } | null }} params.user - authenticated user (req.user)
 * @param {object} params.prisma
 * @param {string} [params.tenantId]
 * @returns {Promise<
 *   | { ok: true, missionId: string, status: string, platform: string, source: string, normalized: object }
 *   | { ok: false, statusCode: number, error: string, message: string }
 * >}
 */
export async function importFromSocial({ url, user, prisma, tenantId } = {}) {
  const cleanUrl = sanitizeUrl(url);
  if (!cleanUrl) {
    return { ok: false, statusCode: 400, error: 'invalid_url', message: 'A valid http(s) URL is required.' };
  }

  const adapter = detectAdapter(cleanUrl);
  if (!adapter) {
    return {
      ok: false,
      statusCode: 422,
      error: 'unsupported_platform',
      message: 'URL is not a supported platform (Facebook, Google Business/Maps, TikTok, Instagram, or website).',
    };
  }

  if (!user?.id) {
    return { ok: false, statusCode: 401, error: 'unauthorized', message: 'Authentication required.' };
  }

  let raw;
  try {
    raw = await adapter.extract(cleanUrl);
  } catch (err) {
    const code = err?.code === 'INVALID_URL' ? 'invalid_url' : 'scrape_failed';
    const statusCode = err?.code === 'INVALID_URL' ? 400 : 502;
    console.error('[social-import] adapter extract failed:', adapter.platform, err?.message || err?.code || err);
    return {
      ok: false,
      statusCode,
      error: code,
      message: err?.code === 'INVALID_URL' ? 'A valid http(s) URL is required.' : 'Could not read the source page.',
    };
  }

  const normalized = normalizeToStorePayload(raw);
  if (!normalized.businessName) {
    return {
      ok: false,
      statusCode: 422,
      error: 'no_business_data',
      message: 'Could not extract a business name from the source page.',
    };
  }

  const effectiveTenantId =
    (typeof tenantId === 'string' && tenantId.trim()) || user?.business?.id || user.id;
  const metadata = buildMissionMetadata(normalized, raw);

  const { createMissionPipeline } = await import('../missionPipelineService.js');
  const pipeline = await createMissionPipeline({
    type: 'store',
    title: `Import store: ${normalized.businessName.slice(0, 110)}`,
    targetType: 'store',
    targetId: undefined,
    targetLabel: undefined,
    metadata,
    // Governed: never auto-publish a live store from an automated import.
    requiresConfirmation: true,
    executionMode: 'AUTO_RUN',
    tenantId: effectiveTenantId,
    createdBy: user.id,
  });

  if (!pipeline?.id) {
    return { ok: false, statusCode: 500, error: 'mission_create_failed', message: 'Could not stage the import mission.' };
  }

  try {
    await seedSkipQaStoreSteps(prisma, pipeline.id);
  } catch (stepErr) {
    console.warn('[social-import] seedSkipQaStoreSteps failed (non-fatal):', stepErr?.message || stepErr);
  }

  console.log('[social-import] staged store mission', {
    missionId: pipeline.id,
    platform: adapter.platform,
    businessName: normalized.businessName,
    businessType: normalized.businessType,
    status: pipeline.status,
    source: SOCIAL_IMPORT_SOURCE,
  });

  return {
    ok: true,
    missionId: pipeline.id,
    status: pipeline.status,
    platform: adapter.platform,
    source: SOCIAL_IMPORT_SOURCE,
    normalized,
  };
}

export const importFromUrl = importFromSocial;

export default {
  detectAdapter,
  detectPlatform,
  sanitizeUrl,
  scrapeAndNormalize,
  importFromSocial,
  importFromUrl,
  SOCIAL_IMPORT_SOURCE,
};
