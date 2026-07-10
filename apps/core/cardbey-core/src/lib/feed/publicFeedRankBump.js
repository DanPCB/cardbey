/**
 * Bump Business.publishedAt so a store rises to the top of GET /api/public/stores/feed ordering.
 */

function normMediaUrl(value) {
  return String(value ?? '').trim();
}

/**
 * @param {{ stylePreferences?: unknown, heroImageUrl?: string | null } | null | undefined} existing
 * @param {{ heroVideo?: string | null, heroImage?: string | null, heroUrlForColumn?: string | null }} next
 */
export function heroMediaChangedForFeedRank(existing, next) {
  if (!existing) return false;
  const prefs =
    existing.stylePreferences && typeof existing.stylePreferences === 'object'
      ? existing.stylePreferences
      : typeof existing.stylePreferences === 'string'
        ? (() => {
            try {
              return JSON.parse(existing.stylePreferences);
            } catch {
              return {};
            }
          })()
        : {};

  const prevVideo = normMediaUrl(prefs.heroVideo);
  const prevImage = normMediaUrl(prefs.heroImage);
  const prevColumn = normMediaUrl(existing.heroImageUrl);
  const nextVideo = normMediaUrl(next.heroVideo);
  const nextImage = normMediaUrl(next.heroImage);
  const nextColumn = normMediaUrl(next.heroUrlForColumn);

  if (nextVideo && nextVideo !== prevVideo) return true;
  if (nextImage && nextImage !== prevImage && nextImage !== prevColumn) return true;
  if (nextColumn && nextColumn !== prevColumn && nextColumn !== prevImage) return true;
  return false;
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} businessId
 * @param {{ reason?: string }} [options]
 * @returns {Promise<Date | null>}
 */
export async function bumpPublicFeedRankForStore(prisma, businessId, { reason = 'hero_refresh' } = {}) {
  const id = String(businessId ?? '').trim();
  if (!id) return null;

  const store = await prisma.business.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });
  if (!store?.isActive) return null;

  const bumpTime = new Date();
  await prisma.business.update({
    where: { id },
    data: { publishedAt: bumpTime, updatedAt: bumpTime },
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('[publicFeedRankBump]', { storeId: id, reason, publishedAt: bumpTime.toISOString() });
  }
  return bumpTime;
}
