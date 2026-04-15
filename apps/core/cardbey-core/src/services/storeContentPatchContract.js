/**
 * Canonical contract: dashboard ↔ core for draft store visible-text updates (code_fix → apply).
 * Prefer this over loose oldStr/newStr regex extraction.
 *
 * @typedef {Object} StoreContentPatchV1
 * @property {'store_content_patch'} kind
 * @property {1} version
 * @property {string} targetField - Preview key, e.g. heroTitle, heroSubtitle, bannerText, storeName
 * @property {string} newText - Plain text to apply (authoritative)
 * @property {string} [sourceDescription] - Original user phrase (audit / UI)
 * @property {boolean} [legacyDetector] - True when targetField/newText came from detectStoreContentFix (regex)
 */

export const STORE_CONTENT_PATCH_KIND = 'store_content_patch';
export const STORE_CONTENT_PATCH_VERSION = 1;

/**
 * @param {unknown} v
 * @returns {{ valid: true, patch: StoreContentPatchV1 } | { valid: false }}
 */
export function parseStoreContentPatchV1(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { valid: false };
  const o = /** @type {Record<string, unknown>} */ (v);
  if (o.kind !== STORE_CONTENT_PATCH_KIND) return { valid: false };
  if (o.version !== STORE_CONTENT_PATCH_VERSION) return { valid: false };
  const targetField = typeof o.targetField === 'string' ? o.targetField.trim() : '';
  const newText = typeof o.newText === 'string' ? o.newText.trim() : '';
  if (!targetField || !newText) return { valid: false };
  const sourceDescription =
    typeof o.sourceDescription === 'string' && o.sourceDescription.trim()
      ? o.sourceDescription.trim()
      : undefined;
  const legacyDetector = o.legacyDetector === true;
  /** @type {StoreContentPatchV1} */
  const patch = {
    kind: STORE_CONTENT_PATCH_KIND,
    version: STORE_CONTENT_PATCH_VERSION,
    targetField,
    newText,
    ...(sourceDescription ? { sourceDescription } : {}),
    ...(legacyDetector ? { legacyDetector: true } : {}),
  };
  return { valid: true, patch };
}

/**
 * Build canonical payload from legacy regex detector (until intake emits this directly).
 * @param {string} field
 * @param {string} newText
 * @param {string} [sourceDescription]
 * @returns {StoreContentPatchV1}
 */
export function buildStoreContentPatchV1FromLegacyDetect(field, newText, sourceDescription) {
  const f = String(field || '').trim() || 'heroTitle';
  const t = String(newText || '').trim();
  /** @type {StoreContentPatchV1} */
  const out = {
    kind: STORE_CONTENT_PATCH_KIND,
    version: STORE_CONTENT_PATCH_VERSION,
    targetField: f,
    newText: t,
    legacyDetector: true,
  };
  if (sourceDescription && String(sourceDescription).trim()) {
    out.sourceDescription = String(sourceDescription).trim();
  }
  return out;
}
