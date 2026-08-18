/**
 * Global Live × Cnet route authorization and public projection (no Cloudflare).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Features } from '../../config/features.js';
import { LIVE_CNET_ERROR_CODES } from './domain.js';

const FLAG_KEYS = ['ENABLE_LIVE_MARKET_V1', 'ENABLE_LIVE_CNET_CONTRACT_V1'];

describe('liveCnet routes', () => {
  const envBackup = {};

  beforeEach(() => {
    for (const k of FLAG_KEYS) {
      envBackup[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of FLAG_KEYS) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
    vi.resetModules();
  });

  it('returns LIVE_CNET_DISABLED when the contract flag is off', async () => {
    const { liveCnetOwnerRoutes, liveCnetPublicRoutes } = await import('./routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/stores', liveCnetOwnerRoutes);
    app.use('/api/public/live-cnet', liveCnetPublicRoutes);

    expect(Features.liveMarket.cnetContractV1).toBe(false);
    const owner = await request(app).get('/api/stores/store1/live-cnet/campaigns');
    expect(owner.status).toBe(403);
    expect(owner.body.error).toBe(LIVE_CNET_ERROR_CODES.LIVE_CNET_DISABLED);

    const manifest = await request(app).get('/api/public/live-cnet/manifest/glt_x');
    expect(manifest.status).toBe(403);
    expect(manifest.body.error).toBe(LIVE_CNET_ERROR_CODES.LIVE_CNET_DISABLED);
  });

  it('requires auth for owner campaign controls when the flag is on', async () => {
    process.env.ENABLE_LIVE_MARKET_V1 = 'true';
    process.env.ENABLE_LIVE_CNET_CONTRACT_V1 = 'true';
    vi.resetModules();
    const { liveCnetOwnerRoutes } = await import('./routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/stores', liveCnetOwnerRoutes);
    const res = await request(app).get('/api/stores/store1/live-cnet/campaigns');
    expect([401, 403]).toContain(res.status);
    expect(res.body.error).not.toBeUndefined();
  });
});
