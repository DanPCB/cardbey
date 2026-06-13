/**
 * Publish-time validation for explore featured video URLs.
 * HEAD-checks remote URLs; verifies local /uploads files on disk.
 * Aligns with USE_OUTPUT_VALIDATION — rejects HTML SPA fallbacks and provider temp URLs.
 */
import fs from 'fs';
import path from 'path';
import { buildPublicUrl, fileExistsOnDisk } from '../../utils/publicUrl.js';
import { detectUploadContentType } from '../../lib/uploadsStatic.js';

const PROVIDER_TEMP_HOST_RE =
  /(^|\.)((klingai|kling)\.com|kling-api\.|volces\.com|tos-[a-z0-9-]+\.volces\.com)$/i;

const HEAD_TIMEOUT_MS = 15_000;

/**
 * @param {string | null | undefined} url
 */
export function isProviderTempVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return PROVIDER_TEMP_HOST_RE.test(host);
  } catch {
    return false;
  }
}

/**
 * @param {string | null | undefined} contentType
 */
export function isVideoContentTypeHeader(contentType) {
  const ct = String(contentType ?? '').toLowerCase();
  if (!ct) return false;
  if (ct.includes('text/html')) return false;
  return ct.includes('video/');
}

/**
 * @param {string} videoUrl
 * @param {import('express').Request | null | undefined} [req]
 */
export function resolveExploreVideoHeadUrl(videoUrl, req = null) {
  const trimmed = String(videoUrl ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) {
    return buildPublicUrl(trimmed, req);
  }
  return trimmed;
}

/**
 * @param {string} localRelativePath e.g. /uploads/media/videos/x.mp4
 */
function validateLocalUploadFile(localRelativePath) {
  if (!fileExistsOnDisk(localRelativePath)) {
    return {
      ok: false,
      code: 'file_missing',
      message: 'Video file not found on server storage',
    };
  }

  const clean = localRelativePath.startsWith('/') ? localRelativePath.slice(1) : localRelativePath;
  const filePath = path.join(process.cwd(), clean);
  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    return {
      ok: false,
      code: 'file_unreadable',
      message: 'Video file could not be read from storage',
    };
  }

  if (size < 1024) {
    return {
      ok: false,
      code: 'file_too_small',
      message: 'Video file is too small to be playable',
    };
  }

  const ct = detectUploadContentType(filePath, localRelativePath)?.type ?? 'video/mp4';
  if (!String(ct).toLowerCase().startsWith('video/')) {
    return {
      ok: false,
      code: 'invalid_content_type',
      message: `Stored file is not a video (${ct})`,
    };
  }

  return { ok: true, contentType: ct, status: 200 };
}

/**
 * @param {string} absoluteUrl
 */
async function headProbeUrl(absoluteUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(absoluteUrl, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get('content-type'),
      acceptRanges: res.headers.get('accept-ranges'),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      contentType: null,
      acceptRanges: null,
      error: err?.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} videoUrl
 * @param {{ req?: import('express').Request | null, enforceOutputValidation?: boolean }} [opts]
 */
export async function validateExploreVideoPublishUrl(videoUrl, opts = {}) {
  const trimmed = String(videoUrl ?? '').trim();
  if (!trimmed) {
    return { ok: false, code: 'missing_url', message: 'Video URL is required' };
  }

  if (isProviderTempVideoUrl(trimmed)) {
    return {
      ok: false,
      code: 'provider_temp_url',
      message:
        'Provider delivery URLs expire and cannot be published. Persist the MP4 to Cardbey storage first.',
    };
  }

  let localPath = null;
  if (trimmed.startsWith('/uploads/')) {
    localPath = trimmed;
  } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const pathname = new URL(trimmed).pathname;
      if (pathname.startsWith('/uploads/')) localPath = pathname;
    } catch {
      /* fall through to HEAD */
    }
  }

  if (localPath) {
    const localResult = validateLocalUploadFile(localPath);
    if (localResult.ok) return localResult;
    if (trimmed.startsWith('/')) return localResult;
  }

  const headUrl = resolveExploreVideoHeadUrl(trimmed, opts.req);
  if (!headUrl?.startsWith('http')) {
    return {
      ok: false,
      code: 'unresolvable_url',
      message: 'Video URL could not be resolved for playback validation',
    };
  }

  const head = await headProbeUrl(headUrl);
  if (!head.ok) {
    const strict = process.env.USE_OUTPUT_VALIDATION === 'true' || opts.enforceOutputValidation;
    const message =
      head.status === 404
        ? 'Video URL returned 404'
        : head.error
          ? `Video URL probe failed: ${head.error}`
          : `Video URL returned HTTP ${head.status || 'error'}`;
    return {
      ok: false,
      code: 'head_failed',
      message,
      status: head.status,
      strict,
    };
  }

  const ct = String(head.contentType ?? '').toLowerCase();
  if (ct.includes('text/html')) {
    return {
      ok: false,
      code: 'html_response',
      message:
        'Video URL returns HTML (likely a dashboard SPA fallback or 404 page). Use an absolute Core or CDN asset URL.',
      status: head.status,
      contentType: head.contentType,
    };
  }

  if (!isVideoContentTypeHeader(head.contentType)) {
    if (!ct.includes('octet-stream')) {
      return {
        ok: false,
        code: 'not_video_content_type',
        message: `Expected video/* Content-Type, received ${head.contentType || 'unknown'}`,
        status: head.status,
        contentType: head.contentType,
      };
    }
  }

  return {
    ok: true,
    status: head.status,
    contentType: head.contentType,
    acceptRanges: head.acceptRanges,
  };
}
