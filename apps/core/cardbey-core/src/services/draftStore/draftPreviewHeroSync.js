/**
 * Canonical hero fields on draft preview + mini-website hero section sync.
 * Used by patchDraftPreview (editor saves) and publishDraft (draft → Business).
 */

const VIDEO_EXT = /\.(mp4|webm|mov)(\?|$)/i;

function trimStr(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
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

  const heroVideo =
    trimStr(meta.profileHeroVideoUrl) ??
    trimStr(meta.heroVideo) ??
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
  merged.meta = meta;
}
