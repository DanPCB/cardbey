import type { DisplayManifestItem } from '@cardbey/display-runtime';
import { clearElementChildren } from './domClear.js';
import { renderClaimQr } from '../pairing/qrCode.js';
import { safeRuntimeLog } from '../runtime/runtimeErrorReport.js';

export type LiveCardRendererCallbacks = {
  generation: number;
  onReady: (itemId: string, generation: number) => void;
  isCurrentGeneration: (generation: number) => boolean;
};

/**
 * Timed Global Live card for Cnet when HLS is not yet LIVE.
 * Not an image misclassification of .m3u8.
 */
export class LiveCardRenderer {
  private root: HTMLElement | null = null;
  private qrImg: HTMLImageElement | null = null;

  constructor(private readonly host: HTMLElement) {}

  prepare(item: DisplayManifestItem, callbacks: LiveCardRendererCallbacks): void {
    this.cleanup();

    const root = document.createElement('div');
    root.className = 'live-card';
    root.setAttribute('data-testid', 'live-card');

    const badge = document.createElement('p');
    badge.className = 'live-card-badge';
    badge.textContent = item.overlayBadge || 'Live soon';
    root.appendChild(badge);

    const title = document.createElement('h2');
    title.className = 'live-card-title';
    title.textContent = item.overlayTitle || 'Global Live';
    root.appendChild(title);

    if (item.overlayHint) {
      const hint = document.createElement('p');
      hint.className = 'live-card-hint';
      hint.textContent = item.overlayHint;
      root.appendChild(hint);
    }

    if (item.qrValue) {
      const qrWrap = document.createElement('div');
      qrWrap.className = 'live-card-qr';
      const qrImg = document.createElement('img');
      qrImg.alt = 'Scan to join';
      qrImg.className = 'live-card-qr-img';
      qrWrap.appendChild(qrImg);
      const scanHint = document.createElement('p');
      scanHint.className = 'live-card-scan';
      scanHint.textContent = 'Scan to watch and shop';
      qrWrap.appendChild(scanHint);
      root.appendChild(qrWrap);
      this.qrImg = qrImg;
      void this.fillQr(item.qrValue, callbacks.generation, callbacks);
    }

    this.root = root;
    this.host.appendChild(root);
    safeRuntimeLog('MEDIA_LIVE_CARD_RENDERER_SELECTED', { itemId: item.id });
    callbacks.onReady(item.id, callbacks.generation);
  }

  private async fillQr(
    value: string,
    generation: number,
    callbacks: LiveCardRendererCallbacks,
  ): Promise<void> {
    const result = await renderClaimQr(value);
    if (!callbacks.isCurrentGeneration(generation) || !this.qrImg) return;
    if (result.ok) {
      this.qrImg.src = result.dataUrl;
    }
  }

  cleanup(): void {
    this.qrImg = null;
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
    clearElementChildren(this.host);
  }
}
