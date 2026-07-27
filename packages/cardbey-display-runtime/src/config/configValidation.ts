import { displayError } from '../errors/displayError.js';
import {
  defaultRuntimeConfig,
  type DisplayRuntimeConfig,
  type DisplayRuntimeConfigInput,
} from './runtimeConfig.js';

const PRIVATE_HOST =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/i;

function assertPositive(name: string, value: number, min = 1): void {
  if (!Number.isFinite(value) || value < min) {
    throw displayError('DISPLAY_CONFIG_INVALID', `${name} must be >= ${min}`, {
      retryable: false,
      context: { name, value },
    });
  }
}

export function normalizeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw displayError('DISPLAY_CONFIG_INVALID', 'apiBaseUrl is required', { retryable: false });
  }
  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch (cause) {
    throw displayError('DISPLAY_CONFIG_INVALID', 'apiBaseUrl is not a valid URL', {
      retryable: false,
      cause,
    });
  }
  // Strip trailing slash; API client joins /api/...
  return url.toString().replace(/\/+$/, '');
}

export function assertApiBaseUrlAllowed(
  apiBaseUrl: string,
  allowInsecureLocalHttp: boolean,
): void {
  const url = new URL(apiBaseUrl);
  const host = url.hostname;
  const isLocal = PRIVATE_HOST.test(host);
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && allowInsecureLocalHttp && isLocal) return;
  throw displayError(
    'DISPLAY_CONFIG_INVALID',
    allowInsecureLocalHttp
      ? 'apiBaseUrl must use https:// (or http:// only for local/private hosts)'
      : 'apiBaseUrl must use https://',
    { retryable: false, context: { protocol: url.protocol, host } },
  );
}

export function validateRuntimeConfig(input: DisplayRuntimeConfigInput): DisplayRuntimeConfig {
  const config = defaultRuntimeConfig({
    ...input,
    apiBaseUrl: normalizeApiBaseUrl(input.apiBaseUrl),
  });

  if (!config.platform.trim()) {
    throw displayError('DISPLAY_CONFIG_INVALID', 'platform is required', { retryable: false });
  }
  if (!config.appVersion.trim()) {
    throw displayError('DISPLAY_CONFIG_INVALID', 'appVersion is required', { retryable: false });
  }

  assertApiBaseUrlAllowed(config.apiBaseUrl, config.allowInsecureLocalHttp);

  assertPositive('heartbeatIntervalMs', config.heartbeatIntervalMs, 1_000);
  assertPositive('playlistSyncIntervalMs', config.playlistSyncIntervalMs, 1_000);
  assertPositive('pairingPollIntervalMs', config.pairingPollIntervalMs, 200);
  assertPositive('requestTimeoutMs', config.requestTimeoutMs, 100);
  assertPositive('mediaTimeoutMs', config.mediaTimeoutMs, 100);
  assertPositive('defaultImageDurationMs', config.defaultImageDurationMs, 100);
  assertPositive('retry.initialDelayMs', config.retry.initialDelayMs);
  assertPositive('retry.maximumDelayMs', config.retry.maximumDelayMs);
  assertPositive('retry.multiplier', config.retry.multiplier, 1);
  if (config.retry.jitterRatio < 0 || config.retry.jitterRatio > 1) {
    throw displayError('DISPLAY_CONFIG_INVALID', 'retry.jitterRatio must be between 0 and 1', {
      retryable: false,
    });
  }
  if (config.retry.maximumDelayMs < config.retry.initialDelayMs) {
    throw displayError(
      'DISPLAY_CONFIG_INVALID',
      'retry.maximumDelayMs must be >= retry.initialDelayMs',
      { retryable: false },
    );
  }

  return config;
}

/** Join api base with a path that may or may not start with /api */
export function apiUrl(apiBaseUrl: string, path: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '');
  const cleaned = path.startsWith('/') ? path : `/${path}`;
  if (cleaned.startsWith('/api/')) return `${base}${cleaned}`;
  return `${base}/api${cleaned.startsWith('/') ? cleaned : `/${cleaned}`}`;
}
