import type { Clock } from '../platform/clock.js';

/** Prefer backend expiresAt; otherwise convert TTL once at receipt. */
export function resolvePairingExpiresAt(
  input: { expiresAt?: string; ttlLeftMs?: number; ttlSeconds?: number },
  clock: Clock,
): string | undefined {
  if (typeof input.expiresAt === 'string' && input.expiresAt.trim()) {
    return input.expiresAt.trim();
  }
  const now = clock.now().getTime();
  if (typeof input.ttlLeftMs === 'number' && Number.isFinite(input.ttlLeftMs)) {
    return new Date(now + Math.max(0, input.ttlLeftMs)).toISOString();
  }
  if (typeof input.ttlSeconds === 'number' && Number.isFinite(input.ttlSeconds)) {
    return new Date(now + Math.max(0, input.ttlSeconds) * 1000).toISOString();
  }
  return undefined;
}

export function secondsRemainingUntil(expiresAt: string | undefined, clock: Clock): number | undefined {
  if (!expiresAt) return undefined;
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return undefined;
  return Math.max(0, Math.floor((end - clock.now().getTime()) / 1000));
}
