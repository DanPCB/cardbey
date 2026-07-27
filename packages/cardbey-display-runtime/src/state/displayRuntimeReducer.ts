import type { DisplayRuntimeEvent } from './displayRuntimeEvents.js';
import {
  createInitialRuntimeState,
  type DisplayRuntimeState,
  type DisplayRuntimeStatus,
} from './displayRuntimeState.js';

const ALLOWED: Record<DisplayRuntimeStatus, ReadonlySet<DisplayRuntimeStatus>> = {
  BOOTING: new Set(['UNPAIRED', 'SYNCING', 'ERROR']),
  UNPAIRED: new Set(['PAIRING', 'ERROR']),
  PAIRING: new Set(['PAIRING', 'SYNCING', 'UNPAIRED', 'ERROR']),
  SYNCING: new Set(['READY', 'PLAYING', 'OFFLINE_PLAYBACK', 'SYNCING', 'RECOVERING', 'ERROR', 'UNPAIRED']),
  READY: new Set(['PLAYING', 'SYNCING', 'PAUSED', 'OFFLINE_PLAYBACK', 'RECOVERING', 'ERROR', 'UNPAIRED']),
  PLAYING: new Set(['PAUSED', 'SYNCING', 'READY', 'OFFLINE_PLAYBACK', 'RECOVERING', 'ERROR', 'UNPAIRED', 'PLAYING']),
  PAUSED: new Set(['PLAYING', 'SYNCING', 'READY', 'OFFLINE_PLAYBACK', 'RECOVERING', 'ERROR', 'UNPAIRED']),
  OFFLINE_PLAYBACK: new Set(['PLAYING', 'SYNCING', 'RECOVERING', 'READY', 'ERROR', 'UNPAIRED', 'OFFLINE_PLAYBACK']),
  RECOVERING: new Set(['SYNCING', 'PLAYING', 'OFFLINE_PLAYBACK', 'READY', 'ERROR', 'UNPAIRED']),
  ERROR: new Set(['RECOVERING', 'UNPAIRED', 'SYNCING', 'BOOTING']),
};

function transition(
  state: DisplayRuntimeState,
  next: DisplayRuntimeStatus,
): DisplayRuntimeState {
  if (state.status === next) return state;
  if (!ALLOWED[state.status].has(next)) {
    // Deterministic: ignore illegal transition (keep state).
    return state;
  }
  return { ...state, status: next };
}

export function displayRuntimeReducer(
  state: DisplayRuntimeState,
  event: DisplayRuntimeEvent,
): DisplayRuntimeState {
  switch (event.type) {
    case 'BOOT_COMPLETED': {
      if (event.session?.pairingState === 'PAIRED') {
        return transition(
          { ...state, session: event.session, errorCode: undefined, errorMessage: undefined },
          'SYNCING',
        );
      }
      return transition(
        {
          ...state,
          session: event.session ?? createInitialRuntimeState().session,
          errorCode: undefined,
          errorMessage: undefined,
        },
        'UNPAIRED',
      );
    }
    case 'PAIRING_REQUESTED':
      return transition({ ...state, errorCode: undefined, errorMessage: undefined }, 'PAIRING');
    case 'PAIRING_CODE_RECEIVED':
      return {
        ...transition(state, 'PAIRING'),
        pairingCode: event.code,
        pairingExpiresAt: event.expiresAt,
        session: state.session
          ? { ...state.session, pairingState: 'PAIRING', sessionId: event.sessionId }
          : {
              deviceId: event.sessionId,
              pairingState: 'PAIRING',
              sessionId: event.sessionId,
            },
      };
    case 'PAIRING_APPROVED':
      return transition(
        {
          ...state,
          session: event.session,
          pairingCode: undefined,
          pairingExpiresAt: undefined,
          errorCode: undefined,
          errorMessage: undefined,
        },
        'SYNCING',
      );
    case 'PAIRING_FAILED':
      return transition(
        { ...state, errorCode: event.code, errorMessage: event.message },
        event.code === 'DISPLAY_PAIRING_EXPIRED' ? 'UNPAIRED' : 'ERROR',
      );
    case 'SYNC_STARTED':
      return transition(state, state.networkOnline ? 'SYNCING' : state.status);
    case 'MANIFEST_RECEIVED':
      return transition(
        {
          ...state,
          manifest: event.manifest,
          lastSyncAt: new Date().toISOString(),
          errorCode: undefined,
          errorMessage: undefined,
        },
        state.status === 'PLAYING' || state.status === 'PAUSED' ? state.status : 'READY',
      );
    case 'MANIFEST_EMPTY':
      return transition(
        { ...state, lastSyncAt: new Date().toISOString() },
        state.manifest ? state.status : 'READY',
      );
    case 'MANIFEST_REJECTED':
      if (state.manifest) {
        return { ...state, errorCode: event.code, errorMessage: event.message };
      }
      return transition(
        { ...state, errorCode: event.code, errorMessage: event.message },
        'ERROR',
      );
    case 'PLAYBACK_STARTED':
      return transition(
        { ...state, currentItemId: event.itemId ?? state.currentItemId },
        state.networkOnline ? 'PLAYING' : 'OFFLINE_PLAYBACK',
      );
    case 'PLAYBACK_PAUSED':
      return transition(state, 'PAUSED');
    case 'NETWORK_OFFLINE':
      return transition(
        { ...state, networkOnline: false },
        state.manifest ? 'OFFLINE_PLAYBACK' : 'RECOVERING',
      );
    case 'NETWORK_ONLINE':
      return transition({ ...state, networkOnline: true }, state.manifest ? 'SYNCING' : 'RECOVERING');
    case 'RECOVERY_STARTED':
      return transition(state, 'RECOVERING');
    case 'RECOVERY_SUCCEEDED':
      return transition(state, state.manifest ? 'PLAYING' : 'SYNCING');
    case 'RECOVERY_FAILED':
      return transition(
        { ...state, errorCode: event.code, errorMessage: event.message },
        'ERROR',
      );
    case 'HEARTBEAT_SUCCEEDED':
      return { ...state, lastHeartbeatAt: event.at };
    case 'FATAL_ERROR':
      return transition(
        { ...state, errorCode: event.code, errorMessage: event.message },
        'ERROR',
      );
    case 'UNPAIRED':
      return transition(
        {
          ...createInitialRuntimeState(
            state.session
              ? { ...state.session, pairingState: 'UNPAIRED', storeId: undefined, tenantId: undefined }
              : null,
          ),
          networkOnline: state.networkOnline,
        },
        'UNPAIRED',
      );
    default:
      return state;
  }
}

export function canTransition(from: DisplayRuntimeStatus, to: DisplayRuntimeStatus): boolean {
  return from === to || ALLOWED[from].has(to);
}
