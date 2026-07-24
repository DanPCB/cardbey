import type { DeviceApiClient } from '../api/deviceApiClient.js';
import type { DisplayRuntimeConfig } from '../config/runtimeConfig.js';
import { DisplayError, displayError } from '../errors/displayError.js';
import type { DeviceIdentity } from '../identity/deviceIdentity.js';
import { createPairedSession, type DeviceSession } from '../identity/deviceSession.js';
import { persistDeviceSession } from '../identity/sessionPersistence.js';
import {
  browserClearTimeout,
  browserSetTimeout,
} from '../platform/browserHost.js';
import type { Clock } from '../platform/clock.js';
import type { DisplayStorage } from '../storage/displayStorage.js';
import { resolvePairingExpiresAt } from './expiresAt.js';
import {
  normalizePairStatus,
  type PairingSnapshot,
} from './pairingTypes.js';

export type PairingControllerDeps = {
  api: DeviceApiClient;
  config: DisplayRuntimeConfig;
  identity: DeviceIdentity;
  storage: DisplayStorage;
  clock: Clock;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onChange?: (snapshot: PairingSnapshot) => void;
};

async function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = browserSetTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      browserClearTimeout(timer);
      reject(displayError('DISPLAY_REQUEST_TIMEOUT', 'Pairing cancelled', { retryable: false }));
    };
    if (signal?.aborted) {
      browserClearTimeout(timer);
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Owns Device V2 TV pairing orchestration.
 * Shell starts/cancels and renders; does not reimplement the poll loop.
 */
export class PairingController {
  private snapshot: PairingSnapshot = { status: 'idle' };
  private loopAbort: AbortController | null = null;
  private running = false;
  private completionStarted = false;

  constructor(private readonly deps: PairingControllerDeps) {}

  getSnapshot(): PairingSnapshot {
    return { ...this.snapshot };
  }

  private set(partial: Partial<PairingSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.deps.onChange?.(this.getSnapshot());
  }

  async start(): Promise<DeviceSession | null> {
    if (this.running) {
      throw displayError('DISPLAY_RUNTIME_ERROR', 'Pairing already in progress', {
        retryable: false,
      });
    }
    this.running = true;
    this.completionStarted = false;
    this.loopAbort = new AbortController();
    const signal = this.loopAbort.signal;
    const sleep = this.deps.sleep ?? defaultSleep;

    try {
      this.set({
        status: 'requesting',
        errorCode: undefined,
        errorMessage: undefined,
        lastRequestAt: this.deps.clock.now().toISOString(),
        completionInFlight: false,
      });
      const { identity } = this.deps;
      const startRes = await this.deps.api.requestPairing(
        {
          deviceId: identity.deviceId,
          platform: identity.platform,
          engineVersion: identity.engineVersion,
          appVersion: identity.appVersion,
          hardwareModel: identity.modelName,
          installationId: identity.installationId,
        },
        signal,
      );

      if (startRes.alreadyPaired) {
        const session = createPairedSession({
          deviceId: startRes.deviceId || identity.deviceId,
          storeId: startRes.storeId ?? undefined,
          tenantId: startRes.tenantId ?? undefined,
          pairedAt: this.deps.clock.now().toISOString(),
        });
        await persistDeviceSession(this.deps.storage, session);
        this.set({
          status: 'approved',
          sessionId: session.deviceId,
          deviceId: session.deviceId,
        });
        return session;
      }

      const sessionId = (startRes.sessionId || startRes.pairingSessionId || identity.deviceId).trim();
      // Preserve backend code casing; only trim whitespace.
      const code = (startRes.code || startRes.pairingCode || '').trim();
      if (!sessionId || !code) {
        throw displayError('DISPLAY_RESPONSE_INVALID', 'Pairing response missing sessionId/code', {
          retryable: false,
        });
      }

      const expiresAt = resolvePairingExpiresAt(startRes, this.deps.clock);

      this.set({
        status: 'polling',
        sessionId,
        code,
        expiresAt,
        deviceId: startRes.deviceId || identity.deviceId,
      });

      while (!signal.aborted) {
        if (expiresAt) {
          const remainingMs = Date.parse(expiresAt) - this.deps.clock.now().getTime();
          if (Number.isFinite(remainingMs) && remainingMs <= 0) {
            this.set({ status: 'expired', errorMessage: 'Pairing code expired', errorCode: 'DISPLAY_PAIRING_EXPIRED' });
            throw displayError('DISPLAY_PAIRING_EXPIRED', 'Pairing code expired', {
              retryable: false,
            });
          }
        }

        const statusRes = await this.deps.api.pollPairingStatus(sessionId, signal);
        const status = normalizePairStatus(statusRes.status);
        this.set({
          lastPollAt: this.deps.clock.now().toISOString(),
          lastPollStatus: status,
          expiresAt: resolvePairingExpiresAt(statusRes, this.deps.clock) ?? this.snapshot.expiresAt,
          code: statusRes.pairingCode?.trim() || this.snapshot.code,
        });

        if (status === 'claimed') {
          return await this.completeClaimed(sessionId, code, statusRes.deviceId, statusRes.token || statusRes.deviceJwt, signal);
        }

        if (status === 'expired') {
          this.set({
            status: 'expired',
            errorMessage: 'Pairing code expired',
            errorCode: 'DISPLAY_PAIRING_EXPIRED',
          });
          throw displayError('DISPLAY_PAIRING_EXPIRED', 'Pairing code expired', {
            retryable: false,
          });
        }

        if (status === 'unknown') {
          throw displayError(
            'DISPLAY_RESPONSE_INVALID',
            `Unknown pair-status: ${statusRes.status || '(empty)'}`,
            { retryable: false },
          );
        }

        await sleep(this.deps.config.pairingPollIntervalMs, signal);
      }

      this.set({ status: 'cancelled' });
      return null;
    } catch (err) {
      if (this.snapshot.status === 'cancelled') return null;
      if (DisplayError.isDisplayError(err) && err.code === 'DISPLAY_PAIRING_EXPIRED') throw err;
      if (DisplayError.isDisplayError(err) && err.message === 'Pairing cancelled') {
        this.set({ status: 'cancelled' });
        return null;
      }
      const message = err instanceof Error ? err.message : 'Pairing failed';
      const code = DisplayError.isDisplayError(err) ? err.code : 'DISPLAY_PAIRING_FAILED';
      this.set({ status: 'failed', errorMessage: message, errorCode: code });
      throw DisplayError.isDisplayError(err)
        ? err
        : displayError('DISPLAY_PAIRING_FAILED', message, { retryable: true, cause: err });
    } finally {
      this.running = false;
      this.loopAbort = null;
      this.set({ completionInFlight: false });
    }
  }

  private async completeClaimed(
    sessionId: string,
    code: string,
    claimedDeviceId: string | undefined,
    token: string | null | undefined,
    signal: AbortSignal,
  ): Promise<DeviceSession> {
    if (this.completionStarted) {
      throw displayError('DISPLAY_RUNTIME_ERROR', 'Pair completion already in progress', {
        retryable: false,
      });
    }
    this.completionStarted = true;
    const deviceId = (claimedDeviceId || sessionId).trim();
    this.set({
      status: 'completing',
      deviceId,
      completionInFlight: true,
    });

    const completeRes = await this.deps.api.completePairing(
      {
        sessionId,
        screenId: deviceId,
        deviceId,
        token: token ?? null,
        code,
      },
      signal,
    );

    if (!completeRes?.ok) {
      throw displayError('DISPLAY_PAIRING_FAILED', completeRes?.message || 'pair-complete failed', {
        retryable: true,
      });
    }

    const resolvedDeviceId = (completeRes.deviceId || completeRes.screenId || deviceId).trim();
    if (!resolvedDeviceId) {
      throw displayError('DISPLAY_RESPONSE_INVALID', 'pair-complete missing deviceId', {
        retryable: false,
      });
    }

    const secret =
      completeRes.token && completeRes.token !== 'null' ? completeRes.token : token || undefined;

    const session = createPairedSession({
      deviceId: resolvedDeviceId,
      deviceSecret: secret && secret !== 'null' ? secret : undefined,
      pairedAt: this.deps.clock.now().toISOString(),
    });
    await persistDeviceSession(this.deps.storage, session);
    this.set({
      status: 'approved',
      deviceId: resolvedDeviceId,
      sessionId,
      completionInFlight: false,
      code: undefined,
    });
    return session;
  }

  cancel(): void {
    this.set({ status: 'cancelled', completionInFlight: false });
    this.loopAbort?.abort();
    this.running = false;
  }
}
