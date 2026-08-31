/**
 * Promote extracted candidate menu items to store catalog products.
 * Called when a canonical store exists for a candidate (post-publish).
 */

import { getPrismaClient } from '../../prisma.js';
import type { BusinessCandidateRecord } from '../types.js';
import type { ExtractedMenuItem, FetchedMenuRecord } from './enrichment/types/menuTypes.js';

const MENU_CONFIDENCE_THRESHOLD = 0.6;
const MAX_MENU_PRODUCTS = 30;

export function readFetchedMenuItems(candidate: BusinessCandidateRecord): ExtractedMenuItem[] {
  const menu = candidate.fetchedMenu as FetchedMenuRecord | null;
  if (!menu || !Array.isArray(menu.items)) return [];
  return menu.items as ExtractedMenuItem[];
}

export function menuHasSynthesisedItems(candidate: BusinessCandidateRecord): boolean {
  return readFetchedMenuItems(candidate).some(
    (item) => item.extractionSource === 'claude_synthesis',
  );
}

/**
 * Write high-confidence menu items from candidate.fetchedMenu to Product rows.
 */
export async function writeCandidateMenuToStore(
  businessId: string,
  candidate: BusinessCandidateRecord,
): Promise<number> {
  const menu = candidate.fetchedMenu as FetchedMenuRecord | null;
  if (!menu?.items?.length) return 0;

  const eligibleItems = (menu.items as ExtractedMenuItem[])
    .filter(
      (item) =>
        item.sourceConfidence >= MENU_CONFIDENCE_THRESHOLD && item.name.trim().length > 0,
    )
    .slice(0, MAX_MENU_PRODUCTS);

  if (!eligibleItems.length) return 0;

  const prisma = getPrismaClient();
  const currency = menu.currency ?? 'AUD';
  let written = 0;

  for (const item of eligibleItems) {
    await prisma.product.create({
      data: {
        businessId,
        name: item.name.slice(0, 200),
        description: item.description ?? undefined,
        price: item.price ?? undefined,
        currency,
        category: item.category ?? 'Menu',
        isPublished: true,
        isFeatured: item.isSignatureDish,
        itemType: 'product',
        serviceCatalog: {
          extractionSource: item.extractionSource,
          ownerConfirmed: false,
          dietaryTags: item.dietaryTags ?? [],
          sourceConfidence: item.sourceConfidence,
        },
      },
    });
    written += 1;
  }

  if (written > 0) {
    console.log(`[menuPromotion] ${candidate.name ?? businessId} — wrote ${written} menu items`);
  }

  return written;
}

/**
 * If candidate is already linked to a store, sync menu products now.
 */
export async function syncCandidateMenuToLinkedStore(
  candidate: BusinessCandidateRecord,
): Promise<number> {
  const storeId = candidate.storeId?.trim();
  if (!storeId) return 0;
  return writeCandidateMenuToStore(storeId, candidate);
}
