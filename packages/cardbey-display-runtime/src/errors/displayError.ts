import type { DisplayErrorCode } from './errorCodes.js';

export type DisplayErrorDetails = {
  code: DisplayErrorCode;
  message: string;
  retryable: boolean;
  cause?: unknown;
  context?: Record<string, unknown>;
  httpStatus?: number;
};

export class DisplayError extends Error {
  readonly code: DisplayErrorCode;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;
  readonly httpStatus?: number;

  constructor(details: DisplayErrorDetails) {
    super(details.message);
    this.name = 'DisplayError';
    this.code = details.code;
    this.retryable = details.retryable;
    this.cause = details.cause;
    this.context = details.context;
    this.httpStatus = details.httpStatus;
  }

  static isDisplayError(value: unknown): value is DisplayError {
    return value instanceof DisplayError;
  }
}

export function displayError(
  code: DisplayErrorCode,
  message: string,
  options: Omit<DisplayErrorDetails, 'code' | 'message'> = { retryable: false },
): DisplayError {
  return new DisplayError({ code, message, ...options });
}
