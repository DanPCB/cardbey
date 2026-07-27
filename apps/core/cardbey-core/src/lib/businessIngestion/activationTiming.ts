/**
 * Business Activation Runway V2.1 — lifecycle timing helpers.
 */

import type { IngestedSeedRecord } from './types.js';

export const ACTIVATION_STALL_THRESHOLD_MS = 72 * 60 * 60 * 1000;

export type ActivationLifecycleTimestamps = {
  firstSeenAt: string | null;
  claimStartedAt: string | null;
  verifiedAt: string | null;
  activatedAt: string | null;
  operatingStartedAt: string | null;
  verificationDurationMs: number | null;
  activationDurationMs: number | null;
};

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function diffMs(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  const start = parseMs(startIso);
  const end = parseMs(endIso);
  if (start == null || end == null || end < start) return null;
  return end - start;
}

export function computeActivationDurations(
  seed: Pick<
    IngestedSeedRecord,
    'claimStartedAt' | 'verifiedAt' | 'activatedAt'
  >,
): Pick<ActivationLifecycleTimestamps, 'verificationDurationMs' | 'activationDurationMs'> {
  return {
    verificationDurationMs: diffMs(seed.claimStartedAt, seed.verifiedAt),
    activationDurationMs: diffMs(seed.verifiedAt, seed.activatedAt),
  };
}

export function withActivationDurations(seed: IngestedSeedRecord): IngestedSeedRecord {
  const durations = computeActivationDurations(seed);
  return { ...seed, ...durations };
}

export function isActivationStalled(
  seed: Pick<IngestedSeedRecord, 'claimStartedAt' | 'verifiedAt' | 'verificationStatus'>,
  nowMs = Date.now(),
  thresholdMs = ACTIVATION_STALL_THRESHOLD_MS,
): boolean {
  if (seed.verifiedAt) return false;
  if (seed.verificationStatus !== 'seeded_claimable') return false;
  const started = parseMs(seed.claimStartedAt);
  if (started == null) return false;
  return nowMs - started >= thresholdMs;
}

export function averageDurationMs(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && v >= 0);
  if (!nums.length) return null;
  return Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length);
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}
