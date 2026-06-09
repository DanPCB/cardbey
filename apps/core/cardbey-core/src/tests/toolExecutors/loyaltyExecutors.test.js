// DANH: skill-round4-loyalty
import { describe, it, expect } from 'vitest';
import {
  segmentLoyalCustomersFromBookings,
  execute as segmentLoyalCustomers,
} from '../../lib/toolExecutors/loyalty/segment_loyal_customers.js';
import {
  buildLoyaltyTiers,
  execute as defineLoyaltyTiers,
} from '../../lib/toolExecutors/loyalty/define_loyalty_tiers.js';
import {
  buildLoyaltyOffers,
  execute as createLoyaltyOffer,
} from '../../lib/toolExecutors/loyalty/create_loyalty_offer.js';
import { execute as scheduleLoyaltyCampaign } from '../../lib/toolExecutors/loyalty/schedule_loyalty_campaign.js';

describe('loyalty executors', () => {
  it('segment returns ok with honest stub when no repeat bookings', () => {
    const { loyalCustomers, customerCount } = segmentLoyalCustomersFromBookings([
      { customerEmail: 'a@test.com' },
      { customerEmail: 'b@test.com' },
    ]);
    expect(customerCount).toBe(0);
    expect(loyalCustomers).toEqual([]);
  });

  it('segment finds repeat customers', () => {
    const { customerCount, loyalCustomers } = segmentLoyalCustomersFromBookings([
      { customerEmail: 'repeat@test.com' },
      { customerEmail: 'repeat@test.com' },
    ]);
    expect(customerCount).toBe(1);
    expect(loyalCustomers[0]?.bookingCount).toBe(2);
  });

  it('segment_loyal_customers does not throw on empty input', async () => {
    await expect(segmentLoyalCustomers({})).resolves.toMatchObject({
      status: 'failed',
    });
  });

  it('define_loyalty_tiers returns tier structure', async () => {
    expect(buildLoyaltyTiers(5)).toHaveLength(2);
    expect(buildLoyaltyTiers(25)).toHaveLength(3);
    expect(buildLoyaltyTiers(100)).toHaveLength(4);
    const result = await defineLoyaltyTiers({ customerCount: 25 });
    expect(result.status).toBe('ok');
    expect(result.output.tiers.length).toBe(3);
  });

  it('create_loyalty_offer generates copy per tier', async () => {
    const offers = buildLoyaltyOffers(
      [{ name: 'Gold', minPoints: 100, reward: '15% off' }],
      'beauty',
    );
    expect(offers[0]?.headline).toContain('Gold');
    const result = await createLoyaltyOffer({
      tiers: [{ name: 'Silver', minPoints: 50, reward: '10% off' }],
      businessCategory: 'cafe',
    });
    expect(result.status).toBe('ok');
    expect(result.output.offers.length).toBe(1);
  });

  it('schedule_loyalty_campaign returns schema gap stub', async () => {
    const result = await scheduleLoyaltyCampaign({
      storeId: 'store-1',
      offers: [{ headline: 'Join loyalty', rewardDescription: 'Save more' }],
    });
    expect(result.status).toBe('ok');
    expect(result.output.scheduled).toBe(false);
    expect(result.output.persisted).toBe(false);
    expect(result.output.reason).toBe('schema gap');
  });

  it('schedule does not throw without offers', async () => {
    const result = await scheduleLoyaltyCampaign({ storeId: 's1', offers: [] });
    expect(result.status).toBe('ok');
  });

  it('segment returns ok stub when prisma booking query fails', async () => {
    const result = await segmentLoyalCustomers({ storeId: 'store-readonly-test' });
    expect(result.status).toBe('ok');
    expect(result.output).toHaveProperty('customerCount');
  });
});
