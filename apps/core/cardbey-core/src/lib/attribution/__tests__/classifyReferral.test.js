import { describe, it, expect } from 'vitest';
import { classifyReferral, ReferralClass } from '../classifyReferral.js';

describe('classifyReferral', () => {
  it('classifies Perplexity referrer as AI_SEARCH', () => {
    const r = classifyReferral('https://www.perplexity.ai/search/foo', null, null);
    expect(r.referralClass).toBe(ReferralClass.AI_SEARCH);
    expect(r.aiEngine).toBe('perplexity');
  });

  it('classifies ChatGPT referrer as AI_SEARCH', () => {
    const r = classifyReferral('https://chatgpt.com/', null, null);
    expect(r.referralClass).toBe(ReferralClass.AI_SEARCH);
    expect(r.aiEngine).toBe('chatgpt');
  });

  it('classifies utm_source=ai as AI_SEARCH', () => {
    const r = classifyReferral(null, 'ai', 'referral');
    expect(r.referralClass).toBe(ReferralClass.AI_SEARCH);
  });

  it('classifies no referrer as DIRECT', () => {
    const r = classifyReferral(null, null, null);
    expect(r.referralClass).toBe(ReferralClass.DIRECT);
  });

  it('classifies Google referrer as ORGANIC_SEARCH', () => {
    const r = classifyReferral('https://www.google.com/', null, null);
    expect(r.referralClass).toBe(ReferralClass.ORGANIC_SEARCH);
  });

  it('classifies cardbey.com as CARDBEY_INTERNAL', () => {
    const r = classifyReferral('https://cardbey.com/s/demo', null, null);
    expect(r.referralClass).toBe(ReferralClass.CARDBEY_INTERNAL);
  });
});
