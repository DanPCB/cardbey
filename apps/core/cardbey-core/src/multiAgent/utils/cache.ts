/**
 * In-memory request cache for repeated agent queries.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class RequestCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options?: { ttlMs?: number; maxEntries?: number }) {
    this.ttlMs = options?.ttlMs ?? 5 * 60 * 1000;
    this.maxEntries = options?.maxEntries ?? 200;
  }

  private cacheKey(agent: string, input: string): string {
    return `${agent}::${input}`;
  }

  get(agent: string, input: string): T | undefined {
    const key = this.cacheKey(agent, input);
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(agent: string, input: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(this.cacheKey(agent, input), {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.store.clear();
  }
}

export const globalRequestCache = new RequestCache();
