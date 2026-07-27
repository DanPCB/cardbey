import {
  defaultPairingEnabled,
  resolveEnvProfile,
  type DisplayEnvProfile,
} from './envProfile.js';

/**
 * Feature flags for Cardbey Display webOS shell.
 */
export type DisplayFeatureFlags = {
  enablePairing: boolean;
  enablePlayback: boolean;
  enableOfflineCache: boolean;
  enableTelemetryUpload: boolean;
  enableDiagnosticsOverlay: boolean;
  /** Explicit fixture transport — never auto-enabled on real API failure */
  useFixtureTransport: boolean;
};

export const DEFAULT_FEATURE_FLAGS: DisplayFeatureFlags = {
  enablePairing: false,
  enablePlayback: false,
  enableOfflineCache: false,
  enableTelemetryUpload: false,
  enableDiagnosticsOverlay: true,
  useFixtureTransport: false,
};

export function resolveFeatureFlags(
  overrides?: Partial<DisplayFeatureFlags>,
): DisplayFeatureFlags {
  return { ...DEFAULT_FEATURE_FLAGS, ...overrides };
}

export function resolveFeatureFlagsFromEnv(
  env: ImportMetaEnv,
  injected?: Partial<DisplayFeatureFlags>,
): { profile: DisplayEnvProfile; featureFlags: DisplayFeatureFlags } {
  const profile = resolveEnvProfile(env.VITE_DISPLAY_PROFILE, env.MODE);
  const fixtureRequested = env.VITE_USE_FIXTURE_TRANSPORT === 'true';
  const useFixtureTransport = Boolean(env.DEV) && fixtureRequested && profile !== 'production';

  let enablePairing: boolean;
  if (typeof injected?.enablePairing === 'boolean') {
    enablePairing = injected.enablePairing;
  } else if (env.VITE_ENABLE_PAIRING === 'true') {
    enablePairing = true;
  } else if (env.VITE_ENABLE_PAIRING === 'false') {
    enablePairing = false;
  } else if (useFixtureTransport) {
    enablePairing = true;
  } else {
    enablePairing = defaultPairingEnabled(profile, undefined);
  }

  const flags = resolveFeatureFlags({
    ...injected,
    enablePairing,
    enablePlayback: injected?.enablePlayback ?? env.VITE_ENABLE_PLAYBACK === 'true',
    enableOfflineCache: injected?.enableOfflineCache ?? false,
    enableTelemetryUpload: injected?.enableTelemetryUpload ?? false,
    enableDiagnosticsOverlay: injected?.enableDiagnosticsOverlay ?? true,
    useFixtureTransport: injected?.useFixtureTransport ?? useFixtureTransport,
  });

  if ((profile === 'production' || !env.DEV) && env.MODE === 'production') {
    flags.useFixtureTransport = false;
  }

  return { profile, featureFlags: flags };
}
