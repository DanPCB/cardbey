// AUDIT: improve_hero at store/improve_hero.js — honest blocker; audit is read-only state check
// DANH: skill-round4-hero
/**
 * audit_hero_media — inspect Business hero fields (read-only).
 * Side effect: read-only DB query.
 * Note: Business model has heroImageUrl but no heroVideoUrl column.
 */

import { getPrismaClient } from '../../prisma.js';

/**
 * @param {object | null | undefined} row
 */
export function auditHeroFromBusinessRow(row) {
  const heroImageUrl =
    row?.heroImageUrl && String(row.heroImageUrl).trim() ? String(row.heroImageUrl).trim() : null;
  const hasHeroImage = Boolean(heroImageUrl);
  const hasHeroVideo = false;
  return {
    hasHeroImage,
    hasHeroVideo,
    currentHeroUrl: heroImageUrl,
    brandStyle: row?.brandStyle ? String(row.brandStyle) : null,
    category: row?.type ? String(row.type) : null,
    needsImprovement: !hasHeroImage && !hasHeroVideo,
  };
}

/**
 * @param {object} [input]
 */
export async function execute(input = {}) {
  const storeId = typeof input?.storeId === 'string' ? input.storeId.trim() : '';
  if (!storeId) {
    return {
      status: 'failed',
      output: { error: 'storeId is required' },
    };
  }

  try {
    const prisma = getPrismaClient();
    const row = await prisma.business.findUnique({
      where: { id: storeId },
      select: {
        heroImageUrl: true,
        brandStyle: true,
        type: true,
        name: true,
      },
    });

    if (!row) {
      return {
        status: 'ok',
        output: {
          ...auditHeroFromBusinessRow(null),
          storeName: null,
        },
      };
    }

    return {
      status: 'ok',
      output: {
        ...auditHeroFromBusinessRow(row),
        storeName: row.name ?? null,
      },
    };
  } catch {
    return {
      status: 'ok',
      output: {
        ...auditHeroFromBusinessRow(null),
        storeName: null,
      },
    };
  }
}

export default execute;
