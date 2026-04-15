/**
 * Catalog & Starter Pack – list, get, and instantiate (stub).
 * No UI; not wired into existing store creation flow. Feature-flagged.
 */

import { getPrismaClient } from '../../lib/prisma.js';
import type {
  ListStarterPacksFilters,
  StarterPack,
  StarterPackStatus,
  StarterPackWithDetails,
} from './types.js';

export { listStarterPacks, getStarterPack, instantiatePackToDraftStore };
export type { ListStarterPacksFilters, StarterPackWithDetails } from './types.js';
export * from './types.js';
export * from './seedStarterPacks.js';

/**
 * List starter packs with optional filters (businessType, region, status).
 */
async function listStarterPacks(
  filters: ListStarterPacksFilters = {}
): Promise<StarterPack[]> {
  const prisma = getPrismaClient();
  const where: {
    status?: StarterPackStatus;
    businessType?: { key: string };
    region?: { code: string };
  } = {};

  if (filters.status) where.status = filters.status;
  if (filters.businessTypeKey) where.businessType = { key: filters.businessTypeKey };
  if (filters.regionCode) where.region = { code: filters.regionCode };

  const packs = await prisma.starterPack.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
  });

  return packs as StarterPack[];
}

/**
 * Get a single starter pack by id with items and categories.
 */
async function getStarterPack(id: string): Promise<StarterPackWithDetails | null> {
  const prisma = getPrismaClient();
  const pack = await prisma.starterPack.findUnique({
    where: { id },
    include: {
      items: { include: { catalogItem: true }, orderBy: { sortOrder: 'asc' } },
      categories: {
        include: { catalogCategory: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  return pack as unknown as StarterPackWithDetails | null;
}

/**
 * Stub: instantiate a starter pack into a draft store.
 * TODO: Create/update DraftStore.preview (and optionally input) from pack items/categories.
 * TODO: Do not wire into existing store creation flow until feature flag and validation.
 */
async function instantiatePackToDraftStore(
  _packId: string,
  _draftStoreId: string
): Promise<{ ok: boolean; error?: string }> {
  // TODO: Load pack with items/categories; map to draft preview shape; update DraftStore by id.
  // TODO: Ensure draft store exists and is in draft status; avoid overwriting committed drafts.
  return { ok: false, error: 'Not implemented' };
}
