import type { DisplayFit, DisplayManifestItem } from '@cardbey/display-runtime';
import { mediaError, type MediaPlaybackError } from './mediaErrors.js';

export type VideoRendererCallbacks = {
  generation: number;
  onReady: (itemId: string, generation: number) => void;
  onPlaying: (itemId: string, generation: number) => void;
  onEnded: (itemId: string, generation: number) => void;
  onError: (itemId: string, generation: number, error: MediaPlaybackError) => void;
  onWaiting: (itemId: string, generation: number) => void;
  onStallClear: (itemId: string, generation: number) => void;
  isCurrentGeneration: (generation: number) => boolean;
};

export class VideoRenderer {
  private video: HTMLVideoElement | null = null;
  private itemId = '';
  private endedFired = false;
  private recoveryAttempted = false;
  private listeners: Array<[keyof HTMLVideoElementEventMap, EventListener]> = [];

  constructor(private readonly host: HTMLElement) {}

  prepare(
    item: DisplayManifestItem,
    fit: DisplayFit,
    muted: boolean,
    callbacks: VideoRendererCallbacks,
  ): void {
    this.cleanup();
    this.itemId = item.id;
    this.endedFired = false;
    this.recoveryAttempted = false;

    const video = document.createElement('video');
    video.className = 'media-video';
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = muted;
    video.autoplay = true;
    video.preload = 'auto';
    video.controls = false;
    video.style.objectFit = fit === 'COVER' ? 'cover' : 'contain';
    this.video = video;
    this.host.appendChild(video);

    const guard = (fn: () => void) => () => {
      if (!callbacks.isCurrentGeneration(callbacks.generation)) return;
      fn();
    };

    this.on(video, 'loadedmetadata', guard(() => {
      callbacks.onReady(item.id, callbacks.generation);
    }));
    this.on(video, 'canplay', guard(() => {
      void this.attemptPlay(item, callbacks);
    }));
    this.on(video, 'playing', guard(() => {
      callbacks.onStallClear(item.id, callbacks.generation);
      callbacks.onPlaying(item.id, callbacks.generation);
    }));
    this.on(video, 'waiting', guard(() => {
      callbacks.onWaiting(item.id, callbacks.generation);
    }));
    this.on(video, 'stalled', guard(() => {
      callbacks.onWaiting(item.id, callbacks.generation);
    }));
    this.on(video, 'ended', guard(() => {
      if (this.endedFired) return;
      this.endedFired = true;
      callbacks.onEnded(item.id, callbacks.generation);
    }));
    this.on(video, 'error', guard(() => {
      callbacks.onError(
        item.id,
        callbacks.generation,
        mediaError('DISPLAY_MEDIA_VIDEO_LOAD_FAILED', 'Video failed to load', {
          mediaType: 'VIDEO',
          itemId: item.id,
        }),
      );
    }));

    video.src = item.url;
    video.load();
  }

  private async attemptPlay(
    item: DisplayManifestItem,
    callbacks: VideoRendererCallbacks,
  ): Promise<void> {
    if (!this.video || !callbacks.isCurrentGeneration(callbacks.generation)) return;
    try {
      await this.video.play();
    } catch {
      if (!callbacks.isCurrentGeneration(callbacks.generation)) return;
      callbacks.onError(
        item.id,
        callbacks.generation,
        mediaError('DISPLAY_MEDIA_AUTOPLAY_FAILED', 'Video autoplay was rejected', {
          mediaType: 'VIDEO',
          itemId: item.id,
          retryable: true,
        }),
      );
    }
  }

  /** Single stall recovery attempt for current activation. */
  async recoverOnce(): Promise<boolean> {
    if (!this.video || this.recoveryAttempted) return false;
    this.recoveryAttempted = true;
    try {
      this.video.load();
      await this.video.play();
      return true;
    } catch {
      return false;
    }
  }

  pause(): void {
    this.video?.pause();
  }

  async resume(): Promise<void> {
    if (!this.video) return;
    await this.video.play();
  }

  getSnapshot(): {
    currentTime?: number;
    duration?: number;
    readyState?: number;
    networkState?: number;
    muted?: boolean;
    paused?: boolean;
  } {
    const v = this.video;
    if (!v) return {};
    return {
      currentTime: v.currentTime,
      duration: Number.isFinite(v.duration) ? v.duration : undefined,
      readyState: v.readyState,
      networkState: v.networkState,
      muted: v.muted,
      paused: v.paused,
    };
  }

  cleanup(): void {
    if (this.video) {
      for (const [type, listener] of this.listeners) {
        this.video.removeEventListener(type, listener);
      }
      this.listeners = [];
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video.remove();
      this.video = null;
    }
    this.host.replaceChildren();
  }

  private on(
    video: HTMLVideoElement,
    type: keyof HTMLVideoElementEventMap,
    listener: EventListener,
  ): void {
    video.addEventListener(type, listener);
    this.listeners.push([type, listener]);
  }
}
