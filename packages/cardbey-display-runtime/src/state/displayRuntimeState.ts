import type { DisplayErrorCode } from '../errors/errorCodes.js';
import type { DeviceSession } from '../identity/deviceSession.js';
import type { DisplayManifest } from '../playlist/displayManifest.js';

export type DisplayRuntimeStatus =
  | 'BOOTING'
  | 'UNPAIRED'
  | 'PAIRING'
  | 'SYNCING'
  | 'READY'
  | 'PLAYING'
  | 'PAUSED'
  | 'OFFLINE_PLAYBACK'
  | 'RECOVERING'
  | 'ERROR';

export type DisplayRuntimeState = {
  status: DisplayRuntimeStatus;
  session: DeviceSession | null;
  pairingCode?: string;
  pairingExpiresAt?: string;
  manifest: DisplayManifest | null;
  currentItemId?: string;
  lastSyncAt?: string;
  lastHeartbeatAt?: string;
  networkOnline: boolean;
  errorCode?: DisplayErrorCode;
  errorMessage?: string;
};

export function createInitialRuntimeState(
  session: DeviceSession | null = null,
): DisplayRuntimeState {
  return {
    status: 'BOOTING',
    session,
    manifest: null,
    networkOnline: true,
  };
}
