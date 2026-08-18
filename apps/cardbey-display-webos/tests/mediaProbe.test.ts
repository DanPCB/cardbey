import { describe, expect, it, vi } from 'vitest';
import { probeMediaItem } from '../src/playback/mediaProbe.js';
import { failureCodeFromHttpStatus, translateVideoErrorCode } from '../src/playback/mediaFailureCodes.js';

describe('media failure classification', () => {
  it('maps HTTP statuses to stable codes', () => {
    expect(failureCodeFromHttpStatus(404)).toBe('MEDIA_HTTP_404');
    expect(failureCodeFromHttpStatus(403)).toBe('MEDIA_HTTP_403');
    expect(failureCodeFromHttpStatus(0)).toBe('MEDIA_TLS_FAILURE');
  });

  it('translates HTMLMediaElement error codes', () => {
    expect(translateVideoErrorCode(1)).toBe('MEDIA_ABORTED');
    expect(translateVideoErrorCode(2)).toBe('MEDIA_NETWORK_ERROR');
    expect(translateVideoErrorCode(3)).toBe('MEDIA_DECODE_ERROR');
    expect(translateVideoErrorCode(4)).toBe('MEDIA_SRC_NOT_SUPPORTED');
  });

  it('probes media URL and reports MEDIA_HTTP_404', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      });
    });
    vi.stubGlobal('window', { fetch: fetchImpl });
    try {
      const result = await probeMediaItem({
        itemId: 'item-1',
        mediaType: 'VIDEO',
        url: 'https://cdn.example.com/missing.mp4',
      });
      expect(result.ok).toBe(false);
      expect(result.httpStatus).toBe(404);
      expect(result.failureCode).toBe('MEDIA_HTTP_404');
      expect(result.mimeType).toMatch(/text\/plain/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('skips HTTP probe for HLS and LIVE_CARD', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('window', { fetch: fetchImpl });
    try {
      const hls = await probeMediaItem({
        itemId: 'live',
        mediaType: 'VIDEO',
        url: 'https://customer-abc.cloudflarestream.com/uid/manifest/video.m3u8',
        mimeType: 'application/vnd.apple.mpegurl',
      });
      expect(hls.ok).toBe(true);
      expect(hls.probeMethod).toBe('NONE');
      expect(fetchImpl).not.toHaveBeenCalled();

      const card = await probeMediaItem({
        itemId: 'card',
        mediaType: 'LIVE_CARD',
        url: 'https://app.example/s/demo#live',
      });
      expect(card.ok).toBe(true);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
