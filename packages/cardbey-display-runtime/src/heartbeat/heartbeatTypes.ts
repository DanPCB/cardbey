import type { HeartbeatRequestBody, HeartbeatResponse } from '../api/deviceApiContracts.js';

export type HeartbeatPlaybackContext = {
  playlistId?: string;
  itemId?: string;
  currentIndex?: number;
  isPlaying?: boolean;
  state?: string;
};

export type HeartbeatControllerSnapshot = {
  running: boolean;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastFailureMessage?: string;
  lastResponse?: HeartbeatResponse;
  inFlight: boolean;
};

export type { HeartbeatRequestBody, HeartbeatResponse };
