import { displayError } from '../errors/displayError.js';

export type NormalizeMediaUrlOptions = {
  apiBaseUrl: string;
  allowInsecureLocalHttp?: boolean;
};

const PRIVATE_HOST =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/i;

/**
 * Port of Android MediaUriResolver / remote URL hygiene for Device V2 media.
 * Preserves query strings (signed URLs) — does not decode/re-encode.
 */
export function normalizeMediaUrl(raw: string, options: NormalizeMediaUrlOptions): string {
  const input = raw.trim();
  if (!input) {
    throw displayError('DISPLAY_MEDIA_URL_INVALID', 'Media URL is empty', { retryable: false });
  }

  const lower = input.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('vbscript:')
  ) {
    throw displayError('DISPLAY_MEDIA_URL_INVALID', `Unsupported URL scheme`, {
      retryable: false,
      context: { scheme: lower.split(':')[0] },
    });
  }

  let absolute: string;
  if (/^https?:\/\//i.test(input)) {
    absolute = input;
  } else if (input.startsWith('//')) {
    absolute = `https:${input}`;
  } else if (input.startsWith('/')) {
    const base = options.apiBaseUrl.replace(/\/+$/, '');
    absolute = `${base}${input}`;
  } else {
    // Relative path without leading slash
    const base = options.apiBaseUrl.replace(/\/+$/, '');
    absolute = `${base}/${input.replace(/^\/+/, '')}`;
  }

  // Collapse accidental double slashes in path only (keep ://)
  absolute = absolute.replace(/([^:]\/)\/+/g, '$1');

  let url: URL;
  try {
    url = new URL(absolute);
  } catch (cause) {
    throw displayError('DISPLAY_MEDIA_URL_INVALID', 'Malformed media URL', {
      retryable: false,
      cause,
    });
  }

  if (url.protocol === 'https:') {
    return url.toString();
  }
  if (url.protocol === 'http:') {
    const allow = options.allowInsecureLocalHttp === true && PRIVATE_HOST.test(url.hostname);
    if (!allow) {
      throw displayError('DISPLAY_MEDIA_URL_INVALID', 'HTTP media URLs are not allowed', {
        retryable: false,
        context: { host: url.hostname },
      });
    }
    return url.toString();
  }

  throw displayError('DISPLAY_MEDIA_URL_INVALID', `Unsupported protocol ${url.protocol}`, {
    retryable: false,
  });
}
