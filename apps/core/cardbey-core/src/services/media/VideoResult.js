/**
 * Shared VideoResult schema for multi-source video search.
 *
 * Every video source adapter (Pexels, Pixabay, Coverr, Mixkit, ...) must
 * normalise its provider-specific response into this single shape so the
 * search route can merge results from all sources transparently.
 *
 * Schema (all adapters return objects of this form):
 *   id                   {string}  Stable, source-prefixed-safe id
 *   source               {string}  Provider key: "pexels" | "pixabay" | "coverr" | "mixkit"
 *   title                {string}  Human-readable title / description
 *   thumbnail_url        {string}  Poster / preview image URL
 *   video_url            {string}  Direct playable MP4 URL
 *   duration             {number}  Length in whole seconds (integer)
 *   resolution           {string}  e.g. "HD" | "4K or HD"
 *   license              {string}  License label shown in the UI
 *   attribution_required {boolean} Whether the app must credit the source
 *   tags                 {string[]} Optional keyword tags
 */

/**
 * Error thrown by an adapter when its required credentials are not configured.
 * The UI already surfaces this as "Video source not configured".
 *
 * The merged search route catches this per-adapter so one unconfigured source
 * never breaks the others (it is logged and the source is skipped).
 */
export class VideoSourceNotConfiguredError extends Error {
  /** @param {string} source Provider key (e.g. "pixabay") */
  constructor(source) {
    super(`Video source not configured: ${source}`);
    this.name = 'VideoSourceNotConfiguredError';
    this.code = 'VIDEO_SOURCE_NOT_CONFIGURED';
    this.source = source;
  }
}

/** Ordered list of canonical VideoResult fields. */
export const VIDEO_RESULT_FIELDS = Object.freeze([
  'id',
  'source',
  'title',
  'thumbnail_url',
  'video_url',
  'duration',
  'resolution',
  'license',
  'attribution_required',
  'tags',
]);

/**
 * Derive a resolution label from a pixel width.
 * Shared so adapters classify resolution consistently.
 * @param {number} [width]
 * @returns {"4K or HD" | "HD"}
 */
export function resolutionFromWidth(width) {
  return Number(width) >= 1920 ? '4K or HD' : 'HD';
}

/**
 * Coerce a partial/raw object into a well-formed VideoResult.
 * Adapters build the raw object; this enforces types and defaults so the
 * merged output is uniform regardless of source quirks.
 *
 * @param {Partial<Record<string, unknown>>} raw
 * @returns {{
 *   id: string, source: string, title: string,
 *   thumbnail_url: string, video_url: string, duration: number,
 *   resolution: string, license: string, attribution_required: boolean,
 *   tags: string[]
 * }}
 */
export function normalizeVideoResult(raw = {}) {
  const durationNum = Number(raw.duration);
  return {
    id: raw.id != null ? String(raw.id) : '',
    source: raw.source != null ? String(raw.source) : '',
    title: raw.title != null ? String(raw.title) : '',
    thumbnail_url: raw.thumbnail_url != null ? String(raw.thumbnail_url) : '',
    video_url: raw.video_url != null ? String(raw.video_url) : '',
    duration: Number.isFinite(durationNum) ? Math.round(durationNum) : 0,
    resolution: raw.resolution != null ? String(raw.resolution) : 'HD',
    license: raw.license != null ? String(raw.license) : '',
    attribution_required: Boolean(raw.attribution_required),
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t)) : [],
  };
}

/**
 * True when a normalised result is usable (has an id and a playable url).
 * @param {{ video_url?: string, id?: string }} result
 */
export function isValidVideoResult(result) {
  return Boolean(result && result.id && result.video_url);
}
