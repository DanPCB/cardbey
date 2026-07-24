import type { DeviceApiClient } from '../api/deviceApiClient.js';
import type { DisplayRuntimeConfig } from '../config/runtimeConfig.js';
import type { DeviceIdentity } from '../identity/deviceIdentity.js';
import type { Clock } from '../platform/clock.js';
import type {
  HeartbeatControllerSnapshot,
  HeartbeatPlaybackContext,
} from './heartbeatTypes.js';

export type HeartbeatControllerDeps = {
  api: DeviceApiClient;
  config: DisplayRuntimeConfig;
  identity: DeviceIdentity;
  clock: Clock;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  onHeartbeat?: (snapshot: HeartbeatControllerSnapshot) => void;
};

export class HeartbeatController {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private playback: HeartbeatPlaybackContext = {};
  private snapshot: HeartbeatControllerSnapshot = { running: false, inFlight: false };
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;

  constructor(private readonly deps: HeartbeatControllerDeps) {
    this.setIntervalFn = deps.setIntervalFn ?? setInterval;
    this.clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
  }

  getSnapshot(): HeartbeatControllerSnapshot {
    return { ...this.snapshot, inFlight: this.inFlight };
  }

  updatePlaybackContext(ctx: HeartbeatPlaybackContext): void {
    this.playback = { ...this.playback, ...ctx };
  }

  /** After Core remaps identity, keep heartbeat payloads on the canonical id. */
  setDeviceId(deviceId: string): void {
    const next = deviceId.trim();
    if (!next || next === this.deps.identity.deviceId) return;
    this.deps.identity.deviceId = next;
  }

  start(): void {
    if (this.timer) return;
    this.snapshot = { ...this.snapshot, running: true };
    void this.tick();
    this.timer = this.setIntervalFn(() => {
      void this.tick();
    }, this.deps.config.heartbeatIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
    this.snapshot = { ...this.snapshot, running: false };
  }

  pause(): void {
    this.stop();
  }

  resume(): void {
    this.start();
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const { identity } = this.deps;
      const body = {
        deviceId: identity.deviceId,
        installationId: identity.installationId,
        engine: 'DEVICE_V2',
        engineVersion: identity.engineVersion,
        appVersion: identity.appVersion,
        platform: identity.platform,
        status: 'online',
        state: this.playback.state ?? (this.playback.isPlaying ? 'PLAYING' : 'IDLE'),
        meta: {
          timestamp: this.deps.clock.now().getTime(),
          hasPlaylist: Boolean(this.playback.playlistId),
          itemId: this.playback.itemId,
        },
        playbackState: {
          playlistId: this.playback.playlistId,
          currentIndex: this.playback.currentIndex,
          isPlaying: this.playback.isPlaying,
          itemId: this.playback.itemId,
        },
        currentPlaylistId: this.playback.playlistId,
      };
      const response = await this.deps.api.sendHeartbeat(body);
      this.snapshot = {
        running: this.snapshot.running,
        inFlight: false,
        lastSuccessAt: this.deps.clock.now().toISOString(),
        lastResponse: response,
        lastFailureAt: this.snapshot.lastFailureAt,
        lastFailureMessage: undefined,
      };
      this.deps.onHeartbeat?.(this.getSnapshot());
    } catch (err) {
      this.snapshot = {
        ...this.snapshot,
        inFlight: false,
        lastFailureAt: this.deps.clock.now().toISOString(),
        lastFailureMessage: err instanceof Error ? err.message : 'Heartbeat failed',
      };
      this.deps.onHeartbeat?.(this.getSnapshot());
    } finally {
      this.inFlight = false;
    }
  }
}
