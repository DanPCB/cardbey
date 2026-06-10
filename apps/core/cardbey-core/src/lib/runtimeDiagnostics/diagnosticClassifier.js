import { trimStr } from './diagnosticTypes.js';

const CDN_HOSTS = ['media.cardbey.com', '.r2.dev', '.cloudfront.net', '.r2.cloudflarestorage.com'];

/**
 * @param {string} url
 */
function isCdnMediaHost(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return CDN_HOSTS.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h));
  } catch {
    return /media\.cardbey\.com/i.test(url);
  }
}

/**
 * @param {Record<string, unknown>} event
 * @returns {Record<string, unknown>}
 */
export function classifyRuntimeDiagnostic(event) {
  const eventName = trimStr(event.eventName).toLowerCase();
  const message = trimStr(event.message).toLowerCase();
  const category = trimStr(event.category).toLowerCase();
  const evidence =
    event.evidence && typeof event.evidence === 'object' && !Array.isArray(event.evidence)
      ? event.evidence
      : {};
  const rawError =
    event.rawError && typeof event.rawError === 'object' && !Array.isArray(event.rawError)
      ? event.rawError
      : {};

  const mediaUrl =
    trimStr(evidence.url) ||
    trimStr(evidence.currentSrc) ||
    trimStr(evidence.publicUrl) ||
    trimStr(evidence.heroVideoUrl) ||
    '';
  const readyState = Number(evidence.readyState);
  const networkState = Number(evidence.networkState);
  const httpStatus = Number(evidence.status ?? evidence.httpStatus ?? rawError.status);

  const textBlob = `${eventName} ${message} ${JSON.stringify(evidence).slice(0, 500)}`.toLowerCase();

  /** @type {string[]} */
  const excludedCauses = [];

  // 1. media_cors_blocked
  if (
    (category === 'media' || /video|image|media|hero/.test(eventName)) &&
    (textBlob.includes('cors') ||
      textBlob.includes('opaqueresponseblocking') ||
      textBlob.includes('corb') ||
      textBlob.includes('cross-origin')) &&
    (readyState === 0 || Number.isNaN(readyState)) &&
    (networkState === 3 || Number.isNaN(networkState)) &&
    isCdnMediaHost(mediaUrl)
  ) {
    return pack('cdn', 'media_cors_blocked', 0.92, {
      summary:
        'Media file saved, but browser playback is blocked by CDN/R2 CORS.',
      nextAction:
        'Fix R2 CORS policy and expose Range/Content-Type/Content-Length headers.',
      recommendedOwner: 'cloudflare',
      excludedCauses: [
        'upload_failure',
        'db_persistence_failure',
        'react_render_branch_missing',
      ],
      likelyFiles: [
        'docs/R2_MEDIA_CDN_CORS.md',
        'apps/dashboard/.../HeroMediaBackground.tsx',
        'apps/dashboard/.../cdnVideoPlaybackBlocked.ts',
      ],
      externalActions: ['Update Cloudflare R2 bucket CORS policy'],
      cursorPacketNote:
        'Do not debug upload, DB persistence, or React render branch. Video is saved and element exists. Browser playback is blocked by CDN/R2 CORS.',
    });
  }

  // 2. cdn_404
  if (
    (category === 'media' || /video|image|media/.test(eventName)) &&
    (httpStatus === 404 || textBlob.includes('404')) &&
    isCdnMediaHost(mediaUrl)
  ) {
    return pack('cdn', 'cdn_object_missing', 0.88, {
      summary: 'Media URL points to CDN but object is missing (404).',
      nextAction: 'Verify R2 object key exists and public domain maps to bucket.',
      recommendedOwner: 'ops',
      excludedCauses: ['upload_validation_only'],
      likelyFiles: ['apps/core/.../s3StorageAdapter.js', 'apps/core/.../uploadResponse.js'],
      externalActions: ['Check R2 object listing for key'],
    });
  }

  // 3. upload_connection_failed
  if (
    textBlob.includes('failed to fetch') ||
    textBlob.includes('networkerror') ||
    textBlob.includes('network request failed') ||
    httpStatus === 0
  ) {
    excludedCauses.push('cdn_cors_only');
    return pack('network', 'upload_connection_failed', 0.8, {
      summary: 'Client could not reach backend — network/CORS/DNS or offline.',
      nextAction: 'Check Core URL, CORS whitelist, and Render service health.',
      recommendedOwner: 'render',
      excludedCauses,
      likelyFiles: ['apps/dashboard/.../api.ts', 'apps/dashboard/.../getCoreApiBaseUrl.ts'],
      externalActions: ['Verify Render core service is up'],
    });
  }

  // 4. storage_upload_failed
  if (
    category === 'storage' ||
    /upload/.test(eventName) ||
    textBlob.includes('accessdenied') ||
    textBlob.includes('signaturedoesnotmatch') ||
    textBlob.includes('nosuchbucket') ||
    (httpStatus >= 500 && /upload|storage|hero/.test(eventName))
  ) {
    return pack('storage', 'storage_upload_failed', 0.85, {
      summary: 'Storage upload endpoint or R2/S3 write failed.',
      nextAction: 'Check R2 credentials, bucket policy, and Core upload route logs.',
      recommendedOwner: 'backend',
      excludedCauses: ['browser_playback_only'],
      likelyFiles: [
        'apps/core/.../s3StorageAdapter.js',
        'apps/core/.../routes/stores.js',
      ],
      externalActions: ['Verify STORAGE_DRIVER and R2 env vars on Render'],
    });
  }

  // 5. deploy_version_mismatch
  if (
    eventName.includes('deploy_version_mismatch') ||
    (category === 'deployment' && textBlob.includes('commit'))
  ) {
    return pack('deployment', 'deploy_version_mismatch', 0.9, {
      summary: 'Frontend and backend deployment versions may be out of sync.',
      nextAction: 'Wait for Core deploy or verify Render deploy order (dashboard vs core).',
      recommendedOwner: 'ops',
      excludedCauses: ['application_logic_bug'],
      likelyFiles: ['docs/DEPLOYMENT_PROMOTION.md'],
      externalActions: ['Compare dashboard vs core commit SHA on Render'],
    });
  }

  // 6. react_render_loop
  if (
    textBlob.includes('maximum update depth exceeded') ||
    textBlob.includes('too many re-renders')
  ) {
    return pack('frontend', 'react_render_loop', 0.9, {
      summary: 'React render loop detected.',
      nextAction: 'Inspect useEffect/setState cycles in stack component.',
      recommendedOwner: 'frontend',
      excludedCauses: ['cdn', 'storage'],
      likelyFiles: [],
      externalActions: [],
    });
  }

  // 7. preview_render_crash
  if (
    eventName.includes('preview_crash') ||
    (category === 'render' && /preview/.test(trimStr(event.route)))
  ) {
    return pack('frontend', 'preview_render_crash', 0.82, {
      summary: 'Website preview route crashed during render.',
      nextAction: 'Inspect preview error boundary stack and draft payload shape.',
      recommendedOwner: 'frontend',
      excludedCauses: ['cdn_cors'],
      likelyFiles: [
        'apps/dashboard/.../WebsitePreviewErrorBoundary.tsx',
        'apps/dashboard/.../WebsitePreviewPage.tsx',
      ],
      externalActions: [],
    });
  }

  // 8. auth_cookie_blocked
  if (
    category === 'auth' ||
    httpStatus === 401 ||
    httpStatus === 403 ||
    textBlob.includes('samesite') ||
    textBlob.includes('unauthorized')
  ) {
    return pack('auth', 'auth_cookie_blocked', 0.75, {
      summary: 'Authenticated request failed — cookie/session may be blocked.',
      nextAction: 'Check SameSite cookie settings and Core CORS credentials.',
      recommendedOwner: 'backend',
      excludedCauses: ['media_cdn'],
      likelyFiles: ['apps/core/.../middleware/auth.js', 'apps/core/.../config/cors.js'],
      externalActions: [],
    });
  }

  // 9. device_offline
  if (category === 'device' || eventName.includes('device_') || eventName.includes('signage')) {
    return pack('device', 'device_offline_or_duplicate', 0.7, {
      summary: 'Device/signage presence or heartbeat mismatch.',
      nextAction: 'Inspect device engine pairing and heartbeat logs.',
      recommendedOwner: 'backend',
      excludedCauses: [],
      likelyFiles: ['apps/core/.../routes/deviceEngine.js'],
      externalActions: [],
    });
  }

  // 10. fallback
  return pack('unknown', 'unknown_runtime_error', 0.4, {
    summary: trimStr(event.message) || 'Runtime error captured without specific classification.',
    nextAction: 'Review evidence payload and recent breadcrumbs in Runtime Observations.',
    recommendedOwner: 'cursor',
    excludedCauses: [],
    likelyFiles: [],
    externalActions: [],
  });
}

/**
 * @param {string} layer
 * @param {string} kind
 * @param {number} confidence
 * @param {Record<string, unknown>} extra
 */
function pack(layer, kind, confidence, extra) {
  return {
    layer,
    kind,
    confidence,
    summary: extra.summary,
    nextAction: extra.nextAction,
    recommendedOwner: extra.recommendedOwner ?? 'cursor',
    excludedCauses: extra.excludedCauses ?? [],
    likelyFiles: extra.likelyFiles ?? [],
    externalActions: extra.externalActions ?? [],
    cursorPacketNote: extra.cursorPacketNote ?? null,
  };
}

/**
 * @param {Record<string, unknown>} event
 * @param {Record<string, unknown>} classification
 */
export function buildCursorPacket(event, classification) {
  return {
    diagnosticId: event.id,
    symptom: event.message,
    classification: `${classification.layer}/${classification.kind}`,
    evidence: event.evidence ?? {},
    excludedCauses: classification.excludedCauses ?? [],
    nextAction: classification.nextAction,
    likelyFiles: classification.likelyFiles ?? [],
    externalActions: classification.externalActions ?? [],
    note: classification.cursorPacketNote ?? null,
  };
}
