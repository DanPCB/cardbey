import type { DisplayRetryConfig } from '../config/runtimeConfig.js';

export function computeBackoffDelayMs(
  attempt: number,
  retry: DisplayRetryConfig,
  random: () => number = Math.random,
): number {
  const exp = Math.min(
    retry.maximumDelayMs,
    retry.initialDelayMs * Math.pow(retry.multiplier, Math.max(0, attempt)),
  );
  const jitter = exp * retry.jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(exp + jitter));
}

export class BackoffTracker {
  private attempt = 0;

  constructor(
    private readonly retry: DisplayRetryConfig,
    private readonly random: () => number = Math.random,
  ) {}

  nextDelayMs(): number {
    const delay = computeBackoffDelayMs(this.attempt, this.retry, this.random);
    this.attempt += 1;
    return delay;
  }

  reset(): void {
    this.attempt = 0;
  }

  getAttempt(): number {
    return this.attempt;
  }
}
