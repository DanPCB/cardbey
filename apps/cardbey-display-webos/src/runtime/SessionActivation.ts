import {
  HeartbeatController,
  SyncController,
  STORAGE_KEYS,
  persistDeviceSession,
  type DeviceApiClient,
  type DeviceIdentity,
  type DeviceSession,
  type DisplayManifest,
  type DisplayRuntimeConfig,
  type DisplayStorage,
  type HeartbeatControllerSnapshot,
  type SyncControllerSnapshot,
  type SyncOutcome,
  type Clock,
} from '@cardbey/display-runtime';

export type ActivationCallbacks = {
  onHeartbeat?: (snapshot: HeartbeatControllerSnapshot) => void;
  onSync?: (snapshot: SyncControllerSnapshot, outcome?: SyncOutcome) => void;
  onSessionUpdated?: (session: DeviceSession) => void;
  onCanonicalDeviceRemap?: (fromDeviceId: string, toDeviceId: string) => void;
};

/**
 * Single activation entry — starts heartbeat + sync exactly once per deviceId.
 */
export class SessionActivation {
  private heartbeat: HeartbeatController | null = null;
  private sync: SyncController | null = null;
  private activatedDeviceId: string | null = null;
  private activationToken = 0;
  private sessionRef: DeviceSession | null = null;

  constructor(
    private readonly deps: {
      api: DeviceApiClient;
      config: DisplayRuntimeConfig;
      storage: DisplayStorage;
      clock: Clock;
      identity: DeviceIdentity;
      callbacks?: ActivationCallbacks;
    },
  ) {}

  getHeartbeat(): HeartbeatController | null {
    return this.heartbeat;
  }

  getSync(): SyncController | null {
    return this.sync;
  }

  isActivatedFor(deviceId: string): boolean {
    return this.activatedDeviceId === deviceId && Boolean(this.heartbeat?.getSnapshot().running);
  }

  async activatePairedSession(session: DeviceSession): Promise<void> {
    if (session.pairingState !== 'PAIRED' || !session.deviceId.trim()) {
      throw new Error('Cannot activate unpaired session');
    }

    if (this.isActivatedFor(session.deviceId)) {
      return;
    }

    const token = ++this.activationToken;
    this.sessionRef = session;
    await persistDeviceSession(this.deps.storage, session);
    this.deps.callbacks?.onSessionUpdated?.(session);

    this.stopControllers();

    if (token !== this.activationToken) return;

    const identity: DeviceIdentity = {
      ...this.deps.identity,
      deviceId: session.deviceId,
    };
    // Keep shared identity object in sync for API headers.
    this.deps.identity.deviceId = session.deviceId;

    this.heartbeat = new HeartbeatController({
      api: this.deps.api,
      config: this.deps.config,
      identity,
      clock: this.deps.clock,
      onHeartbeat: (snap) => {
        this.enrichSessionFromHeartbeat(session, snap);
        this.deps.callbacks?.onHeartbeat?.(snap);
      },
    });

    this.sync = new SyncController({
      api: this.deps.api,
      config: this.deps.config,
      storage: this.deps.storage,
      clock: this.deps.clock,
      deviceId: session.deviceId,
      onChange: (snap) => this.deps.callbacks?.onSync?.(snap),
    });

    await this.sync.restoreCachedManifest();
    this.heartbeat.start();
    this.sync.start();
    this.activatedDeviceId = session.deviceId;
  }

  stopControllers(): void {
    this.heartbeat?.stop();
    this.sync?.stop();
    this.heartbeat = null;
    this.sync = null;
    this.activatedDeviceId = null;
  }

  async localReset(): Promise<void> {
    this.activationToken += 1;
    this.stopControllers();
    this.sessionRef = null;
    await this.deps.storage.remove(STORAGE_KEYS.deviceSession);
    await this.deps.storage.remove(STORAGE_KEYS.lastValidManifest);
  }

  getActiveManifest(): DisplayManifest | null {
    return this.sync?.getSnapshot().activeManifest ?? null;
  }

  private enrichSessionFromHeartbeat(
    session: DeviceSession,
    snap: HeartbeatControllerSnapshot,
  ): void {
    const res = snap.lastResponse;
    if (!res) return;
    let changed = false;

    const canonicalId = typeof res.deviceId === 'string' ? res.deviceId.trim() : '';
    if (canonicalId && canonicalId !== session.deviceId) {
      const previous = session.deviceId;
      session.deviceId = canonicalId;
      this.deps.identity.deviceId = canonicalId;
      this.activatedDeviceId = canonicalId;
      this.heartbeat?.setDeviceId(canonicalId);
      this.sync?.setDeviceId(canonicalId);
      this.deps.callbacks?.onCanonicalDeviceRemap?.(previous, canonicalId);
      changed = true;
    }

    if (res.storeId && res.storeId !== session.storeId) {
      session.storeId = res.storeId;
      changed = true;
    }
    if (res.tenantId && res.tenantId !== session.tenantId) {
      session.tenantId = res.tenantId;
      changed = true;
    }
    if (res.displayName && res.displayName !== session.displayName) {
      session.displayName = res.displayName;
      changed = true;
    }
    if (changed) {
      void persistDeviceSession(this.deps.storage, session);
      this.deps.callbacks?.onSessionUpdated?.(session);
    }
  }
}
