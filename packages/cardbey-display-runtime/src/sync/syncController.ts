import type { DeviceApiClient } from '../api/deviceApiClient.js';
import type { DisplayRuntimeConfig } from '../config/runtimeConfig.js';
import { DisplayError, displayError } from '../errors/displayError.js';
import {
  browserClearInterval,
  browserSetInterval,
  browserSleep,
  isIllegalInvocationError,
} from '../platform/browserHost.js';
import type { Clock } from '../platform/clock.js';
import { mapPlaylistFullStateToContentCode } from '../platform/platformLabels.js';
import { normalizePlaylist } from '../playlist/normalizePlaylist.js';
import { validateManifest } from '../playlist/validateManifest.js';
import type { DisplayManifest } from '../playlist/displayManifest.js';
import { STORAGE_KEYS, type DisplayStorage } from '../storage/displayStorage.js';
import { BackoffTracker } from './backoff.js';

export type SyncOutcome =
  | { kind: 'unchanged'; revision: string | number }
  | { kind: 'updated'; manifest: DisplayManifest }
  | {
      kind: 'empty';
      state?: string;
      message?: string;
      deviceId?: string;
      contentCode?: string;
    }
  | { kind: 'rejected'; error: DisplayError; preserved: DisplayManifest | null }
  | { kind: 'network'; error: DisplayError; preserved: DisplayManifest | null };

export type SyncControllerSnapshot = {
  running: boolean;
  inFlight: boolean;
  lastSyncAt?: string;
  lastOutcome?: SyncOutcome['kind'];
  lastEmptyState?: string;
  lastContentCode?: string;
  lastHttpStatus?: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastOperation?: string;
  offline: boolean;
  activeManifest: DisplayManifest | null;
  deviceId: string;
};

export type SyncControllerDeps = {
  api: DeviceApiClient;
  config: DisplayRuntimeConfig;
  storage: DisplayStorage;
  clock: Clock;
  deviceId: string;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  sleep?: (ms: number) => Promise<void>;
  onChange?: (snapshot: SyncControllerSnapshot) => void;
};

export class SyncController {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private abort: AbortController | null = null;
  private activeManifest: DisplayManifest | null = null;
  private offline = false;
  private lastSyncAt?: string;
  private lastOutcome?: SyncOutcome['kind'];
  private lastEmptyState?: string;
  private lastContentCode?: string;
  private lastHttpStatus?: number;
  private lastErrorCode?: string;
  private lastErrorMessage?: string;
  private lastOperation?: string;
  private deviceId: string;
  private readonly backoff: BackoffTracker;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly deps: SyncControllerDeps) {
    this.deviceId = deps.deviceId;
    this.backoff = new BackoffTracker(deps.config.retry);
    this.setIntervalFn = deps.setIntervalFn ?? (browserSetInterval as unknown as typeof setInterval);
    this.clearIntervalFn =
      deps.clearIntervalFn ?? (browserClearInterval as unknown as typeof clearInterval);
    this.sleep = deps.sleep ?? browserSleep;
  }

  getSnapshot(): SyncControllerSnapshot {
    return {
      running: Boolean(this.timer),
      inFlight: this.inFlight,
      lastSyncAt: this.lastSyncAt,
      lastOutcome: this.lastOutcome,
      lastEmptyState: this.lastEmptyState,
      lastContentCode: this.lastContentCode,
      lastHttpStatus: this.lastHttpStatus,
      lastErrorCode: this.lastErrorCode,
      lastErrorMessage: this.lastErrorMessage,
      lastOperation: this.lastOperation,
      offline: this.offline,
      activeManifest: this.activeManifest,
      deviceId: this.deviceId,
    };
  }

  /** Rebind after heartbeat remaps canonical device id. */
  setDeviceId(deviceId: string): void {
    const next = deviceId.trim();
    if (!next || next === this.deviceId) return;
    this.deviceId = next;
    this.activeManifest = null;
    this.lastOutcome = undefined;
    this.lastEmptyState = undefined;
    this.lastContentCode = undefined;
    void this.deps.storage.remove(STORAGE_KEYS.lastValidManifest);
    this.emit();
    if (this.timer) void this.syncNow();
  }

  async restoreCachedManifest(): Promise<DisplayManifest | null> {
    this.lastOperation = 'STORAGE_RESTORE_MANIFEST';
    const cached = await this.deps.storage.get<DisplayManifest>(STORAGE_KEYS.lastValidManifest);
    if (cached) this.activeManifest = cached;
    this.emit();
    return cached;
  }

  start(): void {
    if (this.timer) return;
    void this.syncNow();
    this.timer = this.setIntervalFn(() => {
      void this.syncNow();
    }, this.deps.config.playlistSyncIntervalMs);
    this.emit();
  }

  stop(): void {
    if (this.timer) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
    this.abort?.abort();
    this.abort = null;
    this.emit();
  }

  async syncNow(): Promise<SyncOutcome> {
    if (this.inFlight) {
      return {
        kind: 'unchanged',
        revision: this.activeManifest?.revision ?? 'in_flight',
      };
    }
    this.inFlight = true;
    this.abort = new AbortController();
    this.lastOperation = 'MANIFEST_REQUEST_STARTED';
    this.emit();

    try {
      let raw;
      try {
        raw = await this.deps.api.fetchFullPlaylist(this.deviceId, this.abort.signal);
        this.lastOperation = 'MANIFEST_RESPONSE_RECEIVED';
      } catch (fetchErr) {
        if (isIllegalInvocationError(fetchErr)) {
          throw displayError('DISPLAY_NETWORK_ERROR', 'MANIFEST_FETCH_INVOCATION_FAILED', {
            retryable: true,
            cause: fetchErr,
            context: { operation: 'MANIFEST_FETCH_INVOCATION_FAILED' },
          });
        }
        throw fetchErr;
      }

      let normalized;
      try {
        this.lastOperation = 'MANIFEST_PARSED';
        normalized = normalizePlaylist(raw, {
          apiBaseUrl: this.deps.config.apiBaseUrl,
          allowInsecureLocalHttp: this.deps.config.allowInsecureLocalHttp,
          defaultImageDurationMs: this.deps.config.defaultImageDurationMs,
        });
      } catch (normErr) {
        throw displayError('DISPLAY_PLAYLIST_INVALID', 'MANIFEST_NORMALIZATION_FAILED', {
          retryable: false,
          cause: normErr,
          context: { operation: 'MANIFEST_NORMALIZATION_FAILED' },
        });
      }

      this.offline = false;
      this.backoff.reset();
      this.lastSyncAt = this.deps.clock.now().toISOString();
      this.lastHttpStatus = 200;
      this.lastErrorCode = undefined;
      this.lastErrorMessage = undefined;

      if (normalized.kind === 'empty') {
        const contentCode = mapPlaylistFullStateToContentCode(normalized.state, {
          httpStatus: 200,
          itemCount: 0,
        });
        this.activeManifest = null;
        await this.deps.storage.remove(STORAGE_KEYS.lastValidManifest);
        this.lastOutcome = 'empty';
        this.lastEmptyState = normalized.state;
        this.lastContentCode = contentCode;
        this.lastOperation = 'ASSIGNMENT_FOUND';
        const outcome: SyncOutcome = {
          kind: 'empty',
          state: normalized.state,
          deviceId: normalized.deviceId,
          contentCode,
        };
        this.emit();
        return outcome;
      }

      this.lastOperation = 'DEVICE_RESOLVED';
      const manifest = validateManifest(normalized.manifest);
      if (
        this.activeManifest &&
        String(this.activeManifest.revision) === String(manifest.revision) &&
        this.activeManifest.playlist.id === manifest.playlist.id
      ) {
        this.lastOutcome = 'unchanged';
        this.lastContentCode = 'MANIFEST_READY';
        this.lastOperation = 'MANIFEST_READY';
        const outcome: SyncOutcome = { kind: 'unchanged', revision: manifest.revision };
        this.emit();
        return outcome;
      }

      this.activeManifest = manifest;
      await this.deps.storage.set(STORAGE_KEYS.lastValidManifest, manifest);
      this.lastOutcome = 'updated';
      this.lastEmptyState = undefined;
      this.lastContentCode = 'MANIFEST_READY';
      this.lastOperation = 'MANIFEST_READY';
      const outcome: SyncOutcome = { kind: 'updated', manifest };
      this.emit();
      return outcome;
    } catch (err) {
      const error = DisplayError.isDisplayError(err)
        ? err
        : displayError('DISPLAY_NETWORK_ERROR', 'Playlist sync failed', {
            retryable: true,
            cause: err,
          });

      this.lastErrorCode = error.code;
      this.lastErrorMessage = error.message;
      this.lastHttpStatus = error.httpStatus;

      if (isIllegalInvocationError(err) || /INVOCATION_FAILED/i.test(error.message)) {
        this.offline = true;
        this.lastOutcome = 'network';
        this.lastContentCode = 'MANIFEST_FETCH_INVOCATION_FAILED';
        this.lastOperation = 'MANIFEST_FETCH_INVOCATION_FAILED';
        const outcome: SyncOutcome = {
          kind: 'network',
          error,
          preserved: this.activeManifest,
        };
        this.emit();
        if (this.timer) {
          await this.sleep(this.backoff.nextDelayMs());
        }
        return outcome;
      }

      if (error.message === 'MANIFEST_NORMALIZATION_FAILED') {
        this.lastOutcome = 'rejected';
        this.lastContentCode = 'MANIFEST_NORMALIZATION_FAILED';
        this.lastOperation = 'MANIFEST_NORMALIZATION_FAILED';
        const outcome: SyncOutcome = {
          kind: 'rejected',
          error,
          preserved: this.activeManifest,
        };
        this.emit();
        return outcome;
      }

      if (
        error.code === 'DISPLAY_PLAYLIST_INVALID' ||
        error.code === 'DISPLAY_RESPONSE_INVALID' ||
        (error.code === 'DISPLAY_API_ERROR' && !error.retryable)
      ) {
        const contentCode =
          error.httpStatus === 404
            ? 'DEVICE_NOT_FOUND'
            : mapPlaylistFullStateToContentCode(undefined, {
                httpStatus: error.httpStatus,
              });
        this.lastOutcome = 'rejected';
        this.lastContentCode = contentCode;
        this.lastOperation = 'MANIFEST_HTTP_ERROR';
        const outcome: SyncOutcome = {
          kind: 'rejected',
          error,
          preserved: this.activeManifest,
        };
        this.emit();
        return outcome;
      }

      this.offline = true;
      this.lastOutcome = 'network';
      this.lastContentCode = 'MANIFEST_NETWORK_FAILED';
      this.lastOperation = 'MANIFEST_NETWORK_FAILED';
      const delay = this.backoff.nextDelayMs();
      const outcome: SyncOutcome = {
        kind: 'network',
        error,
        preserved: this.activeManifest,
      };
      this.emit();
      if (this.timer) {
        await this.sleep(delay);
      }
      return outcome;
    } finally {
      this.inFlight = false;
      this.abort = null;
      this.emit();
    }
  }

  private emit(): void {
    this.deps.onChange?.(this.getSnapshot());
  }
}
