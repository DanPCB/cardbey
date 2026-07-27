import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadShellConfig } from '../src/config/loadConfig.js';

describe('loadShellConfig', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      __CARDBEY_DISPLAY_CONFIG__: undefined,
      location: { href: 'http://localhost/' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads injected apiBaseUrl and dashboard URL', () => {
    (window as Window & { __CARDBEY_DISPLAY_CONFIG__?: unknown }).__CARDBEY_DISPLAY_CONFIG__ = {
      apiBaseUrl: 'https://cardbey-core-staging.onrender.com',
      dashboardBaseUrl: 'https://cardbey-dashboard-staging.onrender.com',
      featureFlags: { enableDiagnosticsOverlay: true },
    };
    const loaded = loadShellConfig({
      DEV: false,
      PROD: true,
      MODE: 'production',
      BASE_URL: '/',
      SSR: false,
      VITE_DISPLAY_PROFILE: 'staging',
    } as ImportMetaEnv);

    expect(loaded.runtime.apiBaseUrl).toBe('https://cardbey-core-staging.onrender.com');
    expect(loaded.dashboardBaseUrl).toBe('https://cardbey-dashboard-staging.onrender.com');
    expect(loaded.runtime.platform).toBe('webos_tv');
    expect(loaded.featureFlags.enablePairing).toBe(false);
  });

  it('throws when production has no api base', () => {
    expect(() =>
      loadShellConfig({
        DEV: false,
        PROD: true,
        MODE: 'production',
        BASE_URL: '/',
        SSR: false,
      } as ImportMetaEnv),
    ).toThrow(/apiBaseUrl/);
  });
});
