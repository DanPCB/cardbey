import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { latencyGuard } from '../latencyGuard.js';
import metricsCollector from '../../services/reliability/metricsCollector.js';
import circuitBreaker from '../../services/reliability/circuitBreaker.js';

describe('latencyGuard', () => {
  let app;

  beforeEach(() => {
    metricsCollector.resetForTests();
    circuitBreaker.resetForTests();

    app = express();
    app.use(latencyGuard);
    app.get('/api/test/fast', (_req, res) => {
      res.json({ ok: true });
    });
    app.get('/api/test/slow', (_req, res) => {
      setTimeout(() => res.json({ ok: true }), 20);
    });
    app.get('/api/stream', (_req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(': connected\n\n');
      res.end();
    });
  });

  it('records latency metrics on finish', async () => {
    await request(app).get('/api/test/fast').expect(200);
    const recent = metricsCollector.getRecentMetrics('api.latency', 5);
    expect(recent.length).toBe(1);
    expect(recent[0].tags.path).toBe('/api/test/fast');
  });

  it('skips SSE/stream routes', async () => {
    await request(app).get('/api/stream').expect(200);
    expect(metricsCollector.getRecentMetrics('api.latency', 5)).toHaveLength(0);
  });

  it('opens circuit breaker on critical latency', async () => {
    process.env.API_LATENCY_CRITICAL_MS = '5';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const openSpy = vi.spyOn(circuitBreaker, 'open');

    const criticalApp = express();
    criticalApp.use(latencyGuard);
    criticalApp.get('/api/test/critical', (_req, res) => {
      const start = Date.now();
      while (Date.now() - start < 15) {
        /* busy wait */
      }
      res.json({ ok: true });
    });

    await request(criticalApp).get('/api/test/critical').expect(200);
    expect(openSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
    openSpy.mockRestore();
    delete process.env.API_LATENCY_CRITICAL_MS;
  });
});
