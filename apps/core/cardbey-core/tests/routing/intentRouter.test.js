import { describe, it, expect, vi, beforeEach } from 'vitest';
import intentRouter from '../../src/lib/routing/intentRouter.js';
import { categorizeEndpoint } from '../../src/lib/routing/endpointRegistry.js';
import { normalizeRoutingBodyFlags } from '../../src/lib/routing/compatibilityLayer.js';
import hybridRouter from '../../src/lib/routing/hybridRouter.js';

describe('Intent Router', () => {
  it('routes agent workflows to kernel category', () => {
    const result = intentRouter.categorize('/api/performer/intake/v2', 'POST', { text: 'hello' });
    expect(result).toBe('AGENT_WORKFLOW');
  });

  it('routes user actions to USER_ACTION', () => {
    const result = intentRouter.categorize('/api/auth/profile', 'PUT', { name: 'Test' });
    expect(result).toBe('USER_ACTION');
  });

  it('routes content CRUD to CONTENT_CRUD', () => {
    const result = intentRouter.categorize('/api/draft-store/abc123', 'GET', {});
    expect(result).toBe('CONTENT_CRUD');
  });

  it('routes social interactions to SOCIAL', () => {
    const result = intentRouter.categorize('/api/public/content-interactions/like', 'POST', { postId: '1' });
    expect(result).toBe('SOCIAL');
  });

  it('routes transactions to TRANSACTION', () => {
    const result = intentRouter.categorize('/api/billing/balance', 'GET', {});
    expect(result).toBe('TRANSACTION');
  });

  it('routes hybrid publish paths to HYBRID', () => {
    const result = intentRouter.categorize('/api/stores/store-1/publish', 'POST', {});
    expect(result).toBe('HYBRID');
  });

  it('respects _forcePath kernel override', () => {
    const result = intentRouter.categorize('/api/user/profile', 'PUT', { _forcePath: 'kernel', name: 'Test' });
    expect(result).toBe('AGENT_WORKFLOW');
  });

  it('respects _forcePath direct override', () => {
    const result = intentRouter.categorize('/api/performer/intake', 'POST', { _forcePath: 'direct' });
    expect(result).toBe('USER_ACTION');
  });

  it('respects _preferAgent for hybrid resolution hint', () => {
    const cat = intentRouter.categorize('/api/stores/x/publish', 'POST', { _preferAgent: true });
    expect(cat).toBe('AGENT_WORKFLOW');
  });

  it('classifies GET unknown paths as READ_ONLY', () => {
    const { category } = categorizeEndpoint('/api/unknown-widget', 'GET', {});
    expect(category).toBe('READ_ONLY');
  });

  it('classifyRequest attaches full routing metadata', () => {
    const req = {
      originalUrl: '/api/missions/plan',
      path: '/api/missions/plan',
      method: 'POST',
      body: { goal: 'launch campaign' },
    };
    const routing = intentRouter.classifyRequest(req);
    expect(routing.category).toBe('AGENT_WORKFLOW');
    expect(routing.executionPath).toBe('kernel');
    expect(routing.endpoint).toBe('/api/missions/plan');
  });

  it('complexity heuristic upgrades unknown POST bodies', () => {
    const result = intentRouter.categorizeWithFallback('/api/custom/thing', 'POST', { action: 'generate report' });
    expect(result.category).toBe('AGENT_WORKFLOW');
    expect(result.reason).toBe('complexity_heuristic');
  });
});

describe('Compatibility layer', () => {
  it('strips direct_action and skipDirectGuard', () => {
    const body = normalizeRoutingBodyFlags({
      direct_action: true,
      skipDirectGuard: true,
      text: 'hi',
    });
    expect(body.direct_action).toBeUndefined();
    expect(body.skipDirectGuard).toBeUndefined();
    expect(body.text).toBe('hi');
  });

  it('converts _autoSubmit to requireConfirmation', () => {
    const body = normalizeRoutingBodyFlags({ _autoSubmit: true });
    expect(body.requireConfirmation).toBe(true);
    expect(body._autoSubmit).toBe(false);
  });
});

describe('Hybrid Router', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults hybrid to direct when no preference', async () => {
    const req = { body: {}, user: { id: 'u1' }, path: '/api/stores/x/publish', method: 'POST' };
    vi.spyOn(hybridRouter, 'getUserAgentPreference').mockResolvedValue(undefined);
    const path = await hybridRouter.resolveHybridExecutionPath(req);
    expect(path).toBe('direct');
  });

  it('uses _preferAgent true for kernel path', async () => {
    const req = { body: { _preferAgent: true }, user: { id: 'u1' }, path: '/api/stores/x/publish' };
    const path = await hybridRouter.resolveHybridExecutionPath(req);
    expect(path).toBe('kernel');
  });

  it('uses saved user preference when present', async () => {
    const req = { body: {}, user: { id: 'u1' }, path: '/api/stores/x/publish' };
    vi.spyOn(hybridRouter, 'getUserAgentPreference').mockResolvedValue(true);
    const path = await hybridRouter.resolveHybridExecutionPath(req);
    expect(path).toBe('kernel');
  });
});
