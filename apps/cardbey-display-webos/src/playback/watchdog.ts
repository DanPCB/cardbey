import type { WatchdogKind } from './playbackState.js';

export type WatchdogOptions = {
  generation: number;
  kind: WatchdogKind;
  timeoutMs: number;
  onFire: (kind: WatchdogKind, generation: number) => void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

/**
 * One-shot item watchdog. Stale generations are ignored by the coordinator.
 */
export class ItemWatchdog {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;
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
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
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
