import { describe, expect, it } from 'vitest';
import { resolveIntakeShortcutContext } from '../intakeShortcutContext.js';

describe('resolveIntakeShortcutContext', () => {
  it('detects create_store from frontscreen primaryMode handoff', () => {
    const ctx = resolveIntakeShortcutContext({
      userMessage: 'Create store',
      primaryMode: 'create',
      intentSource: 'frontscreen',
      auth: { userId: 'user_1', isGuest: false },
    });

    expect(ctx?.type).toBe('create_store');
    expect(ctx?.intentMode).toBeTruthy();
  });

  it('detects create_store from structured storeCreateForm', () => {
    const ctx = resolveIntakeShortcutContext({
      userMessage: '',
      storeCreateForm: { storeName: 'My Shop', intentMode: 'store' },
      auth: { userId: 'user_1', isGuest: false },
    });

    expect(ctx?.type).toBe('create_store');
    expect(ctx?.intentMode).toBe('store');
  });
});
