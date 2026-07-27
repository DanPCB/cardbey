/**
 * Hero legacy write guard (dev/test only).
 *
 * Canonical hero media must flow through writeCanonicalHeroMediaToPreview() (or the
 * guarded pipeline helper applyPipelineGeneratedHeroImage / publish snapshot rehydrate).
 * No other writer may set heroImageUrl / heroVideoUrl / heroMediaType directly.
 *
 * This module is a SAFETY NET, not a behavior change:
 *   - In production it is a no-op.
 *   - In dev/test it logs `[hero-legacy-blocked] direct legacy hero write blocked`.
 *   - When HERO_LEGACY_STRICT=1 it throws, so regression tests can assert that no
 *     legacy write path remains outside the canonical writer.
 *
 * See docs/HERO_LEGACY_RETIREMENT.md.
 */

export const LEGACY_HERO_FIELDS = Object.freeze([
  'heroImageUrl',
  'heroVideoUrl',
  'heroVideo',
  'heroMediaType',
  'heroPosterUrl',
  'heroPoster',
]);

/** Writers explicitly allowed to set legacy mirror fields (the canonical boundary). */
export const CANONICAL_HERO_WRITERS = Object.freeze([
  'writeCanonicalHeroMediaToPreview',
  'applyPipelineGeneratedHeroImage',
  'buildHeroPreviewPatchFromUrls',
  'snapshotToPreviewShape',
]);

const STRICT_FLAG = 'HERO_LEGACY_STRICT';

/** True only in non-production runtimes (dev + test). */
function isGuardActive() {
  return process.env.NODE_ENV !== 'production';
}

/** True when the guard should throw instead of warn. */
function isStrict() {
  return process.env[STRICT_FLAG] === '1' || process.env[STRICT_FLAG] === 'true';
}

/**
 * Returns the legacy hero fields present on a patch/preview object.
 * @param {object} obj
 * @returns {string[]}
 */
export function detectLegacyHeroFields(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return LEGACY_HERO_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(obj, f));
}

/**
 * Signal that a legacy hero field was written outside the canonical writer.
 * Logs in dev/test; throws when HERO_LEGACY_STRICT=1.
 *
 * @param {string} source - human-readable writer id (e.g. 'draftStoreService.buildPreview')
 * @param {object} [meta]
 */
export function warnDirectLegacyHeroWrite(source, meta = {}) {
  if (!isGuardActive()) return;
  const message = '[hero-legacy-blocked] direct legacy hero write blocked';
  const payload = { source: source || 'unknown', ...meta };
  if (isStrict()) {
    const err = new Error(`${message} (${payload.source})`);
    err.heroLegacyBlocked = true;
    err.detail = payload;
    throw err;
  }
  // eslint-disable-next-line no-console
  console.warn(message, payload);
}

/**
 * Guard helper for legacy writers being migrated: call before a direct write so the
 * write is logged/blocked unless performed by a canonical writer.
 *
 * @param {string} source
 * @param {object} patchOrPreview - object that may contain legacy hero fields
 * @param {object} [meta]
 * @returns {string[]} legacy fields that were present
 */
export function guardLegacyHeroWrite(source, patchOrPreview, meta = {}) {
  const fields = detectLegacyHeroFields(patchOrPreview);
  if (fields.length && !CANONICAL_HERO_WRITERS.includes(source)) {
    warnDirectLegacyHeroWrite(source, { ...meta, fields });
  }
  return fields;
}

/**
 * Test helper: run `fn` under strict mode and assert it performs no direct legacy
 * hero write. Restores the previous flag value afterwards.
 *
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function assertNoDirectLegacyHeroWrite(fn) {
  const prev = process.env[STRICT_FLAG];
  process.env[STRICT_FLAG] = '1';
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env[STRICT_FLAG];
    else process.env[STRICT_FLAG] = prev;
  }
}
