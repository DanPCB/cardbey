import type { DisplayManifest } from '@cardbey/display-runtime';

const baseSettings = {
  muted: true,
  transition: 'NONE' as const,
  transitionDurationMs: 0,
  fit: 'CONTAIN' as const,
  orientation: 'LANDSCAPE' as const,
};

function manifest(
  id: string,
  revision: string | number,
  items: DisplayManifest['playlist']['items'],
  extras?: Partial<DisplayManifest>,
): DisplayManifest {
  return {
    id,
    revision,
    playlist: {
      id: `${id}-playlist`,
      name: id,
      loop: true,
      defaultDurationMs: 8_000,
      items,
    },
    settings: { ...baseSettings },
    ...extras,
  };
}

export type PlaybackFixtureId =
  | 'one_image'
  | 'two_images'
  | 'one_video'
  | 'image_then_video'
  | 'video_then_image'
  | 'invalid_image'
  | 'invalid_video'
  | 'first_fails_second_ok'
  | 'all_fail'
  | 'future_item'
  | 'expired_item'
  | 'empty'
  | 'portrait';

export const PLAYBACK_FIXTURES: Record<PlaybackFixtureId, DisplayManifest> = {
  one_image: manifest('fx-one-image', 1, [
    {
      id: 'img-1',
      type: 'IMAGE',
      url: 'https://cdn.example.com/a.jpg',
      durationMs: 2_000,
    },
  ]),
  two_images: manifest('fx-two-images', 1, [
    {
      id: 'img-1',
      type: 'IMAGE',
      url: 'https://cdn.example.com/a.jpg',
      durationMs: 1_500,
    },
    {
      id: 'img-2',
      type: 'IMAGE',
      url: 'https://cdn.example.com/b.jpg',
      durationMs: 1_500,
    },
  ]),
  one_video: manifest('fx-one-video', 1, [
    {
      id: 'vid-1',
      type: 'VIDEO',
      url: 'https://cdn.example.com/a.mp4',
      durationMs: 0,
    },
  ]),
  image_then_video: manifest('fx-img-vid', 1, [
    {
      id: 'img-1',
      type: 'IMAGE',
      url: 'https://cdn.example.com/a.jpg',
      durationMs: 1_500,
    },
    {
      id: 'vid-1',
      type: 'VIDEO',
      url: 'https://cdn.example.com/a.mp4',
      durationMs: 0,
    },
  ]),
  video_then_image: manifest('fx-vid-img', 1, [
    {
      id: 'vid-1',
      type: 'VIDEO',
      url: 'https://cdn.example.com/a.mp4',
      durationMs: 0,
    },
    {
      id: 'img-1',
      type: 'IMAGE',
      url: 'https://cdn.example.com/a.jpg',
      durationMs: 1_500,
    },
  ]),
  invalid_image: manifest('fx-bad-image', 1, [
    {
      id: 'img-bad',
      type: 'IMAGE',
      url: 'https://cdn.example.com/missing.jpg',
      durationMs: 2_000,
    },
  ]),
  invalid_video: manifest('fx-bad-video', 1, [
    {
      id: 'vid-bad',
      type: 'VIDEO',
      url: 'https://cdn.example.com/missing.mp4',
      durationMs: 0,
    },
  ]),
  first_fails_second_ok: manifest('fx-skip', 1, [
    {
      id: 'img-bad',
      type: 'IMAGE',
      url: 'https://cdn.example.com/missing.jpg',
      durationMs: 2_000,
    },
    {
      id: 'img-ok',
      type: 'IMAGE',
      url: 'https://cdn.example.com/ok.jpg',
      durationMs: 2_000,
    },
  ]),
  all_fail: manifest('fx-all-fail', 1, [
    {
      id: 'img-bad-1',
      type: 'IMAGE',
      url: 'https://cdn.example.com/missing1.jpg',
      durationMs: 1_000,
    },
    {
      id: 'img-bad-2',
      type: 'IMAGE',
      url: 'https://cdn.example.com/missing2.jpg',
      durationMs: 1_000,
    },
  ]),
  future_item: manifest('fx-future', 1, [
    {
      id: 'img-future',
      type: 'IMAGE',
      url: 'https://cdn.example.com/future.jpg',
      durationMs: 2_000,
      validFrom: '2099-01-01T00:00:00.000Z',
    },
  ]),
  expired_item: manifest('fx-expired', 1, [
    {
      id: 'img-expired',
      type: 'IMAGE',
      url: 'https://cdn.example.com/old.jpg',
      durationMs: 2_000,
      validUntil: '2000-01-01T00:00:00.000Z',
    },
  ]),
  empty: manifest('fx-empty', 1, []),
  portrait: manifest(
    'fx-portrait',
    1,
    [
      {
        id: 'img-p',
        type: 'IMAGE',
        url: 'https://cdn.example.com/portrait.jpg',
        durationMs: 2_000,
        fit: 'COVER',
      },
    ],
    { settings: { ...baseSettings, orientation: 'PORTRAIT', fit: 'COVER' } },
  ),
};

export function getPlaybackFixture(id: PlaybackFixtureId): DisplayManifest {
  return JSON.parse(JSON.stringify(PLAYBACK_FIXTURES[id])) as DisplayManifest;
}
