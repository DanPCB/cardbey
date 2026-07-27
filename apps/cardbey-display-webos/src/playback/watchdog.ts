import { browserClearTimeout, browserSetTimeout } from '@cardbey/display-runtime';
import type { WatchdogKind } from './playbackState.js';

export type WatchdogOptions = {
  generation: number;
  kind: WatchdogKind;
  timeoutMs: number;
  onFire: (kind: WatchdogKind, generation: number) => void;
  setTimeoutFn?: (handler: () => void, timeout?: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
};

/**
 * One-shot item watchdog. Stale generations are ignored by the coordinator.
 */
export class ItemWatchdog {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly setTimeoutFn: (
    handler: () => void,
    timeout?: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly clearTimeoutFn: (id: ReturnType<typeof setTimeout>) => void;
  private pausedRemainingMs: number | null = null;
  private startedAt = 0;
  readonly kind: WatchdogKind;
  readonly generation: number;
  private readonly timeoutMs: number;
  private readonly onFire: (kind: WatchdogKind, generation: number) => void;

  constructor(options: WatchdogOptions) {
    this.kind = options.kind;
    this.generation = options.generation;
    this.timeoutMs = options.timeoutMs;
    this.onFire = options.onFire;
    this.setTimeoutFn =
      options.setTimeoutFn ?? ((handler, timeout) => browserSetTimeout(handler, timeout));
    this.clearTimeoutFn =
      options.clearTimeoutFn ?? ((id) => browserClearTimeout(id));
  }

  start(): void {
    this.clear();
    this.startedAt = Date.now();
    this.pausedRemainingMs = null;
    this.timer = this.setTimeoutFn(() => {
      this.timer = null;
      this.onFire(this.kind, this.generation);
    }, this.timeoutMs);
  }

  pause(): void {
    if (!this.timer) return;
    const elapsed = Date.now() - this.startedAt;
    this.pausedRemainingMs = Math.max(0, this.timeoutMs - elapsed);
    this.clearTimeoutFn(this.timer);
    this.timer = null;
  }

  resume(): void {
    if (this.pausedRemainingMs == null) return;
    const remaining = this.pausedRemainingMs;
    this.pausedRemainingMs = null;
    this.startedAt = Date.now();
    this.timer = this.setTimeoutFn(() => {
      this.timer = null;
      this.onFire(this.kind, this.generation);
    }, remaining);
  }

  clear(): void {
    if (this.timer) this.clearTimeoutFn(this.timer);
    this.timer = null;
    this.pausedRemainingMs = null;
  }
}
