import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import performerRuntimeRoutes from '../performerRuntimeRoutes.js';
import { executeAnalyzeStoreCapability } from '../../lib/runtime/performerRuntime/executeAnalyzeStoreCapability.js';

vi.mock('../../lib/runtime/performerRuntime/executeAnalyzeStoreCapability.js', () => ({
  executeAnalyzeStoreCapability: vi.fn(),
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

describe('POST /api/performer/runtime/capabilities/analyze-store', () => {
  beforeEach(() => {
    vi.mocked(executeAnalyzeStoreCapability).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requires missionId and storeId', async () => {
    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/capabilities/analyze-store')
      .send({ missionId: 'm1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('store_id_required');
    expect(executeAnalyzeStoreCapability).not.toHaveBeenCalled();
  });

  it('returns analysis output on success', async () => {
    vi.mocked(executeAnalyzeStoreCapability).mockResolvedValue({
      ok: true,
      status: 'completed',
      output: { summary: 'Store looks healthy', productCount: 12 },
    });

    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/capabilities/analyze-store')
      .send({ missionId: 'm1', storeId: 'store-1', focus: 'performance' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.output.summary).toBe('Store looks healthy');
    expect(executeAnalyzeStoreCapability).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: 'm1', storeId: 'store-1', focus: 'performance' }),
    );
  });

  it('returns failed status when executor fails', async () => {
    vi.mocked(executeAnalyzeStoreCapability).mockResolvedValue({
      ok: false,
      status: 'failed',
      error: 'analyze failed',
      code: 'analyze_store_failed',
    });

    const res = await request(appWithRuntime())
      .post('/api/performer/runtime/capabilities/analyze-store')
      .send({ missionId: 'm1', storeId: 'store-1' });

    expect(res.status).toBe(502);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('analyze failed');
  });
});
