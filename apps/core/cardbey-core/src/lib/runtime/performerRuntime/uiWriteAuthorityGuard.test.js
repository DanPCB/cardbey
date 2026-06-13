import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assertUiWriteAuthority,
  hasUiRuntimeAuthorityContext,
  isStorageOnlyUploadPath,
  isStateChangingUploadPath,
  markUiRuntimeInternalBypass,
  UI_RUNTIME_AUTHORITY_HEADER,
} from './uiWriteAuthorityGuard.js';
import { getRuntimeAuthorityMetrics, resetRuntimeAuthorityMetrics } from './runtimeAuthorityStaging.js';

describe('uiWriteAuthorityGuard', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    resetRuntimeAuthorityMetrics();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('detects runtime authority via header', () => {
    const req = { headers: { [UI_RUNTIME_AUTHORITY_HEADER]: '1' }, body: {} };
    expect(hasUiRuntimeAuthorityContext(req)).toBe(true);
  });

  it('detects runtime authority via body context', () => {
    const req = { headers: {}, body: { runtimeAuthorityContext: { missionId: 'm-1' } } };
    expect(hasUiRuntimeAuthorityContext(req)).toBe(true);
  });

  it('records path used when authorized', () => {
    const req = { headers: { [UI_RUNTIME_AUTHORITY_HEADER]: '1' }, body: {} };
    const result = assertUiWriteAuthority(req, { mutationType: 'hero_patch', route: '/test' });
    expect(result.authorized).toBe(true);
    expect(getRuntimeAuthorityMetrics().runtimeAuthorityPathUsed).toBe(1);
    expect(getRuntimeAuthorityMetrics().runtimeAuthorityBypass).toBe(0);
  });

  it('warns on bypass in test without throwing', () => {
    const result = assertUiWriteAuthority({ headers: {}, body: {} }, { mutationType: 'publish_store' });
    expect(result.warned).toBe(true);
    expect(getRuntimeAuthorityMetrics().runtimeAuthorityBypass).toBe(1);
  });

  it('throws RUNTIME_AUTHORITY_BYPASS in development', () => {
    process.env.NODE_ENV = 'development';
    expect(() =>
      assertUiWriteAuthority({ headers: {}, body: {} }, { mutationType: 'hero_upload' }),
    ).toThrow(/RUNTIME_AUTHORITY_BYPASS/);
  });

  it('classifies storage vs state-changing upload paths', () => {
    expect(isStorageOnlyUploadPath('/api/uploads/create')).toBe(true);
    expect(isStateChangingUploadPath('/api/stores/x/upload/hero')).toBe(true);
    expect(isStateChangingUploadPath('/api/signage/engine/publish')).toBe(true);
  });

  it('honors internal bypass symbol', () => {
    const req = { headers: {}, body: {} };
    markUiRuntimeInternalBypass(req);
    expect(hasUiRuntimeAuthorityContext(req)).toBe(true);
  });
});
