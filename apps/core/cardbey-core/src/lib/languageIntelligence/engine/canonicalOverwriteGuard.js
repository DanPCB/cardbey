/**
 * Runtime guard: translation persistence must never touch canonical columns.
 */

/** Fields that are canonical business content — never written by translation paths. */
export const CANONICAL_CONTENT_FIELDS = Object.freeze([
  'name',
  'description',
  'category',
  'tagline',
  'heroText',
  'title',
  'body',
  'message',
  'content',
]);

/**
 * @param {unknown} updateData  Prisma-style update object
 * @param {string} [context]
 * @returns {{ translations: Record<string, Record<string, string>> }}
 */
export function assertTranslationsOnlyPatch(updateData, context = 'translation') {
  if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) {
    throw new Error(`[languageIntelligence] ${context}: update patch must be an object`);
  }
  const data = /** @type {Record<string, unknown>} */ (updateData);
  const keys = Object.keys(data);
  for (const key of keys) {
    if (key === 'translations') continue;
    if (CANONICAL_CONTENT_FIELDS.includes(key)) {
      throw new Error(
        `[languageIntelligence] ${context}: refused canonical overwrite of "${key}". ` +
          'Translation must write translations layer only.',
      );
    }
  }
  if (!('translations' in data)) {
    throw new Error(`[languageIntelligence] ${context}: patch must include translations`);
  }
  return /** @type {{ translations: Record<string, Record<string, string>> }} */ (data);
}

/**
 * True if a patch would mutate canonical content fields.
 * @param {unknown} updateData
 */
export function wouldOverwriteCanonical(updateData) {
  if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) return false;
  return Object.keys(updateData).some((k) => CANONICAL_CONTENT_FIELDS.includes(k));
}
