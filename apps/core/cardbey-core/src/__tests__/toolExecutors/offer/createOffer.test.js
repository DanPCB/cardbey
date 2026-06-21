/**
 * create_offer executor tests.
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  business: {
    findUnique: vi.fn(),
  },
  storeOffer: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  dynamicQr: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock('../../../lib/prisma.js', () => ({
  getPrismaClient: vi.fn(() => prismaMock),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'abc123'),
}));

import { execute as createOffer } from '../../../lib/toolExecutors/promotion/create_offer.js';
import { EXECUTION_STATES } from '../../../lib/telemetry/executionStates.js';

describe('create_offer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.business.findUnique.mockResolvedValue({
      id: 'test-store',
      slug: 'test-cafe',
      isActive: true,
    });
    prismaMock.storeOffer.findFirst.mockResolvedValue(null);
    prismaMock.storeOffer.create.mockResolvedValue({
      id: 'offer-1',
      slug: 'summer-sale',
      title: 'Summer Sale',
      description: 'Hot deals',
      priceText: '20% off',
      isActive: true,
      endsAt: new Date('2026-07-21'),
    });
    prismaMock.dynamicQr.findUnique.mockResolvedValue(null);
    prismaMock.dynamicQr.create.mockResolvedValue({});
  });

  it('creates an offer with valid data', async () => {
    const result = await createOffer({
      storeId: 'test-store',
      name: 'Summer Sale',
      discount: 20,
      userId: 'test-user',
    });

    expect(result.status).toBe('ok');
    expect(result.output?.executionState).toBe(EXECUTION_STATES.EXECUTED);
    expect(result.output?.offer).toBeDefined();
    expect(result.output?.offer.title).toBe('Summer Sale');
    expect(prismaMock.storeOffer.create).toHaveBeenCalledOnce();
  });

  it('blocks creation without storeId', async () => {
    const result = await createOffer({
      name: 'Test Offer',
      discount: 10,
    });

    expect(result.status).toBe('blocked');
    expect(result.blocker?.code).toBe('STORE_ID_REQUIRED');
    expect(result.output?.executionState).toBe(EXECUTION_STATES.BLOCKED);
    expect(prismaMock.storeOffer.create).not.toHaveBeenCalled();
  });

  it('blocks creation with invalid discount', async () => {
    const result = await createOffer({
      storeId: 'test-store',
      name: 'Bad Discount',
      discount: 0,
    });

    expect(result.status).toBe('blocked');
    expect(result.blocker?.code).toBe('DISCOUNT_REQUIRED');
  });

  it('returns existing offer when slug already exists (idempotent)', async () => {
    prismaMock.storeOffer.findFirst.mockResolvedValue({
      id: 'existing-offer',
      slug: 'summer-sale',
      title: 'Summer Sale',
      description: null,
      priceText: '20% off',
      isActive: true,
      endsAt: null,
    });

    const result = await createOffer({
      storeId: 'test-store',
      name: 'Summer Sale',
      discount: 20,
    });

    expect(result.status).toBe('ok');
    expect(result.output?.offerId).toBe('existing-offer');
    expect(prismaMock.storeOffer.create).not.toHaveBeenCalled();
  });
});
