import { describe, expect, it } from 'vitest';
import { validateRuntimeConfig } from '../src/config/configValidation.js';
import { createPairedSession } from '../src/identity/deviceSession.js';
import {
  canTransition,
  displayRuntimeReducer,
} from '../src/state/displayRuntimeReducer.js';
import { createInitialRuntimeState } from '../src/state/displayRuntimeState.js';
import type { DisplayManifest } from '../src/playlist/displayManifest.js';

const manifest: DisplayManifest = {
  id: 'p1',
  revision: 1,
  playlist: {
    id: 'p1',
    loop: true,
    defaultDurationMs: 8000,
    items: [
      { id: 'a', type: 'IMAGE', url: 'https://cdn.example.com/a.jpg', durationMs: 1000 },
    ],
  },
  settings: { muted: true, transition: 'NONE', transitionDurationMs: 0, fit: 'COVER' },
};

describe('config validation', () => {
  it('requires https unless local http allowed', () => {
    expect(() =>
      validateRuntimeConfig({
        apiBaseUrl: 'http://example.com',
        platform: 'webos_tv',
        appVersion: '1.0.0',
      }),
    ).toThrow();

    const ok = validateRuntimeConfig({
      apiBaseUrl: 'http://192.168.1.10:3001',
      platform: 'webos_tv',
      appVersion: '1.0.0',
      allowInsecureLocalHttp: true,
    });
    expect(ok.apiBaseUrl).toContain('192.168.1.10');
  });
});

describe('runtime reducer', () => {
  it('boots to unpaired or syncing', () => {
    let state = createInitialRuntimeState();
    state = displayRuntimeReducer(state, { type: 'BOOT_COMPLETED', session: null });
    expect(state.status).toBe('UNPAIRED');

    state = createInitialRuntimeState();
    state = displayRuntimeReducer(state, {
      type: 'BOOT_COMPLETED',
      session: createPairedSession({ deviceId: 'd1', storeId: 's1' }),
    });
    expect(state.status).toBe('SYNCING');
  });

  it('handles pairing success, sync, offline, recovery, unpair', () => {
    let state = createInitialRuntimeState();
    state = displayRuntimeReducer(state, { type: 'BOOT_COMPLETED', session: null });
    state = displayRuntimeReducer(state, { type: 'PAIRING_REQUESTED' });
    state = displayRuntimeReducer(state, {
      type: 'PAIRING_CODE_RECEIVED',
      code: 'ABC123',
      sessionId: 'd1',
    });
    expect(state.status).toBe('PAIRING');
    state = displayRuntimeReducer(state, {
      type: 'PAIRING_APPROVED',
      session: createPairedSession({ deviceId: 'd1' }),
    });
    expect(state.status).toBe('SYNCING');
    state = displayRuntimeReducer(state, { type: 'MANIFEST_RECEIVED', manifest });
    expect(state.status).toBe('READY');
    state = displayRuntimeReducer(state, { type: 'PLAYBACK_STARTED', itemId: 'a' });
    expect(state.status).toBe('PLAYING');
    state = displayRuntimeReducer(state, { type: 'NETWORK_OFFLINE' });
    expect(state.status).toBe('OFFLINE_PLAYBACK');
    state = displayRuntimeReducer(state, { type: 'NETWORK_ONLINE' });
    expect(state.status).toBe('SYNCING');
    state = displayRuntimeReducer(state, { type: 'UNPAIRED' });
    expect(state.status).toBe('UNPAIRED');
  });

  it('ignores invalid transitions deterministically', () => {
    expect(canTransition('UNPAIRED', 'PLAYING')).toBe(false);
    const state = createInitialRuntimeState();
    const next = displayRuntimeReducer(
      { ...state, status: 'UNPAIRED' },
      { type: 'PLAYBACK_STARTED', itemId: 'a' },
    );
    expect(next.status).toBe('UNPAIRED');
  });
});
