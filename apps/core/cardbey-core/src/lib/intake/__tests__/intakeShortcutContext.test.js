import { describe, expect, it } from 'vitest';
import { detectIntent } from '../intakeSystemShortcuts.js';
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

  it('returns null for casual greetings even with store_setup primaryMode', () => {
    expect(
      resolveIntakeShortcutContext({
        userMessage: 'hi',
        primaryModeHint: 'store_setup',
        auth: { userId: 'user_1', isGuest: false },
      }),
    ).toBeNull();
  });

  it('upgrades clarify_create_runway to create_store for clear create intents', () => {
    const cases = [
      'create my business',
      'create my store',
      'I want to create a business',
      'help me create my business',
    ];
    for (const userMessage of cases) {
      const ctx = resolveIntakeShortcutContext({
        userMessage,
        primaryMode: 'create',
        intentSource: 'frontscreen',
        auth: { userId: 'user_1', isGuest: false },
      });
      expect(ctx?.type, userMessage).toBe('create_store');
    }
  });

  it('keeps clarify_create_runway for genuinely ambiguous create handoffs', () => {
    expect(
      detectIntent({
        userMessage: 'Help me get started',
        primaryMode: 'create',
        intentSource: 'frontscreen',
        auth: { userId: 'user_1', isGuest: false },
      })?.type,
    ).toBe('clarify_create_runway');

    expect(
      resolveIntakeShortcutContext({
        userMessage: 'create a store and a mini website',
        primaryMode: 'create',
        auth: { userId: 'user_1', isGuest: false },
      })?.type,
    ).toBe('clarify_create_runway');
  });

  it('recovers create_store from clarify when contract matches but runway missed typos', () => {
    const ctx = resolveIntakeShortcutContext({
      userMessage: 'creat my business',
      primaryMode: 'create',
      auth: { userId: 'user_1', isGuest: false },
    });
    expect(ctx?.type).toBe('create_store');
  });
});
