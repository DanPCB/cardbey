/**
 * Performer-facing resource discovery — index first, Federation on demand.
 * Returns normalized candidates; never auto-publishes or auto-uses.
 */

import { toPublicAssetView } from './publicAssetView.js';
import { ensureFederationReady, getAdapter } from '../universalResourceIntelligence/sourceFederation.js';
import { FEDERATION_V1_ACTIVE_SOURCE_IDS } from '../universalResourceIntelligence/federationProviderStatus.js';
import { ASSET_STATUS } from './universalAssetTypes.js';

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ query: string, type?: string, limit?: number, allowFederation?: boolean, purpose?: string }} input
 */
export async function findResources(prisma, input = {}) {
  const query = String(input.query || '').trim();
  const limit = Math.min(Math.max(Number(input.limit) || 12, 1), 40);
  const type = input.type ? String(input.type).toLowerCase() : null;
  const allowFederation = input.allowFederation !== false;

  /** @type {object[]} */
  const indexHits = [];
  /** @type {object[]} */
  const federationHits = [];
  /** @type {object[]} */
  const providerErrors = [];

  if (query) {
    const where = {
      status: ASSET_STATUS.PUBLISHED,
      OR: [
        { title: { contains: query } },
        { description: { contains: query } },
        { tags: { has: query } },
      ],
    };
    if (type) where.type = type;

    try {
      const rows = await prisma.universalAsset.findMany({
        where,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      });
      for (const row of rows) {
        indexHits.push({
          source: 'resource_index',
          ...normalizeIndexAsset(row),
        });
      }
    } catch {
      // SQLite may not support `has` on tags — fallback
      const rows = await prisma.universalAsset.findMany({
        where: {
          status: ASSET_STATUS.PUBLISHED,
          ...(type ? { type } : {}),
        },
        take: 200,
        orderBy: { updatedAt: 'desc' },
      });
      const q = query.toLowerCase();
      for (const row of rows) {
        const hay = `${row.title || ''} ${row.description || ''} ${(row.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) continue;
        indexHits.push({ source: 'resource_index', ...normalizeIndexAsset(row) });
        if (indexHits.length >= limit) break;
      }
    }
  }

  const needMore = indexHits.length < Math.min(4, limit);
  if (allowFederation && needMore && query) {
    await ensureFederationReady();
    const perProvider = Math.max(2, Math.ceil((limit - indexHits.length) / FEDERATION_V1_ACTIVE_SOURCE_IDS.length));
    for (const sourceId of FEDERATION_V1_ACTIVE_SOURCE_IDS) {
      const adapter = getAdapter(sourceId);
      if (!adapter?.search) continue;
      try {
        const health = adapter.health ? await adapter.health() : { ok: true };
        if (health?.ok === false || String(health?.status || '').toUpperCase() === 'PAUSED') {
          providerErrors.push({ sourceId, error: 'provider_unhealthy', health });
          continue;
        }
        const result = await adapter.search({
          query,
          limit: perProvider,
          mediaType: type || undefined,
        });
        if (!result?.ok) {
          providerErrors.push({ sourceId, error: result?.error || 'search_failed' });
          continue;
        }
        for (const hit of result.hits || []) {
          federationHits.push({
            source: 'federation_live',
            sourceId,
            id: `${sourceId}:${hit.id || hit.remoteId}`,
            provider: hit.provider || sourceId.replace(/^src_/, ''),
            providerResourceId: String(hit.remoteId || hit.id || ''),
            type: hit.kind || hit.mediaType || type || 'image',
            title: hit.title || 'Untitled',
            description: hit.description || null,
            previewUrl: hit.previewUrl || null,
            sourceUrl: hit.canonicalUrl || hit.url || null,
            mediaUrl: hit.url || hit.downloadUrl || null,
            creator: hit.photographer || null,
            attribution: hit.attributionText || null,
            license: hit.license || null,
            licenseUrl: hit.licenseUrl || null,
            custody: hit.custodyMode || 'PROVIDER_HOSTED',
            rightsStatus: 'UNKNOWN',
            indexed: false,
            note: 'Live Federation candidate — index/sync before Library Use this when possible',
          });
        }
      } catch (err) {
        providerErrors.push({ sourceId, error: String(err?.message || err) });
      }
    }
  }

  const candidates = [...indexHits, ...federationHits].slice(0, limit);

  return {
    ok: true,
    query,
    purpose: input.purpose || null,
    strategy: 'index_first_federation_partial',
    candidates,
    counts: {
      index: indexHits.length,
      federation: federationHits.length,
      returned: candidates.length,
    },
    providerErrors,
    note: 'Candidates are proposals only — Use this / URI reuse remains governed.',
  };
}

function normalizeIndexAsset(row) {
  const view = toPublicAssetView(row) || row;
  return {
    id: view.id,
    provider: view.provider,
    providerResourceId: row.metadata?.providerRemoteId || null,
    type: view.type,
    title: view.title,
    description: view.description || null,
    previewUrl: view.thumbnail || view.preview || null,
    sourceUrl: view.canonicalUrl || view.sourceUrl || null,
    mediaUrl: view.streamUrl || view.preview || null,
    creator: view.creatorLabel || null,
    attribution: row.metadata?.attribution || null,
    license: view.license || null,
    licenseUrl: row.metadata?.licenseUrl || null,
    custody: view.hostingMode === 'REFERENCE' ? 'PROVIDER_HOSTED' : view.hostingMode,
    rightsStatus: row.rightsStatus || view.rightsStatus || null,
    indexed: true,
    universalAssetId: view.id,
  };
}
