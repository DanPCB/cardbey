/**
 * Unified Memory Facade — single entry point for all memory operations.
 *
 * Usage:
 *   const memory = await memoryFacade.getBundle(context);
 */

import { getPrismaClient } from '../../lib/prisma.js';
import { getBusinessMemorySummary } from '../businessMemory/businessMemoryService.js';
import { listSuitcaseItems } from '../suitcase/suitcaseItemService.js';
import { getUserMemory } from '../user/userMemoryService.js';
import { getRecentPilEvents } from '../pilEventsService.js';
import { getMissionMemorySnapshot } from './getMissionMemorySnapshot.js';
import {
  getCachedMemory,
  setCachedMemory,
  invalidateMemoryCache,
  clearMemoryCacheForTests,
} from './memoryCache.js';
import { extractSessionSignalsFromHints } from '../../lib/memory/sessionSignals.js';
import { record as recordFoundationMetric } from '../../lib/metrics/foundationMetrics.js';

export const MAX_SUITCASE_ITEMS = 10;
export const MAX_SUITCASE_HIGHLIGHTS = 5;
export const MAX_SESSION_EVENTS = 100;
export const PARALLEL_FETCH_TIMEOUT_MS = 5000;

/**
 * @param {import('../../lib/memory/memoryTypes.js').MemoryContext | Record<string, unknown>} raw
 * @returns {import('../../lib/memory/memoryTypes.js').MemoryContext & { ownerId: string | null }}
 */
export function normalizeMemoryContext(raw) {
  const actor = raw?.actor && typeof raw.actor === 'object' ? raw.actor : {};
  const actorId = actor.id ?? actor.userId ?? null;
  const normalizedId = actorId ? String(actorId).trim() : null;

  return {
    actor: {
      type: /** @type {import('../../lib/memory/memoryTypes.js').MemoryActorType} */ (
        actor.type ?? 'guest'
      ),
      id: normalizedId,
      userId: normalizedId,
      email: actor.email ? String(actor.email) : undefined,
    },
    storeId: raw?.storeId ? String(raw.storeId).trim() : null,
    sessionId: raw?.sessionId ? String(raw.sessionId).trim() : null,
    missionId: raw?.missionId ? String(raw.missionId).trim() : null,
    sessionHints:
      raw?.sessionHints && typeof raw.sessionHints === 'object' ? raw.sessionHints : {},
    ownerId: raw?.ownerId ? String(raw.ownerId).trim() : normalizedId,
  };
}

function formatSuitcaseItem(item) {
  return {
    id: item.id,
    sourceType: item.sourceType,
    title: item.title,
    summary: item.summary ?? item.description ?? null,
    description: item.description ?? null,
    createdAt:
      item.createdAt instanceof Date
        ? item.createdAt.toISOString()
        : String(item.createdAt ?? ''),
    metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : undefined,
  };
}

function mapPilEventsToSession(events, sessionId, hintSignals) {
  const mappedEvents = (Array.isArray(events) ? events : []).map((row) => ({
    type: String(row.type ?? 'unknown'),
    timestamp:
      row.timestamp instanceof Date
        ? row.timestamp.toISOString()
        : String(row.timestamp ?? new Date().toISOString()),
    entityType: row.entityType ? String(row.entityType) : undefined,
    entityId: row.entityId ? String(row.entityId) : undefined,
    metadata:
      row.metadata && typeof row.metadata === 'object' ? row.metadata : undefined,
  }));

  const eventTypes = mappedEvents.map((e) => e.type);
  const hintTypes = hintSignals.recentTypes ?? [];
  const mergedTypes = [...hintTypes, ...eventTypes].slice(-10);
  const learnedSignals = [...new Set([...(hintSignals.learnedSignals ?? []), ...mergedTypes.slice(-5)])];

  return {
    events: mappedEvents,
    learnedSignals,
    recentTypes: mergedTypes,
    sessionId: sessionId ? String(sessionId) : null,
    startedAt: mappedEvents.length > 0 ? mappedEvents[mappedEvents.length - 1].timestamp : undefined,
    source: mappedEvents.length > 0 ? 'server' : hintTypes.length > 0 ? 'client' : 'none',
  };
}

export class MemoryFacade {
  /**
   * @param {import('../../lib/memory/memoryTypes.js').MemoryContext | Record<string, unknown>} rawContext
   */
  async getBundle(rawContext) {
    const context = normalizeMemoryContext(rawContext);
    const startTime = Date.now();
    const actorLabel = context.actor.id ?? `anon:${context.actor.type}`;

    const cached = getCachedMemory(context);
    if (cached) {
      console.log(`[MemoryFacade] Cache hit for actor=${actorLabel} store=${context.storeId ?? 'none'}`);
      return {
        ...cached,
        meta: { ...cached.meta, cacheHit: true, fetchDurationMs: Date.now() - startTime },
      };
    }

    console.log(
      `[MemoryFacade] Cache miss for actor=${actorLabel} store=${context.storeId ?? 'none'} session=${context.sessionId ?? 'none'}`,
    );

    const fetchers = this.getFetchersForContext(context);
    const results = await this.fetchWithTimeout(fetchers, PARALLEL_FETCH_TIMEOUT_MS);

    const hintSignals = extractSessionSignalsFromHints(
      context.sessionHints?.recentEventTypes ?? [],
      context.sessionId,
    );

    const serverEvents =
      results.sessionEvents?.status === 'fulfilled' ? results.sessionEvents.value : [];
    const session = mapPilEventsToSession(serverEvents, context.sessionId, hintSignals);

    const suitcaseRaw =
      results.suitcase?.status === 'fulfilled' ? results.suitcase.value?.items ?? [] : [];

    const bundle = {
      ok: true,
      business: results.business?.status === 'fulfilled' ? results.business.value : null,
      suitcase: suitcaseRaw.slice(0, MAX_SUITCASE_HIGHLIGHTS).map(formatSuitcaseItem),
      user: results.user?.status === 'fulfilled' ? results.user.value : null,
      session,
      mission: results.mission?.status === 'fulfilled' ? results.mission.value : null,
      activeSummary:
        results.mission?.status === 'fulfilled'
          ? results.mission.value?.activeSummary ?? null
          : null,
      keyFacts:
        results.mission?.status === 'fulfilled'
          ? results.mission.value?.keyFacts ?? []
          : [],
      meta: {
        fetchedAt: new Date().toISOString(),
        sources: this.getSuccessfulSources(results, session),
        partial: this.isPartial(results),
        fetchDurationMs: Date.now() - startTime,
        cacheHit: false,
        suitcaseFetchLimit: MAX_SUITCASE_ITEMS,
        suitcaseHighlightCap: MAX_SUITCASE_HIGHLIGHTS,
      },
    };

    this.recordMemoryOutcome(bundle, startTime);
    setCachedMemory(context, bundle);
    return bundle;
  }

  /**
   * @param {ReturnType<typeof normalizeMemoryContext>} context
   */
  getFetchersForContext(context) {
    const prisma = getPrismaClient();
    const actorType = context.actor.type;
    const actorId = context.actor.id;
    const ownerId = context.ownerId ?? actorId;
    const storeId = context.storeId;

    const shouldFetchBusiness = actorType === 'store_owner' && Boolean(storeId && ownerId);
    const shouldFetchSuitcase = actorType === 'store_owner' && Boolean(storeId && ownerId);
    const shouldFetchUser =
      Boolean(actorId) &&
      (actorType === 'consumer' || actorType === 'admin' || actorType === 'store_owner');
    const shouldFetchSessionEvents = Boolean(context.sessionId);
    const shouldFetchMission = Boolean(context.missionId);

    return {
      business: shouldFetchBusiness
        ? () => getBusinessMemorySummary(storeId, ownerId, prisma)
        : () => Promise.resolve(null),
      suitcase: shouldFetchSuitcase
        ? () => listSuitcaseItems({ ownerId, storeId, limit: MAX_SUITCASE_ITEMS }, prisma)
        : () => Promise.resolve({ items: [] }),
      user: shouldFetchUser
        ? () => getUserMemory(prisma, actorId)
        : () => Promise.resolve(null),
      sessionEvents: shouldFetchSessionEvents
        ? () =>
            getRecentPilEvents({
              sessionId: context.sessionId,
              storeId: storeId ?? undefined,
              limit: MAX_SESSION_EVENTS,
            })
        : () => Promise.resolve([]),
      mission: shouldFetchMission
        ? () => getMissionMemorySnapshot(context.missionId, prisma)
        : () => Promise.resolve(null),
    };
  }

  /**
   * @param {Record<string, () => Promise<unknown>>} fetchers
   * @param {number} timeoutMs
   */
  async fetchWithTimeout(fetchers, timeoutMs) {
    const results = {};
    const entries = Object.entries(fetchers);

    const settled = await Promise.all(
      entries.map(async ([name, fetcher]) => {
        try {
          const value = await Promise.race([
            fetcher(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), timeoutMs),
            ),
          ]);
          return [name, { status: 'fulfilled', value }];
        } catch (error) {
          const status = error?.message === 'timeout' ? 'timeout' : 'rejected';
          if (status !== 'timeout') {
            console.warn(`[MemoryFacade] ${name} fetch failed:`, error?.message ?? error);
          } else {
            console.warn(`[MemoryFacade] ${name} fetch timed out after ${timeoutMs}ms`);
          }
          return [name, { status, value: null, error }];
        }
      }),
    );

    for (const [name, result] of settled) {
      results[name] = result;
    }
    return results;
  }

  /**
   * @param {Record<string, { status: string; value: unknown }>} results
   * @param {{ source?: string }} session
   */
  getSuccessfulSources(results, session) {
    const sources = [];
    if (results.business?.status === 'fulfilled') sources.push('businessMemory');
    if (results.suitcase?.status === 'fulfilled') sources.push('suitcase');
    if (results.user?.status === 'fulfilled' && results.user.value) sources.push('userMemory');
    if (results.mission?.status === 'fulfilled' && results.mission.value) {
      sources.push('missionContext');
    }
    if (
      results.sessionEvents?.status === 'fulfilled' &&
      Array.isArray(results.sessionEvents.value) &&
      results.sessionEvents.value.length > 0
    ) {
      sources.push('pilEvents');
    }
    if (session?.source === 'client') sources.push('sessionHints');
    return sources;
  }

  /**
   * @param {Record<string, { status: string }>} results
   */
  isPartial(results) {
    return Object.values(results).some((r) => r.status !== 'fulfilled');
  }

  /**
   * @param {import('../../lib/memory/memoryTypes.js').UnifiedMemoryBundle} bundle
   * @param {number} startTime
   */
  recordMemoryOutcome(bundle, startTime) {
    let outcome = 'hydrated';
    if (bundle.meta.partial) {
      outcome = 'error';
    } else if (bundle.business?.skipped) {
      outcome = 'empty_no_model';
    } else {
      const hasData = Boolean(
        (bundle.business &&
          (bundle.business.recentObservations?.length ||
            bundle.business.recentOpportunities?.length ||
            bundle.business.learnedSignals?.length)) ||
          bundle.suitcase.length > 0 ||
          bundle.user ||
          (bundle.session?.events?.length ?? 0) > 0,
      );
      outcome = hasData ? 'hydrated' : 'empty_no_rows';
    }

    recordFoundationMetric(
      'intelligence_memory_total',
      { outcome },
      outcome === 'error'
        ? {
            log: {
              evt: 'intelligence_memory_error',
              outcome: 'error',
              ms: Date.now() - startTime,
            },
          }
        : undefined,
    );
  }

  /**
   * @param {import('../../lib/memory/memoryTypes.js').MemoryContext | Record<string, unknown>} context
   */
  invalidate(context) {
    invalidateMemoryCache(normalizeMemoryContext(context));
  }

  clearAll() {
    clearMemoryCacheForTests();
    console.log('[MemoryFacade] Cache cleared');
  }
}

const memoryFacade = new MemoryFacade();
export default memoryFacade;
