// src/lib/toolExecutors/i18n/addI18nKey.js
import fs from 'fs'

const DEFAULT_I18N_PATH = 'src/i18n.js'

const SUPPORTED_LOCALES = ['en', 'vi', 'zh', 'fr', 'es', 'ja', 'ko', 'th', 'id']

/**
 * i18n.js structure:
 *
 * const resources = {
 *   en: {                    ← locale block (2 spaces)
 *     translation: {         ← always 'translation' namespace (4 spaces)
 *       common: { ... },     ← namespace (6 spaces)
 *       booking: { ... },    ← namespace (6 spaces)
 *       nav: { ... },        ← namespace (6 spaces)
 *     },
 *     dashboard: { ... }     ← separate top-level namespace (sibling of translation)
 *   },
 *   vi: {                    ← second locale (2 spaces)
 *     translation: { ... },
 *     dashboard: { ... }
 *   }
 * }
 *
 * Keys go inside translation.{namespace}.{key}
 * Indentation: 8 spaces for keys inside translation namespaces
 */

function escapeI18nString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function findBlockEnd(lines, openIdx) {
  let depth = 0
  for (let i = openIdx; i < lines.length; i += 1) {
    depth += (lines[i].match(/\{/g) || []).length
    depth -= (lines[i].match(/\}/g) || []).length
    if (depth <= 0 && i > openIdx) return i
  }
  return openIdx + 1
}

function escapeKeyForPattern(key) {
  return String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatI18nKey(key) {
  return /^\d/.test(key) ? `"${key}"` : key
}

export async function addI18nKey({ namespace, key, translations, i18nPath }) {
  const filePath = i18nPath || process.env.I18N_PATH || DEFAULT_I18N_PATH
  const lines = fs.readFileSync(filePath, 'utf8').split('\n')

  for (const [locale, value] of Object.entries(translations)) {
    if (!SUPPORTED_LOCALES.includes(locale)) {
      console.warn('[I18N_KEY_SKIP_LOCALE]', { locale, key })
      continue
    }

    // Never write placeholder values (e.g. "[vi] English text" from offline translate)
    if (String(value).startsWith(`[${locale}]`)) {
      console.warn('[I18N_PLACEHOLDER_SKIPPED]', { locale, key, value })
      continue
    }

    // Step 1: Find locale block — "  en: {" or "  vi: {"
    const localePattern = new RegExp(`^  ${locale}:\\s*\\{`)
    const localeLineIdx = lines.findIndex((l) => localePattern.test(l))
    if (localeLineIdx === -1) {
      console.warn('[I18N_LOCALE_NOT_FOUND]', { locale })
      continue
    }

    const localeEndIdx = findBlockEnd(lines, localeLineIdx)

    // Step 2: Find "    translation: {" inside locale block
    const translationPattern = /^    translation:\s*\{/
    const translationLineIdx = lines.findIndex(
      (l, i) => i > localeLineIdx && i < localeEndIdx && translationPattern.test(l),
    )
    if (translationLineIdx === -1) {
      console.warn('[I18N_TRANSLATION_NOT_FOUND]', { locale })
      continue
    }

    const translationEndIdx = findBlockEnd(lines, translationLineIdx)

    // Step 3: Find or create "      {namespace}: {" inside translation only
    const namespacePattern = new RegExp(`^      ${namespace}:\\s*\\{`)
    let namespaceLineIdx = lines.findIndex(
      (l, i) =>
        i > translationLineIdx &&
        i < translationEndIdx &&
        namespacePattern.test(l),
    )

    if (namespaceLineIdx === -1) {
      const insertBeforeIdx = translationEndIdx
      if (insertBeforeIdx === -1) {
        console.warn('[I18N_INSERT_POINT_NOT_FOUND]', { locale, namespace })
        continue
      }

      const newBlock = [`      ${namespace}: {`, `      },`]
      lines.splice(insertBeforeIdx, 0, ...newBlock)
      namespaceLineIdx = insertBeforeIdx

      // translation block grew by 2 lines
      console.log('[I18N_NAMESPACE_CREATED]', { locale, namespace })
    }

    // Step 4: Check if key already exists in namespace
    const safeKey = formatI18nKey(key)
    const keyPattern = new RegExp(`^        ${escapeKeyForPattern(safeKey)}:\\s*`)
    const nsEnd = findBlockEnd(lines, namespaceLineIdx)
    const keyExists = lines.slice(namespaceLineIdx, nsEnd + 1).some((l) => keyPattern.test(l))

    if (keyExists) {
      console.log('[I18N_KEY_EXISTS]', { locale, namespace, key })
      continue
    }

    // Step 5: Insert key before closing of namespace block
    const insertIdx = findBlockEnd(lines, namespaceLineIdx)
    lines.splice(insertIdx, 0, `        ${safeKey}: "${escapeI18nString(value)}",`)

    console.log('[I18N_KEY_INSERTED]', { locale, namespace, key, value })
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
  console.log('[I18N_KEY_ADDED]', {
    namespace,
    key,
    locales: Object.keys(translations),
    i18nPath: filePath,
  })
  return { ok: true, namespace, key, translations, i18nPath: filePath }
}
