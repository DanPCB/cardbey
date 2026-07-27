import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { resetExecutionModeForTests } from '../../runtime/executionMode.js';
import {
  isDeviceIntentPreClassifyAllowed,
  isKernelOnlyIntakeTool,
  isPerformeeSlideshowOverrideAllowed,
  isPreClassifyShortcutAllowed,
  shouldPreserveCreateStoreShortcutWhenKernelMandatory,
} from '../intakeShortcutPolicy.js';

describe('intakeShortcutPolicy', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    resetExecutionModeForTests();
  });

  beforeEach(() => {
    resetExecutionModeForTests();
    delete process.env.EXECUTION_MODE;
    delete process.env.EMERGENCY_BYPASS_KERNEL;
    delete process.env.DISABLE_KERNEL_MANDATORY;
  });

  it('marks checkpoint and governance tools as kernel-only intake tools', () => {
    expect(isKernelOnlyIntakeTool('create_store')).toBe(true);
    expect(isKernelOnlyIntakeTool('create_campaign')).toBe(true);
    expect(isKernelOnlyIntakeTool('launch_campaign')).toBe(true);
    expect(isKernelOnlyIntakeTool('activate_campaigns')).toBe(true);
    expect(isKernelOnlyIntakeTool('mutate_poster')).toBe(false);
  });

  it('blocks pre-classify shortcuts when kernel mandatory is on', () => {
    expect(isPreClassifyShortcutAllowed('device')).toBe(false);
    expect(isDeviceIntentPreClassifyAllowed()).toBe(false);
    expect(isPerformeeSlideshowOverrideAllowed()).toBe(false);
  });

  it('allows pre-classify shortcuts when kernel mandatory is off', () => {
    process.env.DISABLE_KERNEL_MANDATORY = 'true';
    expect(isPreClassifyShortcutAllowed('device')).toBe(true);
    expect(isDeviceIntentPreClassifyAllowed()).toBe(true);
    expect(isPerformeeSlideshowOverrideAllowed()).toBe(true);
  });

  it('preserves create_store shortcut contract under kernel mandatory', () => {
    expect(
      shouldPreserveCreateStoreShortcutWhenKernelMandatory(
        { type: 'create_store' },
        { storeCreateForm: { storeName: 'Acme' } },
      ),
    ).toBe(true);
    expect(
      shouldPreserveCreateStoreShortcutWhenKernelMandatory(null, {
        storeCreateForm: { storeName: 'Acme Cafe' },
      }),
    ).toBe(true);
  });
});
