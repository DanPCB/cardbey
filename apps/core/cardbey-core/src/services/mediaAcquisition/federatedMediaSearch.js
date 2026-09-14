/**
 * Federated media search — parallel adapters, isolated failures.
 */

import { expandMediaQuery } from './queryExpansion.js';
import {
  toDiscoveryCandidate,
  dedupeDiscoveryCandidates,
  rankDiscoveryCandidates,
} from './discoveryCandidate.js';
import { recordMediaAcquisitionEvent } from './observability.js';
import {
  ensureFederationReady,
  getAdapter,
  consumeRateBudget,
  openCircuit,
  recordAdapterHealth,
} from '../universalResourceIntelligence/sourceFederation.js';
import { normalizeAdapterHit } from '../universalResourceIntelligence/providerSdk/normalizeResource.js';
import { bootstrapProviderAdapters } from '../universalResourceIntelligence/providerSdk/bootstrap.js';

export const PROVIDER_STATUS = Object.freeze({
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFIG_REQUIRED: 'CONFIG_REQUIRED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
});

/** V1 acquisition connectors (Freesound included when registered). */
export const DEFAULT_ACQUISITION_SOURCES = Object.freeze([
  'src_pexels',
  'src_openverse',
  'src_wikimedia',
  'src_pixabay',
  'src_freesound',
]);

/**
 * @param {object} opts
 * @param {string} opts.query
 * @param {string} [opts.mediaType] all|image|video|audio|document
 * @param {string} [opts.rightsFilter] commercial|public_domain|creative_commons|review
 * @param {string} [opts.source] all|pexels|...
 * @param {number} [opts.limitPerSource]
 */
export async function runFederatedMediaSearch(opts = {}) {
  const started = Date.now();
  bootstrapProviderAdapters();
  await ensureFederationReady();

  const { primary, expanded } = expandMediaQuery(opts.query);
  if (!primary) {
    return {
      ok: false,
      error: 'query_required',
      candidates: [],
      sourceStatuses: [],
      expandedQueries: [],
    };
  }

  const queries = [primary, ...expanded].slice(0, 4);
  const mediaType = normalizeFilterMedia(opts.mediaType);
  const sourceFilter = String(opts.source || 'all')
    .toLowerCase()
    .replace(/^src_/, '');
  const rightsFilter = String(opts.rightsFilter || 'all').toLowerCase();
  const limitPerSource = Math.min(Math.max(Number(opts.limitPerSource) || 8, 1), 16);

  let sources = [...DEFAULT_ACQUISITION_SOURCES];
  if (sourceFilter && sourceFilter !== 'all') {
    sources = sources.filter((s) => s.replace(/^src_/, '') === sourceFilter);
  }
  // Audio-only → prefer freesound + openverse; skip image-only wikimedia when audio
  if (mediaType === 'audio') {
    sources = sources.filter((s) => ['src_openverse', 'src_freesound', 'src_pixabay'].includes(s));
  } else if (mediaType === 'video') {
    sources = sources.filter((s) => ['src_pexels', 'src_pixabay'].includes(s));
  } else if (mediaType === 'image') {
    sources = sources.filter((s) => s !== 'src_freesound');
  }

  const sourceStatuses = [];
  /** @type {object[]} */
  const rawCandidates = [];

  await Promise.all(
    sources.map(async (sourceId) => {
      const status = await searchOneSource(sourceId, {
        queries,
        mediaType,
        limitPerSource,
      });
      sourceStatuses.push(status.meta);
      for (const hit of status.candidates) {
        rawCandidates.push(hit);
      }
    }),
  );

  let candidates = dedupeDiscoveryCandidates(rawCandidates);
  candidates = rankDiscoveryCandidates(candidates);
  candidates = applyRightsFilter(candidates, rightsFilter);
  if (mediaType && mediaType !== 'all') {
    candidates = candidates.filter((c) => c.mediaType === mediaType);
  }

  const latencyMs = Date.now() - started;
  recordMediaAcquisitionEvent('federated_search', {
    query: primary,
    expandedQueries: expanded,
    providersCalled: sources,
    sourceStatuses: sourceStatuses.map((s) => ({
      sourceId: s.sourceId,
      status: s.status,
      count: s.count,
    })),
    resultCount: candidates.length,
    latencyMs,
  });

  return {
    ok: true,
    query: primary,
    expandedQueries: expanded,
    candidates,
    sourceStatuses,
    latencyMs,
    policies: {
      downloadDefault: false,
      permanentHosting: false,
      agentCannotOverrideRights: true,
    },
  };
}

/**
 * @param {string} sourceId
 * @param {{ queries: string[], mediaType: string|null, limitPerSource: number }} ctx
 */
async function searchOneSource(sourceId, ctx) {
  const adapter = getAdapter(sourceId);
  if (!adapter || typeof adapter.search !== 'function') {
    return {
      meta: {
        sourceId,
        status: PROVIDER_STATUS.CONFIG_REQUIRED,
        count: 0,
        error: 'adapter_missing',
      },
      candidates: [],
    };
  }

  const budget = consumeRateBudget(sourceId);
  if (!budget.ok) {
    return {
      meta: {
        sourceId,
        status: PROVIDER_STATUS.RATE_LIMITED,
        count: 0,
        error: budget.reason,
      },
      candidates: [],
    };
  }

  /** @type {object[]} */
  const collected = [];
  let lastError = null;
  let configured = true;
  let rateLimited = false;
  let anySuccess = false;

  for (const q of ctx.queries) {
    try {
      const result = await adapter.search({
        query: q,
        derivedQuery: q,
        mediaType: ctx.mediaType === 'all' ? undefined : ctx.mediaType,
        limit: ctx.limitPerSource,
      });

      if (result?.configured === false) configured = false;
      if (result?.code === 'RATE_LIMITED' || /rate_limit/i.test(String(result?.error || ''))) {
        rateLimited = true;
        openCircuit(sourceId, 120_000);
        break;
      }

      recordAdapterHealth(sourceId, {
        ok: result?.ok !== false,
        status: result?.ok === false ? 'DEGRADED' : 'ACTIVE',
        configured: result?.configured !== false,
        liveSearch: Boolean(result?.live),
        error: result?.error || null,
      });

      if (result?.ok === false) {
        lastError = result.error || 'search_failed';
        continue;
      }

      anySuccess = true;
      for (const hit of result?.hits || []) {
        const normalized = normalizeAdapterHit(hit, {
          sourceId,
          resourceClass: 'OPEN_MEDIA',
        });
        if (!normalized?.remoteId) continue;
        const candidate = toDiscoveryCandidate(normalized, {
          query: ctx.queries[0],
          mediaType: ctx.mediaType,
        });
        if (candidate) collected.push(candidate);
      }
    } catch (err) {
      lastError = String(err?.message || err);
      openCircuit(sourceId, 60_000);
      recordAdapterHealth(sourceId, {
        ok: false,
        status: 'DEGRADED',
        error: lastError,
      });
    }
  }

  let status = PROVIDER_STATUS.SUCCESS;
  if (rateLimited) status = PROVIDER_STATUS.RATE_LIMITED;
  else if (!configured) status = PROVIDER_STATUS.CONFIG_REQUIRED;
  else if (!anySuccess && lastError) status = PROVIDER_STATUS.FAILED;
  else if (collected.length === 0 && lastError) status = PROVIDER_STATUS.FAILED;
  else if (collected.length === 0) status = PROVIDER_STATUS.PARTIAL;
  else if (lastError) status = PROVIDER_STATUS.PARTIAL;

  return {
    meta: {
      sourceId,
      provider: sourceId.replace(/^src_/, ''),
      status,
      count: collected.length,
      error: lastError,
    },
    candidates: collected,
  };
}

function normalizeFilterMedia(raw) {
  const m = String(raw || 'all').toLowerCase();
  if (['all', ''].includes(m)) return 'all';
  if (['images', 'image', 'photo'].includes(m)) return 'image';
  if (['videos', 'video'].includes(m)) return 'video';
  if (['audio', 'music'].includes(m)) return 'audio';
  if (['documents', 'document'].includes(m)) return 'document';
  return m;
}

function applyRightsFilter(candidates, rightsFilter) {
  if (!rightsFilter || rightsFilter === 'all') return candidates;
  return candidates.filter((c) => {
    const lic = String(c.license || '').toLowerCase();
    if (rightsFilter === 'commercial') {
      return c.commercialUse === true || /pexels|pixabay|cc0|public domain|by(?!-nc)/i.test(lic);
    }
    if (rightsFilter === 'public_domain') {
      return /cc0|public domain|pdm|public-domain/i.test(lic);
    }
    if (rightsFilter === 'creative_commons') {
      return /cc|creative commons|by-sa|by /i.test(lic);
    }
    if (rightsFilter === 'review' || rightsFilter === 'review_required') {
      return (
        c.acquisitionDecision === 'MANUAL_REVIEW' ||
        c.reviewStatus === 'REVIEW_REQUIRED' ||
        (c.rightsConfidence || 0) < 50
      );
    }
    return true;
  });
}
