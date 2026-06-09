/**
 * Single hero resolver for PublishedBusinessArtifact — used at publish and read time.
 */

import { resolveCanonicalHeroMediaFromPreview } from '../draftStore/draftPreviewHeroSync.js';
import { resolveHeroMediaFromBusiness } from '../../utils/heroMediaResolve.js';
import { isVideoMediaUrl } from '../../utils/heroMediaResolve.js';
import { parseJsonBlob } from './parseJsonBlob.js';

const GENERIC_HERO_SOURCE = 'projection.hero';

function readHeroSectionCopy(miniWebsite) {
  const heroSection = Array.isArray(miniWebsite?.sections)
    ? miniWebsite.sections.find((s) => s && s.type === 'hero')
    : null;
  const hc = heroSection?.content && typeof heroSection.content === 'object' ? heroSection.content : null;
  if (!hc) return { headline: null, subheadline: null, overlay: null, hasSection: false };
  return {
    headline: typeof hc.headline === 'string' ? hc.headline.trim() : null,
    subheadline: typeof hc.subheadline === 'string' ? hc.subheadline.trim() : null,
    overlay: hc.overlay ?? null,
    hasSection: true,
  };
}

/**
 * @param {{ business?: object, draftPreview?: object, miniWebsite?: object|null }} input
 */
export function resolveHeroForProjection(input = {}) {
  const business = input.business ?? null;
  const rawPreview = input.draftPreview ?? null;
  const miniWebsite =
    input.miniWebsite ??
    parseJsonBlob(business?.stylePreferences)?.miniWebsite ??
    rawPreview?.website ??
    parseJsonBlob(rawPreview?.stylePreferences)?.miniWebsite ??
    null;

  const { headline, subheadline, overlay, hasSection } = readHeroSectionCopy(miniWebsite);
  let source = hasSection ? 'miniWebsite.hero' : 'none';

  // Draft preview is authoritative on republish — do not inherit stale business meta/section posters.
  if (rawPreview) {
    const canonical = resolveCanonicalHeroMediaFromPreview(rawPreview);
    if (canonical.mediaType === 'video' && canonical.videoUrl) {
      return {
        type: 'video',
        imageUrl: canonical.posterUrl || null,
        videoUrl: canonical.videoUrl,
        posterUrl: canonical.posterUrl || null,
        headline,
        subheadline,
        overlay,
        source: source === 'none' ? 'draft.preview' : `draft.preview+${source}`,
      };
    }
    if (canonical.mediaType === 'image' && canonical.imageUrl) {
      return {
        type: 'image',
        imageUrl: canonical.imageUrl,
        videoUrl: null,
        posterUrl: null,
        headline,
        subheadline,
        overlay,
        source: source === 'none' ? 'draft.preview' : `draft.preview+${source}`,
      };
    }
  }

  let imageUrl = null;
  let videoUrl = null;
  let posterUrl = null;

  const heroSection = Array.isArray(miniWebsite?.sections)
    ? miniWebsite.sections.find((s) => s && s.type === 'hero')
    : null;
  const hc = heroSection?.content && typeof heroSection.content === 'object' ? heroSection.content : null;
  if (hc) {
    const sectionVideo =
      (typeof hc.videoUrl === 'string' && hc.videoUrl.trim()) ||
      (hc.type === 'video' && typeof hc.url === 'string' ? hc.url.trim() : null) ||
      null;
    const sectionImage =
      (typeof hc.imageUrl === 'string' && hc.imageUrl.trim()) ||
      (typeof hc.backgroundImage === 'string' && hc.backgroundImage.trim()) ||
      (typeof hc.url === 'string' && !isVideoMediaUrl(hc.url) ? hc.url.trim() : null) ||
      null;
    if (sectionVideo) {
      videoUrl = videoUrl || sectionVideo;
      source = source === 'none' ? 'miniWebsite.hero' : `${source}+video`;
    }
    if (sectionImage) {
      imageUrl = imageUrl || sectionImage;
      posterUrl = posterUrl || sectionImage;
    }
  }

  if (business) {
    const media = resolveHeroMediaFromBusiness(business);
    if (media.heroVideo) {
      videoUrl = videoUrl || media.heroVideo;
      source = source === 'none' ? 'business.stylePreferences' : source;
    }
    if (media.heroImage) {
      imageUrl = imageUrl || media.heroImage;
      posterUrl = posterUrl || media.heroImage;
    }
    if (!videoUrl && !imageUrl && media.heroUrl) {
      if (isVideoMediaUrl(media.heroUrl)) videoUrl = media.heroUrl;
      else imageUrl = media.heroUrl;
    }
  }

  if (videoUrl && (!posterUrl || isVideoMediaUrl(posterUrl))) {
    posterUrl = imageUrl && !isVideoMediaUrl(imageUrl) ? imageUrl : posterUrl;
  }

  const type = videoUrl ? 'video' : imageUrl ? 'image' : 'none';

  return {
    type,
    imageUrl: imageUrl || null,
    videoUrl: videoUrl || null,
    posterUrl: posterUrl || (imageUrl && !isVideoMediaUrl(imageUrl) ? imageUrl : null),
    headline,
    subheadline,
    overlay,
    source: source || GENERIC_HERO_SOURCE,
  };
}
