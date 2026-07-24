import type { DisplayFit, DisplayManifestItem } from '@cardbey/display-runtime';
import { clearElementChildren } from './domClear.js';
import { mediaError, type MediaPlaybackError } from './mediaErrors.js';
import { safeRuntimeLog } from '../runtime/runtimeErrorReport.js';

export type ImageRendererCallbacks = {
  generation: number;
  onReady: (itemId: string, generation: number) => void;
  onError: (itemId: string, generation: number, error: MediaPlaybackError) => void;
  isCurrentGeneration: (generation: number) => boolean;
};

export class ImageRenderer {
  private layer: HTMLImageElement | null = null;
  private preload: HTMLImageElement | null = null;
  private itemId = '';

  constructor(private readonly host: HTMLElement) {}

  prepare(
    item: DisplayManifestItem,
    fit: DisplayFit,
    callbacks: ImageRendererCallbacks,
  ): void {
    this.cleanup();
    this.itemId = item.id;

    safeRuntimeLog('MEDIA_IMAGE_RENDERER_SELECTED', {
      itemId: item.id,
      urlHostPath: maskUrl(item.url),
    });

    const preload = new Image();
    this.preload = preload;
    try {
      preload.decoding = 'async';
    } catch {
      // Chrome 68 may ignore decoding assignment.
    }

    const onLoad = () => {
      if (!callbacks.isCurrentGeneration(callbacks.generation)) return;
      safeRuntimeLog('MEDIA_IMAGE_PRELOAD_COMPLETED', {
        itemId: item.id,
        naturalWidth: preload.naturalWidth,
        naturalHeight: preload.naturalHeight,
      });
      const img = document.createElement('img');
      img.className = 'media-image';
      img.alt = '';
      img.draggable = false;
      img.src = item.url;
      img.style.objectFit = fit === 'COVER' ? 'cover' : 'contain';
      this.host.appendChild(img);
      this.layer = img;
      safeRuntimeLog('MEDIA_IMAGE_ONLOAD', {
        itemId: item.id,
        naturalWidth: img.naturalWidth || preload.naturalWidth,
        naturalHeight: img.naturalHeight || preload.naturalHeight,
      });
      callbacks.onReady(item.id, callbacks.generation);
    };

    const onError = () => {
      if (!callbacks.isCurrentGeneration(callbacks.generation)) return;
      safeRuntimeLog('MEDIA_IMAGE_ONERROR', {
        itemId: item.id,
        urlHostPath: maskUrl(item.url),
      });
      callbacks.onError(
        item.id,
        callbacks.generation,
        mediaError('DISPLAY_MEDIA_IMAGE_LOAD_FAILED', 'Image failed to load', {
          mediaType: 'IMAGE',
          itemId: item.id,
          failureCode: 'MEDIA_IMAGE_LOAD_FAILED',
          detail: {
            itemId: item.id,
            mediaType: 'IMAGE',
            originalUrl: item.url,
            renderer: 'IMAGE',
            failureCode: 'MEDIA_IMAGE_LOAD_FAILED',
            lastMediaEvent: 'error',
            at: new Date().toISOString(),
          },
        }),
      );
    };

    preload.addEventListener('load', onLoad, { once: true });
    preload.addEventListener('error', onError, { once: true });
    safeRuntimeLog('MEDIA_IMAGE_PRELOAD_STARTED', {
      itemId: item.id,
      urlHostPath: maskUrl(item.url),
    });
    preload.src = item.url;
  }

  cleanup(): void {
    if (this.preload) {
      this.preload.onload = null;
      this.preload.onerror = null;
      this.preload.src = '';
      this.preload = null;
    }
    if (this.layer) {
      this.layer.remove();
      this.layer = null;
    }
    clearElementChildren(this.host);
  }

  getElement(): HTMLImageElement | null {
    return this.layer;
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
