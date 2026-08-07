import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreatorFindUnique = vi.fn();
const mockSellerFindUnique = vi.fn();
const mockSellerCreate = vi.fn();
const mockSellerUpdate = vi.fn();
const mockSellerFindMany = vi.fn();
const mockSellerEventCreate = vi.fn();

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    creator: {
      findUnique: mockCreatorFindUnique,
    },
    marketplaceSellerProfile: {
      findUnique: mockSellerFindUnique,
      create: mockSellerCreate,
      update: mockSellerUpdate,
      findMany: mockSellerFindMany,
    },
    marketplaceSellerStatusEvent: {
      create: mockSellerEventCreate,
    },
  }),
}));

describe('marketplace sellerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applyMarketplaceSeller keeps new seller pending even when creator is qualified', async () => {
    mockCreatorFindUnique.mockResolvedValue({
      id: 'creator-1',
      userId: 'user-1',
      username: 'creator-one',
      displayName: 'Creator One',
      isQualified: true,
      creatorStatus: 'active',
    });
    mockSellerFindUnique.mockResolvedValueOnce(null);
    mockSellerCreate.mockResolvedValue({
      id: 'seller-1',
      userId: 'user-1',
      creatorId: 'creator-1',
      displayName: 'Seller One',
      countryCode: 'AU',
      defaultCurrency: 'AUD',
      status: 'PENDING',
      applicationBio: 'Bio',
      applicationMotivation: 'Motivation',
      applicationPortfolioUrl: null,
      applicationLanguages: ['en'],
      applicationNotes: null,
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
      updatedAt: new Date('2026-08-05T00:00:00.000Z'),
      creator: {
        id: 'creator-1',
        username: 'creator-one',
        displayName: 'Creator One',
        isQualified: true,
        creatorStatus: 'active',
      },
    });
    mockSellerEventCreate.mockResolvedValue({ id: 'event-1' });

    const { applyMarketplaceSeller } = await import('../seller/sellerService.js');
    const seller = await applyMarketplaceSeller('user-1', {
      displayName: 'Seller One',
      countryCode: 'AU',
      defaultCurrency: 'AUD',
      termsAccepted: true,
      rightsPolicyAccepted: true,
      applicationBio: 'Bio',
      applicationMotivation: 'Motivation',
      applicationLanguages: ['en'],
    });

    expect(mockSellerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          creatorId: 'creator-1',
          status: 'PENDING',
          displayName: 'Seller One',
          countryCode: 'AU',
        }),
      }),
    );
    expect(seller.status).toBe('PENDING');
  });

  it('updateMarketplaceSellerApplication only allows pending applications', async () => {
    mockSellerFindUnique.mockResolvedValue({
      id: 'seller-1',
      userId: 'user-1',
      creatorId: 'creator-1',
      status: 'APPROVED',
      creator: {
        id: 'creator-1',
        username: 'creator-one',
        displayName: 'Creator One',
        isQualified: true,
        creatorStatus: 'active',
      },
    });

    const { updateMarketplaceSellerApplication } = await import('../seller/sellerService.js');
    await expect(
      updateMarketplaceSellerApplication('user-1', { applicationBio: 'Changed' }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
    expect(mockSellerUpdate).not.toHaveBeenCalled();
  });
});
