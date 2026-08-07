import { getPrismaClient } from '../../prisma.js';
import { createMarketplaceError } from '../errors.js';
import { getMarketplaceLicence } from '../licences.js';
import {
  MARKETPLACE_AVAILABILITY_STATUS,
  MARKETPLACE_LISTING_STATUS,
  MARKETPLACE_SELLER_STATUS,
} from '../types.js';

function toPublicMarketplaceLibraryItem(row) {
  const licence = getMarketplaceLicence(row.licenceCode);
  return {
    listingId: row.id,
    sellerId: row.sellerId,
    creatorId: row.creatorId,
    sourceContentId: row.sourceContentId,
    sourceContentType: row.sourceContentType,
    title: row.title,
    description: row.description ?? null,
    language: row.language ?? null,
    thumbnailUrl: row.thumbnailUrl || row.sourceContent?.thumbnail || null,
    durationSeconds: row.sourceContent?.durationSeconds ?? null,
    accessType: row.accessType,
    priceAmount: row.priceAmount ?? 0,
    currencyCode: row.currencyCode,
    purchaseAvailable: false,
    publishedAt: row.publishedAt ?? null,
    seller: row.seller
      ? {
          sellerId: row.seller.id,
          status: row.seller.status,
          creatorId: row.seller.creatorId,
        }
      : null,
    creator: row.creator
      ? {
          creatorId: row.creator.id,
          username: row.creator.username,
          displayName: row.creator.displayName ?? null,
        }
      : null,
    licence: {
      code: row.licenceCode,
      label: licence?.label ?? row.licenceCode,
      summary: licence?.summary ?? null,
    },
  };
}

function buildPublicLibraryWhere() {
  return {
    listingStatus: MARKETPLACE_LISTING_STATUS.PUBLISHED,
    availabilityStatus: MARKETPLACE_AVAILABILITY_STATUS.AVAILABLE,
    seller: {
      status: MARKETPLACE_SELLER_STATUS.APPROVED,
    },
    sourceContent: {
      status: 'published',
      visibility: 'public',
    },
  };
}

export async function listPublicMarketplaceLibraryAssets(
  opts = {},
  prisma = getPrismaClient(),
) {
  const limit = Math.min(Math.max(Number(opts.limit) || 24, 1), 100);
  const rows = await prisma.marketplaceListing.findMany({
    where: buildPublicLibraryWhere(),
    orderBy: { publishedAt: 'desc' },
    take: limit,
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          durationSeconds: true,
          thumbnail: true,
          status: true,
          visibility: true,
        },
      },
    },
  });
  return rows.map(toPublicMarketplaceLibraryItem);
}

export async function getPublicMarketplaceLibraryAsset(
  listingId,
  prisma = getPrismaClient(),
) {
  const row = await prisma.marketplaceListing.findFirst({
    where: {
      id: listingId,
      ...buildPublicLibraryWhere(),
    },
    include: {
      seller: true,
      creator: {
        select: { id: true, username: true, displayName: true },
      },
      sourceContent: {
        select: {
          id: true,
          durationSeconds: true,
          thumbnail: true,
          status: true,
          visibility: true,
        },
      },
    },
  });
  if (!row) {
    throw createMarketplaceError(
      'listing_not_found',
      'Public marketplace listing not found.',
      404,
    );
  }
  return toPublicMarketplaceLibraryItem(row);
}
