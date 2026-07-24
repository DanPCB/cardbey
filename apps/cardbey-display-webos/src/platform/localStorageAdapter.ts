import type { DisplayStorage } from '@cardbey/display-runtime';

/**
 * Persistent storage for webOS Chromium (localStorage).
 * Values are JSON-serialised. Secrets must never be logged by callers.
 */
export function createLocalStorageAdapter(
  storage: Storage = window.localStorage,
): DisplayStorage {
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = storage.getItem(key);
      if (raw == null || raw === '') return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      storage.setItem(key, JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      storage.removeItem(key);
    },
  };
}
