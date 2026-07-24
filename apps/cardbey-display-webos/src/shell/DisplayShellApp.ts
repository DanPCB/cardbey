import {
  DisplayError,
  PairingController,
  SystemClock,
  contentCodeUserMessage,
  createDeviceApiClient,
  createFetchTransport,
  createInitialRuntimeState,
  displayRuntimeReducer,
  loadValidatedDeviceSession,
  platformDisplayLabel,
  resolveDevicePresentationName,
  secondsRemainingUntil,
  type Clock,
  type DeviceApiClient,
  type DeviceIdentity,
  type DeviceSession,
  type DisplayRuntimeEvent,
  type DisplayRuntimeState,
  type DisplayStorage,
  type HeartbeatControllerSnapshot,
  type ManifestContentCode,
  type PairingSnapshot,
  type SyncControllerSnapshot,
  type SyncOutcome,
} from '@cardbey/display-runtime';
import type { DisplayFeatureFlags } from '../boot/featureFlags.js';
import { ensureDeviceIdentity } from '../boot/deviceBootstrap.js';
import type { LoadedShellConfig } from '../config/loadConfig.js';
import { buildDashboardClaimUrl } from '../pairing/claimUrl.js';
import { userFacingPairingError } from '../pairing/pairingErrors.js';
import {
  pairingSnapshotToViewState,
  type PairingViewState,
} from '../pairing/pairingViewState.js';
import { renderClaimQr } from '../pairing/qrCode.js';
import { createLocalStorageAdapter } from '../platform/localStorageAdapter.js';
import { bindRemoteKeys, type RemoteKeyAction } from '../platform/remoteKeys.js';
import {
  bindWebOsLifecycle,
  probeWebOsDeviceInfo,
} from '../platform/webosLifecycle.js';
import {
  PlaybackCoordinator,
  type PlaybackDiagnostics,
  type PlaybackState,
} from '../playback/index.js';
import { SessionActivation } from '../runtime/SessionActivation.js';
import { createFixtureTransport } from '../runtime/fixtureTransport.js';
import { ensureShellDom, renderShell, type ShellViewModel } from './renderStatus.js';

export type DisplayShellAppOptions = {
  root: HTMLElement;
  config: LoadedShellConfig;
  storage?: DisplayStorage;
  /** Injected for tests */
  api?: DeviceApiClient;
  clock?: Clock;
  autoStartPairing?: boolean;
};

/**
 * Thin webOS shell host — wires PairingController + SessionActivation.
 * Does not reimplement pairing orchestration.
 */
export class DisplayShellApp {
  private readonly root: HTMLElement;
  private readonly config: LoadedShellConfig;
  private readonly storage: DisplayStorage;
  private readonly clock: Clock;
  private readonly autoStartPairing: boolean;
  private state: DisplayRuntimeState = createInitialRuntimeState();
  private identity: DeviceIdentity | null = null;
  private api: DeviceApiClient | null = null;
  private injectedApi: DeviceApiClient | undefined;
  private activation: SessionActivation | null = null;
  private pairing: PairingController | null = null;
  private pairingView: PairingViewState = { status: 'IDLE' };
  private pairingSnapshot: PairingSnapshot | null = null;
  private qrDataUrl?: string;
  private qrError?: string;
  private claimUrl?: string;
  private modelName?: string;
  private foreground = true;
  private diagnosticsOpen = false;
  private resetConfirmOpen = false;
  private bootMessage?: string;
  private secondsRemaining?: number;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private pairingStartPromise: Promise<void> | null = null;
  private started = false;
  private stopped = false;
  private unbindKeys: (() => void) | null = null;
  private unbindLifecycle: (() => void) | null = null;
  private lastHeartbeat?: HeartbeatControllerSnapshot;
  private lastSync?: SyncControllerSnapshot;
  private lastSyncOutcome?: SyncOutcome['kind'];
  private lastContentCode?: string;
  private playback: PlaybackCoordinator | null = null;
  private playbackState: PlaybackState = { status: 'IDLE' };
  private playbackDiagnostics?: PlaybackDiagnostics;
  private allowManualSkip = false;

  constructor(options: DisplayShellAppOptions) {
    this.root = options.root;
    this.config = options.config;
    this.storage = options.storage ?? createLocalStorageAdapter();
    this.clock = options.clock ?? new SystemClock();
    this.injectedApi = options.api;
    this.autoStartPairing = options.autoStartPairing ?? true;
  }

  getState(): DisplayRuntimeState {
    return this.state;
  }

  getPairingView(): PairingViewState {
    return this.pairingView;
  }

  getApiClient(): DeviceApiClient | null {
    return this.api;
  }

  getFeatureFlags(): DisplayFeatureFlags {
    return this.config.featureFlags;
  }

  getActivation(): SessionActivation | null {
    return this.activation;
  }

  getPlayback(): PlaybackCoordinator | null {
    return this.playback;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.render();

    const device = await probeWebOsDeviceInfo();
    this.modelName = device.modelName;

    this.identity = await ensureDeviceIdentity({
      storage: this.storage,
      platform: this.config.runtime.platform,
      appVersion: this.config.runtime.appVersion,
      modelName: device.modelName,
      platformVersion: device.platformVersion,
    });

    const transport = this.config.featureFlags.useFixtureTransport
      ? createFixtureTransport('pending_then_claimed')
      : createFetchTransport();

    this.api =
      this.injectedApi ??
      createDeviceApiClient({
        config: this.config.runtime,
        transport,
        getDeviceSecret: () => this.state.session?.deviceSecret,
        getDeviceIdHeader: () => this.state.session?.deviceId || this.identity?.deviceId,
        getInstallationIdHeader: () => this.identity?.installationId,
      });

    this.activation = new SessionActivation({
      api: this.api,
      config: this.config.runtime,
      storage: this.storage,
      clock: this.clock,
      identity: this.identity,
      callbacks: {
        onHeartbeat: (snap) => {
          this.lastHeartbeat = snap;
          this.dispatch({
            type: 'HEARTBEAT_SUCCEEDED',
            at: snap.lastSuccessAt || this.clock.now().toISOString(),
          });
          this.render();
        },
        onSync: (snap) => {
          this.lastSync = snap;
          this.lastSyncOutcome = snap.lastOutcome;
          this.lastContentCode = snap.lastContentCode;
          if (snap.activeManifest && snap.activeManifest.playlist.items.length > 0) {
            this.dispatch({ type: 'MANIFEST_RECEIVED', manifest: snap.activeManifest });
            this.applyManifestToPlayback(snap.activeManifest);
            this.bootMessage = 'Playlist ready.';
          } else if (snap.lastOutcome === 'empty' || snap.lastOutcome === 'rejected') {
            this.dispatch({ type: 'MANIFEST_EMPTY' });
            this.applyManifestToPlayback(null);
            this.bootMessage = contentCodeUserMessage(
              (snap.lastContentCode as ManifestContentCode) || 'NOT_ASSIGNED',
            );
          } else if (snap.lastOutcome === 'network') {
            this.bootMessage = contentCodeUserMessage('MANIFEST_ERROR');
          }
          this.playback?.setNetworkOnline(!snap.offline && this.state.networkOnline);
          this.render();
        },
        onSessionUpdated: (session) => {
          this.state = { ...this.state, session };
          this.render();
        },
        onCanonicalDeviceRemap: (fromId, toId) => {
          console.log('[Cardbey webOS boot]', 'DEVICE_IDENTITY_REMAP', {
            fromHost: maskId(fromId),
            toHost: maskId(toId),
          });
          this.bootMessage = 'Device identity synchronized. Loading playlist…';
          this.render();
        },
      },
    });

    const session = await loadValidatedDeviceSession(this.storage);
    this.dispatch({ type: 'BOOT_COMPLETED', session });

    this.unbindLifecycle = bindWebOsLifecycle({
      onForeground: () => {
        this.foreground = true;
        this.refreshCountdown();
        void this.playback?.onLifecycleForeground();
        this.render();
      },
      onBackground: () => {
        this.foreground = false;
        this.playback?.onLifecycleBackground();
        this.render();
      },
      onRelaunch: () => {
        this.bootMessage = 'App relaunched';
        this.render();
      },
    });
    this.unbindKeys = bindRemoteKeys((action) => this.onRemoteKey(action));
    this.bindDomActions();
    window.addEventListener('online', this.onBrowserOnline);
    window.addEventListener('offline', this.onBrowserOffline);

    if (session?.pairingState === 'PAIRED') {
      this.bootMessage = 'Restoring paired session…';
      this.render();
      await this.activatePairedSession(session);
    } else if (this.config.featureFlags.enablePairing && this.autoStartPairing) {
      await this.startPairingFlow();
    } else {
      this.bootMessage = this.config.featureFlags.enablePairing
        ? 'Press OK to start pairing.'
        : 'Pairing is disabled for this profile. Set VITE_ENABLE_PAIRING=true to enable.';
      this.render();
    }
  }

  stop(): void {
    this.stopped = true;
    this.pairing?.cancel();
    this.pairing = null;
    this.pairingStartPromise = null;
    this.playback?.destroy();
    this.playback = null;
    this.activation?.stopControllers();
    this.clearCountdown();
    this.unbindKeys?.();
    this.unbindLifecycle?.();
    this.unbindKeys = null;
    this.unbindLifecycle = null;
    window.removeEventListener('online', this.onBrowserOnline);
    window.removeEventListener('offline', this.onBrowserOffline);
  }

  private readonly onBrowserOnline = (): void => {
    this.dispatch({ type: 'NETWORK_ONLINE' });
    this.playback?.setNetworkOnline(true);
    this.render();
  };

  private readonly onBrowserOffline = (): void => {
    this.dispatch({ type: 'NETWORK_OFFLINE' });
    this.playback?.setNetworkOnline(false);
    this.render();
  };

  private ensurePlayback(): PlaybackCoordinator | null {
    if (!this.config.featureFlags.enablePlayback) return null;
    if (this.playback) return this.playback;
    const { stage } = ensureShellDom(this.root);
    this.playback = new PlaybackCoordinator({
      stage,
      clock: this.clock,
      defaultImageDurationMs: this.config.runtime.defaultImageDurationMs,
      mediaTimeoutMs: this.config.runtime.mediaTimeoutMs,
      heartbeat: this.activation?.getHeartbeat() ?? null,
      onStateChange: (state, diagnostics) => {
        this.playbackState = state;
        this.playbackDiagnostics = diagnostics;
        this.render();
      },
      onRuntimeEvent: (event) => {
        this.dispatch(event);
      },
    });
    return this.playback;
  }

  private applyManifestToPlayback(
    manifest: import('@cardbey/display-runtime').DisplayManifest | null,
  ): void {
    const player = this.ensurePlayback();
    if (!player) return;
    // Refresh heartbeat handle after activation starts controllers
    if (this.activation?.getHeartbeat()) {
      // recreate coordinator heartbeat binding via setManifest path only —
      // update by constructing context through existing instance
    }
    player.setHeartbeat(this.activation?.getHeartbeat() ?? null);
    player.setManifest(manifest);
    if (manifest && manifest.playlist.items.length > 0) {
      void player.play();
    }
  }

  async activatePairedSession(session: DeviceSession): Promise<void> {
    if (!this.activation) return;
    this.pairingView = { status: 'COMPLETED', deviceId: session.deviceId };
    this.dispatch({ type: 'PAIRING_APPROVED', session });
    this.bootMessage = 'Connected. Checking playlist assignment…';
    this.render();
    try {
      await this.activation.activatePairedSession(session);
      const manifest = this.activation.getActiveManifest();
      const syncSnap = this.activation.getSync()?.getSnapshot();
      this.lastContentCode = syncSnap?.lastContentCode;
      if (manifest && manifest.playlist.items.length > 0) {
        this.dispatch({ type: 'MANIFEST_RECEIVED', manifest });
        this.applyManifestToPlayback(manifest);
        this.bootMessage = this.config.featureFlags.enablePlayback
          ? 'Playlist ready.'
          : 'Playlist ready. Playback is feature-flagged off (set VITE_ENABLE_PLAYBACK=true).';
      } else {
        this.dispatch({ type: 'MANIFEST_EMPTY' });
        this.applyManifestToPlayback(null);
        this.bootMessage = contentCodeUserMessage(
          (syncSnap?.lastContentCode as ManifestContentCode) || 'NOT_ASSIGNED',
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Activation failed';
      this.bootMessage = message;
      // Keep paired — do not unpair on heartbeat/sync failure
      this.dispatch({ type: 'MANIFEST_EMPTY' });
    }
    this.render();
  }

  async startPairingFlow(): Promise<void> {
    if (!this.config.featureFlags.enablePairing) return;
    if (!this.api || !this.identity) return;
    if (this.pairingStartPromise) return this.pairingStartPromise;

    this.pairingStartPromise = this.runPairingFlow();
    try {
      await this.pairingStartPromise;
    } finally {
      this.pairingStartPromise = null;
    }
  }

  async retryPairing(): Promise<void> {
    this.pairing?.cancel();
    this.pairing = null;
    this.qrDataUrl = undefined;
    this.qrError = undefined;
    this.claimUrl = undefined;
    this.pairingView = { status: 'IDLE' };
    this.clearCountdown();
    await this.startPairingFlow();
  }

  async localReset(): Promise<void> {
    this.pairing?.cancel();
    this.pairing = null;
    this.playback?.destroy();
    this.playback = null;
    this.playbackState = { status: 'IDLE' };
    this.playbackDiagnostics = undefined;
    await this.activation?.localReset();
    this.state = createInitialRuntimeState();
    this.dispatch({ type: 'BOOT_COMPLETED', session: null });
    this.pairingView = { status: 'IDLE' };
    this.resetConfirmOpen = false;
    this.bootMessage = 'Local reset complete. Device record may remain in the Cardbey dashboard.';
    this.render();
    if (this.config.featureFlags.enablePairing) {
      await this.startPairingFlow();
    }
  }

  private async runPairingFlow(): Promise<void> {
    if (!this.api || !this.identity || this.stopped) return;

    this.pairing?.cancel();
    this.pairing = new PairingController({
      api: this.api,
      config: this.config.runtime,
      identity: this.identity,
      storage: this.storage,
      clock: this.clock,
      onChange: (snap) => {
        void this.onPairingSnapshot(snap);
      },
    });

    this.dispatch({ type: 'PAIRING_REQUESTED' });
    this.pairingView = { status: 'REQUESTING' };
    this.render();

    try {
      const session = await this.pairing.start();
      if (!session || this.stopped) return;
      await this.activatePairedSession(session);
    } catch (err) {
      if (this.stopped) return;
      if (DisplayError.isDisplayError(err) && err.code === 'DISPLAY_PAIRING_EXPIRED') {
        this.pairingView = { status: 'EXPIRED', code: this.pairingSnapshot?.code };
      } else if (DisplayError.isDisplayError(err)) {
        this.pairingView = {
          status: 'FAILED',
          errorCode: err.code,
          retryable: err.retryable,
          message: userFacingPairingError(err.code, err.message),
        };
        this.dispatch({
          type: 'PAIRING_FAILED',
          code: err.code,
          message: userFacingPairingError(err.code, err.message),
        });
      } else {
        this.pairingView = {
          status: 'FAILED',
          errorCode: 'DISPLAY_PAIRING_FAILED',
          retryable: true,
          message: userFacingPairingError('DISPLAY_PAIRING_FAILED'),
        };
      }
      this.render();
    }
  }

  private async onPairingSnapshot(snap: PairingSnapshot): Promise<void> {
    this.pairingSnapshot = snap;

    if (snap.status === 'polling' && snap.sessionId && snap.code) {
      this.claimUrl = buildDashboardClaimUrl({
        dashboardBaseUrl: this.config.dashboardBaseUrl,
        code: snap.code,
        sessionId: snap.sessionId,
      });
      this.dispatch({
        type: 'PAIRING_CODE_RECEIVED',
        code: snap.code,
        expiresAt: snap.expiresAt,
        sessionId: snap.sessionId,
      });
      if (this.claimUrl && !this.qrDataUrl) {
        const qr = await renderClaimQr(this.claimUrl);
        if (qr.ok) {
          this.qrDataUrl = qr.dataUrl;
          this.qrError = undefined;
        } else {
          this.qrError = qr.error;
        }
      }
      this.startCountdown(snap.expiresAt);
    }

    this.pairingView = pairingSnapshotToViewState(snap, this.claimUrl);
    this.render();
  }

  private startCountdown(expiresAt?: string): void {
    this.clearCountdown();
    this.refreshCountdown(expiresAt);
    this.countdownTimer = setInterval(() => this.refreshCountdown(expiresAt), 1000);
  }

  private refreshCountdown(expiresAt?: string): void {
    const exp = expiresAt || this.pairingSnapshot?.expiresAt;
    this.secondsRemaining = secondsRemainingUntil(exp, this.clock);
    if (this.pairingView.status === 'WAITING') this.render();
  }

  private clearCountdown(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
    this.secondsRemaining = undefined;
  }

  private onRemoteKey(action: RemoteKeyAction): void {
    const flags = this.config.featureFlags;
    if (action === 'info') {
      if (flags.enableDiagnosticsOverlay) {
        this.diagnosticsOpen = !this.diagnosticsOpen;
        this.resetConfirmOpen = false;
        this.allowManualSkip = this.diagnosticsOpen;
        this.render();
      }
      return;
    }
    if (action === 'back') {
      if (this.resetConfirmOpen) {
        this.resetConfirmOpen = false;
        this.render();
        return;
      }
      if (this.diagnosticsOpen) {
        this.diagnosticsOpen = false;
        this.allowManualSkip = false;
        this.render();
        return;
      }
      // Active pairing: do not exit — toggle diagnostics instead
      if (
        this.pairingView.status === 'WAITING' ||
        this.pairingView.status === 'REQUESTING' ||
        this.pairingView.status === 'COMPLETING'
      ) {
        if (flags.enableDiagnosticsOverlay) {
          this.diagnosticsOpen = true;
          this.render();
        }
        return;
      }
      if (flags.enableDiagnosticsOverlay) {
        this.diagnosticsOpen = !this.diagnosticsOpen;
        this.render();
      }
      return;
    }
    if (action === 'play') {
      void this.playback?.resume();
      return;
    }
    if (action === 'pause') {
      this.playback?.pause();
      return;
    }
    if (action === 'stop') {
      this.playback?.stop();
      return;
    }
    if (action === 'right' && this.allowManualSkip) {
      this.playback?.next();
      return;
    }
    if (action === 'left' && this.allowManualSkip) {
      this.playback?.previous();
      return;
    }
    if (action === 'ok') {
      if (this.resetConfirmOpen) {
        void this.localReset();
        return;
      }
      if (
        this.pairingView.status === 'EXPIRED' ||
        this.pairingView.status === 'FAILED' ||
        this.pairingView.status === 'IDLE' ||
        this.pairingView.status === 'CANCELLED'
      ) {
        void this.retryPairing();
      }
    }
  }

  private bindDomActions(): void {
    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const actionEl =
        target && typeof target.closest === 'function'
          ? target.closest('[data-action]')
          : null;
      const action = actionEl ? actionEl.getAttribute('data-action') : null;
      if (!action) return;
      if (action === 'retry') void this.retryPairing();
      if (action === 'toggle-diagnostics') {
        this.diagnosticsOpen = !this.diagnosticsOpen;
        this.render();
      }
      if (action === 'request-reset') {
        this.resetConfirmOpen = true;
        this.diagnosticsOpen = true;
        this.render();
      }
      if (action === 'confirm-reset') void this.localReset();
      if (action === 'cancel-reset') {
        this.resetConfirmOpen = false;
        this.render();
      }
    });
  }

  private dispatch(event: DisplayRuntimeEvent): void {
    this.state = displayRuntimeReducer(this.state, event);
  }

  private render(): void {
    // Keep chrome visible while preparing so the TV never sits on a black stage.
    const playing = this.playbackState.status === 'PLAYING';
    const platform = this.config.runtime.platform || this.identity?.platform || 'webos_tv';
    const presentationName = resolveDevicePresentationName({
      displayName: this.state.session?.displayName,
      platform,
    });
    const vm: ShellViewModel = {
      state: this.state,
      featureFlags: this.config.featureFlags,
      profile: this.config.profile,
      apiBaseUrl: this.config.runtime.apiBaseUrl,
      dashboardBaseUrl: this.config.dashboardBaseUrl,
      appVersion: this.config.runtime.appVersion,
      modelName: this.modelName,
      platformLabel: platformDisplayLabel(platform),
      presentationName,
      contentCode: this.lastContentCode,
      canonicalDeviceId: this.state.session?.deviceId,
      foreground: this.foreground,
      diagnosticsOpen: this.diagnosticsOpen,
      resetConfirmOpen: this.resetConfirmOpen,
      bootMessage: this.bootMessage,
      pairing: this.pairingView,
      pairingSnapshot: this.pairingSnapshot,
      claimUrl: this.claimUrl,
      qrDataUrl: this.qrDataUrl,
      qrError: this.qrError,
      secondsRemaining: this.secondsRemaining,
      lastHeartbeatAt: this.lastHeartbeat?.lastSuccessAt || this.state.lastHeartbeatAt,
      lastHeartbeatError: this.lastHeartbeat?.lastFailureMessage,
      lastSyncAt: this.lastSync?.lastSyncAt || this.state.lastSyncAt,
      lastSyncOutcome: this.lastSyncOutcome,
      fixtureMode: this.config.featureFlags.useFixtureTransport,
      playback: this.playbackState,
      playbackDiagnostics: this.playbackDiagnostics,
      hideChromeForPlayback: playing && !this.diagnosticsOpen,
    };
    renderShell(this.root, vm);
  }
}

function maskId(id: string): string {
  if (!id) return '—';
  if (id.length <= 12) return id;
  return id.slice(0, 8) + '…' + id.slice(-4);
}
