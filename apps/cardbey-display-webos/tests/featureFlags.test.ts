import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEATURE_FLAGS,
  resolveFeatureFlags,
  resolveFeatureFlagsFromEnv,
} from '../src/boot/featureFlags.js';

describe('featureFlags', () => {
  it('defaults keep Phase 3+ work disabled', () => {
    expect(DEFAULT_FEATURE_FLAGS.enablePairing).toBe(false);
    expect(DEFAULT_FEATURE_FLAGS.enablePlayback).toBe(false);
    expect(DEFAULT_FEATURE_FLAGS.useFixtureTransport).toBe(false);
  });

  it('merges overrides', () => {
    const flags = resolveFeatureFlags({ enablePairing: true });
    expect(flags.enablePairing).toBe(true);
    expect(flags.enablePlayback).toBe(false);
  });

  it('enables pairing from VITE_ENABLE_PAIRING', () => {
    const { featureFlags, profile } = resolveFeatureFlagsFromEnv({
      DEV: true,
      PROD: false,
      MODE: 'development',
      BASE_URL: '/',
      SSR: false,
      VITE_ENABLE_PAIRING: 'true',
      VITE_DISPLAY_PROFILE: 'staging',
    } as ImportMetaEnv);
    expect(profile).toBe('staging');
    expect(featureFlags.enablePairing).toBe(true);
    expect(featureFlags.useFixtureTransport).toBe(false);
  });

  it('enables fixture transport only in DEV when requested', () => {
    const { featureFlags } = resolveFeatureFlagsFromEnv({
      DEV: true,
      PROD: false,
      MODE: 'development',
      BASE_URL: '/',
      SSR: false,
      VITE_USE_FIXTURE_TRANSPORT: 'true',
      VITE_DISPLAY_PROFILE: 'local',
    } as ImportMetaEnv);
    expect(featureFlags.useFixtureTransport).toBe(true);
    expect(featureFlags.enablePairing).toBe(true);
  });

  it('disables fixture transport in production mode', () => {
    const { featureFlags } = resolveFeatureFlagsFromEnv({
      DEV: false,
      PROD: true,
      MODE: 'production',
      BASE_URL: '/',
      SSR: false,
      VITE_USE_FIXTURE_TRANSPORT: 'true',
      VITE_ENABLE_PAIRING: 'true',
      VITE_DISPLAY_PROFILE: 'production',
    } as ImportMetaEnv);
    expect(featureFlags.useFixtureTransport).toBe(false);
    expect(featureFlags.enablePairing).toBe(true);
  });
});
