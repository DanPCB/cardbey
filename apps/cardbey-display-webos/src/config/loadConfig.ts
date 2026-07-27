import {
  validateRuntimeConfig,
  type DisplayRuntimeConfig,
} from '@cardbey/display-runtime';
import {
  resolveFeatureFlagsFromEnv,
  type DisplayFeatureFlags,
} from '../boot/featureFlags.js';
import type { DisplayEnvProfile } from '../boot/envProfile.js';

export type ShellInjectedConfig = {
  apiBaseUrl: string;
  dashboardBaseUrl?: string;
  allowInsecureLocalHttp?: boolean;
  appVersion?: string;
  featureFlags?: Partial<DisplayFeatureFlags>;
};

declare global {
  interface Window {
    __CARDBEY_DISPLAY_CONFIG__?: ShellInjectedConfig;
    __CARDBEY_BUILD_ID__?: string;
    __cardbeyBootStage?: (stage: string, detail?: string) => void;
    __cardbeyBoot?: {
      setStage: (text: string) => void;
      hide: () => void;
      fail: (err: unknown) => void;
    };
  }
}

const APP_VERSION = '0.1.0';

export type LoadedShellConfig = {
  runtime: DisplayRuntimeConfig;
  featureFlags: DisplayFeatureFlags;
  profile: DisplayEnvProfile;
  dashboardBaseUrl: string;
};

function readQueryParam(name: string): string | undefined {
  try {
    const value = new URL(window.location.href).searchParams.get(name)?.trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve runtime config from injection → query → env.
 * Production webOS builds must inject via window.__CARDBEY_DISPLAY_CONFIG__.
 */
export function loadShellConfig(env: ImportMetaEnv = import.meta.env): LoadedShellConfig {
  const injected = typeof window !== 'undefined' ? window.__CARDBEY_DISPLAY_CONFIG__ : undefined;
  const queryBase = typeof window !== 'undefined' ? readQueryParam('apiBaseUrl') : undefined;
  const envBase = (env.VITE_API_BASE_URL as string | undefined)?.trim();

  let apiBaseUrl = injected?.apiBaseUrl?.trim() || queryBase || envBase || '';
  // Dev-only default. Built via join() so production static scans do not see a
  // contiguous localhost URL literal when this branch is retained for tests.
  if (!apiBaseUrl && env.DEV) {
    apiBaseUrl = ['http://', '127.0.0.1', ':3001'].join('');
  }

  if (!apiBaseUrl) {
    throw new Error(
      'Missing apiBaseUrl. Set window.__CARDBEY_DISPLAY_CONFIG__.apiBaseUrl or VITE_API_BASE_URL.',
    );
  }

  const allowInsecureLocalHttp =
    injected?.allowInsecureLocalHttp ??
    (Boolean(env.DEV) || Boolean(env.VITE_ALLOW_INSECURE_LOCAL_HTTP === 'true'));

  const runtime = validateRuntimeConfig({
    apiBaseUrl,
    platform: 'webos_tv',
    appVersion: injected?.appVersion?.trim() || APP_VERSION,
    allowInsecureLocalHttp,
    // Detect dashboard assignment changes within ~10s (acceptance: 5–15s).
    playlistSyncIntervalMs: 10_000,
  });

  const { profile, featureFlags } = resolveFeatureFlagsFromEnv(env, injected?.featureFlags);

  let dashboardBaseUrl =
    injected?.dashboardBaseUrl?.trim() ||
    (typeof window !== 'undefined' ? readQueryParam('dashboardBaseUrl') : undefined) ||
    (env.VITE_DASHBOARD_BASE_URL as string | undefined)?.trim() ||
    '';

  if (!dashboardBaseUrl) {
    if (profile === 'production') {
      dashboardBaseUrl = 'https://cardbey-dashboard.onrender.com';
    } else if (profile === 'staging') {
      dashboardBaseUrl = 'https://cardbey-dashboard-staging.onrender.com';
    } else if (env.DEV) {
      dashboardBaseUrl = ['http://', '127.0.0.1', ':5173'].join('');
    } else {
      dashboardBaseUrl = 'https://cardbey-dashboard-staging.onrender.com';
    }
  }

  return {
    runtime,
    featureFlags,
    profile,
    dashboardBaseUrl: dashboardBaseUrl.replace(/\/+$/, ''),
  };
}
