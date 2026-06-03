/**
 * Permanent publish-time hero invariants (platform law).
 *
 * - heroVideoUrl present ⇒ heroMediaType === 'video'
 * - heroMediaType === 'video' ⇒ heroImageUrl is poster-only (never primary media)
 *
 * Uses resolveCanonicalHeroMediaFromPreview + writeCanonicalHeroMediaToPreview as the only fix path.
 */

import {
  resolveCanonicalHeroMediaFromPreview,
  writeCanonicalHeroMediaToPreview,
} from './draftPreviewHeroSync.js';

const VIDEO_EXT = /\.(mp4|webm|mov)(\?|#|$)/i;

function trimStr(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * @param {object|null|undefined} preview
 * @returns {{ code: string, videoUrl?: string, heroMediaType?: string, heroImageUrl?: string }|null}
 */
export function detectHeroCanonicalMismatch(preview) {
  if (!preview || typeof preview !== 'object') return null;

  const videoUrl =
    trimStr(preview.heroVideoUrl) ??
    trimStr(preview.heroVideo) ??
    trimStr(preview.hero?.videoUrl) ??
    null;
  const mediaType = preview.heroMediaType;
  const heroImageUrl = trimStr(preview.heroImageUrl);

  if (videoUrl && mediaType === 'image') {
    return { code: 'video_url_with_image_media_type', videoUrl, heroMediaType: mediaType };
  }
  if (videoUrl && !mediaType) {
    return { code: 'video_url_without_media_type', videoUrl };
  }
  if (videoUrl && heroImageUrl && heroImageUrl === videoUrl && VIDEO_EXT.test(heroImageUrl)) {
    return { code: 'video_url_only_in_heroImageUrl_column', heroImageUrl };
  }
  if (videoUrl && mediaType === 'video' && heroImageUrl && VIDEO_EXT.test(heroImageUrl)) {
    return { code: 'video_url_in_heroImageUrl_with_video_type', heroImageUrl, videoUrl };
  }
  return null;
}

/**
 * Enforce canonical hero contract before publish / snapshot build (mutates preview).
 *
 * @param {object} preview
 * @param {{ source?: string, silent?: boolean }} [opts]
 * @returns {object} preview
 */
export function enforcePublishHeroCanonical(preview, opts = {}) {
  if (!preview || typeof preview !== 'object') return preview;

  const mismatch = detectHeroCanonicalMismatch(preview);
  if (mismatch && !opts.silent && process.env.NODE_ENV !== 'test') {
    console.warn('[hero-canonical-mismatch]', {
      source: opts.source ?? 'publish',
      ...mismatch,
    });
  }

  const canonical = resolveCanonicalHeroMediaFromPreview(preview);
  writeCanonicalHeroMediaToPreview(preview, canonical);
  return preview;
}
