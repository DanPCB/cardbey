import { describe, it, expect } from 'vitest';
import {
  DISPATCH_ACTIONS,
  UPLOAD_ACTIONS,
  getRuntimeActionConfig,
  isRuntimeDispatchAction,
  isRuntimeUploadAction,
} from '../../src/lib/runtime/runtimeActionTypes.js';

describe('runtimeActionTypes dispatch registry', () => {
  it('includes hero, avatar, publish, delete actions', () => {
    expect(isRuntimeUploadAction(UPLOAD_ACTIONS.PATCH_HERO)).toBe(true);
    expect(isRuntimeUploadAction(UPLOAD_ACTIONS.PATCH_AVATAR)).toBe(true);
    expect(isRuntimeDispatchAction(DISPATCH_ACTIONS.PUBLISH_STORE)).toBe(true);
    expect(isRuntimeDispatchAction(DISPATCH_ACTIONS.REPUBLISH_WEBSITE)).toBe(true);
    expect(isRuntimeDispatchAction(DISPATCH_ACTIONS.DELETE_STORE)).toBe(true);
  });

  it('marks publish and delete as confirmation-required', () => {
    expect(getRuntimeActionConfig(DISPATCH_ACTIONS.PUBLISH_STORE)?.requireConfirmation).toBe(true);
    expect(getRuntimeActionConfig(DISPATCH_ACTIONS.DELETE_STORE)?.requireConfirmation).toBe(true);
    expect(getRuntimeActionConfig(UPLOAD_ACTIONS.PATCH_HERO)?.requireConfirmation).toBe(false);
  });

  it('includes skill dispatch actions for agent runtime', () => {
    expect(isRuntimeDispatchAction(DISPATCH_ACTIONS.ANALYZE_STORE)).toBe(true);
    expect(isRuntimeDispatchAction(DISPATCH_ACTIONS.DIAGNOSE_STORE)).toBe(true);
    expect(getRuntimeActionConfig(DISPATCH_ACTIONS.DIAGNOSE_STORE)?.requireConfirmation).toBe(false);
    expect(getRuntimeActionConfig(DISPATCH_ACTIONS.CREATE_CAMPAIGN)?.requireConfirmation).toBe(true);
  });
});
