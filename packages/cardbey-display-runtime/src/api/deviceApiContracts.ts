/** Wire contracts for Device Engine V2 — mirror Core + Android clients. */

export type RequestPairingBody = {
  deviceId: string;
  platform: string;
  engineVersion: string;
  appVersion?: string;
  hardwareModel?: string;
  deviceModel?: string;
  model?: string;
  installationId?: string;
};

export type RequestPairingResponse = {
  ok: boolean;
  sessionId?: string;
  pairingSessionId?: string;
  code?: string;
  pairingCode?: string;
  expiresAt?: string;
  ttlLeftMs?: number;
  ttlSeconds?: number;
  deviceId?: string;
  alreadyPaired?: boolean;
  status?: string;
  tenantId?: string | null;
  storeId?: string | null;
  error?: string;
  message?: string;
};

export type PairStatusResponse = {
  ok: boolean;
  status: string;
  sessionId?: string;
  engine?: string;
  expiresAt?: string;
  ttlLeftMs?: number;
  pairingCode?: string;
  deviceId?: string;
  token?: string;
  deviceJwt?: string;
  error?: string;
  message?: string;
};

export type PairCompleteBody = {
  sessionId: string;
  screenId?: string;
  deviceId?: string;
  token?: string | null;
  code?: string;
};

export type PairCompleteResponse = {
  ok: boolean;
  screenId?: string;
  deviceId?: string;
  token?: string | null;
  status?: string;
  error?: string;
  message?: string;
};

export type HeartbeatRequestBody = {
  deviceId?: string;
  installationId?: string;
  engine?: string;
  engineVersion?: string;
  appVersion?: string;
  platform?: string;
  status?: string;
  state?: string;
  orientation?: string;
  meta?: Record<string, unknown>;
  playbackState?: {
    playlistId?: string;
    currentIndex?: number;
    isPlaying?: boolean;
    itemId?: string;
  };
  executedCommandIds?: string[];
  currentPlaylistId?: string;
  playlistId?: string;
};

export type HeartbeatCommand = {
  id: string;
  type: string;
  payload?: Record<string, unknown>;
};

export type HeartbeatResponse = {
  ok: boolean;
  deviceId?: string;
  status?: string;
  pairingStatus?: string;
  displayName?: string | null;
  orientation?: string;
  tenantId?: string | null;
  storeId?: string | null;
  currentPlaylistId?: string | null;
  installationIdHash?: string;
  pairingCode?: string;
  repairStatus?: string;
  commands?: HeartbeatCommand[];
  error?: string;
  message?: string;
};

export type RawPlaylistItem = {
  id?: string;
  type?: string;
  url?: string;
  mediaUrl?: string;
  durationMs?: number;
  duration?: number;
  order?: number;
  muted?: boolean;
  loop?: boolean;
  rotation?: number;
  validFrom?: string;
  validUntil?: string;
  checksum?: string;
  mimeType?: string;
  qrValue?: string;
  overlayTitle?: string;
  overlayBadge?: string;
  overlayHint?: string;
  asset?: { id?: string; url?: string; type?: string };
};

export type RawPlaylistFullResponse = {
  ok?: boolean;
  deviceId?: string;
  screenId?: string | null;
  orientation?: string;
  state?: string;
  message?: string;
  version?: string | number;
  playlist?: {
    id?: string;
    name?: string;
    version?: string | number;
    rev?: number;
    updatedAt?: number | string;
    items?: RawPlaylistItem[];
  } | null;
  items?: RawPlaylistItem[];
  playlistId?: string;
  itemCount?: number;
  hasPlaylist?: boolean;
  bindingStatus?: string;
  bindingId?: string;
  rev?: number;
  updatedAt?: number | string;
  error?: string;
};
