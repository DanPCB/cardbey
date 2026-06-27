/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  findDuplicateStoreForUser,
  normalizeStoreNameForDuplicateCheck,
} from '../storeDuplicateDetection.js';

describe('storeDuplicateDetection', () => {
  it('normalizes names for punctuation and spacing', () => {
    expect(normalizeStoreNameForDuplicateCheck('  ABC   Bakery! ')).toBe('abc bakery');
    expect(normalizeStoreNameForDuplicateCheck('ABC-Bakery')).toBe('abc bakery');
  });

  it('finds duplicate by normalized name for same user', async () => {
    const prisma = {
      business: {
        findMany: async () => [
          { id: 'store-1', name: 'ABC Bakery', city: 'Melbourne', suburb: null, region: null, formattedAddress: null },
        ],
      },
    };
    const dup = await findDuplicateStoreForUser(prisma, {
      userId: 'user-1',
      businessName: 'abc  bakery',
      location: 'Melbourne',
    });
    expect(dup?.id).toBe('store-1');
  });

  it('returns null when name differs', async () => {
    const prisma = {
      business: {
        findMany: async () => [
          { id: 'store-1', name: 'Golden Nails', city: null, suburb: null, region: null, formattedAddress: null },
        ],
      },
    };
    const dup = await findDuplicateStoreForUser(prisma, {
      userId: 'user-1',
      businessName: 'ABC Bakery',
    });
    expect(dup).toBeNull();
  });
});
