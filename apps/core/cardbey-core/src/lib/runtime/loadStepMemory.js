/**
 * Runtime memory injection for kernel step / tool execution.
 */

import memoryFacade from '../../services/memory/memoryFacade.js';
import { FEATURE_FLAGS } from '../../config/featureFlags.js';
import { appendEvent } from '../missionBlackboard.js';

/**
 * @param {import('../../services/memory/memoryFacade.js').default extends { getBundle: infer G } ? Parameters<G>[0] : never} rawContext
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function loadStepMemory(rawContext = {}) {
  const ctx = rawContext && typeof rawContext === 'object' ? rawContext : {};
  const missionId = String(ctx.missionId ?? '').trim() || null;
  const userId = String(ctx.userId ?? '').trim() || null;
  const storeId = String(ctx.storeId ?? '').trim() || null;
  const sessionId = String(ctx.sessionId ?? '').trim() || null;

  if (!userId && !missionId) {
    return null;
  }

  const startTime = Date.now();
  const timeoutMs = FEATURE_FLAGS.MEMORY_LOAD_TIMEOUT_MS;

  try {
    const bundle = await Promise.race([
      memoryFacade.getBundle({
        actor: { type: userId ? 'store_owner' : 'guest', id: userId },
        storeId,
        sessionId,
        missionId,
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('memory_load_timeout')), timeoutMs);
      }),
    ]);

    return mapBundleToStepMemory(bundle, { loadTimeMs: Date.now() - startTime, loaded: true });
  } catch (err) {
    console.warn('[loadStepMemory] failed:', err?.message ?? err);
    return mapBundleToStepMemory(null, {
      loadTimeMs: Date.now() - startTime,
      loaded: false,
      partial: true,
      error: err?.message || 'unknown',
      fallback: true,
    });
  }
}

/**
 * @param {unknown} bundle
 * @param {Record<string, unknown>} metadata
 */
export function mapBundleToStepMemory(bundle, metadata = {}) {
  const b = bundle && typeof bundle === 'object' && !Array.isArray(bundle) ? bundle : null;
  const business =
    b?.business && typeof b.business === 'object' && !Array.isArray(b.business) ? b.business : null;
  const suitcase = Array.isArray(b?.suitcase) ? b.suitcase : [];

  return {
    keyFacts: Array.isArray(b?.keyFacts) ? b.keyFacts.slice(0, 8) : [],
    activeSummary:
      (typeof b?.activeSummary === 'string' && b.activeSummary.trim()) ||
      (typeof b?.mission?.activeSummary === 'string' && b.mission.activeSummary.trim()) ||
      null,
    businessOutcomes: Array.isArray(business?.recentOutcomes) ? business.recentOutcomes.slice(0, 10) : [],
    suitcaseItems: suitcase.slice(0, 5),
    learnedSignals: Array.isArray(b?.session?.learnedSignals)
      ? b.session.learnedSignals.slice(0, 8)
      : [],
    _metadata: {
      partial: metadata.partial === true || b?.meta?.partial === true,
      loaded: metadata.loaded === true,
      loadTimeMs: typeof metadata.loadTimeMs === 'number' ? metadata.loadTimeMs : null,
      error: typeof metadata.error === 'string' ? metadata.error : null,
      fallback: metadata.fallback === true,
    },
  };
}

/**
 * @param {{
 *   missionId?: string | null;
 *   userId?: string | null;
 *   storeId?: string | null;
 *   sessionId?: string | null;
 *   traceId?: string | null;
 * }} input
 */
export async function loadAndEmitStepMemory(input = {}) {
  const memory = await loadStepMemory(input);
  if (memory && input.missionId) {
    try {
      await appendEvent(
        input.missionId,
        'runtime.memory.injected',
        {
          loaded: memory._metadata?.loaded === true,
          partial: memory._metadata?.partial === true,
          keyFactCount: memory.keyFacts?.length ?? 0,
          loadTimeMs: memory._metadata?.loadTimeMs ?? null,
        },
        input.traceId ? { traceId: input.traceId } : {},
      );
    } catch {
      /* non-blocking */
    }
  }
  return memory;
}
