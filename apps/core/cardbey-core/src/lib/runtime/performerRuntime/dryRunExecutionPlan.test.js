import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  dryRunExecutionPlan,
  validateDryRunIntent,
  resolveCapabilityAvailability,
} from './dryRunExecutionPlan.js';
import { executeRuntimeAction } from './executeRuntimeAction.js';

vi.mock('../../telemetry/healthProbes.js', () => ({
  emitHealthProbe: vi.fn(),
}));

vi.mock('./executeRuntimeAction.js', () => ({
  executeRuntimeAction: vi.fn(),
}));

import { emitHealthProbe } from '../../telemetry/healthProbes.js';

const baseIntent = {
  intentId: 'exec-intent:m1:update_product_catalog:next_step_chip',
  missionId: 'm1',
  actionType: 'update_product_catalog',
  goal: 'Update catalog',
  source: 'next_step_chip',
  prerequisites: [{ key: 'generation_run', satisfied: true }],
  capabilityHints: [],
  createdAt: 1,
};

const basePlan = {
  planId: 'exec-plan:exec-intent:m1:update_product_catalog:next_step_chip',
  intentId: baseIntent.intentId,
  missionId: 'm1',
  actionType: 'update_product_catalog',
  status: 'ready',
  steps: [
    {
      stepId: 'replace_catalog-0',
      capabilityId: 'replace_catalog',
      kind: 'client_action',
      order: 0,
      tool: 'replace_store_catalog',
    },
  ],
};

describe('dryRunExecutionPlan', () => {
  const prevTelemetry = process.env.BROKER_EXECUTION_TELEMETRY;

  beforeEach(() => {
    process.env.BROKER_EXECUTION_TELEMETRY = 'true';
    vi.mocked(emitHealthProbe).mockClear();
    vi.mocked(executeRuntimeAction).mockClear();
  });

  afterEach(() => {
    if (prevTelemetry === undefined) delete process.env.BROKER_EXECUTION_TELEMETRY;
    else process.env.BROKER_EXECUTION_TELEMETRY = prevTelemetry;
  });

  it('rejects invalid intent', async () => {
    const result = await dryRunExecutionPlan({
      missionId: 'm1',
      intent: { missionId: 'm1' },
      plan: basePlan,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('intent_id_required');
    expect(executeRuntimeAction).not.toHaveBeenCalled();
  });

  it('validates known capabilities via broker registry', () => {
    const resolved = resolveCapabilityAvailability('replace_catalog', 'replace_store_catalog');
    expect(resolved.supported).toBe(true);
    expect(resolved.tool).toBe('replace_store_catalog');
  });

  it('returns missing capabilities for unknown capability ids', async () => {
    const plan = {
      ...basePlan,
      steps: [{ stepId: 'x-0', capabilityId: 'totally_unknown_cap', kind: 'client_action', order: 0 }],
    };
    const result = await dryRunExecutionPlan({
      missionId: 'm1',
      intent: baseIntent,
      plan,
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe('blocked');
    expect(result.missingCapabilities).toEqual(
      expect.arrayContaining([expect.objectContaining({ capabilityId: 'totally_unknown_cap' })]),
    );
  });

  it('records dry-run telemetry and never executes real action', async () => {
    const result = await dryRunExecutionPlan({
      missionId: 'm1',
      intent: baseIntent,
      plan: basePlan,
    });
    expect(result.ok).toBe(true);
    expect(result.executionId).toBeTruthy();
    expect(result.telemetry?.mode).toBe('dry_run');
    expect(emitHealthProbe).toHaveBeenCalledWith(
      'broker.execution',
      expect.objectContaining({
        source: 'performer_runtime_dry_run',
        intentId: baseIntent.intentId,
      }),
    );
    expect(executeRuntimeAction).not.toHaveBeenCalled();
  });

  it('maps blocked prerequisites from intent', async () => {
    const intent = {
      ...baseIntent,
      actionType: 'connect_custom_domain',
      prerequisites: [{ key: 'draft', satisfied: false }],
    };
    const plan = {
      ...basePlan,
      actionType: 'connect_custom_domain',
      status: 'blocked',
      blockedBy: ['draft'],
      steps: [
        { stepId: 'p-0', capabilityId: 'publish_store', kind: 'client_action', order: 0 },
        { stepId: 'd-1', capabilityId: 'connect_domain', kind: 'client_action', order: 1 },
      ],
    };
    const result = await dryRunExecutionPlan({ missionId: 'm1', intent, plan });
    expect(result.status).toBe('blocked');
    expect(result.blockedPrerequisites).toContain('draft');
  });

  it('unsupported plan status returns unsupported', async () => {
    const result = await dryRunExecutionPlan({
      missionId: 'm1',
      intent: baseIntent,
      plan: { ...basePlan, status: 'unsupported', steps: [] },
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe('unsupported');
    expect(validateDryRunIntent({ actionType: 'bad', intentId: 'i', missionId: 'm1' }).ok).toBe(false);
  });

  it('blocks publish_offer when latest offer draft is not approved', async () => {
    const intent = {
      ...baseIntent,
      actionType: 'launch_first_offer',
    };
    const plan = {
      ...basePlan,
      actionType: 'launch_first_offer',
      steps: [
        { stepId: 'pub-0', capabilityId: 'publish_offer', kind: 'client_action', order: 0 },
      ],
    };
    const result = await dryRunExecutionPlan({
      missionId: 'm1',
      intent,
      plan,
      executionRecords: [
        {
          capabilityId: 'create_offer_draft',
          offerDraft: { status: 'approved', versionNumber: 1 },
        },
        {
          capabilityId: 'revise_offer_draft',
          offerDraft: { status: 'review_required', versionNumber: 2 },
        },
      ],
    });
    expect(result.status).toBe('blocked');
    expect(result.blockedPrerequisites).toContain('offer_draft_approved');
    expect(result.missingCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: 'publish_offer',
          blockReason: 'offer_draft_not_approved',
        }),
      ]),
    );
  });

  it('does not block publish_offer on review when latest offer draft is approved', async () => {
    const intent = {
      ...baseIntent,
      actionType: 'launch_first_offer',
    };
    const plan = {
      ...basePlan,
      actionType: 'launch_first_offer',
      steps: [
        { stepId: 'pub-0', capabilityId: 'publish_offer', kind: 'client_action', order: 0 },
      ],
    };
    const result = await dryRunExecutionPlan({
      missionId: 'm1',
      intent,
      plan,
      reviewContext: { offerDraftStatus: 'approved' },
    });
    expect(result.blockedPrerequisites ?? []).not.toContain('offer_draft_approved');
    const publishEntry = result.missingCapabilities?.find((c) => c.capabilityId === 'publish_offer');
    expect(publishEntry?.blockReason).not.toBe('offer_draft_not_approved');
  });
});
