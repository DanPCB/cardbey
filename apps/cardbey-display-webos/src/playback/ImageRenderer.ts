import type { DisplayFit, DisplayManifestItem } from '@cardbey/display-runtime';
import { clearElementChildren } from './domClear.js';
import { mediaError, type MediaPlaybackError } from './mediaErrors.js';

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

    const preload = new Image();
    this.preload = preload;
    preload.decoding = 'async';

    const onLoad = () => {
      if (!callbacks.isCurrentGeneration(callbacks.generation)) return;
      const img = document.createElement('img');
      img.className = 'media-image';
      img.alt = '';
      img.draggable = false;
      img.src = item.url;
      img.style.objectFit = fit === 'COVER' ? 'cover' : 'contain';
      this.host.appendChild(img);
      this.layer = img;
      callbacks.onReady(item.id, callbacks.generation);
    };

    const onError = () => {
      if (!callbacks.isCurrentGeneration(callbacks.generation)) return;
      callbacks.onError(
        item.id,
        callbacks.generation,
        mediaError('DISPLAY_MEDIA_IMAGE_LOAD_FAILED', 'Image failed to load', {
          mediaType: 'IMAGE',
          itemId: item.id,
        }),
      );
    };

    preload.addEventListener('load', onLoad, { once: true });
    preload.addEventListener('error', onError, { once: true });
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
