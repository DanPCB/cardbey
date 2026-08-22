/**
 * Chrome 68 / webOS-safe host API wrappers.
 * Native browser methods throw TypeError: Illegal invocation when called
 * without their expected receiver (window / Storage / etc.).
 */

export type BrowserFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function readGlobalFetch(): BrowserFetch | null {
  if (hasWindow() && typeof window.fetch === 'function') {
    return window.fetch.bind(window) as BrowserFetch;
  }
  const g =
    typeof globalThis !== 'undefined'
      ? (globalThis as { fetch?: BrowserFetch })
      : undefined;
  if (g && typeof g.fetch === 'function') {
    return g.fetch.bind(g) as BrowserFetch;
  }
  return null;
}

/**
 * Canonical TV-safe fetch. Prefer .call(window, ...) on browsers.
 */
export function browserFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (hasWindow() && typeof window.fetch === 'function') {
    return window.fetch.call(window, input, init) as Promise<Response>;
  }
  const bound = readGlobalFetch();
  if (!bound) {
    return Promise.reject(new Error('FETCH_NOT_AVAILABLE'));
  }
  return bound(input, init);
}

function isNativeBrowserFetch(fn: unknown): boolean {
  if (typeof fn !== 'function') return false;
  if (hasWindow() && fn === window.fetch) return true;
  try {
    return /\[native code\]/.test(Function.prototype.toString.call(fn));
  } catch {
    return false;
  }
}

/**
 * Normalize an injected fetch implementation.
 * - Native browser fetch → wrap with window receiver
 * - Test mocks / already-bound / Node fetch → call as-is
 */
export function normalizeFetchImpl(fetchImpl?: BrowserFetch | null): BrowserFetch {
  if (!fetchImpl) return browserFetch;
  if (isNativeBrowserFetch(fetchImpl)) {
    return browserFetch;
  }
  return function safeInjectedFetch(input, init) {
    return fetchImpl(input, init);
  };
}

export function browserSetTimeout(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => void,
  timeout?: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
): ReturnType<typeof setTimeout> {
  if (hasWindow() && typeof window.setTimeout === 'function') {
    return (window.setTimeout as Function).call(
      window,
      handler,
      timeout,
      ...args,
    ) as ReturnType<typeof setTimeout>;
  }
  return setTimeout(handler, timeout, ...args) as ReturnType<typeof setTimeout>;
}

export function browserClearTimeout(id: ReturnType<typeof setTimeout> | undefined): void {
  if (id == null) return;
  if (hasWindow() && typeof window.clearTimeout === 'function') {
    (window.clearTimeout as Function).call(window, id);
    return;
  }
  clearTimeout(id);
}

export function browserSetInterval(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => void,
  timeout?: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
): ReturnType<typeof setInterval> {
  if (hasWindow() && typeof window.setInterval === 'function') {
    return (window.setInterval as Function).call(
      window,
      handler,
      timeout,
      ...args,
    ) as ReturnType<typeof setInterval>;
  }
  return setInterval(handler, timeout, ...args) as ReturnType<typeof setInterval>;
}

export function browserClearInterval(id: ReturnType<typeof setInterval> | undefined): void {
  if (id == null) return;
  if (hasWindow() && typeof window.clearInterval === 'function') {
    (window.clearInterval as Function).call(window, id);
    return;
  }
  clearInterval(id);
}

export function browserSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    browserSetTimeout(() => {
      resolve();
    }, ms);
  });
}

export function isIllegalInvocationError(err: unknown): boolean {
  if (!err) return false;
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : String((err as { message?: unknown })?.message ?? err);
  if (/illegal invocation/i.test(message)) return true;
  const cause = (err as { cause?: unknown })?.cause;
  if (cause && cause !== err) return isIllegalInvocationError(cause);
  return false;
}
