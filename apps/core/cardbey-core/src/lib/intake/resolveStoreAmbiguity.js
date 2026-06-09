// DANH: store-disambiguation
/**
 * Multi-store disambiguation before store-scoped skill / tool dispatch.
 */

import { getPrismaClient } from '../prisma.js';

/**
 * @param {unknown} logo
 * @returns {string | null}
 */
function parseLogoUrl(logo) {
  if (typeof logo !== 'string' || !logo.trim()) return null;
  try {
    const parsed = JSON.parse(logo);
    if (parsed && typeof parsed === 'object' && typeof parsed.url === 'string') {
      return parsed.url.trim() || null;
    }
  } catch {
    if (logo.startsWith('http')) return logo.trim();
  }
  return null;
}

/**
 * @param {string | null | undefined} userId
 * @returns {Promise<Array<{ id: string, name: string, type: string | null, logoUrl: string | null }>>}
 */
export async function fetchUserStoresForDisambiguation(userId) {
  const uid = String(userId ?? '').trim();
  if (!uid) return [];

  try {
    const prisma = getPrismaClient();
    const rows = await prisma.business.findMany({
      where: {
        userId: uid,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        logo: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type ?? null,
      logoUrl: parseLogoUrl(s.logo),
    }));
  } catch {
    return [];
  }
}

/**
 * Auto-pick when the user owns exactly one active store.
 *
 * @param {string | null | undefined} userId
 * @returns {Promise<string | null>}
 */
export async function tryAutoResolveSingleStoreId(userId) {
  const stores = await fetchUserStoresForDisambiguation(userId);
  if (stores.length === 1) return stores[0].id;
  return null;
}

/**
 * Checks if the user has multiple stores and the intent requires a specific store.
 *
 * @param {{
 *   userId?: string | null,
 *   effectiveStoreId?: string | null,
 *   intentRequiresStore?: boolean,
 *   userMessage?: string,
 * }} args
 * @returns {Promise<null | {
 *   needsClarification: true,
 *   clarifyType: 'store_picker',
 *   question: string,
 *   options: Array<{ label: string, value: string, hint: string | null, logoUrl: string | null }>,
 *   pendingIntent: { userMessage: string },
 * }>}
 */
export async function resolveStoreAmbiguity({
  userId,
  effectiveStoreId,
  intentRequiresStore,
  userMessage,
}) {
  if (effectiveStoreId) return null;
  if (!intentRequiresStore) return null;

  const stores = await fetchUserStoresForDisambiguation(userId);

  if (stores.length <= 1) return null;

  return {
    needsClarification: true,
    clarifyType: 'store_picker',
    question: 'Which store would you like to apply this to?',
    options: stores.map((s) => ({
      label: s.name,
      value: s.id,
      hint: s.type ?? null,
      logoUrl: s.logoUrl ?? null,
    })),
    pendingIntent: {
      userMessage: String(userMessage ?? '').trim(),
    },
  };
}
