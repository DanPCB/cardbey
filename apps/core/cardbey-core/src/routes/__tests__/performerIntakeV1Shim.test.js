/**
 * Phase 8 — Intake V1 deprecation shim forwards to V2.
 * @vitest-environment node
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/guestAuth.js', () => ({
  requireUserOrGuest: (_req, _res, next) => next(),
}));

vi.mock('../performerIntakeV2Routes.js', () => {
  const express = require('express');
  const router = express.Router();
  router.post('/', (req, res) => {
    res.json({
      forwarded: true,
      userMessage: String(req.body?.text ?? req.body?.userMessage ?? '').trim(),
    });
  });
  return { default: router };
});

import performerIntakeRoutes from '../performerIntakeRoutes.js';

function appWithIntakeV1() {
  const app = express();
  app.use(express.json());
  app.use('/api/performer/intake', performerIntakeRoutes);
  return app;
}

describe('POST /api/performer/intake (v1 shim)', () => {
  it('sets deprecation headers and forwards body to v2 stack', async () => {
    const res = await request(appWithIntakeV1())
      .post('/api/performer/intake')
      .send({ text: 'Create a store for Test Cafe' });

    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers['x-api-deprecated']).toContain('/api/performer/intake/v2');
    expect(res.headers.link).toContain('/api/performer/intake/v2');
    expect(res.body).toMatchObject({
      forwarded: true,
      userMessage: 'Create a store for Test Cafe',
    });
  });
});
