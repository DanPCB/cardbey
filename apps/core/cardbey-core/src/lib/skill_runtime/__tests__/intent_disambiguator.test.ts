import { describe, it, expect, beforeEach } from 'vitest';
import { IntentDisambiguator } from '../intent_disambiguator.js';
import {
  setupLoyaltyProgramPattern,
  createPromotionPattern,
  LOYALTY_INTENT,
  PROMOTION_INTENT,
} from '../patterns.js';
import type { SkillContext } from '../types.js';

function ctx(query: string, overrides: Partial<SkillContext> = {}): SkillContext {
  return {
    query,
    userId: 'user_1',
    conversationId: 'conv_1',
    userHasProducts: true,
    metadata: {},
    ...overrides,
  };
}

describe('IntentDisambiguator', () => {
  let d: IntentDisambiguator;

  beforeEach(() => {
    d = new IntentDisambiguator();
    d.register(setupLoyaltyProgramPattern);
    d.register(createPromotionPattern);
  });

  it('resolves "Setup a loyalty campaign" to loyalty, not promotion', async () => {
    const resolved = await d.resolve(ctx('Setup a loyalty campaign with step-by-step rollout'));
    expect(resolved?.intent).toBe(LOYALTY_INTENT);
  });

  it('resolves "Create a 20% discount" to promotion, not loyalty', async () => {
    const resolved = await d.resolve(ctx('Create a 20% discount on all products'));
    expect(resolved?.intent).toBe(PROMOTION_INTENT);
  });

  it('returns null when nothing clears required confidence', async () => {
    const resolved = await d.resolve(ctx('what is the weather today', { userHasProducts: false }));
    expect(resolved).toBeNull();
  });

  it('breaks confidence ties by priority (loyalty 8 > promotion 7)', async () => {
    // Tie-only pattern set: two equal-confidence patterns, different priorities.
    const tie = new IntentDisambiguator();
    tie.register({
      intent: 'low_priority',
      priority: 3,
      requiredConfidence: 0.5,
      matches: async () => 0.9,
    });
    tie.register({
      intent: 'high_priority',
      priority: 9,
      requiredConfidence: 0.5,
      matches: async () => 0.9,
    });
    const resolved = await tie.resolve(ctx('anything'));
    expect(resolved?.intent).toBe('high_priority');
  });

  it('treats a thrown matcher as zero confidence rather than failing', async () => {
    const safe = new IntentDisambiguator();
    safe.register({
      intent: 'explodes',
      priority: 5,
      requiredConfidence: 0.5,
      matches: async () => { throw new Error('matcher bug'); },
    });
    safe.register({
      intent: 'works',
      priority: 5,
      requiredConfidence: 0.5,
      matches: async () => 0.8,
    });
    const resolved = await safe.resolve(ctx('x'));
    expect(resolved?.intent).toBe('works');
  });

  it('applies the default required confidence (0.7) when omitted', async () => {
    const dd = new IntentDisambiguator();
    dd.register({ intent: 'borderline', priority: 1, matches: async () => 0.65 });
    expect(await dd.resolve(ctx('x'))).toBeNull();
    const dd2 = new IntentDisambiguator();
    dd2.register({ intent: 'clears', priority: 1, matches: async () => 0.71 });
    expect((await dd2.resolve(ctx('x')))?.intent).toBe('clears');
  });

  it('rejects duplicate intent registration', () => {
    expect(() => d.register(setupLoyaltyProgramPattern)).toThrow(/Duplicate intent/);
  });

  it('clamps scores above 1 and exposes diagnostics via score()', async () => {
    const scores = await d.score(ctx('loyalty rewards points tier member', { existingSegments: ['vip'] }));
    const loyalty = scores.find((s) => s.intent === LOYALTY_INTENT)!;
    expect(loyalty.confidence).toBeLessThanOrEqual(1);
    expect(loyalty.eligible).toBe(true);
  });
});
