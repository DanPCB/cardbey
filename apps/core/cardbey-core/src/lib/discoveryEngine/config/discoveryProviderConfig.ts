/**
 * Discovery provider throttle / retry / cache configuration.
 */
import path from 'node:path';

export type DiscoveryProviderConfig = {
  overpassRequestDelayMs: number;
  overpassMaxRetries: number;
  overpassBackoffMs: number;
  overpassSlowModeMultiplier: number;
  cacheDir: string;
  cacheTtlDryRunMs: number;
  cacheTtlLiveMs: number;
};

let cached: DiscoveryProviderConfig | null = null;

function readInt(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getDiscoveryProviderConfig(): DiscoveryProviderConfig {
  if (cached) return cached;
  cached = {
    overpassRequestDelayMs: readInt('DISCOVERY_OVERPASS_REQUEST_DELAY_MS', 1200),
    overpassMaxRetries: readInt('DISCOVERY_OVERPASS_MAX_RETRIES', 2),
    overpassBackoffMs: readInt('DISCOVERY_OVERPASS_BACKOFF_MS', 2000),
    overpassSlowModeMultiplier: 2,
    cacheDir:
      process.env.DISCOVERY_CACHE_DIR?.trim() ||
      path.join(process.cwd(), 'data', 'discoveryCache'),
    cacheTtlDryRunMs: 24 * 60 * 60 * 1000,
    cacheTtlLiveMs: 7 * 24 * 60 * 60 * 1000,
  };
  return cached;
}

/** Test hook */
export function resetDiscoveryProviderConfigForTests(): void {
  cached = null;
}

export function requestsPerMinuteFromDelay(delayMs: number, slowMode = false): number {
  const cfg = getDiscoveryProviderConfig();
  const effective = delayMs * (slowMode ? cfg.overpassSlowModeMultiplier : 1);
  if (effective <= 0) return 60;
  return Math.max(1, Math.floor(60_000 / effective));
}
