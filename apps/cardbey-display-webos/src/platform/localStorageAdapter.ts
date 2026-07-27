import type { DisplayStorage } from '@cardbey/display-runtime';

/**
 * Persistent storage for webOS Chromium (localStorage).
 * Always call Storage methods with the Storage object as receiver —
 * detached getItem/setItem throw Illegal invocation on Chrome 68.
 */
export function createLocalStorageAdapter(
  storage: Storage = window.localStorage,
): DisplayStorage {
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = Storage.prototype.getItem.call(storage, key);
      if (raw == null || raw === '') return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      Storage.prototype.setItem.call(storage, key, JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      Storage.prototype.removeItem.call(storage, key);
    },
  };
}
