import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import performerRuntimeRoutes from '../performerRuntimeRoutes.js';
import { executeRuntimeAction } from '../../lib/runtime/performerRuntime/executeRuntimeAction.js';

vi.mock('../../lib/runtime/performerRuntime/executeRuntimeAction.js', () => ({
  executeRuntimeAction: vi.fn(),
}));

vi.mock('../../lib/telemetry/healthProbes.js', () => ({
  emitHealthProbe: vi.fn(),
}));

function appWithRuntime() {
  const app = express();
  app.use(express.json());
  app.use('/api/performer/runtime', performerRuntimeRoutes);
  return app;
}

const validBody = {
  missionId: 'mission-dry-1',
  intent: {
    intentId: 'exec-intent:mission-dry-1:review_store_performance:next_step_chip',
    missionId: 'mission-dry-1',
    actionType: 'review_store_performance',
    goal: 'Analyze',
    source: 'next_step_chip',
    prerequisites: [
      { key: 'store', satisfied: true },
      { key: 'auth', satisfied: true },
    ],
    capabilityHints: [],
    createdAt: 1,
  },
  plan: {
    planId: 'exec-plan:exec-intent:mission-dry-1:review_store_performance:next_step_chip',
    intentId: 'exec-intent:mission-dry-1:review_store_performance:next_step_chip',
    missionId: 'mission-dry-1',
    actionType: 'review_store_performance',
    status: 'ready',
    steps: [
      {
        stepId: 'analyze_store-0',
        capabilityId: 'analyze_store',
        kind: 'intake_tool',
        order: 0,
        tool: 'analyze_store',
      },
    ],
  },
};

describe('POST /api/performer/runtime/dry-run', () => {
  beforeEach(() => {
    process.env.BROKER_EXECUTION_TELEMETRY = 'true';
    vi.mocked(executeRuntimeAction).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid intent', async () => {
    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/dry-run')
      .send({ missionId: 'm1', intent: {}, plan: validBody.plan });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('intent_id_required');
    expect(executeRuntimeAction).not.toHaveBeenCalled();
  });

  it('validates analyze_store capability', async () => {
    const res = await request(appWithRuntime()).post('/api/performer/runtime/dry-run').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.supportedCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capabilityId: 'analyze_store', supported: true }),
      ]),
    );
    expect(executeRuntimeAction).not.toHaveBeenCalled();
  });

  it('launch_first_offer dry-run marks offer workflow capabilities missing', async () => {
    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/dry-run')
      .send({
        missionId: 'mission-offer-1',
        intent: {
          intentId: 'exec-intent:mission-offer-1:launch_first_offer:next_step_chip',
          missionId: 'mission-offer-1',
          actionType: 'launch_first_offer',
          goal: 'Launch offer',
          source: 'next_step_chip',
          prerequisites: [
            { key: 'store', satisfied: true },
            { key: 'auth', satisfied: true },
          ],
          capabilityHints: [],
          createdAt: 1,
        },
        plan: {
          planId: 'exec-plan:launch-offer',
          intentId: 'exec-intent:mission-offer-1:launch_first_offer:next_step_chip',
          missionId: 'mission-offer-1',
          actionType: 'launch_first_offer',
          skillId: 'launch_first_offer',
          status: 'ready',
          steps: [
            { stepId: 'analyze_store-0', capabilityId: 'analyze_store', order: 0, tool: 'analyze_store' },
            { stepId: 'select_offer_products-1', capabilityId: 'select_offer_products', order: 1 },
            { stepId: 'generate_offer_copy-2', capabilityId: 'generate_offer_copy', order: 2 },
            { stepId: 'create_offer_draft-3', capabilityId: 'create_offer_draft', order: 3 },
            { stepId: 'review_offer-4', capabilityId: 'review_offer', order: 4 },
            { stepId: 'publish_offer-5', capabilityId: 'publish_offer', order: 5 },
          ],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe('blocked');
    expect(res.body.supportedCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capabilityId: 'analyze_store', supported: true }),
      ]),
    );
    const missingIds = res.body.missingCapabilities.map((c) => c.capabilityId);
    expect(missingIds).toContain('select_offer_products');
    expect(missingIds).toContain('publish_offer');
    expect(missingIds).not.toContain('create_offer_draft');
    expect(res.body.supportedCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capabilityId: 'create_offer_draft', supported: true }),
      ]),
    );
    expect(executeRuntimeAction).not.toHaveBeenCalled();
  });

  it('publish_offer dry-run blocked until offer draft approved', async () => {
    const body = {
      missionId: 'mission-offer-1',
      reviewContext: { offerDraftStatus: 'review_required' },
      intent: {
        intentId: 'exec-intent:mission-offer-1:launch_first_offer:next_step_chip',
        missionId: 'mission-offer-1',
        actionType: 'launch_first_offer',
        goal: 'Launch offer',
        source: 'next_step_chip',
        prerequisites: [
          { key: 'store', satisfied: true },
          { key: 'auth', satisfied: true },
        ],
        capabilityHints: [],
        createdAt: 1,
      },
      plan: {
        planId: 'exec-plan:launch-offer',
        intentId: 'exec-intent:mission-offer-1:launch_first_offer:next_step_chip',
        missionId: 'mission-offer-1',
        actionType: 'launch_first_offer',
        skillId: 'launch_first_offer',
        status: 'ready',
        steps: [
          { stepId: 'publish_offer-5', capabilityId: 'publish_offer', order: 5 },
        ],
      },
    };
    const blocked = await request(appWithRuntime()).post('/api/performer/runtime/dry-run').send(body);
    expect(blocked.status).toBe(200);
    expect(blocked.body.blockedPrerequisites).toContain('offer_draft_approved');

    const approved = await request(appWithRuntime())
      .post('/api/performer/runtime/dry-run')
      .send({
        ...body,
        reviewContext: { offerDraftStatus: 'approved' },
      });
    expect(approved.body.blockedPrerequisites ?? []).not.toContain('offer_draft_approved');
  });

  it('returns missing capabilities when step is unknown', async () => {
    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/dry-run')
      .send({
        ...validBody,
        plan: {
          ...validBody.plan,
          steps: [{ stepId: 'u-0', capabilityId: 'unknown_cap_xyz', kind: 'client_action', order: 0 }],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.missingCapabilities.length).toBeGreaterThan(0);
    expect(res.body.status).toBe('blocked');
  });
});
