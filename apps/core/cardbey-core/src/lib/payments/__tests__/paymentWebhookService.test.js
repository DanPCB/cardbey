import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { handleStripeWebhook } from '../paymentWebhookService.js';

vi.mock('../stripeClient.js', () => ({
  loadStripeClient: vi.fn(),
}));

vi.mock('../paymentIntentService.js', () => ({
  updatePaymentStatus: vi.fn(),
}));

vi.mock('../../storeActivity/storeActivityHooks.js', () => ({
  emitCustomerInquiryActivity: vi.fn(),
}));

vi.mock('../../prisma.js', () => ({
  getPrismaClient: vi.fn(() => ({
    payment: { findUnique: vi.fn(), findFirst: vi.fn() },
    booking: { update: vi.fn() },
  })),
}));

import { loadStripeClient } from '../stripeClient.js';

describe('paymentWebhookService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  });

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it('rejects invalid webhook signature', async () => {
    loadStripeClient.mockResolvedValue({
      webhooks: {
        constructEvent: () => {
          throw new Error('No signatures found matching the expected signature');
        },
      },
    });

    await expect(
      handleStripeWebhook(Buffer.from('{}'), 'bad-signature'),
    ).rejects.toMatchObject({ code: 'INVALID_SIGNATURE' });
  });
});
