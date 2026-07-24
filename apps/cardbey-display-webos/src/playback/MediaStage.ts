import type { DisplayFit, DisplayManifestItem, DisplayTransition } from '@cardbey/display-runtime';
import { ImageRenderer } from './ImageRenderer.js';
import { VideoRenderer } from './VideoRenderer.js';
import { TransitionController } from './TransitionController.js';
import type { MediaPlaybackError } from './mediaErrors.js';

export type MediaStageCallbacks = {
  generation: number;
  isCurrentGeneration: (generation: number) => boolean;
  onReady: (itemId: string, generation: number) => void;
  onPlaying: (itemId: string, generation: number) => void;
  onEnded: (itemId: string, generation: number) => void;
  onError: (itemId: string, generation: number, error: MediaPlaybackError) => void;
  onWaiting: (itemId: string, generation: number) => void;
  onStallClear: (itemId: string, generation: number) => void;
  onTransitionDone: (generation: number) => void;
};

/**
 * Owns DOM inside #playback-stage. At most one video element.
 */
export class MediaStage {
  private readonly surface: HTMLElement;
  private readonly image: ImageRenderer;
  private readonly video: VideoRenderer;
  private readonly transition: TransitionController;
  private activeType: 'IMAGE' | 'VIDEO' | null = null;

  constructor(private readonly stage: HTMLElement) {
    this.stage.classList.add('stage', 'is-active');
    this.stage.setAttribute('aria-hidden', 'false');
    this.stage.replaceChildren();
    this.surface = document.createElement('div');
    this.surface.className = 'media-surface';
    this.stage.appendChild(this.surface);
    this.image = new ImageRenderer(this.surface);
    this.video = new VideoRenderer(this.surface);
    this.transition = new TransitionController(this.surface);
  }

  showItem(
    item: DisplayManifestItem,
    opts: {
      fit: DisplayFit;
      muted: boolean;
      transition: DisplayTransition;
      transitionDurationMs: number;
      callbacks: MediaStageCallbacks;
    },
  ): void {
    this.image.cleanup();
    this.video.cleanup();
    this.transition.clear();
    this.activeType = item.type;

    const base = {
      generation: opts.callbacks.generation,
      isCurrentGeneration: opts.callbacks.isCurrentGeneration,
      onReady: opts.callbacks.onReady,
      onError: opts.callbacks.onError,
    };

    if (item.type === 'IMAGE') {
      this.image.prepare(item, opts.fit, base);
    } else if (item.type === 'VIDEO') {
      this.video.prepare(item, opts.fit, opts.muted, {
        ...base,
        onPlaying: opts.callbacks.onPlaying,
        onEnded: opts.callbacks.onEnded,
        onWaiting: opts.callbacks.onWaiting,
        onStallClear: opts.callbacks.onStallClear,
      });
    } else {
      opts.callbacks.onError(
        item.id,
        opts.callbacks.generation,
        {
          code: 'DISPLAY_MEDIA_UNSUPPORTED',
          message: `Unsupported item type`,
          retryable: false,
          mediaType: 'IMAGE',
          itemId: item.id,
        },
      );
      return;
    }

    this.transition.run(opts.transition, opts.transitionDurationMs, {
      generation: opts.callbacks.generation,
      isCurrentGeneration: opts.callbacks.isCurrentGeneration,
      onComplete: opts.callbacks.onTransitionDone,
    });
  }

  pause(): void {
    if (this.activeType === 'VIDEO') this.video.pause();
  }

  async resume(): Promise<void> {
    if (this.activeType === 'VIDEO') await this.video.resume();
  }

  recoverVideoOnce(): Promise<boolean> {
    return this.video.recoverOnce();
  }

  getVideoSnapshot() {
    return this.video.getSnapshot();
  }

  clear(): void {
    this.image.cleanup();
    this.video.cleanup();
    this.transition.clear();
    this.activeType = null;
    this.stage.classList.remove('is-active');
    this.stage.setAttribute('aria-hidden', 'true');
  }

  destroy(): void {
    this.clear();
    this.stage.replaceChildren();
  }
}
