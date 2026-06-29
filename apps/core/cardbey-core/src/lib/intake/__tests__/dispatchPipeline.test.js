import { describe, expect, it } from 'vitest';
import { normalizeDispatchIntent, resolveExecutablePlanStep } from '../dispatchPipeline.js';
import { planAction } from '../dispatchPlanAction.js';
import { reasonAboutDispatch } from '../dispatchReasoningEngine.js';
import { selectDispatchCapability } from '../dispatchCapabilityRegistry.js';

describe('dispatchPipeline helpers', () => {
  it('normalizes dashboard action shape', () => {
    const intent = normalizeDispatchIntent(
      {
        type: 'publish_store',
        payload: { draftId: 'draft-1' },
        storeId: 'store-1',
        requireConfirmation: true,
      },
      { confirmed: true, source: 'store_draft_review' },
    );

    expect(intent.type).toBe('publish_store');
    expect(intent.storeId).toBe('store-1');
    expect(intent.parameters.draftId).toBe('draft-1');
    expect(intent.source).toBe('store_draft_review');
  });

  it('resolves executable plan step skipping advisory rows', () => {
    const step = resolveExecutablePlanStep({
      steps: [
        { action: 'analyze_engagement', executable: false },
        { action: 'launch_campaign', executable: true },
      ],
    });
    expect(step?.action).toBe('launch_campaign');
  });

  it('plans memory pre-step for low engagement launch', async () => {
    const plan = await planAction({
      intentType: 'launch_campaign',
      storeId: 'store-1',
      memoryBundle: { business: { learnedSignals: ['low_engagement'] } },
    });
    expect(plan.steps[0].action).toBe('analyze_engagement');
    expect(selectDispatchCapability('launch_campaign').channel).toBe('performer_intake');
    const reasoning = reasonAboutDispatch('launch_campaign', null, {
      requiresConfirmation: true,
      proposedAction: 'launch_campaign',
    });
    expect(reasoning.requiresConfirmation).toBe(true);
  });
});
