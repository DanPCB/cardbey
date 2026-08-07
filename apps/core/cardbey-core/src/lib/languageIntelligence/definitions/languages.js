/**
 * Seed language definitions for the Language registry.
 */

/** @type {Array<{ id: string, version: number, name: string, nativeName: string, direction: 'ltr'|'rtl', bcp47: string }>} */
export const LANGUAGE_DEFINITIONS = Object.freeze([
  { id: 'vi', version: 1, name: 'Vietnamese', nativeName: 'Tiếng Việt', direction: 'ltr', bcp47: 'vi-VN' },
  { id: 'en', version: 1, name: 'English', nativeName: 'English', direction: 'ltr', bcp47: 'en' },
  { id: 'zh', version: 1, name: 'Chinese', nativeName: '中文', direction: 'ltr', bcp47: 'zh-CN' },
  { id: 'ja', version: 1, name: 'Japanese', nativeName: '日本語', direction: 'ltr', bcp47: 'ja-JP' },
  { id: 'ko', version: 1, name: 'Korean', nativeName: '한국어', direction: 'ltr', bcp47: 'ko-KR' },
  { id: 'th', version: 1, name: 'Thai', nativeName: 'ไทย', direction: 'ltr', bcp47: 'th-TH' },
  { id: 'fr', version: 1, name: 'French', nativeName: 'Français', direction: 'ltr', bcp47: 'fr-FR' },
  { id: 'de', version: 1, name: 'German', nativeName: 'Deutsch', direction: 'ltr', bcp47: 'de-DE' },
  { id: 'es', version: 1, name: 'Spanish', nativeName: 'Español', direction: 'ltr', bcp47: 'es-ES' },
  { id: 'pt', version: 1, name: 'Portuguese', nativeName: 'Português', direction: 'ltr', bcp47: 'pt-BR' },
  { id: 'ar', version: 1, name: 'Arabic', nativeName: 'العربية', direction: 'rtl', bcp47: 'ar' },
  { id: 'ru', version: 1, name: 'Russian', nativeName: 'Русский', direction: 'ltr', bcp47: 'ru-RU' },
]);
