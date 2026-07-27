import { describe, expect, it } from 'vitest';
import { isGuestRateLimitExemptRequest } from './guestAuth.js';

describe('isGuestRateLimitExemptRequest', () => {
  it('exempts read-only mission hydration GETs', () => {
    expect(
      isGuestRateLimitExemptRequest({ method: 'GET', path: '/cmr7t9ur200p9nzaxje98e90y/state' }),
    ).toBe(true);
    expect(
      isGuestRateLimitExemptRequest({ method: 'GET', path: '/m1/recovery-state' }),
    ).toBe(true);
    expect(
      isGuestRateLimitExemptRequest({ method: 'GET', path: '/m1/blackboard' }),
    ).toBe(true);
    expect(
      isGuestRateLimitExemptRequest({
        method: 'GET',
        path: '/state',
        originalUrl: '/api/missions/m1/state',
      }),
    ).toBe(true);
  });

  it('does not exempt mutating or unrelated routes', () => {
    expect(
      isGuestRateLimitExemptRequest({ method: 'POST', path: '/m1/state' }),
    ).toBe(false);
    expect(
      isGuestRateLimitExemptRequest({ method: 'GET', path: '/m1/approve' }),
    ).toBe(false);
  });

  it('exempts Performer intake v2 POST (guest draft-store runway)', () => {
    expect(
      isGuestRateLimitExemptRequest({ method: 'POST', path: '/intake/v2' }),
    ).toBe(true);
    expect(
      isGuestRateLimitExemptRequest({
        method: 'POST',
        path: '/v2',
        originalUrl: '/api/performer/intake/v2',
      }),
    ).toBe(true);
  });
});
