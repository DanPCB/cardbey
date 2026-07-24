// Config
export {
  DEFAULT_RETRY,
  defaultRuntimeConfig,
  type DisplayRetryConfig,
  type DisplayRuntimeConfig,
  type DisplayRuntimeConfigInput,
} from './config/runtimeConfig.js';
export {
  apiUrl,
  assertApiBaseUrlAllowed,
  normalizeApiBaseUrl,
  validateRuntimeConfig,
} from './config/configValidation.js';

// Errors
export { DISPLAY_ERROR_CODES, type DisplayErrorCode } from './errors/errorCodes.js';
export { DisplayError, displayError, type DisplayErrorDetails } from './errors/displayError.js';

// Transport + Device V2 API
export {
  createFetchTransport,
  type HttpMethod,
  type HttpRequest,
  type HttpResponse,
  type HttpTransport,
} from './api/request.js';
export { createDeviceApiClient, type DeviceApiClient, type DeviceApiClientOptions } from './api/deviceApiClient.js';
export type {
  HeartbeatCommand,
  HeartbeatRequestBody,
  HeartbeatResponse,
  PairCompleteBody,
  PairCompleteResponse,
  PairStatusResponse,
  RawPlaylistFullResponse,
  RawPlaylistItem,
  RequestPairingBody,
  RequestPairingResponse,
} from './api/deviceApiContracts.js';

// Identity / session
export { createDeviceIdentity, type DeviceIdentity } from './identity/deviceIdentity.js';
export {
  createPairedSession,
  createUnpairedSession,
  type DevicePairingState,
  type DeviceSession,
} from './identity/deviceSession.js';
export {
  DEVICE_SESSION_SCHEMA_VERSION,
  clearDeviceSession,
  loadValidatedDeviceSession,
  parseStoredDeviceSession,
  persistDeviceSession,
  type PersistedDeviceSessionV1,
} from './identity/sessionPersistence.js';

// Media / playlist
export { normalizeMediaUrl, type NormalizeMediaUrlOptions } from './media/normalizeMediaUrl.js';
export type {
  DisplayFit,
  DisplayItemType,
  DisplayManifest,
  DisplayManifestItem,
  DisplayOrientation,
  DisplayTransition,
  EmptyPlaylistResult,
  NormalizePlaylistResult,
} from './playlist/displayManifest.js';
export { normalizePlaylist, type NormalizePlaylistOptions } from './playlist/normalizePlaylist.js';
export { validateManifest } from './playlist/validateManifest.js';
export { filterManifestBySchedule, isItemActiveAt } from './playlist/scheduleFilter.js';
export {
  createPlaylistSequencer,
  type PlaylistSequencer,
  type PlaylistSequencerState,
} from './playlist/sequencePlaylist.js';

// State machine
export {
  createInitialRuntimeState,
  type DisplayRuntimeState,
  type DisplayRuntimeStatus,
} from './state/displayRuntimeState.js';
export type { DisplayRuntimeEvent } from './state/displayRuntimeEvents.js';
export { canTransition, displayRuntimeReducer } from './state/displayRuntimeReducer.js';

export {
  contentCodeUserMessage,
  isGenericDeviceDisplayName,
  mapPlaylistFullStateToContentCode,
  normalizePlatformKey,
  platformDisplayLabel,
  resolveDevicePresentationName,
  type ManifestContentCode,
} from './platform/platformLabels.js';

// Controllers
export { PairingController, type PairingControllerDeps } from './pairing/pairingController.js';
export {
  normalizePairStatus,
  type PairStatusNormalized,
  type PairingControllerStatus,
  type PairingSnapshot,
} from './pairing/pairingTypes.js';
export { resolvePairingExpiresAt, secondsRemainingUntil } from './pairing/expiresAt.js';
export { HeartbeatController, type HeartbeatControllerDeps } from './heartbeat/heartbeatController.js';
export type {
  HeartbeatControllerSnapshot,
  HeartbeatPlaybackContext,
} from './heartbeat/heartbeatTypes.js';
export {
  SyncController,
  type SyncControllerDeps,
  type SyncControllerSnapshot,
  type SyncOutcome,
} from './sync/syncController.js';
export { BackoffTracker, computeBackoffDelayMs } from './sync/backoff.js';
export { nextRetryDelay, shouldRetryError } from './sync/retryPolicy.js';

// Storage / telemetry / platform
export { STORAGE_KEYS, type DisplayStorage } from './storage/displayStorage.js';
export { createMemoryStorage } from './storage/memoryStorage.js';
export {
  TelemetryQueue,
  type TelemetryQueueOptions,
} from './telemetry/telemetryQueue.js';
export { nullTelemetrySink } from './telemetry/nullTelemetrySink.js';
export type {
  DisplayTelemetryEvent,
  DisplayTelemetryEventType,
  TelemetrySink,
} from './telemetry/telemetryTypes.js';
export { FakeClock, SystemClock, type Clock } from './platform/clock.js';
export { createId, type PlatformAdapter } from './platform/platformAdapter.js';
