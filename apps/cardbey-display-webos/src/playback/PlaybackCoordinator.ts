import {
  TelemetryQueue,
  browserClearTimeout,
  browserSetTimeout,
  createPlaylistSequencer,
  filterManifestBySchedule,
  isItemActiveAt,
  nullTelemetrySink,
  type Clock,
  type DisplayManifest,
  type DisplayManifestItem,
  type HeartbeatController,
  type PlaylistSequencer,
  type TelemetrySink,
} from '@cardbey/display-runtime';
import {
  resolveImageDurationMs,
  resolveVideoMaxDurationMs,
  SHELL_DEFAULT_IMAGE_DURATION_MS,
} from './duration.js';
import { maskMediaUrl } from './maskMediaUrl.js';
import type { MediaPlaybackError } from './mediaErrors.js';
import { MediaStage } from './MediaStage.js';
import {
  type NoContentReason,
  type PlaybackDiagnostics,
  type PlaybackSkipReason,
  type PlaybackState,
  type WatchdogKind,
} from './playbackState.js';
import { ItemWatchdog } from './watchdog.js';

export type PlaybackCoordinatorDeps = {
  stage: HTMLElement;
  clock: Clock;
  defaultImageDurationMs?: number;
  mediaTimeoutMs?: number;
  stallTimeoutMs?: number;
  allFailedRetryMs?: number;
  scheduleRefreshMaxMs?: number;
  heartbeat?: HeartbeatController | null;
  telemetrySink?: TelemetrySink;
  onStateChange?: (state: PlaybackState, diagnostics: PlaybackDiagnostics) => void;
  onRuntimeEvent?: (
    event:
      | { type: 'PLAYBACK_STARTED'; itemId?: string }
      | { type: 'PLAYBACK_PAUSED' }
      | { type: 'MANIFEST_EMPTY' }
      | { type: 'NETWORK_OFFLINE' }
      | { type: 'NETWORK_ONLINE' }
      | { type: 'RECOVERY_STARTED' }
      | { type: 'RECOVERY_SUCCEEDED' },
  ) => void;
  setTimeoutFn?: (handler: () => void, timeout?: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
};

type ItemFingerprint = string;

function fingerprint(item: DisplayManifestItem): ItemFingerprint {
  return `${item.id}|${item.type}|${item.url}`;
}

/**
 * Owns playback orchestration. Uses runtime sequencer; does not reimplement ordering.
 */
export class PlaybackCoordinator {
  private readonly media: MediaStage;
  private readonly clock: Clock;
  private readonly defaultImageDurationMs: number;
  private readonly mediaTimeoutMs: number;
  private readonly stallTimeoutMs: number;
  private readonly allFailedRetryMs: number;
  private readonly scheduleRefreshMaxMs: number;
  private readonly telemetry: TelemetryQueue;
  private readonly setTimeoutFn: (
    handler: () => void,
    timeout?: number,
  ) => ReturnType<typeof setTimeout>;
  private readonly clearTimeoutFn: (id: ReturnType<typeof setTimeout>) => void;

  private rawManifest: DisplayManifest | null = null;
  private eligibleManifest: DisplayManifest | null = null;
  private sequencer: PlaylistSequencer | null = null;
  private state: PlaybackState = { status: 'IDLE' };
  private generation = 0;
  private failedIds = new Set<string>();
  private advanceGuard = new Set<number>();
  private staleEventCount = 0;
  private recoveryAttemptCount = 0;
  private lastManifestReplace = 'none';
  private lastMediaEvent?: string;
  private lastMediaError?: string;
  private activeWatchdog: ItemWatchdog | null = null;
  private imageTimer: ReturnType<typeof setTimeout> | null = null;
  private imageRemainingMs: number | null = null;
  private imageDeadline: number | null = null;
  private videoMaxTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduleTimer: ReturnType<typeof setTimeout> | null = null;
  private allFailedTimer: ReturnType<typeof setTimeout> | null = null;
  private userPaused = false;
  private lifecyclePaused = false;
  private wasPlayingBeforeLifecycle = false;
  private networkOnline = true;
  private activeFingerprint: ItemFingerprint | null = null;
  private destroyed = false;
  private heartbeat: HeartbeatController | null;

  constructor(private readonly deps: PlaybackCoordinatorDeps) {
    this.media = new MediaStage(deps.stage);
    this.clock = deps.clock;
    this.heartbeat = deps.heartbeat ?? null;
    this.defaultImageDurationMs = deps.defaultImageDurationMs ?? SHELL_DEFAULT_IMAGE_DURATION_MS;
    this.mediaTimeoutMs = deps.mediaTimeoutMs ?? 20_000;
    this.stallTimeoutMs = deps.stallTimeoutMs ?? 12_000;
    this.allFailedRetryMs = deps.allFailedRetryMs ?? 30_000;
    this.scheduleRefreshMaxMs = deps.scheduleRefreshMaxMs ?? 60_000;
    this.telemetry = new TelemetryQueue({
      sink: deps.telemetrySink ?? nullTelemetrySink,
      clock: deps.clock,
      maxQueueSize: 100,
    });
    this.setTimeoutFn =
      deps.setTimeoutFn ??
      ((handler, timeout) => browserSetTimeout(handler, timeout));
    this.clearTimeoutFn =
      deps.clearTimeoutFn ?? ((id) => browserClearTimeout(id));
  }

  getState(): PlaybackState {
    return this.state;
  }

  getDiagnostics(): PlaybackDiagnostics {
    const item =
      this.state.status === 'PLAYING' ||
      this.state.status === 'PAUSED' ||
      this.state.status === 'PREPARING'
        ? this.state.item
        : this.state.status === 'TRANSITIONING'
          ? this.state.toItem
          : undefined;
    const video = this.media.getVideoSnapshot();
    return {
      playbackStatus: this.state.status,
      manifestId: this.rawManifest?.id,
      manifestRevision: this.rawManifest?.revision,
      playlistId: this.sequencer?.getState().playlistId,
      itemCount: this.rawManifest?.playlist.items.length ?? 0,
      eligibleItemCount: this.eligibleManifest?.playlist.items.length ?? 0,
      currentItemId: item?.id,
      currentItemType: item?.type,
      currentMediaHostPath: maskMediaUrl(item?.url),
      startedAt: this.state.status === 'PLAYING' ? this.state.startedAt : undefined,
      remainingImageMs:
        this.state.status === 'PAUSED'
          ? this.state.remainingImageMs
          : this.imageDeadline != null
            ? Math.max(0, this.imageDeadline - Date.now())
            : undefined,
      videoCurrentTime: video.currentTime,
      videoDuration: video.duration,
      videoReadyState: video.readyState,
      videoNetworkState: video.networkState,
      muted: video.muted ?? this.eligibleManifest?.settings.muted,
      paused: this.state.status === 'PAUSED' || video.paused,
      activeWatchdog: this.activeWatchdog?.kind,
      lastMediaEvent: this.lastMediaEvent,
      lastMediaError: this.lastMediaError,
      failedItemIds: [...this.failedIds],
      recoveryAttemptCount: this.recoveryAttemptCount,
      staleEventCount: this.staleEventCount,
      lastManifestReplace: this.lastManifestReplace,
      cachedManifest: Boolean(this.rawManifest),
      noContentReason:
        this.state.status === 'WAITING_FOR_CONTENT'
          ? this.state.reason
          : this.state.status === 'FAILED'
            ? this.state.reason
            : undefined,
      generation: this.generation,
    };
  }

  setHeartbeat(heartbeat: HeartbeatController | null): void {
    this.heartbeat = heartbeat;
  }

  setNetworkOnline(online: boolean): void {
    if (this.networkOnline === online) return;
    this.networkOnline = online;
    if (!online) {
      this.telemetry.enqueue('OFFLINE_ENTERED');
      this.deps.onRuntimeEvent?.({ type: 'NETWORK_OFFLINE' });
    } else {
      this.telemetry.enqueue('ONLINE_RESTORED');
      this.deps.onRuntimeEvent?.({ type: 'NETWORK_ONLINE' });
    }
    this.emit();
  }

  setManifest(manifest: DisplayManifest | null): void {
    if (this.destroyed) return;

    if (!manifest || manifest.playlist.items.length === 0) {
      this.rawManifest = manifest;
      this.eligibleManifest = null;
      this.sequencer = null;
      this.failedIds.clear();
      this.stopMediaTimers();
      this.media.clear();
      this.setState({
        status: 'WAITING_FOR_CONTENT',
        reason: manifest ? 'VALID_EMPTY_PLAYLIST' : 'PAIRED_NO_PLAYLIST',
      });
      this.lastManifestReplace = 'empty';
      this.deps.onRuntimeEvent?.({ type: 'MANIFEST_EMPTY' });
      this.updateHeartbeat('IDLE');
      this.armScheduleRefresh();
      return;
    }

    const previousRevision = this.rawManifest?.revision;
    const previousFp = this.activeFingerprint;
    this.rawManifest = manifest;

    if (previousRevision === manifest.revision && this.sequencer) {
      this.lastManifestReplace = 'unchanged';
      this.refreshSchedule(false);
      return;
    }

    this.failedIds.clear();
    this.refreshSchedule(true);

    const current = this.sequencer?.current() ?? null;
    if (current) {
      const fp = fingerprint(current);
      if (previousFp && previousFp === fp && this.state.status === 'PLAYING') {
        this.lastManifestReplace = 'preserved';
        this.emit();
        return;
      }
      if (previousFp && previousFp.startsWith(`${current.id}|`) && previousFp !== fp) {
        this.lastManifestReplace = 'same_id_reload';
        void this.activateCurrent('manifest');
        return;
      }
      if (this.state.status === 'IDLE' || this.state.status === 'WAITING_FOR_CONTENT' || this.state.status === 'FAILED') {
        this.lastManifestReplace = 'activate';
        void this.play();
        return;
      }
      if (!previousFp || !previousFp.startsWith(`${current.id}|`)) {
        this.lastManifestReplace = 'item_changed';
        void this.activateCurrent('manifest');
        return;
      }
    } else {
      this.lastManifestReplace = 'no_eligible';
      this.setState({ status: 'WAITING_FOR_CONTENT', reason: 'ALL_ITEMS_OUTSIDE_SCHEDULE' });
    }
    this.emit();
  }

  async play(): Promise<void> {
    if (this.destroyed) return;
    this.userPaused = false;
    if (!this.sequencer?.current()) {
      this.refreshSchedule(true);
    }
    if (!this.sequencer?.current()) {
      this.setState({
        status: 'WAITING_FOR_CONTENT',
        reason: this.rawManifest ? 'ALL_ITEMS_OUTSIDE_SCHEDULE' : 'PAIRED_NO_PLAYLIST',
      });
      return;
    }
    await this.activateCurrent('play');
  }

  pause(): void {
    if (this.state.status !== 'PLAYING' && this.state.status !== 'PREPARING') return;
    this.userPaused = true;
    this.pauseInternal('user');
  }

  async resume(): Promise<void> {
    if (!this.userPaused && this.state.status === 'PAUSED') {
      // lifecycle resume path may clear lifecyclePaused first
    }
    this.userPaused = false;
    if (this.state.status !== 'PAUSED') {
      await this.play();
      return;
    }
    const paused = this.state;
    this.media.resume().catch(() => undefined);
    if (paused.item.type === 'IMAGE' && paused.remainingImageMs != null) {
      this.startImageTimer(paused.item.id, paused.generation, paused.remainingImageMs);
    }
    this.activeWatchdog?.resume();
    this.setState({
      status: 'PLAYING',
      item: paused.item,
      playlistId: paused.playlistId,
      startedAt: paused.pausedAt,
      generation: paused.generation,
    });
    this.updateHeartbeat('PLAYING');
    this.telemetry.enqueue('PLAYBACK_RESUMED', { itemId: paused.item.id,
      playlistId: paused.playlistId });
    this.deps.onRuntimeEvent?.({ type: 'PLAYBACK_STARTED', itemId: paused.item.id });
  }

  stop(): void {
    this.userPaused = true;
    this.stopMediaTimers();
    this.media.clear();
    this.activeFingerprint = null;
    this.setState({ status: 'IDLE' });
    this.updateHeartbeat('IDLE');
    this.telemetry.enqueue('PLAYBACK_STOPPED');
  }

  skip(reason: PlaybackSkipReason): void {
    const gen = this.generation;
    if (this.advanceGuard.has(gen)) return;
    this.advanceGuard.add(gen);
    this.advance(reason);
  }

  next(): void {
    this.skip('manual_next');
  }

  previous(): void {
    if (!this.sequencer) return;
    this.sequencer.previous();
    void this.activateCurrent('manual_prev');
  }

  handleMediaReady(itemId: string, generation: number): void {
    if (!this.isCurrent(generation, itemId)) {
      this.staleEventCount += 1;
      return;
    }
    this.lastMediaEvent = 'ready';
    this.clearWatchdogKind('LOAD_TIMEOUT');
    this.clearWatchdogKind('START_TIMEOUT');
    const item = this.sequencer?.current();
    // Images have no separate playing event — ready means visible.
    if (item?.type === 'IMAGE') {
      this.onPlaying(itemId, generation);
      return;
    }
    this.emit();
  }

  handleMediaEnded(itemId: string, generation: number): void {
    if (!this.isCurrent(generation, itemId)) {
      this.staleEventCount += 1;
      return;
    }
    this.lastMediaEvent = 'ended';
    this.failedIds.delete(itemId);
    this.skip('ended');
  }

  handleMediaError(itemId: string, generation: number, error: MediaPlaybackError): void {
    if (!this.isCurrent(generation, itemId)) {
      this.staleEventCount += 1;
      return;
    }
    this.lastMediaEvent = 'error';
    this.lastMediaError = error.code;
    this.failedIds.add(itemId);
    this.telemetry.enqueue('ITEM_FAILED', {
      itemId,
      metadata: { code: error.code },
    });
    this.skip('media_error');
  }

  onLifecycleBackground(): void {
    this.lifecyclePaused = true;
    this.wasPlayingBeforeLifecycle = this.state.status === 'PLAYING' && !this.userPaused;
    if (this.state.status === 'PLAYING') this.pauseInternal('lifecycle');
  }

  async onLifecycleForeground(): Promise<void> {
    this.lifecyclePaused = false;
    if (this.userPaused) {
      this.emit();
      return;
    }
    if (this.wasPlayingBeforeLifecycle) {
      this.wasPlayingBeforeLifecycle = false;
      await this.resume();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.stopMediaTimers();
    this.clearScheduleTimer();
    if (this.allFailedTimer) this.clearTimeoutFn(this.allFailedTimer);
    this.media.destroy();
    this.sequencer = null;
  }

  private async activateCurrent(_reason: string): Promise<void> {
    if (this.destroyed || this.userPaused) return;
    const item = this.sequencer?.current() ?? null;
    const playlistId = this.sequencer?.getState().playlistId || '';
    if (!item || !this.eligibleManifest) {
      this.setState({
        status: 'WAITING_FOR_CONTENT',
        reason: 'ALL_ITEMS_OUTSIDE_SCHEDULE',
      });
      return;
    }

    if (!isItemActiveAt(item, this.clock.now())) {
      this.skip('schedule_invalid');
      return;
    }

    if (this.failedIds.has(item.id) && this.allEligibleFailed()) {
      this.enterAllFailed();
      return;
    }

    this.stopMediaTimers();
    this.generation += 1;
    const generation = this.generation;
    this.advanceGuard.delete(generation);
    this.activeFingerprint = fingerprint(item);

    this.setState({
      status: 'PREPARING',
      item,
      playlistId,
      generation,
    });

    this.telemetry.enqueue('ITEM_PREPARING', { itemId: item.id,
      playlistId });

    this.armWatchdog('LOAD_TIMEOUT', generation, this.mediaTimeoutMs);
    if (item.type === 'VIDEO') {
      this.armWatchdog('START_TIMEOUT', generation, this.mediaTimeoutMs);
    }

    const settings = this.eligibleManifest.settings;
    const muted = item.muted ?? settings.muted;

    this.media.showItem(item, {
      fit: item.fit ?? settings.fit,
      muted,
      transition: settings.transition,
      transitionDurationMs: settings.transitionDurationMs,
      callbacks: {
        generation,
        isCurrentGeneration: (g) => g === this.generation && !this.destroyed,
        onReady: (id, g) => this.handleMediaReady(id, g),
        onPlaying: (id, g) => this.onPlaying(id, g),
        onEnded: (id, g) => this.handleMediaEnded(id, g),
        onError: (id, g, err) => this.handleMediaError(id, g, err),
        onWaiting: (id, g) => this.onWaiting(id, g),
        onStallClear: (id, g) => this.onStallClear(id, g),
        onTransitionDone: (g) => {
          if (g !== this.generation) this.staleEventCount += 1;
        },
      },
    });
  }

  private onPlaying(itemId: string, generation: number): void {
    if (!this.isCurrent(generation, itemId)) {
      this.staleEventCount += 1;
      return;
    }
    const item = this.sequencer?.current();
    if (!item) return;
    this.clearWatchdogKind('START_TIMEOUT');
    this.clearWatchdogKind('LOAD_TIMEOUT');
    this.failedIds.delete(itemId);
    this.lastMediaEvent = 'playing';

    const playlistId = this.sequencer?.getState().playlistId || '';
    this.setState({
      status: 'PLAYING',
      item,
      playlistId,
      startedAt: this.clock.now().toISOString(),
      generation,
    });
    this.updateHeartbeat('PLAYING');
    this.deps.onRuntimeEvent?.({ type: 'PLAYBACK_STARTED', itemId });
    this.telemetry.enqueue('ITEM_STARTED', { itemId,
      playlistId });

    if (item.type === 'IMAGE' && this.eligibleManifest) {
      const duration = resolveImageDurationMs(
        item,
        this.eligibleManifest,
        this.defaultImageDurationMs,
      );
      this.startImageTimer(itemId, generation, duration);
    }

    if (item.type === 'VIDEO') {
      const maxMs = resolveVideoMaxDurationMs(item);
      if (maxMs != null) {
        this.armWatchdog('MAX_PLAYBACK_TIMEOUT', generation, maxMs);
        this.videoMaxTimer = this.setTimeoutFn(() => {
          if (!this.isCurrent(generation, itemId)) return;
          this.skip('video_max_duration');
        }, maxMs);
      }
    }
  }

  private onWaiting(itemId: string, generation: number): void {
    if (!this.isCurrent(generation, itemId)) return;
    this.lastMediaEvent = 'waiting';
    if (this.activeWatchdog?.kind === 'STALL_TIMEOUT') return;
    this.armWatchdog('STALL_TIMEOUT', generation, this.stallTimeoutMs);
    this.emit();
  }

  private onStallClear(itemId: string, generation: number): void {
    if (!this.isCurrent(generation, itemId)) return;
    this.clearWatchdogKind('STALL_TIMEOUT');
  }

  private startImageTimer(itemId: string, generation: number, durationMs: number): void {
    this.clearImageTimer();
    this.imageDeadline = Date.now() + durationMs;
    this.imageRemainingMs = durationMs;
    this.imageTimer = this.setTimeoutFn(() => {
      if (!this.isCurrent(generation, itemId)) {
        this.staleEventCount += 1;
        return;
      }
      this.failedIds.delete(itemId);
      this.telemetry.enqueue('ITEM_COMPLETED', { itemId });
      this.skip('image_duration');
    }, durationMs);
  }

  private pauseInternal(_source: 'user' | 'lifecycle'): void {
    if (this.state.status !== 'PLAYING' && this.state.status !== 'PREPARING') return;
    const item =
      this.state.status === 'PLAYING' || this.state.status === 'PREPARING'
        ? this.state.item
        : null;
    if (!item) return;
    const playlistId =
      this.state.status === 'PLAYING' || this.state.status === 'PREPARING'
        ? this.state.playlistId
        : '';
    const generation = this.state.generation;

    let remainingImageMs: number | undefined;
    if (item.type === 'IMAGE' && this.imageDeadline != null) {
      remainingImageMs = Math.max(0, this.imageDeadline - Date.now());
      this.clearImageTimer();
      this.imageRemainingMs = remainingImageMs;
    }
    this.media.pause();
    this.activeWatchdog?.pause();

    this.setState({
      status: 'PAUSED',
      item,
      playlistId,
      pausedAt: this.clock.now().toISOString(),
      generation,
      remainingImageMs,
    });
    this.updateHeartbeat('PAUSED');
    this.deps.onRuntimeEvent?.({ type: 'PLAYBACK_PAUSED' });
    this.telemetry.enqueue('PLAYBACK_PAUSED', { itemId: item.id });
  }

  private advance(reason: PlaybackSkipReason): void {
    this.stopMediaTimers();
    if (!this.sequencer) return;

    if (reason === 'media_error' || reason === 'load_timeout' || reason === 'start_timeout' || reason === 'stall_timeout') {
      this.telemetry.enqueue('ITEM_SKIPPED', { metadata: { reason } });
    }

    if (this.allEligibleFailed()) {
      this.enterAllFailed();
      return;
    }

    // Skip already-failed items in this pass
    let next = this.sequencer.next();
    let guard = 0;
    while (next && this.failedIds.has(next.id) && guard < (this.eligibleManifest?.playlist.items.length || 0) + 1) {
      next = this.sequencer.next();
      guard += 1;
    }

    if (!next || this.sequencer.getState().exhausted && !this.sequencer.getState().loop) {
      if (this.allEligibleFailed()) {
        this.enterAllFailed();
        return;
      }
      if (!this.sequencer.getState().loop) {
        this.setState({ status: 'IDLE' });
        this.updateHeartbeat('IDLE');
        return;
      }
    }

    if (this.allEligibleFailed()) {
      this.enterAllFailed();
      return;
    }

    void this.activateCurrent(reason);
  }

  private allEligibleFailed(): boolean {
    const items = this.eligibleManifest?.playlist.items ?? [];
    if (items.length === 0) return false;
    return items.every((i) => this.failedIds.has(i.id));
  }

  private enterAllFailed(): void {
    this.stopMediaTimers();
    this.media.clear();
    this.setState({
      status: 'FAILED',
      errorCode: 'DISPLAY_MEDIA_ALL_ITEMS_FAILED',
      recoverable: true,
      reason: 'ALL_ITEMS_FAILED',
    });
    this.updateHeartbeat('RECOVERING');
    this.deps.onRuntimeEvent?.({ type: 'RECOVERY_STARTED' });
    this.telemetry.enqueue('ALL_ITEMS_FAILED');

    if (this.allFailedTimer) this.clearTimeoutFn(this.allFailedTimer);
    this.allFailedTimer = this.setTimeoutFn(() => {
      this.allFailedTimer = null;
      this.failedIds.clear();
      this.recoveryAttemptCount += 1;
      this.deps.onRuntimeEvent?.({ type: 'RECOVERY_SUCCEEDED' });
      void this.play();
    }, this.allFailedRetryMs);
  }

  private refreshSchedule(replaceSequencer: boolean): void {
    if (!this.rawManifest) return;
    const filtered = filterManifestBySchedule(this.rawManifest, this.clock);
    this.eligibleManifest = filtered;

    if (filtered.playlist.items.length === 0) {
      this.sequencer = null;
      this.stopMediaTimers();
      this.media.clear();
      this.setState({ status: 'WAITING_FOR_CONTENT', reason: 'ALL_ITEMS_OUTSIDE_SCHEDULE' });
      this.armScheduleRefresh();
      return;
    }

    if (!this.sequencer || replaceSequencer) {
      if (this.sequencer) {
        this.sequencer.replaceManifest(filtered);
      } else {
        this.sequencer = createPlaylistSequencer(filtered);
        this.telemetry.enqueue('PLAYLIST_ACTIVATED', { playlistId: filtered.playlist.id });
      }
    } else {
      this.sequencer.replaceManifest(filtered);
    }

    const current = this.sequencer.current();
    if (
      current &&
      this.state.status === 'PLAYING' &&
      !isItemActiveAt(current, this.clock.now())
    ) {
      this.skip('schedule_invalid');
    }

    this.armScheduleRefresh();
  }

  private armScheduleRefresh(): void {
    this.clearScheduleTimer();
    if (!this.rawManifest) return;
    const now = this.clock.now().getTime();
    let nextBoundary = now + this.scheduleRefreshMaxMs;

    for (const item of this.rawManifest.playlist.items) {
      for (const raw of [item.validFrom, item.validUntil]) {
        if (!raw) continue;
        const t = Date.parse(raw);
        if (!Number.isFinite(t)) continue;
        // validUntil inclusive — refresh shortly after boundary
        const candidate = raw === item.validUntil ? t + 1 : t;
        if (candidate > now && candidate < nextBoundary) nextBoundary = candidate;
      }
    }

    const delay = Math.max(250, Math.min(this.scheduleRefreshMaxMs, nextBoundary - now));
    this.scheduleTimer = this.setTimeoutFn(() => {
      this.scheduleTimer = null;
      this.refreshSchedule(false);
      this.emit();
    }, delay);
  }

  private armWatchdog(kind: WatchdogKind, generation: number, timeoutMs: number): void {
    this.clearWatchdogKind(kind);
    const dog = new ItemWatchdog({
      kind,
      generation,
      timeoutMs,
      setTimeoutFn: this.setTimeoutFn,
      clearTimeoutFn: this.clearTimeoutFn,
      onFire: (firedKind, gen) => this.onWatchdog(firedKind, gen),
    });
    this.activeWatchdog = dog;
    dog.start();
  }

  private onWatchdog(kind: WatchdogKind, generation: number): void {
    if (generation !== this.generation) {
      this.staleEventCount += 1;
      return;
    }
    const item = this.sequencer?.current();
    if (!item) return;

    if (kind === 'STALL_TIMEOUT') {
      this.telemetry.enqueue('MEDIA_STALL_RECOVERY', { itemId: item.id });
      void this.media.recoverVideoOnce().then((ok) => {
        if (generation !== this.generation) return;
        if (ok) {
          this.clearWatchdogKind('STALL_TIMEOUT');
          return;
        }
        this.failedIds.add(item.id);
        this.lastMediaError = 'DISPLAY_MEDIA_STALL_TIMEOUT';
        this.skip('stall_timeout');
      });
      return;
    }

    const code =
      kind === 'LOAD_TIMEOUT'
        ? 'DISPLAY_MEDIA_LOAD_TIMEOUT'
        : kind === 'START_TIMEOUT'
          ? 'DISPLAY_MEDIA_START_TIMEOUT'
          : 'DISPLAY_MEDIA_STALL_TIMEOUT';
    this.lastMediaError = code;
    this.telemetry.enqueue('MEDIA_LOAD_TIMEOUT', {
      itemId: item.id,
      metadata: { kind },
    });
    this.failedIds.add(item.id);
    this.skip(
      kind === 'LOAD_TIMEOUT'
        ? 'load_timeout'
        : kind === 'START_TIMEOUT'
          ? 'start_timeout'
          : 'stall_timeout',
    );
  }

  private clearWatchdogKind(kind: WatchdogKind): void {
    if (this.activeWatchdog?.kind === kind) {
      this.activeWatchdog.clear();
      this.activeWatchdog = null;
    }
  }

  private stopMediaTimers(): void {
    this.clearImageTimer();
    if (this.videoMaxTimer) this.clearTimeoutFn(this.videoMaxTimer);
    this.videoMaxTimer = null;
    this.activeWatchdog?.clear();
    this.activeWatchdog = null;
  }

  private clearImageTimer(): void {
    if (this.imageTimer) this.clearTimeoutFn(this.imageTimer);
    this.imageTimer = null;
    this.imageDeadline = null;
  }

  private clearScheduleTimer(): void {
    if (this.scheduleTimer) this.clearTimeoutFn(this.scheduleTimer);
    this.scheduleTimer = null;
  }

  private isCurrent(generation: number, itemId: string): boolean {
    if (this.destroyed || generation !== this.generation) return false;
    const current = this.sequencer?.current();
    return Boolean(current && current.id === itemId);
  }

  private updateHeartbeat(state: string): void {
    const hb = this.heartbeat;
    if (!hb) return;
    const item = this.sequencer?.current();
    const seq = this.sequencer?.getState();
    hb.updatePlaybackContext({
      playlistId: seq?.playlistId,
      itemId: item?.id,
      currentIndex: seq?.index,
      isPlaying: state === 'PLAYING',
      state,
    });
  }

  private setState(next: PlaybackState): void {
    this.state = next;
    this.emit();
  }

  private emit(): void {
    this.deps.onStateChange?.(this.state, this.getDiagnostics());
  }
}
