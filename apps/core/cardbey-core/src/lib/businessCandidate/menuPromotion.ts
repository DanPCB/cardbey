/**
 * Promote extracted candidate menu items to store catalog products.
 * Called when a canonical store exists for a candidate (post-publish).
 */

import { getPrismaClient } from '../prisma.js';
import type { BusinessCandidateRecord } from './types.js';
import type { ExtractedMenuItem, FetchedMenuRecord } from './enrichment/types/menuTypes.js';
import type { IngestedSeedRecord } from '../businessIngestion/types.js';

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

function isFetchedMenuRecord(value: unknown): value is FetchedMenuRecord {
  if (!value || typeof value !== 'object') return false;
  const items = (value as FetchedMenuRecord).items;
  return Array.isArray(items) && items.length > 0;
}

/**
 * Prefer candidate.fetchedMenu; fall back to seed.enrichmentProfile.fetchedMenu from QA approve.
 */
export function resolveFetchedMenuForSeed(
  seed: IngestedSeedRecord,
  candidate: BusinessCandidateRecord | null,
): FetchedMenuRecord | null {
  if (isFetchedMenuRecord(candidate?.fetchedMenu)) {
    return candidate!.fetchedMenu as FetchedMenuRecord;
  }
  const profile = seed.enrichmentProfile as { fetchedMenu?: unknown } | null | undefined;
  if (isFetchedMenuRecord(profile?.fetchedMenu)) {
    return profile!.fetchedMenu as FetchedMenuRecord;
  }
  return null;
}

async function storeAlreadyHasPromotedMenu(businessId: string): Promise<boolean> {
  const prisma = getPrismaClient();
  const products = await prisma.product.findMany({
    where: { businessId, deletedAt: null },
    select: { serviceCatalog: true },
    take: 50,
  });
  return products.some((product) => {
    const catalog = product.serviceCatalog as { extractionSource?: string } | null;
    return Boolean(catalog?.extractionSource);
  });
}

/**
 * Write high-confidence menu items from a fetched menu payload to Product rows.
 */
export async function writeFetchedMenuToStore(
  businessId: string,
  fetchedMenu: FetchedMenuRecord,
  logLabel: string,
): Promise<number> {
  if (!fetchedMenu.items?.length) return 0;

  const eligibleItems = (fetchedMenu.items as ExtractedMenuItem[])
    .filter(
      (item) =>
        item.sourceConfidence >= MENU_CONFIDENCE_THRESHOLD && item.name.trim().length > 0,
    )
    .slice(0, MAX_MENU_PRODUCTS);

  if (!eligibleItems.length) return 0;

  const prisma = getPrismaClient();
  const currency = fetchedMenu.currency ?? 'AUD';
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
    console.log(`[menuPromotion] ${logLabel} — wrote ${written} menu items`);
  }

  return written;
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
  return writeFetchedMenuToStore(businessId, menu, candidate.name ?? businessId);
}

/**
 * Promote menu captured during enrichment when a discovery seed links to a live store.
 */
export async function promoteSeedMenuToStore(
  storeId: string,
  seed: IngestedSeedRecord,
): Promise<number> {
  const trimmedStoreId = storeId?.trim();
  if (!trimmedStoreId) return 0;

  if (await storeAlreadyHasPromotedMenu(trimmedStoreId)) {
    return 0;
  }

  const { findBusinessCandidateForSeed } = await import('./media/findBusinessCandidateForSeed.js');
  const candidate = await findBusinessCandidateForSeed(seed);
  const fetchedMenu = resolveFetchedMenuForSeed(seed, candidate);
  if (!fetchedMenu) return 0;

  const written = await writeFetchedMenuToStore(
    trimmedStoreId,
    fetchedMenu,
    candidate?.name ?? seed.normalized.businessName ?? trimmedStoreId,
  );

  if (written > 0 && candidate && candidate.storeId !== trimmedStoreId) {
    const { saveBusinessCandidate } = await import('./candidateRepository.js');
    await saveBusinessCandidate({
      ...candidate,
      storeId: trimmedStoreId,
      updatedAt: new Date().toISOString(),
    });
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
