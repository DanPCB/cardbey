/**
 * Headers and logging for /uploads static media (Range / video streaming).
 */
import path from 'path';

/**
 * @param {string | null | undefined} filePath
 * @returns {{ type: string, supportsRange: boolean } | null}
 */
export function detectUploadContentType(filePath) {
  if (!filePath) return null;

  const ext = path.extname(filePath.split('?')[0]).toLowerCase();

  if (ext === '.mp4' || ext === '.m4v') {
    return { type: 'video/mp4', supportsRange: true };
  }
  if (ext === '.webm') return { type: 'video/webm', supportsRange: true };
  if (ext === '.mov') return { type: 'video/quicktime', supportsRange: true };
  if (ext === '.avi') return { type: 'video/x-msvideo', supportsRange: true };
  if (ext === '.mkv') return { type: 'video/x-matroska', supportsRange: true };
  if (ext === '.flv') return { type: 'video/x-flv', supportsRange: true };
  if (ext === '.m3u8') return { type: 'application/vnd.apple.mpegurl', supportsRange: false };
  if (ext === '.jpg' || ext === '.jpeg') return { type: 'image/jpeg', supportsRange: false };
  if (ext === '.png') return { type: 'image/png', supportsRange: false };
  if (ext === '.gif') return { type: 'image/gif', supportsRange: false };
  if (ext === '.webp') return { type: 'image/webp', supportsRange: false };
  if (ext === '.svg') return { type: 'image/svg+xml', supportsRange: false };

  if (!ext) {
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.includes('video') || lowerPath.includes('optimized')) {
      return { type: 'video/mp4', supportsRange: true };
    }
  }

  return null;
}

/**
 * CORS + Range headers required for cross-origin <video> and byte-range streaming.
 * @param {import('express').Response} res
 * @param {string} [contentType]
 */
export function applyUploadsMediaHeaders(res, contentType) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  if (contentType && String(contentType).startsWith('video/')) {
    res.setHeader('Content-Disposition', 'inline');
  }
}

/**
 * Resolve Content-Type from disk path and request URL path.
 * @param {string} filePath
 * @param {string} [requestPath]
 */
export function resolveUploadContentType(filePath, requestPath) {
  let info = detectUploadContentType(filePath);
  if (!info && requestPath) {
    const urlPath = requestPath.split('?')[0].split('#')[0];
    const urlExt = path.extname(urlPath).toLowerCase();
    if (urlExt) {
      info = detectUploadContentType(`temp${urlExt}`);
    }
  }
  return info;
}

/**
 * Log completed GET/HEAD for /uploads (206/200/404).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function logMediaStaticResponse(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return;

  console.log('[media-static]', {
    url: req.originalUrl,
    range: req.headers.range ?? null,
    status: res.statusCode,
    contentType: res.getHeader('Content-Type') ?? null,
    contentRange: res.getHeader('Content-Range') ?? null,
    size: res.getHeader('Content-Length') ?? null,
  });
}
