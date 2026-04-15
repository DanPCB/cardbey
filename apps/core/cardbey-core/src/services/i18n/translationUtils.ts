/**
 * Translation Utilities
 * 
 * Helper functions for working with translation fields in Prisma models.
 * 
 * Translation structure:
 * {
 *   "en": { "name": "...", "description": "...", "category": "..." },
 *   "vi": { "name": "...", "description": "...", "category": "..." }
 * }
 * 
 * The original fields (name, description, etc.) are the authoritative source language content.
 * Translations are always derived by AI or manual editing, keyed by language code.
 */

/**
 * Get a translated field value, falling back to the original field if translation is not available.
 * 
 * @param model - The model object with translations and original fields
 * @param fieldName - The name of the field to get (e.g., "name", "description", "category")
 * @param lang - Language code (e.g., "en", "vi"). If not provided or translation missing, returns original field.
 * @returns The translated value or the original field value
 */
export function getTranslatedField<T extends Record<string, any>>(
  model: T,
  fieldName: string,
  lang?: string
): string | null {
  // If no language specified, return original field
  if (!lang) {
    return model[fieldName] ?? null;
  }

  // Try to get translation
  const translations = model.translations as Record<string, Record<string, string>> | null | undefined;
  if (translations && typeof translations === 'object') {
    const langTranslations = translations[lang];
    if (langTranslations && typeof langTranslations === 'object' && fieldName in langTranslations) {
      const translatedValue = langTranslations[fieldName];
      if (translatedValue != null) {
        return translatedValue;
      }
    }
  }

  // Fall back to original field
  return model[fieldName] ?? null;
}

/**
 * Create an update object for Prisma that merges new translations with existing ones.
 * 
 * @param model - The current model object (to read existing translations)
 * @param lang - Language code (e.g., "en", "vi")
 * @param values - Object with field names and their translated values (e.g., { name: "...", description: "..." })
 * @returns An object ready to be passed to Prisma update() with merged translations
 * 
 * @example
 * const updateData = setTranslatedFields(product, "vi", { name: "Tên sản phẩm", description: "Mô tả" });
 * await prisma.product.update({ where: { id: product.id }, data: updateData });
 */
export function setTranslatedFields<T extends Record<string, any>>(
  model: T,
  lang: string,
  values: Record<string, string>
): { translations: Record<string, Record<string, string>> } {
  // Get existing translations or start with empty object
  const existingTranslations = (model.translations as Record<string, Record<string, string>> | null | undefined) || {};
  
  // Ensure it's a plain object (not a Prisma JsonValue)
  const translations: Record<string, Record<string, string>> = 
    typeof existingTranslations === 'object' && existingTranslations !== null && !Array.isArray(existingTranslations)
      ? { ...existingTranslations }
      : {};

  // Merge new translations for the specified language
  translations[lang] = {
    ...(translations[lang] || {}),
    ...values,
  };

  return { translations };
}

/**
 * Type guard to check if a value is a valid translations object
 */
export function isValidTranslations(value: unknown): value is Record<string, Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  
  // Check that all values are objects with string values
  for (const lang in value) {
    const langTranslations = (value as Record<string, unknown>)[lang];
    if (typeof langTranslations !== 'object' || langTranslations === null || Array.isArray(langTranslations)) {
      return false;
    }
    // Check that all nested values are strings
    for (const field in langTranslations) {
      if (typeof (langTranslations as Record<string, unknown>)[field] !== 'string') {
        return false;
      }
    }
  }
  
  return true;
}

