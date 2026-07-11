/**
 * Tests for campaign / loyalty compiler-spine helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  isCompilerSpineIntake,
  isCampaignOrLoyaltyMessage,
  generateCampaignNameFromContext,
  normalizeRewardType,
} from '../campaignPlanHelpers.js';

describe('campaignPlanHelpers', () => {
  it('detects campaign and loyalty user messages', () => {
    expect(isCampaignOrLoyaltyMessage('Create a loyalty campaign')).toBe(true);
    expect(isCampaignOrLoyaltyMessage('Open a beauty store')).toBe(false);
  });

  it('treats compiler-spine classification as spine intake', () => {
    expect(
      isCompilerSpineIntake({ _compilerEligible: true }, 'anything'),
    ).toBe(true);
    expect(
      isCompilerSpineIntake({ tool: 'create_campaign' }, 'hello'),
    ).toBe(true);
    expect(
      isCompilerSpineIntake({}, 'Create a loyalty campaign'),
    ).toBe(true);
  });

  it('generates concrete campaign names without placeholders', () => {
    const name = generateCampaignNameFromContext('Create loyalty program for Glow Beauty', {
      storeName: 'Glow Beauty',
    });
    expect(name).toContain('GlowBeauty');
    expect(name).toContain('Loyalty');
    expect(name).not.toBe('Loyalty Campaign Name');
  });

  it('normalizes reward type from user message', () => {
    const points = normalizeRewardType({ type: 'DISCOUNT', value: 20 }, 'earn points');
    expect(points.type).toBe('POINTS');
    expect(points.value).toBe(20);

    const discount = normalizeRewardType({ type: 'POINTS', value: 15 }, '10% discount');
    expect(discount.type).toBe('DISCOUNT');
    expect(discount.value).toBe(15);
  });
});
