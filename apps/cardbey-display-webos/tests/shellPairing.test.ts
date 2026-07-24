import { afterEach, describe, expect, it } from 'vitest';
import {
  createDeviceApiClient,
  createMemoryStorage,
  createDeviceIdentity,
  createPairedSession,
  persistDeviceSession,
  validateRuntimeConfig,
  FakeClock,
} from '@cardbey/display-runtime';
import { DisplayShellApp } from '../src/shell/DisplayShellApp.js';
import { createFixtureTransport } from '../src/runtime/fixtureTransport.js';
import { loadShellConfig } from '../src/config/loadConfig.js';

function makeRoot(): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

describe('DisplayShellApp pairing', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.__CARDBEY_DISPLAY_CONFIG__;
  });

  it('pairs via fixture transport, persists session, and activates', async () => {
    if (typeof document === 'undefined') return;

    window.__CARDBEY_DISPLAY_CONFIG__ = {
      apiBaseUrl: 'https://cardbey-core-staging.onrender.com',
      dashboardBaseUrl: 'https://cardbey-dashboard-staging.onrender.com',
      featureFlags: { enablePairing: true, useFixtureTransport: true },
    };

    const storage = createMemoryStorage();
    const config = loadShellConfig({
      DEV: true,
      PROD: false,
      MODE: 'development',
      BASE_URL: '/',
      SSR: false,
      VITE_ENABLE_PAIRING: 'true',
      VITE_USE_FIXTURE_TRANSPORT: 'true',
      VITE_DISPLAY_PROFILE: 'local',
      VITE_API_BASE_URL: 'https://cardbey-core-staging.onrender.com',
      VITE_DASHBOARD_BASE_URL: 'https://cardbey-dashboard-staging.onrender.com',
    } as ImportMetaEnv);

    const runtimeConfig = validateRuntimeConfig({
      apiBaseUrl: config.runtime.apiBaseUrl,
      platform: 'webos_tv',
      appVersion: '0.1.0',
      pairingPollIntervalMs: 200,
      heartbeatIntervalMs: 60_000,
      playlistSyncIntervalMs: 60_000,
      allowInsecureLocalHttp: true,
    });

    const api = createDeviceApiClient({
      config: runtimeConfig,
      transport: createFixtureTransport('pending_then_claimed'),
    });

    const root = makeRoot();
    const app = new DisplayShellApp({
      root,
      config: {
        ...config,
        runtime: runtimeConfig,
        featureFlags: { ...config.featureFlags, enablePairing: true, useFixtureTransport: true },
      },
      storage,
      api,
      clock: new FakeClock(new Date('2026-07-24T03:00:00.000Z')),
      autoStartPairing: true,
    });

    // Seed identity so request-pairing uses stable id (fixture device id)
    await storage.set('cardbey.display.deviceIdentity', createDeviceIdentity({
      deviceId: 'fixture-device-1f2d79a8-f321-4377-af7e-c6130d6bf55c',
      installationId: 'install-fixture',
      platform: 'webos_tv',
      appVersion: '0.1.0',
    }));

    await app.start();
    await new Promise((r) => setTimeout(r, 80));

    expect(app.getPairingView().status).toBe('COMPLETED');
    expect(app.getState().session?.pairingState).toBe('PAIRED');
    expect(app.getActivation()?.isActivatedFor(
      'fixture-device-1f2d79a8-f321-4377-af7e-c6130d6bf55c',
    )).toBe(true);
    expect(root.textContent).toMatch(/connected|Waiting for content/i);

    app.stop();
  });

  it('restores paired session without starting pairing', async () => {
    if (typeof document === 'undefined') return;

    const storage = createMemoryStorage();
    const deviceId = 'fixture-device-1f2d79a8-f321-4377-af7e-c6130d6bf55c';
    await storage.set('cardbey.display.deviceIdentity', createDeviceIdentity({
      deviceId,
      installationId: 'install-fixture',
      platform: 'webos_tv',
      appVersion: '0.1.0',
    }));
    await persistDeviceSession(storage, createPairedSession({ deviceId }));

    const runtimeConfig = validateRuntimeConfig({
      apiBaseUrl: 'https://cardbey-core.example.com',
      platform: 'webos_tv',
      appVersion: '0.1.0',
      heartbeatIntervalMs: 60_000,
      playlistSyncIntervalMs: 60_000,
    });
    const api = createDeviceApiClient({
      config: runtimeConfig,
      transport: createFixtureTransport('empty_playlist'),
    });

    const root = makeRoot();
    const app = new DisplayShellApp({
      root,
      config: {
        runtime: runtimeConfig,
        featureFlags: {
          enablePairing: true,
          enablePlayback: false,
          enableOfflineCache: false,
          enableTelemetryUpload: false,
          enableDiagnosticsOverlay: true,
          useFixtureTransport: true,
        },
        profile: 'local',
        dashboardBaseUrl: 'https://cardbey-dashboard-staging.onrender.com',
      },
      storage,
      api,
      autoStartPairing: true,
    });

    await app.start();
    await new Promise((r) => setTimeout(r, 40));
    expect(app.getPairingView().status).toBe('COMPLETED');
    expect(app.getState().status === 'READY' || app.getState().status === 'SYNCING').toBe(true);
    app.stop();
  });
});
