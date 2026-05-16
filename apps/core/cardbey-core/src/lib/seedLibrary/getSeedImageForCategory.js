/**
 * Key-based selection only. Returns one Seed Library image URL for the given category/vertical/orientation.
 * Used as fallback when hero or item image is missing. Never used for primary resolution; never index-based.
 */

import { getPrismaClient } from '../../lib/prisma.js';

/**
 * Get a single seed image URL for placeholder/fallback use.
 * Selection is strictly by categoryKey, vertical, orientation (key-based). No array index.
 *
 * @param {{ categoryKey?: string | null; vertical?: string | null; orientation?: string | null }} opts
 * @returns {Promise<string | null>} URL (from SeedAssetFile) or null if none found
 */
export async function getSeedImageForCategory(opts = {}) {
  const { categoryKey = null, vertical = null, orientation = null } = opts;
  const prisma = getPrismaClient();

  const where = { status: 'active' };
  if (vertical && String(vertical).trim()) where.vertical = String(vertical).trim();
  if (categoryKey && String(categoryKey).trim()) where.categoryKey = String(categoryKey).trim();
  if (orientation && String(orientation).trim()) where.orientation = String(orientation).trim();

  const asset = await prisma.seedAsset.findFirst({
    where,
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  if (!asset) return null;

  const file = await prisma.seedAssetFile.findFirst({
    where: { seedAssetId: asset.id, role: { in: ['full', 'medium'] } },
    orderBy: { role: 'asc' },
  });

  if (!file || !file.fileUrl) return null;

  const url = file.fileUrl.trim();
  return url || null;
}
