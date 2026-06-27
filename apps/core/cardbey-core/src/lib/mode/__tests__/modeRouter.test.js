import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildManualClassification,
  resolveManualIntakeRequest,
} from '../modeRouter.js';
import { checkRuntimeAuthority } from '../checkRuntimeAuthority.js';

describe('modeTypes', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('resolves mode from header then body then default', async () => {
    const { resolvePerformerMode } = await import('../modeTypes.js');
    expect(
      resolvePerformerMode(
        { headers: { 'x-performer-mode': 'manual' } },
        { mode: 'automation' },
      ),
    ).toBe('manual');
    expect(resolvePerformerMode({ headers: {} }, { mode: 'manual' })).toBe('manual');
    expect(resolvePerformerMode({ headers: {} }, {})).toBe('automation');
  });

  it('uses PERFORMER_DEFAULT_MODE env when header/body omit mode', async () => {
    vi.stubEnv('PERFORMER_DEFAULT_MODE', 'manual');
    vi.resetModules();
    const { resolvePerformerMode } = await import('../modeTypes.js');
    expect(resolvePerformerMode({ headers: {} }, {})).toBe('manual');
  });
});

describe('buildManualClassification', () => {
  it('maps create_store to intake tool without reasoning', () => {
    const cls = buildManualClassification({ action: 'create_store', source: 'button' });
    expect(cls.tool).toBe('create_store');
    expect(cls._skipReasoning).toBe(true);
    expect(cls._classificationSource).toBe('manual_mode');
  });

  it('returns clarify for unknown manual action', () => {
    const cls = buildManualClassification({ action: 'unknown_action', source: 'button' });
    expect(cls.executionPath).toBe('clarify');
    expect(cls.tool).toBe('general_chat');
  });
});

describe('checkRuntimeAuthority', () => {
  it('blocks guest publish_store in manual mode', async () => {
    const result = await checkRuntimeAuthority({
      action: { tool: 'publish_store', parameters: { storeId: 'store-1' } },
      userId: 'guest_abc',
      isGuest: true,
      context: { activeStoreId: 'store-1' },
      mode: 'manual',
      source: 'manual',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Guest cannot run publish_store/i);
  });

  it('allows guest create_store in manual mode', async () => {
    const result = await checkRuntimeAuthority({
      action: { tool: 'create_store', parameters: {} },
      userId: 'guest_abc',
      isGuest: true,
      context: {},
      mode: 'manual',
      source: 'manual',
    });
    expect(result.allowed).toBe(true);
  });
});

describe('resolveManualIntakeRequest', () => {
  it('returns handled classification for explicit button action', async () => {
    const resolved = await resolveManualIntakeRequest({
      req: { headers: { 'x-performer-mode': 'manual' } },
      body: { action: 'create_store', source: 'button' },
      storeId: null,
      draftId: null,
      userId: 'user-1',
      isGuest: false,
    });
    expect(resolved.handled).toBe(true);
    expect(resolved.blocked).toBe(false);
    expect(resolved.classification?.tool).toBe('create_store');
    expect(resolved.skipReasoning).toBe(true);
  });

  it('blocks guest publish_store before execution', async () => {
    const resolved = await resolveManualIntakeRequest({
      req: { headers: { 'x-performer-mode': 'manual' } },
      body: { action: 'publish_store', source: 'button', parameters: { storeId: 'store-1' } },
      storeId: 'store-1',
      draftId: null,
      userId: 'guest_xyz',
      isGuest: true,
    });
    expect(resolved.handled).toBe(true);
    expect(resolved.blocked).toBe(true);
    expect(resolved.authority?.allowed).toBe(false);
  });
});
