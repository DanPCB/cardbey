/**
 * Storage canonicalization for hero media URLs.
 * Converts localhost / LAN absolute URLs to relative /uploads/... paths before DB writes.
 */

import { normalizeMediaUrlForStorage } from '../../utils/publicUrl.js';

function trimStr(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * @param {string|null|undefined} url
 * @returns {string|null|undefined}
 */
export function normalizeMediaUrlField(url) {
  if (url == null) return url;
  if (typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return normalizeMediaUrlForStorage(trimmed, null);
}

function normalizeHeroContentFields(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return content;
  const out = { ...content };
  for (const key of ['videoUrl', 'imageUrl', 'posterUrl', 'url', 'backgroundImage']) {
    if (typeof out[key] === 'string') out[key] = normalizeMediaUrlField(out[key]);
  }
  return out;
}

function normalizeWebsiteHeroSections(website) {
  if (!website || typeof website !== 'object' || Array.isArray(website)) return website;
  if (!Array.isArray(website.sections)) return website;
  return {
    ...website,
    sections: website.sections.map((sec) => {
      if (!sec || sec.type !== 'hero' || !sec.content || typeof sec.content !== 'object') return sec;
      return { ...sec, content: normalizeHeroContentFields(sec.content) };
    }),
  };
}

/**
 * Normalize hero URL fields on an incoming preview patch (before merge).
 * @param {object} patch
 * @returns {object}
 */
export function normalizeHeroPreviewPatchForStorage(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = { ...patch };
  for (const key of ['heroVideoUrl', 'heroVideo', 'heroImageUrl', 'heroPosterUrl', 'heroPoster']) {
    if (typeof out[key] === 'string') out[key] = normalizeMediaUrlField(out[key]);
  }
  if (out.hero !== undefined) out.hero = normalizeHeroContentFields(out.hero);
  if (out.website !== undefined) out.website = normalizeWebsiteHeroSections(out.website);
  return out;
}

/**
 * Normalize all hero media fields on a merged draft preview (post-merge boundary; mutates in place).
 * @param {object} preview
 * @returns {object}
 */
export function normalizeHeroFieldsInPreview(preview) {
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return preview;

  for (const key of ['heroVideoUrl', 'heroVideo', 'heroImageUrl', 'heroPosterUrl', 'heroPoster']) {
    if (typeof preview[key] === 'string') preview[key] = normalizeMediaUrlField(preview[key]);
  }
  if (preview.hero !== undefined) preview.hero = normalizeHeroContentFields(preview.hero);
  if (preview.stylePreferences && typeof preview.stylePreferences === 'object') {
    preview.stylePreferences = normalizeStylePreferencesHeroForStorage(preview.stylePreferences);
  }
  if (preview.website) preview.website = normalizeWebsiteHeroSections(preview.website);

  return preview;
}

/**
 * @param {object} stylePrefs
 * @returns {object}
 */
export function normalizeStylePreferencesHeroForStorage(stylePrefs) {
  if (!stylePrefs || typeof stylePrefs !== 'object' || Array.isArray(stylePrefs)) return stylePrefs;
  const out = { ...stylePrefs };
  for (const key of ['heroVideo', 'heroImage', 'heroVideoUrl', 'heroImageUrl']) {
    if (typeof out[key] === 'string') out[key] = normalizeMediaUrlField(out[key]);
  }
  if (out.miniWebsite) out.miniWebsite = normalizeWebsiteHeroSections(out.miniWebsite);
  return out;
}

/**
 * Normalize hero media on a PublishedBusinessArtifact before projectionJson / index writes.
 * @param {object} projection
 * @returns {object}
 */
export function normalizeProjectionHeroForStorage(projection) {
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) return projection;
  const out = { ...projection };
  if (out.hero && typeof out.hero === 'object') {
    const hero = { ...out.hero };
    for (const key of ['videoUrl', 'imageUrl', 'posterUrl']) {
      if (typeof hero[key] === 'string') hero[key] = normalizeMediaUrlField(hero[key]);
    }
    out.hero = hero;
  }
  if (out.website) out.website = normalizeWebsiteHeroSections(out.website);
  return out;
}

/**
 * Extract normalized hero video URL from preview/projection sources for index column sync.
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
export function normalizedHeroVideoIndexUrl(url) {
  const trimmed = trimStr(url);
  return trimmed ? normalizeMediaUrlField(trimmed) : null;
}
