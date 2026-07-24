import type { HttpRequest, HttpResponse, HttpTransport } from '../../src/api/request.js';

export type FakeRoute = {
  match: (req: HttpRequest) => boolean;
  response: HttpResponse<unknown> | ((req: HttpRequest) => HttpResponse<unknown> | Promise<HttpResponse<unknown>>);
};

export function createFakeTransport(routes: FakeRoute[]): HttpTransport & { calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  return {
    calls,
    async request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
      calls.push(req);
      for (const route of routes) {
        if (route.match(req)) {
          const res =
            typeof route.response === 'function' ? await route.response(req) : route.response;
          return res as HttpResponse<T>;
        }
      }
      return { status: 404, headers: {}, data: { ok: false, error: 'not_found' } as T };
    },
  };
}
