export type DisplayRetryConfig = {
  initialDelayMs: number;
  maximumDelayMs: number;
  multiplier: number;
  jitterRatio: number;
};

export type DisplayRuntimeConfig = {
  apiBaseUrl: string;
  platform: string;
  appVersion: string;
  heartbeatIntervalMs: number;
  playlistSyncIntervalMs: number;
  pairingPollIntervalMs: number;
  requestTimeoutMs: number;
  mediaTimeoutMs: number;
  /** When true, http:// localhost / private LAN hosts are allowed. */
  allowInsecureLocalHttp: boolean;
  defaultImageDurationMs: number;
  retry: DisplayRetryConfig;
};

export type DisplayRuntimeConfigInput = Partial<DisplayRuntimeConfig> & {
  apiBaseUrl: string;
  platform: string;
  appVersion: string;
};

export const DEFAULT_RETRY: DisplayRetryConfig = {
  initialDelayMs: 1_000,
  maximumDelayMs: 60_000,
  multiplier: 2,
  jitterRatio: 0.2,
};

export function defaultRuntimeConfig(
  input: DisplayRuntimeConfigInput,
): DisplayRuntimeConfig {
  return {
    apiBaseUrl: input.apiBaseUrl,
    platform: input.platform,
    appVersion: input.appVersion,
    heartbeatIntervalMs: input.heartbeatIntervalMs ?? 30_000,
    playlistSyncIntervalMs: input.playlistSyncIntervalMs ?? 30_000,
    pairingPollIntervalMs: input.pairingPollIntervalMs ?? 2_000,
    requestTimeoutMs: input.requestTimeoutMs ?? 15_000,
    mediaTimeoutMs: input.mediaTimeoutMs ?? 20_000,
    allowInsecureLocalHttp: input.allowInsecureLocalHttp ?? false,
    defaultImageDurationMs: input.defaultImageDurationMs ?? 8_000,
    retry: { ...DEFAULT_RETRY, ...input.retry },
  };
}
