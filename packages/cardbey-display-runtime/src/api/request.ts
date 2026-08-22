import {
  browserFetch,
  browserSetTimeout,
  browserClearTimeout,
  isIllegalInvocationError,
  normalizeFetchImpl,
  type BrowserFetch,
} from '../platform/browserHost.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type HttpRequest = {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type HttpResponse<T> = {
  status: number;
  headers: Record<string, string>;
  data: T;
};

export interface HttpTransport {
  request<T>(request: HttpRequest): Promise<HttpResponse<T>>;
}

/**
 * Optional fetch-based transport.
 * Always invokes browser fetch with the window receiver on legacy webOS.
 */
export function createFetchTransport(fetchImpl?: BrowserFetch | null): HttpTransport {
  const runFetch = normalizeFetchImpl(fetchImpl ?? null);

  return {
    async request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
      const controller = new AbortController();
      const timeout = req.timeoutMs ?? 15_000;
      const timer = browserSetTimeout(() => controller.abort(), timeout);
      const onAbort = () => controller.abort();
      if (req.signal) {
        req.signal.addEventListener('abort', onAbort);
      }

      try {
        const init: RequestInit = {
          method: req.method,
          headers: {
            Accept: 'application/json',
            ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...req.headers,
          },
          signal: controller.signal,
        };
        if (req.body !== undefined) {
          init.body = JSON.stringify(req.body);
        }

        let res: Response;
        try {
          res = await runFetch(req.url, init);
        } catch (cause) {
          if (isIllegalInvocationError(cause)) {
            const err = new Error('MANIFEST_FETCH_INVOCATION_FAILED');
            (err as Error & { cause?: unknown; code?: string }).cause = cause;
            (err as Error & { code?: string }).code = 'MANIFEST_FETCH_INVOCATION_FAILED';
            throw err;
          }
          throw cause;
        }

        const headerMap: Record<string, string> = {};
        if (res.headers && typeof res.headers.forEach === 'function') {
          res.headers.forEach((value, key) => {
            headerMap[key.toLowerCase()] = value;
          });
        }

        // Keep Response#text / #json on the response receiver (do not detach).
        const text = await res.text();
        let data: T;
        if (!text) {
          data = undefined as T;
        } else {
          try {
            data = JSON.parse(text) as T;
          } catch (cause) {
            const err = new Error('Failed to parse JSON response');
            (err as Error & { cause?: unknown; status?: number }).cause = cause;
            (err as Error & { status?: number }).status = res.status;
            throw err;
          }
        }

        return { status: res.status, headers: headerMap, data };
      } finally {
        browserClearTimeout(timer);
        if (req.signal) {
          req.signal.removeEventListener('abort', onAbort);
        }
      }
    },
  };
}

/** Re-export for shells that want the canonical wrapper directly. */
export { browserFetch, normalizeFetchImpl };
