/**
 * Canonical hero image/video resolution for public DTOs (feed, /s/:slug, preview parity).
 */

const VIDEO_EXT = /\.(mp4|webm|mov)(\?|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|svg)(\?|$)/i;
const UPLOAD_MEDIA_RE = /\/uploads\/media\//i;

export function isVideoMediaUrl(url) {
  return typeof url === 'string' && url.trim() !== '' && VIDEO_EXT.test(url.trim());
}

function isUploadMediaPath(url) {
  return typeof url === 'string' && UPLOAD_MEDIA_RE.test(url.trim());
}

function isLikelyImagePath(url) {
  return typeof url === 'string' && IMAGE_EXT.test(url.trim());
}

/**
 * @param {object} business - Business row (may include stylePreferences JSON)
 * @returns {{ heroUrl: string|null, heroVideo: string|null, heroImage: string|null }}
 */
export function resolveHeroMediaFromBusiness(business) {
  let stylePrefs = null;
  if (business?.stylePreferences) {
    try {
      stylePrefs =
        typeof business.stylePreferences === 'string'
          ? JSON.parse(business.stylePreferences)
          : business.stylePreferences;
    } catch {
      stylePrefs = {};
    }
  }
  const heroMediaType =
    typeof stylePrefs?.heroMediaType === 'string' ? stylePrefs.heroMediaType.trim().toLowerCase() : null;
  const explicitVideo = heroMediaType === 'video' || stylePrefs?.hero?.type === 'video';

  const heroVideo =
    (typeof stylePrefs?.heroVideo === 'string' && stylePrefs.heroVideo.trim()) ||
    (typeof stylePrefs?.heroVideoUrl === 'string' && stylePrefs.heroVideoUrl.trim()) ||
    null;
  const heroImagePref =
    (typeof stylePrefs?.heroImage === 'string' && stylePrefs.heroImage.trim()) ||
    (typeof stylePrefs?.heroImageUrl === 'string' && stylePrefs.heroImageUrl.trim()) ||
    null;
  const columnHero =
    (typeof business?.heroImageUrl === 'string' && business.heroImageUrl.trim()) || null;

  let heroImage = heroImagePref;
  let heroUrl = columnHero || heroImagePref || heroVideo || null;

  if (heroVideo) {
    if (!heroImage || isVideoMediaUrl(heroImage)) heroImage = null;
    heroUrl = heroVideo;
  } else if (
    columnHero &&
    (isVideoMediaUrl(columnHero) ||
      (explicitVideo && isUploadMediaPath(columnHero) && !isLikelyImagePath(columnHero)))
  ) {
    return { heroUrl: columnHero, heroVideo: columnHero, heroImage: heroImagePref };
  }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[HERO_MEDIA_RESOLVE]', {
      storeId: business?.id ?? null,
      slug: business?.slug ?? null,
      heroUrl,
      heroVideo,
      heroImage,
    });
  }

  return { heroUrl, heroVideo, heroImage };
}
