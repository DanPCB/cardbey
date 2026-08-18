import { renderClaimQr } from '../pairing/qrCode.js';

/**
 * Session QR in the corner of live HLS playback.
 * Destination is the public handoff URL already on the playlist item.
 */
export function mountQrCornerOverlay(host: HTMLElement, qrValue: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'live-qr-corner';
  wrap.setAttribute('data-testid', 'live-qr-corner');
  const img = document.createElement('img');
  img.alt = 'Scan to join';
  img.className = 'live-qr-corner-img';
  wrap.appendChild(img);
  host.appendChild(wrap);
  void renderClaimQr(qrValue).then((result) => {
    if (!wrap.isConnected) return;
    if (result.ok) img.src = result.dataUrl;
  });
  return wrap;
}
