/**
 * Structured development runtime errors.
 */

export interface DevelopmentErrorBody {
  code: string;
  message: string;
  currentState?: string;
  requiredState?: string;
  requestId?: string;
}

export class DevelopmentError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly body: DevelopmentErrorBody;

  constructor(statusCode: number, code: string, message: string, extra?: Partial<DevelopmentErrorBody>) {
    super(message);
    this.name = 'DevelopmentError';
    this.statusCode = statusCode;
    this.code = code;
    this.body = { code, message, ...extra };
  }
}

export function isDevelopmentError(err: unknown): err is DevelopmentError {
  return err instanceof DevelopmentError;
}

export function formatApiError(err: unknown): { success: false; error: DevelopmentErrorBody } {
  if (isDevelopmentError(err)) {
    return { success: false, error: err.body };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    success: false,
    error: { code: 'INTERNAL_ERROR', message: message || 'Unknown error' },
  };
}
