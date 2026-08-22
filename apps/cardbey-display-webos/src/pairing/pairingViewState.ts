import type { PairingSnapshot } from '@cardbey/display-runtime';

export type PairingViewState =
  | { status: 'IDLE' }
  | { status: 'REQUESTING' }
  | {
      status: 'WAITING';
      sessionId: string;
      code: string;
      expiresAt?: string;
      claimUrl?: string;
    }
  | { status: 'CLAIMED'; sessionId: string }
  | { status: 'COMPLETING'; sessionId: string }
  | { status: 'COMPLETED'; deviceId: string }
  | { status: 'EXPIRED'; code?: string }
  | { status: 'FAILED'; errorCode: string; retryable: boolean; message?: string }
  | { status: 'CANCELLED' };

export function pairingSnapshotToViewState(
  snapshot: PairingSnapshot,
  claimUrl?: string,
): PairingViewState {
  switch (snapshot.status) {
    case 'idle':
      return { status: 'IDLE' };
    case 'requesting':
      return { status: 'REQUESTING' };
    case 'polling':
      if (!snapshot.sessionId || !snapshot.code) return { status: 'REQUESTING' };
      return {
        status: 'WAITING',
        sessionId: snapshot.sessionId,
        code: snapshot.code,
        expiresAt: snapshot.expiresAt,
        claimUrl,
      };
    case 'completing':
      return {
        status: snapshot.completionInFlight ? 'COMPLETING' : 'CLAIMED',
        sessionId: snapshot.sessionId || snapshot.deviceId || '',
      };
    case 'approved':
      return {
        status: 'COMPLETED',
        deviceId: snapshot.deviceId || snapshot.sessionId || '',
      };
    case 'expired':
      return { status: 'EXPIRED', code: snapshot.code };
    case 'failed':
      return {
        status: 'FAILED',
        errorCode: snapshot.errorCode || 'DISPLAY_PAIRING_FAILED',
        retryable: snapshot.errorCode !== 'DISPLAY_RESPONSE_INVALID',
        message: snapshot.errorMessage,
      };
    case 'cancelled':
      return { status: 'CANCELLED' };
    default: {
      const _exhaustive: never = snapshot.status;
      return { status: 'FAILED', errorCode: 'DISPLAY_RUNTIME_ERROR', retryable: true, message: String(_exhaustive) };
    }
  }
}
