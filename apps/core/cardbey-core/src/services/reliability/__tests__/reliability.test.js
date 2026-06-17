import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/auth.js', () => ({
  requireAuth: (req, _res, next) => {
    req.user = { id: 'user-test', role: 'platform_admin' };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
}));

import { AutoHealService } from '../autoHeal.js';
import { RateLimiter } from '../rateLimiter.js';
import { Bulkhead } from '../bulkhead.js';
import { SLOTracker } from '../sloTracker.js';
import { AlertingService } from '../alerting.js';
import { ConsoleChannel } from '../channels/console.js';
import reliabilityRoutes from '../../../routes/reliabilityRoutes.js';

describe('AutoHealService', () => {
  let autoHeal;

  beforeEach(() => {
    autoHeal = new AutoHealService();
    autoHeal.resetForTests();
  });

  it('registers healing actions', () => {
    autoHeal.register({
      id: 'test_action',
      name: 'Test Action',
      heal: async () => {},
    });
    expect(autoHeal.healingActions.has('test_action')).toBe(true);
  });

  it('records healing history', async () => {
    autoHeal.register({
      id: 'noop',
      name: 'Noop',
      heal: async () => {},
    });

    await autoHeal.healIssue({
      type: 'test_issue',
      severity: 'low',
      actions: ['noop'],
    });

    expect(autoHeal.getHistory()).toHaveLength(1);
    expect(autoHeal.getHistory()[0].issue).toBe('test_issue');
  });

  it('detects unhealthy agents from registry state', async () => {
    const issues = await autoHeal.detectIssues();
    expect(Array.isArray(issues)).toBe(true);
  });

  it('respects cooldown between healing attempts for the same issue type', async () => {
    autoHeal.register({
      id: 'noop',
      name: 'Noop',
      heal: async () => {},
    });

    await autoHeal.healIssue({
      type: 'unhealthy_agents',
      severity: 'medium',
      actions: ['noop'],
    });

    expect(autoHeal.isCooldownActive('unhealthy_agents')).toBe(true);

    autoHeal.lastHealTime.set('unhealthy_agents', Date.now() - autoHeal.cooldownMs - 1);
    expect(autoHeal.isCooldownActive('unhealthy_agents')).toBe(false);
  });
});

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter();
    limiter.resetForTests();
    limiter.configure({
      endpoint: '/test',
      windowMs: 60_000,
      maxRequests: 2,
      perUser: true,
    });
  });

  it('allows requests under limit', () => {
    const first = limiter.check('/test', 'user-1');
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
  });

  it('rejects requests over limit', () => {
    limiter.check('/test', 'user-1');
    limiter.check('/test', 'user-1');
    const third = limiter.check('/test', 'user-1');
    expect(third.allowed).toBe(false);
    expect(third.limit).toBe(2);
  });
});

describe('Bulkhead', () => {
  let bulkhead;

  beforeEach(() => {
    bulkhead = new Bulkhead();
    bulkhead.resetForTests();
    bulkhead.configure({
      name: 'test_pool',
      maxConcurrent: 1,
      maxQueueSize: 2,
      timeoutMs: 1000,
    });
  });

  it('executes tasks with isolation', async () => {
    const result = await bulkhead.execute('test_pool', async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
    const status = bulkhead.getStatus('test_pool');
    expect(status?.totalExecutions).toBe(1);
    expect(status?.utilization).toBeGreaterThan(0);
  });

  it('rejects when queue is full', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });

    const slow = bulkhead.execute('test_pool', () => gate);
    bulkhead.execute('test_pool', async () => 'queued-1');
    bulkhead.execute('test_pool', async () => 'queued-2');

    await expect(bulkhead.execute('test_pool', async () => 'overflow')).rejects.toThrow(
      /queue full/,
    );

    release?.();
    await slow;
  });
});

describe('SLOTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new SLOTracker();
    tracker.resetForTests();
    tracker.define({
      name: 'test_success_rate',
      metric: 'success_rate',
      target: { operator: 'gte', value: 95 },
      severity: 'high',
    });
  });

  it('evaluates objectives', async () => {
    const breaches = await tracker.evaluate();
    expect(Array.isArray(breaches)).toBe(true);
    expect(tracker.getObjectives()).toHaveLength(1);
  });

  it('detects target breaches', () => {
    expect(tracker.isWithinTarget(96, { operator: 'gte', value: 95 })).toBe(true);
    expect(tracker.isWithinTarget(90, { operator: 'gte', value: 95 })).toBe(false);
  });
});

describe('AlertingService', () => {
  it('stores and dispatches alerts', async () => {
    const alerting = new AlertingService();
    const sent = [];
    alerting.registerChannel('test', {
      send: async (alert) => {
        sent.push(alert);
      },
    });

    await alerting.sendAlert({
      title: 'Test',
      message: 'Hello',
      severity: 'low',
    });

    expect(sent).toHaveLength(1);
    expect(alerting.getAlerts()).toHaveLength(1);
  });

  it('console channel formats severity', async () => {
    const channel = new ConsoleChannel();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await channel.send({ title: 'T', message: 'M', severity: 'critical' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('reliabilityRoutes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/reliability', reliabilityRoutes);
  });

  it('GET /api/reliability/alerts returns alerts', async () => {
    const res = await request(app).get('/api/reliability/alerts');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.alerts)).toBe(true);
  });

  it('POST /api/reliability/alerts/test sends test alert', async () => {
    const res = await request(app).post('/api/reliability/alerts/test').send({ severity: 'low' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.alert?.title).toBe('Test Alert');
  });

  it('GET /api/reliability/circuit-breaker/status returns statuses', async () => {
    const res = await request(app).get('/api/reliability/circuit-breaker/status');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.statuses).toBeDefined();
  });
});
