/**
 * Single hero resolver for PublishedBusinessArtifact — used at publish and read time.
 */

import { readCanonicalHeroFromPreview } from '../draftStore/draftPreviewHeroSync.js';
import { resolveHeroMediaFromBusiness } from '../../utils/heroMediaResolve.js';
import { isVideoMediaUrl } from '../../utils/heroMediaResolve.js';
import { parseJsonBlob } from './parseJsonBlob.js';

const GENERIC_HERO_SOURCE = 'projection.hero';

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

  let imageUrl = null;
  let videoUrl = null;
  let posterUrl = null;
  let headline = null;
  let subheadline = null;
  let overlay = null;
  let source = 'none';

  if (rawPreview) {
    const fromDraft = readCanonicalHeroFromPreview(rawPreview);
    imageUrl = fromDraft.heroImage;
    videoUrl = fromDraft.heroVideo;
    source = 'draft.preview';
  }

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
      source = source === 'none' ? 'miniWebsite.hero' : `${source}+miniWebsite.hero`;
    }
    if (sectionImage) {
      imageUrl = imageUrl || sectionImage;
      posterUrl = posterUrl || sectionImage;
    }
    headline = typeof hc.headline === 'string' ? hc.headline.trim() : headline;
    subheadline = typeof hc.subheadline === 'string' ? hc.subheadline.trim() : subheadline;
    overlay = hc.overlay ?? overlay;
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
