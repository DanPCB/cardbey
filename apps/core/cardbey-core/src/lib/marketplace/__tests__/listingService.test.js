import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSellerFindUnique = vi.fn();
const mockContentFindUnique = vi.fn();
const mockListingFindFirst = vi.fn();
const mockListingCreate = vi.fn();
const mockListingFindUnique = vi.fn();
const mockListingUpdate = vi.fn();
const mockOwnershipUpsert = vi.fn();
const mockProvenanceUpsert = vi.fn();
const mockListingEventCreate = vi.fn();

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    marketplaceSellerProfile: {
      findUnique: mockSellerFindUnique,
    },
    creatorContent: {
      findUnique: mockContentFindUnique,
    },
    marketplaceListing: {
      findFirst: mockListingFindFirst,
      create: mockListingCreate,
      findUnique: mockListingFindUnique,
      update: mockListingUpdate,
    },
    marketplaceOwnershipDeclaration: {
      upsert: mockOwnershipUpsert,
    },
    marketplaceAssetProvenance: {
      upsert: mockProvenanceUpsert,
    },
    marketplaceListingEvent: {
      create: mockListingEventCreate,
    },
  }),
}));

function buildSeller() {
  return {
    id: 'seller-1',
    userId: 'user-1',
    creatorId: 'creator-1',
    status: 'APPROVED',
    creator: {
      id: 'creator-1',
      username: 'creator-one',
      displayName: 'Creator One',
    },
  };
}

function buildSourceContent() {
  return {
    id: 'content-1',
    creatorId: 'creator-1',
    type: 'VIDEO',
    title: 'Source Video',
    description: 'Source description',
    language: 'en',
    durationSeconds: 90,
    thumbnail: '/thumb.png',
    mediaUrl: '/video.mp4',
    status: 'published',
    visibility: 'public',
    publishedAt: new Date('2026-08-05T00:00:00.000Z'),
  };
}

function buildListing(overrides = {}) {
  return {
    id: 'listing-1',
    sellerId: 'seller-1',
    creatorId: 'creator-1',
    sourceContentId: 'content-1',
    sourceContentType: 'VIDEO',
    activeSourceKey: 'seller-1:VIDEO:content-1',
    title: 'Source Video',
    description: 'Source description',
    language: 'en',
    thumbnailUrl: '/thumb.png',
    accessType: 'FREE',
    priceAmount: 0,
    currencyCode: 'AUD',
    licenceCode: 'personal_use',
    licenceVersion: 'phase1c',
    customLicenceText: null,
    ownershipType: 'SELF_CREATED',
    sellerNotes: null,
    reviewReason: null,
    listingStatus: 'DRAFT',
    availabilityStatus: 'UNAVAILABLE',
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    updatedAt: new Date('2026-08-05T00:00:00.000Z'),
    seller: buildSeller(),
    creator: buildSeller().creator,
    sourceContent: buildSourceContent(),
    ownershipDeclaration: {
      ownershipType: 'SELF_CREATED',
      rightsConfirmed: true,
      commercialRightsConfirmed: true,
      creatorAuthoredWork: true,
      declarationText: null,
      evidenceJson: null,
    },
    assetProvenance: {
      sourceKind: 'CREATOR_SOURCE',
      sourceLabel: null,
      sourceUrl: null,
      derivativeDisclosure: null,
      evidenceJson: null,
    },
    ...overrides,
  };
}

describe('marketplace listingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createMarketplaceListingDraft derives seller and creator from auth context', async () => {
    mockSellerFindUnique.mockResolvedValueOnce(buildSeller());
    mockContentFindUnique.mockResolvedValueOnce(buildSourceContent());
    mockListingFindFirst.mockResolvedValueOnce(null);
    mockListingCreate.mockResolvedValueOnce(buildListing());
    mockOwnershipUpsert.mockResolvedValue({});
    mockProvenanceUpsert.mockResolvedValue({});
    mockListingFindUnique.mockResolvedValueOnce(buildListing());
    mockListingEventCreate.mockResolvedValue({});

    const { createMarketplaceListingDraft } = await import('../listing/listingService.js');
    await createMarketplaceListingDraft('user-1', {
      sellerId: 'spoofed-seller',
      creatorId: 'spoofed-creator',
      sourceContentId: 'content-1',
      licenceCode: 'personal_use',
      ownershipType: 'SELF_CREATED',
      ownershipDeclaration: {
        rightsConfirmed: true,
        commercialRightsConfirmed: true,
        creatorAuthoredWork: true,
      },
    });

    expect(mockListingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sellerId: 'seller-1',
          creatorId: 'creator-1',
          sourceContentId: 'content-1',
          activeSourceKey: 'seller-1:VIDEO:content-1',
        }),
      }),
    );
  });

  it('updateMarketplaceListingDraft resubmits approved or published listings when rights change', async () => {
    mockSellerFindUnique.mockResolvedValueOnce(buildSeller());
    mockListingFindUnique.mockResolvedValueOnce(
      buildListing({
        listingStatus: 'PUBLISHED',
        availabilityStatus: 'AVAILABLE',
        approvedAt: new Date('2026-08-05T00:00:00.000Z'),
        approvedByUserId: 'admin-1',
        publishedAt: new Date('2026-08-05T01:00:00.000Z'),
        publishedByUserId: 'admin-1',
      }),
    );
    mockContentFindUnique.mockResolvedValueOnce(buildSourceContent());
    mockListingFindFirst.mockResolvedValueOnce(null);
    mockListingUpdate
      .mockResolvedValueOnce(
        buildListing({
          listingStatus: 'PUBLISHED',
          availabilityStatus: 'AVAILABLE',
          ownershipType: 'LICENSED',
          licenceCode: 'commercial_single',
          ownershipDeclaration: null,
          assetProvenance: null,
        }),
      )
      .mockResolvedValueOnce(
        buildListing({
          listingStatus: 'SUBMITTED',
          availabilityStatus: 'UNAVAILABLE',
          ownershipType: 'LICENSED',
          licenceCode: 'commercial_single',
          reviewReason: 'Rights changed after approval; resubmitted for marketplace review.',
          approvedAt: null,
          approvedByUserId: null,
          publishedAt: null,
          publishedByUserId: null,
          unpublishedAt: null,
          ownershipDeclaration: {
            ownershipType: 'LICENSED',
            rightsConfirmed: true,
            commercialRightsConfirmed: true,
            creatorAuthoredWork: false,
            declarationText: 'Licensed',
            evidenceJson: null,
          },
          assetProvenance: {
            sourceKind: 'LICENSED_SOURCE',
            sourceLabel: 'Agency licence',
            sourceUrl: 'https://private.example/evidence',
            derivativeDisclosure: null,
            evidenceJson: null,
          },
        }),
      );
    mockOwnershipUpsert.mockResolvedValue({});
    mockProvenanceUpsert.mockResolvedValue({});
    mockListingEventCreate.mockResolvedValue({});

    const { updateMarketplaceListingDraft } = await import('../listing/listingService.js');
    const listing = await updateMarketplaceListingDraft('user-1', 'listing-1', {
      licenceCode: 'commercial_single',
      ownershipType: 'LICENSED',
      ownershipDeclaration: {
        ownershipType: 'LICENSED',
        rightsConfirmed: true,
        commercialRightsConfirmed: true,
        creatorAuthoredWork: false,
        declarationText: 'Licensed',
      },
      assetProvenance: {
        sourceKind: 'LICENSED_SOURCE',
        sourceLabel: 'Agency licence',
        sourceUrl: 'https://private.example/evidence',
      },
    });

    expect(mockListingUpdate).toHaveBeenCalledTimes(2);
    expect(listing.listingStatus).toBe('SUBMITTED');
    expect(listing.approvedAt).toBeNull();
    expect(listing.publishedAt).toBeNull();
  });
});
