/**
 * Openverse → Universal Library curated intake (REFERENCE hosting).
 * Uses Openverse API; rights fail-closed via classifyOpenMediaLicense.
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
import { Features } from '../../config/features.js';
import { classifyOpenMediaLicense } from './openMediaRights.js';
import { findAssetByProviderRemoteId } from './providerRemoteLookup.js';

const OPENVERSE_IMAGES = 'https://api.openverse.org/v1/images/';

export const OPENVERSE_CURATED_QUERIES = Object.freeze([
  { q: 'bakery', industry: 'food-drink', limit: 6 },
  { q: 'cafe interior', industry: 'food-drink', limit: 6 },
  { q: 'restaurant', industry: 'food-drink', limit: 4 },
  { q: 'hair salon', industry: 'beauty', limit: 4 },
  { q: 'retail store', industry: 'retail', limit: 4 },
]);

export function isOpenverseLibraryConfigured() {
  return String(process.env.ENABLE_URI_ADAPTER_OPENVERSE ?? 'true').toLowerCase() !== 'false';
}

export function openverseLibraryEnabled() {
  return (
    isOpenverseLibraryConfigured() &&
    (Features.universalLibrary?.externalOpenProviderV1 ||
      process.env.ENABLE_FIRST_EXTERNAL_PROVIDER_V1 === 'true' ||
      process.env.ENABLE_EXTERNAL_OPEN_PROVIDER_V1 === 'true')
  );
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 */
export async function runOpenverseLibrarySync(prisma, options = {}) {
  if (!isOpenverseLibraryConfigured()) {
    return { ok: false, error: 'openverse_adapter_disabled', status: 'DISABLED' };
  }
  if (!openverseLibraryEnabled() && options.force !== true) {
    return { ok: false, error: 'external_provider_disabled', status: 'DISABLED' };
  }

  const startedAt = new Date();
  const maxPublish = Math.min(Math.max(Number(options.maxPublish) || 24, 1), 60);
  const queries = options.queries || OPENVERSE_CURATED_QUERIES;
  const outcomes = {
    DISCOVERED: 0,
    PUBLISHED: 0,
    SKIPPED_EXISTING: 0,
    REJECTED_RIGHTS: 0,
    REJECTED_QUALITY: 0,
    FAILED: 0,
    REFERENCE_ONLY: 0,
  };
  let published = 0;

  for (const query of queries) {
    if (published >= maxPublish) break;
    try {
      const remaining = maxPublish - published;
      const pageSize = Math.min(query.limit || 6, remaining, 20);
      const qs = new URLSearchParams({
        q: query.q,
        page_size: String(pageSize),
        license_type: 'commercial,modification',
      });
      const res = await fetch(`${OPENVERSE_IMAGES}?${qs}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'CardbeyURI/1.0 (Universal Library sync)' },
      });
      if (res.status === 429) {
        await recordJob(prisma, JOB_STATUS.FAILED, startedAt, { error: 'rate_limited', outcomes, published });
        return { ok: false, status: 'RATE_LIMITED', outcomes, published, error: 'rate_limited' };
      }
      if (!res.ok) {
        outcomes.FAILED += 1;
        continue;
      }
      const data = await res.json();
      for (const item of data.results || []) {
        if (published >= maxPublish) break;
        const result = await ingestOpenverseImage(prisma, item, query);
        outcomes[result.outcome] = (outcomes[result.outcome] || 0) + 1;
        outcomes.DISCOVERED += 1;
        if (result.outcome === 'PUBLISHED' || result.outcome === 'REFERENCE_ONLY') published += 1;
      }
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      outcomes.FAILED += 1;
    }
  }

  const job = await recordJob(prisma, JOB_STATUS.COMPLETED, startedAt, {
    outcomes,
    published,
    queries: queries.map((q) => q.q),
    maxPublish,
  });

  return {
    ok: true,
    status: 'ACTIVE',
    provider: ASSET_PROVIDER.OPENVERSE,
    hostingMode: HOSTING_MODE.REFERENCE,
    outcomes,
    published,
    job,
    authority: 'core',
  };
}

async function ingestOpenverseImage(prisma, item, query) {
  const remoteId = String(item.id || '');
  if (!remoteId) return { outcome: 'REJECTED_QUALITY', reason: 'no_id' };

  const existing = await findAssetByProviderRemoteId(prisma, ASSET_PROVIDER.OPENVERSE, remoteId);
  if (existing) return { outcome: 'SKIPPED_EXISTING', remoteId, assetId: existing.id };

  const preview = item.thumbnail || item.url;
  if (!preview) return { outcome: 'REJECTED_QUALITY', remoteId, reason: 'no_preview' };

  const licenseLabel = item.license_version
    ? `${item.license} ${item.license_version}`
    : item.license || '';
  const rights = classifyOpenMediaLicense(licenseLabel || item.license);
  if (!rights.reusable) {
    return {
      outcome: 'REJECTED_RIGHTS',
      remoteId,
      rightsStatus: rights.rightsStatus,
      license: licenseLabel,
    };
  }

  const creator = item.creator || 'Openverse contributor';
  const created = await createUniversalAsset(prisma, {
    title: (item.title || `Openverse — ${creator}`).slice(0, 120),
    description: [
      item.attribution || `Open media via Openverse. Attribution: ${creator}.`,
      'REFERENCE hosting — binaries remain with the source.',
    ].join(' '),
    type: 'image',
    provider: ASSET_PROVIDER.OPENVERSE,
    sourceUrl: item.foreign_landing_url || item.detail_url || item.url || `https://openverse.org/image/${remoteId}`,
    license: rights.normalized || licenseLabel,
    categories: [query.industry],
    tags: ['openverse', 'open', query.industry, query.q, ...(item.tags || []).map((t) => t.name || t).filter(Boolean)].slice(0, 24),
    thumbnail: preview,
    preview: item.url || preview,
    ownerId: 'openverse_platform',
    creatorId: `openverse_${item.creator || creator}`.slice(0, 80),
    rightsStatus: RIGHTS_STATUS.CLEARED,
    hostingMode: HOSTING_MODE.REFERENCE,
    status: ASSET_STATUS.NORMALIZED,
    qualityScore: 68,
    metadata: {
      providerRemoteId: remoteId,
      industry: query.industry,
      openLicense: true,
      premium: false,
      creatorLabel: creator,
      attribution: {
        required: true,
        name: creator,
        url: item.creator_url || null,
        license: rights.normalized,
        text: item.attribution || null,
      },
      provenance: {
        source: 'openverse',
        remoteId,
        query: query.q,
        syncedAt: new Date().toISOString(),
      },
      licenseUrl: item.license_url || null,
      hostingNote: 'REFERENCE — preview via Openverse / source CDN; not redistributed by Cardbey.',
    },
  });
  if (!created.ok) return { outcome: 'FAILED', remoteId, error: created.error };
  const pub = await publishUniversalAsset(prisma, created.asset.id);
  if (!pub.ok) return { outcome: 'FAILED', remoteId, error: pub.error };
  return { outcome: 'REFERENCE_ONLY', remoteId, assetId: created.asset.id };
}

async function recordJob(prisma, status, startedAt, payload) {
  return prisma.contentPopulationJob.create({
    data: {
      kind: JOB_KIND.PROVIDER_SYNC,
      provider: ASSET_PROVIDER.OPENVERSE,
      status,
      attempt: 1,
      maxAttempts: 1,
      payload: { source: 'openverse', ...payload },
      result: payload.outcomes ? { outcomes: payload.outcomes, published: payload.published } : payload,
      error: payload.error || null,
      startedAt,
      completedAt: new Date(),
    },
  });
}
