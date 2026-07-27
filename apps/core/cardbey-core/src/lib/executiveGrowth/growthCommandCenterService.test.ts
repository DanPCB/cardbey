import { describe, it, expect } from 'vitest';
import {
  computeLeadDataQualityScore,
  parseCsvLeads,
  validateLeadInput,
} from './growthCommandCenterService.js';

describe('growthCommandCenterService', () => {
  it('validates email and warns on missing location', () => {
    const r = validateLeadInput({
      businessName: 'Test Cafe',
      email: 'not-an-email',
      city: '',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('email'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('location'))).toBe(true);
  });

  it('scores Melbourne lead without Austin fallback', () => {
    const score = computeLeadDataQualityScore({
      businessName: 'Banh Mi Shop',
      email: 'owner@example.com',
      city: 'Melbourne',
      state: 'VIC',
      country: 'Australia',
      category: 'Food',
      consentStatus: 'granted',
    });
    expect(score).toBeGreaterThan(60);
  });

  it('parses CSV leads', () => {
    const csv = 'businessName,email,city,category\nCafe A,a@test.com,Melbourne,Food';
    const leads = parseCsvLeads(csv);
    expect(leads).toHaveLength(1);
    expect(leads[0]?.city).toBe('Melbourne');
    expect(leads[0]?.businessName).toBe('Cafe A');
  });
});
