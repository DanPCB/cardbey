import type { DisplayTransition } from '@cardbey/display-runtime';

export type TransitionCallbacks = {
  generation: number;
  isCurrentGeneration: (generation: number) => boolean;
  onComplete: (generation: number) => void;
};

const MAX_TRANSITION_MS = 2_000;
const MIN_TRANSITION_MS = 0;

export class TransitionController {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: HTMLElement) {}

  run(
    transition: DisplayTransition,
    durationMs: number,
    callbacks: TransitionCallbacks,
  ): void {
    this.clear();
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const kind = reduced ? 'NONE' : transition;
    const ms = Math.min(MAX_TRANSITION_MS, Math.max(MIN_TRANSITION_MS, durationMs || 0));

    if (kind === 'NONE' || ms <= 0) {
      this.host.classList.remove('is-fading');
      this.host.style.opacity = '1';
      callbacks.onComplete(callbacks.generation);
      return;
    }

    this.host.classList.add('is-fading');
    this.host.style.opacity = '0';
    // Force reflow then fade in
    void this.host.offsetWidth;
    this.host.style.transition = `opacity ${ms}ms ease`;
    this.host.style.opacity = '1';

    this.timer = setTimeout(() => {
      this.timer = null;
      this.host.classList.remove('is-fading');
      this.host.style.transition = '';
      if (!callbacks.isCurrentGeneration(callbacks.generation)) return;
      callbacks.onComplete(callbacks.generation);
    }, ms);
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.host.classList.remove('is-fading');
    this.host.style.transition = '';
    this.host.style.opacity = '1';
  }
}
