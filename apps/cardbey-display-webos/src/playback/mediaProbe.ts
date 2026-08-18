import { browserFetch, isHlsPlaybackUrl } from '@cardbey/display-runtime';
import {
  failureCodeFromHttpStatus,
  type MediaFailureCode,
  type MediaItemProbeResult,
} from './mediaFailureCodes.js';
import { safeRuntimeLog } from '../runtime/runtimeErrorReport.js';

export type ProbeMediaType = 'IMAGE' | 'VIDEO' | 'LIVE_CARD';

/** HLS and live cards must not be HEAD/GET probed — m3u8 probes fail or misclassify. */
export function shouldSkipHttpMediaProbe(input: {
  mediaType: string;
  url: string;
  mimeType?: string;
}): boolean {
  if (String(input.mediaType || '').toUpperCase() === 'LIVE_CARD') return true;
  return isHlsPlaybackUrl(input.url, input.mimeType);
}

function headerGet(headers: Headers, name: string): string | null {
  try {
    return headers.get(name);
  } catch {
    return null;
  }
}

function classifyFetchError(err: unknown): {
  failureCode: MediaFailureCode;
  failureMessage: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  if (/ssl|tls|certificate|CERT|ERR_CERT|insecure/i.test(message)) {
    return { failureCode: 'MEDIA_TLS_FAILURE', failureMessage: message };
  }
  if (/Failed to fetch|NetworkError|network/i.test(message)) {
    return { failureCode: 'MEDIA_NETWORK_ERROR', failureMessage: message };
  }
  return { failureCode: 'MEDIA_UNKNOWN', failureMessage: message };
}

/**
 * Independent media URL verification from the player (not the <video>/<img> element).
 */
export async function probeMediaItem(input: {
  itemId: string;
  mediaType: ProbeMediaType;
  url: string;
  mimeType?: string;
}): Promise<MediaItemProbeResult> {
  const originalUrl = String(input.url || '').trim();
  const redirectChain: string[] = [];
  const mediaType: 'IMAGE' | 'VIDEO' =
    input.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE';
  const base: MediaItemProbeResult = {
    itemId: input.itemId,
    mediaType,
    originalUrl,
    resolvedUrl: originalUrl,
    ok: false,
    redirectChain,
    probeMethod: 'NONE',
  };

  if (shouldSkipHttpMediaProbe(input)) {
    return {
      ...base,
      ok: true,
      probeMethod: 'NONE',
    };
  }

  if (!originalUrl) {
    return {
      ...base,
      failureCode: 'MEDIA_INVALID_URL',
      failureMessage: 'empty media url',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(originalUrl);
  } catch (err) {
    return {
      ...base,
      failureCode: 'MEDIA_INVALID_URL',
      failureMessage: err instanceof Error ? err.message : 'invalid url',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      ...base,
      failureCode: 'MEDIA_INVALID_URL',
      failureMessage: 'unsupported protocol ' + parsed.protocol,
    };
  }

  safeRuntimeLog('MEDIA_PROBE_START', {
    itemId: input.itemId,
    mediaType: input.mediaType,
    urlHost: parsed.host,
    path: parsed.pathname.slice(0, 80),
  });

  try {
    let res = await browserFetch(originalUrl, {
      method: 'HEAD',
      cache: 'no-store',
      redirect: 'follow',
    });
    base.probeMethod = 'HEAD';

    // Some CDNs reject HEAD — fall back to a tiny ranged GET.
    if (res.status === 405 || res.status === 501) {
      res = await browserFetch(originalUrl, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'follow',
        headers: { Range: 'bytes=0-0' },
      });
      base.probeMethod = 'GET';
    }

    const resolvedUrl = res.url || originalUrl;
    if (resolvedUrl !== originalUrl) redirectChain.push(resolvedUrl);
    const mimeType = headerGet(res.headers, 'content-type') || undefined;
    const lenRaw = headerGet(res.headers, 'content-length');
    const contentLength = lenRaw != null && lenRaw !== '' ? Number(lenRaw) : null;

    const result: MediaItemProbeResult = {
      ...base,
      resolvedUrl,
      httpStatus: res.status,
      mimeType,
      contentLength: Number.isFinite(contentLength as number) ? contentLength : null,
      redirectChain,
      ok: res.status >= 200 && res.status < 400,
    };

    if (!result.ok) {
      result.failureCode = failureCodeFromHttpStatus(res.status);
      result.failureMessage = 'HTTP ' + String(res.status);
    } else if (contentLength === 0) {
      result.ok = false;
      result.failureCode = 'MEDIA_EMPTY_RESPONSE';
      result.failureMessage = 'content-length 0';
    }

    safeRuntimeLog('MEDIA_PROBE_RESULT', {
      itemId: input.itemId,
      mediaType: input.mediaType,
      ok: result.ok,
      httpStatus: result.httpStatus,
      mimeType: result.mimeType,
      contentLength: result.contentLength,
      failureCode: result.failureCode || null,
      probeMethod: result.probeMethod,
      redirected: redirectChain.length > 0,
    });

    return result;
  } catch (err) {
    const classified = classifyFetchError(err);
    safeRuntimeLog('MEDIA_PROBE_FAILED', {
      itemId: input.itemId,
      mediaType: input.mediaType,
      failureCode: classified.failureCode,
      message: classified.failureMessage,
    });
    return {
      ...base,
      failureCode: classified.failureCode,
      failureMessage: classified.failureMessage,
    };
  }
}
