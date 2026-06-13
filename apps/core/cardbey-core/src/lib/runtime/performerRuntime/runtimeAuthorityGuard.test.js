import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assertRuntimeAuthorityContext,
  hasRuntimeAuthorityContext,
  recordRuntimeAuthorityPathUsed,
  recordRuntimeAuthorityBypass,
} from './runtimeAuthorityGuard.js';
import {
  getRuntimeAuthorityMetrics,
  resetRuntimeAuthorityMetrics,
} from './runtimeAuthorityStaging.js';

describe('runtimeAuthorityGuard', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    resetRuntimeAuthorityMetrics();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('detects runtime-owned context', () => {
    expect(hasRuntimeAuthorityContext({ runtimeOwned: true })).toBe(true);
    expect(hasRuntimeAuthorityContext({ performerRuntimeOwned: true })).toBe(true);
    expect(hasRuntimeAuthorityContext({})).toBe(false);
  });

  it('records path used when context is owned', () => {
    assertRuntimeAuthorityContext(
      { runtimeOwned: true, userId: 'u-1', missionId: 'm-1' },
      { toolName: 'create_store', source: 'intake_v2' },
    );
    expect(getRuntimeAuthorityMetrics().runtimeAuthorityPathUsed).toBe(1);
    expect(getRuntimeAuthorityMetrics().runtimeAuthorityBypass).toBe(0);
  });

  it('warns on bypass in test env without throwing', () => {
    const result = assertRuntimeAuthorityContext({}, { toolName: 'create_store', caller: 'legacy' });
    expect(result.ok).toBe(false);
    expect(result.warned).toBe(true);
    expect(getRuntimeAuthorityMetrics().runtimeAuthorityBypass).toBe(1);
  });

  it('throws RUNTIME_AUTHORITY_BYPASS in development', () => {
    process.env.NODE_ENV = 'development';
    expect(() =>
      assertRuntimeAuthorityContext({}, { toolName: 'create_store', caller: 'legacy' }),
    ).toThrow(/RUNTIME_AUTHORITY_BYPASS/);
  });

  it('increments metrics for explicit path/bypass records', () => {
    recordRuntimeAuthorityPathUsed({ route: 'test', toolName: 'x', source: 'test' });
    recordRuntimeAuthorityBypass({ toolName: 'y', caller: 'test' });
    const metrics = getRuntimeAuthorityMetrics();
    expect(metrics.runtimeAuthorityPathUsed).toBe(1);
    expect(metrics.runtimeAuthorityBypass).toBe(1);
  });
});
