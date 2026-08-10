/**
 * Authoritative external resource provider status for admin / ops.
 * Source of truth: URI Provider SDK + UL population jobs — not dashboard stubs.
 */

import { ensureFederationReady, getAdapter, listAdapters, listSourceNodes } from './sourceFederation.js';
import { ASSET_PROVIDER, JOB_KIND } from '../universalLibrary/universalAssetTypes.js';
import { isPexelsLibraryConfigured, pexelsLibraryEnabled } from '../universalLibrary/pexelsLibrarySync.js';
import {
  isOpenverseLibraryConfigured,
  openverseLibraryEnabled,
} from '../universalLibrary/openverseLibrarySync.js';
import {
  isWikimediaLibraryConfigured,
  wikimediaLibraryEnabled,
} from '../universalLibrary/wikimediaLibrarySync.js';

/** Providers activated in Federation V1 (discovery + reuse via UL). */
export const FEDERATION_V1_ACTIVE_SOURCE_IDS = Object.freeze([
  'src_pexels',
  'src_openverse',
  'src_wikimedia',
]);

/** Registered but deferred for this phase. */
export const FEDERATION_V1_DEFERRED = Object.freeze([
  {
    id: 'youtube',
    sourceId: 'src_youtube',
    name: 'YouTube',
    operationalState: 'REGISTERED',
    health: 'DISABLED',
    discoveryEnabled: false,
    reuseEnabled: false,
    note: 'Deferred — reference metadata only; no Federation adapter in V1',
  },
  {
    id: 'pixabay',
    sourceId: 'src_pixabay',
    name: 'Pixabay',
    operationalState: 'REGISTERED',
    health: 'DISABLED',
    discoveryEnabled: false,
    reuseEnabled: false,
    note: 'URI adapter exists; UL catalogue sync deferred in V1',
  },
  {
    id: 'unsplash',
    sourceId: 'src_unsplash',
    name: 'Unsplash',
    operationalState: 'REGISTERED',
    health: 'DISABLED',
    discoveryEnabled: false,
    reuseEnabled: false,
    note: 'URI adapter exists; UL catalogue sync deferred in V1',
  },
  {
    id: 'internet_archive',
    sourceId: 'src_internet_archive',
    name: 'Internet Archive',
    operationalState: 'REGISTERED',
    health: 'DISABLED',
    discoveryEnabled: false,
    reuseEnabled: false,
    note: 'Deferred — no adapter in V1',
  },
]);

function providerKeyFromSourceId(sourceId) {
  return String(sourceId || '')
    .replace(/^src_/, '')
    .replace(/-/g, '_');
}

function mapHealthCode(adapterHealth) {
  if (!adapterHealth) return 'MISCONFIGURED';
  if (adapterHealth.ok === false) {
    const s = String(adapterHealth.status || '').toUpperCase();
    if (s.includes('RATE')) return 'RATE_LIMITED';
    if (s.includes('AUTH') || s.includes('403')) return 'AUTH_ERROR';
    if (s.includes('NETWORK')) return 'NETWORK_ERROR';
    if (s.includes('CONFIG')) return 'CONFIG_ERROR';
    return 'UPSTREAM_ERROR';
  }
  const st = String(adapterHealth.status || '').toUpperCase();
  if (st === 'PAUSED' || st === 'DISABLED') return 'DISABLED';
  if (adapterHealth.configured === false) return 'MISCONFIGURED';
  if (st === 'ACTIVE' || adapterHealth.ok === true) return 'HEALTHY';
  return 'DEGRADED';
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} provider
 */
async function indexedCount(prisma, provider) {
  try {
    return await prisma.universalAsset.count({
      where: { provider, status: 'PUBLISHED' },
    });
  } catch {
    return 0;
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} provider
 */
async function lastSyncJob(prisma, provider) {
  try {
    return await prisma.contentPopulationJob.findFirst({
      where: { kind: JOB_KIND.PROVIDER_SYNC, provider },
      orderBy: { completedAt: 'desc' },
    });
  } catch {
    return null;
  }
}

/**
 * Lightweight live health probe for one source.
 * @param {string} sourceId
 */
export async function testFederationProvider(sourceId) {
  await ensureFederationReady();
  const adapter = getAdapter(sourceId);
  if (!adapter) {
    return {
      ok: false,
      sourceId,
      health: 'CONFIG_ERROR',
      error: 'adapter_not_registered',
    };
  }
  try {
    const health = await adapter.health();
    const code = mapHealthCode(health);
    let searchOk = null;
    if (typeof adapter.search === 'function' && code === 'HEALTHY') {
      const search = await adapter.search({ query: 'bakery', limit: 2 });
      searchOk = Boolean(search?.ok);
      if (search?.ok === false) {
        return {
          ok: false,
          sourceId,
          health: String(search.error || '').includes('429') ? 'RATE_LIMITED' : 'UPSTREAM_ERROR',
          adapterHealth: health,
          searchError: search.error || null,
        };
      }
    }
    return {
      ok: code === 'HEALTHY',
      sourceId,
      health: code,
      adapterHealth: health,
      searchOk,
      hitCount: null,
    };
  } catch (err) {
    return {
      ok: false,
      sourceId,
      health: 'NETWORK_ERROR',
      error: String(err?.message || err),
    };
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function listFederationProviderStatus(prisma) {
  await ensureFederationReady();
  const adapters = listAdapters();
  const nodes = listSourceNodes();

  const active = [];
  for (const sourceId of FEDERATION_V1_ACTIVE_SOURCE_IDS) {
    const adapter = getAdapter(sourceId);
    const node = nodes.find((n) => n.id === sourceId) || null;
    const provider = providerKeyFromSourceId(sourceId);
    const ulProvider =
      provider === 'wikimedia'
        ? ASSET_PROVIDER.WIKIMEDIA
        : provider === 'openverse'
          ? ASSET_PROVIDER.OPENVERSE
          : ASSET_PROVIDER.PEXELS;

    let adapterHealth = null;
    try {
      adapterHealth = adapter?.health ? await adapter.health() : null;
    } catch (err) {
      adapterHealth = { ok: false, status: 'NETWORK_ERROR', error: String(err?.message || err) };
    }

    const configured =
      sourceId === 'src_pexels'
        ? isPexelsLibraryConfigured()
        : sourceId === 'src_openverse'
          ? isOpenverseLibraryConfigured()
          : isWikimediaLibraryConfigured();

    const discoveryEnabled =
      sourceId === 'src_pexels'
        ? pexelsLibraryEnabled()
        : sourceId === 'src_openverse'
          ? openverseLibraryEnabled()
          : wikimediaLibraryEnabled();

    const [count, lastJob] = await Promise.all([
      indexedCount(prisma, ulProvider),
      lastSyncJob(prisma, ulProvider),
    ]);

    let health = mapHealthCode(adapterHealth);
    if (!configured && sourceId === 'src_pexels') health = 'MISCONFIGURED';
    if (!adapter) health = 'MISCONFIGURED';

    let operationalState = 'REGISTERED';
    if (!adapter) operationalState = 'REGISTERED';
    else if (!configured && sourceId === 'src_pexels') operationalState = 'MISCONFIGURED';
    else if (!discoveryEnabled) operationalState = 'CONFIGURED';
    else if (health === 'HEALTHY') operationalState = 'HEALTHY';
    else if (health === 'DISABLED') operationalState = 'DISABLED';
    else operationalState = 'DEGRADED';

    active.push({
      id: provider,
      sourceId,
      name: node?.name || adapter?.sourceId || provider,
      registry: 'uri_provider_sdk',
      operationalState,
      health,
      configured,
      discoveryEnabled: Boolean(discoveryEnabled && adapter),
      reuseEnabled: true,
      custody: 'PROVIDER_HOSTED',
      hostingMode: 'REFERENCE',
      binaryStored: false,
      rights: 'governed_fail_closed',
      capabilities: {
        DISCOVERY: Boolean(discoveryEnabled && adapter),
        PREVIEW: true,
        REFERENCE: true,
        REUSE: true,
        ATTRIBUTION: true,
      },
      indexedCount: count,
      lastSuccessfulRequest: lastJob?.status === 'COMPLETED' ? lastJob.completedAt : null,
      lastError: lastJob?.error || adapterHealth?.error || null,
      lastJobStatus: lastJob?.status || null,
      actions: ['test', 'sync', 'details'],
      adapterPresent: Boolean(adapter),
      externalApiEnabled: true,
      enabled: Boolean(discoveryEnabled && adapter && health !== 'MISCONFIGURED'),
    });
  }

  const deferred = FEDERATION_V1_DEFERRED.map((d) => ({
    ...d,
    registry: 'uri_provider_sdk',
    configured: Boolean(getAdapter(d.sourceId)),
    custody: null,
    hostingMode: null,
    binaryStored: false,
    rights: 'n/a',
    capabilities: {
      DISCOVERY: false,
      PREVIEW: false,
      REFERENCE: false,
      REUSE: false,
      ATTRIBUTION: false,
    },
    indexedCount: 0,
    lastSuccessfulRequest: null,
    lastError: null,
    actions: ['details'],
    adapterPresent: Boolean(getAdapter(d.sourceId)),
    externalApiEnabled: Boolean(getAdapter(d.sourceId)),
    enabled: false,
  }));

  return {
    ok: true,
    authority: 'uri_provider_sdk',
    note: 'Content Acquisition dashboard stubs are not authoritative; this list is.',
    adaptersRegistered: adapters.map((a) => a.sourceId || a),
    providers: [...active, ...deferred],
  };
}
