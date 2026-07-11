/**
 * Retry with exponential backoff for LLM API calls.
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

function isRetryableError(error: unknown): boolean {
  const err = error as { status?: number; code?: string; message?: string };
  const message = String(err?.message ?? '').toLowerCase();
  const status = err?.status;

  if (status === 429) return true;
  if (status != null && status >= 500) return true;
  if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET') return true;
  if (message.includes('timeout') || message.includes('rate limit')) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? Number.parseInt(process.env.DEEPSEEK_RETRY_ATTEMPTS || '3', 10);
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 10_000;

  let lastError: Error = new Error('retryWithBackoff: no attempts made');

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const retryable = isRetryableError(error);
      if (!retryable || attempt >= maxAttempts) {
        throw lastError;
      }

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      options.onRetry?.(attempt, lastError);
      await sleep(delay);
    }
  }

  throw lastError;
}
