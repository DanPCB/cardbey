import type {
  HeartbeatResponse,
  PairCompleteResponse,
  PairStatusResponse,
  RawPlaylistFullResponse,
  RequestPairingResponse,
} from '../../src/api/deviceApiContracts.js';

export const pairingStartFixture: RequestPairingResponse = {
  ok: true,
  sessionId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
  code: 'Ab12Cd',
  expiresAt: '2026-07-24T04:00:00.000Z',
  deviceId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
};

export const pairingStartFailureFixture = {
  ok: false,
  error: 'pairing_failed',
  message: 'Unable to create pairing session',
};

export const pairStatusPendingFixture: PairStatusResponse = {
  ok: true,
  status: 'pending',
  sessionId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
  engine: 'DEVICE_V2',
  expiresAt: '2026-07-24T04:00:00.000Z',
  ttlLeftMs: 120000,
  pairingCode: 'Ab12Cd',
};

export const pairStatusClaimedFixture: PairStatusResponse = {
  ok: true,
  status: 'claimed',
  sessionId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
  engine: 'DEVICE_V2',
  expiresAt: '2026-07-24T04:00:00.000Z',
  ttlLeftMs: 0,
  deviceId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
};

export const pairStatusExpiredFixture: PairStatusResponse = {
  ok: true,
  status: 'expired',
  sessionId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
  engine: 'DEVICE_V2',
  expiresAt: '2026-07-24T03:00:00.000Z',
  ttlLeftMs: 0,
};

export const pairStatusUnknownFixture: PairStatusResponse = {
  ok: true,
  status: 'weird',
  sessionId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
};

export const pairCompleteNullTokenFixture: PairCompleteResponse = {
  ok: true,
  deviceId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
  screenId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
  token: null,
  status: 'online',
};

export const pairCompleteMalformedFixture = {
  ok: true,
  // missing deviceId/screenId — invalid for session activation when claimed id also absent
};

export const heartbeatFixture: HeartbeatResponse = {
  ok: true,
  deviceId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
  status: 'online',
  pairingStatus: 'PAIRED_PLAYLIST_ASSIGNED',
  displayName: 'Front Window',
  orientation: 'horizontal',
  tenantId: 'tenant-1',
  storeId: 'store-1',
  currentPlaylistId: 'playlist-1',
  commands: [],
};

export const playlistFullFixture: RawPlaylistFullResponse = {
  ok: true,
  deviceId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
  orientation: 'vertical',
  state: 'ready',
  message: 'Playlist ready for playback',
  version: 'playlist-1:1',
  playlistId: 'playlist-1',
  itemCount: 2,
  hasPlaylist: true,
  bindingStatus: 'ready',
  playlist: {
    id: 'playlist-1',
    name: 'Lobby',
    version: 'playlist-1:1',
    items: [
      {
        id: 'item-a',
        type: 'image',
        url: 'https://cdn.example.com/a.jpg',
        durationMs: 5000,
        order: 0,
      },
      {
        id: 'item-b',
        type: 'video',
        mediaUrl: 'https://cdn.example.com/b.mp4?sig=abc&exp=1',
        durationMs: 12000,
        order: 1,
      },
    ],
  },
};

export const playlistEmptyFixture: RawPlaylistFullResponse = {
  ok: true,
  deviceId: '1f2d79a8-f321-4377-af7e-c6130d6bf55c',
  orientation: 'horizontal',
  state: 'assigned_empty_playlist',
  message: 'Playlist assigned but contains no playable items',
  playlist: null,
  itemCount: 0,
  hasPlaylist: false,
};
