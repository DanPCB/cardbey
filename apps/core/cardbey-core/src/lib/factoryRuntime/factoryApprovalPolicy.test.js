import { describe, it, expect } from 'vitest';
import { mergeApprovedPlanIntoState, resolvePlanFromState } from './factoryApprovalPolicy.js';

describe('factoryApprovalPolicy', () => {
  it('replace_plan merges at planOutputPath', () => {
    const state = {
      stageOutputs: {
        video_plan: { videoPlan: { script: 'old' } },
      },
    };
    const definition = {
      approvalPolicy: {
        planOutputPath: 'stageOutputs.video_plan.videoPlan',
        mergeStrategy: 'replace_plan',
      },
    };
    const next = mergeApprovedPlanIntoState(state, definition, { script: 'new', scenes: [] });
    expect(resolvePlanFromState(next, definition)?.script).toBe('new');
  });

  it('shallow_merge_plan preserves existing keys', () => {
    const state = {
      stageOutputs: {
        create_offer_draft: { offerDraft: { title: 'Offer', cta: 'Go' } },
      },
    };
    const definition = {
      approvalPolicy: {
        planOutputPath: 'stageOutputs.create_offer_draft.offerDraft',
        mergeStrategy: 'shallow_merge_plan',
      },
    };
    const next = mergeApprovedPlanIntoState(state, definition, { offerCopy: 'Updated copy' });
    const plan = resolvePlanFromState(next, definition);
    expect(plan?.title).toBe('Offer');
    expect(plan?.offerCopy).toBe('Updated copy');
  });
});
