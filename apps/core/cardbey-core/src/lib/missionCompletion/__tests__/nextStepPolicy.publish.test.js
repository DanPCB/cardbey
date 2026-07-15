import { describe, expect, it } from 'vitest';
import { evaluateNextStepPolicy } from '../nextStepPolicy.js';

describe('nextStepPolicy publish_store', () => {
  it('offers Publish my store when only draftId exists', () => {
    const steps = evaluateNextStepPolicy(
      {
        hasLogo: true,
        logoSkipped: false,
        hasCustomHero: true,
        storeId: null,
        draftId: 'draft-abc',
        hasRealProducts: false,
        isPublished: false,
        hasCustomDomain: false,
        completedActions: [],
      },
      3,
    );
    expect(steps.some((s) => s.tool === 'publish_store')).toBe(true);
  });

  it('does not offer publish when already published', () => {
    const steps = evaluateNextStepPolicy(
      {
        hasLogo: true,
        logoSkipped: false,
        hasCustomHero: true,
        storeId: 'store-1',
        draftId: 'draft-abc',
        hasRealProducts: true,
        isPublished: true,
        hasCustomDomain: false,
        completedActions: [],
      },
      3,
    );
    expect(steps.some((s) => s.tool === 'publish_store')).toBe(false);
  });
});
