/**
 * Phase 3B — First external open-content provider: Pexels.
 * Curated queries → stage → rights → dedupe → publish (REFERENCE hosting).
 * Requires PEXELS_API_KEY. Dashboard need not stay open.
 */

import {
  ASSET_PROVIDER,
  ASSET_STATUS,
  HOSTING_MODE,
  JOB_KIND,
  JOB_STATUS,
  RIGHTS_STATUS,
} from './universalAssetTypes.js';
import { createUniversalAsset, publishUniversalAsset } from './universalAssetService.js';
import { CATALOGUE_QUALITY, CONTENT_ORIGIN } from './contentOrigin.js';
import { Features } from '../../config/features.js';

const PEXELS_PHOTOS = 'https://api.pexels.com/v1/search';
const PEXELS_VIDEOS = 'https://api.pexels.com/videos/search';

/** Curated industry-aligned queries — not arbitrary bulk search. */
export const PEXELS_CURATED_QUERIES = Object.freeze([
  { q: 'cafe interior', industry: 'food-drink', type: 'image', limit: 8 },
  { q: 'restaurant food plating', industry: 'food-drink', type: 'image', limit: 8 },
  { q: 'bakery pastry', industry: 'food-drink', type: 'image', limit: 6 },
  { q: 'beauty salon', industry: 'beauty', type: 'image', limit: 8 },
  { q: 'hair salon', industry: 'hair', type: 'image', limit: 6 },
  { q: 'fashion boutique', industry: 'fashion', type: 'image', limit: 8 },
  { q: 'retail store', industry: 'retail', type: 'image', limit: 6 },
  { q: 'home renovation', industry: 'home-services', type: 'image', limit: 6 },
  { q: 'cafe ambience', industry: 'food-drink', type: 'video', limit: 4 },
  { q: 'beauty makeup', industry: 'beauty', type: 'video', limit: 4 },
  { q: 'fashion runway', industry: 'fashion', type: 'video', limit: 4 },
]);

export function isPexelsLibraryConfigured() {
  return Boolean(process.env.PEXELS_API_KEY?.trim());
}

export function pexelsLibraryEnabled() {
  return (
    isPexelsLibraryConfigured() &&
    (Features.universalLibrary?.externalOpenProviderV1 ||
      process.env.ENABLE_FIRST_EXTERNAL_PROVIDER_V1 === 'true')
  );
}

/**
 * @param {string} url
 * @param {Record<string, string>} params
 */
async function pexelsFetch(url, params) {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) throw new Error('pexels_not_configured');
  const qs = new URLSearchParams(params);
  const res = await fetch(`${url}?${qs}`, {
    headers: { Authorization: apiKey },
  });
  if (res.status === 429) {
    const err = new Error('pexels_rate_limited');
    err.code = 'RATE_LIMITED';
    throw err;
  }
  if (!res.ok) throw new Error(`pexels_http_${res.status}`);
  return res.json();
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 */
export async function runPexelsLibrarySync(prisma, options = {}) {
  if (!isPexelsLibraryConfigured()) {
    return { ok: false, error: 'pexels_not_configured', status: 'DISABLED' };
  }
  if (!pexelsLibraryEnabled() && options.force !== true) {
    return { ok: false, error: 'external_provider_disabled', status: 'DISABLED' };
  }

  const startedAt = new Date();
  const maxPublish = Math.min(Math.max(Number(options.maxPublish) || 60, 1), 80);
  const queries = options.queries || PEXELS_CURATED_QUERIES;
  const outcomes = {
    DISCOVERED: 0,
    PUBLISHED: 0,
    SKIPPED_EXISTING: 0,
    REJECTED_RIGHTS: 0,
    REJECTED_QUALITY: 0,
    FAILED: 0,
    REFERENCE_ONLY: 0,
  };
  /** @type {Array<object>} */
  const details = [];
  let published = 0;

  for (const query of queries) {
    if (published >= maxPublish) break;
    try {
      const remaining = maxPublish - published;
      const perPage = Math.min(query.limit || 6, remaining, 15);
      if (query.type === 'video') {
        const data = await pexelsFetch(PEXELS_VIDEOS, {
          query: query.q,
          per_page: String(perPage),
          page: '1',
        });
        for (const video of data.videos || []) {
          if (published >= maxPublish) break;
          const result = await ingestPexelsVideo(prisma, video, query);
          outcomes[result.outcome] = (outcomes[result.outcome] || 0) + 1;
          outcomes.DISCOVERED += 1;
          details.push(result);
          if (result.outcome === 'PUBLISHED' || result.outcome === 'REFERENCE_ONLY') published += 1;
        }
      } else {
        const data = await pexelsFetch(PEXELS_PHOTOS, {
          query: query.q,
          per_page: String(perPage),
          page: '1',
        });
        for (const photo of data.photos || []) {
          if (published >= maxPublish) break;
          const result = await ingestPexelsPhoto(prisma, photo, query);
          outcomes[result.outcome] = (outcomes[result.outcome] || 0) + 1;
          outcomes.DISCOVERED += 1;
          details.push(result);
          if (result.outcome === 'PUBLISHED' || result.outcome === 'REFERENCE_ONLY') published += 1;
        }
      }
      // polite pacing
      await new Promise((r) => setTimeout(r, 350));
    } catch (e) {
      if (e?.code === 'RATE_LIMITED') {
        await prisma.contentPopulationJob.create({
          data: {
            kind: JOB_KIND.PROVIDER_SYNC,
            provider: ASSET_PROVIDER.PEXELS,
            status: JOB_STATUS.FAILED,
            attempt: 1,
            maxAttempts: 3,
            error: 'rate_limited',
            payload: { query },
            startedAt,
            completedAt: new Date(),
          },
        });
        return {
          ok: false,
          status: 'RATE_LIMITED',
          outcomes,
          published,
          error: 'rate_limited',
        };
      }
      outcomes.FAILED += 1;
      details.push({ outcome: 'FAILED', error: e?.message || String(e), query: query.q });
    }
  }

  const job = await prisma.contentPopulationJob.create({
    data: {
      kind: JOB_KIND.PROVIDER_SYNC,
      provider: ASSET_PROVIDER.PEXELS,
      status: JOB_STATUS.COMPLETED,
      attempt: 1,
      maxAttempts: 1,
      payload: {
        source: 'pexels',
        queries: queries.map((q) => q.q),
        maxPublish,
      },
      result: { outcomes, published, detailCount: details.length },
      startedAt,
      completedAt: new Date(),
    },
  });

  return {
    ok: true,
    status: 'ACTIVE',
    provider: ASSET_PROVIDER.PEXELS,
    hostingMode: HOSTING_MODE.REFERENCE,
    outcomes,
    published,
    job,
    authority: 'core',
  };
}

async function ingestPexelsPhoto(prisma, photo, query) {
  const remoteId = String(photo.id);
  const existing = await findByProviderRemote(prisma, remoteId);
  if (existing) return { outcome: 'SKIPPED_EXISTING', remoteId, assetId: existing.id };

  const thumb = photo.src?.medium || photo.src?.large || photo.src?.original;
  if (!thumb) return { outcome: 'REJECTED_QUALITY', remoteId, reason: 'no_preview' };

  const photographer = photo.photographer || 'Pexels contributor';
  const created = await createUniversalAsset(prisma, {
    title: `${capitalize(query.industry)} photo — ${photographer}`.slice(0, 120),
    description: `Open Pexels photograph for ${query.industry}. Attribution: ${photographer}. Hosted by Pexels (reference).`,
    type: 'image',
    provider: ASSET_PROVIDER.PEXELS,
    sourceUrl: photo.url || `https://www.pexels.com/photo/${remoteId}/`,
    license: 'Pexels License',
    categories: [query.industry],
    tags: ['pexels', 'open', query.industry, query.q],
    thumbnail: thumb,
    preview: photo.src?.large || thumb,
    ownerId: 'pexels_platform',
    creatorId: `pexels_user_${photo.photographer_id || photographer}`,
    rightsStatus: RIGHTS_STATUS.CLEARED,
    hostingMode: HOSTING_MODE.REFERENCE,
    status: ASSET_STATUS.NORMALIZED,
    qualityScore: 70,
    metadata: buildPexelsMeta({
      remoteId,
      industry: query.industry,
      photographer,
      photographerUrl: photo.photographer_url,
      mediaKind: 'photo',
      query: query.q,
    }),
  });
  if (!created.ok) return { outcome: 'FAILED', remoteId, error: created.error };
  const pub = await publishUniversalAsset(prisma, created.asset.id);
  if (!pub.ok) return { outcome: 'FAILED', remoteId, error: pub.error };
  return { outcome: 'REFERENCE_ONLY', remoteId, assetId: created.asset.id };
}

async function ingestPexelsVideo(prisma, video, query) {
  const remoteId = String(video.id);
  const existing = await findByProviderRemote(prisma, remoteId);
  if (existing) return { outcome: 'SKIPPED_EXISTING', remoteId, assetId: existing.id };

  const files = Array.isArray(video.video_files) ? video.video_files : [];
  const file =
    files.find((f) => f.quality === 'hd') ||
    files.find((f) => f.quality === 'sd') ||
    files[0];
  if (!video.image && !file?.link) {
    return { outcome: 'REJECTED_QUALITY', remoteId, reason: 'no_preview' };
  }
  const user = video.user?.name || 'Pexels contributor';
  const created = await createUniversalAsset(prisma, {
    title: `${capitalize(query.industry)} video — ${user}`.slice(0, 120),
    description: `Open Pexels video for ${query.industry}. Attribution: ${user}. Reference streaming via Pexels.`,
    type: 'video',
    provider: ASSET_PROVIDER.PEXELS,
    sourceUrl: video.url || `https://www.pexels.com/video/${remoteId}/`,
    license: 'Pexels License',
    categories: [query.industry],
    tags: ['pexels', 'video', 'open', query.industry],
    thumbnail: video.image || null,
    preview: video.image || null,
    ownerId: 'pexels_platform',
    creatorId: `pexels_user_${video.user?.id || user}`,
    rightsStatus: RIGHTS_STATUS.CLEARED,
    hostingMode: HOSTING_MODE.REFERENCE,
    status: ASSET_STATUS.NORMALIZED,
    qualityScore: 72,
    metadata: buildPexelsMeta({
      remoteId,
      industry: query.industry,
      photographer: user,
      photographerUrl: video.user?.url,
      mediaKind: 'video',
      query: query.q,
      videoUrl: file?.link || null,
    }),
  });
  if (!created.ok) return { outcome: 'FAILED', remoteId, error: created.error };
  const pub = await publishUniversalAsset(prisma, created.asset.id);
  if (!pub.ok) return { outcome: 'FAILED', remoteId, error: pub.error };
  return { outcome: 'REFERENCE_ONLY', remoteId, assetId: created.asset.id };
}

function buildPexelsMeta({
  remoteId,
  industry,
  photographer,
  photographerUrl,
  mediaKind,
  query,
  videoUrl,
}) {
  return {
    contentOrigin: CONTENT_ORIGIN.REAL_PROVIDER,
    catalogueQualityStatus: CATALOGUE_QUALITY.APPROVED,
    providerRemoteId: remoteId,
    source: 'pexels',
    industry,
    openLicense: true,
    premium: false,
    syntheticEngagement: false,
    creatorLabel: photographer,
    verifiedType: 'PROVIDER_VERIFIED',
    attribution: {
      required: true,
      name: photographer,
      url: photographerUrl || null,
      license: 'Pexels License',
      note: 'Free to use under Pexels License; do not sell unaltered copies as standalone stock.',
    },
    provenance: {
      source: 'pexels',
      remoteId,
      query,
      mediaKind,
      syncedAt: new Date().toISOString(),
    },
    useCases: [`${industry} marketing`, 'Mood board', 'Reference visual'],
    views: 0,
    downloads: 0,
    rating: null,
    videoUrl: videoUrl || null,
    hostingNote: 'REFERENCE — preview/stream via Pexels CDN; originals not redistributed by Cardbey.',
  };
}

async function findByProviderRemote(prisma, remoteId) {
  const rows = await prisma.universalAsset.findMany({
    where: { provider: ASSET_PROVIDER.PEXELS },
    take: 2000,
  });
  return rows.find((a) => {
    const m = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
    return String(m.providerRemoteId) === String(remoteId);
  });
}

function capitalize(s) {
  const t = String(s || '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
