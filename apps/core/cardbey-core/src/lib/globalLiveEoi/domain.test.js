import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Features } from '../../config/features.js';
import {
  DEFAULT_GLOBAL_LIVE_EOI_PILOT_ID,
  GLOBAL_LIVE_EOI_PILOTS,
  GlobalLiveEoiSubmitSchema,
  isValidBusinessUrl,
  normalizeEmail,
  normalizePhone,
  resolvePilot,
  sanitizeText,
} from './domain.js';

const FLAG_KEYS = ['ENABLE_GLOBAL_LIVE_EOI_V1', 'GLOBAL_LIVE_EOI_OPEN'];

describe('globalLiveEoi domain', () => {
  const backup = {};

  beforeEach(() => {
    for (const k of FLAG_KEYS) backup[k] = process.env[k];
    delete process.env.ENABLE_GLOBAL_LIVE_EOI_V1;
    delete process.env.GLOBAL_LIVE_EOI_OPEN;
  });

  afterEach(() => {
    for (const k of FLAG_KEYS) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
  });

  it('flags default OFF', () => {
    expect(Features.globalLiveEoi.v1).toBe(false);
    expect(Features.globalLiveEoi.open).toBe(false);
  });

  it('open requires master + GLOBAL_LIVE_EOI_OPEN', () => {
    process.env.GLOBAL_LIVE_EOI_OPEN = 'true';
    expect(Features.globalLiveEoi.open).toBe(false);
    process.env.ENABLE_GLOBAL_LIVE_EOI_V1 = 'true';
    expect(Features.globalLiveEoi.v1).toBe(true);
    expect(Features.globalLiveEoi.open).toBe(true);
  });

  it('resolves default pilot and rejects unknown', () => {
    const def = resolvePilot(undefined);
    expect(def.id).toBe(DEFAULT_GLOBAL_LIVE_EOI_PILOT_ID);
    expect(def.pilot).toEqual(GLOBAL_LIVE_EOI_PILOTS.vn_au_global_live_v1);
    expect(resolvePilot('nope').pilot).toBeNull();
  });

  it('normalizes email/phone and sanitizes text', () => {
    expect(normalizeEmail('  A@B.COM ')).toBe('a@b.com');
    expect(normalizePhone('+84 912-345-678')).toBe('+84912345678');
    expect(normalizePhone('(02) 1234 5678')).toBe('0212345678');
    expect(sanitizeText('hi\u0000there', 100)).toBe('hithere');
  });

  it('validates business URLs loosely', () => {
    expect(isValidBusinessUrl('')).toBe(true);
    expect(isValidBusinessUrl(null)).toBe(true);
    expect(isValidBusinessUrl('facebook.com/myshop')).toBe(true);
    expect(isValidBusinessUrl('https://zalo.me/123')).toBe(true);
    expect(isValidBusinessUrl('javascript:alert(1)')).toBe(false);
  });

  it('requires consent and showcase types', () => {
    const base = {
      name: 'Lan',
      businessName: 'Lan Cafe',
      industry: 'F&B',
      city: 'Ho Chi Minh',
      phone: '+84912345678',
      email: 'lan@example.com',
      showcaseTypes: ['products'],
      businessDescription: 'Specialty coffee',
      existingCardbeyBusiness: 'no',
      consentGranted: true,
    };
    expect(GlobalLiveEoiSubmitSchema.safeParse(base).success).toBe(true);
    expect(
      GlobalLiveEoiSubmitSchema.safeParse({ ...base, consentGranted: false }).success,
    ).toBe(false);
    expect(
      GlobalLiveEoiSubmitSchema.safeParse({ ...base, showcaseTypes: [] }).success,
    ).toBe(false);
  });

  it('accepts pilotId in submit payload', () => {
    const parsed = GlobalLiveEoiSubmitSchema.safeParse({
      pilotId: 'vn_au_global_live_v1',
      name: 'Lan',
      businessName: 'Lan Cafe',
      industry: 'F&B',
      city: 'Da Nang',
      phone: '+84911111111',
      email: 'lan2@example.com',
      showcaseTypes: ['services', 'promotion_offer'],
      businessDescription: 'Cafe',
      existingCardbeyBusiness: 'not_sure',
      consentGranted: true,
      utmSource: 'facebook',
      utmMedium: 'social',
      utmCampaign: 'global_live_v1',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.pilotId).toBe('vn_au_global_live_v1');
    expect(parsed.data.utmCampaign).toBe('global_live_v1');
  });
});
