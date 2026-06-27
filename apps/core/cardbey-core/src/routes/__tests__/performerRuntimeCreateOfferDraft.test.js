import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import performerRuntimeRoutes from '../performerRuntimeRoutes.js';
import { executeCreateOfferDraftCapability } from '../../lib/runtime/performerRuntime/executeCreateOfferDraftCapability.js';
import { ensureQuickActionMission } from '../../lib/mission/quickActionMission.js';

vi.mock('../../lib/runtime/performerRuntime/executeCreateOfferDraftCapability.js', () => ({
  executeCreateOfferDraftCapability: vi.fn(),
}));

vi.mock('../../lib/mission/quickActionMission.js', () => ({
  ensureQuickActionMission: vi.fn(),
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

describe('POST /api/performer/runtime/capabilities/create-offer-draft', () => {
  beforeEach(() => {
    vi.mocked(executeCreateOfferDraftCapability).mockReset();
    vi.mocked(ensureQuickActionMission).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requires missionId when auto-create is unavailable', async () => {
    vi.mocked(ensureQuickActionMission).mockResolvedValue({
      missionId: null,
      pipelineId: null,
      created: false,
    });

    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/capabilities/create-offer-draft')
      .send({ storeId: 'store-1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('mission_id_required');
    expect(executeCreateOfferDraftCapability).not.toHaveBeenCalled();
  });

  it('auto-creates mission when missionId is omitted', async () => {
    vi.mocked(ensureQuickActionMission).mockResolvedValue({
      missionId: 'mission-auto-1',
      pipelineId: 'mission-auto-1',
      created: true,
    });
    vi.mocked(executeCreateOfferDraftCapability).mockResolvedValue({
      ok: true,
      status: 'completed',
      output: {
        offerDraft: {
          artifactId: 'offer-draft:mission-auto-1:abc',
          type: 'offer_draft',
          title: 'First offer — 10% off',
          status: 'draft',
          publishBlocked: true,
        },
        published: false,
        activated: false,
      },
    });

    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/capabilities/create-offer-draft')
      .send({
        storeId: 'store-1',
        actionType: 'create_offer_draft',
        source: 'quick_action_pill',
        label: 'Create promotion graphic',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.missionId).toBe('mission-auto-1');
    expect(res.body.missionAutoCreated).toBe(true);
    expect(ensureQuickActionMission).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        actionType: 'create_offer_draft',
        source: 'quick_action_pill',
      }),
    );
    expect(executeCreateOfferDraftCapability).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: 'mission-auto-1', storeId: 'store-1' }),
    );
  });

  it('requires storeId when missionId is present', async () => {
    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/capabilities/create-offer-draft')
      .send({ missionId: 'm1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('store_id_required');
    expect(executeCreateOfferDraftCapability).not.toHaveBeenCalled();
  });

  it('returns offer draft artifact without publish side effects', async () => {
    vi.mocked(executeCreateOfferDraftCapability).mockResolvedValue({
      ok: true,
      status: 'completed',
      output: {
        offerDraft: {
          artifactId: 'offer-draft:m1:abc',
          type: 'offer_draft',
          title: 'First offer — 10% off',
          offerCopy: 'Draft copy',
          featuredProducts: [],
          proposedDiscount: '10% off',
          cta: 'Shop this offer',
          status: 'draft',
          publishBlocked: true,
        },
        published: false,
        activated: false,
      },
    });

    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/capabilities/create-offer-draft')
      .send({ missionId: 'm1', storeId: 'store-1', draftId: 'draft-1' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.output.offerDraft.status).toBe('draft');
    expect(res.body.output.published).toBe(false);
    expect(executeCreateOfferDraftCapability).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: 'm1', storeId: 'store-1', draftId: 'draft-1' }),
    );
  });

  it('returns failed status when executor fails', async () => {
    vi.mocked(executeCreateOfferDraftCapability).mockResolvedValue({
      ok: false,
      status: 'failed',
      error: 'draft failed',
      code: 'create_offer_draft_failed',
    });

    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/capabilities/create-offer-draft')
      .send({ missionId: 'm1', storeId: 'store-1' });

    expect(res.status).toBe(502);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('draft failed');
  });
});
