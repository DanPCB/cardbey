import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  isLanguageDashboardPrefBridgeV1Enabled,
  getLanguageIntelligenceDiagnostics,
  __reinitializeLanguageIntelligenceRegistriesForTests,
} from '../index.js';

describe('Stage 3 — dashboard pref bridge flags', () => {
  const keys = [
    'ENABLE_LANGUAGE_INTELLIGENCE_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1',
    'ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1',
    'ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1',
  ];
  /** @type {Record<string, string|undefined>} */
  const prev = {};

  beforeEach(() => {
    for (const k of keys) prev[k] = process.env[k];
    __reinitializeLanguageIntelligenceRegistriesForTests();
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('fail closed when unset', () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1 = 'true';
    delete process.env.ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1;
    expect(isLanguageDashboardPrefBridgeV1Enabled()).toBe(false);
  });

  it('requires preferences parent', () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1 = 'false';
    process.env.ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1 = 'true';
    expect(isLanguageDashboardPrefBridgeV1Enabled()).toBe(false);
  });

  it('diagnostics expose chrome-only surface when on', () => {
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_ENGINE_V1 = 'true';
    process.env.ENABLE_LANGUAGE_INTELLIGENCE_PREFERENCES_V1 = 'true';
    process.env.ENABLE_LANGUAGE_DASHBOARD_PREF_BRIDGE_V1 = 'true';
    delete process.env.ENABLE_LANGUAGE_AUTO_RESOLUTION_V1;
    delete process.env.ENABLE_LANGUAGE_STOREFRONT_CONSUMPTION_CUTOVER_V1;
    const d = getLanguageIntelligenceDiagnostics();
    expect(d.authoritative).toBe(false);
    expect(d.extensions).toContain('dash-bridge');
    expect(d.dashboardPrefBridge.enabled).toBe(true);
    expect(d.dashboardPrefBridge.surfacesWired).toEqual(['dashboard_chrome']);
    expect(d.dashboardPrefBridge.silentLocalStorageMigration).toBe(false);
    expect(d.consumption.surfacesWired).toEqual([]);
  });
});
