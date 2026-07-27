import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import performerRuntimeRoutes from '../performerRuntimeRoutes.js';
import { executeReviseOfferDraftCapability } from '../../lib/runtime/performerRuntime/executeReviseOfferDraftCapability.js';

vi.mock('../../lib/runtime/performerRuntime/executeReviseOfferDraftCapability.js', () => ({
  executeReviseOfferDraftCapability: vi.fn(),
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

const previousDraft = {
  artifactId: 'offer-draft:m1:v1',
  type: 'offer_draft',
  title: 'First offer',
  offerCopy: 'Copy',
  featuredProducts: [],
  status: 'needs_revision',
  versionNumber: 1,
};

describe('POST /api/performer/runtime/capabilities/revise-offer-draft', () => {
  beforeEach(() => {
    vi.mocked(executeReviseOfferDraftCapability).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requires missionId, storeId, previousOfferDraft, and revisionNotes', async () => {
    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/capabilities/revise-offer-draft')
      .send({ missionId: 'm1', storeId: 'store-1', previousOfferDraft: previousDraft });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('revision_notes_required');
    expect(executeReviseOfferDraftCapability).not.toHaveBeenCalled();
  });

  it('returns revised offer draft without publish side effects', async () => {
    vi.mocked(executeReviseOfferDraftCapability).mockResolvedValue({
      ok: true,
      status: 'completed',
      output: {
        offerDraft: {
          artifactId: 'offer-draft:m1:v2',
          type: 'offer_draft',
          title: 'Revised offer (v2)',
          offerCopy: 'Revised copy',
          featuredProducts: [],
          status: 'review_required',
          versionNumber: 2,
          previousVersionId: previousDraft.artifactId,
          revisionReason: 'Lower discount',
          publishBlocked: true,
        },
        previousOfferDraftId: previousDraft.artifactId,
        versionNumber: 2,
        published: false,
        activated: false,
      },
    });

    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/capabilities/revise-offer-draft')
      .send({
        missionId: 'm1',
        storeId: 'store-1',
        previousOfferDraft: previousDraft,
        revisionNotes: 'Lower discount',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.output.offerDraft.versionNumber).toBe(2);
    expect(res.body.output.offerDraft.status).toBe('review_required');
    expect(res.body.output.published).toBe(false);
    expect(res.body.output.activated).toBe(false);
    expect(executeReviseOfferDraftCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: 'm1',
        storeId: 'store-1',
        revisionNotes: 'Lower discount',
        previousOfferDraft: previousDraft,
      }),
    );
  });
});
