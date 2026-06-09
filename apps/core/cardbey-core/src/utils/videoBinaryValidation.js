/**
 * Validate fetched/uploaded video binary (MP4/WebM magic bytes, min size, reject HTML/JSON).
 */

export const MIN_VIDEO_BYTES = 100 * 1024;

const HTML_MARKERS = ['<!doctype', '<html', '<head', '<body'];
const JSON_START = ['{', '['];

/**
 * @param {Uint8Array | Buffer} bytes
 * @returns {'mp4' | 'webm' | null}
 */
export function detectVideoContainer(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'webm';
  }
  if (bytes.length >= 8) {
    const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (ftyp === 'ftyp') return 'mp4';
  }
  return null;
}

function looksLikeTextPayload(bytes) {
  if (!bytes || bytes.length < 4) return false;
  const head = Buffer.from(bytes.subarray(0, Math.min(64, bytes.length))).toString('utf8').trim().toLowerCase();
  if (HTML_MARKERS.some((m) => head.startsWith(m) || head.includes(m))) return true;
  if (JSON_START.includes(head[0])) {
    try {
      JSON.parse(Buffer.from(bytes.subarray(0, Math.min(512, bytes.length))).toString('utf8'));
      return true;
    } catch {
      /* not json */
    }
  }
  return false;
}

/**
 * @param {Uint8Array | Buffer} bytes
 * @param {string} [contentType]
 * @returns {{ valid: boolean, reason?: string, size: number, contentType?: string, container?: string }}
 */
export function validateVideoBinary(bytes, contentType = '') {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const size = buf.length;
  const ct = String(contentType || '').toLowerCase().trim();

  if (size < MIN_VIDEO_BYTES) {
    return { valid: false, reason: 'too_small', size, contentType: ct || undefined };
  }

  if (ct.startsWith('text/') || ct.includes('html') || ct.includes('json')) {
    return { valid: false, reason: 'non_video_content_type', size, contentType: ct };
  }

  if (looksLikeTextPayload(buf)) {
    return { valid: false, reason: 'text_or_json_body', size, contentType: ct || undefined };
  }

  const container = detectVideoContainer(buf);
  const ctIsVideo = ct.startsWith('video/');
  const ctIsOctet = ct === 'application/octet-stream' || ct === '';

  if (container) {
    const mime =
      container === 'webm' ? 'video/webm' : 'video/mp4';
    return { valid: true, size, contentType: ctIsVideo ? ct : mime, container };
  }

  if (ctIsVideo || (ctIsOctet && size >= MIN_VIDEO_BYTES)) {
    return {
      valid: false,
      reason: 'missing_magic_signature',
      size,
      contentType: ct || undefined,
    };
  }

  return { valid: false, reason: 'not_video', size, contentType: ct || undefined };
}

/**
 * @param {Buffer} buffer
 * @returns {{ ok: true } | { ok: false, error: string, message: string }}
 */
export function assertValidHeroVideoUpload(buffer, mime = '') {
  const isVideoMime = String(mime || '').toLowerCase().startsWith('video/');
  if (!isVideoMime && buffer?.length >= MIN_VIDEO_BYTES) {
    const detected = detectVideoContainer(buffer);
    if (!detected) {
      return {
        ok: false,
        error: 'invalid_video_file',
        message: 'Uploaded video is not playable',
      };
    }
  }
  const result = validateVideoBinary(buffer, mime);
  if (!result.valid) {
    return {
      ok: false,
      error: 'invalid_video_file',
      message:
        result.reason === 'too_small'
          ? 'Uploaded video is not playable'
          : 'Uploaded video is not playable',
    };
  }
  return { ok: true };
}
