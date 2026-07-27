import type { Clock } from './clock.js';

/**
 * Minimal platform hooks. Shells (webOS / Tizen / browser) implement these.
 * Shared runtime never touches DOM, Luna, or Android APIs.
 */
export interface PlatformAdapter {
  readonly platform: string;
  readonly clock: Clock;
  /** Optional stable installation id generator / reader. */
  getInstallationId?(): Promise<string>;
  /** Optional random UUID helper; defaults to crypto.randomUUID when available. */
  createId?(): string;
}

export function createId(adapter?: PlatformAdapter): string {
  if (adapter?.createId) return adapter.createId();
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
