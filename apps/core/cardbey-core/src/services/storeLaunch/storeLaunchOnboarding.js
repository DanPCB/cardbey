/**
 * Store launch context returned after publish — no DB writes; enriches API responses.
 */

function pickLocation(business) {
  const parts = [business?.suburb, business?.state, business?.country].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/**
 * @param {import('@prisma/client').Business | Record<string, unknown>} business
 * @param {{ productsCount?: number; storefrontUrl?: string | null }} [opts]
 */
export function buildStoreLaunchContext(business, opts = {}) {
  const storeId = String(business?.id ?? '').trim();
  if (!storeId) return null;

  const slug = typeof business?.slug === 'string' ? business.slug.trim() : '';
  const storefrontPath = slug ? `/s/${encodeURIComponent(slug)}` : null;

  return {
    storeId,
    storeName: String(business?.name ?? 'Your store').trim() || 'Your store',
    category: business?.type ?? business?.category ?? null,
    location: pickLocation(business),
    productsCount: Math.max(0, Number(opts.productsCount) || 0),
    storefrontPath,
    storefrontUrl: opts.storefrontUrl ?? null,
    publishedAt:
      business?.publishedAt?.toISOString?.() ??
      (typeof business?.publishedAt === 'string' ? business.publishedAt : new Date().toISOString()),
  };
}

/**
 * Lightweight audit log for store completion (no side effects).
 */
export function logStoreLaunchCompletion(launchContext, { userId, entrypoint } = {}) {
  if (!launchContext?.storeId) return;
  console.log('[storeLaunch] Store published — launch onboarding ready', {
    storeId: launchContext.storeId,
    storeName: launchContext.storeName,
    userId: userId ?? null,
    entrypoint: entrypoint ?? 'publish',
  });
}
