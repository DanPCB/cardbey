import type { DisplayError } from '../errors/displayError.js';
import type { DisplayRetryConfig } from '../config/runtimeConfig.js';
import { computeBackoffDelayMs } from './backoff.js';

export function shouldRetryError(err: DisplayError): boolean {
  return err.retryable === true;
}

export function nextRetryDelay(
  attempt: number,
  retry: DisplayRetryConfig,
  random?: () => number,
): number {
  return computeBackoffDelayMs(attempt, retry, random);
}
