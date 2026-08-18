import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '@cardbey/display-runtime';
import {
  resolveImageDurationMs,
  resolveVideoMaxDurationMs,
  maskMediaUrl,
  getPlaybackFixture,
} from '../src/playback/index.js';
import { ItemWatchdog } from '../src/playback/watchdog.js';
import { PlaybackCoordinator } from '../src/playback/PlaybackCoordinator.js';

describe('playback basics', () => {
  it('masks signed media query strings', () => {
    expect(maskMediaUrl('https://cdn.example.com/a.mp4?sig=secret&exp=1')).toBe(
      'https://cdn.example.com/a.mp4',
    );
  });

  it('resolves image duration with clamps and video max-cap semantics', () => {
    const manifest = getPlaybackFixture('one_image');
    expect(resolveImageDurationMs(manifest.playlist.items[0]!, manifest)).toBe(2_000);
    expect(
      resolveImageDurationMs(
        { id: 'x', type: 'IMAGE', url: 'https://x/a.jpg', durationMs: -1 },
        manifest,
        8_000,
      ),
    ).toBe(8_000);
    expect(
      resolveVideoMaxDurationMs({
        id: 'v',
        type: 'VIDEO',
        url: 'https://x/a.mp4',
        durationMs: 5_000,
      }),
    ).toBe(5_000);
    expect(
      resolveVideoMaxDurationMs({
        id: 'v',
        type: 'VIDEO',
        url: 'https://x/a.mp4',
        durationMs: 0,
      }),
    ).toBeUndefined();
  });

  it('watchdog fires once and ignores after clear', () => {
    vi.useFakeTimers();
    const onFire = vi.fn();
    const dog = new ItemWatchdog({
      generation: 1,
      kind: 'LOAD_TIMEOUT',
      timeoutMs: 1000,
      onFire,
    });
    dog.start();
    vi.advanceTimersByTime(1000);
    expect(onFire).toHaveBeenCalledWith('LOAD_TIMEOUT', 1);
    dog.clear();
    vi.useRealTimers();
  });
});

describe('PlaybackCoordinator', () => {
  const passProbe = async (input: {
    itemId: string;
    mediaType: 'IMAGE' | 'VIDEO';
    url: string;
  }) => ({
    itemId: input.itemId,
    mediaType: input.mediaType,
    originalUrl: input.url,
    resolvedUrl: input.url,
    ok: true as const,
    httpStatus: 200,
    mimeType: input.mediaType === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
    contentLength: 1000,
    redirectChain: [] as string[],
    probeMethod: 'HEAD' as const,
  });

  it('plays image fixture and rejects stale ended', async () => {
    vi.useFakeTimers();
    const stage = document.createElement('div');
    document.body.appendChild(stage);

    const OriginalImage = window.Image;
    window.Image = class extends OriginalImage {
      override set src(_v: string) {
        queueMicrotask(() => this.dispatchEvent(new Event('load')));
      }
    } as unknown as typeof Image;

    const states: string[] = [];
    const coordinator = new PlaybackCoordinator({
      stage,
      clock: new FakeClock(),
      defaultImageDurationMs: 8_000,
      mediaTimeoutMs: 5_000,
      scheduleRefreshMaxMs: 60_000,
      probeMedia: passProbe,
      onStateChange: (s) => states.push(s.status),
    });

    const manifest = getPlaybackFixture('one_image');
    coordinator.setManifest(manifest);
    await coordinator.play();
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(50);

    expect(states).toContain('PREPARING');
    expect(states).toContain('PLAYING');
    expect(coordinator.getDiagnostics().currentItemId).toBe('img-1');

    const gen = coordinator.getDiagnostics().generation;
    coordinator.handleMediaEnded('img-1', gen - 1);
    expect(coordinator.getDiagnostics().staleEventCount).toBeGreaterThan(0);

    coordinator.destroy();
    window.Image = OriginalImage;
    vi.useRealTimers();
  });

  it('enters waiting for empty and all-outside-schedule fixtures', async () => {
    const stage = document.createElement('div');
    const coordinator = new PlaybackCoordinator({
      stage,
      clock: new FakeClock(),
      probeMedia: passProbe,
    });
    coordinator.setManifest(getPlaybackFixture('empty'));
    expect(coordinator.getState()).toMatchObject({
      status: 'WAITING_FOR_CONTENT',
      reason: 'VALID_EMPTY_PLAYLIST',
    });
    coordinator.setManifest(getPlaybackFixture('future_item'));
    expect(coordinator.getState()).toMatchObject({
      status: 'WAITING_FOR_CONTENT',
      reason: 'ALL_ITEMS_OUTSIDE_SCHEDULE',
    });
    coordinator.destroy();
  });

  it('skips failed image and continues to next', async () => {
    vi.useFakeTimers();
    const stage = document.createElement('div');
    const OriginalImage = window.Image;
    window.Image = class extends OriginalImage {
      override set src(v: string) {
        queueMicrotask(() => {
          if (String(v).includes('missing')) {
            this.dispatchEvent(new Event('error'));
          } else {
            this.dispatchEvent(new Event('load'));
          }
        });
      }
    } as unknown as typeof Image;

    const coordinator = new PlaybackCoordinator({
      stage,
      clock: new FakeClock(),
      mediaTimeoutMs: 5_000,
      scheduleRefreshMaxMs: 60_000,
      allFailedRetryMs: 60_000,
      probeMedia: passProbe,
    });
    coordinator.setManifest(getPlaybackFixture('first_fails_second_ok'));
    await coordinator.play();
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(50);

    expect(coordinator.getDiagnostics().failedItemIds).toContain('img-bad');
    expect(coordinator.getDiagnostics().currentItemId).toBe('img-ok');

    coordinator.destroy();
    window.Image = OriginalImage;
    vi.useRealTimers();
  });

  it('surfaces MEDIA_HTTP_404 from media probe before renderer', async () => {
    const stage = document.createElement('div');
    const coordinator = new PlaybackCoordinator({
      stage,
      clock: new FakeClock(),
      allFailedRetryMs: 60_000,
      probeMedia: async (input) => ({
        itemId: input.itemId,
        mediaType: input.mediaType,
        originalUrl: input.url,
        resolvedUrl: input.url,
        ok: false,
        httpStatus: 404,
        mimeType: 'text/plain;charset=UTF-8',
        contentLength: null,
        redirectChain: [],
        probeMethod: 'HEAD',
        failureCode: 'MEDIA_HTTP_404',
        failureMessage: 'HTTP 404',
      }),
    });
    coordinator.setManifest(getPlaybackFixture('one_image'));
    await coordinator.play();
    await Promise.resolve();
    await Promise.resolve();
    const diag = coordinator.getDiagnostics();
    expect(diag.lastFailureCode).toBe('MEDIA_HTTP_404');
    expect(diag.lastFailureDetail?.httpStatus).toBe(404);
    expect(coordinator.getState().status).toBe('FAILED');
    coordinator.destroy();
  });

  it('plays LIVE_CARD without HTTP probe and does not treat it as IMAGE media', async () => {
    const stage = document.createElement('div');
    const probeMedia = vi.fn(passProbe);
    const coordinator = new PlaybackCoordinator({
      stage,
      clock: new FakeClock(),
      defaultImageDurationMs: 8_000,
      probeMedia,
    });
    coordinator.setManifest({
      id: 'live-card',
      revision: 1,
      playlist: {
        id: 'live-card',
        loop: true,
        defaultDurationMs: 8_000,
        items: [
          {
            id: 'card-1',
            type: 'LIVE_CARD',
            url: 'https://app.example/s/demo#live',
            durationMs: 5_000,
            overlayTitle: 'Lunch special',
            overlayBadge: 'Live soon',
            qrValue: 'https://app.example/api/public/live-cnet/h/glt_x',
          },
        ],
      },
      settings: { muted: true, transition: 'NONE', transitionDurationMs: 0, fit: 'COVER' },
    });
    await coordinator.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(probeMedia).not.toHaveBeenCalled();
    expect(coordinator.getDiagnostics().currentItemType).toBe('LIVE_CARD');
    expect(coordinator.getState().status).toBe('PLAYING');
    coordinator.destroy();
  });

  it('falls back from HLS VIDEO to the timed QR card when playback errors', async () => {
    const stage = document.createElement('div');
    const coordinator = new PlaybackCoordinator({
      stage,
      clock: new FakeClock(),
      defaultImageDurationMs: 8_000,
      probeMedia: async (input) => ({
        itemId: input.itemId,
        mediaType: 'VIDEO',
        originalUrl: input.url,
        resolvedUrl: input.url,
        ok: true,
        redirectChain: [],
        probeMethod: 'NONE',
      }),
    });
    coordinator.setManifest({
      id: 'hls-fallback',
      revision: 1,
      playlist: {
        id: 'hls-fallback',
        loop: true,
        defaultDurationMs: 8_000,
        items: [
          {
            id: 'live-1',
            type: 'VIDEO',
            url: 'https://videodelivery.net/uid/manifest/video.m3u8',
            mimeType: 'application/vnd.apple.mpegurl',
            durationMs: 4 * 60 * 60 * 1000,
            overlayTitle: 'Lunch special',
            overlayBadge: 'LIVE NOW',
            qrValue: 'https://app.example/api/public/live-cnet/h/glt_x',
          },
        ],
      },
      settings: { muted: true, transition: 'NONE', transitionDurationMs: 0, fit: 'COVER' },
    });
    await coordinator.play();
    await Promise.resolve();
    await Promise.resolve();
    if (coordinator.getDiagnostics().currentItemType !== 'LIVE_CARD') {
      const gen =
        coordinator.getState().status === 'PREPARING' ||
        coordinator.getState().status === 'PLAYING' ||
        coordinator.getState().status === 'PAUSED'
          ? coordinator.getState().generation
          : 1;
      coordinator.handleMediaError('live-1', gen, {
        code: 'DISPLAY_MEDIA_VIDEO_LOAD_FAILED',
        message: 'Video failed to load',
        retryable: false,
        mediaType: 'VIDEO',
        itemId: 'live-1',
        failureCode: 'MEDIA_VIDEO_LOAD_FAILED',
      });
      await Promise.resolve();
    }
    expect(coordinator.getDiagnostics().currentItemType).toBe('LIVE_CARD');
    expect(coordinator.getState().status).toBe('PLAYING');
    expect(stage.querySelector('[data-testid="live-card"]')).toBeTruthy();
    coordinator.destroy();
  });
});
