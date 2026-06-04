/**
 * Canonical hero fields on draft preview + mini-website hero section sync.
 * Used by patchDraftPreview (editor saves) and publishDraft (draft → Business).
 */

const VIDEO_EXT = /\.(mp4|webm|mov)(\?|$)/i;

function trimStr(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** @param {object} rawPreview */
export function getExistingVideoUrlFromPreview(rawPreview) {
  if (!rawPreview || typeof rawPreview !== 'object') return null;
  const heroObj =
    rawPreview.hero && typeof rawPreview.hero === 'object' && !Array.isArray(rawPreview.hero)
      ? rawPreview.hero
      : {};
  const meta =
    rawPreview.meta && typeof rawPreview.meta === 'object' && !Array.isArray(rawPreview.meta)
      ? rawPreview.meta
      : {};
  return (
    trimStr(rawPreview.heroVideoUrl) ??
    trimStr(rawPreview.heroVideo) ??
    trimStr(heroObj.videoUrl) ??
    (heroObj.type === 'video' ? trimStr(heroObj.url) : null) ??
    trimStr(meta.profileHeroVideoUrl) ??
    null
  );
}

/**
 * User explicitly chose an image hero (upload / editor) — may clear video fields.
 * @param {object} incoming
 */
export function isExplicitUserImageHeroReplace(incoming) {
  if (!incoming || typeof incoming !== 'object') return false;
  const hero = incoming.hero && typeof incoming.hero === 'object' ? incoming.hero : null;
  const hasNewImage = trimStr(incoming.heroImageUrl) || trimStr(hero?.imageUrl) || trimStr(hero?.url);
  if (!hasNewImage || VIDEO_EXT.test(hasNewImage)) return false;
  const declaresImage = incoming.heroMediaType === 'image' || hero?.type === 'image';
  const clearsVideo =
    incoming.heroVideo === null ||
    incoming.heroVideoUrl === null ||
    hero?.videoUrl === null;
  return declaresImage && clearsVideo;
}

/**
 * True when patch intentionally replaces video with image (user upload / selection).
 * @param {object} [opts]
 */
export function isAllowedToReplaceVideoWithImage(opts = {}) {
  if (opts.allowReplaceVideoWithImage === true) return true;
  const intent = opts.heroWriteIntent;
  if (
    intent === 'image_upload' ||
    intent === 'image_select' ||
    intent === 'replace_video_with_image'
  ) {
    return true;
  }
  if (opts.incoming && isExplicitUserImageHeroReplace(opts.incoming)) return true;
  return false;
}

function incomingPatchDeclaresVideo(incoming) {
  if (!incoming || typeof incoming !== 'object') return false;
  const hero = incoming.hero && typeof incoming.hero === 'object' ? incoming.hero : null;
  if (incoming.heroMediaType === 'video' || hero?.type === 'video') return true;
  if (trimStr(incoming.heroVideoUrl) || trimStr(incoming.heroVideo)) return true;
  if (trimStr(hero?.videoUrl)) return true;
  const url = trimStr(hero?.url);
  if (url && VIDEO_EXT.test(url)) return true;
  return false;
}

/**
 * Image-only patch: sets image fields and/or clears video without supplying a new video URL.
 * @param {object} incoming
 */
export function isImageOnlyHeroIncomingPatch(incoming) {
  if (!incoming || typeof incoming !== 'object') return false;
  if (incomingPatchDeclaresVideo(incoming)) return false;

  const hero = incoming.hero && typeof incoming.hero === 'object' ? incoming.hero : null;
  const setsImage =
    incoming.heroImageUrl !== undefined ||
    incoming.hero?.imageUrl !== undefined ||
    (hero?.url !== undefined && hero?.type !== 'video') ||
    incoming.heroMediaType === 'image' ||
    hero?.type === 'image';

  const clearsVideo =
    incoming.heroVideo === null ||
    incoming.heroVideoUrl === null ||
    incoming.heroPosterUrl === null ||
    incoming.heroMediaType === 'image' ||
    hero?.videoUrl === null ||
    hero?.type === 'image';

  if (!setsImage && !clearsVideo) return false;
  if (clearsVideo) return true;
  return setsImage && !incomingPatchDeclaresVideo(incoming);
}

/**
 * Strip image-only hero fields from an incoming patch when an existing video hero must be preserved.
 *
 * @param {object} existingPreview
 * @param {object} incomingPatch
 * @param {object} [opts]
 * @param {string} [opts.writer]
 * @param {string} [opts.draftId]
 * @param {string} [opts.storeId]
 * @returns {{ incoming: object, protected: boolean }}
 */
export function protectVideoHeroFromImageOnlyOverwrite(existingPreview, incomingPatch, opts = {}) {
  const incoming = incomingPatch && typeof incomingPatch === 'object' ? { ...incomingPatch } : {};
  const existingVideo = getExistingVideoUrlFromPreview(existingPreview);
  if (!existingVideo) return { incoming, protected: false };
  if (isAllowedToReplaceVideoWithImage({ ...opts, incoming })) return { incoming, protected: false };
  if (!isImageOnlyHeroIncomingPatch(incoming)) return { incoming, protected: false };

  const sanitized = { ...incoming };
  if (sanitized.heroMediaType === 'image') delete sanitized.heroMediaType;
  if (sanitized.heroVideo === null) delete sanitized.heroVideo;
  if (sanitized.heroVideoUrl === null) delete sanitized.heroVideoUrl;
  if (sanitized.heroPoster === null) delete sanitized.heroPoster;
  if (sanitized.heroPosterUrl === null) delete sanitized.heroPosterUrl;

  if (sanitized.hero && typeof sanitized.hero === 'object') {
    const h = { ...sanitized.hero };
    const onlyImageOverwrite =
      (h.type === 'image' || trimStr(h.imageUrl)) &&
      !trimStr(h.videoUrl) &&
      h.type !== 'video';
    if (onlyImageOverwrite) {
      delete sanitized.hero;
    } else {
      if (h.type === 'image') delete h.type;
      if (h.videoUrl === null) delete h.videoUrl;
      if (Object.keys(h).length) sanitized.hero = h;
      else delete sanitized.hero;
    }
  }

  if (sanitized.heroImageUrl !== undefined && !incomingPatchDeclaresVideo(sanitized)) {
    delete sanitized.heroImageUrl;
  }

  return { incoming: sanitized, protected: true };
}

/**
 * Pipeline / QA / generateDraft: apply generated still hero only when no user video exists.
 * @param {object} preview - mutates
 * @param {string|null} heroImageUrl
 * @param {object} [meta]
 * @returns {boolean} true when image hero was applied
 */
export function applyPipelineGeneratedHeroImage(preview, heroImageUrl, meta = {}) {
  if (!preview || typeof preview !== 'object') return false;
  const imageUrl = trimStr(heroImageUrl);
  if (!imageUrl) return false;
  const existingVideo = getExistingVideoUrlFromPreview(preview);
  if (existingVideo) {
    return false;
  }
  preview.hero = { imageUrl };
  preview.heroImageUrl = imageUrl;
  preview.heroMediaType = 'image';
  preview.heroVideoUrl = null;
  preview.heroVideo = null;
  return true;
}

/**
 * Copy video hero fields from source preview onto target (e.g. regenerate keeps user video).
 * @param {object} target
 * @param {object} source
 */
export function copyVideoHeroFieldsToPreview(target, source) {
  if (!target || !source) return false;
  const videoUrl = getExistingVideoUrlFromPreview(source);
  if (!videoUrl) return false;
  const canonical = resolveCanonicalHeroMediaFromPreview({
    ...source,
    heroVideoUrl: videoUrl,
    heroMediaType: 'video',
  });
  if (canonical.mediaType !== 'video') return false;
  writeCanonicalHeroMediaToPreview(target, canonical);
  return true;
}

/**
 * @param {object} rawPreview - DraftStore.preview JSON
 * @returns {{ heroImage: string|null, heroVideo: string|null, isVideo: boolean }}
 */
export function readCanonicalHeroFromPreview(rawPreview) {
  const meta =
    rawPreview?.meta && typeof rawPreview.meta === 'object' && !Array.isArray(rawPreview.meta)
      ? rawPreview.meta
      : {};
  const heroObj =
    rawPreview?.hero && typeof rawPreview.hero === 'object' && !Array.isArray(rawPreview.hero)
      ? rawPreview.hero
      : {};

  const explicitImage =
    rawPreview?.heroMediaType === 'image' || heroObj.type === 'image';

  const heroVideo = explicitImage
    ? null
    : trimStr(meta.profileHeroVideoUrl) ??
      trimStr(meta.heroVideo) ??
      trimStr(rawPreview?.heroVideoUrl) ??
      trimStr(rawPreview?.heroVideo) ??
      trimStr(heroObj.videoUrl) ??
      null;

  const heroImage =
    trimStr(meta.profileHeroUrl) ??
    trimStr(heroObj.imageUrl) ??
    trimStr(heroObj.url) ??
    trimStr(rawPreview?.heroImageUrl) ??
    trimStr(meta.heroImage) ??
    trimStr(rawPreview?.heroImage) ??
    null;

  const isVideo =
    heroObj.type === 'video' ||
    !!heroVideo ||
    (heroImage != null && VIDEO_EXT.test(heroImage));

  return { heroImage, heroVideo, isVideo };
}

/**
 * V1 canonical hero resolver: video always wins over image/poster.
 * Legacy `preview.hero.imageUrl/url` is treated as fallback image only and must never override video.
 *
 * Shape:
 *  - mediaType: 'image' | 'video'
 *  - imageUrl: canonical image (only when mediaType === 'image')
 *  - videoUrl: canonical video (only when mediaType === 'video')
 *  - posterUrl: optional poster for video (never replaces videoUrl)
 *
 * @param {object} rawPreview
 * @returns {{ mediaType: 'image'|'video', imageUrl: string|null, videoUrl: string|null, posterUrl: string|null }}
 */
export function resolveCanonicalHeroMediaFromPreview(rawPreview) {
  const heroObj =
    rawPreview?.hero && typeof rawPreview.hero === 'object' && !Array.isArray(rawPreview.hero)
      ? rawPreview.hero
      : {};

  const heroMediaType =
    typeof rawPreview?.heroMediaType === 'string' && (rawPreview.heroMediaType === 'image' || rawPreview.heroMediaType === 'video')
      ? rawPreview.heroMediaType
      : null;

  let videoUrl =
    trimStr(rawPreview?.heroVideoUrl) ??
    trimStr(rawPreview?.heroVideo) ??
    trimStr(heroObj.videoUrl) ??
    (heroObj.type === 'video' ? trimStr(heroObj.url) : null) ??
    null;

  const explicitImage =
    (heroMediaType === 'image' || heroObj.type === 'image') && !videoUrl;

  // Image candidates (legacy + canonical). If we have a video, image becomes poster-only.
  const legacyImage =
    trimStr(heroObj.imageUrl) ??
    (heroObj.type !== 'video' ? trimStr(heroObj.url) : null) ??
    trimStr(rawPreview?.heroImageUrl) ??
    null;

  const heroPosterUrl =
    trimStr(rawPreview?.heroPosterUrl) ??
    trimStr(rawPreview?.heroPoster) ??
    null;

  const isVideo = Boolean(videoUrl) || (heroMediaType === 'video');

  if (isVideo) {
    const poster =
      heroPosterUrl ??
      (legacyImage && !VIDEO_EXT.test(legacyImage) ? legacyImage : null);
    return { mediaType: 'video', imageUrl: null, videoUrl: videoUrl || null, posterUrl: poster };
  }

  return { mediaType: 'image', imageUrl: legacyImage, videoUrl: null, posterUrl: null };
}

/**
 * API-facing hero fields for temp draft / public responses (heroImageUrl, heroVideo, heroMediaType).
 * @param {object} rawPreview
 * @returns {{ heroImageUrl: string|null, heroVideo: string|null, heroMediaType: 'image'|'video' }}
 */
export function resolveCanonicalHeroApiFields(rawPreview) {
  const canonical = resolveCanonicalHeroMediaFromPreview(rawPreview);
  if (canonical.mediaType === 'video') {
    return {
      heroImageUrl: canonical.posterUrl ?? null,
      heroVideo: canonical.videoUrl,
      heroMediaType: 'video',
    };
  }
  return {
    heroImageUrl: canonical.imageUrl,
    heroVideo: null,
    heroMediaType: 'image',
  };
}

/**
 * Write canonical hero fields into preview, without removing legacy fields.
 * This is intentionally conservative: it only sets canonical keys + `preview.hero` envelope.
 *
 * @param {object} mergedPreview
 * @param {{ mediaType: 'image'|'video', imageUrl: string|null, videoUrl: string|null, posterUrl: string|null }} canonical
 */
export function writeCanonicalHeroMediaToPreview(mergedPreview, canonical) {
  if (!mergedPreview || typeof mergedPreview !== 'object' || !canonical) return;
  const mediaType = canonical.mediaType === 'video' ? 'video' : 'image';
  const imageUrl = trimStr(canonical.imageUrl);
  const videoUrl = trimStr(canonical.videoUrl);
  const posterUrl = trimStr(canonical.posterUrl);

  mergedPreview.heroMediaType = mediaType;
  mergedPreview.heroVideoUrl = mediaType === 'video' ? videoUrl : null;
  mergedPreview.heroVideo = mediaType === 'video' ? videoUrl : null;
  mergedPreview.heroPosterUrl = mediaType === 'video' ? posterUrl : null;
  mergedPreview.heroPoster = mediaType === 'video' ? posterUrl : null;

  // Maintain a top-level heroImageUrl for legacy readers:
  // - image hero → imageUrl
  // - video hero → posterUrl when present, otherwise keep existing heroImageUrl (do not set to the video url)
  if (mediaType === 'image' && imageUrl) {
    mergedPreview.heroImageUrl = imageUrl;
  } else if (mediaType === 'video') {
    // Video wins — clear stale image primary; poster only when explicit.
    mergedPreview.heroImageUrl = posterUrl ?? null;
  }

  const existingHero =
    mergedPreview.hero && typeof mergedPreview.hero === 'object' && !Array.isArray(mergedPreview.hero)
      ? { ...mergedPreview.hero }
      : {};

  mergedPreview.hero = {
    ...existingHero,
    type: mediaType,
    ...(mediaType === 'video'
      ? {
          videoUrl: videoUrl || existingHero.videoUrl || undefined,
          url: videoUrl || existingHero.url || undefined,
          imageUrl: posterUrl ?? null,
          posterUrl: posterUrl ?? null,
        }
      : {
          videoUrl: undefined,
          url: imageUrl || existingHero.url || undefined,
          imageUrl: imageUrl || existingHero.imageUrl || undefined,
        }),
  };
}

/**
 * Merge hero/video into mini-website hero section (mutates miniWebsite).
 * @param {object} miniWebsite
 * @param {object} rawPreview
 * @returns {object} miniWebsite
 */
export function applyCanonicalHeroToMiniWebsite(miniWebsite, rawPreview) {
  if (!miniWebsite || typeof miniWebsite !== 'object') return miniWebsite;
  const { heroImage, heroVideo, isVideo } = readCanonicalHeroFromPreview(rawPreview);
  if (!heroImage && !heroVideo) return miniWebsite;

  const sections = Array.isArray(miniWebsite.sections) ? [...miniWebsite.sections] : [];
  const hi = sections.findIndex((s) => s && s.type === 'hero');
  const posterUrl =
    heroImage && (!isVideo || !VIDEO_EXT.test(heroImage)) ? heroImage : null;
  const videoUrl = heroVideo || (isVideo && heroImage ? heroImage : null);

  const contentPatch = isVideo
    ? {
        type: 'video',
        ...(videoUrl ? { videoUrl } : {}),
        ...(posterUrl ? { imageUrl: posterUrl, url: posterUrl, backgroundImage: posterUrl } : {}),
        autoplay: true,
        muted: true,
        loop: true,
      }
    : {
        type: 'image',
        ...(heroImage ? { imageUrl: heroImage, url: heroImage, backgroundImage: heroImage } : {}),
      };

  if (hi >= 0) {
    const prev = sections[hi];
    const prevContent =
      prev.content && typeof prev.content === 'object' && !Array.isArray(prev.content)
        ? { ...prev.content }
        : {};
    sections[hi] = { ...prev, content: { ...prevContent, ...contentPatch } };
  } else {
    sections.unshift({ type: 'hero', content: contentPatch });
  }
  miniWebsite.sections = sections;
  return miniWebsite;
}

/**
 * Prefer editor `website` over generated `stylePreferences.miniWebsite`, then apply canonical hero.
 * @param {object} rawPreview
 * @returns {object|null}
 */
export function resolveMiniWebsiteForPublish(rawPreview) {
  const draftStylePrefs =
    rawPreview?.stylePreferences && typeof rawPreview.stylePreferences === 'object'
      ? rawPreview.stylePreferences
      : {};
  const fromStyle =
    draftStylePrefs?.miniWebsite && typeof draftStylePrefs.miniWebsite === 'object'
      ? draftStylePrefs.miniWebsite
      : null;
  const fromWebsite =
    rawPreview?.website && typeof rawPreview.website === 'object' ? rawPreview.website : null;

  let base = null;
  if (fromWebsite) {
    base = JSON.parse(JSON.stringify(fromWebsite));
  } else if (fromStyle) {
    base = JSON.parse(JSON.stringify(fromStyle));
  }
  if (!base) return null;
  if (!Array.isArray(base.sections)) base.sections = [];
  applyCanonicalHeroToMiniWebsite(base, rawPreview);
  return base;
}

/**
 * Ensure preview.website hero section matches top-level hero fields (patch path).
 * @param {object} merged - draft preview after merge
 */
export function syncHeroFieldsIntoPreviewWebsite(merged) {
  if (!merged || typeof merged !== 'object') return;
  const { heroImage, heroVideo } = readCanonicalHeroFromPreview(merged);
  if (!heroImage && !heroVideo) return;

  if (!merged.website || typeof merged.website !== 'object') {
    merged.website = { sections: [], theme: {} };
  }
  applyCanonicalHeroToMiniWebsite(merged.website, merged);

  const draftStylePrefs =
    merged.stylePreferences && typeof merged.stylePreferences === 'object' && !Array.isArray(merged.stylePreferences)
      ? { ...merged.stylePreferences }
      : null;
  if (draftStylePrefs?.miniWebsite && typeof draftStylePrefs.miniWebsite === 'object') {
    const miniWebsiteCopy = JSON.parse(JSON.stringify(draftStylePrefs.miniWebsite));
    applyCanonicalHeroToMiniWebsite(miniWebsiteCopy, merged);
    merged.stylePreferences = { ...draftStylePrefs, miniWebsite: miniWebsiteCopy };
  }

  const meta =
    merged.meta && typeof merged.meta === 'object' && !Array.isArray(merged.meta)
      ? { ...merged.meta }
      : {};
  if (heroImage && !VIDEO_EXT.test(heroImage)) meta.profileHeroUrl = heroImage;
  else if (heroImage) meta.profileHeroUrl = heroImage;
  if (heroVideo) meta.profileHeroVideoUrl = heroVideo;
  else delete meta.profileHeroVideoUrl;
  merged.meta = meta;
}
