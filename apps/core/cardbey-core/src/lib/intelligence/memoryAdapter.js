/**
 * Server-side memory adapter — Layer 1 durable memory only.
 * Delegates to unified memoryFacade; maps to legacy intelligence contract.
 */
import memoryFacade, { normalizeMemoryContext } from '../../services/memory/memoryFacade.js';
import {
  extractSessionSignalsFromHints,
  toLegacySessionSignals,
  toLegacyUserMemory,
} from '../memory/sessionSignals.js';

export { extractSessionSignalsFromHints } from '../memory/sessionSignals.js';

export const SUITCASE_FETCH_LIMIT = 8;
export const MAX_SUITCASE_HIGHLIGHTS = 5;

/**
 * @param {{
 *   actor: { type: string; userId?: string | null; id?: string | null };
 *   storeId: string | null;
 *   sessionId?: string | null;
 *   missionId?: string | null;
 *   sessionHints?: { recentEventTypes?: string[] };
 *   ownerId?: string | null;
 * }} input
 */
export async function fetchMemoryBundle(input) {
  const context = normalizeMemoryContext({
    actor: {
      type: input.actor?.type ?? 'guest',
      id: input.actor?.userId ?? input.actor?.id ?? null,
      userId: input.actor?.userId ?? input.actor?.id ?? null,
    },
    storeId: input.storeId ?? null,
    sessionId: input.sessionId ?? null,
    missionId: input.missionId ?? null,
    sessionHints: input.sessionHints ?? {},
    ownerId: input.ownerId ?? input.actor?.userId ?? input.actor?.id ?? null,
  });

  const bundle = await memoryFacade.getBundle(context);

  return {
    ok: bundle.ok ?? true,
    business: bundle.business,
    suitcase: bundle.suitcase,
    user: toLegacyUserMemory(bundle.user),
    session: toLegacySessionSignals(bundle.session),
    mission: bundle.mission ?? null,
    meta: {
      ...bundle.meta,
      suitcaseFetchLimit: bundle.meta.suitcaseFetchLimit ?? SUITCASE_FETCH_LIMIT,
      suitcaseHighlightCap: bundle.meta.suitcaseHighlightCap ?? MAX_SUITCASE_HIGHLIGHTS,
    },
  };
}
