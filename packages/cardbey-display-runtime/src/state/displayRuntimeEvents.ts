import type { DisplayErrorCode } from '../errors/errorCodes.js';
import type { DeviceSession } from '../identity/deviceSession.js';
import type { DisplayManifest } from '../playlist/displayManifest.js';

export type DisplayRuntimeEvent =
  | { type: 'BOOT_COMPLETED'; session: DeviceSession | null }
  | { type: 'PAIRING_REQUESTED' }
  | { type: 'PAIRING_CODE_RECEIVED'; code: string; expiresAt?: string; sessionId: string }
  | { type: 'PAIRING_APPROVED'; session: DeviceSession }
  | { type: 'PAIRING_FAILED'; code: DisplayErrorCode; message: string }
  | { type: 'SYNC_STARTED' }
  | { type: 'MANIFEST_RECEIVED'; manifest: DisplayManifest }
  | { type: 'MANIFEST_EMPTY' }
  | { type: 'MANIFEST_REJECTED'; code: DisplayErrorCode; message: string }
  | { type: 'PLAYBACK_STARTED'; itemId?: string }
  | { type: 'PLAYBACK_PAUSED' }
  | { type: 'NETWORK_OFFLINE' }
  | { type: 'NETWORK_ONLINE' }
  | { type: 'RECOVERY_STARTED' }
  | { type: 'RECOVERY_SUCCEEDED' }
  | { type: 'RECOVERY_FAILED'; code: DisplayErrorCode; message: string }
  | { type: 'HEARTBEAT_SUCCEEDED'; at: string }
  | { type: 'FATAL_ERROR'; code: DisplayErrorCode; message: string }
  | { type: 'UNPAIRED' };
