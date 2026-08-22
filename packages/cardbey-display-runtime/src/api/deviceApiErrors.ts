import { displayError, DisplayError } from '../errors/displayError.js';

function readStringField(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

export function mapHttpFailure(
  status: number,
  body: unknown,
  context: Record<string, unknown> = {},
): DisplayError {
  const message = readStringField(body, 'message') ?? `HTTP ${status}`;
  const code = readStringField(body, 'error');

  if (status === 408 || status === 504) {
    return displayError('DISPLAY_REQUEST_TIMEOUT', message, {
      retryable: true,
      httpStatus: status,
      context: { ...context, apiError: code },
    });
  }

  if (code === 'code_expired' || message.toLowerCase().includes('expired')) {
    return displayError('DISPLAY_PAIRING_EXPIRED', message, {
      retryable: false,
      httpStatus: status,
      context: { ...context, apiError: code },
    });
  }

  const retryable = status >= 500 || status === 429;
  return displayError('DISPLAY_API_ERROR', message, {
    retryable,
    httpStatus: status,
    context: { ...context, apiError: code },
  });
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message));
}
