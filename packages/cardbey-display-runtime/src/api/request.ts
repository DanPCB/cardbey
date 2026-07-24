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
 * Optional fetch-based transport. Uses globalThis.fetch when available.
 * Shells may inject a custom transport instead.
 */
export function createFetchTransport(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): HttpTransport {
  return {
    async request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
      const controller = new AbortController();
      const timeout = req.timeoutMs ?? 15_000;
      const timer = setTimeout(() => controller.abort(), timeout);
      const onAbort = () => controller.abort();
      req.signal?.addEventListener('abort', onAbort);

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

        const res = await fetchImpl(req.url, init);
        const headerMap: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          headerMap[key.toLowerCase()] = value;
        });

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
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}
