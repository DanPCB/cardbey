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

function pickLogoUrl(row) {
  if (typeof row?.avatarImageUrl === 'string' && row.avatarImageUrl.trim()) {
    return row.avatarImageUrl.trim();
  }
  return parseLogoUrl(row?.logo);
}

/**
 * @param {string | null | undefined} userId
 * @returns {Promise<Array<Record<string, unknown>>>}
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
        slug: true,
        logo: true,
        avatarImageUrl: true,
        primaryColor: true,
        secondaryColor: true,
        tagline: true,
        suburb: true,
        city: true,
        state: true,
        region: true,
        country: true,
        address: true,
        formattedAddress: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    });

    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type ?? null,
      category: s.type ?? null,
      slug: s.slug ?? null,
      logoUrl: pickLogoUrl(s),
      avatarImageUrl: s.avatarImageUrl ?? null,
      primaryColor: s.primaryColor ?? null,
      secondaryColor: s.secondaryColor ?? null,
      tagline: s.tagline ?? null,
      suburb: s.suburb ?? null,
      city: s.city ?? null,
      state: s.state ?? null,
      region: s.region ?? null,
      country: s.country ?? null,
      address: s.address ?? null,
      formattedAddress: s.formattedAddress ?? null,
    }));
  } catch (err) {
    console.error('[resolveStoreAmbiguity] fetchUserStoresForDisambiguation failed:', err?.message ?? err);
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
 * Verify that a store id still belongs to the user and is active.
 *
 * @param {string | null | undefined} userId
 * @param {string | null | undefined} storeId
 * @returns {Promise<boolean>}
 */
export async function validateUserStoreId(userId, storeId) {
  const uid = String(userId ?? '').trim();
  const sid = String(storeId ?? '').trim();
  if (!uid || !sid) return false;

  try {
    const prisma = getPrismaClient();
    const store = await prisma.business.findFirst({
      where: { id: sid, userId: uid, isActive: true },
      select: { id: true },
    });
    return Boolean(store?.id);
  } catch {
    return false;
  }
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
    clarifyType: 'execution_context_store_picker',
    question: 'Which business should I create this for?',
    options: stores.map((s) => ({
      label: s.name,
      value: s.id,
      hint: s.type ?? s.category ?? null,
      logoUrl: s.logoUrl ?? null,
      storeCandidate: s,
    })),
    storeCandidates: stores,
    pendingIntent: {
      userMessage: String(userMessage ?? '').trim(),
    },
  };
}
