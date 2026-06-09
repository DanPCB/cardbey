import { describe, it, expect, beforeEach } from 'vitest';
import { SkillRegistry } from '../registry.js';
import { SkillRuntime } from '../skill.js';
import { InMemoryCheckpointStore } from '../checkpoint_store.js';
import {
  setupLoyaltyProgramPattern,
  createPromotionPattern,
  LOYALTY_INTENT,
  PROMOTION_INTENT,
} from '../patterns.js';
import type { SkillContext, Step } from '../types.js';

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

const loyaltySteps = (): Step[] => [{ id: 'l1', name: 'tiers', execute: async () => ({}) }];
const promoSteps = (): Step[] => [{ id: 'p1', name: 'offer', execute: async () => ({}) }];

describe('SkillRegistry', () => {
  let registry: SkillRegistry;
  let store: InMemoryCheckpointStore;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
    registry = new SkillRegistry();
    registry.register({
      intent: LOYALTY_INTENT,
      patterns: [setupLoyaltyProgramPattern],
      factory: (c) => new SkillRuntime(`loyalty:${c.conversationId}`, LOYALTY_INTENT, loyaltySteps(), c, { store }),
    });
    registry.register({
      intent: PROMOTION_INTENT,
      patterns: [createPromotionPattern],
      factory: (c) => new SkillRuntime(`promo:${c.conversationId}`, PROMOTION_INTENT, promoSteps(), c, { store }),
    });
  });

  it('dispatches a loyalty query to the loyalty skill', async () => {
    const skill = await registry.dispatch(ctx('Setup a loyalty campaign with step-by-step rollout'));
    expect(skill).not.toBeNull();
    expect(skill!.intent).toBe(LOYALTY_INTENT);
  });

  it('dispatches a discount query to the promotion skill', async () => {
    const skill = await registry.dispatch(ctx('Create a 20% discount on everything'));
    expect(skill).not.toBeNull();
    expect(skill!.intent).toBe(PROMOTION_INTENT);
  });

  it('returns null when no intent matches', async () => {
    const skill = await registry.dispatch(ctx('tell me a joke', { userHasProducts: false }));
    expect(skill).toBeNull();
  });

  it('built skill is runnable end-to-end and persists a checkpoint', async () => {
    const skill = await registry.dispatch(ctx('Setup a loyalty rewards program'));
    await skill!.start();
    expect(skill!.getState()).toBe('completed');
    const persisted = await store.list(skill!.id);
    expect(persisted[0].intent).toBe(LOYALTY_INTENT);
  });

  it('rejects duplicate skill intents', () => {
    expect(() =>
      registry.register({
        intent: LOYALTY_INTENT,
        patterns: [],
        factory: (c) => new SkillRuntime('x', LOYALTY_INTENT, [], c),
      })
    ).toThrow(/Duplicate skill intent/);
  });

  it('has() and get() expose registered skills', () => {
    expect(registry.has(LOYALTY_INTENT)).toBe(true);
    expect(registry.get(PROMOTION_INTENT)?.intent).toBe(PROMOTION_INTENT);
    expect(registry.has('nope')).toBe(false);
  });
});
