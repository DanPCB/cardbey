import { apiUrl } from '../config/configValidation.js';
import type { DisplayRuntimeConfig } from '../config/runtimeConfig.js';
import { DisplayError, displayError } from '../errors/displayError.js';
import type {
  HeartbeatRequestBody,
  HeartbeatResponse,
  PairCompleteBody,
  PairCompleteResponse,
  PairStatusResponse,
  RawPlaylistFullResponse,
  RequestPairingBody,
  RequestPairingResponse,
} from './deviceApiContracts.js';
import { isAbortError, mapHttpFailure } from './deviceApiErrors.js';
import type { HttpTransport } from './request.js';

export type DeviceApiClientOptions = {
  config: DisplayRuntimeConfig;
  transport: HttpTransport;
  /** Optional Authorization bearer (rarely present on Device V2 today). */
  getDeviceSecret?: () => string | undefined;
  getDeviceIdHeader?: () => string | undefined;
  getInstallationIdHeader?: () => string | undefined;
};

export interface DeviceApiClient {
  requestPairing(body: RequestPairingBody, signal?: AbortSignal): Promise<RequestPairingResponse>;
  pollPairingStatus(sessionId: string, signal?: AbortSignal): Promise<PairStatusResponse>;
  completePairing(body: PairCompleteBody, signal?: AbortSignal): Promise<PairCompleteResponse>;
  sendHeartbeat(body: HeartbeatRequestBody, signal?: AbortSignal): Promise<HeartbeatResponse>;
  fetchFullPlaylist(deviceId: string, signal?: AbortSignal): Promise<RawPlaylistFullResponse>;
}

function authHeaders(opts: DeviceApiClientOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };
  const secret = opts.getDeviceSecret?.();
  const deviceId = opts.getDeviceIdHeader?.();
  const installationId = opts.getInstallationIdHeader?.();
  // Never log secret. Attach only when present (Android parity).
  if (secret) headers.Authorization = `Bearer ${secret}`;
  if (deviceId) headers['X-Device-Id'] = deviceId;
  if (installationId) headers['X-Installation-Id'] = installationId;
  return headers;
}

async function parseOrThrow<T extends { ok?: boolean }>(
  transport: HttpTransport,
  opts: DeviceApiClientOptions,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const url = apiUrl(opts.config.apiBaseUrl, path);
  try {
    const res = await transport.request<T>({
      method,
      url,
      body,
      headers: authHeaders(opts),
      timeoutMs: opts.config.requestTimeoutMs,
      signal,
    });

    if (res.status < 200 || res.status >= 300) {
      throw mapHttpFailure(res.status, res.data, { path, method });
    }

    if (res.data && typeof res.data === 'object' && 'ok' in res.data && res.data.ok === false) {
      throw mapHttpFailure(res.status || 400, res.data, { path, method });
    }

    return res.data;
  } catch (err) {
    if (DisplayError.isDisplayError(err)) throw err;
    if (isAbortError(err)) {
      throw displayError('DISPLAY_REQUEST_TIMEOUT', 'Request aborted or timed out', {
        retryable: true,
        cause: err,
        context: { path, method },
      });
    }
    if (err instanceof Error && err.message.includes('parse JSON')) {
      throw displayError('DISPLAY_RESPONSE_INVALID', 'Invalid JSON from Device V2', {
        retryable: false,
        cause: err,
        context: { path, method },
      });
    }
    throw displayError('DISPLAY_NETWORK_ERROR', 'Network request failed', {
      retryable: true,
      cause: err,
      context: { path, method },
    });
  }
}

export function createDeviceApiClient(opts: DeviceApiClientOptions): DeviceApiClient {
  return {
    requestPairing(body, signal) {
      return parseOrThrow<RequestPairingResponse>(
        opts.transport,
        opts,
        'POST',
        '/device/request-pairing',
        body,
        signal,
      );
    },

    pollPairingStatus(sessionId, signal) {
      const id = encodeURIComponent(sessionId.trim());
      return parseOrThrow<PairStatusResponse>(
        opts.transport,
        opts,
        'GET',
        `/device/pair-status/${id}`,
        undefined,
        signal,
      );
    },

    completePairing(body, signal) {
      return parseOrThrow<PairCompleteResponse>(
        opts.transport,
        opts,
        'POST',
        '/device/pair-complete',
        body,
        signal,
      );
    },

    sendHeartbeat(body, signal) {
      return parseOrThrow<HeartbeatResponse>(
        opts.transport,
        opts,
        'POST',
        '/device/heartbeat',
        body,
        signal,
      );
    },

    fetchFullPlaylist(deviceId, signal) {
      const id = encodeURIComponent(deviceId.trim());
      return parseOrThrow<RawPlaylistFullResponse>(
        opts.transport,
        opts,
        'GET',
        `/device/${id}/playlist/full`,
        undefined,
        signal,
      );
    },
  };
}
