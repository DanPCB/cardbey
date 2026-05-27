import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import performerRuntimeRoutes from '../performerRuntimeRoutes.js';
import { executeCreateOfferDraftCapability } from '../../lib/runtime/performerRuntime/executeCreateOfferDraftCapability.js';

vi.mock('../../lib/runtime/performerRuntime/executeCreateOfferDraftCapability.js', () => ({
  executeCreateOfferDraftCapability: vi.fn(),
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requires missionId and storeId', async () => {
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
