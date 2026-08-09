/**
 * TikTok hashtag → candidate profile URL resolver.
 *
 * Discovery only: obtains @profile URLs for the existing processUrl pipeline.
 * Does NOT scrape challenge pages, rotate identities, or drive a browser farm.
 *
 * TikTok commonly returns an MSSDK / bot shell for datacenter and automated
 * clients — that is PROVIDER_BLOCKED, not a selector bug.
 */

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = Number(process.env.SOCIAL_IMPORT_FETCH_TIMEOUT_MS || 12_000);

/** @typedef {'OK'|'NO_RESULTS'|'PROVIDER_BLOCKED'|'RATE_LIMITED'|'RESOLVER_PARSE_ERROR'|'NETWORK_ERROR'|'CONFIG_ERROR'} ResolveStatus */

/**
 * @param {string} hashtag
 * @param {{ maxUrls?: number, timeoutMs?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{
 *   urls: string[],
 *   status: ResolveStatus,
 *   tag: string,
 *   tagUrl: string,
 *   httpStatus: number | null,
 *   contentType: string | null,
 *   responseBytes: number,
 *   classification: string,
 *   detail: string,
 * }>}
 */
export async function resolveTikTokHashtag(hashtag, opts = {}) {
  const tag = String(hashtag || '')
    .trim()
    .replace(/^#/, '');
  if (!tag) {
    return emptyResult('', '', {
      status: 'CONFIG_ERROR',
      classification: 'CONFIG_ERROR',
      detail: 'empty_hashtag',
    });
  }

  const tagUrl = `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`;
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const maxUrls = Math.max(1, Number(opts.maxUrls) || 20);
  const fetchImpl = opts.fetchImpl || globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    return emptyResult(tag, tagUrl, {
      status: 'CONFIG_ERROR',
      classification: 'CONFIG_ERROR',
      detail: 'fetch_unavailable',
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let httpStatus = null;
  let contentType = null;
  let html = '';

  try {
    const res = await fetchImpl(tagUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    httpStatus = res?.status ?? null;
    contentType = res?.headers?.get?.('content-type') || null;

    if (httpStatus === 429) {
      return emptyResult(tag, tagUrl, {
        status: 'RATE_LIMITED',
        httpStatus,
        contentType,
        classification: 'RATE_LIMITED',
        detail: 'http_429',
      });
    }
    if (httpStatus === 403) {
      return emptyResult(tag, tagUrl, {
        status: 'PROVIDER_BLOCKED',
        httpStatus,
        contentType,
        classification: 'BLOCKED',
        detail: 'http_403',
      });
    }
    if (!res?.ok) {
      return emptyResult(tag, tagUrl, {
        status: 'NETWORK_ERROR',
        httpStatus,
        contentType,
        classification: 'NETWORK_FAILURE',
        detail: `http_${httpStatus ?? 'unknown'}`,
      });
    }

    const text = await res.text();
    html = typeof text === 'string' ? text : '';
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'timeout' : err?.message || 'fetch_failed';
    return emptyResult(tag, tagUrl, {
      status: 'NETWORK_ERROR',
      httpStatus,
      contentType,
      classification: 'NETWORK_FAILURE',
      detail: msg,
    });
  } finally {
    clearTimeout(timer);
  }

  return classifyAndExtractTikTokTagHtml({
    tag,
    tagUrl,
    html,
    httpStatus,
    contentType,
    maxUrls,
  });
}

/**
 * Pure classification + extraction (testable without network).
 * @param {{ tag: string, tagUrl: string, html: string, httpStatus?: number|null, contentType?: string|null, maxUrls?: number }} input
 */
export function classifyAndExtractTikTokTagHtml(input) {
  const tag = String(input.tag || '');
  const tagUrl = String(input.tagUrl || '');
  const html = typeof input.html === 'string' ? input.html : '';
  const httpStatus = input.httpStatus ?? null;
  const contentType = input.contentType ?? null;
  const maxUrls = Math.max(1, Number(input.maxUrls) || 20);

  if (!html) {
    return emptyResult(tag, tagUrl, {
      status: 'NETWORK_ERROR',
      httpStatus,
      contentType,
      responseBytes: 0,
      classification: 'EMPTY',
      detail: 'empty_body',
    });
  }

  const urls = extractTikTokProfileUrls(html).slice(0, maxUrls);
  const classification = classifyTikTokTagResponse(html, { httpStatus, profileCount: urls.length });

  if (urls.length > 0) {
    return {
      urls,
      status: 'OK',
      tag,
      tagUrl,
      httpStatus,
      contentType,
      responseBytes: html.length,
      classification,
      detail: `resolved_${urls.length}`,
    };
  }

  if (classification === 'RATE_LIMITED') {
    return emptyResult(tag, tagUrl, {
      status: 'RATE_LIMITED',
      httpStatus,
      contentType,
      responseBytes: html.length,
      classification,
      detail: 'rate_limited_body',
    });
  }

  if (
    classification === 'CHALLENGE' ||
    classification === 'BLOCKED' ||
    classification === 'LOGIN' ||
    classification === 'BOT_SHELL'
  ) {
    return emptyResult(tag, tagUrl, {
      status: 'PROVIDER_BLOCKED',
      httpStatus,
      contentType,
      responseBytes: html.length,
      classification,
      detail: 'tiktok_hashtag_provider_blocked',
    });
  }

  if (classification === 'NORMAL_PAGE' || classification === 'NO_PROFILE_LINKS') {
    return emptyResult(tag, tagUrl, {
      status: 'NO_RESULTS',
      httpStatus,
      contentType,
      responseBytes: html.length,
      classification,
      detail: 'search_completed_zero_profiles',
    });
  }

  return emptyResult(tag, tagUrl, {
    status: 'RESOLVER_PARSE_ERROR',
    httpStatus,
    contentType,
    responseBytes: html.length,
    classification: classification || 'UNEXPECTED_HTML',
    detail: 'no_profiles_extracted',
  });
}

/**
 * @param {string} html
 * @param {{ httpStatus?: number|null, profileCount?: number }} [meta]
 * @returns {string}
 */
export function classifyTikTokTagResponse(html, meta = {}) {
  if (meta.httpStatus === 429) return 'RATE_LIMITED';
  if (meta.httpStatus === 403) return 'BLOCKED';
  if (!html) return 'EMPTY';

  if (/too many requests|rate.?limit/i.test(html)) return 'RATE_LIMITED';
  if (/access denied|request blocked|sorry,? something went wrong/i.test(html)) return 'BLOCKED';

  // Real challenge UI — not bundled captcha-*.js chunks or marketing i18n ("Verify your business").
  if (
    /id=["']captcha|tiktok-verify-ele|captcha_container|secsdk-captcha|slide.?verify|_waf_verify/i.test(
      html,
    )
  ) {
    return 'CHALLENGE';
  }

  const title = ((html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '').trim();
  const hasMssdk = /webmssdk|mssdk|tt_chain_token/i.test(html);
  const hasUniversal = /__UNIVERSAL_DATA_FOR_REHYDRATION__/i.test(html);
  const emptyVidList = /"vidList"\s*:\s*\[\s*\]/.test(html);
  const hasChallengeDetail =
    /"webapp\.challenge-detail"|ChallengePage|"challengeInfo"|"itemList"\s*:\s*\[/i.test(html);
  const genericTitle = /^tiktok\s*[-–]\s*make your day$/i.test(title);

  if ((meta.profileCount || 0) > 0) return 'NORMAL_PAGE';

  // Datacenter / automated clients: shell page with no hashtag item payload.
  if (hasMssdk && hasUniversal && (emptyVidList || genericTitle) && !hasChallengeDetail) {
    return 'BOT_SHELL';
  }
  if (hasMssdk && genericTitle && (meta.profileCount || 0) === 0) {
    return 'BOT_SHELL';
  }
  // Soft / truncated shells still use the generic marketing title and zero profiles.
  if (genericTitle && (meta.profileCount || 0) === 0) {
    return 'BOT_SHELL';
  }
  if (/login-modal|"isLogin"\s*:\s*false/i.test(html) && !hasChallengeDetail) {
    return 'LOGIN';
  }
  if (hasChallengeDetail) return 'NO_PROFILE_LINKS';
  if (hasUniversal || /tiktok\.com/i.test(html)) return 'UNEXPECTED_HTML';
  return 'UNEXPECTED_HTML';
}

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractTikTokProfileUrls(html) {
  const seen = new Set();
  const urls = [];
  if (typeof html !== 'string' || !html) return urls;

  const hrefRe = /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]+)/gi;
  let m;
  while ((m = hrefRe.exec(html)) !== null) {
    pushProfile(urls, seen, m[1]);
  }

  // Embedded JSON uniqueId (when SSR actually includes feed data).
  const uniqueRe = /"uniqueId"\s*:\s*"([A-Za-z0-9._]+)"/g;
  while ((m = uniqueRe.exec(html)) !== null) {
    pushProfile(urls, seen, m[1]);
  }

  return urls;
}

function pushProfile(urls, seen, handle) {
  const h = String(handle || '').trim();
  if (!h || h.length > 64) return;
  if (/^(tag|music|place|effect|live|search|about|legal)$/i.test(h)) return;
  const url = `https://www.tiktok.com/@${h}`;
  if (seen.has(url)) return;
  seen.add(url);
  urls.push(url);
}

function emptyResult(tag, tagUrl, extra = {}) {
  return {
    urls: [],
    status: extra.status || 'NETWORK_ERROR',
    tag,
    tagUrl,
    httpStatus: extra.httpStatus ?? null,
    contentType: extra.contentType ?? null,
    responseBytes: extra.responseBytes ?? 0,
    classification: extra.classification || 'EMPTY',
    detail: extra.detail || '',
  };
}
