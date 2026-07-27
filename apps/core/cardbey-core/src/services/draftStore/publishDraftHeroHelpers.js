/**
 * Publish-time hero column helpers (Business.heroImageUrl — video-first, poster when present).
 */

const VIDEO_EXT = /\.(mp4|webm|mov)(\?|#|$)/i;

/** Business.heroImageUrl: video URL when no poster; poster when video + poster; image when image-only. */
export function heroImageUrlForBusinessColumn(heroVideo, heroImage) {
  if (heroVideo) {
    if (heroImage && !VIDEO_EXT.test(heroImage)) return heroImage;
    return heroVideo;
  }
  return heroImage || null;
}
