import { describe, expect, it } from 'vitest';
import {
  LIVE_MARKET_ERROR_CODES,
  STOREFRONT_PUBLICATION_STATUS,
  evaluateRegistrationAvailability,
  toPublicRegistrationDto,
  toPublicLiveSessionDto,
} from './domain.js';

function baseSession(overrides = {}) {
  return {
    id: 'sess_1',
    storeId: 'store_1',
    title: 'Demo',
    description: null,
    sourceLanguage: 'vi',
    viewerLanguages: ['vi', 'en'],
    scheduledStartAt: new Date(Date.now() + 86400000),
    startedAt: null,
    endedAt: null,
    state: 'SCHEDULED',
    storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.PUBLISHED,
    ...overrides,
  };
}

describe('evaluateRegistrationAvailability', () => {
  it('rejects when feature disabled', () => {
    const r = evaluateRegistrationAvailability(baseSession(), {
      registrationFeatureEnabled: false,
      enrollmentState: 'ACTIVE',
    });
    expect(r.available).toBe(false);
    expect(r.code).toBe(LIVE_MARKET_ERROR_CODES.LIVE_REGISTRATION_DISABLED);
  });

  it('accepts published upcoming session', () => {
    const r = evaluateRegistrationAvailability(baseSession(), {
      registrationFeatureEnabled: true,
      enrollmentState: 'ACTIVE',
    });
    expect(r.available).toBe(true);
  });

  it('accepts waiting-for-host', () => {
    const r = evaluateRegistrationAvailability(
      baseSession({ scheduledStartAt: new Date(Date.now() - 60_000) }),
      { registrationFeatureEnabled: true, enrollmentState: 'ACTIVE' },
    );
    expect(r.available).toBe(true);
  });

  it('rejects withdrawn / cancelled / ended', () => {
    expect(
      evaluateRegistrationAvailability(
        baseSession({ storefrontPublicationStatus: STOREFRONT_PUBLICATION_STATUS.WITHDRAWN }),
        { registrationFeatureEnabled: true, enrollmentState: 'ACTIVE' },
      ).available,
    ).toBe(false);
    expect(
      evaluateRegistrationAvailability(baseSession({ state: 'CANCELLED' }), {
        registrationFeatureEnabled: true,
        enrollmentState: 'ACTIVE',
      }).available,
    ).toBe(false);
    expect(
      evaluateRegistrationAvailability(baseSession({ state: 'ENDED', endedAt: new Date() }), {
        registrationFeatureEnabled: true,
        enrollmentState: 'ACTIVE',
      }).available,
    ).toBe(false);
  });
});

describe('toPublicRegistrationDto / public session registration block', () => {
  it('never includes other participant identities', () => {
    const block = toPublicRegistrationDto({
      available: true,
      currentUserStatus: 'REGISTERED',
    });
    expect(block).toEqual({
      available: true,
      requiresAuthentication: true,
      currentUserStatus: 'REGISTERED',
    });
    const dto = toPublicLiveSessionDto(baseSession(), {
      enrollmentState: 'ACTIVE',
      registration: block,
      subjects: [],
    });
    expect(dto.registration).toEqual(block);
    expect(JSON.stringify(dto)).not.toMatch(/email|questionForHost|userId/i);
  });

  it('omits currentUserStatus for anonymous', () => {
    const block = toPublicRegistrationDto({ available: true });
    expect(block.currentUserStatus).toBeUndefined();
  });
});
