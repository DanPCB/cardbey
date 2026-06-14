import { describe, it, expect } from 'vitest';
import {
  formatStoreLocation,
  formatStoreLocationLong,
  hasCanonicalStoreAddress,
  extractLocalityFromAddress,
} from './formatStoreLocation.js';

describe('formatStoreLocation', () => {
  it('prefers suburb over address parsing', () => {
    expect(
      formatStoreLocation({
        suburb: 'Braybrook',
        state: 'VIC',
        address: '123 Main St, Melbourne VIC 3019',
      }),
    ).toBe('Braybrook, VIC');
  });

  it('returns null when no address fields exist', () => {
    expect(formatStoreLocation({ name: 'Online Shop' })).toBeNull();
    expect(hasCanonicalStoreAddress({})).toBe(false);
  });

  it('does not invent a city from business name', () => {
    expect(formatStoreLocation({ name: 'BrayBrook Bakery' })).toBeNull();
  });

  it('formats long label with country', () => {
    expect(
      formatStoreLocationLong({
        suburb: 'Braybrook',
        state: 'VIC',
        country: 'Australia',
      }),
    ).toBe('Braybrook, VIC, Australia');
  });

  it('extracts locality from address line when suburb missing', () => {
    expect(extractLocalityFromAddress('45 Collins St, Melbourne VIC 3000')).toBe('45 Collins St');
  });
});
