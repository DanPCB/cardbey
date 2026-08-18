import { isHlsPlaybackUrl, type DisplayFit, type DisplayManifestItem } from '@cardbey/display-runtime';
import { clearElementChildren } from './domClear.js';
import { mediaError, type MediaPlaybackError } from './mediaErrors.js';
import { translateVideoErrorCode } from './mediaFailureCodes.js';
import { safeRuntimeLog } from '../runtime/runtimeErrorReport.js';

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
  private playAttempted = false;
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
    this.playAttempted = false;

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

    safeRuntimeLog('MEDIA_VIDEO_RENDERER_SELECTED', {
      itemId: item.id,
      urlHostPath: maskUrl(item.url),
    });

    const guard = (fn: () => void) => () => {
      if (!callbacks.isCurrentGeneration(callbacks.generation)) return;
      fn();
    };

    const logEvent = (name: string) =>
      guard(() => {
        safeRuntimeLog('MEDIA_VIDEO_EVENT', {
          itemId: item.id,
          event: name,
          readyState: video.readyState,
          networkState: video.networkState,
          currentSrc: maskUrl(video.currentSrc || video.src || ''),
          errorCode: video.error ? video.error.code : null,
        });
      });

    this.on(video, 'loadstart', logEvent('loadstart'));
    this.on(video, 'loadedmetadata', guard(() => {
      safeRuntimeLog('MEDIA_VIDEO_EVENT', {
        itemId: item.id,
        event: 'loadedmetadata',
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      callbacks.onReady(item.id, callbacks.generation);
    }));
    this.on(video, 'canplay', guard(() => {
      logEvent('canplay')();
      void this.attemptPlay(item, callbacks);
    }));
    this.on(video, 'canplaythrough', logEvent('canplaythrough'));
    this.on(video, 'playing', guard(() => {
      logEvent('playing')();
      callbacks.onStallClear(item.id, callbacks.generation);
      callbacks.onPlaying(item.id, callbacks.generation);
    }));
    this.on(video, 'waiting', guard(() => {
      logEvent('waiting')();
      callbacks.onWaiting(item.id, callbacks.generation);
    }));
    this.on(video, 'stalled', guard(() => {
      logEvent('stalled')();
      callbacks.onWaiting(item.id, callbacks.generation);
    }));
    this.on(video, 'suspend', logEvent('suspend'));
    this.on(video, 'abort', logEvent('abort'));
    this.on(video, 'ended', guard(() => {
      if (this.endedFired) return;
      this.endedFired = true;
      logEvent('ended')();
      callbacks.onEnded(item.id, callbacks.generation);
    }));
    this.on(video, 'error', guard(() => {
      const code = video.error ? video.error.code : undefined;
      const message = video.error
        ? // MediaError.message is not available on Chrome 68
          'HTMLMediaError code=' + String(code)
        : 'Video failed to load';
      const failureCode = translateVideoErrorCode(code);
      safeRuntimeLog('MEDIA_VIDEO_ERROR', {
        itemId: item.id,
        htmlMediaErrorCode: code == null ? null : code,
        failureCode,
        readyState: video.readyState,
        networkState: video.networkState,
        currentSrc: maskUrl(video.currentSrc || video.src || ''),
      });
      callbacks.onError(
        item.id,
        callbacks.generation,
        mediaError('DISPLAY_MEDIA_VIDEO_LOAD_FAILED', message, {
          mediaType: 'VIDEO',
          itemId: item.id,
          failureCode,
          detail: {
            itemId: item.id,
            mediaType: 'VIDEO',
            originalUrl: item.url,
            resolvedUrl: video.currentSrc || item.url,
            renderer: 'VIDEO',
            failureCode,
            htmlMediaErrorCode: code,
            htmlMediaErrorMessage: message,
            lastMediaEvent: 'error',
            at: new Date().toISOString(),
          },
        }),
      );
    }));

    safeRuntimeLog('MEDIA_VIDEO_PRELOAD_STARTED', {
      itemId: item.id,
      urlHostPath: maskUrl(item.url),
    });
    if (isHlsPlaybackUrl(item.url, item.mimeType)) {
      const source = document.createElement('source');
      source.src = item.url;
      source.type = item.mimeType || 'application/vnd.apple.mpegurl';
      video.appendChild(source);
    } else {
      video.src = item.url;
    }
    video.load();
  }

  private async attemptPlay(
    item: DisplayManifestItem,
    callbacks: VideoRendererCallbacks,
  ): Promise<void> {
    if (!this.video || !callbacks.isCurrentGeneration(callbacks.generation)) return;
    if (this.playAttempted) return;
    this.playAttempted = true;
    safeRuntimeLog('MEDIA_VIDEO_PLAY_CALLED', { itemId: item.id });
    try {
      await this.video.play();
      safeRuntimeLog('MEDIA_VIDEO_PLAY_RESOLVED', { itemId: item.id });
    } catch (err) {
      if (!callbacks.isCurrentGeneration(callbacks.generation)) return;
      const reason = err instanceof Error ? err.name + ': ' + err.message : String(err);
      safeRuntimeLog('MEDIA_VIDEO_PLAY_REJECTED', {
        itemId: item.id,
        reason,
      });
      callbacks.onError(
        item.id,
        callbacks.generation,
        mediaError('DISPLAY_MEDIA_AUTOPLAY_FAILED', 'Video autoplay was rejected', {
          mediaType: 'VIDEO',
          itemId: item.id,
          retryable: true,
          failureCode: 'MEDIA_PLAY_REJECTED',
          detail: {
            itemId: item.id,
            mediaType: 'VIDEO',
            originalUrl: item.url,
            renderer: 'VIDEO',
            failureCode: 'MEDIA_PLAY_REJECTED',
            playRejection: reason,
            lastMediaEvent: 'play_rejected',
            at: new Date().toISOString(),
          },
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
    clearElementChildren(this.host);
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

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return String(url || '').slice(0, 80);
  }
}
