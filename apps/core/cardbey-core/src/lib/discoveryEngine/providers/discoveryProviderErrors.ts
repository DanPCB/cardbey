/**
 * Structured discovery provider errors — operator-friendly, non-fatal by default.
 */

export type DiscoveryProviderErrorCode =
  | 'RATE_LIMITED'
  | 'HTTP_ERROR'
  | 'NETWORK_ERROR'
  | 'GEOCODE_FAILED'
  | 'PROVIDER_UNAVAILABLE';

export type DiscoveryProviderError = {
  code: DiscoveryProviderErrorCode;
  provider: string;
  message: string;
  retryAfterSeconds?: number;
  suburb?: string;
  category?: string;
  categories?: string[];
  httpStatus?: number;
};

export class DiscoveryProviderRateLimitError extends Error {
  readonly code = 'RATE_LIMITED' as const;
  readonly provider: string;
  readonly retryAfterSeconds: number;
  readonly suburb?: string;
  readonly category?: string;
  readonly categories?: string[];

  constructor(input: {
    provider?: string;
    retryAfterSeconds?: number;
    suburb?: string;
    category?: string;
    categories?: string[];
    message?: string;
  }) {
    const provider = input.provider ?? 'osm_overpass';
    super(
      input.message ??
        `Public map provider rate limited (${provider})${input.suburb ? ` — ${input.suburb}` : ''}`,
    );
    this.name = 'DiscoveryProviderRateLimitError';
    this.provider = provider;
    this.retryAfterSeconds = input.retryAfterSeconds ?? 30;
    this.suburb = input.suburb;
    this.category = input.category;
    this.categories = input.categories;
  }

  toStructured(): DiscoveryProviderError {
    return {
      code: 'RATE_LIMITED',
      provider: this.provider,
      message: this.message,
      retryAfterSeconds: this.retryAfterSeconds,
      suburb: this.suburb,
      category: this.category,
      categories: this.categories,
      httpStatus: 429,
    };
  }
}

export function isRateLimitError(err: unknown): err is DiscoveryProviderRateLimitError {
  return err instanceof DiscoveryProviderRateLimitError;
}

export function toDiscoveryProviderError(
  err: unknown,
  context: { provider: string; suburb?: string; category?: string; categories?: string[] },
): DiscoveryProviderError {
  if (isRateLimitError(err)) return err.toStructured();
  const message = err instanceof Error ? err.message : String(err);
  const httpMatch = /HTTP (\d+)/.exec(message);
  return {
    code: httpMatch?.[1] === '429' ? 'RATE_LIMITED' : 'HTTP_ERROR',
    provider: context.provider,
    message,
    suburb: context.suburb,
    category: context.category,
    categories: context.categories,
    httpStatus: httpMatch ? Number(httpMatch[1]) : undefined,
    retryAfterSeconds: httpMatch?.[1] === '429' ? 30 : undefined,
  };
}
