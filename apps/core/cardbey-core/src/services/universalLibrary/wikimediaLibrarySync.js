/**
 * Wikimedia Commons → Universal Library curated intake (REFERENCE).
 * Rights fail-closed — never label Open without confident licence class.
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
import { wikimediaCommonsAdapter } from '../universalResourceIntelligence/adapters/wikimediaCommonsAdapter.js';

export const WIKIMEDIA_CURATED_QUERIES = Object.freeze([
  { q: 'bakery', industry: 'food-drink', limit: 5 },
  { q: 'cafe', industry: 'food-drink', limit: 5 },
  { q: 'hairdresser', industry: 'beauty', limit: 4 },
  { q: 'shop front', industry: 'retail', limit: 4 },
]);

export function isWikimediaLibraryConfigured() {
  return String(process.env.ENABLE_URI_ADAPTER_WIKIMEDIA ?? 'true').toLowerCase() !== 'false';
}

export function wikimediaLibraryEnabled() {
  return (
    isWikimediaLibraryConfigured() &&
    (Features.universalLibrary?.externalOpenProviderV1 ||
      process.env.ENABLE_FIRST_EXTERNAL_PROVIDER_V1 === 'true' ||
      process.env.ENABLE_EXTERNAL_OPEN_PROVIDER_V1 === 'true')
  );
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} [options]
 */
export async function runWikimediaLibrarySync(prisma, options = {}) {
  if (!isWikimediaLibraryConfigured()) {
    return { ok: false, error: 'wikimedia_adapter_disabled', status: 'DISABLED' };
  }
  if (!wikimediaLibraryEnabled() && options.force !== true) {
    return { ok: false, error: 'external_provider_disabled', status: 'DISABLED' };
  }

  const startedAt = new Date();
  const maxPublish = Math.min(Math.max(Number(options.maxPublish) || 16, 1), 40);
  const queries = options.queries || WIKIMEDIA_CURATED_QUERIES;
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
    const search = await wikimediaCommonsAdapter.search({
      query: query.q,
      limit: Math.min(query.limit || 5, maxPublish - published),
    });
    if (!search.ok) {
      if (String(search.error || '').includes('429')) {
        await recordJob(prisma, JOB_STATUS.FAILED, startedAt, { error: 'rate_limited', outcomes, published });
        return { ok: false, status: 'RATE_LIMITED', outcomes, published, error: 'rate_limited' };
      }
      outcomes.FAILED += 1;
      continue;
    }
    for (const hit of search.hits || []) {
      if (published >= maxPublish) break;
      const result = await ingestWikimediaHit(prisma, hit, query);
      outcomes[result.outcome] = (outcomes[result.outcome] || 0) + 1;
      outcomes.DISCOVERED += 1;
      if (result.outcome === 'PUBLISHED' || result.outcome === 'REFERENCE_ONLY') published += 1;
    }
    await new Promise((r) => setTimeout(r, 500));
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
    provider: ASSET_PROVIDER.WIKIMEDIA,
    hostingMode: HOSTING_MODE.REFERENCE,
    outcomes,
    published,
    job,
    authority: 'core',
  };
}

async function ingestWikimediaHit(prisma, hit, query) {
  const remoteId = String(hit.remoteId || hit.id || '');
  if (!remoteId) return { outcome: 'REJECTED_QUALITY', reason: 'no_id' };

  const existing = await findAssetByProviderRemoteId(prisma, ASSET_PROVIDER.WIKIMEDIA, remoteId);
  if (existing) return { outcome: 'SKIPPED_EXISTING', remoteId, assetId: existing.id };

  const preview = hit.previewUrl || hit.url;
  if (!preview) return { outcome: 'REJECTED_QUALITY', remoteId, reason: 'no_preview' };

  const rights = classifyOpenMediaLicense(hit.license || '');
  if (!rights.reusable) {
    return {
      outcome: 'REJECTED_RIGHTS',
      remoteId,
      rightsStatus: rights.rightsStatus || RIGHTS_STATUS.UNKNOWN,
      license: hit.license || null,
    };
  }

  const creator = hit.photographer || 'Wikimedia Commons contributor';
  const created = await createUniversalAsset(prisma, {
    title: String(hit.title || `Commons — ${creator}`).slice(0, 120),
    description: [
      hit.description || hit.attributionText || `Open media from Wikimedia Commons. Attribution: ${creator}.`,
      'REFERENCE hosting — binaries remain on Wikimedia.',
    ].join(' '),
    type: 'image',
    provider: ASSET_PROVIDER.WIKIMEDIA,
    sourceUrl: hit.canonicalUrl || hit.url || `https://commons.wikimedia.org/?curid=${remoteId}`,
    license: rights.normalized || hit.license,
    categories: [query.industry],
    tags: ['wikimedia', 'commons', 'open', query.industry, query.q],
    thumbnail: preview,
    preview: hit.url || preview,
    ownerId: 'wikimedia_platform',
    creatorId: `wikimedia_${creator}`.slice(0, 80),
    rightsStatus: RIGHTS_STATUS.CLEARED,
    hostingMode: HOSTING_MODE.REFERENCE,
    status: ASSET_STATUS.NORMALIZED,
    qualityScore: 66,
    metadata: {
      providerRemoteId: remoteId,
      industry: query.industry,
      openLicense: true,
      premium: false,
      creatorLabel: creator,
      attribution: {
        required: true,
        name: creator,
        url: hit.canonicalUrl || null,
        license: rights.normalized,
        text: hit.attributionText || null,
      },
      provenance: {
        source: 'wikimedia',
        remoteId,
        query: query.q,
        syncedAt: new Date().toISOString(),
      },
      licenseUrl: hit.licenseUrl || null,
      hostingNote: 'REFERENCE — preview via Wikimedia; not redistributed by Cardbey.',
      binaryStored: false,
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
      provider: ASSET_PROVIDER.WIKIMEDIA,
      status,
      attempt: 1,
      maxAttempts: 1,
      payload: { source: 'wikimedia', ...payload },
      result: payload.outcomes ? { outcomes: payload.outcomes, published: payload.published } : payload,
      error: payload.error || null,
      startedAt,
      completedAt: new Date(),
    },
  });
}
