import type { DisplayStorage } from './displayStorage.js';

export function createMemoryStorage(initial?: Record<string, unknown>): DisplayStorage {
  const map = new Map<string, unknown>(Object.entries(initial ?? {}));
  return {
    async get<T>(key: string): Promise<T | null> {
      if (!map.has(key)) return null;
      return map.get(key) as T;
    },
    async set<T>(key: string, value: T): Promise<void> {
      map.set(key, value);
    },
    async remove(key: string): Promise<void> {
      map.delete(key);
    },
  };
}
