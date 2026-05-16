import path from 'path';
import fs from 'fs';

/**
 * Check if a URL is a CloudFront/S3 URL (external) vs local path
 * 
 * @param {string} url - URL or path to check
 * @returns {boolean} True if URL is external (CloudFront/S3), false if local
 */
export function isCloudFrontUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  // Check if it's an absolute URL (starts with http:// or https://)
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      // Check if it contains CloudFront domain or S3 domain
      const cdnBaseUrl = process.env.CDN_BASE_URL || '';
      if (cdnBaseUrl) {
        try {
          const cdnUrlObj = new URL(cdnBaseUrl);
          if (hostname === cdnUrlObj.hostname.toLowerCase() || hostname.endsWith('.' + cdnUrlObj.hostname.toLowerCase())) {
            return true;
          }
        } catch (e) {
          // Invalid CDN_BASE_URL, continue with pattern matching
        }
      }
      
      // Check for common S3/CloudFront patterns
      if (
        hostname.includes('.cloudfront.net') ||
        hostname.includes('.s3.') ||
        hostname.includes('amazonaws.com') ||
        hostname.includes('s3.amazonaws.com') ||
        hostname.includes('s3-') ||
        hostname.match(/^[a-z0-9-]+\.s3\.[a-z0-9-]+\.amazonaws\.com$/) ||
        hostname.match(/^[a-z0-9-]+\.cloudfront\.net$/)
      ) {
        return true;
      }
    } catch (e) {
      // Invalid URL format, not a CloudFront URL
      return false;
    }
  }
  
  return false;
}

/**
 * Check if a file exists on the filesystem given a relative URL path
 * 
 * NOTE: This function should NOT be called for CloudFront/S3 URLs.
 * Use isCloudFrontUrl() first to check if the URL is external.
 * 
 * @param {string} relativePath - Relative path like '/uploads/optimized/file.mp4' or '/uploads/file.mp4'
 * @returns {boolean} True if file exists, false otherwise
 * 
 * @example
 * fileExistsOnDisk('/uploads/optimized/video_720p.mp4')
 * // => true if file exists, false otherwise
 */
/**
 * Extract relative path from absolute URL if it points to local server
 * @param {string} url - Absolute URL or relative path
 * @returns {string|null} Relative path or null if not a local URL
 */
function extractLocalPath(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  // If it's already a relative path, return as-is
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return url;
  }
  
  try {
    const urlObj = new URL(url);
    
    // Check if it's a localhost URL or local network IP
    const isLocalhost = urlObj.hostname === 'localhost' || 
                       urlObj.hostname === '127.0.0.1' ||
                       urlObj.hostname === '0.0.0.0' ||
                       urlObj.hostname.startsWith('192.168.') ||
                       urlObj.hostname.startsWith('10.') ||
                       (urlObj.hostname.startsWith('172.') && 
                        parseInt(urlObj.hostname.split('.')[1]) >= 16 && 
                        parseInt(urlObj.hostname.split('.')[1]) <= 31);
    
    // Check if it matches PUBLIC_BASE_URL (same origin)
    const publicBaseUrl = process.env.PUBLIC_BASE_URL;
    let isSameOrigin = false;
    
    if (publicBaseUrl) {
      try {
        const baseUrlObj = new URL(publicBaseUrl);
        // Compare hostname and port (if specified)
        const basePort = baseUrlObj.port || (baseUrlObj.protocol === 'https:' ? '443' : '80');
        const urlPort = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
        isSameOrigin = urlObj.hostname === baseUrlObj.hostname && urlPort === basePort;
      } catch (e) {
        // Invalid PUBLIC_BASE_URL, ignore
      }
    }
    
    // If it's localhost or same origin, extract the path
    if (isLocalhost || isSameOrigin) {
      return urlObj.pathname;
    }
    
    return null; // External URL, not local
  } catch (e) {
    // Not a valid URL, treat as relative path
    return url;
  }
}

export function fileExistsOnDisk(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    return false;
  }
  
  // Don't check filesystem for CloudFront URLs
  if (isCloudFrontUrl(relativePath)) {
    return true; // Assume CloudFront URLs are always available
  }
  
  // Extract relative path from absolute URL if it's a local URL
  const localPath = extractLocalPath(relativePath);
  if (!localPath) {
    // It's an external URL that's not CloudFront and not local
    // For now, we'll assume it's available (could be a CDN or other external source)
    // This might need to be adjusted based on your use case
    return true;
  }
  
  try {
    // Remove leading slash and convert to filesystem path
    const cleanPath = localPath.startsWith('/') ? localPath.slice(1) : localPath;
    const filePath = path.join(process.cwd(), cleanPath);
    
    // Check if file exists and is actually a file (not a directory)
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (error) {
    // If any error occurs (permissions, etc.), assume file doesn't exist
    return false;
  }
}

/**
 * Build public URLs for assets (images, videos, etc.)
 * 
 * This function ensures that in production, all asset URLs use HTTPS
 * via the PUBLIC_BASE_URL environment variable. In development, it
 * falls back to using the request's protocol and host.
 * 
 * @param {string} path - The path to the asset (e.g., '/uploads/file.mp4')
 * @param {object} req - Express request object (optional, for fallback)
 * @returns {string} Full URL to the asset
 * 
 * @example
 * // With PUBLIC_BASE_URL set to 'https://cardbey-core.onrender.com'
 * buildPublicUrl('/uploads/video.mp4') 
 * // => 'https://cardbey-core.onrender.com/uploads/video.mp4'
 * 
 * @example
 * // Without PUBLIC_BASE_URL, uses request
 * buildPublicUrl('/uploads/video.mp4', req)
 * // => 'http://localhost:3001/uploads/video.mp4' (in dev)
 */
export function buildPublicUrl(path, req = null) {
  // Normalize path: ensure it starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // If PUBLIC_BASE_URL is set, always use it (production)
  if (process.env.PUBLIC_BASE_URL) {
    const baseUrl = process.env.PUBLIC_BASE_URL.trim();
    // Remove trailing slash from base URL if present
    const cleanBase = normalizePublicOrigin(baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl);
    return `${cleanBase}${normalizedPath}`;
  }
  
  // Fallback: use request protocol and host (development)
  // Respect X-Forwarded-Host and X-Forwarded-Proto if available (from Render proxy)
  if (req) {
    // Prefer X-Forwarded-Proto (from proxy) for protocol, fallback to req.protocol
    // In production behind proxy, X-Forwarded-Proto should be 'https'
    const forwardedProto = req.get('X-Forwarded-Proto');
    const protocol = forwardedProto || req.protocol || 'http';
    
    // Prefer X-Forwarded-Host (from proxy) over Host header
    const host = req.get('X-Forwarded-Host') || req.get('host') || req.headers.host || 'localhost:3001';
    return joinMediaUrl(normalizePublicOrigin(`${protocol}://${host}`), normalizedPath);
  }
  
  // Last resort: return path as-is (shouldn't happen in normal operation)
  console.warn('[publicUrl] No PUBLIC_BASE_URL and no req object provided, returning path as-is');
  return normalizedPath;
}

/**
 * Ensure URL is absolute and properly formatted
 * Validates and fixes URLs to prevent frontend from treating them as relative
 * 
 * @param {string} url - URL to validate
 * @param {object} req - Express request object (optional, for fallback)
 * @returns {string} Absolute URL (always starts with http:// or https://)
 */
export function ensureAbsoluteUrl(url, req = null) {
  if (!url || typeof url !== 'string') {
    return url;
  }
  
  // If already absolute and valid, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      new URL(url);
      return url;
    } catch (e) {
      const fixed = normalizePublicOrigin(url);
      if (fixed !== url) {
        try {
          new URL(fixed);
          return fixed;
        } catch {
          // fall through
        }
      }
    }
  }
  
  // If relative path, resolve it
  if (url.startsWith('/')) {
    const base = getBaseUrlFromRequest(req);
    return `${base}${url}`;
  }
  
  // If it's a path without leading slash, add it
  if (!url.includes('://')) {
    const base = getBaseUrlFromRequest(req);
    return `${base}/${url}`;
  }
  
  // Last resort: return as-is (shouldn't happen)
  console.warn('[publicUrl] Could not ensure absolute URL:', url);
  return url;
}

/**
 * Fix base URLs where the port was concatenated to the last IPv4 octet without ':'.
 * Example: http://192.168.1.13001/... → http://192.168.1.1:3001/...
 * Node's URL parser rejects these as invalid, so we repair them before use.
 *
 * @param {string} input - Absolute URL (typically http/https)
 * @returns {string} Normalized URL or original string if unchanged / not applicable
 */
export function normalizePublicOrigin(input) {
  if (!input || typeof input !== 'string') return input;
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  const tryFixMergedIpv4Port = (s) => {
    const m = s.match(
      /^(https?:\/\/)(\d{1,3}\.\d{1,3}\.\d{1,3}\.)(\d{4,})((?:\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?)?$/i,
    );
    if (!m) return null;
    const [, scheme, prefix, lastMerged, rest = ''] = m;
    if (Number(lastMerged) <= 255) return null;
    for (let split = 1; split <= 3; split++) {
      const oct = lastMerged.slice(0, split);
      const portStr = lastMerged.slice(split);
      if (!oct || !portStr) continue;
      if (Number(oct) > 255) continue;
      const portNum = Number(portStr);
      if (portNum < 1 || portNum > 65535) continue;
      const candidate = `${scheme}${prefix}${oct}:${portStr}${rest}`;
      try {
        return new URL(candidate).href.replace(/\/+$/, '');
      } catch {
        continue;
      }
    }
    return null;
  };

  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    const fixed = tryFixMergedIpv4Port(trimmed);
    return fixed || trimmed;
  }
}

/**
 * Join a public origin (no trailing slash) with a path that must start with /.
 * @param {string} baseUrl - e.g. http://192.168.1.1:3001
 * @param {string} path - e.g. /uploads/media/x.mp4
 */
export function joinMediaUrl(baseUrl, path) {
  const base = normalizePublicOrigin(String(baseUrl || '').replace(/\/+$/, ''));
  if (!path) return base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`.replace(/([^:]\/)\/+/g, '$1');
}

/**
 * True if URL string's hostname is an RFC1918-style private LAN address (not localhost).
 * Used to warn in dev when env fallbacks embed a stale laptop IP.
 */
function envBaseHostnameIsPrivateLan(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  let candidate = urlStr.trim().replace(/\/+$/, '');
  try {
    if (!/^https?:\/\//i.test(candidate)) {
      candidate = `http://${candidate}`;
    }
    const { hostname } = new URL(candidate);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
    if (/^192\.168\./i.test(hostname)) return true;
    if (/^10\./i.test(hostname)) return true;
    const m = /^172\.(\d+)\./i.exec(hostname);
    if (m) {
      const second = parseInt(m[1], 10);
      return !Number.isNaN(second) && second >= 16 && second <= 31;
    }
    return false;
  } catch {
    return /192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./i.test(urlStr);
  }
}

/**
 * Get the base URL from the current request
 *
 * For device-facing responses (playlist URLs, media), the incoming Host must win so URLs match
 * the address the client actually used (e.g. .11 vs .12 on LAN). Env-based bases are only used
 * when there is no request (CLI/background) or no usable host headers.
 *
 * Order (strict):
 * 1. req + non-empty Host → `${req.protocol}://${req.get('host')}` (request host always wins)
 * 2. req + X-Forwarded-Host → use with X-Forwarded-Proto || req.protocol
 * 3. PUBLIC_API_BASE_URL / PUBLIC_BASE_URL / CORE_BASE_URL
 * 4. http://localhost:3001
 *
 * @param {object} req - Express request object
 * @returns {string} Base URL (e.g., "http://192.168.1.11:3001")
 */
export function getBaseUrlFromRequest(req) {
  if (req) {
    const hostHeader = String(req.get('host') || '').trim();
    if (hostHeader) {
      const protocol = req.protocol || 'http';
      return normalizePublicOrigin(`${protocol}://${hostHeader}`);
    }

    const xfHost = String(req.get('X-Forwarded-Host') || '').trim();
    if (xfHost) {
      const xfProto = String(req.get('X-Forwarded-Proto') || '').trim();
      const protocol = xfProto || req.protocol || 'http';
      return normalizePublicOrigin(`${protocol}://${xfHost}`);
    }
  }

  const envBase =
    process.env.PUBLIC_API_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.CORE_BASE_URL;
  if (envBase) {
    const trimmed = envBase.replace(/\/+$/, '');
    if (process.env.NODE_ENV !== 'production' && envBaseHostnameIsPrivateLan(trimmed)) {
      console.warn(
        '[publicUrl] WARNING: env base URL hostname is a private LAN address — it is only used when the request has no Host (e.g. CLI or misconfigured proxy). Prefer a stable non-LAN PUBLIC_BASE_URL or ensure clients send Host:',
        trimmed,
      );
    }
    return normalizePublicOrigin(trimmed);
  }

  if (req) {
    console.warn('[publicUrl] getBaseUrlFromRequest: missing host on request, using localhost');
  } else {
    console.warn('[publicUrl] No req object provided to getBaseUrlFromRequest, using localhost fallback');
  }
  return 'http://localhost:3001';
}

/**
 * Build a media URL from a relative path or normalize an absolute URL
 * 
 * This function:
 * - Fixes malformed URLs (http/ -> http://)
 * - Replaces old IP addresses with current server origin
 * - Extracts relative path from old absolute URLs (if they're local)
 * - Always rebuilds URLs using the current request's origin
 * - Preserves CloudFront/S3 URLs unchanged
 * 
 * @param {string} urlOrPath - Relative path (e.g., "/uploads/media/file.mp4") or absolute URL
 * @param {object} req - Express request object (optional, for getting current origin)
 * @returns {string} Full absolute URL using current server origin
 */
export function buildMediaUrl(urlOrPath, req = null) {
  if (!urlOrPath || typeof urlOrPath !== 'string') {
    console.warn('[publicUrl] Empty or invalid urlOrPath provided to buildMediaUrl');
    return urlOrPath;
  }
  
  // Fix malformed URL scheme: "http/" -> "http://"
  if (urlOrPath.startsWith('http/')) {
    urlOrPath = 'http://' + urlOrPath.slice('http/'.length);
  }

  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    urlOrPath = normalizePublicOrigin(urlOrPath);
  }
  
  // CloudFront/S3 URLs - return unchanged
  if (isCloudFrontUrl(urlOrPath)) {
    return urlOrPath;
  }
  
  // Check for old IP addresses that need to be replaced
  const OLD_HOSTS = [
    'http://192.168.1.12:3001',
    'http://192.168.1.7:3001',
    'https://192.168.1.12:3001',
    'https://192.168.1.7:3001',
  ];
  
  for (const oldHost of OLD_HOSTS) {
    if (urlOrPath.startsWith(oldHost)) {
      // Extract path from old URL
      const path = urlOrPath.substring(oldHost.length);
      // Rebuild with current origin
      const base = getBaseUrlFromRequest(req);
      const fixed = `${base}${path}`;
      console.warn('[buildMediaUrl] Fixed old IP address:', { from: urlOrPath, to: fixed });
      return fixed;
    }
  }
  
  // Extract relative path from absolute URL if it's a local URL
  const relativePath = extractLocalPath(urlOrPath);
  
  // If we couldn't extract a relative path and it's already absolute, check if we should normalize
  if (!relativePath && (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://'))) {
    // Check if it's a local IP that we should normalize
    try {
      const urlObj = new URL(urlOrPath);
      const secondOct = parseInt(urlObj.hostname.split('.')[1], 10);
      const isLocalIP =
        urlObj.hostname === 'localhost' ||
        urlObj.hostname === '127.0.0.1' ||
        urlObj.hostname.startsWith('192.168.') ||
        urlObj.hostname.startsWith('10.') ||
        (urlObj.hostname.startsWith('172.') &&
          !Number.isNaN(secondOct) &&
          secondOct >= 16 &&
          secondOct <= 31);

      if (isLocalIP) {
        // It's a local IP - extract path and rebuild with current origin
        const base = getBaseUrlFromRequest(req);
        return `${base}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
      }
    } catch (e) {
      // Invalid URL format, fall through to relative path handling
    }
    
    // External URL we don't control - return as-is
    return urlOrPath;
  }
  
  // Build URL from relative path using current request origin
  const base = getBaseUrlFromRequest(req);
  const cleanPath = (relativePath || urlOrPath).replace(/^\/+/, ''); // Remove leading slashes
  return joinMediaUrl(base, `/${cleanPath}`);
}

/**
 * Normalize a media URL for storage in database
 * Converts absolute URLs to relative paths, preserving CloudFront URLs
 * 
 * @param {string} url - Absolute or relative URL
 * @param {object} req - Express request object (optional)
 * @returns {string} Relative path (e.g., "/uploads/media/file.mp4") or CloudFront URL unchanged
 */
export function normalizeMediaUrlForStorage(url, req = null) {
  if (!url || typeof url !== 'string') {
    return url;
  }
  
  // Fix malformed URL scheme: "http/" -> "http://"
  if (url.startsWith('http/')) {
    url = 'http://' + url.slice('http/'.length);
  }
  
  // CloudFront/S3 URLs - store as-is
  if (isCloudFrontUrl(url)) {
    return url;
  }
  
  // Extract relative path from absolute URL
  try {
    const urlObj = new URL(url);
    const isLocalIP =
      urlObj.hostname === 'localhost' ||
      urlObj.hostname === '127.0.0.1' ||
      urlObj.hostname.startsWith('192.168.') ||
      urlObj.hostname.startsWith('10.') ||
      (urlObj.hostname.startsWith('172.') &&
        (() => {
          const second = parseInt(urlObj.hostname.split('.')[1], 10);
          return !Number.isNaN(second) && second >= 16 && second <= 31;
        })());
    
    if (isLocalIP) {
      // It's a local URL - return just the path
      return urlObj.pathname + urlObj.search + urlObj.hash;
    }
    
    // External URL - return as-is (might be a CDN we don't control)
    return url;
  } catch (e) {
    // Not a valid absolute URL - assume it's already a relative path
    return url.startsWith('/') ? url : `/${url}`;
  }
}

/**
 * Resolve a relative or absolute URL to a full public URL
 * 
 * If the URL is already absolute:
 * - If PUBLIC_BASE_URL is not set, return url unchanged
 * - If PUBLIC_BASE_URL is set and the origin matches the base's origin, return url unchanged (do not reconstruct)
 * - Otherwise, return url unchanged (do not normalize across different domains)
 * 
 * If the URL is NOT a valid absolute URL, treat it as a relative path:
 * - Build base from PUBLIC_BASE_URL or request headers
 * - Ensure path starts with /, then return base + path
 * 
 * @param {string} url - Relative path or absolute URL
 * @param {object} req - Express request object (optional)
 * @returns {string} Full URL (always HTTPS in production if PUBLIC_BASE_URL is set)
 */
export function resolvePublicUrl(url, req = null) {
  // Early validation
  if (!url) {
    console.warn('[publicUrl] Empty URL provided to resolvePublicUrl');
    return url;
  }

  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    url = normalizePublicOrigin(url);
  }
  
  // CloudFront / CDN URLs - return unchanged if matches CDN_BASE_URL
  const cdnBase = process.env.CDN_BASE_URL;
  if (cdnBase && typeof url === 'string' && url.startsWith(cdnBase)) {
    return url;
  }
  
  const base = process.env.PUBLIC_BASE_URL;
  
  // Warn if PUBLIC_BASE_URL is not set in production
  if (!base && process.env.NODE_ENV === 'production') {
    console.error('[publicUrl] PUBLIC_BASE_URL not set in production! Falling back to request origin if available.');
  }
  
  // Try to parse as absolute URL
  let urlObj;
  try {
    urlObj = new URL(url);
    // Successfully parsed as absolute URL
    
    // If URL is already absolute, return it as-is (don't modify)
    // This prevents double-processing and ensures frontend gets correct absolute URLs
    // Only exception: if PUBLIC_BASE_URL is set and we want to normalize the protocol/host
    if (!base) {
      // No PUBLIC_BASE_URL - return absolute URL unchanged
      return url;
    }
    
    // Parse base URL
    let baseObj;
    try {
      let cleanBase = normalizePublicOrigin(base.trim().endsWith('/') ? base.trim().slice(0, -1) : base.trim());
      
      // HTTPS enforcement in production
      if (process.env.NODE_ENV === 'production' && cleanBase.startsWith('http://')) {
        cleanBase = cleanBase.replace('http://', 'https://');
      }
      
      baseObj = new URL(cleanBase);
    } catch (e) {
      // Invalid PUBLIC_BASE_URL, return url unchanged
      console.warn('[publicUrl] Invalid PUBLIC_BASE_URL:', base);
      return url;
    }
    
    // If host matches base host, upgrade protocol and normalize
    if (urlObj.host === baseObj.host) {
      // Use base's origin (which already has correct protocol://host format)
      // Rebuild URL using base's origin, preserving path/search/hash
      // Prevent double slashes
      const pathname = urlObj.pathname.startsWith('/') ? urlObj.pathname : `/${urlObj.pathname}`;
      return `${baseObj.origin}${pathname}${urlObj.search}${urlObj.hash}`;
    }
    
    // Different host → don't touch it
    return url;
  } catch (e) {
    // Not a valid absolute URL - treat as relative path
    // Build base from PUBLIC_BASE_URL or request headers
    let origin;
    if (base) {
      try {
        const cleanBase = normalizePublicOrigin(base.trim().endsWith('/') ? base.trim().slice(0, -1) : base.trim());
        const baseObj = new URL(cleanBase);
        origin = baseObj.origin;
      } catch (e) {
        console.warn('[publicUrl] Invalid PUBLIC_BASE_URL:', base);
        // Fall through to request-based origin
      }
    }
    
    // Fallback to request-based origin if base parsing failed or not set
    if (!origin && req) {
      // Prefer X-Forwarded-Proto (from proxy) for protocol, fallback to req.protocol
      // In production behind proxy, X-Forwarded-Proto should be 'https'
      const forwardedProto = req.get('X-Forwarded-Proto');
      let protocol = forwardedProto || req.protocol || 'http';
      
      // Ensure protocol has :// (Express req.protocol doesn't include colon)
      // X-Forwarded-Proto also doesn't include colon
      if (!protocol.includes('://')) {
        protocol = `${protocol}://`;
      }
      
      // HTTPS enforcement in production
      if (process.env.NODE_ENV === 'production' && protocol.startsWith('http://')) {
        protocol = 'https://';
      }
      
      // Prefer X-Forwarded-Host (from proxy) over Host header
      const host = req.get('X-Forwarded-Host') || req.get('host') || req.headers.host || 'localhost:3001';
      origin = normalizePublicOrigin(`${protocol}${host}`);
    } else if (!origin) {
      // Last resort: cannot resolve relative URL without base or request
      // This should not happen in normal operation, but log warning and return relative path
      // The caller should handle this case (e.g., skip the item or use a default base)
      console.error('[publicUrl] CRITICAL: Cannot resolve relative URL - no valid PUBLIC_BASE_URL and no req object', {
        url,
        hasBase: !!base,
        hasReq: !!req,
      });
      // Return relative path - caller should validate or skip
      return url;
    }
    
    // Ensure path starts with / (prevent double slashes)
    let cleanPath = url;
    if (!cleanPath.startsWith('/')) {
      cleanPath = `/${cleanPath}`;
    }
    
    // Prevent double slashes in final URL
    const finalUrl = `${origin}${cleanPath}`.replace(/([^:]\/)\/+/g, '$1');
    return finalUrl;
  }
}

