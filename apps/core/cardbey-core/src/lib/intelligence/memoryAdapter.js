/**
 * Server-side memory adapter — Layer 1 durable memory only.
 * Session PIL events are client-side; accept sessionHints from the request body.
 */
import { getPrismaClient } from '../prisma.js';
import { getBusinessMemorySummary } from '../../services/businessMemory/businessMemoryService.js';
import { listSuitcaseItems } from '../../services/suitcase/suitcaseItemService.js';

export const SUITCASE_FETCH_LIMIT = 8;
export const MAX_SUITCASE_HIGHLIGHTS = 5;

/**
 * @param {string[]} recentEventTypes
 * @returns {{ learnedSignals: string[], recentTypes: string[], sessionId: string | null }}
 */
export function extractSessionSignalsFromHints(recentEventTypes = [], sessionId = null) {
  const types = Array.isArray(recentEventTypes)
    ? recentEventTypes.map((t) => String(t ?? '').trim()).filter(Boolean)
    : [];
  const unique = types.filter((t, i, arr) => arr.lastIndexOf(t) === i).slice(-5);
  return {
    learnedSignals: unique,
    recentTypes: types.slice(-10),
    sessionId: sessionId ? String(sessionId) : null,
  };
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 */
async function fetchUserMemoryRow(prisma, userId) {
  try {
    if (!prisma?.userMemory) return null;
    const row = await prisma.userMemory.findUnique({ where: { userId } });
    if (!row) return null;
    return {
      previousVisits: row.visitCount ?? 0,
      visitCount: row.visitCount ?? 0,
      lastAction: row.lastAction ?? undefined,
      lastActionAt: row.lastActionAt ?? undefined,
      abandonedTasks: Array.isArray(row.abandonedTasks) ? row.abandonedTasks : [],
      completedTasks: Array.isArray(row.completedTasks) ? row.completedTasks : [],
    };
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   actor: { type: string; userId: string | null };
 *   storeId: string | null;
 *   sessionId?: string | null;
 *   sessionHints?: { recentEventTypes?: string[] };
 *   ownerId?: string | null;
 * }} input
 */
export async function fetchMemoryBundle(input) {
  const sources = [];
  const startTime = Date.now();
  const actorType = String(input.actor?.type ?? 'guest');
  const userId = input.actor?.userId ? String(input.actor.userId) : null;
  const storeId = input.storeId ? String(input.storeId).trim() : null;
  const ownerId = input.ownerId ? String(input.ownerId) : userId;

  const shouldFetchBusiness =
    actorType === 'store_owner' && Boolean(storeId && ownerId);
  const shouldFetchSuitcase = actorType === 'store_owner' && Boolean(storeId && ownerId);
  const shouldFetchUserMemory =
    (actorType === 'consumer' || actorType === 'admin') && Boolean(userId);

  const prisma = getPrismaClient();

  const [businessResult, suitcaseResult, userMemoryResult] = await Promise.allSettled([
    shouldFetchBusiness
      ? getBusinessMemorySummary(storeId, ownerId, prisma)
      : Promise.resolve(null),
    shouldFetchSuitcase
      ? listSuitcaseItems(
          { ownerId, storeId, limit: SUITCASE_FETCH_LIMIT },
          prisma,
        )
      : Promise.resolve({ items: [] }),
    shouldFetchUserMemory ? fetchUserMemoryRow(prisma, userId) : Promise.resolve(null),
  ]);

  const business = businessResult.status === 'fulfilled' ? businessResult.value : null;
  const suitcaseRaw =
    suitcaseResult.status === 'fulfilled'
      ? suitcaseResult.value?.items ?? []
      : [];
  const user = userMemoryResult.status === 'fulfilled' ? userMemoryResult.value : null;

  const suitcase = suitcaseRaw.slice(0, MAX_SUITCASE_HIGHLIGHTS).map((item) => ({
    id: item.id,
    sourceType: item.sourceType,
    title: item.title,
    summary: item.summary ?? item.description ?? null,
    createdAt:
      item.createdAt instanceof Date
        ? item.createdAt.toISOString()
        : String(item.createdAt ?? ''),
  }));

  const hintTypes = input.sessionHints?.recentEventTypes ?? [];
  const session = extractSessionSignalsFromHints(hintTypes, input.sessionId ?? null);
  session.source = hintTypes.length > 0 ? 'client' : 'none';

  if (businessResult.status === 'fulfilled' && business) sources.push('businessMemory');
  if (suitcaseResult.status === 'fulfilled') sources.push('suitcase');
  if (userMemoryResult.status === 'fulfilled' && user) sources.push('userMemory');
  if (hintTypes.length > 0) sources.push('sessionHints');

  const partial =
    (shouldFetchBusiness && businessResult.status === 'rejected') ||
    (shouldFetchSuitcase && suitcaseResult.status === 'rejected') ||
    (shouldFetchUserMemory && userMemoryResult.status === 'rejected');

  return {
    ok: true,
    business,
    suitcase,
    user,
    session,
    meta: {
      fetchedAt: new Date().toISOString(),
      sources,
      partial,
      suitcaseFetchLimit: SUITCASE_FETCH_LIMIT,
      suitcaseHighlightCap: MAX_SUITCASE_HIGHLIGHTS,
      fetchDurationMs: Date.now() - startTime,
    },
  };
}
